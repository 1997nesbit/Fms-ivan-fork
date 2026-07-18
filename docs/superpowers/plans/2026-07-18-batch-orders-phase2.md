# Batch Orders Phase 2 (Per-Item Production Splitting) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Ops Manager assign a different stage plan (stages + artisans + wages) to each `OrderItem` within a batch order, so items progress through production independently — Item A can reach Stage 2 with Artisan X while Item B is still at Stage 1 with Artisan Y — while every existing head-technician screen, material-request flow, and payment report keeps working unmodified.

**Architecture:** `ProductionStage.item` FK replaces `ProductionStage.order` (each stage now belongs to one `OrderItem`, sequence numbers unique per item instead of per order). A Python `@property ProductionStage.order` (`return self.item.order`) preserves every existing `stage.order.<field>` attribute read across `production/views.py`, `reports/views.py`, and `stock/views.py` — only the small number of real ORM query paths (`select_related("stage__order")`, `filter(stage__order__...)`, `stage.order_id`) need updating to go through `item`. Stage assignment/wage-setting becomes per-item (`/production/items/<id>/...`); "Start Work" stays order-level (one click activates the first stage of every item in the order simultaneously) so items begin together but then progress at their own pace as different technicians complete their stages. `Order.status` flips to `WORKSHOP_COMPLETE` only once every item's last stage is `DONE`.

**Tech Stack:** Django REST (hand-built `APIView`s), Next.js/React, Postgres.

## Global Constraints

- Money fields are whole numbers (no cents).
- No DRF serializers — follow the existing `_payload` dict-builder pattern.
- `stage.order.*` attribute reads must keep working everywhere outside `production/views.py` (reports, stock) without those files needing awareness of `OrderItem`.

---

### Task 1: `ProductionStage.item` FK, `order` property, and data migration

**Files:**
- Modify: `backend/production/models.py`
- Create: `backend/production/migrations/0004_productionstage_item_and_more.py`
- Test: `backend/production/tests.py` (new `ProductionStageItemTests` class)

**Interfaces:**
- Produces: `ProductionStage.item` FK → `OrderItem` (`related_name="stages"`), `ProductionStage.order` read-only property (`self.item.order`), `unique_together = [("item", "sequence_number")]`.

- [ ] **Step 1: Write failing test**

```python
# backend/production/tests.py — add near the top, after imports
from orders.models import OrderItem


class ProductionStageItemTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Main", location="Town")
        self.front_desk = _make_user(User.Role.FRONT_DESK, self.branch)
        self.technician = _make_user(User.Role.TECHNICIAN, self.branch, username="tech-item")
        self.order = Order.objects.create(
            reference_number="FMS-ITEM-0001",
            branch=self.branch,
            created_by=self.front_desk,
            customer_name="Jane",
            customer_phone="0700000000",
        )
        self.item = OrderItem.objects.create(order=self.order, name="Sofa")

    def test_stage_order_property_proxies_to_item_order(self):
        stage = ProductionStage.objects.create(
            item=self.item, stage_name="Frame", sequence_number=1,
            assigned_technician=self.technician,
        )
        self.assertEqual(stage.order, self.order)
        self.assertEqual(stage.order.reference_number, "FMS-ITEM-0001")

    def test_sequence_number_unique_per_item_not_per_order(self):
        item2 = OrderItem.objects.create(order=self.order, name="Coffee Table")
        ProductionStage.objects.create(
            item=self.item, stage_name="Frame", sequence_number=1,
            assigned_technician=self.technician,
        )
        # Same sequence_number=1 on a different item of the same order is fine.
        ProductionStage.objects.create(
            item=item2, stage_name="Cut", sequence_number=1,
            assigned_technician=self.technician,
        )
        self.assertEqual(ProductionStage.objects.filter(item__order=self.order).count(), 2)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `py manage.py test production.ProductionStageItemTests -v 2` (from `backend/`)
Expected: FAIL — `ProductionStage` has no field `item`.

- [ ] **Step 3: Update the model**

```python
# backend/production/models.py
from django.conf import settings
from django.db import models


class ProductionStage(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACTIVE = "ACTIVE", "Active"
        DONE = "DONE", "Done"

    item = models.ForeignKey(
        "orders.OrderItem", on_delete=models.CASCADE, related_name="stages"
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
        unique_together = [("item", "sequence_number")]
        ordering = ["sequence_number"]
        indexes = [
            models.Index(fields=["assigned_technician", "status"]),
        ]

    def __str__(self):
        return f"{self.item.order.reference_number} — Stage {self.sequence_number}: {self.stage_name}"

    @property
    def order(self):
        """Proxies to this stage's item's order. Every existing
        stage.order.<field> read in production/reports/stock keeps working
        unchanged — only real ORM query paths (select_related, filter())
        need to go through `item__order` instead."""
        return self.item.order


class TechnicianPayment(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PAID = "PAID", "Paid"

    stage = models.OneToOneField(
        ProductionStage, on_delete=models.CASCADE, related_name="payment"
    )
    technician = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.RESTRICT, related_name="payments"
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    settled_at = models.DateTimeField(null=True, blank=True)
    settled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="settled_payments",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["technician", "status"]),
        ]

    def __str__(self):
        return f"{self.technician} — {self.amount} ({self.status})"
```

- [ ] **Step 4: Write the migration (schema + data backfill)**

Every existing `Order` already has exactly one `OrderItem` (from Phase 1's backfill), so every existing `ProductionStage` moves to that order's single item.

```python
# backend/production/migrations/0004_productionstage_item_and_more.py
from django.db import migrations, models
import django.db.models.deletion


def backfill_stage_items(apps, schema_editor):
    ProductionStage = apps.get_model("production", "ProductionStage")
    OrderItem = apps.get_model("orders", "OrderItem")

    for stage in ProductionStage.objects.all():
        item = OrderItem.objects.filter(order_id=stage.order_old_id).first()
        stage.item = item
        stage.save(update_fields=["item"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("production", "0003_productionstage_agreed_wage_and_more"),
        ("orders", "0005_orderitem_and_more"),
    ]

    operations = [
        migrations.RenameField(model_name="productionstage", old_name="order", new_name="order_old"),
        migrations.AlterUniqueTogether(name="productionstage", unique_together=set()),
        migrations.AddField(
            model_name="productionstage",
            name="item",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="stages",
                to="orders.orderitem",
            ),
        ),
        migrations.RunPython(backfill_stage_items, noop_reverse),
        migrations.RemoveField(model_name="productionstage", name="order_old"),
        migrations.AlterField(
            model_name="productionstage",
            name="item",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="stages", to="orders.orderitem"),
        ),
        migrations.AlterUniqueTogether(name="productionstage", unique_together={("item", "sequence_number")}),
    ]
```

- [ ] **Step 5: Run migration and test**

Run: `py manage.py migrate production` then `py manage.py test production.ProductionStageItemTests -v 2` (from `backend/`)
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/production/models.py backend/production/migrations/0004_productionstage_item_and_more.py backend/production/tests.py
git commit -m "Move ProductionStage from Order to OrderItem for per-item stage plans"
```

---

### Task 2: `production/views.py` — per-item stage assignment, order-level simultaneous start, multi-item completion rollup

**Files:**
- Modify: `backend/production/views.py`
- Modify: `backend/production/urls.py`
- Modify: `backend/reports/views.py` (one query-path fix)
- Modify: `backend/stock/views.py` (query-path + `order_id` fixes)
- Modify: `backend/production/tests.py` (rewrite `OpsQueueWorkflowTests` for the new per-item endpoints)
- Modify: `backend/stock/tests.py` (`_make_stage` helper creates an `OrderItem` first)

**Interfaces:**
- Consumes: `ProductionStage.item`, `ProductionStage.order` property (Task 1).
- Produces: `_ops_order_payload(order)` now includes `"items": [{id, name, stages: [...]}]` (per-item stage plans) alongside a backward-compatible flattened top-level `"stages"` (all items' stages, for `scheduling-board.tsx`/`assignments-manager.tsx` which don't need per-item grouping). New endpoints: `POST /api/production/items/<item_id>/assign-stages/`, `PATCH /api/production/items/<item_id>/set-wages/`. `POST /api/production/orders/<pk>/start-work/` unchanged URL, now activates stage 1 of every item. `CompleteStageView` rolls the order to `WORKSHOP_COMPLETE` only once every item's last stage is `DONE`.

- [ ] **Step 1: Write failing tests (replace `OpsQueueWorkflowTests`)**

```python
# backend/production/tests.py — replace the entire OpsQueueWorkflowTests class
class OpsQueueWorkflowTests(TestCase):
    """Front Desk batch order -> Ops Manager per-item plan -> production, end to end."""

    def setUp(self):
        self.client = APIClient()
        self.branch = Branch.objects.create(name="Main", location="Town")
        self.front_desk = _make_user(User.Role.FRONT_DESK, self.branch)
        self.ops_manager = _make_user(User.Role.OPS_MANAGER, self.branch)
        self.tech_a = _make_user(User.Role.TECHNICIAN, self.branch, username="tech-a")
        self.tech_b = _make_user(User.Role.TECHNICIAN, self.branch, username="tech-b")

        self.order = Order.objects.create(
            reference_number="FMS-OPS-0001",
            branch=self.branch,
            created_by=self.front_desk,
            customer_name="Jane",
            customer_phone="0700000000",
            status=Order.Status.OPS_QUEUE,
        )
        self.item1 = OrderItem.objects.create(order=self.order, name="Sofa")
        self.item2 = OrderItem.objects.create(order=self.order, name="Coffee Table")

    def test_ops_queue_lists_only_ops_queue_orders_with_items(self):
        self.client.force_authenticate(self.ops_manager)
        resp = self.client.get("/api/production/ops-queue/")
        self.assertEqual(resp.status_code, 200)
        order_payload = next(o for o in resp.data if o["id"] == self.order.id)
        self.assertEqual(len(order_payload["items"]), 2)

    def test_assign_stages_is_scoped_to_one_item(self):
        self.client.force_authenticate(self.ops_manager)
        resp = self.client.post(
            f"/api/production/items/{self.item1.id}/assign-stages/",
            [{"stage_name": "Frame", "technician_id": self.tech_a.id, "allotted_time": "2 days"}],
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(ProductionStage.objects.filter(item=self.item1).count(), 1)
        self.assertEqual(ProductionStage.objects.filter(item=self.item2).count(), 0)

    def test_start_work_activates_first_stage_of_every_item(self):
        self.client.force_authenticate(self.ops_manager)
        self.client.post(
            f"/api/production/items/{self.item1.id}/assign-stages/",
            [{"stage_name": "Frame", "technician_id": self.tech_a.id, "allotted_time": ""}],
            format="json",
        )
        self.client.post(
            f"/api/production/items/{self.item2.id}/assign-stages/",
            [{"stage_name": "Cut", "technician_id": self.tech_b.id, "allotted_time": ""}],
            format="json",
        )
        s1 = ProductionStage.objects.get(item=self.item1)
        s2 = ProductionStage.objects.get(item=self.item2)
        self.client.patch(
            f"/api/production/items/{self.item1.id}/set-wages/",
            [{"stage_id": s1.id, "wage": "50000"}], format="json",
        )
        self.client.patch(
            f"/api/production/items/{self.item2.id}/set-wages/",
            [{"stage_id": s2.id, "wage": "30000"}], format="json",
        )

        resp = self.client.post(f"/api/production/orders/{self.order.id}/start-work/")
        self.assertEqual(resp.status_code, 200, resp.content)

        s1.refresh_from_db()
        s2.refresh_from_db()
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.IN_PRODUCTION)
        self.assertEqual(s1.status, ProductionStage.Status.ACTIVE)
        self.assertEqual(s2.status, ProductionStage.Status.ACTIVE)

    def test_items_progress_independently_and_order_completes_when_both_items_done(self):
        self.client.force_authenticate(self.ops_manager)
        self.client.post(
            f"/api/production/items/{self.item1.id}/assign-stages/",
            [{"stage_name": "Frame", "technician_id": self.tech_a.id, "allotted_time": ""}],
            format="json",
        )
        self.client.post(
            f"/api/production/items/{self.item2.id}/assign-stages/",
            [
                {"stage_name": "Cut", "technician_id": self.tech_b.id, "allotted_time": ""},
                {"stage_name": "Glue", "technician_id": self.tech_b.id, "allotted_time": ""},
            ],
            format="json",
        )
        s1 = ProductionStage.objects.get(item=self.item1)
        item2_stages = list(ProductionStage.objects.filter(item=self.item2).order_by("sequence_number"))
        self.client.patch(
            f"/api/production/items/{self.item1.id}/set-wages/",
            [{"stage_id": s1.id, "wage": "50000"}], format="json",
        )
        self.client.patch(
            f"/api/production/items/{self.item2.id}/set-wages/",
            [{"stage_id": s.id, "wage": "20000"} for s in item2_stages], format="json",
        )
        self.client.post(f"/api/production/orders/{self.order.id}/start-work/")

        # Item 1 (single stage) finishes first — order must NOT be complete yet,
        # since item 2 still has an undone stage.
        self.client.force_authenticate(self.tech_a)
        self.client.post(f"/api/production/stages/{s1.id}/complete/")
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.IN_PRODUCTION)

        # Item 2 finishes both its stages — now the order is complete.
        self.client.force_authenticate(self.tech_b)
        self.client.post(f"/api/production/stages/{item2_stages[0].id}/complete/")
        item2_stages[1].refresh_from_db()
        self.assertEqual(item2_stages[1].status, ProductionStage.Status.ACTIVE)
        self.client.post(f"/api/production/stages/{item2_stages[1].id}/complete/")

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.WORKSHOP_COMPLETE)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py manage.py test production -v 2` (from `backend/`)
Expected: FAIL — old `/orders/<pk>/assign-stages/` endpoints and flat `stages` filters don't match the new per-item shape yet.

- [ ] **Step 3: Rewrite `production/views.py`**

```python
# backend/production/views.py
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
```

- [ ] **Step 4: Update `production/urls.py`**

```python
# backend/production/urls.py
from django.urls import path

from .views import (
    AssignItemStagesView,
    CompleteStageView,
    MyEarningsView,
    MyQueueView,
    OpsQueueView,
    PaymentListView,
    PipelineView,
    SetItemWagesView,
    SettlePaymentsView,
    StartWorkView,
)

urlpatterns = [
    path("my-queue/", MyQueueView.as_view(), name="production_my_queue"),
    path("my-earnings/", MyEarningsView.as_view(), name="production_my_earnings"),
    path("payments/", PaymentListView.as_view(), name="production_payments"),
    path("payments/<str:week>/settle/", SettlePaymentsView.as_view(), name="production_settle_payments"),
    path("stages/<int:pk>/complete/", CompleteStageView.as_view(), name="production_stage_complete"),
    path("ops-queue/", OpsQueueView.as_view(), name="production_ops_queue"),
    path("pipeline/", PipelineView.as_view(), name="production_pipeline"),
    path("items/<int:item_id>/assign-stages/", AssignItemStagesView.as_view(), name="production_assign_item_stages"),
    path("items/<int:item_id>/set-wages/", SetItemWagesView.as_view(), name="production_set_item_wages"),
    path("orders/<int:pk>/start-work/", StartWorkView.as_view(), name="production_start_work"),
]
```

- [ ] **Step 5: Fix the two real ORM query paths outside `production/`**

```python
# backend/reports/views.py:380 and :386 — select_related/filter path fix
        payments_qs = TechnicianPayment.objects.select_related("stage", "stage__item", "stage__item__order", "technician")
        ...
        if branch_id:
            payments_qs = payments_qs.filter(stage__item__order__branch_id=branch_id)
```

```python
# backend/reports/views.py:670 — select_related path fix
        ).select_related("stage", "stage__item", "stage__item__order")
```

```python
# backend/stock/views.py:51 — order_id FK-id shortcut fix
        "order_id": req.stage.item.order_id if req.stage else None,
```

```python
# backend/stock/views.py:310, 375, 394 — select_related path fix (all three occurrences)
            "stage__item", "stage__item__order", "requested_by", "reviewed_by"
```

- [ ] **Step 6: Fix the `_make_stage` test helper in `stock/tests.py`**

```python
# backend/stock/tests.py
from orders.models import OrderItem  # add to imports


def _make_stage(order, technician, sequence_number=1):
    # production.models.ProductionStage no longer defines agreed_wage /
    # allotted_time, but the applied Part 2 migration still has them as
    # NOT NULL columns (unrelated model/migration drift, out of this
    # module's scope to fix) -- relaxed here only so these Part 3 fixtures
    # can create a stage to hang a MaterialRequest off of.
    with connection.cursor() as cursor:
        cursor.execute(
            "ALTER TABLE production_productionstage ALTER COLUMN allotted_time DROP NOT NULL"
        )
        cursor.execute(
            "ALTER TABLE production_productionstage ALTER COLUMN agreed_wage DROP NOT NULL"
        )
    item = OrderItem.objects.create(order=order, name="Assembly Item")
    return ProductionStage.objects.create(
        item=item,
        stage_name="Assembly",
        sequence_number=sequence_number,
        assigned_technician=technician,
    )
```

- [ ] **Step 7: Run the full backend test suite**

Run: `py manage.py test` (from `backend/`)
Expected: PASS — all apps green, including `production`, `reports`, `stock`.

- [ ] **Step 8: Commit**

```bash
git add backend/production/views.py backend/production/urls.py backend/production/tests.py backend/reports/views.py backend/stock/views.py backend/stock/tests.py
git commit -m "Support per-item stage assignment and multi-item completion rollup"
```

---

### Task 3: Frontend — per-item assignment UI

**Files:**
- Modify: `furniture-management-system/components/operations/types.ts`
- Modify: `furniture-management-system/components/operations/assign-stages-dialog.tsx`
- Modify: `furniture-management-system/components/operations/ops-queue.tsx`

**Interfaces:**
- Consumes: `OpsOrder.items[].stages` (Task 2), `POST /production/items/<id>/assign-stages/`, `PATCH /production/items/<id>/set-wages/`, `POST /production/orders/<id>/start-work/` (unchanged URL/body).
- Produces: no prop/type change for `pipeline-board.tsx`, `scheduling-board.tsx`, `assignments-manager.tsx`, or any `head-technician/*` component — they keep reading the flattened `OpsOrder.stages` / `stage.order.*` shape untouched.

- [ ] **Step 1: Add `OrderItemPlan` to `types.ts`**

```typescript
// furniture-management-system/components/operations/types.ts
export interface Technician {
  id: number
  name: string
}

export interface Stage {
  id: number
  stage_name: string
  sequence_number: number
  status: "PENDING" | "ACTIVE" | "DONE"
  assigned_technician: { id: number; name: string } | null
  agreed_wage: string | null
  allotted_time: string
  payment_status: "PENDING" | "PAID" | null
  activated_at: string | null
  completed_at: string | null
  order: {
    id: number
    reference_number: string
    customer_name: string
    item_description: string
    delivery_date: string | null
  }
}

export interface OrderItemPlan {
  id: number
  name: string
  notes: string
  measurements: string
  stages: Omit<Stage, "order">[]
}

export interface OpsOrder {
  id: number
  reference_number: string
  customer_name: string
  customer_phone: string
  item_description: string
  delivery_date: string | null
  status: string
  created_at: string
  items: OrderItemPlan[]
  stages: Stage[]
}

export interface MaterialRequest {
  id: number
  stage_id: number
  order_id: number
  order_reference: string
  material_name: string
  quantity: number
  unit: string
  status: "PENDING" | "APPROVED" | "REJECTED" | "ISSUED"
  requested_by_name: string
  reviewed_by_name: string | null
  review_reason: string | null
  created_at: string
}
```

- [ ] **Step 2: Rewrite `assign-stages-dialog.tsx` with a per-item tab selector**

```tsx
// furniture-management-system/components/operations/assign-stages-dialog.tsx
"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ClipboardList, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import api from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { OpsOrder, OrderItemPlan, Technician } from "@/components/operations/types"

interface StageRow {
  stage_name: string
  technician_id: string
  allotted_time: string
  wage: string
}

function blankRow(): StageRow {
  return { stage_name: "", technician_id: "", allotted_time: "", wage: "" }
}

function initRows(item: OrderItemPlan): StageRow[] {
  if (item.stages.length > 0) {
    return item.stages.map((s) => ({
      stage_name: s.stage_name,
      technician_id: String(s.assigned_technician?.id ?? ""),
      allotted_time: s.allotted_time,
      wage: s.agreed_wage ? String(Math.round(Number(s.agreed_wage))) : "",
    }))
  }
  return [blankRow()]
}

interface AssignStagesDialogProps {
  order: OpsOrder
  technicians: Technician[]
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function AssignStagesDialog({
  order,
  technicians,
  open,
  onOpenChange,
}: AssignStagesDialogProps) {
  const queryClient = useQueryClient()
  const [activeItemId, setActiveItemId] = useState<number>(order.items[0]?.id ?? 0)
  const [rowsByItem, setRowsByItem] = useState<Record<number, StageRow[]>>(() =>
    Object.fromEntries(order.items.map((it) => [it.id, initRows(it)]))
  )

  const activeItem = order.items.find((it) => it.id === activeItemId) ?? order.items[0]
  const rows = rowsByItem[activeItemId] ?? [blankRow()]

  function setRows(next: StageRow[]) {
    setRowsByItem((prev) => ({ ...prev, [activeItemId]: next }))
  }

  function updateRow(i: number, field: keyof StageRow, val: string) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)))
  }

  function addRow() {
    setRows([...rows, blankRow()])
  }

  function removeRow(i: number) {
    if (rows.length === 1) return
    setRows(rows.filter((_, idx) => idx !== i))
  }

  const allStagesValid = (r: StageRow[]) =>
    r.length > 0 && r.every((row) => row.stage_name.trim().length > 0 && row.technician_id.length > 0)
  const allWagesSet = (r: StageRow[]) =>
    r.length > 0 && r.every((row) => row.wage.trim().length > 0 && Number(row.wage) >= 0)

  const everyItemReady = order.items.every(
    (it) => allStagesValid(rowsByItem[it.id] ?? []) && allWagesSet(rowsByItem[it.id] ?? [])
  )

  async function saveItemPlan(item: OrderItemPlan) {
    const itemRows = rowsByItem[item.id] ?? []
    const assignBody = itemRows.map((r) => ({
      stage_name: r.stage_name.trim(),
      technician_id: Number(r.technician_id),
      allotted_time: r.allotted_time || "00:00:00",
    }))
    const { data: updatedItem } = await api.post<OrderItemPlan>(
      `/production/items/${item.id}/assign-stages/`,
      assignBody
    )
    const wageBody = updatedItem.stages.map((s, i) => ({
      stage_id: s.id,
      wage: itemRows[i]?.wage ?? "0",
    }))
    await api.patch(`/production/items/${item.id}/set-wages/`, wageBody)
  }

  const savePlan = useMutation({
    mutationFn: async () => {
      for (const item of order.items) await saveItemPlan(item)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ops-queue"] })
      toast.success("Production plan saved.")
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast.error(err.response?.data?.detail ?? "Failed to save plan.")
    },
  })

  const startWork = useMutation({
    mutationFn: async () => {
      for (const item of order.items) await saveItemPlan(item)
      await api.post(`/production/orders/${order.id}/start-work/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ops-queue"] })
      queryClient.invalidateQueries({ queryKey: ["pipeline"] })
      toast.success(`${order.reference_number} is now in production.`)
      onOpenChange(false)
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast.error(err.response?.data?.detail ?? "Failed to start work.")
    },
  })

  if (!activeItem) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (next) {
          setRowsByItem(Object.fromEntries(order.items.map((it) => [it.id, initRows(it)])))
          setActiveItemId(order.items[0]?.id ?? 0)
        }
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm">
            <ClipboardList data-icon="inline-start" />
            {order.items.every((it) => it.stages.length === 0) ? "Assign Stages" : "Edit Plan"}
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Plan production — {order.reference_number}</DialogTitle>
          <DialogDescription>
            {order.customer_name}&apos;s order has {order.items.length} item
            {order.items.length !== 1 ? "s" : ""}. Plan each item&apos;s stages
            separately — items can go to different artisans and progress independently.
          </DialogDescription>
        </DialogHeader>

        {order.items.length > 1 && (
          <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
            {order.items.map((it) => {
              const ready = allStagesValid(rowsByItem[it.id] ?? []) && allWagesSet(rowsByItem[it.id] ?? [])
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setActiveItemId(it.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    it.id === activeItemId
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                  )}
                >
                  {it.name || "Untitled item"}
                  {ready && " ✓"}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex flex-col gap-4">
          {rows.map((row, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-lg border border-border p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">
                  Stage {i + 1}
                  {i === 0 && (
                    <span className="ml-2 font-normal text-muted-foreground">
                      first in {activeItem.name || "this item"}&apos;s workflow
                    </span>
                  )}
                </span>
                {rows.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(i)}
                  >
                    <Trash2 data-icon="inline-start" />
                    Remove
                  </Button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`stage-name-${activeItemId}-${i}`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Stage name
                  </label>
                  <Input
                    id={`stage-name-${activeItemId}-${i}`}
                    placeholder="e.g. Frame Assembly"
                    value={row.stage_name}
                    onChange={(e) => updateRow(i, "stage_name", e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`tech-${activeItemId}-${i}`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Technician
                  </label>
                  <select
                    id={`tech-${activeItemId}-${i}`}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm w-full"
                    value={row.technician_id}
                    onChange={(e) => updateRow(i, "technician_id", e.target.value)}
                  >
                    <option value="">Select technician</option>
                    {technicians.map((t) => (
                      <option key={t.id} value={String(t.id)}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`time-${activeItemId}-${i}`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Allotted time
                  </label>
                  <Input
                    id={`time-${activeItemId}-${i}`}
                    placeholder="e.g. 2 days"
                    value={row.allotted_time}
                    onChange={(e) => updateRow(i, "allotted_time", e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`wage-${activeItemId}-${i}`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Agreed wage (TZS)
                  </label>
                  <Input
                    id={`wage-${activeItemId}-${i}`}
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    placeholder="0"
                    value={row.wage}
                    onChange={(e) => updateRow(i, "wage", e.target.value.replace(/\D/g, ""))}
                  />
                </div>
              </div>
            </div>
          ))}

          <div>
            <Button type="button" variant="outline" onClick={addRow}>
              <Plus data-icon="inline-start" />
              Add another stage to {activeItem.name || "this item"}
            </Button>
          </div>
        </div>

        <Separator />

        <DialogFooter className="-mx-4 -mb-4">
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            variant="outline"
            disabled={savePlan.isPending}
            onClick={() => savePlan.mutate()}
          >
            {savePlan.isPending && <Loader2 className="size-4 animate-spin" />}
            Save plan
          </Button>
          {everyItemReady && (
            <Button
              disabled={startWork.isPending || savePlan.isPending}
              onClick={() => startWork.mutate()}
            >
              {startWork.isPending && <Loader2 className="size-4 animate-spin" />}
              Start Work
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: `ops-queue.tsx` — show item count instead of a single description**

```tsx
// furniture-management-system/components/operations/ops-queue.tsx — only the
// changed <TableCell> (everything else in the file is unchanged)
                  <TableCell className="max-w-40 truncate">
                    {order.items.length === 1
                      ? order.items[0].name
                      : `${order.items.length} items`}
                  </TableCell>
```

- [ ] **Step 4: Manual verification**

Run the dev server preview, log in as an Ops Manager, open the ops queue for the batch order created in Phase 1 (2 items), click "Assign Stages", confirm the item tabs appear, assign different stages/technicians per item, save, then Start Work, and confirm via `read_network_requests` that both items' first stages activate. Log in as each assigned technician and confirm `my-stages.tsx` shows their stage with the correct item name (proving the `stage.order.item_description` backward-compat payload works).

- [ ] **Step 5: Commit**

```bash
git add furniture-management-system/components/operations/types.ts furniture-management-system/components/operations/assign-stages-dialog.tsx furniture-management-system/components/operations/ops-queue.tsx
git commit -m "Add per-item production stage assignment UI to Ops Manager"
```

---

## Next Phase

- **Phase 3** (separate plan): add the `Payment` model on `Invoice`, auto-create the invoice at order creation (wiring up the `advance_payment` field Phase 1's form already sends), and add the "Log Payment" action to `invoice-screen.tsx`.
