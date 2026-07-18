# Batch Orders Phase 3 (Invoice Payments) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-create an `Invoice` when a batch order is placed (with a line item per `OrderItem`, kept in sync as item prices are confirmed), record the Front Desk's advance payment as the invoice's first `Payment`, and let the Director log further installments later — with `Invoice.status` automatically reflecting DRAFT/ISSUED/PARTIALLY_PAID/PAID from the running payment total.

**Architecture:** New `Payment` model (FK → `Invoice`) in `reports/models.py`, plus an `order_item` FK on `InvoiceLineItem` so line items stay traceable to the `OrderItem` they price. `reports/services.py` holds two entry points: `create_invoice_for_order(order, user, advance_payment)` (called once, from `orders/views.py::OrderListCreateView.post`) and `sync_invoice_line_items(order)` (called from `orders/views.py::OrderConfirmPriceView.patch` whenever item prices are confirmed). Both live in `reports` so invoice-construction logic stays in one app; `orders/views.py` calls them via plain top-level imports (no circular import — `reports/models.py` has no cross-app imports, only string FK refs). A `recompute_status()` method on `Invoice` runs after every line-item sync and every payment, deriving DRAFT/ISSUED/PARTIALLY_PAID/PAID from `sum(payments)` vs `subtotal`, never overriding the DRAFT→ISSUED manual step when no payments exist yet.

**Tech Stack:** Django REST (hand-built `APIView`s, no serializers), Next.js/React, Postgres.

## Global Constraints

- Money fields are whole numbers (no cents), matching every other amount in this app.
- No DRF serializers — follow the existing `_payload` dict-builder pattern.
- `orders/views.py` imports `reports.models`/`reports.services` at module level (safe — `reports` has no import of `orders` at import time, only at request time inside view bodies).

---

### Task 1: `Payment` model, `InvoiceLineItem.order_item`, `Invoice.recompute_status()`

**Files:**
- Modify: `backend/reports/models.py`
- Create: `backend/reports/migrations/0002_payment_and_more.py`
- Test: `backend/reports/tests.py` (new)

**Interfaces:**
- Produces: `Payment(invoice, amount, note, recorded_by, paid_at)`; `InvoiceLineItem.order_item` (nullable FK → `orders.OrderItem`); `Invoice.total_paid` property; `Invoice.balance_remaining` property; `Invoice.recompute_status()` instance method (saves `status` if it changed).

- [ ] **Step 1: Write failing test**

```python
# backend/reports/tests.py
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from branches.models import Branch

from .models import Invoice, InvoiceLineItem, Payment

User = get_user_model()


class InvoiceRecomputeStatusTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Main", location="Town")
        self.director = User.objects.create_user(
            username="director-inv", password="x", role=User.Role.DIRECTOR
        )
        self.invoice = Invoice.objects.create(
            invoice_number="INV-TEST-0001",
            branch=self.branch,
            customer_name="Jane",
            issue_date="2026-07-18",
            created_by=self.director,
        )
        InvoiceLineItem.objects.create(invoice=self.invoice, description="Sofa", unit_price=Decimal("100000"))

    def test_no_payments_leaves_status_unchanged(self):
        self.invoice.status = Invoice.Status.ISSUED
        self.invoice.save(update_fields=["status"])
        self.invoice.recompute_status()
        self.assertEqual(self.invoice.status, Invoice.Status.ISSUED)

    def test_partial_payment_sets_partially_paid(self):
        Payment.objects.create(invoice=self.invoice, amount=Decimal("40000"), recorded_by=self.director)
        self.invoice.recompute_status()
        self.assertEqual(self.invoice.status, Invoice.Status.PARTIALLY_PAID)
        self.assertEqual(self.invoice.total_paid, Decimal("40000"))
        self.assertEqual(self.invoice.balance_remaining, Decimal("60000"))

    def test_full_payment_sets_paid(self):
        Payment.objects.create(invoice=self.invoice, amount=Decimal("100000"), recorded_by=self.director)
        self.invoice.recompute_status()
        self.assertEqual(self.invoice.status, Invoice.Status.PAID)
        self.assertEqual(self.invoice.balance_remaining, Decimal("0"))

    def test_overpayment_still_counts_as_paid_with_negative_balance(self):
        Payment.objects.create(invoice=self.invoice, amount=Decimal("120000"), recorded_by=self.director)
        self.invoice.recompute_status()
        self.assertEqual(self.invoice.status, Invoice.Status.PAID)
        self.assertEqual(self.invoice.balance_remaining, Decimal("-20000"))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `py manage.py test reports.tests.InvoiceRecomputeStatusTests -v 2` (from `backend/`)
Expected: FAIL — `Payment` doesn't exist yet.

- [ ] **Step 3: Update `reports/models.py`**

```python
# backend/reports/models.py
from django.conf import settings
from django.db import models


class Invoice(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ISSUED = "ISSUED", "Issued"
        PARTIALLY_PAID = "PARTIALLY_PAID", "Partially Paid"
        PAID = "PAID", "Paid"

    invoice_number = models.CharField(max_length=50, unique=True)
    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoices",
    )
    # Bill-from branch (the branch originating the order/sale)
    branch = models.ForeignKey(
        "branches.Branch",
        on_delete=models.RESTRICT,
        related_name="invoices",
    )
    customer_name = models.CharField(max_length=200)
    customer_phone = models.CharField(max_length=20, blank=True)
    customer_address = models.TextField(blank=True)
    issue_date = models.DateField()
    due_date = models.DateField(null=True, blank=True)
    payment_terms = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.DRAFT)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.RESTRICT,
        related_name="created_invoices",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["-created_at"])]

    def __str__(self):
        return f"Invoice {self.invoice_number} — {self.customer_name}"

    @property
    def subtotal(self):
        return sum((li.total for li in self.line_items.all()), 0)

    @property
    def total_paid(self):
        return sum((p.amount for p in self.payments.all()), 0)

    @property
    def balance_remaining(self):
        return self.subtotal - self.total_paid

    def recompute_status(self):
        """Derives DRAFT/ISSUED/PARTIALLY_PAID/PAID from payments vs subtotal.
        Never touches status while there are no payments yet, so the manual
        DRAFT -> ISSUED step (InvoiceDetailView.patch) isn't clobbered."""
        paid = self.total_paid
        if paid <= 0:
            return
        new_status = self.Status.PAID if paid >= self.subtotal else self.Status.PARTIALLY_PAID
        if new_status != self.status:
            self.status = new_status
            self.save(update_fields=["status", "updated_at"])


class InvoiceLineItem(models.Model):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="line_items")
    # Traces a line item back to the OrderItem it prices, so
    # sync_invoice_line_items() can update unit_price as prices are
    # confirmed. Null for line items on standalone (non-order) invoices.
    order_item = models.ForeignKey(
        "orders.OrderItem", on_delete=models.SET_NULL, null=True, blank=True, related_name="invoice_lines"
    )
    description = models.CharField(max_length=500)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.description} x{self.quantity}"

    @property
    def total(self):
        return self.quantity * self.unit_price


class Payment(models.Model):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="payments")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    note = models.CharField(max_length=500, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.RESTRICT, related_name="recorded_payments"
    )
    paid_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-paid_at"]

    def __str__(self):
        return f"{self.invoice.invoice_number} — {self.amount}"
```

- [ ] **Step 4: Write the migration**

```bash
py manage.py makemigrations reports
```

Verify the generated migration only adds `Payment`, adds `order_item` to `InvoiceLineItem`, and widens `Invoice.status`'s `max_length`/`choices` — no data migration needed (existing invoices have zero payments, so `recompute_status()` is a no-op for them until a payment is logged).

- [ ] **Step 5: Run migration and test**

Run: `py manage.py migrate reports` then `py manage.py test reports.tests.InvoiceRecomputeStatusTests -v 2` (from `backend/`)
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/reports/models.py backend/reports/migrations/ backend/reports/tests.py
git commit -m "Add Payment model and status auto-computation to Invoice"
```

---

### Task 2: Auto-create invoice at order creation, sync line items on price confirmation, Log Payment endpoint

**Files:**
- Create: `backend/reports/services.py`
- Modify: `backend/reports/views.py`
- Modify: `backend/reports/urls.py`
- Modify: `backend/orders/views.py`
- Test: `backend/reports/tests.py`, `backend/orders/tests.py`

**Interfaces:**
- Consumes: `Invoice.recompute_status()`, `Payment` (Task 1).
- Produces: `reports.services.create_invoice_for_order(order, user, advance_payment=None) -> Invoice`, `reports.services.sync_invoice_line_items(order) -> None`. New endpoint `POST /api/reports/invoices/<pk>/payments/` (Director only, body `{amount, note}`). `_invoice_payload` gains `"payments"`, `"total_paid"`, `"balance_remaining"`.

- [ ] **Step 1: Write failing tests**

```python
# backend/orders/tests.py — add to OrderCreateMultiItemTests
    def test_create_order_auto_creates_invoice_with_advance_payment(self):
        from reports.models import Invoice

        payload = {
            "customer_name": "Amina Yusuf",
            "customer_phone": "+255700000000",
            "delivery_date": "2026-08-01",
            "advance_payment": "50000",
            "items": json.dumps([
                {"name": "Sofa", "quoted_price": "500000"},
                {"name": "Coffee Table", "quoted_price": "150000"},
            ]),
        }
        resp = self.client_api.post("/api/orders/", payload, format="multipart")
        self.assertEqual(resp.status_code, 201, resp.data)

        inv = Invoice.objects.get(order_id=resp.data["id"])
        self.assertEqual(inv.line_items.count(), 2)
        self.assertEqual(inv.subtotal, 650000)
        self.assertEqual(inv.total_paid, 50000)
        self.assertEqual(inv.status, Invoice.Status.PARTIALLY_PAID)

    def test_confirm_price_syncs_invoice_line_items(self):
        from reports.models import Invoice

        payload = {
            "customer_name": "Amina Yusuf",
            "customer_phone": "+255700000000",
            "delivery_date": "2026-08-01",
            "items": json.dumps([{"name": "Sofa", "quoted_price": "500000"}]),
            "requires_approval": "true",
        }
        resp = self.client_api.post("/api/orders/", payload, format="multipart")
        order_id = resp.data["id"]
        item_id = resp.data["items"][0]["id"]

        self.client_api.force_authenticate(self.director)
        self.client_api.patch(
            f"/api/orders/{order_id}/confirm-price/",
            {"items": [{"item_id": item_id, "confirmed_price": "480000"}]},
            format="json",
        )

        inv = Invoice.objects.get(order_id=order_id)
        self.assertEqual(inv.line_items.first().unit_price, 480000)
```

```python
# backend/reports/tests.py — add
from rest_framework.test import APIClient


class LogPaymentViewTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Main", location="Town")
        self.director = User.objects.create_user(
            username="director-pay", password="x", role=User.Role.DIRECTOR
        )
        self.front_desk = User.objects.create_user(
            username="frontdesk-pay", password="x", role=User.Role.FRONT_DESK, branch=self.branch
        )
        self.invoice = Invoice.objects.create(
            invoice_number="INV-TEST-0002",
            branch=self.branch,
            customer_name="Jane",
            issue_date="2026-07-18",
            created_by=self.director,
        )
        InvoiceLineItem.objects.create(invoice=self.invoice, description="Sofa", unit_price=Decimal("100000"))
        self.client_api = APIClient()

    def test_director_logs_payment_and_status_updates(self):
        self.client_api.force_authenticate(self.director)
        resp = self.client_api.post(
            f"/api/reports/invoices/{self.invoice.id}/payments/",
            {"amount": "40000", "note": "Second installment"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["status"], "PARTIALLY_PAID")
        self.assertEqual(resp.data["total_paid"], "40000")
        self.assertEqual(len(resp.data["payments"]), 1)

    def test_non_director_forbidden_from_logging_payment(self):
        self.client_api.force_authenticate(self.front_desk)
        resp = self.client_api.post(
            f"/api/reports/invoices/{self.invoice.id}/payments/",
            {"amount": "40000"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_rejects_non_positive_amount(self):
        self.client_api.force_authenticate(self.director)
        resp = self.client_api.post(
            f"/api/reports/invoices/{self.invoice.id}/payments/",
            {"amount": "0"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py manage.py test reports orders -v 1` (from `backend/`)
Expected: FAIL — `reports.services` doesn't exist, `advance_payment` is silently dropped, no `/payments/` endpoint.

- [ ] **Step 3: Create `reports/services.py`**

```python
# backend/reports/services.py
from decimal import Decimal

from .models import Invoice, InvoiceLineItem, Payment


def _next_invoice_number():
    last = Invoice.objects.order_by("-id").first()
    seq = (last.id + 1) if last else 1
    return f"INV-{seq:06d}"


def create_invoice_for_order(order, user, advance_payment=None):
    """Auto-creates the invoice for a freshly-placed batch order: one line
    item per OrderItem (priced at quoted_price until confirmed), and — if
    the customer paid a deposit at order creation — that deposit as the
    invoice's first Payment."""
    inv = Invoice.objects.create(
        invoice_number=_next_invoice_number(),
        order=order,
        branch=order.branch,
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        issue_date=order.created_at.date(),
        created_by=user,
    )
    for item in order.items.all():
        InvoiceLineItem.objects.create(
            invoice=inv,
            order_item=item,
            description=item.name,
            unit_price=item.confirmed_price or item.quoted_price or Decimal("0"),
        )
    if advance_payment:
        Payment.objects.create(
            invoice=inv,
            amount=advance_payment,
            note="Advance payment at order creation",
            recorded_by=user,
        )
        inv.recompute_status()
    return inv


def sync_invoice_line_items(order):
    """Called whenever an order's item prices are confirmed — keeps every
    linked InvoiceLineItem's unit_price current, then re-derives the
    invoice's payment status against the new subtotal."""
    invoices = order.invoices.prefetch_related("line_items", "payments").all()
    for inv in invoices:
        for line in inv.line_items.select_related("order_item"):
            item = line.order_item
            if item is None:
                continue
            price = item.confirmed_price or item.quoted_price or Decimal("0")
            if line.unit_price != price:
                line.unit_price = price
                line.save(update_fields=["unit_price"])
        inv.recompute_status()
```

- [ ] **Step 4: Wire order creation and price confirmation in `orders/views.py`**

```python
# backend/orders/views.py — add to imports at top
from reports import services as invoice_services
```

```python
# backend/orders/views.py — inside OrderListCreateView.post, extend
# _validate_order_data() to also parse advance_payment, and call
# invoice_services.create_invoice_for_order() right after order.sync_from_items()
```

Update `_validate_order_data` to also return the parsed advance payment:

```python
def _validate_order_data(request):
    """Validate POST data and return (errors, items_data, delivery_date, advance_payment)."""
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

    advance_payment = _parse_money(data.get("advance_payment", ""), "advance_payment", errors)

    if not request.user.branch_id:
        errors["non_field"] = ["Your account has no branch assigned."]

    return errors, items_data, delivery_date, advance_payment
```

Update the two call sites and the body of `post()`:

```python
    def post(self, request):
        if request.user.role != User.Role.FRONT_DESK:
            return Response({"detail": "Front Desk role required."}, status=403)

        errors, items_data, delivery_date, advance_payment = _validate_order_data(request)
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
                    invoice_services.create_invoice_for_order(order, request.user, advance_payment)
                break
            except IntegrityError:
                if attempt == 4:
                    raise

        order.refresh_from_db()
        return Response(_order_payload(order, request), status=201)
```

And in `OrderConfirmPriceView.patch`, after the existing `order.sync_from_items()` block:

```python
        with transaction.atomic():
            for item, price in updates:
                item.confirmed_price = price
                item.save(update_fields=["confirmed_price"])
            order.sync_from_items()
            order.refresh_from_db()
            invoice_services.sync_invoice_line_items(order)
            if order.confirmed_price is not None:
                order.status = Order.Status.OPS_QUEUE
                order.save(update_fields=["status", "updated_at"])
```

- [ ] **Step 5: Add `_invoice_payload` fields, `LogPaymentView`, and URL in `reports/`**

```python
# backend/reports/views.py — imports
from decimal import Decimal, InvalidOperation
...
from .models import Invoice, InvoiceLineItem, Payment
```

```python
# backend/reports/views.py — _invoice_payload, extend the returned dict
def _invoice_payload(inv):
    return {
        "id": inv.id,
        "invoice_number": inv.invoice_number,
        "order_id": inv.order_id,
        "branch_id": inv.branch_id,
        "branch_name": inv.branch.name,
        "customer_name": inv.customer_name,
        "customer_phone": inv.customer_phone,
        "customer_address": inv.customer_address,
        "issue_date": inv.issue_date.isoformat() if inv.issue_date else None,
        "due_date": inv.due_date.isoformat() if inv.due_date else None,
        "payment_terms": inv.payment_terms,
        "notes": inv.notes,
        "status": inv.status,
        "line_items": [
            {
                "id": li.id,
                "description": li.description,
                "quantity": str(li.quantity),
                "unit_price": str(li.unit_price),
                "total": str(li.total),
            }
            for li in inv.line_items.all()
        ],
        "subtotal": str(inv.subtotal),
        "payments": [
            {
                "id": p.id,
                "amount": str(p.amount),
                "note": p.note,
                "recorded_by": p.recorded_by.get_full_name() or p.recorded_by.username,
                "paid_at": p.paid_at.isoformat(),
            }
            for p in inv.payments.all()
        ],
        "total_paid": str(inv.total_paid),
        "balance_remaining": str(inv.balance_remaining),
        "created_by": inv.created_by.get_full_name() or inv.created_by.username,
        "created_at": inv.created_at.isoformat(),
    }
```

Update the two `.prefetch_related("line_items")` call sites (`InvoiceListCreateView.get`, `InvoiceDetailView._get_invoice`) to also prefetch payments:

```python
        invoices = Invoice.objects.select_related("branch", "order", "created_by").prefetch_related("line_items", "payments").order_by("-created_at")
```

```python
    def _get_invoice(self, pk):
        return Invoice.objects.select_related("branch", "order", "created_by").prefetch_related("line_items", "payments").get(pk=pk)
```

Add the new view at the end of the invoice-endpoints section:

```python
class LogPaymentView(APIView):
    """POST /api/reports/invoices/<pk>/payments/ — Director logs a new
    installment (advance, partial, or final) against an invoice. Body:
    { "amount": <num>, "note": <str, optional> }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.role != DIRECTOR:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)

        try:
            inv = Invoice.objects.prefetch_related("line_items", "payments").get(pk=pk)
        except Invoice.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)

        raw_amount = str(request.data.get("amount", "")).strip()
        if not raw_amount:
            return Response({"errors": {"amount": [_REQUIRED]}}, status=400)
        try:
            amount = Decimal(raw_amount)
        except InvalidOperation:
            return Response({"errors": {"amount": ["Enter a valid number."]}}, status=400)
        if amount <= 0:
            return Response({"errors": {"amount": ["Must be greater than zero."]}}, status=400)

        Payment.objects.create(
            invoice=inv,
            amount=amount,
            note=str(request.data.get("note", "")).strip(),
            recorded_by=request.user,
        )
        inv.recompute_status()
        inv = self.__class__.__mro__  # placeholder removed below
```

(Replace that last malformed line — re-fetch cleanly instead:)

```python
class LogPaymentView(APIView):
    """POST /api/reports/invoices/<pk>/payments/ — Director logs a new
    installment (advance, partial, or final) against an invoice. Body:
    { "amount": <num>, "note": <str, optional> }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.role != DIRECTOR:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)

        try:
            inv = Invoice.objects.get(pk=pk)
        except Invoice.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)

        raw_amount = str(request.data.get("amount", "")).strip()
        if not raw_amount:
            return Response({"errors": {"amount": [_REQUIRED]}}, status=400)
        try:
            amount = Decimal(raw_amount)
        except InvalidOperation:
            return Response({"errors": {"amount": ["Enter a valid number."]}}, status=400)
        if amount <= 0:
            return Response({"errors": {"amount": ["Must be greater than zero."]}}, status=400)

        Payment.objects.create(
            invoice=inv,
            amount=amount,
            note=str(request.data.get("note", "")).strip(),
            recorded_by=request.user,
        )
        inv.recompute_status()

        inv = Invoice.objects.select_related("branch", "order", "created_by").prefetch_related("line_items", "payments").get(pk=pk)
        return Response(_invoice_payload(inv), status=201)
```

Add the URL:

```python
# backend/reports/urls.py — add import LogPaymentView and:
path("invoices/<int:pk>/payments/", LogPaymentView.as_view(), name="reports_log_payment"),
```

- [ ] **Step 6: Run tests**

Run: `py manage.py test reports orders -v 1` (from `backend/`)
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/reports/services.py backend/reports/views.py backend/reports/urls.py backend/reports/tests.py backend/orders/views.py backend/orders/tests.py
git commit -m "Auto-create invoice at order creation and add payment logging endpoint"
```

---

### Task 3: Frontend — `invoice-screen.tsx` Log Payment action

**Files:**
- Modify: `furniture-management-system/components/director/invoice-screen.tsx`

**Interfaces:**
- Consumes: `Invoice.payments[]`, `Invoice.total_paid`, `Invoice.balance_remaining` (Task 2), `POST /reports/invoices/<id>/payments/`.

- [ ] **Step 1: Extend the `Invoice` interface and status styling**

```tsx
// furniture-management-system/components/director/invoice-screen.tsx
interface Payment {
  id: number
  amount: string
  note: string
  recorded_by: string
  paid_at: string
}

interface Invoice {
  id: number
  invoice_number: string
  order_id: number | null
  branch_id: number
  branch_name: string
  customer_name: string
  customer_phone: string
  customer_address: string
  issue_date: string
  due_date: string | null
  payment_terms: string
  notes: string
  status: "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID"
  line_items: LineItem[]
  subtotal: string
  payments: Payment[]
  total_paid: string
  balance_remaining: string
  created_by: string
  created_at: string
}
```

```tsx
const STATUS_STYLES: Record<Invoice["status"], string> = {
  DRAFT:  "border-muted-foreground/30 text-muted-foreground",
  ISSUED: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  PARTIALLY_PAID: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  PAID:   "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300",
}
```

- [ ] **Step 2: Add a `LogPaymentDialog` component (above `InvoiceDetailDialog`)**

```tsx
function LogPaymentDialog({
  inv,
  open,
  onOpenChange,
}: {
  inv: Invoice
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const qc = useQueryClient()
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")

  const mutation = useMutation({
    mutationFn: async () => {
      await api.post(`/reports/invoices/${inv.id}/payments/`, { amount, note })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] })
      toast.success("Payment logged.")
      setAmount("")
      setNote("")
      onOpenChange(false)
    },
    onError: () => toast.error("Failed to log payment."),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Log payment — {inv.invoice_number}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Balance remaining: <span className="font-medium text-foreground">{formatMoney(inv.balance_remaining)}</span>
          </p>
          <Field>
            <FieldLabel htmlFor="pay-amount">Amount (TZS)</FieldLabel>
            <Input
              id="pay-amount"
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
              placeholder="0"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="pay-note">Note (optional)</FieldLabel>
            <Textarea id="pay-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Second installment, cash" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!amount || Number(amount) <= 0 || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Log payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Wire it into `InvoiceDetailDialog`**

```tsx
// furniture-management-system/components/director/invoice-screen.tsx
// Inside InvoiceDetailDialog: add local state and render payment history + button
function InvoiceDetailDialog({
  inv,
  open,
  onOpenChange,
}: {
  inv: Invoice | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const qc = useQueryClient()
  const [payOpen, setPayOpen] = useState(false)

  const statusMutation = useMutation({
    mutationFn: async (status: Invoice["status"]) => {
      await api.patch(`/reports/invoices/${inv!.id}/`, { status })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] })
      toast.success("Invoice status updated.")
    },
  })

  function handleDownload() {
    if (!inv) return
    generateInvoicePDF({
      invoice_number:   inv.invoice_number,
      status:           inv.status,
      branch_name:      inv.branch_name,
      customer_name:    inv.customer_name,
      customer_phone:   inv.customer_phone,
      customer_address: inv.customer_address,
      issue_date:       inv.issue_date,
      due_date:         inv.due_date,
      payment_terms:    inv.payment_terms,
      notes:            inv.notes,
      line_items:       inv.line_items,
      subtotal:         inv.subtotal,
    })
  }

  if (!inv) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl print:hidden">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{inv.invoice_number}</DialogTitle>
            <Badge variant="outline" className={cn("text-xs", STATUS_STYLES[inv.status])}>
              {inv.status.replace("_", " ")}
            </Badge>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Bill to</p>
              <p className="font-medium">{inv.customer_name}</p>
              {inv.customer_phone && <p className="text-muted-foreground">{inv.customer_phone}</p>}
              {inv.customer_address && <p className="text-muted-foreground">{inv.customer_address}</p>}
            </div>
            <div className="space-y-1 text-right">
              <div><span className="text-muted-foreground">Branch: </span>{inv.branch_name}</div>
              <div><span className="text-muted-foreground">Issue date: </span>{formatDate(inv.issue_date)}</div>
              {inv.due_date && <div><span className="text-muted-foreground">Due: </span>{formatDate(inv.due_date)}</div>}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">QTY</th>
                  <th className="px-3 py-2 text-right">Price</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {inv.line_items.map((li) => (
                  <tr key={li.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{li.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{li.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(li.unit_price)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMoney(li.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/20">
                  <td colSpan={3} className="px-3 py-2 text-right font-bold">Total Due</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{formatMoney(inv.subtotal)}</td>
                </tr>
                <tr className="border-t border-border">
                  <td colSpan={3} className="px-3 py-2 text-right text-muted-foreground">Paid</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatMoney(inv.total_paid)}</td>
                </tr>
                <tr className="border-t border-border">
                  <td colSpan={3} className="px-3 py-2 text-right font-semibold">Balance remaining</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatMoney(inv.balance_remaining)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {inv.payments.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment history</p>
              <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
                {inv.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium">{formatMoney(p.amount)}</span>
                      {p.note && <span className="ml-2 text-muted-foreground">{p.note}</span>}
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(p.paid_at)} · {p.recorded_by}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(inv.payment_terms || inv.notes) && (
            <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
              {inv.payment_terms && <div><p className="font-medium text-foreground">Payment Terms</p><p>{inv.payment_terms}</p></div>}
              {inv.notes && <div><p className="font-medium text-foreground">Notes</p><p>{inv.notes}</p></div>}
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {inv.status === "DRAFT" && (
            <Button variant="outline" size="sm" onClick={() => statusMutation.mutate("ISSUED")} disabled={statusMutation.isPending}>
              Mark as Issued
            </Button>
          )}
          {inv.status !== "PAID" && (
            <Button variant="outline" size="sm" onClick={() => setPayOpen(true)}>
              Log payment
            </Button>
          )}
          <Button size="sm" onClick={handleDownload} className="gap-1.5">
            <Download className="size-3.5" />
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>

      <LogPaymentDialog inv={inv} open={payOpen} onOpenChange={setPayOpen} />
    </Dialog>
  )
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json` (from `furniture-management-system/`)
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run the dev server preview. As Front Desk, create a batch order with an advance payment. As Director, open Invoices, confirm the new invoice shows `PARTIALLY_PAID` with the correct balance and line items named after the order's items. Click "Log payment", submit the remaining balance, confirm the badge flips to `PAID` and the payment appears in the history list.

- [ ] **Step 6: Commit**

```bash
git add furniture-management-system/components/director/invoice-screen.tsx
git commit -m "Add invoice payment logging UI to Director invoice screen"
```
