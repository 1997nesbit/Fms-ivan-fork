from django.conf import settings
from django.db import models

PRODUCTION_STAGE = "production.ProductionStage"


class InventoryItem(models.Model):
    name = models.CharField(max_length=200)
    unit = models.CharField(max_length=50)
    current_quantity = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    minimum_threshold = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    last_updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.current_quantity} {self.unit})"

    @property
    def is_low_stock(self):
        return self.current_quantity <= self.minimum_threshold


class MaterialEstimate(models.Model):
    stage = models.ForeignKey(
        PRODUCTION_STAGE,
        on_delete=models.CASCADE,
        related_name="material_estimates",
    )
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="estimates",
    )
    material_name = models.CharField(max_length=200)
    estimated_quantity = models.DecimalField(max_digits=12, decimal_places=3)
    unit = models.CharField(max_length=50)

    def __str__(self):
        return f"{self.material_name} x{self.estimated_quantity} for stage {self.stage_id}"


class MaterialRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        ISSUED = "ISSUED", "Issued"

    stage = models.ForeignKey(
        PRODUCTION_STAGE,
        on_delete=models.CASCADE,
        related_name="material_requests",
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.RESTRICT,
        related_name="material_requests",
    )
    material_name = models.CharField(max_length=200)
    quantity = models.DecimalField(max_digits=12, decimal_places=3)
    unit = models.CharField(max_length=50)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_requests",
    )
    review_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["status"])]

    def __str__(self):
        return f"{self.material_name} ({self.status})"


class Issuance(models.Model):
    class IssuanceType(models.TextChoices):
        INITIAL = "INITIAL", "Initial"
        ADDITIONAL = "ADDITIONAL", "Additional"

    order = models.ForeignKey(
        "orders.Order", on_delete=models.RESTRICT, related_name="issuances"
    )
    stage = models.ForeignKey(
        PRODUCTION_STAGE,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="issuances",
    )
    inventory_item = models.ForeignKey(
        InventoryItem, on_delete=models.RESTRICT, related_name="issuances"
    )
    material_request = models.ForeignKey(
        MaterialRequest,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="issuances",
    )
    quantity_issued = models.DecimalField(max_digits=12, decimal_places=3)
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.RESTRICT,
        related_name="issuances",
    )
    issuance_type = models.CharField(
        max_length=10, choices=IssuanceType.choices, default=IssuanceType.INITIAL
    )
    issued_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.inventory_item.name} x{self.quantity_issued} → {self.order.reference_number}"


class RestockRequest(models.Model):
    class Status(models.TextChoices):
        PENDING  = "PENDING",  "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="restock_requests",
    )
    item_name = models.CharField(max_length=200)
    quantity_needed = models.DecimalField(max_digits=12, decimal_places=3)
    unit = models.CharField(max_length=50)
    estimated_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    reason = models.TextField(blank=True)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.RESTRICT,
        related_name="restock_requests",
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_restock_requests",
    )
    review_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status"])]

    def __str__(self):
        return f"Restock: {self.item_name} ({self.status})"
