from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Case, IntegerField, Prefetch, When
from django.utils import timezone
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from orders.models import Order, OrderItem
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
            "item_description": stage.item.name,
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
            .select_related("item", "item__order")
            .order_by(
                # ACTIVE before PENDING, then by delivery date, then by position
                Case(
                    When(status=ProductionStage.Status.ACTIVE, then=0),
                    default=1,
                    output_field=IntegerField(),
                ),
                "item__order__delivery_date",
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
            .select_related("stage", "stage__item", "stage__item__order")
            .order_by("-created_at")
        )
        return Response([
            {
                "id": p.id,
                "amount": str(p.amount),
                "status": p.status,
                "stage_name": p.stage.stage_name,
                "order_reference": p.stage.order.reference_number,
                "order_description": p.stage.item.name,
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
            .select_related("technician", "stage", "stage__item", "stage__item__order")
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


def _maybe_complete_order(order):
    """An order is workshop-complete once every one of its items has at
    least one stage and every stage on every item is DONE."""
    items = list(order.items.prefetch_related("stages").all())
    if not items:
        return
    for item in items:
        stages = list(item.stages.all())
        if not stages or any(s.status != ProductionStage.Status.DONE for s in stages):
            return
    order.status = Order.Status.WORKSHOP_COMPLETE
    order.save(update_fields=["status", "updated_at"])


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

            # Activate the next stage in this item's own sequence.
            next_stage = (
                ProductionStage.objects
                .filter(
                    item=stage.item,
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
                _maybe_complete_order(stage.item.order)

            # Every completed stage earns its own technician a payment.
            TechnicianPayment.objects.create(
                stage=stage,
                technician=stage.assigned_technician,
                amount=stage.agreed_wage,
                status=TechnicianPayment.Status.PENDING,
            )

        return Response({"ok": True})


# ---------------------------------------------------------------------------
# Ops Manager: ops queue, pipeline, per-item stage assignment, wages, start work
# ---------------------------------------------------------------------------

def _stage_prefetch():
    return Prefetch(
        "stages",
        queryset=ProductionStage.objects
            .select_related("assigned_technician", "payment")
            .order_by("sequence_number"),
    )


def _item_prefetch():
    return Prefetch(
        "items",
        queryset=OrderItem.objects.prefetch_related(_stage_prefetch()).order_by("id"),
    )


def _ops_orders_qs(status):
    return (
        Order.objects.filter(status=status)
        .prefetch_related(_item_prefetch())
        .order_by("delivery_date")
    )


def _refetch_order(pk):
    """Re-fetch a single order with the same item/stage prefetch as the
    list views, so a mutation's response payload never triggers N+1 queries."""
    return Order.objects.prefetch_related(_item_prefetch()).get(pk=pk)


def _refetch_item(pk):
    return OrderItem.objects.prefetch_related(_stage_prefetch()).select_related("order").get(pk=pk)


def _ops_stage_payload(stage):
    tech = stage.assigned_technician
    payment_status = stage.payment.status if hasattr(stage, "payment") else None
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
        "payment_status": payment_status,
        "activated_at": stage.activated_at.isoformat() if stage.activated_at else None,
        "completed_at": stage.completed_at.isoformat() if stage.completed_at else None,
    }


def _ops_item_payload(item):
    return {
        "id": item.id,
        "name": item.name,
        "notes": item.notes,
        "measurements": item.measurements,
        "stages": [_ops_stage_payload(s) for s in item.stages.all()],
    }


def _ops_order_payload(order):
    items = list(order.items.all())
    all_stages = [
        {**_ops_stage_payload(s), "order": {
            "id": order.id,
            "reference_number": order.reference_number,
            "customer_name": order.customer_name,
            "item_description": item.name,
            "delivery_date": str(order.delivery_date) if order.delivery_date else None,
        }}
        for item in items
        for s in item.stages.all()
    ]
    return {
        "id": order.id,
        "reference_number": order.reference_number,
        "customer_name": order.customer_name,
        "customer_phone": order.customer_phone,
        "item_description": order.item_description,
        "delivery_date": str(order.delivery_date) if order.delivery_date else None,
        "status": order.status,
        "created_at": order.created_at.isoformat(),
        "items": [_ops_item_payload(item) for item in items],
        # Flattened union of every item's stages, kept for consumers that
        # only need order-wide stage counts/technician grouping
        # (scheduling-board.tsx, assignments-manager.tsx) and don't need
        # per-item breakdown.
        "stages": all_stages,
    }


class OpsQueueView(APIView):
    """GET /api/production/ops-queue/ — orders confirmed by a Director and
    awaiting (or mid) production planning by the Ops Manager."""
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


class AssignItemStagesView(APIView):
    """POST /api/production/items/<item_id>/assign-stages/
    Body: [{stage_name, technician_id, allotted_time}, ...]

    Replaces one item's production plan wholesale. Safe because an item
    whose order is still in OPS_QUEUE never has stages beyond PENDING.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, item_id):
        if request.user.role != User.Role.OPS_MANAGER:
            return Response({"detail": "Operations Manager role required."}, status=403)

        try:
            item = OrderItem.objects.select_related("order").get(
                pk=item_id, order__status=Order.Status.OPS_QUEUE
            )
        except OrderItem.DoesNotExist:
            return Response({"detail": "Item not found or its order isn't in the ops queue."}, status=404)

        if item.stages.exclude(status=ProductionStage.Status.PENDING).exists():
            return Response(
                {"detail": "This item's production plan has already started and can't be replaced."},
                status=400,
            )

        rows = request.data
        if not isinstance(rows, list) or not rows:
            return Response({"detail": "Expected a non-empty list of stages."}, status=400)

        for i, row in enumerate(rows, start=1):
            if not str(row.get("stage_name", "")).strip():
                return Response({"detail": f"Stage {i}: name is required."}, status=400)
            if not row.get("technician_id"):
                return Response({"detail": f"Stage {i}: technician is required."}, status=400)

        technician_ids = [row.get("technician_id") for row in rows]
        technician_map = {
            t.id: t for t in User.objects.filter(id__in=technician_ids, role=User.Role.TECHNICIAN)
        }
        for i, tid in enumerate(technician_ids, start=1):
            if tid not in technician_map:
                return Response({"detail": f"Stage {i}: technician not found."}, status=404)

        with transaction.atomic():
            item.stages.all().delete()
            for i, row in enumerate(rows, start=1):
                ProductionStage.objects.create(
                    item=item,
                    stage_name=str(row["stage_name"]).strip(),
                    sequence_number=i,
                    assigned_technician=technician_map[row["technician_id"]],
                    allotted_time=str(row.get("allotted_time", "")).strip(),
                )

        item = _refetch_item(item.pk)
        return Response(_ops_item_payload(item))


class SetItemWagesView(APIView):
    """PATCH /api/production/items/<item_id>/set-wages/
    Body: [{stage_id, wage}, ...]

    Wages are whole numbers (no cents), matching how every other money
    amount in this app is quoted and displayed.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, item_id):
        if request.user.role != User.Role.OPS_MANAGER:
            return Response({"detail": "Operations Manager role required."}, status=403)

        try:
            item = OrderItem.objects.select_related("order").get(
                pk=item_id, order__status=Order.Status.OPS_QUEUE
            )
        except OrderItem.DoesNotExist:
            return Response({"detail": "Item not found or its order isn't in the ops queue."}, status=404)

        rows = request.data
        if not isinstance(rows, list) or not rows:
            return Response({"detail": "Expected a non-empty list of wages."}, status=400)

        stages = {
            s.id: s for s in item.stages.filter(id__in=[row.get("stage_id") for row in rows])
        }

        updates = []
        for i, row in enumerate(rows, start=1):
            stage = stages.get(row.get("stage_id"))
            if stage is None:
                return Response({"detail": f"Stage {i}: stage not found on this item."}, status=404)
            try:
                wage = Decimal(str(row.get("wage", "")))
                if wage < 0:
                    return Response({"detail": f"Stage {i}: wage cannot be negative."}, status=400)
                if wage != wage.to_integral_value():
                    return Response(
                        {"detail": f"Stage {i}: wage must be a whole number (no cents)."}, status=400
                    )
            except InvalidOperation:
                return Response({"detail": f"Stage {i}: enter a valid wage amount."}, status=400)
            updates.append((stage, wage))

        with transaction.atomic():
            for stage, wage in updates:
                stage.agreed_wage = wage
                stage.save(update_fields=["agreed_wage"])

        item = _refetch_item(item.pk)
        return Response(_ops_item_payload(item))


class StartWorkView(APIView):
    """POST /api/production/orders/<pk>/start-work/
    OPS_QUEUE -> IN_PRODUCTION. Activates the first stage of every item in
    the order at once; each item then progresses independently as its
    technicians complete stages.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.role != User.Role.OPS_MANAGER:
            return Response({"detail": "Operations Manager role required."}, status=403)

        try:
            order = Order.objects.prefetch_related(_item_prefetch()).get(
                pk=pk, status=Order.Status.OPS_QUEUE
            )
        except Order.DoesNotExist:
            return Response({"detail": "Order not found or not in the ops queue."}, status=404)

        items = list(order.items.all())
        if not items or any(not list(item.stages.all()) for item in items):
            return Response({"detail": "Assign at least one stage to every item before starting work."}, status=400)
        for item in items:
            if any(s.agreed_wage is None for s in item.stages.all()):
                return Response({"detail": "Set a wage for every stage before starting work."}, status=400)

        with transaction.atomic():
            order.status = Order.Status.IN_PRODUCTION
            order.save(update_fields=["status", "updated_at"])

            now = timezone.now()
            for item in items:
                first = min(item.stages.all(), key=lambda s: s.sequence_number)
                first.status = ProductionStage.Status.ACTIVE
                first.activated_at = now
                first.save(update_fields=["status", "activated_at"])

        order = _refetch_order(order.pk)
        return Response(_ops_order_payload(order))
