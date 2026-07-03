from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Case, IntegerField, Prefetch, When
from django.utils import timezone
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from orders.models import Order
from users.models import User

from .models import ProductionStage, TechnicianPayment


def _stage_payload(stage):
    order = stage.order
    return {
        "id": stage.id,
        "stage_name": stage.stage_name,
        "sequence_number": stage.sequence_number,
        "status": stage.status,
        "agreed_wage": str(stage.agreed_wage) if stage.agreed_wage is not None else None,
        "allotted_time": stage.allotted_time,
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


class MyEarningsView(APIView):
    """GET /api/production/my-earnings/ — the requesting technician's payment history."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != User.Role.TECHNICIAN:
            return Response({"detail": "Technician role required."}, status=403)

        payments = (
            TechnicianPayment.objects
            .filter(technician=request.user)
            .select_related("stage", "stage__order")
            .order_by("-created_at")
        )
        return Response([
            {
                "id": p.id,
                "amount": str(p.amount),
                "status": p.status,
                "stage_name": p.stage.stage_name,
                "order_reference": p.stage.order.reference_number,
                "order_description": p.stage.order.item_description,
                "settled_at": p.settled_at.isoformat() if p.settled_at else None,
                "created_at": p.created_at.isoformat(),
            }
            for p in payments
        ])


class PaymentListView(APIView):
    """GET /api/production/payments/ — Director-only list of all technician payments."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != User.Role.DIRECTOR:
            return Response({"detail": "Director role required."}, status=403)

        payments = (
            TechnicianPayment.objects
            .select_related("technician", "stage", "stage__order")
            .order_by("-created_at")
        )
        return Response([
            {
                "id": p.id,
                "amount": str(p.amount),
                "status": p.status,
                "technician_id": p.technician_id,
                "technician_name": p.technician.get_full_name() or p.technician.username,
                "stage_name": p.stage.stage_name,
                "order_reference": p.stage.order.reference_number,
                "settled_at": p.settled_at.isoformat() if p.settled_at else None,
                "created_at": p.created_at.isoformat(),
            }
            for p in payments
        ])


class SettlePaymentsView(APIView):
    """
    PATCH /api/production/payments/<week>/settle/ — Director marks a technician's
    PENDING payments for a given week (Monday, YYYY-MM-DD) as PAID.

    Body: { "technician_id": int }
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, week):
        if request.user.role != User.Role.DIRECTOR:
            return Response({"detail": "Director role required."}, status=403)

        technician_id = request.data.get("technician_id")
        if not technician_id:
            return Response({"errors": {"technician_id": ["This field is required."]}}, status=400)

        try:
            week_start = date.fromisoformat(week)
        except ValueError:
            return Response({"detail": "Invalid week; use YYYY-MM-DD (Monday)."}, status=400)

        window_start = timezone.make_aware(datetime.combine(week_start, datetime.min.time()))
        window_end = window_start + timedelta(days=7)

        payments = TechnicianPayment.objects.filter(
            technician_id=technician_id,
            status=TechnicianPayment.Status.PENDING,
            created_at__gte=window_start,
            created_at__lt=window_end,
        )
        if not payments.exists():
            return Response(
                {"detail": "No pending payments found for that technician and week."}, status=404
            )

        settled_count = payments.update(
            status=TechnicianPayment.Status.PAID,
            settled_at=timezone.now(),
            settled_by=request.user,
        )
        return Response({"ok": True, "settled_count": settled_count})


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
            else:
                # Last stage in the order — workshop is done.
                stage.order.status = Order.Status.WORKSHOP_COMPLETE
                stage.order.save(update_fields=["status", "updated_at"])

            # Every completed stage earns its own technician a payment.
            TechnicianPayment.objects.create(
                stage=stage,
                technician=stage.assigned_technician,
                amount=stage.agreed_wage,
                status=TechnicianPayment.Status.PENDING,
            )

        return Response({"ok": True})


# ---------------------------------------------------------------------------
# Ops Manager: ops queue, stage assignment, wages, start work
# ---------------------------------------------------------------------------

def _ops_stage_payload(stage):
    payment_status = stage.payment.status if hasattr(stage, "payment") else None
    return {
        "id": stage.id,
        "stage_name": stage.stage_name,
        "sequence_number": stage.sequence_number,
        "status": stage.status,
        "assigned_technician": (
            {
                "id": stage.assigned_technician.id,
                "name": stage.assigned_technician.get_full_name() or stage.assigned_technician.username,
            }
            if stage.assigned_technician else None
        ),
        "agreed_wage": str(stage.agreed_wage) if stage.agreed_wage is not None else None,
        "allotted_time": stage.allotted_time,
        "payment_status": payment_status,
        "activated_at": stage.activated_at.isoformat() if stage.activated_at else None,
        "completed_at": stage.completed_at.isoformat() if stage.completed_at else None,
        "order": {
            "id": stage.order_id,
            "reference_number": stage.order.reference_number,
            "customer_name": stage.order.customer_name,
            "item_description": stage.order.item_description,
            "delivery_date": str(stage.order.delivery_date) if stage.order.delivery_date else None,
        },
    }


def _ops_order_payload(order):
    return {
        "id": order.id,
        "reference_number": order.reference_number,
        "customer_name": order.customer_name,
        "customer_phone": order.customer_phone,
        "item_description": order.item_description,
        "delivery_date": str(order.delivery_date) if order.delivery_date else None,
        "status": order.status,
        "created_at": order.created_at.isoformat(),
        "stages": [_ops_stage_payload(s) for s in order.stages.all()],
    }


def _ops_orders_qs(status):
    return (
        Order.objects.filter(status=status)
        .prefetch_related(
            Prefetch(
                "stages",
                queryset=ProductionStage.objects
                    .select_related("assigned_technician", "payment")
                    .order_by("sequence_number"),
            )
        )
        .order_by("delivery_date")
    )


class OpsQueueView(APIView):
    """GET /api/production/ops-queue/ — orders awaiting a production plan."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != User.Role.OPS_MANAGER:
            return Response({"detail": "Operations Manager role required."}, status=403)
        orders = _ops_orders_qs(Order.Status.OPS_QUEUE)
        return Response([_ops_order_payload(o) for o in orders])


class PipelineView(APIView):
    """GET /api/production/pipeline/ — orders currently in production."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != User.Role.OPS_MANAGER:
            return Response({"detail": "Operations Manager role required."}, status=403)
        orders = _ops_orders_qs(Order.Status.IN_PRODUCTION)
        return Response([_ops_order_payload(o) for o in orders])


class AssignStagesView(APIView):
    """POST /api/production/orders/<pk>/assign-stages/ — (re)plan an order's stages."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.role != User.Role.OPS_MANAGER:
            return Response({"detail": "Operations Manager role required."}, status=403)

        try:
            order = Order.objects.get(pk=pk, status=Order.Status.OPS_QUEUE)
        except Order.DoesNotExist:
            return Response({"detail": "Order not found or not in ops queue."}, status=404)

        rows = request.data
        if not isinstance(rows, list) or not rows:
            return Response({"detail": "At least one stage is required."}, status=400)

        technician_ids = []
        for i, row in enumerate(rows):
            if not str(row.get("stage_name", "")).strip():
                return Response({"detail": f"Stage {i + 1}: stage name is required."}, status=400)
            technician_ids.append(row.get("technician_id"))

        technicians = User.objects.filter(id__in=technician_ids, role=User.Role.TECHNICIAN)
        technician_map = {t.id: t for t in technicians}
        for i, tid in enumerate(technician_ids):
            if tid not in technician_map:
                return Response({"detail": f"Stage {i + 1}: invalid technician."}, status=400)

        with transaction.atomic():
            order.stages.all().delete()
            for i, row in enumerate(rows):
                ProductionStage.objects.create(
                    order=order,
                    stage_name=str(row["stage_name"]).strip(),
                    sequence_number=i + 1,
                    assigned_technician=technician_map[row.get("technician_id")],
                    allotted_time=str(row.get("allotted_time", "")).strip(),
                )

        order.refresh_from_db()
        return Response(_ops_order_payload(order), status=201)


class SetWagesView(APIView):
    """PATCH /api/production/orders/<pk>/set-wages/ — set agreed_wage per stage."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if request.user.role != User.Role.OPS_MANAGER:
            return Response({"detail": "Operations Manager role required."}, status=403)

        try:
            order = Order.objects.get(pk=pk, status=Order.Status.OPS_QUEUE)
        except Order.DoesNotExist:
            return Response({"detail": "Order not found or not in ops queue."}, status=404)

        rows = request.data
        if not isinstance(rows, list):
            return Response({"detail": "Expected a list of wages."}, status=400)

        stages = {s.id: s for s in order.stages.filter(id__in=[r.get("stage_id") for r in rows])}

        for row in rows:
            stage = stages.get(row.get("stage_id"))
            if stage is None:
                return Response({"detail": "Invalid stage."}, status=400)
            try:
                wage = Decimal(str(row.get("wage", "")))
                if wage < 0:
                    return Response({"detail": "Wage cannot be negative."}, status=400)
                if wage != wage.to_integral_value():
                    return Response(
                        {"detail": "Wage must be a whole number (no cents)."}, status=400
                    )
            except InvalidOperation:
                return Response({"detail": "Enter a valid wage amount."}, status=400)
            stage.agreed_wage = wage
            stage.save(update_fields=["agreed_wage"])

        order.refresh_from_db()
        return Response(_ops_order_payload(order))


class StartWorkView(APIView):
    """POST /api/production/orders/<pk>/start-work/ — activate stage 1, order -> IN_PRODUCTION."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.role != User.Role.OPS_MANAGER:
            return Response({"detail": "Operations Manager role required."}, status=403)

        try:
            order = Order.objects.get(pk=pk, status=Order.Status.OPS_QUEUE)
        except Order.DoesNotExist:
            return Response({"detail": "Order not found or not in ops queue."}, status=404)

        stages = list(order.stages.order_by("sequence_number"))
        if not stages:
            return Response({"detail": "Assign at least one stage before starting work."}, status=400)
        if any(s.agreed_wage is None for s in stages):
            return Response({"detail": "Set a wage for every stage before starting work."}, status=400)

        with transaction.atomic():
            first = stages[0]
            first.status = ProductionStage.Status.ACTIVE
            first.activated_at = timezone.now()
            first.save(update_fields=["status", "activated_at"])

            order.status = Order.Status.IN_PRODUCTION
            order.save(update_fields=["status", "updated_at"])

        order.refresh_from_db()
        return Response(_ops_order_payload(order))
