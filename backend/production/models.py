from django.conf import settings
from django.db import models


class ProductionStage(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACTIVE = "ACTIVE", "Active"
        DONE = "DONE", "Done"

    order = models.ForeignKey(
        "orders.Order", on_delete=models.CASCADE, related_name="stages"
    )
    stage_name = models.CharField(max_length=200)
    sequence_number = models.PositiveSmallIntegerField()
    assigned_technician = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_stages",
    )
    agreed_wage = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    allotted_time = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [("order", "sequence_number")]
        ordering = ["sequence_number"]
        indexes = [
            models.Index(fields=["assigned_technician", "status"]),
        ]

    def __str__(self):
        return f"{self.order.reference_number} — Stage {self.sequence_number}: {self.stage_name}"
