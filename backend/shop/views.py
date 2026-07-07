from django.db.models import Count, Q
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import User
from .models import Category, CatalogueProduct, ItemType, Quote, Room, Sale, ShowroomItem
from .services import (
    approve_quote,
    convert_quote,
    create_catalogue_product,
    create_category,
    create_item_type,
    create_quote,
    create_room,
    discontinue_item,
    record_sale,
    reject_quote,
    restock_item,
    set_image_cover,
    update_catalogue_product,
    update_category,
    update_item_price,
    update_item_type,
    update_room,
    validate_and_create_item,
)

_NOT_AUTHORIZED = "Not authorized."

# Roles that can view the showroom domain.
_VIEW_ROLES = {User.Role.FRONT_DESK, User.Role.DIRECTOR, User.Role.OPS_MANAGER}


def _page_size(request, default=100, max_=1000):
    try:
        n = int(request.query_params.get("page_size", default))
    except (TypeError, ValueError):
        n = default
    return max(1, min(n, max_))


def _item_payload(item, request=None):
    images = []
    for img in item.images.all():
        url = img.image.url
        if request is not None:
            url = request.build_absolute_uri(url)
        images.append({"id": img.id, "image": url})

    return {
        "id":            item.id,
        "sku":           item.sku,
        "name":          item.name,
        "category_id":   item.category_id,
        "category":      item.category.name if item.category_id else "",
        "description":   item.description,
        "price":       str(item.price),
        "quantity":    item.quantity,
        "status":      item.status,
        "is_set":          item.is_set,
        "is_discontinued": item.is_discontinued,
        "branch_id":   item.branch_id,
        "branch_name": item.branch.name,
        "branch_code": item.branch.code,
        "images":      images,
        "created_at":  item.created_at.isoformat(),
    }


def _sale_payload(sale):
    return {
        "id":            sale.id,
        "reference":     f"SL-{sale.id:06d}",
        "item_id":       sale.item_id,
        "item_sku":      sale.item.sku,
        "item_name":     sale.item.name,
        "sale_price":    str(sale.sale_price),
        "quantity_sold": sale.quantity_sold,
        "order_type":    sale.order_type,
        "sold_by_id":    sale.sold_by_id,
        "sold_by_name":  sale.sold_by.get_full_name() or sale.sold_by.username,
        "sold_at":       sale.sold_at.isoformat(),
        "branch_id":     sale.branch_id,
        "branch_name":   sale.branch.name,
    }


# ---------------------------------------------------------------------------
# GET/POST /api/shop/items/
# ---------------------------------------------------------------------------

class ShowroomItemListCreateView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes     = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        if request.user.role not in _VIEW_ROLES:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)

        qs = (
            ShowroomItem.objects
            .select_related("branch", "category")
            .prefetch_related("images")
            .order_by("-created_at")
        )

        branch_id = request.query_params.get("branch_id")
        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        # By default hide discontinued items; pass ?include_discontinued=1 to include them
        if request.query_params.get("include_discontinued") != "1":
            qs = qs.filter(is_discontinued=False)

        qs = qs[: _page_size(request)]
        return Response({"results": [_item_payload(i, request) for i in qs]})

    def post(self, request):
        if request.user.role != User.Role.FRONT_DESK:
            return Response({"detail": "Only Front Desk can add showroom items."}, status=403)

        item, errors = validate_and_create_item(
            request.user,
            request.data,
            images=request.FILES.getlist("images"),
        )
        if errors:
            return Response({"errors": errors}, status=400)

        # Refresh to load the newly created images
        item.refresh_from_db()
        item.images.all()  # warm the prefetch
        return Response(_item_payload(item, request), status=201)


# ---------------------------------------------------------------------------
# GET/POST /api/shop/sales/
# ---------------------------------------------------------------------------

class SaleListCreateView(APIView):
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
            return Response({"errors": {"item_id": ["This field is required."]}}, status=400)

        sale, error_detail, status_code = record_sale(
            request.user,
            item_id,
            request.data.get("sale_price"),
            request.data.get("quantity_sold", 1),
        )
        if error_detail:
            return Response({"detail": error_detail}, status=status_code)

        return Response(_sale_payload(sale), status=status_code)


# ---------------------------------------------------------------------------
# POST /api/shop/items/<pk>/restock/
# ---------------------------------------------------------------------------

class RestockItemView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.role != User.Role.FRONT_DESK:
            return Response({"detail": "Only Front Desk can restock items."}, status=403)

        item, error_detail, status_code = restock_item(
            request.user, pk, request.data.get("quantity")
        )
        if error_detail:
            return Response({"detail": error_detail}, status=status_code)

        item.refresh_from_db()
        return Response(_item_payload(item, request), status=200)


# ---------------------------------------------------------------------------
# PATCH /api/shop/items/<pk>/price/
# ---------------------------------------------------------------------------

class UpdateItemPriceView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if request.user.role != User.Role.FRONT_DESK:
            return Response({"detail": "Only Front Desk can correct item prices."}, status=403)

        item, error_detail, status_code = update_item_price(
            request.user, pk, request.data.get("price")
        )
        if error_detail:
            return Response({"detail": error_detail}, status=status_code)

        item.refresh_from_db()
        return Response(_item_payload(item, request), status=200)


# ---------------------------------------------------------------------------
# POST /api/shop/items/<pk>/discontinue/
# ---------------------------------------------------------------------------

class DiscontinueItemView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.role != User.Role.FRONT_DESK:
            return Response({"detail": "Only Front Desk can discontinue items."}, status=403)

        item, error_detail, status_code = discontinue_item(request.user, pk)
        if error_detail:
            return Response({"detail": error_detail}, status=status_code)

        return Response(_item_payload(item, request), status=200)


# ---------------------------------------------------------------------------
# Category helpers
# ---------------------------------------------------------------------------

def _category_payload(cat):
    return {
        "id":         cat.id,
        "name":       cat.name,
        "is_active":  cat.is_active,
        "item_count": getattr(cat, "item_count", 0),
    }

_DIRECTOR_ROLES = {User.Role.DIRECTOR}


# ---------------------------------------------------------------------------
# GET /api/shop/categories/   POST /api/shop/categories/
# ---------------------------------------------------------------------------

class CategoryListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in _VIEW_ROLES:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)

        qs = Category.objects.annotate(
            item_count=Count("items", filter=Q(items__is_discontinued=False))
        )
        if request.query_params.get("active_only") == "1":
            qs = qs.filter(is_active=True)

        return Response([_category_payload(c) for c in qs])

    def post(self, request):
        if request.user.role not in _DIRECTOR_ROLES:
            return Response({"detail": "Only Director can manage categories."}, status=403)

        cat, errors = create_category(request.data.get("name", ""))
        if errors:
            return Response({"errors": errors}, status=400)

        cat.item_count = 0
        return Response(_category_payload(cat), status=201)


# ---------------------------------------------------------------------------
# PATCH /api/shop/categories/<pk>/
# ---------------------------------------------------------------------------

class CategoryDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if request.user.role not in _DIRECTOR_ROLES:
            return Response({"detail": "Only Director can manage categories."}, status=403)

        raw_active = request.data.get("is_active")
        is_active = None
        if raw_active is not None:
            is_active = str(raw_active).lower() in ("true", "1", "yes")

        cat, error_detail, status_code = update_category(
            pk,
            name=request.data.get("name"),
            is_active=is_active,
        )
        if error_detail:
            return Response({"detail": error_detail}, status=status_code)

        cat.item_count = cat.items.filter(is_discontinued=False).count()
        return Response(_category_payload(cat))


# ---------------------------------------------------------------------------
# POST /api/shop/items/<pk>/images/<img_pk>/set-cover/
# ---------------------------------------------------------------------------

class SetImageCoverView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, img_pk):
        if request.user.role != User.Role.FRONT_DESK:
            return Response({"detail": "Only Front Desk can reorder item images."}, status=403)

        item, error_detail, status_code = set_image_cover(request.user, pk, img_pk)
        if error_detail:
            return Response({"detail": error_detail}, status=status_code)

        item.refresh_from_db()
        return Response(_item_payload(item, request), status=200)


# ---------------------------------------------------------------------------
# Room and ItemType helpers
# ---------------------------------------------------------------------------

def _room_payload(room):
    item_count = ShowroomItem.objects.filter(sku__startswith=f"{room.code}-").count()
    return {
        "id": room.id, "name": room.name, "code": room.code,
        "is_active": room.is_active, "item_count": item_count,
    }


def _item_type_payload(it):
    item_count = ShowroomItem.objects.filter(sku__iregex=rf"^[A-Z]+-{it.code}-").count()
    return {
        "id": it.id, "name": it.name, "code": it.code,
        "is_active": it.is_active, "item_count": item_count,
    }


def _parse_active(raw):
    if raw is None:
        return None
    return str(raw).lower() in ("true", "1", "yes")


# ---------------------------------------------------------------------------
# GET/POST /api/shop/rooms/   PATCH /api/shop/rooms/<pk>/
# ---------------------------------------------------------------------------

class RoomListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in _VIEW_ROLES:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)
        qs = Room.objects.all()
        if request.query_params.get("active_only") == "1":
            qs = qs.filter(is_active=True)
        return Response([_room_payload(r) for r in qs])

    def post(self, request):
        if request.user.role not in _DIRECTOR_ROLES:
            return Response({"detail": "Only Director can manage rooms."}, status=403)
        room, errors = create_room(
            request.data.get("name", ""),
            request.data.get("code", ""),
        )
        if errors:
            return Response({"errors": errors}, status=400)
        return Response(_room_payload(room), status=201)


class RoomDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if request.user.role not in _DIRECTOR_ROLES:
            return Response({"detail": "Only Director can manage rooms."}, status=403)
        room, error_detail, status_code = update_room(
            pk,
            name=request.data.get("name"),
            is_active=_parse_active(request.data.get("is_active")),
        )
        if error_detail:
            return Response({"detail": error_detail}, status=status_code)
        return Response(_room_payload(room))


# ---------------------------------------------------------------------------
# GET/POST /api/shop/item-types/   PATCH /api/shop/item-types/<pk>/
# ---------------------------------------------------------------------------

class ItemTypeListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in _VIEW_ROLES:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)
        qs = ItemType.objects.all()
        if request.query_params.get("active_only") == "1":
            qs = qs.filter(is_active=True)
        return Response([_item_type_payload(t) for t in qs])

    def post(self, request):
        if request.user.role not in _DIRECTOR_ROLES:
            return Response({"detail": "Only Director can manage item types."}, status=403)
        item_type, errors = create_item_type(
            request.data.get("name", ""),
            request.data.get("code", ""),
        )
        if errors:
            return Response({"errors": errors}, status=400)
        return Response(_item_type_payload(item_type), status=201)


class ItemTypeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if request.user.role not in _DIRECTOR_ROLES:
            return Response({"detail": "Only Director can manage item types."}, status=403)
        item_type, error_detail, status_code = update_item_type(
            pk,
            name=request.data.get("name"),
            is_active=_parse_active(request.data.get("is_active")),
        )
        if error_detail:
            return Response({"detail": error_detail}, status=status_code)
        return Response(_item_type_payload(item_type))


# ---------------------------------------------------------------------------
# Catalogue
# ---------------------------------------------------------------------------

def _catalogue_payload(product, request=None):
    photo_url = None
    if product.photo:
        photo_url = request.build_absolute_uri(product.photo.url) if request else product.photo.url
    return {
        "id":          product.id,
        "name":        product.name,
        "category_id": product.category_id,
        "category":    product.category.name if product.category_id else "",
        "description": product.description,
        "min_price":   str(product.min_price),
        "max_price":   str(product.max_price),
        "photo":       photo_url,
        "is_active":   product.is_active,
        "created_at":  product.created_at.isoformat(),
    }


class CatalogueListCreateView(APIView):
    """
    GET  /api/shop/catalogue/  — list active products (Front Desk, Director, Ops)
    POST /api/shop/catalogue/  — create product (Director only)
    """
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in _VIEW_ROLES:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)
        qs = CatalogueProduct.objects.select_related("category").filter(is_active=True)
        return Response([_catalogue_payload(p, request) for p in qs])

    def post(self, request):
        if request.user.role != User.Role.DIRECTOR:
            return Response({"detail": "Director role required."}, status=403)
        product, errors = create_catalogue_product(request.data, photo=request.FILES.get("photo"))
        if errors:
            return Response({"errors": errors}, status=400)
        return Response(_catalogue_payload(product, request), status=201)


class CatalogueDetailView(APIView):
    """
    PATCH  /api/shop/catalogue/<pk>/  — update product (Director only)
    DELETE /api/shop/catalogue/<pk>/  — deactivate product (Director only)
    """
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if request.user.role != User.Role.DIRECTOR:
            return Response({"detail": "Director role required."}, status=403)
        product, error_detail, status_code = update_catalogue_product(
            pk, request.data, photo=request.FILES.get("photo")
        )
        if error_detail:
            return Response({"detail": error_detail} if isinstance(error_detail, str) else {"errors": error_detail}, status=status_code)
        return Response(_catalogue_payload(product, request))

    def delete(self, request, pk):
        if request.user.role != User.Role.DIRECTOR:
            return Response({"detail": "Director role required."}, status=403)
        try:
            product = CatalogueProduct.objects.get(pk=pk)
        except CatalogueProduct.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)
        product.is_active = False
        product.save(update_fields=["is_active"])
        return Response(status=204)


# ---------------------------------------------------------------------------
# Quotes
# ---------------------------------------------------------------------------

def _quote_payload(quote, request=None):
    return {
        "id":                  quote.id,
        "reference":           f"Q-{quote.id:04d}",
        "branch_id":           quote.branch_id,
        "created_by_id":       quote.created_by_id,
        "customer_name":       quote.customer_name,
        "customer_phone":      quote.customer_phone,
        "catalogue_item_id":   quote.catalogue_item_id,
        "product_name":        quote.product_name,
        "size":                quote.size,
        "ref_min":             str(quote.ref_min),
        "ref_max":             str(quote.ref_max),
        "quoted_price":        str(quote.quoted_price),
        "within_range":        quote.within_range,
        "notes":               quote.notes,
        "status":              quote.status,
        "director_note":       quote.director_note,
        "decided_at":          quote.decided_at.isoformat() if quote.decided_at else None,
        "converted_order_id":  quote.converted_order_id,
        "created_at":          quote.created_at.isoformat(),
    }


class QuoteListCreateView(APIView):
    """
    GET  /api/shop/quotes/  — list quotes scoped by role
    POST /api/shop/quotes/  — create quote (Front Desk only)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Quote.objects.select_related("branch", "created_by").order_by("-created_at")
        if request.user.role == User.Role.FRONT_DESK:
            qs = qs.filter(branch=request.user.branch)
        elif request.user.role not in {User.Role.DIRECTOR, User.Role.OPS_MANAGER}:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)

        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        return Response([_quote_payload(q) for q in qs])

    def post(self, request):
        if request.user.role != User.Role.FRONT_DESK:
            return Response({"detail": "Front Desk role required."}, status=403)
        quote, errors = create_quote(request.user, request.data)
        if errors:
            return Response({"errors": errors}, status=400)
        return Response(_quote_payload(quote), status=201)


class QuoteApproveView(APIView):
    """POST /api/shop/quotes/<pk>/approve/  — Director approves."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        quote, error_detail, status_code = approve_quote(
            request.user, pk, director_note=request.data.get("director_note", "")
        )
        if error_detail:
            return Response({"detail": error_detail}, status=status_code)
        return Response(_quote_payload(quote))


class QuoteRejectView(APIView):
    """POST /api/shop/quotes/<pk>/reject/  — Director rejects."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        quote, error_detail, status_code = reject_quote(
            request.user, pk, director_note=request.data.get("director_note", "")
        )
        if error_detail:
            return Response({"detail": error_detail}, status=status_code)
        return Response(_quote_payload(quote))


class QuoteConvertView(APIView):
    """POST /api/shop/quotes/<pk>/convert/  — Front Desk converts approved quote to order."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.role != User.Role.FRONT_DESK:
            return Response({"detail": "Front Desk role required."}, status=403)
        quote, error_detail, status_code = convert_quote(request.user, pk)
        if error_detail:
            return Response({"detail": error_detail}, status=status_code)
        return Response(_quote_payload(quote), status=status_code)
