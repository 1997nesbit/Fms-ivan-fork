# Batch Orders Phase 1 (OrderItem) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Front Desk create a single Order containing multiple `OrderItem`s (name, notes, measurements, photos, price), while every existing report/production/invoice code path that reads `Order.item_description`/`quoted_price`/`confirmed_price`/`images` keeps working unmodified, because those fields become auto-synced aggregates of the order's items.

**Architecture:** Additive-only for this phase. `OrderItem` is new; `OrderImage.order` FK is repointed to `OrderItem`; `Order.item_description`/`quoted_price`/`confirmed_price` stay as real stored fields but are recomputed from items on every item change via `Order.sync_from_items()`. The order-level API payload gains an `items` array; the existing top-level `item_description`/`images`/etc. fields stay present and correct (aggregated) so no other app (production, reports) needs to change in this phase.

**Tech Stack:** Django REST (function-based `APIView`s, no DRF serializers in this codebase), Next.js/React frontend, Postgres.

## Global Constraints

- Money fields are whole numbers (no cents) — matches existing `quoted_price`/`confirmed_price`/`agreed_wage` validation across the codebase.
- No DRF serializers — this codebase hand-builds response dicts via `_payload` helper functions; follow that pattern.
- Existing endpoints/URLs must not change shape for consumers that don't know about `items` yet (director-portal.tsx, orders-dashboard.tsx, all reports).

---

### Task 1: `OrderItem` model, `OrderImage` re-parenting, and data migration

**Files:**
- Modify: `backend/orders/models.py`
- Create: `backend/orders/migrations/0005_orderitem_and_more.py`
- Test: `backend/orders/tests.py`

**Interfaces:**
- Produces: `OrderItem(order, name, notes, measurements, quoted_price, confirmed_price, created_at)`, `OrderImage.item` FK (renamed from `OrderImage.order`), `Order.items` related manager, `Order.sync_from_items()` instance method (recomputes and saves `item_description`/`quoted_price`/`confirmed_price` from `self.items.all()`).

- [ ] **Step 1: Write failing model test**

```python
# backend/orders/tests.py
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from branches.models import Branch
from .models import Order, OrderItem, OrderImage

User = get_user_model()


class OrderItemSyncTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Main Branch")
        self.user = User.objects.create_user(
            username="frontdesk1", password="x", role=User.Role.FRONT_DESK, branch=self.branch
        )
        self.order = Order.objects.create(
            reference_number="FMS-TEST-0001",
            branch=self.branch,
            created_by=self.user,
            customer_name="Amina Yusuf",
            customer_phone="+255700000000",
        )

    def test_sync_from_items_aggregates_names_and_prices(self):
        OrderItem.objects.create(
            order=self.order, name="Sofa", quoted_price=Decimal("500000"), confirmed_price=Decimal("500000")
        )
        OrderItem.objects.create(
            order=self.order, name="Coffee Table", quoted_price=Decimal("150000"), confirmed_price=Decimal("150000")
        )

        self.order.sync_from_items()
        self.order.refresh_from_db()

        self.assertEqual(self.order.item_description, "Sofa; Coffee Table")
        self.assertEqual(self.order.quoted_price, Decimal("650000"))
        self.assertEqual(self.order.confirmed_price, Decimal("650000"))

    def test_sync_confirmed_price_is_none_until_every_item_confirmed(self):
        OrderItem.objects.create(order=self.order, name="Sofa", confirmed_price=Decimal("500000"))
        OrderItem.objects.create(order=self.order, name="Coffee Table", confirmed_price=None)

        self.order.sync_from_items()
        self.order.refresh_from_db()

        self.assertIsNone(self.order.confirmed_price)

    def test_order_image_belongs_to_item(self):
        item = OrderItem.objects.create(order=self.order, name="Sofa")
        img = OrderImage.objects.create(item=item, image_file="order_images/test.jpg")
        self.assertEqual(item.images.first(), img)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `py manage.py test orders -v 2` (from `backend/`)
Expected: FAIL — `OrderItem` does not exist / `Order.items` has no manager.

- [ ] **Step 3: Write the model changes**

```python
# backend/orders/models.py
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
```

- [ ] **Step 4: Write the migration (schema + data backfill in one file)**

Run `py manage.py makemigrations orders --name orderitem_and_more --dry-run -v 3` first to see Django's auto-detected operations (it will ask how to handle the `OrderImage.order` → `item` rename/FK-type-change — answer "add field" since we're writing this by hand instead). Then hand-write the migration so the schema change and data backfill are one atomic deploy step:

```python
# backend/orders/migrations/0005_orderitem_and_more.py
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def backfill_order_items(apps, schema_editor):
    Order = apps.get_model("orders", "Order")
    OrderItem = apps.get_model("orders", "OrderItem")
    OrderImage = apps.get_model("orders", "OrderImage")

    for order in Order.objects.all():
        item = OrderItem.objects.create(
            order=order,
            name=order.item_description[:200] or "Item",
            notes=order.item_description,
            quoted_price=order.quoted_price,
            confirmed_price=order.confirmed_price,
        )
        OrderImage.objects.filter(order_old=order).update(item=item)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0004_remove_order_showroom_item_order_cancellation_reason_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="OrderItem",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=200)),
                ("notes", models.TextField(blank=True)),
                ("measurements", models.CharField(blank=True, max_length=200)),
                ("quoted_price", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("confirmed_price", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("order", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="items", to="orders.order")),
            ],
            options={"ordering": ["id"]},
        ),
        # Keep the old FK around under a temp name so the data migration can
        # read which order each image belonged to, then drop it afterwards.
        migrations.RenameField(model_name="orderimage", old_name="order", new_name="order_old"),
        migrations.AddField(
            model_name="orderimage",
            name="item",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="images",
                to="orders.orderitem",
            ),
        ),
        migrations.RunPython(backfill_order_items, noop_reverse),
        migrations.RemoveField(model_name="orderimage", name="order_old"),
        migrations.AlterField(
            model_name="orderimage",
            name="item",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="images", to="orders.orderitem"),
        ),
        migrations.AlterField(
            model_name="order",
            name="item_description",
            field=models.TextField(blank=True),
        ),
    ]
```

- [ ] **Step 5: Run the migration and the test**

Run: `py manage.py migrate orders` then `py manage.py test orders -v 2` (from `backend/`)
Expected: PASS — all 3 tests green, and `py manage.py test orders` on a fresh test DB (which has zero existing orders) confirms the migration itself doesn't error with no rows.

- [ ] **Step 6: Commit**

```bash
git add backend/orders/models.py backend/orders/migrations/0005_orderitem_and_more.py backend/orders/tests.py
git commit -m "Add OrderItem model with auto-synced Order aggregates"
```

---

### Task 2: `orders/views.py` — multi-item create/list/detail, per-item price confirmation

**Files:**
- Modify: `backend/orders/views.py`

**Interfaces:**
- Consumes: `Order.sync_from_items()`, `OrderItem`, `OrderImage.item` (Task 1).
- Produces: `_order_payload(order, request)` now includes `"items": [...]` (each with `id`, `name`, `notes`, `measurements`, `quoted_price`, `confirmed_price`, `images`), while keeping top-level `item_description`/`quoted_price`/`confirmed_price`/`images` (flattened union of all items' images) unchanged in shape. `OrderListCreateView.post` accepts a JSON `items` field (list of `{name, notes, measurements, quoted_price}`) plus per-item files under `item_images_<index>`. New `OrderConfirmPriceView.patch` body: `{"items": [{"item_id": <id>, "confirmed_price": <num>}, ...]}`.

- [ ] **Step 1: Write failing view tests**

```python
# backend/orders/tests.py — append to the file from Task 1
import json

from rest_framework.test import APIClient


class OrderCreateMultiItemTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Main Branch")
        self.fd = User.objects.create_user(
            username="frontdesk2", password="x", role=User.Role.FRONT_DESK, branch=self.branch
        )
        self.director = User.objects.create_user(
            username="director2", password="x", role=User.Role.DIRECTOR
        )
        self.client_api = APIClient()
        self.client_api.force_authenticate(self.fd)

    def test_create_order_with_two_items(self):
        payload = {
            "customer_name": "Amina Yusuf",
            "customer_phone": "+255700000000",
            "delivery_date": "2026-08-01",
            "items": json.dumps([
                {"name": "Sofa", "notes": "3-seater, grey fabric", "measurements": "W200xH80xD90", "quoted_price": "500000"},
                {"name": "Coffee Table", "notes": "Glass top", "measurements": "W100xH45xD60", "quoted_price": "150000"},
            ]),
        }
        resp = self.client_api.post("/api/orders/", payload, format="multipart")

        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(len(resp.data["items"]), 2)
        self.assertEqual(resp.data["item_description"], "Sofa; Coffee Table")
        self.assertEqual(resp.data["quoted_price"], "650000.00")

    def test_create_order_requires_at_least_one_item(self):
        payload = {
            "customer_name": "Amina Yusuf",
            "customer_phone": "+255700000000",
            "delivery_date": "2026-08-01",
            "items": json.dumps([]),
        }
        resp = self.client_api.post("/api/orders/", payload, format="multipart")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("items", resp.data["errors"])

    def test_confirm_price_per_item_syncs_order_total(self):
        order = Order.objects.create(
            reference_number="FMS-TEST-0002",
            branch=self.branch,
            created_by=self.fd,
            customer_name="Amina Yusuf",
            customer_phone="+255700000000",
            status=Order.Status.PRICE_REVIEW,
        )
        i1 = OrderItem.objects.create(order=order, name="Sofa")
        i2 = OrderItem.objects.create(order=order, name="Coffee Table")

        director_client = APIClient()
        director_client.force_authenticate(self.director)
        resp = director_client.patch(
            f"/api/orders/{order.pk}/confirm-price/",
            {"items": [{"item_id": i1.id, "confirmed_price": "500000"}, {"item_id": i2.id, "confirmed_price": "150000"}]},
            format="json",
        )

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["confirmed_price"], "650000.00")
        self.assertEqual(resp.data["status"], "OPS_QUEUE")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py manage.py test orders.OrderCreateMultiItemTests -v 2` (from `backend/`)
Expected: FAIL — 400/KeyError, since `items` isn't handled yet and `_order_payload` has no `items` key.

- [ ] **Step 3: Rewrite `orders/views.py`**

```python
# backend/orders/views.py
import json
from datetime import date
from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import User

from .models import Order, OrderImage, OrderItem


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _gen_reference():
    prefix = f"FMS-{date.today().strftime('%Y%m%d')}"
    count = Order.objects.filter(reference_number__startswith=prefix).count() + 1
    return f"{prefix}-{count:04d}"


def _img_url(img, request=None):
    if request:
        return request.build_absolute_uri(img.image_file.url)
    return img.image_file.url


def _item_payload(item, request=None):
    return {
        "id": item.id,
        "name": item.name,
        "notes": item.notes,
        "measurements": item.measurements,
        "quoted_price": str(item.quoted_price) if item.quoted_price is not None else None,
        "confirmed_price": str(item.confirmed_price) if item.confirmed_price is not None else None,
        "images": [{"id": img.id, "url": _img_url(img, request)} for img in item.images.all()],
    }


def _order_payload(order, request=None):
    items = list(order.items.all())
    all_images = [img for item in items for img in item.images.all()]
    return {
        "id": order.id,
        "reference_number": order.reference_number,
        "status": order.status,
        "customer_name": order.customer_name,
        "customer_phone": order.customer_phone,
        "item_description": order.item_description,
        "quoted_price": str(order.quoted_price) if order.quoted_price is not None else None,
        "confirmed_price": str(order.confirmed_price) if order.confirmed_price is not None else None,
        "delivery_date": str(order.delivery_date) if order.delivery_date else None,
        "notes": order.notes,
        "cancellation_reason": order.cancellation_reason,
        "branch_id": order.branch_id,
        "created_by_id": order.created_by_id,
        "created_at": order.created_at.isoformat(),
        "updated_at": order.updated_at.isoformat(),
        "images": [{"id": img.id, "url": _img_url(img, request)} for img in all_images],
        "items": [_item_payload(item, request) for item in items],
    }


def _parse_money(raw, field_name, errors):
    raw = str(raw).strip()
    if not raw:
        return None
    try:
        value = Decimal(raw)
    except InvalidOperation:
        errors[field_name] = ["Enter a valid number."]
        return None
    if value < 0:
        errors[field_name] = ["Price cannot be negative."]
        return None
    if value != value.to_integral_value():
        errors[field_name] = ["Enter a whole number (no cents)."]
        return None
    return value


def _validate_order_data(request):
    """Validate POST data and return (errors, items_data, delivery_date)."""
    data = request.data
    errors: dict[str, list[str]] = {}

    for field in ("customer_name", "customer_phone"):
        if not str(data.get(field, "")).strip():
            errors[field] = ["This field is required."]

    raw_items = data.get("items", "[]")
    try:
        items_data = json.loads(raw_items) if isinstance(raw_items, str) else raw_items
    except (TypeError, ValueError):
        items_data = None

    if not isinstance(items_data, list) or len(items_data) == 0:
        errors["items"] = ["At least one item is required."]
        items_data = []
    else:
        for i, item in enumerate(items_data):
            if not str(item.get("name", "")).strip():
                errors[f"items[{i}].name"] = ["This field is required."]
            _parse_money(item.get("quoted_price", ""), f"items[{i}].quoted_price", errors)

    delivery_date: date | None = None
    raw_date = str(data.get("delivery_date", "")).strip()
    if not raw_date:
        errors["delivery_date"] = ["This field is required."]
    else:
        try:
            delivery_date = date.fromisoformat(raw_date)
        except ValueError:
            errors["delivery_date"] = ["Enter a valid date (YYYY-MM-DD)."]

    if not request.user.branch_id:
        errors["non_field"] = ["Your account has no branch assigned."]

    return errors, items_data, delivery_date


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------

class OrderListCreateView(APIView):
    """
    GET  /api/orders/          — list orders (scoped by role)
    POST /api/orders/          — create a batch order (multipart/form-data)

    POST fields
    -----------
    customer_name      str    required
    customer_phone     str    required
    items              json   required  [{name, notes, measurements, quoted_price}, ...]
    item_images_<i>    file   optional  repeatable, i = index into items[]
    delivery_date      date   required  YYYY-MM-DD
    notes              str    optional
    requires_approval  bool   optional  "true"/"false"  (default false)

    Error shape
    -----------
    400  { "errors": { "<field>": ["<message>"] } }
    201  <order payload>
    """
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Order.objects.prefetch_related("items__images").order_by("-created_at")

        if request.user.role == "FRONT_DESK":
            qs = qs.filter(branch=request.user.branch)

        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        return Response([_order_payload(o, request) for o in qs])

    def post(self, request):
        if request.user.role != User.Role.FRONT_DESK:
            return Response({"detail": "Front Desk role required."}, status=403)

        errors, items_data, delivery_date = _validate_order_data(request)
        if errors:
            return Response({"errors": errors}, status=400)

        raw_approval = str(request.data.get("requires_approval", "false")).lower()
        status_val = (
            Order.Status.PRICE_REVIEW
            if raw_approval in ("true", "1", "yes")
            else Order.Status.OPS_QUEUE
        )

        for attempt in range(5):
            try:
                with transaction.atomic():
                    order = Order.objects.create(
                        reference_number=_gen_reference(),
                        branch=request.user.branch,
                        created_by=request.user,
                        customer_name=str(request.data["customer_name"]).strip(),
                        customer_phone=str(request.data["customer_phone"]).strip(),
                        delivery_date=delivery_date,
                        notes=str(request.data.get("notes", "")).strip(),
                        status=status_val,
                    )
                    for i, item_data in enumerate(items_data):
                        item = OrderItem.objects.create(
                            order=order,
                            name=str(item_data.get("name", "")).strip(),
                            notes=str(item_data.get("notes", "")).strip(),
                            measurements=str(item_data.get("measurements", "")).strip(),
                            quoted_price=_parse_money(item_data.get("quoted_price", ""), f"items[{i}].quoted_price", {}),
                        )
                        for img_file in request.FILES.getlist(f"item_images_{i}"):
                            OrderImage.objects.create(
                                item=item,
                                image_file=img_file,
                                uploaded_by=request.user,
                            )
                    order.sync_from_items()
                break
            except IntegrityError:
                if attempt == 4:
                    raise

        order.refresh_from_db()
        return Response(_order_payload(order, request), status=201)


class OrderCollectView(APIView):
    """POST /api/orders/<pk>/collect/ — mark WORKSHOP_COMPLETE → DISPATCHED."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk, status=Order.Status.WORKSHOP_COMPLETE)
        except Order.DoesNotExist:
            return Response({"detail": "Order not found or not ready for collection."}, status=404)

        order.status = Order.Status.DISPATCHED
        order.save(update_fields=["status", "updated_at"])
        return Response(_order_payload(order, request))


class OrderConfirmPriceView(APIView):
    """PATCH /api/orders/<pk>/confirm-price/ — Director confirms each item's
    price; PRICE_REVIEW → OPS_QUEUE once all items are confirmed.

    Body: { "items": [{"item_id": <id>, "confirmed_price": <num>}, ...] }
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if request.user.role != User.Role.DIRECTOR:
            return Response({"detail": "Director role required."}, status=403)

        try:
            order = Order.objects.get(pk=pk, status=Order.Status.PRICE_REVIEW)
        except Order.DoesNotExist:
            return Response(
                {"detail": "Order not found or not pending price review."}, status=404
            )

        rows = request.data.get("items")
        if not isinstance(rows, list) or not rows:
            return Response({"errors": {"items": ["At least one item price is required."]}}, status=400)

        items_by_id = {i.id: i for i in order.items.all()}
        updates = []
        errors: dict[str, list[str]] = {}
        for i, row in enumerate(rows):
            item = items_by_id.get(row.get("item_id"))
            if item is None:
                errors[f"items[{i}]"] = ["Item not found on this order."]
                continue
            price = _parse_money(row.get("confirmed_price", ""), f"items[{i}].confirmed_price", errors)
            if price is None and f"items[{i}].confirmed_price" not in errors:
                errors[f"items[{i}].confirmed_price"] = ["This field is required."]
                continue
            updates.append((item, price))

        if errors:
            return Response({"errors": errors}, status=400)

        with transaction.atomic():
            for item, price in updates:
                item.confirmed_price = price
                item.save(update_fields=["confirmed_price"])
            order.sync_from_items()
            order.refresh_from_db()
            if order.confirmed_price is not None:
                order.status = Order.Status.OPS_QUEUE
                order.save(update_fields=["status", "updated_at"])

        order.refresh_from_db()
        return Response(_order_payload(order, request))


class OrderRejectView(APIView):
    """PATCH /api/orders/<pk>/reject/ — Director rejects, PRICE_REVIEW → CANCELLED."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if request.user.role != User.Role.DIRECTOR:
            return Response({"detail": "Director role required."}, status=403)

        try:
            order = Order.objects.get(pk=pk, status=Order.Status.PRICE_REVIEW)
        except Order.DoesNotExist:
            return Response(
                {"detail": "Order not found or not pending price review."}, status=404
            )

        reason = str(request.data.get("reason", "")).strip()
        if not reason:
            return Response({"errors": {"reason": ["This field is required."]}}, status=400)

        order.cancellation_reason = reason
        order.status = Order.Status.CANCELLED
        order.save(update_fields=["cancellation_reason", "status", "updated_at"])
        return Response(_order_payload(order, request))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `py manage.py test orders -v 2` (from `backend/`)
Expected: PASS — all tests from Task 1 and Task 2 green.

- [ ] **Step 5: Commit**

```bash
git add backend/orders/views.py backend/orders/tests.py
git commit -m "Support multi-item batch order creation and per-item price confirmation"
```

---

### Task 3: Frontend — multi-item create-order form

**Files:**
- Modify: `furniture-management-system/components/front-desk/create-order-dialog.tsx`

**Interfaces:**
- Consumes: `POST /api/orders/` with `items` (JSON string) and `item_images_<i>` file fields (Task 2).
- Produces: no change to any other component's props — `orders-dashboard.tsx`, `director-portal.tsx`, and all reports keep reading `order.item_description`/`order.images`/`order.quoted_price` unchanged.

- [ ] **Step 1: Replace the single-item fields with a repeatable item list**

```tsx
// furniture-management-system/components/front-desk/create-order-dialog.tsx
"use client"

import { useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import api from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImagePreview {
  id: string
  file: File
  url: string
}

interface ItemDraft {
  id: string
  name: string
  notes: string
  measurements: string
  quotedPrice: string
  images: ImagePreview[]
}

type FieldErrors = Record<string, string[]>

const today = () => new Date().toISOString().slice(0, 10)

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]
const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8MB

function newItem(): ItemDraft {
  return {
    id: `${Date.now()}-${Math.random()}`,
    name: "",
    notes: "",
    measurements: "",
    quotedPrice: "",
    images: [],
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateOrderDialog() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const [customerName, setCustomerName]         = useState("")
  const [contact, setContact]                   = useState("")
  const [expectedDelivery, setExpectedDelivery] = useState("")
  const [advancePayment, setAdvancePayment]     = useState("")
  const [requiresApproval, setRequiresApproval] = useState(false)
  const [items, setItems]                       = useState<ItemDraft[]>([newItem()])
  const [fieldErrors, setFieldErrors]           = useState<FieldErrors>({})

  function resetForm() {
    setCustomerName("")
    setContact("")
    setExpectedDelivery("")
    setAdvancePayment("")
    setRequiresApproval(false)
    setItems([newItem()])
    setFieldErrors({})
  }

  function updateItem(id: string, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }

  function addItem() {
    setItems((prev) => [...prev, newItem()])
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const removed = prev.find((it) => it.id === id)
      removed?.images.forEach((img) => URL.revokeObjectURL(img.url))
      const next = prev.filter((it) => it.id !== id)
      return next.length > 0 ? next : [newItem()]
    })
  }

  function addImagesToItem(id: string, files: FileList | null) {
    if (!files) return

    const accepted: File[] = []
    const rejected: string[] = []
    for (const file of Array.from(files)) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        rejected.push(`${file.name} (unsupported format)`)
      } else if (file.size > MAX_IMAGE_BYTES) {
        rejected.push(`${file.name} (over 8MB)`)
      } else {
        accepted.push(file)
      }
    }

    if (rejected.length > 0) {
      toast.error(
        rejected.length === 1 ? "Photo not added" : "Some photos not added",
        { description: rejected.join(", ") },
      )
    }

    if (accepted.length === 0) return
    const previews: ImagePreview[] = accepted.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      url: URL.createObjectURL(file),
    }))
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, images: [...it.images, ...previews] } : it))
    )
  }

  function removeImageFromItem(itemId: string, imageId: string) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it
        const removed = it.images.find((img) => img.id === imageId)
        if (removed) URL.revokeObjectURL(removed.url)
        return { ...it, images: it.images.filter((img) => img.id !== imageId) }
      })
    )
  }

  const create = useMutation({
    mutationFn: () => {
      const form = new FormData()
      form.append("customer_name", customerName.trim())
      form.append("customer_phone", contact.trim())
      form.append("delivery_date", expectedDelivery)
      form.append("requires_approval", String(requiresApproval))
      if (advancePayment) form.append("advance_payment", advancePayment)

      const itemsJson = items.map((it) => ({
        name: it.name.trim(),
        notes: it.notes.trim(),
        measurements: it.measurements.trim(),
        quoted_price: it.quotedPrice || undefined,
      }))
      form.append("items", JSON.stringify(itemsJson))
      items.forEach((it, i) => {
        it.images.forEach((img) => form.append(`item_images_${i}`, img.file))
      })

      return api.post("/orders/", form)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      toast.success("Order created", {
        description: requiresApproval
          ? "Sent for Director approval."
          : `${items.length} item${items.length !== 1 ? "s" : ""} added to the ops queue.`,
      })
      resetForm()
      setOpen(false)
    },
    onError: (err: { response?: { data?: { errors?: FieldErrors; detail?: string } } }) => {
      const data = err.response?.data
      if (data?.errors) {
        setFieldErrors(data.errors)
      } else {
        toast.error(data?.detail ?? "Failed to create order.")
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
      <DialogTrigger render={<Button><Plus data-icon="inline-start" />New Order</Button>} />

      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create new order</DialogTitle>
          <DialogDescription>
            Capture the customer&apos;s details, then add every item for this order.
            The batch goes straight to the ops queue unless Director price approval is needed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="customerName">Customer name</FieldLabel>
              <Input
                id="customerName"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Amina Yusuf"
              />
              <FieldError errors={fieldErrors.customer_name?.map((m) => ({ message: m }))} />
            </Field>

            <Field>
              <FieldLabel htmlFor="contact">Phone / contact</FieldLabel>
              <Input
                id="contact"
                required
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="+255 7xx xxx xxx"
              />
              <FieldError errors={fieldErrors.customer_phone?.map((m) => ({ message: m }))} />
            </Field>

            {fieldErrors.items && (
              <p className="text-sm text-destructive">{fieldErrors.items[0]}</p>
            )}

            <div className="flex flex-col gap-4">
              {items.map((item, index) => (
                <div key={item.id} className="rounded-lg border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">Item {index + 1}</span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        aria-label={`Remove item ${index + 1}`}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>

                  <FieldGroup>
                    <Field orientation="responsive">
                      <Field>
                        <FieldLabel htmlFor={`name-${item.id}`}>Item name</FieldLabel>
                        <Input
                          id={`name-${item.id}`}
                          required
                          value={item.name}
                          onChange={(e) => updateItem(item.id, { name: e.target.value })}
                          placeholder="e.g. 6-Seater Dining Table"
                        />
                        <FieldError errors={fieldErrors[`items[${index}].name`]?.map((m) => ({ message: m }))} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`measurements-${item.id}`}>Measurements</FieldLabel>
                        <Input
                          id={`measurements-${item.id}`}
                          value={item.measurements}
                          onChange={(e) => updateItem(item.id, { measurements: e.target.value })}
                          placeholder="e.g. 180 × 90 × 76 cm"
                        />
                      </Field>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor={`notes-${item.id}`}>Brief notes</FieldLabel>
                      <Textarea
                        id={`notes-${item.id}`}
                        value={item.notes}
                        onChange={(e) => updateItem(item.id, { notes: e.target.value })}
                        placeholder="Fabric, finish, any workshop-specific detail…"
                        rows={2}
                      />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor={`price-${item.id}`}>Quoted price</FieldLabel>
                      <Input
                        id={`price-${item.id}`}
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={item.quotedPrice}
                        onChange={(e) => updateItem(item.id, { quotedPrice: e.target.value.replace(/\D/g, "") })}
                        placeholder="0"
                      />
                      <FieldError errors={fieldErrors[`items[${index}].quoted_price`]?.map((m) => ({ message: m }))} />
                    </Field>

                    <ItemPhotoField
                      item={item}
                      onAdd={(files) => addImagesToItem(item.id, files)}
                      onRemove={(imageId) => removeImageFromItem(item.id, imageId)}
                    />
                  </FieldGroup>
                </div>
              ))}
            </div>

            <Button type="button" variant="outline" onClick={addItem} className="self-start">
              <Plus data-icon="inline-start" />
              Add another item
            </Button>

            <Field>
              <FieldLabel htmlFor="expectedDelivery">Expected delivery</FieldLabel>
              <Input
                id="expectedDelivery"
                type="date"
                required
                min={today()}
                value={expectedDelivery}
                onChange={(e) => setExpectedDelivery(e.target.value)}
              />
              <FieldError errors={fieldErrors.delivery_date?.map((m) => ({ message: m }))} />
            </Field>

            <Field>
              <FieldLabel htmlFor="advancePayment">Advance payment received (optional)</FieldLabel>
              <Input
                id="advancePayment"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={advancePayment}
                onChange={(e) => setAdvancePayment(e.target.value.replace(/\D/g, ""))}
                placeholder="0"
              />
              <FieldDescription>Recorded as the first payment on this order&apos;s invoice.</FieldDescription>
            </Field>

            <FieldLabel className="rounded-lg border border-border p-3">
              <Checkbox
                checked={requiresApproval}
                onCheckedChange={(checked) => setRequiresApproval(checked === true)}
              />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Requires Director price approval</span>
                <FieldDescription>
                  Tick for bargained or non-catalogue pricing.
                </FieldDescription>
              </div>
            </FieldLabel>

            {fieldErrors.non_field && (
              <p className="text-sm text-destructive">{fieldErrors.non_field[0]}</p>
            )}
          </FieldGroup>

          <DialogFooter className="mt-6">
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="size-4 animate-spin" />}
              Create order
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Per-item photo field
// ---------------------------------------------------------------------------

function ItemPhotoField({
  item,
  onAdd,
  onRemove,
}: {
  item: ItemDraft
  onAdd: (files: FileList | null) => void
  onRemove: (imageId: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  return (
    <Field>
      <FieldLabel htmlFor={`upload-${item.id}`}>Reference photos</FieldLabel>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); onAdd(e.dataTransfer.files) }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input bg-muted/40 px-4 py-4 text-center transition-colors hover:bg-muted/70",
          dragActive && "border-primary bg-primary/5"
        )}
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <ImagePlus className="size-4" />
        </span>
        <span className="text-xs font-medium">Drag &amp; drop or click to add photos for this item</span>
      </button>
      <input
        ref={fileInputRef}
        id={`upload-${item.id}`}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => onAdd(e.target.files)}
      />

      {item.images.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {item.images.map((img) => (
            <div
              key={img.id}
              className="group relative size-16 overflow-hidden rounded-md border border-border bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.file.name} className="size-full object-cover" />
              <button
                type="button"
                onClick={() => onRemove(img.id)}
                aria-label={`Remove ${img.file.name}`}
                className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-foreground/70 text-background opacity-80 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Field>
  )
}
```

Note: `advance_payment` is sent to the backend already in this task's form for forward-compatibility, but the backend does not read it yet — Phase 3 (invoice `Payment` model) is what will make Front Desk's advance-payment field actually create a `Payment` row. Until Phase 3 ships, the field is harmlessly ignored by `OrderListCreateView.post`, and the toast/description reflects only item count, not payment.

- [ ] **Step 2: Manual verification**

Run the dev server preview (`preview_start` with the frontend's `.claude/launch.json` config), log in as a Front Desk user, open "New Order", add two items each with their own name/notes/measurements/photo, submit, and confirm via `read_network_requests` that the POST body's `items` field round-trips correctly and the response contains both items. Then check `director-portal.tsx`'s price-review list (if `requires_approval` was ticked) still renders the order's photos and combined description correctly.

- [ ] **Step 3: Commit**

```bash
git add furniture-management-system/components/front-desk/create-order-dialog.tsx
git commit -m "Add multi-item batch order form to Front Desk create-order dialog"
```

---

## Next Phases

- **Phase 2** (separate plan): move `ProductionStage` from `Order` to `OrderItem`, update `AssignStagesView`/`ops-queue.tsx`/`pipeline-board.tsx`/`assign-stages-dialog.tsx` for per-item stage splitting, and make `Order.status` a computed rollup of item statuses.
- **Phase 3** (separate plan): add the `Payment` model on `Invoice`, auto-create the invoice at order creation (wire up the `advance_payment` field this phase's form already sends), and add the "Log Payment" action to `invoice-screen.tsx`.
