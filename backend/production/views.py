from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Case, IntegerField, When
from django.utils import timezone
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from orders.models import Order
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


# ---------------------------------------------------------------------------
# Ops queue: Front Desk order -> Ops Manager production plan -> in production
# ---------------------------------------------------------------------------

def _ops_stage_payload(stage, order):
    tech = stage.assigned_technician
    return {
        "id": stage.id,
        "stage_name": stage.stage_name,
        "sequence_number": stage.sequence_number,
        "status": stage.status,
        "assigned_technician": (
            {"id": tech.id, "name": tech.get_full_name() or tech.username} if tech else None
        ),
        "agreed_wage": str(stage.agreed_wage) if stage.agreed_wage is not None else None,
        "allotted_time": stage.allotted_time,
        "payment_status": None,
        "activated_at": stage.activated_at.isoformat() if stage.activated_at else None,
        "completed_at": stage.completed_at.isoformat() if stage.completed_at else None,
        "order": {
            "id": order.id,
            "reference_number": order.reference_number,
            "customer_name": order.customer_name,
            "item_description": order.item_description,
            "delivery_date": str(order.delivery_date) if order.delivery_date else None,
        },
    }


def _ops_order_payload(order):
    stages = list(order.stages.select_related("assigned_technician").order_by("sequence_number"))
    return {
        "id": order.id,
        "reference_number": order.reference_number,
        "customer_name": order.customer_name,
        "customer_phone": order.customer_phone,
        "item_description": order.item_description,
        "delivery_date": str(order.delivery_date) if order.delivery_date else None,
        "status": order.status,
        "created_at": order.created_at.isoformat(),
        "stages": [_ops_stage_payload(s, order) for s in stages],
    }


class OpsQueueView(APIView):
    """GET /api/production/ops-queue/ — orders confirmed by a Director and
    awaiting (or mid) production planning by the Ops Manager."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != User.Role.OPS_MANAGER:
            return Response({"detail": "Ops Manager role required."}, status=403)

        orders = (
            Order.objects.filter(status=Order.Status.OPS_QUEUE)
            .prefetch_related("stages__assigned_technician")
            .order_by("delivery_date", "created_at")
        )
        return Response([_ops_order_payload(o) for o in orders])


class AssignStagesView(APIView):
    """POST /api/production/orders/<pk>/assign-stages/
    Body: [{stage_name, technician_id, allotted_time}, ...]

    Replaces the order's production plan wholesale. Safe because an order
    sitting in OPS_QUEUE never has stages beyond PENDING — nothing has
    started yet, so there's nothing to lose by re-planning it.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.role != User.Role.OPS_MANAGER:
            return Response({"detail": "Ops Manager role required."}, status=403)

        try:
            order = Order.objects.get(pk=pk, status=Order.Status.OPS_QUEUE)
        except Order.DoesNotExist:
            return Response({"detail": "Order not found or not in the ops queue."}, status=404)

        if order.stages.exclude(status=ProductionStage.Status.PENDING).exists():
            return Response(
                {"detail": "This order's production plan has already started and can't be replaced."},
                status=400,
            )

        rows = request.data
        if not isinstance(rows, list) or not rows:
            return Response({"detail": "Expected a non-empty list of stages."}, status=400)

        cleaned = []
        for i, row in enumerate(rows, start=1):
            stage_name = str(row.get("stage_name", "")).strip()
            technician_id = row.get("technician_id")
            allotted_time = str(row.get("allotted_time", "")).strip()

            if not stage_name:
                return Response({"detail": f"Stage {i}: name is required."}, status=400)
            if not technician_id:
                return Response({"detail": f"Stage {i}: technician is required."}, status=400)
            try:
                technician = User.objects.get(pk=technician_id, role=User.Role.TECHNICIAN)
            except User.DoesNotExist:
                return Response({"detail": f"Stage {i}: technician not found."}, status=404)

            cleaned.append((stage_name, technician, allotted_time))

        with transaction.atomic():
            order.stages.all().delete()
            for i, (stage_name, technician, allotted_time) in enumerate(cleaned, start=1):
                ProductionStage.objects.create(
                    order=order,
                    stage_name=stage_name,
                    sequence_number=i,
                    assigned_technician=technician,
                    allotted_time=allotted_time,
                )

        order = Order.objects.prefetch_related("stages__assigned_technician").get(pk=order.pk)
        return Response(_ops_order_payload(order))


class SetWagesView(APIView):
    """PATCH /api/production/orders/<pk>/set-wages/
    Body: [{stage_id, wage}, ...]
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if request.user.role != User.Role.OPS_MANAGER:
            return Response({"detail": "Ops Manager role required."}, status=403)

        try:
            order = Order.objects.get(pk=pk, status=Order.Status.OPS_QUEUE)
        except Order.DoesNotExist:
            return Response({"detail": "Order not found or not in the ops queue."}, status=404)

        rows = request.data
        if not isinstance(rows, list) or not rows:
            return Response({"detail": "Expected a non-empty list of wages."}, status=400)

        updates = []
        for i, row in enumerate(rows, start=1):
            try:
                stage = order.stages.get(pk=row.get("stage_id"))
            except ProductionStage.DoesNotExist:
                return Response({"detail": f"Stage {i}: stage not found on this order."}, status=404)

            raw_wage = str(row.get("wage", "")).strip()
            try:
                wage = Decimal(raw_wage) if raw_wage else Decimal("0")
                if wage < 0:
                    raise InvalidOperation
            except InvalidOperation:
                return Response({"detail": f"Stage {i}: enter a valid, non-negative wage."}, status=400)

            updates.append((stage, wage))

        with transaction.atomic():
            for stage, wage in updates:
                stage.agreed_wage = wage
                stage.save(update_fields=["agreed_wage"])

        order = Order.objects.prefetch_related("stages__assigned_technician").get(pk=order.pk)
        return Response(_ops_order_payload(order))


class StartWorkView(APIView):
    """POST /api/production/orders/<pk>/start-work/
    OPS_QUEUE -> IN_PRODUCTION, activates the first stage in sequence.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.role != User.Role.OPS_MANAGER:
            return Response({"detail": "Ops Manager role required."}, status=403)

        try:
            order = Order.objects.get(pk=pk, status=Order.Status.OPS_QUEUE)
        except Order.DoesNotExist:
            return Response({"detail": "Order not found or not in the ops queue."}, status=404)

        stages = list(order.stages.order_by("sequence_number"))
        if not stages:
            return Response({"detail": "Assign at least one stage before starting work."}, status=400)
        if any(s.agreed_wage is None for s in stages):
            return Response({"detail": "Every stage needs an agreed wage before starting work."}, status=400)

        with transaction.atomic():
            order.status = Order.Status.IN_PRODUCTION
            order.save(update_fields=["status", "updated_at"])

            first = stages[0]
            first.status = ProductionStage.Status.ACTIVE
            first.activated_at = timezone.now()
            first.save(update_fields=["status", "activated_at"])

        order = Order.objects.prefetch_related("stages__assigned_technician").get(pk=order.pk)
        return Response(_ops_order_payload(order))
