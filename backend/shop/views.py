from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import User

from .models import Sale


def _sale_payload(sale):
    return {
        "id": sale.id,
        "reference": f"SALE-{sale.id:05d}",
        "item_sku": sale.item.sku,
        "item_name": sale.item.name,
        "sale_price": str(sale.sale_price),
        "order_type": sale.order_type,
        "sold_by_name": sale.sold_by.get_full_name() or sale.sold_by.username,
        "sold_at": sale.sold_at.isoformat(),
        "branch_id": sale.branch_id,
        "branch_name": sale.branch.name,
    }


class SaleListView(APIView):
    """GET /api/shop/sales/ — Director-only list of all showroom sales."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != User.Role.DIRECTOR:
            return Response({"detail": "Director role required."}, status=403)

        sales = (
            Sale.objects
            .select_related("item", "branch", "sold_by")
            .order_by("-sold_at")
        )
        return Response({"results": [_sale_payload(s) for s in sales]})
