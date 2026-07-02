from django.db import transaction
from django.db.models import Case, IntegerField, When
from django.utils import timezone
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import User

from .models import ProductionStage


def _stage_payload(stage):
    order = stage.order
    return {
        "id": stage.id,
        "stage_name": stage.stage_name,
        "sequence_number": stage.sequence_number,
        "status": stage.status,
        "activated_at": stage.activated_at,
        "completed_at": stage.completed_at,
        "order": {
            "id": order.id,
            "reference_number": order.reference_number,
            "customer_name": order.customer_name,
            "item_description": order.item_description,
            "delivery_date": str(order.delivery_date) if order.delivery_date else None,
        },
    }


class MyQueueView(APIView):
    """GET /api/production/my-queue/ — stages assigned to the requesting technician."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != User.Role.TECHNICIAN:
            return Response({"detail": "Technician role required."}, status=403)

        stages = (
            ProductionStage.objects
            .filter(
                assigned_technician=request.user,
                status__in=[ProductionStage.Status.PENDING, ProductionStage.Status.ACTIVE],
            )
            .select_related("order")
            .order_by(
                # ACTIVE before PENDING, then by delivery date, then by position
                Case(
                    When(status=ProductionStage.Status.ACTIVE, then=0),
                    default=1,
                    output_field=IntegerField(),
                ),
                "order__delivery_date",
                "sequence_number",
            )
        )
        return Response([_stage_payload(s) for s in stages])


class CompleteStageView(APIView):
    """POST /api/production/stages/<pk>/complete/ — mark own ACTIVE stage as DONE."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.role != User.Role.TECHNICIAN:
            return Response({"detail": "Technician role required."}, status=403)

        stage = get_object_or_404(
            ProductionStage,
            pk=pk,
            assigned_technician=request.user,
            status=ProductionStage.Status.ACTIVE,
        )

        with transaction.atomic():
            now = timezone.now()
            stage.status = ProductionStage.Status.DONE
            stage.completed_at = now
            stage.save(update_fields=["status", "completed_at"])

            # Activate the next stage in this order's sequence
            next_stage = (
                ProductionStage.objects
                .filter(
                    order=stage.order,
                    sequence_number=stage.sequence_number + 1,
                    status=ProductionStage.Status.PENDING,
                )
                .first()
            )
            if next_stage:
                next_stage.status = ProductionStage.Status.ACTIVE
                next_stage.activated_at = now
                next_stage.save(update_fields=["status", "activated_at"])

        return Response({"ok": True})
