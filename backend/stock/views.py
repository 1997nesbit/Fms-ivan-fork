from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import User
from .models import InventoryItem, Issuance, MaterialRequest, RestockRequest

_REQUIRED = "This field is required."
_NOT_AUTHORIZED = "Not authorized."
_NOT_NEGATIVE = "Cannot be negative."
_VALID_NUMBER = "Enter a valid number."
_POSITIVE = "Must be greater than zero."


# ---------------------------------------------------------------------------
# Payload helpers
# ---------------------------------------------------------------------------

def _item_payload(item):
    return {
        "id": item.id,
        "name": item.name,
        "unit": item.unit,
        "current_quantity": str(item.current_quantity),
        "minimum_threshold": str(item.minimum_threshold),
        "is_low_stock": item.is_low_stock,
        "last_updated": item.last_updated.isoformat(),
    }


def _material_request_payload(req):
    tech = req.requested_by
    reviewer = req.reviewed_by
    return {
        "id": req.id,
        "stage_id": req.stage_id,
        "order_id": req.stage.order_id if req.stage else None,
        "order_reference": req.stage.order.reference_number if req.stage else None,
        "material_name": req.material_name,
        "quantity": str(req.quantity),
        "unit": req.unit,
        "status": req.status,
        "requested_by_id": req.requested_by_id,
        "requested_by_name": tech.get_full_name() or tech.username if tech else None,
        "reviewed_by_id": req.reviewed_by_id,
        "reviewed_by_name": reviewer.get_full_name() or reviewer.username if reviewer else None,
        "review_reason": req.review_reason,
        "created_at": req.created_at.isoformat(),
        "reviewed_at": req.reviewed_at.isoformat() if req.reviewed_at else None,
    }


def _issuance_payload(iss):
    return {
        "id": iss.id,
        "order_reference": iss.order.reference_number,
        "stage_id": iss.stage_id,
        "inventory_item_id": iss.inventory_item_id,
        "inventory_item_name": iss.inventory_item.name,
        "quantity_issued": str(iss.quantity_issued),
        "unit": iss.inventory_item.unit,
        "issuance_type": iss.issuance_type,
        "issued_by_id": iss.issued_by_id,
        "issued_at": iss.issued_at.isoformat(),
    }


def _restock_payload(req):
    user = req.requested_by
    reviewer = req.reviewed_by
    return {
        "id": req.id,
        "inventory_item_id": req.inventory_item_id,
        "item_name": req.item_name,
        "quantity_needed": str(req.quantity_needed),
        "unit": req.unit,
        "estimated_cost": str(req.estimated_cost) if req.estimated_cost is not None else None,
        "reason": req.reason,
        "status": req.status,
        "requested_by_id": req.requested_by_id,
        "requested_by_name": user.get_full_name() or user.username if user else None,
        "reviewed_by_id": req.reviewed_by_id,
        "reviewed_by_name": reviewer.get_full_name() or reviewer.username if reviewer else None,
        "review_notes": req.review_notes,
        "created_at": req.created_at.isoformat(),
        "reviewed_at": req.reviewed_at.isoformat() if req.reviewed_at else None,
    }


# ---------------------------------------------------------------------------
# GET /api/stock/items/
# POST /api/stock/items/
# ---------------------------------------------------------------------------

class InventoryItemListCreateView(APIView):
    """
    GET  — list all inventory items (Stock Keeper, Ops Manager, Director).
    POST — add a new item (Stock Keeper only).
    """
    permission_classes = [IsAuthenticated]

    _ALLOWED_ROLES = {User.Role.STOCK_KEEPER, User.Role.OPS_MANAGER, User.Role.DIRECTOR}

    def get(self, request):
        if request.user.role not in self._ALLOWED_ROLES:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)
        items = InventoryItem.objects.order_by("name")
        return Response({"results": [_item_payload(i) for i in items]})

    def post(self, request):
        if request.user.role != User.Role.STOCK_KEEPER:
            return Response({"detail": "Only Stock Keepers can add inventory items."}, status=403)

        errors: dict[str, list[str]] = {}
        name = str(request.data.get("name", "")).strip()
        unit = str(request.data.get("unit", "")).strip()
        if not name:
            errors["name"] = [_REQUIRED]
        if not unit:
            errors["unit"] = [_REQUIRED]

        qty = Decimal("0")
        raw_qty = str(request.data.get("current_quantity", "0")).strip()
        try:
            qty = Decimal(raw_qty)
            if qty < 0:
                errors["current_quantity"] = [_NOT_NEGATIVE]
        except InvalidOperation:
            errors["current_quantity"] = [_VALID_NUMBER]

        threshold = Decimal("0")
        raw_thr = str(request.data.get("minimum_threshold", "0")).strip()
        try:
            threshold = Decimal(raw_thr)
            if threshold < 0:
                errors["minimum_threshold"] = [_NOT_NEGATIVE]
        except InvalidOperation:
            errors["minimum_threshold"] = [_VALID_NUMBER]

        if errors:
            return Response({"errors": errors}, status=400)

        item = InventoryItem.objects.create(
            name=name, unit=unit,
            current_quantity=qty, minimum_threshold=threshold,
        )
        return Response(_item_payload(item), status=201)


# ---------------------------------------------------------------------------
# PATCH /api/stock/items/<pk>/
# ---------------------------------------------------------------------------

class InventoryItemDetailView(APIView):
    """PATCH — update quantity or threshold (Stock Keeper only)."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if request.user.role != User.Role.STOCK_KEEPER:
            return Response({"detail": "Only Stock Keepers can update inventory."}, status=403)

        try:
            item = InventoryItem.objects.get(pk=pk)
        except InventoryItem.DoesNotExist:
            return Response({"detail": "Item not found."}, status=404)

        errors: dict[str, list[str]] = {}
        update_fields = []

        if "name" in request.data:
            val = str(request.data["name"]).strip()
            if not val:
                errors["name"] = ["Cannot be blank."]
            else:
                item.name = val
                update_fields.append("name")

        if "unit" in request.data:
            val = str(request.data["unit"]).strip()
            if not val:
                errors["unit"] = ["Cannot be blank."]
            else:
                item.unit = val
                update_fields.append("unit")

        for field in ("current_quantity", "minimum_threshold"):
            if field in request.data:
                try:
                    val = Decimal(str(request.data[field]))
                    if val < 0:
                        raise InvalidOperation
                    setattr(item, field, val)
                    update_fields.append(field)
                except InvalidOperation:
                    errors[field] = ["Enter a valid non-negative number."]

        if errors:
            return Response({"errors": errors}, status=400)

        if update_fields:
            item.save(update_fields=update_fields)

        return Response(_item_payload(item))


# ---------------------------------------------------------------------------
# Material requests (technician -> ops manager -> stock keeper)
# ---------------------------------------------------------------------------

class MaterialRequestListCreateView(APIView):
    """
    GET  — Technician sees own; Ops Manager sees all PENDING; Stock Keeper sees APPROVED.
    POST — Technician submits extra-material request.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = MaterialRequest.objects.select_related(
            "stage__order", "requested_by", "reviewed_by"
        ).order_by("-created_at")

        if request.user.role == User.Role.TECHNICIAN:
            qs = qs.filter(requested_by=request.user)
        elif request.user.role == User.Role.OPS_MANAGER:
            status_f = request.query_params.get("status", "PENDING")
            qs = qs.filter(status=status_f)
        elif request.user.role == User.Role.STOCK_KEEPER:
            qs = qs.filter(status=MaterialRequest.Status.APPROVED)
        elif request.user.role == User.Role.DIRECTOR:
            pass  # Director sees all — no extra filter needed
        else:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)

        return Response({"results": [_material_request_payload(r) for r in qs]})

    def post(self, request):
        if request.user.role != User.Role.TECHNICIAN:
            return Response({"detail": "Only Technicians can submit material requests."}, status=403)

        from production.models import ProductionStage
        errors: dict[str, list[str]] = {}

        stage_id = request.data.get("stage_id")
        material_name = str(request.data.get("material_name", "")).strip()
        unit = str(request.data.get("unit", "")).strip()

        if not stage_id:
            errors["stage_id"] = [_REQUIRED]
        if not material_name:
            errors["material_name"] = [_REQUIRED]
        if not unit:
            errors["unit"] = [_REQUIRED]

        qty = None
        raw_qty = str(request.data.get("quantity", "")).strip()
        if not raw_qty:
            errors["quantity"] = [_REQUIRED]
        else:
            try:
                qty = Decimal(raw_qty)
                if qty <= 0:
                    errors["quantity"] = [_POSITIVE]
            except InvalidOperation:
                errors["quantity"] = [_VALID_NUMBER]

        if errors:
            return Response({"errors": errors}, status=400)

        try:
            stage = ProductionStage.objects.select_related("order").get(
                pk=stage_id, assigned_technician=request.user
            )
        except ProductionStage.DoesNotExist:
            return Response({"detail": "Stage not found or not assigned to you."}, status=404)

        req = MaterialRequest.objects.create(
            stage=stage,
            requested_by=request.user,
            material_name=material_name,
            quantity=qty,
            unit=unit,
        )
        req = MaterialRequest.objects.select_related(
            "stage__order", "requested_by", "reviewed_by"
        ).get(pk=req.pk)
        return Response(_material_request_payload(req), status=201)


# ---------------------------------------------------------------------------
# PATCH /api/stock/material-requests/<pk>/review/
# ---------------------------------------------------------------------------

class MaterialRequestReviewView(APIView):
    """PATCH — Ops Manager approves or rejects a pending material request."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if request.user.role != User.Role.OPS_MANAGER:
            return Response({"detail": "Only Ops Managers can review material requests."}, status=403)

        try:
            req = MaterialRequest.objects.select_related(
                "stage__order", "requested_by", "reviewed_by"
            ).get(pk=pk, status=MaterialRequest.Status.PENDING)
        except MaterialRequest.DoesNotExist:
            return Response({"detail": "Pending request not found."}, status=404)

        action = str(request.data.get("action", "")).strip().upper()
        if action not in ("APPROVE", "REJECT"):
            return Response({"errors": {"action": ["Must be 'APPROVE' or 'REJECT'."]}}, status=400)

        req.reviewed_by = request.user
        req.review_reason = str(request.data.get("review_reason", "")).strip()
        req.reviewed_at = timezone.now()
        req.status = (
            MaterialRequest.Status.APPROVED if action == "APPROVE"
            else MaterialRequest.Status.REJECTED
        )
        req.save(update_fields=["status", "reviewed_by", "review_reason", "reviewed_at"])
        return Response(_material_request_payload(req))


# ---------------------------------------------------------------------------
# POST /api/stock/issuances/
# GET  /api/stock/issuances/
# ---------------------------------------------------------------------------

class IssuanceListCreateView(APIView):
    """
    POST — Stock Keeper issues materials against an order/stage.
    GET  — list issuance records.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in (User.Role.STOCK_KEEPER, User.Role.OPS_MANAGER, User.Role.DIRECTOR):
            return Response({"detail": _NOT_AUTHORIZED}, status=403)
        qs = Issuance.objects.select_related(
            "order", "inventory_item", "issued_by"
        ).order_by("-issued_at")
        return Response({"results": [_issuance_payload(i) for i in qs]})

    def post(self, request):
        if request.user.role != User.Role.STOCK_KEEPER:
            return Response({"detail": "Only Stock Keepers can issue materials."}, status=403)

        from orders.models import Order as OrderModel
        errors: dict[str, list[str]] = {}

        order_id = request.data.get("order_id")
        item_id = request.data.get("inventory_item_id")

        if not order_id:
            errors["order_id"] = [_REQUIRED]
        if not item_id:
            errors["inventory_item_id"] = [_REQUIRED]

        qty = None
        raw_qty = str(request.data.get("quantity_issued", "")).strip()
        if not raw_qty:
            errors["quantity_issued"] = [_REQUIRED]
        else:
            try:
                qty = Decimal(raw_qty)
                if qty <= 0:
                    errors["quantity_issued"] = [_POSITIVE]
            except InvalidOperation:
                errors["quantity_issued"] = [_VALID_NUMBER]

        if errors:
            return Response({"errors": errors}, status=400)

        try:
            order = OrderModel.objects.get(pk=order_id)
        except OrderModel.DoesNotExist:
            return Response({"detail": "Order not found."}, status=404)

        try:
            inv_item = InventoryItem.objects.select_for_update().get(pk=item_id)
        except InventoryItem.DoesNotExist:
            return Response({"detail": "Inventory item not found."}, status=404)

        if inv_item.current_quantity < qty:
            return Response(
                {"detail": f"Insufficient stock: {inv_item.current_quantity} {inv_item.unit} available."},
                status=400,
            )

        stage_id = request.data.get("stage_id")
        issuance_type = str(request.data.get("issuance_type", "INITIAL")).strip().upper()
        if issuance_type not in ("INITIAL", "ADDITIONAL"):
            issuance_type = "INITIAL"

        with transaction.atomic():
            inv_item.current_quantity -= qty
            inv_item.save(update_fields=["current_quantity"])
            iss = Issuance.objects.create(
                order=order,
                stage_id=stage_id or None,
                inventory_item=inv_item,
                quantity_issued=qty,
                issued_by=request.user,
                issuance_type=issuance_type,
            )

        iss = Issuance.objects.select_related("order", "inventory_item", "issued_by").get(pk=iss.pk)
        return Response(_issuance_payload(iss), status=201)


# ---------------------------------------------------------------------------
# GET/POST /api/stock/restock-requests/
# PATCH    /api/stock/restock-requests/<pk>/review/
# ---------------------------------------------------------------------------

class RestockRequestListCreateView(APIView):
    """
    POST — Stock Keeper requests restock funds from Director.
    GET  — Stock Keeper sees own; Director sees all.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in (User.Role.STOCK_KEEPER, User.Role.DIRECTOR):
            return Response({"detail": _NOT_AUTHORIZED}, status=403)

        qs = RestockRequest.objects.select_related(
            "inventory_item", "requested_by", "reviewed_by"
        ).order_by("-created_at")

        if request.user.role == User.Role.STOCK_KEEPER:
            qs = qs.filter(requested_by=request.user)
        else:
            status_f = request.query_params.get("status")
            if status_f:
                qs = qs.filter(status=status_f)

        return Response({"results": [_restock_payload(r) for r in qs]})

    def post(self, request):
        if request.user.role != User.Role.STOCK_KEEPER:
            return Response({"detail": "Only Stock Keepers can request restock funds."}, status=403)

        errors: dict[str, list[str]] = {}
        item_name = str(request.data.get("item_name", "")).strip()
        unit = str(request.data.get("unit", "")).strip()

        if not item_name:
            errors["item_name"] = [_REQUIRED]
        if not unit:
            errors["unit"] = [_REQUIRED]

        qty_needed = None
        raw_qty = str(request.data.get("quantity_needed", "")).strip()
        if not raw_qty:
            errors["quantity_needed"] = [_REQUIRED]
        else:
            try:
                qty_needed = Decimal(raw_qty)
                if qty_needed <= 0:
                    errors["quantity_needed"] = [_POSITIVE]
            except InvalidOperation:
                errors["quantity_needed"] = [_VALID_NUMBER]

        estimated_cost = None
        raw_cost = str(request.data.get("estimated_cost", "")).strip()
        if raw_cost:
            try:
                estimated_cost = Decimal(raw_cost)
                if estimated_cost < 0:
                    errors["estimated_cost"] = [_NOT_NEGATIVE]
            except InvalidOperation:
                errors["estimated_cost"] = [_VALID_NUMBER]

        if errors:
            return Response({"errors": errors}, status=400)

        inventory_item_id = request.data.get("inventory_item_id")
        req = RestockRequest.objects.create(
            inventory_item_id=inventory_item_id or None,
            item_name=item_name,
            quantity_needed=qty_needed,
            unit=unit,
            estimated_cost=estimated_cost,
            reason=str(request.data.get("reason", "")).strip(),
            requested_by=request.user,
        )
        req = RestockRequest.objects.select_related(
            "inventory_item", "requested_by", "reviewed_by"
        ).get(pk=req.pk)
        return Response(_restock_payload(req), status=201)


class RestockRequestReviewView(APIView):
    """PATCH /api/stock/restock-requests/<pk>/review/ — Director approves/rejects."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if request.user.role != User.Role.DIRECTOR:
            return Response({"detail": "Only Directors can review restock requests."}, status=403)

        try:
            req = RestockRequest.objects.select_related(
                "inventory_item", "requested_by", "reviewed_by"
            ).get(pk=pk, status=RestockRequest.Status.PENDING)
        except RestockRequest.DoesNotExist:
            return Response({"detail": "Pending request not found."}, status=404)

        action = str(request.data.get("action", "")).strip().upper()
        if action not in ("APPROVE", "REJECT"):
            return Response({"errors": {"action": ["Must be 'APPROVE' or 'REJECT'."]}}, status=400)

        req.reviewed_by = request.user
        req.review_notes = str(request.data.get("review_notes", "")).strip()
        req.reviewed_at = timezone.now()
        req.status = (
            RestockRequest.Status.APPROVED if action == "APPROVE"
            else RestockRequest.Status.REJECTED
        )
        req.save(update_fields=["status", "reviewed_by", "review_notes", "reviewed_at"])
        return Response(_restock_payload(req))


class TechnicianListView(APIView):
    """GET /api/stock/technicians/ — list technicians for the stage assignment picker."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in (User.Role.OPS_MANAGER, User.Role.DIRECTOR):
            return Response({"detail": _NOT_AUTHORIZED}, status=403)
        users = User.objects.filter(role=User.Role.TECHNICIAN).order_by("first_name", "last_name")
        return Response({
            "results": [
                {"id": u.id, "name": u.get_full_name() or u.username}
                for u in users
            ]
        })
