from django.conf import settings
from django.db import models

BRANCH = "branches.Branch"


class ShowroomItem(models.Model):
    class Status(models.TextChoices):
        AVAILABLE = "AVAILABLE", "Available"
        RESERVED = "RESERVED", "Reserved"
        SOLD = "SOLD", "Sold"
        TRANSFERRED = "TRANSFERRED", "Transferred"
        BROKEN_OUT = "BROKEN_OUT", "Broken Out"

    sku = models.CharField(max_length=100)
    serial_number = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=200)
    branch = models.ForeignKey(BRANCH, on_delete=models.RESTRICT, related_name="showroom_items")
    category = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True, default="")
    price = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.AVAILABLE)
    parent_set = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="components",
    )
    is_set = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("sku", "branch")]
        indexes = [
            models.Index(fields=["branch", "status"]),
            models.Index(fields=["sku"]),
        ]

    def __str__(self):
        return f"{self.sku} — {self.name}"


class Reservation(models.Model):
    item = models.ForeignKey(ShowroomItem, on_delete=models.RESTRICT, related_name="reservations")
    customer_name = models.CharField(max_length=200)
    customer_phone = models.CharField(max_length=20)
    deposit_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    expiry_date = models.DateField()
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.RESTRICT,
        related_name="reservations",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["is_active", "expiry_date"])]

    def __str__(self):
        return f"{self.customer_name} — {self.item.sku}"


class Sale(models.Model):
    class OrderType(models.TextChoices):
        SHOP = "SHOP", "Shop"
        CUSTOM = "CUSTOM", "Custom"

    item = models.ForeignKey(ShowroomItem, on_delete=models.RESTRICT, related_name="sales")
    branch = models.ForeignKey(BRANCH, on_delete=models.RESTRICT, related_name="sales")
    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_sales",
    )
    sale_price = models.DecimalField(max_digits=12, decimal_places=2)
    sold_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.RESTRICT, related_name="sales"
    )
    order_type = models.CharField(max_length=6, choices=OrderType.choices, default=OrderType.SHOP)
    sold_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["branch", "-sold_at"])]

    def __str__(self):
        return f"{self.item.sku} sold at {self.sold_at:%Y-%m-%d}"


class BranchTransferRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    item = models.ForeignKey(
        ShowroomItem, on_delete=models.RESTRICT, related_name="transfer_requests"
    )
    from_branch = models.ForeignKey(BRANCH, on_delete=models.RESTRICT, related_name="outgoing_transfers")
    to_branch = models.ForeignKey(BRANCH, on_delete=models.RESTRICT, related_name="incoming_transfers")
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.RESTRICT,
        related_name="transfer_requests",
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_transfers",
    )
    review_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["status"])]

    def __str__(self):
        return f"{self.item.sku}: {self.from_branch} → {self.to_branch}"


class SetBreakRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    item = models.ForeignKey(
        ShowroomItem,
        on_delete=models.RESTRICT,
        related_name="break_requests",
        limit_choices_to={"is_set": True},
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.RESTRICT,
        related_name="set_break_requests",
    )
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_set_breaks",
    )
    review_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["status"])]

    def __str__(self):
        return f"Set-break: {self.item.sku} ({self.status})"
