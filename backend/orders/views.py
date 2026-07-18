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

        # Front desk can only see their own branch
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

        # Reference numbers are generated from a row count, so under concurrent
        # requests two submissions can race for the same number; retry on the
        # resulting unique-constraint clash rather than fail the request.
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
