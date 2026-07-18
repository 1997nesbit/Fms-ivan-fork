from decimal import Decimal

from django.conf import settings
from django.db import models


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PRICE_REVIEW = "PRICE_REVIEW", "Price Review"
        OPS_QUEUE = "OPS_QUEUE", "Ops Queue"
        IN_PRODUCTION = "IN_PRODUCTION", "In Production"
        WORKSHOP_COMPLETE = "WORKSHOP_COMPLETE", "Workshop Complete"
        DISPATCHED = "DISPATCHED", "Dispatched"
        CANCELLED = "CANCELLED", "Cancelled"

    reference_number = models.CharField(max_length=50, unique=True)
    branch = models.ForeignKey(
        "branches.Branch", on_delete=models.RESTRICT, related_name="orders"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.RESTRICT,
        related_name="created_orders",
    )
    customer_name = models.CharField(max_length=200)
    customer_phone = models.CharField(max_length=20)
    # Auto-synced aggregate of this order's OrderItems — see sync_from_items().
    # Kept as a real stored field (not a property) so every existing report,
    # production, and invoice code path that reads it keeps working unchanged.
    item_description = models.TextField(blank=True)
    quoted_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    confirmed_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    delivery_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    notes = models.TextField(blank=True)
    cancellation_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["branch", "status"]),
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self):
        return f"{self.reference_number} — {self.customer_name}"

    def sync_from_items(self):
        """Recompute item_description/quoted_price/confirmed_price from
        this order's items and persist them. Call after any OrderItem
        create/update/delete so every other app can keep reading the
        aggregate Order fields unchanged."""
        items = list(self.items.all())

        self.item_description = "; ".join(i.name for i in items if i.name)

        quoted_total = sum((i.quoted_price for i in items if i.quoted_price is not None), Decimal("0"))
        self.quoted_price = quoted_total if any(i.quoted_price is not None for i in items) else None

        if items and all(i.confirmed_price is not None for i in items):
            self.confirmed_price = sum((i.confirmed_price for i in items), Decimal("0"))
        else:
            self.confirmed_price = None

        self.save(update_fields=["item_description", "quoted_price", "confirmed_price"])


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    name = models.CharField(max_length=200)
    notes = models.TextField(blank=True)
    measurements = models.CharField(max_length=200, blank=True)
    quoted_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    confirmed_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.name} ({self.order.reference_number})"


class OrderImage(models.Model):
    item = models.ForeignKey(OrderItem, on_delete=models.CASCADE, related_name="images")
    image_file = models.ImageField(upload_to="order_images/")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="uploaded_images",
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Image for {self.item.name}"
