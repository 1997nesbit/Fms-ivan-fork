from django.conf import settings
from django.db import models


class Invoice(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ISSUED = "ISSUED", "Issued"
        PARTIALLY_PAID = "PARTIALLY_PAID", "Partially Paid"
        PAID = "PAID", "Paid"

    invoice_number = models.CharField(max_length=50, unique=True)
    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoices",
    )
    # Bill-from branch (the branch originating the order/sale)
    branch = models.ForeignKey(
        "branches.Branch",
        on_delete=models.RESTRICT,
        related_name="invoices",
    )
    customer_name = models.CharField(max_length=200)
    customer_phone = models.CharField(max_length=20, blank=True)
    customer_address = models.TextField(blank=True)
    issue_date = models.DateField()
    due_date = models.DateField(null=True, blank=True)
    payment_terms = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.DRAFT)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.RESTRICT,
        related_name="created_invoices",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["-created_at"])]

    def __str__(self):
        return f"Invoice {self.invoice_number} — {self.customer_name}"

    @property
    def subtotal(self):
        return sum((li.total for li in self.line_items.all()), 0)

    @property
    def total_paid(self):
        return sum((p.amount for p in self.payments.all()), 0)

    @property
    def balance_remaining(self):
        return self.subtotal - self.total_paid

    def recompute_status(self):
        """Derives DRAFT/ISSUED/PARTIALLY_PAID/PAID from payments vs subtotal.
        Never touches status while there are no payments yet, so the manual
        DRAFT -> ISSUED step (InvoiceDetailView.patch) isn't clobbered."""
        paid = self.total_paid
        if paid <= 0:
            return
        new_status = self.Status.PAID if paid >= self.subtotal else self.Status.PARTIALLY_PAID
        if new_status != self.status:
            self.status = new_status
            self.save(update_fields=["status", "updated_at"])


class InvoiceLineItem(models.Model):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="line_items")
    # Traces a line item back to the OrderItem it prices, so
    # sync_invoice_line_items() can update unit_price as prices are
    # confirmed. Null for line items on standalone (non-order) invoices.
    order_item = models.ForeignKey(
        "orders.OrderItem", on_delete=models.SET_NULL, null=True, blank=True, related_name="invoice_lines"
    )
    description = models.CharField(max_length=500)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.description} x{self.quantity}"

    @property
    def total(self):
        return self.quantity * self.unit_price


class Payment(models.Model):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="payments")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    note = models.CharField(max_length=500, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.RESTRICT, related_name="recorded_payments"
    )
    paid_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-paid_at"]

    def __str__(self):
        return f"{self.invoice.invoice_number} — {self.amount}"
