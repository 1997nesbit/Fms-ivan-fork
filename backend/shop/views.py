from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import User
from .models import Sale, ShowroomItem
from .services import record_sale, validate_and_create_item

_REQUIRED = "This field is required."
_NOT_AUTHORIZED = "Not authorized."

# Roles that can see the showroom (retail) domain at all.
_VIEW_ROLES = {User.Role.FRONT_DESK, User.Role.DIRECTOR, User.Role.OPS_MANAGER}


def _page_size(request, default=100, max_=1000):
    try:
        n = int(request.query_params.get("page_size", default))
    except (TypeError, ValueError):
        n = default
    return max(1, min(n, max_))


def _item_payload(item):
    return {
        "id": item.id,
        "sku": item.sku,
        "serial_number": item.serial_number,
        "name": item.name,
        "category": item.category,
        "description": item.description,
        "price": str(item.price),
        "status": item.status,
        "branch_id": item.branch_id,
        "branch_name": item.branch.name,
        "created_at": item.created_at.isoformat(),
    }


def _sale_payload(sale):
    return {
        "id": sale.id,
        "reference": f"SL-{sale.id:06d}",
        "item_id": sale.item_id,
        "item_sku": sale.item.sku,
        "item_name": sale.item.name,
        "sale_price": str(sale.sale_price),
        "order_type": sale.order_type,
        "sold_by_id": sale.sold_by_id,
        "sold_by_name": sale.sold_by.get_full_name() or sale.sold_by.username,
        "sold_at": sale.sold_at.isoformat(),
        "branch_id": sale.branch_id,
        "branch_name": sale.branch.name,
    }


# ---------------------------------------------------------------------------
# GET/POST /api/shop/items/
# ---------------------------------------------------------------------------

class ShowroomItemListCreateView(APIView):
    """
    GET  — list showroom items (Front Desk, Director, Ops Manager).
           Optional filters: branch_id, page_size.
    POST — add a new showroom item to the caller's branch (Front Desk only).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in _VIEW_ROLES:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)

        qs = ShowroomItem.objects.select_related("branch").order_by("-created_at")

        branch_id = request.query_params.get("branch_id")
        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        qs = qs[: _page_size(request)]
        return Response({"results": [_item_payload(i) for i in qs]})

    def post(self, request):
        if request.user.role != User.Role.FRONT_DESK:
            return Response({"detail": "Only Front Desk can add showroom items."}, status=403)

        item, errors = validate_and_create_item(request.user, request.data)
        if errors:
            return Response({"errors": errors}, status=400)

        return Response(_item_payload(item), status=201)


# ---------------------------------------------------------------------------
# GET/POST /api/shop/sales/
# ---------------------------------------------------------------------------

class SaleListCreateView(APIView):
    """
    GET  — list sales (Front Desk, Director, Ops Manager).
           Optional filters: branch_id, page_size.
    POST — record a sale for an AVAILABLE item at the caller's branch
           (Front Desk only). Marks the item SOLD.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in _VIEW_ROLES:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)

        qs = Sale.objects.select_related("item", "branch", "sold_by").order_by("-sold_at")

        branch_id = request.query_params.get("branch_id")
        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        qs = qs[: _page_size(request)]
        return Response({"results": [_sale_payload(s) for s in qs]})

    def post(self, request):
        if request.user.role != User.Role.FRONT_DESK:
            return Response({"detail": "Only Front Desk can record sales."}, status=403)

        item_id = request.data.get("item_id")
        if not item_id:
            return Response({"errors": {"item_id": [_REQUIRED]}}, status=400)

        sale, error_detail, status_code = record_sale(
            request.user, item_id, request.data.get("sale_price")
        )
        if error_detail:
            return Response({"detail": error_detail}, status=status_code)

        return Response(_sale_payload(sale), status=status_code)
