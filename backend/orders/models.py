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
    item_description = models.TextField()
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


class OrderImage(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="images")
    image_file = models.ImageField(upload_to="order_images/")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="uploaded_images",
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Image for {self.order.reference_number}"
