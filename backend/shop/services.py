from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction

from .models import Category, CatalogueProduct, ItemType, Quote, Room, Sale, ShowroomItem, ShowroomItemImage

_REQUIRED    = "This field is required."
_NO_BRANCH   = "Your account has no branch assigned."
_NOT_FOUND   = "Item not found at your branch."
_NAME_EMPTY  = "Name cannot be empty."


def _parse_price(raw):
    """Return (Decimal, error_msg). error_msg is None on success."""
    raw = str(raw).strip()
    if not raw:
        return None, _REQUIRED
    try:
        price = Decimal(raw)
    except InvalidOperation:
        return None, "Enter a valid number."
    if price <= 0:
        return None, "Must be greater than zero."
    return price, None


def _parse_quantity(raw, min_val=1):
    """Return (int, error_msg). error_msg is None on success."""
    try:
        qty = int(raw)
    except (TypeError, ValueError):
        return None, "Enter a whole number."
    if qty < min_val:
        return None, f"Must be at least {min_val}."
    return qty, None


def _next_sku_number(branch, room_code, type_code, flag):
    """Return the next unused sequence number for this SKU pattern at a branch."""
    prefix = f"{room_code}-{type_code}-{flag}"
    existing = ShowroomItem.objects.filter(
        branch=branch, sku__startswith=prefix
    ).values_list("sku", flat=True)

    max_num = 0
    for sku in existing:
        # e.g. DR-TBL-X003-A → rest after prefix is "003-A"
        rest = sku[len(prefix):]
        num_str = rest.split("-")[0]
        try:
            n = int(num_str)
            if n > max_num:
                max_num = n
        except ValueError:
            pass
    return max_num + 1


def _generate_sku(branch, room_code, type_code, flag):
    num = _next_sku_number(branch, room_code, type_code, flag)
    return f"{room_code}-{type_code}-{flag}{num:03d}-{branch.code}"


def _validate_item_fields(data, is_set):
    """Validate and parse raw item form data. Returns (parsed, errors)."""
    errors: dict[str, list[str]] = {}

    name      = str(data.get("name", "")).strip()
    room_code = str(data.get("room_code", "")).strip().upper()
    type_code = str(data.get("type_code", "")).strip().upper()

    if not name:
        errors["name"] = [_REQUIRED]
    if not room_code:
        errors["room_code"] = [_REQUIRED]
    elif not Room.objects.filter(code=room_code, is_active=True).exists():
        errors["room_code"] = [f"Unknown room '{room_code}'."]

    if not is_set:
        if not type_code:
            errors["type_code"] = [_REQUIRED]
        elif not ItemType.objects.filter(code=type_code, is_active=True).exists():
            errors["type_code"] = [f"Unknown item type '{type_code}'."]

    price, price_err = _parse_price(data.get("price", ""))
    if price_err:
        errors["price"] = [price_err]

    quantity, qty_err = _parse_quantity(data.get("quantity", 1))
    if qty_err:
        errors["quantity"] = [qty_err]

    category = None
    cat_raw = data.get("category_id") or data.get("category")
    if cat_raw:
        try:
            category = Category.objects.get(pk=int(cat_raw), is_active=True)
        except (Category.DoesNotExist, TypeError, ValueError):
            errors["category_id"] = ["Invalid or inactive category."]

    parsed = {
        "name":        name,
        "room_code":   room_code,
        "type_code":   type_code,
        "description": str(data.get("description", "")).strip(),
        "price":       price,
        "quantity":    quantity,
        "category":    category,
    }
    return parsed, errors


def validate_and_create_item(user, data, images=None):
    """Validate POST /shop/items/ payload and create a ShowroomItem.

    Returns (item, errors). On validation failure item is None.
    """
    if not user.branch_id:
        return None, {"non_field": [_NO_BRANCH]}

    is_set = str(data.get("is_set", "")).lower() in ("true", "1", "yes")
    parsed, errors = _validate_item_fields(data, is_set)
    if errors:
        return None, errors

    effective_type = "SET" if is_set else parsed["type_code"]
    sku = _generate_sku(user.branch, parsed["room_code"], effective_type, "S" if is_set else "X")

    try:
        item = ShowroomItem.objects.create(
            sku=sku,
            name=parsed["name"],
            branch=user.branch,
            category=parsed["category"],
            description=parsed["description"],
            price=parsed["price"],
            quantity=parsed["quantity"],
            is_set=is_set,
            status=ShowroomItem.Status.AVAILABLE,
        )
    except IntegrityError:
        return None, {"non_field": ["A race condition occurred. Please try again."]}

    if images:
        for i, img in enumerate(images):
            ShowroomItemImage.objects.create(item=item, image=img, display_order=i)

    return item, {}


def record_sale(user, item_id, raw_sale_price, raw_quantity_sold=1):
    """Decrement stock and record a showroom sale.

    Returns (sale, error_detail, status_code).
    """
    if not user.branch_id:
        return None, _NO_BRANCH, 400

    try:
        sale_price = Decimal(str(raw_sale_price))
        if sale_price <= 0:
            raise InvalidOperation
    except (InvalidOperation, TypeError):
        return None, "Enter a valid positive sale price.", 400

    try:
        quantity_sold = max(1, int(raw_quantity_sold))
    except (TypeError, ValueError):
        quantity_sold = 1

    with transaction.atomic():
        try:
            item = ShowroomItem.objects.select_for_update().get(
                pk=item_id, branch=user.branch
            )
        except ShowroomItem.DoesNotExist:
            return None, _NOT_FOUND, 404

        if item.status != ShowroomItem.Status.AVAILABLE:
            return None, "Item is out of stock.", 400

        if quantity_sold > item.quantity:
            return None, f"Only {item.quantity} unit(s) in stock.", 400

        item.quantity -= quantity_sold
        item.status = (
            ShowroomItem.Status.AVAILABLE
            if item.quantity > 0
            else ShowroomItem.Status.OUT_OF_STOCK
        )
        item.save(update_fields=["quantity", "status"])

        sale = Sale.objects.create(
            item=item,
            branch=item.branch,
            sale_price=sale_price,
            quantity_sold=quantity_sold,
            sold_by=user,
            order_type=Sale.OrderType.SHOP,
        )

    return sale, None, 201


def restock_item(user, item_id, raw_quantity):
    """Add stock to an existing showroom item.

    Returns (item, error_detail, status_code).
    """
    if not user.branch_id:
        return None, _NO_BRANCH, 400

    quantity, qty_err = _parse_quantity(raw_quantity)
    if qty_err:
        return None, qty_err, 400

    with transaction.atomic():
        try:
            item = ShowroomItem.objects.select_for_update().get(
                pk=item_id, branch=user.branch
            )
        except ShowroomItem.DoesNotExist:
            return None, _NOT_FOUND, 404

        item.quantity += quantity
        item.status = ShowroomItem.Status.AVAILABLE
        item.save(update_fields=["quantity", "status"])

    return item, None, 200


def update_item_price(user, item_id, raw_price):
    """Correct the price of a showroom item.

    Returns (item, error_detail, status_code).
    """
    if not user.branch_id:
        return None, _NO_BRANCH, 400

    price, price_err = _parse_price(raw_price)
    if price_err:
        return None, price_err, 400

    with transaction.atomic():
        try:
            item = ShowroomItem.objects.select_for_update().get(
                pk=item_id, branch=user.branch
            )
        except ShowroomItem.DoesNotExist:
            return None, _NOT_FOUND, 404

        item.price = price
        item.save(update_fields=["price"])

    return item, None, 200


def discontinue_item(user, item_id):
    """Mark an item as discontinued — hidden from active inventory.

    Returns (item, error_detail, status_code).
    """
    if not user.branch_id:
        return None, _NO_BRANCH, 400

    with transaction.atomic():
        try:
            item = ShowroomItem.objects.select_for_update().get(
                pk=item_id, branch=user.branch
            )
        except ShowroomItem.DoesNotExist:
            return None, _NOT_FOUND, 404

        if item.is_discontinued:
            return None, "Item is already discontinued.", 400

        item.is_discontinued = True
        item.save(update_fields=["is_discontinued"])

    return item, None, 200


# ---------------------------------------------------------------------------
# Category management
# ---------------------------------------------------------------------------

def _normalize_label(raw):
    """Strip and collapse internal whitespace."""
    return " ".join(str(raw).strip().split())


def create_category(name):
    """Create a new Category. Returns (category, errors)."""
    name = _normalize_label(name)
    if not name:
        return None, {"name": [_REQUIRED]}
    if Category.objects.filter(name__iexact=name).exists():
        return None, {"name": ["A category with this name already exists."]}
    cat = Category.objects.create(name=name)
    return cat, {}


def update_category(category_id, name=None, is_active=None):
    """Rename or toggle a Category. Returns (category, error_detail, status_code)."""
    try:
        cat = Category.objects.get(pk=category_id)
    except Category.DoesNotExist:
        return None, "Category not found.", 404

    if name is not None:
        name = _normalize_label(name)
        if not name:
            return None, _NAME_EMPTY, 400
        if Category.objects.filter(name__iexact=name).exclude(pk=category_id).exists():
            return None, "A category with this name already exists.", 400
        if cat.items.exists():
            return None, "Cannot rename a category that has items attached to it.", 400
        cat.name = name

    if is_active is not None:
        cat.is_active = bool(is_active)

    cat.save()
    return cat, None, 200


# ---------------------------------------------------------------------------
# Room management
# ---------------------------------------------------------------------------

def create_room(name, code):
    """Create a Room. Returns (room, errors)."""
    name = _normalize_label(name)
    code = _normalize_label(code).upper()
    errors: dict[str, list[str]] = {}
    if not name:
        errors["name"] = [_REQUIRED]
    if not code:
        errors["code"] = [_REQUIRED]
    if errors:
        return None, errors
    if Room.objects.filter(code=code).exists():
        return None, {"code": ["A room with this code already exists."]}
    room = Room.objects.create(name=name, code=code)
    return room, {}


def update_room(room_id, name=None, is_active=None):
    """Rename or toggle a Room. Code is immutable. Returns (room, error_detail, status_code)."""
    try:
        room = Room.objects.get(pk=room_id)
    except Room.DoesNotExist:
        return None, "Room not found.", 404

    if name is not None:
        name = _normalize_label(name)
        if not name:
            return None, _NAME_EMPTY, 400
        if ShowroomItem.objects.filter(sku__startswith=f"{room.code}-").exists():
            return None, "Cannot rename a room that has items attached to it.", 400
        room.name = name

    if is_active is not None:
        room.is_active = bool(is_active)

    room.save()
    return room, None, 200


# ---------------------------------------------------------------------------
# ItemType management
# ---------------------------------------------------------------------------

def create_item_type(name, code):
    """Create an ItemType. Returns (item_type, errors)."""
    name = _normalize_label(name)
    code = _normalize_label(code).upper()
    errors: dict[str, list[str]] = {}
    if not name:
        errors["name"] = [_REQUIRED]
    if not code:
        errors["code"] = [_REQUIRED]
    if errors:
        return None, errors
    if ItemType.objects.filter(code=code).exists():
        return None, {"code": ["An item type with this code already exists."]}
    item_type = ItemType.objects.create(name=name, code=code)
    return item_type, {}


def update_item_type(item_type_id, name=None, is_active=None):
    """Rename or toggle an ItemType. Code is immutable. Returns (item_type, error_detail, status_code)."""
    try:
        item_type = ItemType.objects.get(pk=item_type_id)
    except ItemType.DoesNotExist:
        return None, "Item type not found.", 404

    if name is not None:
        name = _normalize_label(name)
        if not name:
            return None, _NAME_EMPTY, 400
        if ShowroomItem.objects.filter(sku__iregex=rf"^[A-Z]+-{item_type.code}-").exists():
            return None, "Cannot rename an item type that has items attached to it.", 400
        item_type.name = name

    if is_active is not None:
        item_type.is_active = bool(is_active)

    item_type.save()
    return item_type, None, 200


# ---------------------------------------------------------------------------
# Catalogue product management
# ---------------------------------------------------------------------------

def create_catalogue_product(data, photo=None):
    """Create a CatalogueProduct. Returns (product, errors)."""
    errors: dict[str, list[str]] = {}

    name = _normalize_label(data.get("name", ""))
    if not name:
        errors["name"] = [_REQUIRED]

    min_price, min_err = _parse_price(data.get("min_price", ""))
    if min_err:
        errors["min_price"] = [min_err]

    max_price, max_err = _parse_price(data.get("max_price", ""))
    if max_err:
        errors["max_price"] = [max_err]

    if min_price and max_price and max_price < min_price:
        errors["max_price"] = ["Max price must be greater than or equal to min price."]

    category = None
    cat_raw = data.get("category_id") or data.get("category")
    if cat_raw:
        try:
            category = Category.objects.get(pk=int(cat_raw), is_active=True)
        except (Category.DoesNotExist, TypeError, ValueError):
            errors["category_id"] = ["Invalid or inactive category."]

    if errors:
        return None, errors

    product = CatalogueProduct.objects.create(
        name=name,
        category=category,
        description=str(data.get("description", "")).strip(),
        min_price=min_price,
        max_price=max_price,
        photo=photo,
    )
    return product, {}


def update_catalogue_product(product_id, data, photo=None):
    """Patch a CatalogueProduct. Returns (product, error_detail, status_code)."""
    try:
        product = CatalogueProduct.objects.get(pk=product_id)
    except CatalogueProduct.DoesNotExist:
        return None, "Catalogue product not found.", 404

    errors: dict[str, list[str]] = {}

    if "name" in data:
        name = _normalize_label(data["name"])
        if not name:
            errors["name"] = [_NAME_EMPTY]
        else:
            product.name = name

    if "min_price" in data:
        min_price, err = _parse_price(data["min_price"])
        if err:
            errors["min_price"] = [err]
        else:
            product.min_price = min_price

    if "max_price" in data:
        max_price, err = _parse_price(data["max_price"])
        if err:
            errors["max_price"] = [err]
        else:
            product.max_price = max_price

    if product.max_price < product.min_price:
        errors["max_price"] = ["Max price must be greater than or equal to min price."]

    if errors:
        return None, errors, 400

    if "description" in data:
        product.description = str(data["description"]).strip()

    if "is_active" in data:
        product.is_active = str(data["is_active"]).lower() in ("true", "1", "yes")

    if "category_id" in data:
        cat_raw = data["category_id"]
        if cat_raw in (None, "", "null"):
            product.category = None
        else:
            try:
                product.category = Category.objects.get(pk=int(cat_raw), is_active=True)
            except (Category.DoesNotExist, TypeError, ValueError):
                return None, "Invalid or inactive category.", 400

    if photo is not None:
        product.photo = photo

    product.save()
    return product, None, 200


# ---------------------------------------------------------------------------
# Quote management
# ---------------------------------------------------------------------------

def create_quote(user, data):
    """Create a Quote. Returns (quote, errors).

    Status is set automatically:
      - within range  → APPROVED
      - outside range → PENDING_DIRECTOR
    """
    if not user.branch_id:
        return None, {"non_field": [_NO_BRANCH]}

    errors: dict[str, list[str]] = {}

    customer_name = str(data.get("customer_name", "")).strip()
    if not customer_name:
        errors["customer_name"] = [_REQUIRED]

    product_name = str(data.get("product_name", "")).strip()
    if not product_name:
        errors["product_name"] = [_REQUIRED]

    ref_min, min_err = _parse_price(data.get("ref_min", ""))
    if min_err:
        errors["ref_min"] = [min_err]

    ref_max, max_err = _parse_price(data.get("ref_max", ""))
    if max_err:
        errors["ref_max"] = [max_err]

    quoted_price, price_err = _parse_price(data.get("quoted_price", ""))
    if price_err:
        errors["quoted_price"] = [price_err]

    catalogue_item = None
    cat_raw = data.get("catalogue_item_id")
    if cat_raw:
        try:
            catalogue_item = CatalogueProduct.objects.get(pk=int(cat_raw), is_active=True)
        except (CatalogueProduct.DoesNotExist, TypeError, ValueError):
            errors["catalogue_item_id"] = ["Catalogue product not found."]

    if errors:
        return None, errors

    within_range = ref_min <= quoted_price <= ref_max
    status = Quote.Status.APPROVED if within_range else Quote.Status.PENDING_DIRECTOR

    from django.utils import timezone
    quote = Quote.objects.create(
        branch=user.branch,
        created_by=user,
        customer_name=customer_name,
        customer_phone=str(data.get("customer_phone", "")).strip(),
        catalogue_item=catalogue_item,
        product_name=product_name,
        size=str(data.get("size", "")).strip(),
        ref_min=ref_min,
        ref_max=ref_max,
        quoted_price=quoted_price,
        within_range=within_range,
        notes=str(data.get("notes", "")).strip(),
        status=status,
        decided_at=timezone.now() if within_range else None,
    )
    return quote, {}


def approve_quote(user, quote_id, director_note=""):
    """Director approves a pending quote. Returns (quote, error_detail, status_code)."""
    from users.models import User as UserModel
    if user.role != UserModel.Role.DIRECTOR:
        return None, "Director role required.", 403

    try:
        quote = Quote.objects.get(pk=quote_id, status=Quote.Status.PENDING_DIRECTOR)
    except Quote.DoesNotExist:
        return None, "Quote not found or not pending director approval.", 404

    from django.utils import timezone
    quote.status = Quote.Status.APPROVED
    quote.director_note = str(director_note).strip()
    quote.decided_at = timezone.now()
    quote.save(update_fields=["status", "director_note", "decided_at"])
    return quote, None, 200


def reject_quote(user, quote_id, director_note):
    """Director rejects a pending quote. Returns (quote, error_detail, status_code)."""
    from users.models import User as UserModel
    if user.role != UserModel.Role.DIRECTOR:
        return None, "Director role required.", 403

    director_note = str(director_note).strip()
    if not director_note:
        return None, "A rejection note is required.", 400

    try:
        quote = Quote.objects.get(pk=quote_id, status=Quote.Status.PENDING_DIRECTOR)
    except Quote.DoesNotExist:
        return None, "Quote not found or not pending director approval.", 404

    from django.utils import timezone
    quote.status = Quote.Status.REJECTED
    quote.director_note = director_note
    quote.decided_at = timezone.now()
    quote.save(update_fields=["status", "director_note", "decided_at"])
    return quote, None, 200


def convert_quote(user, quote_id):
    """Convert an approved quote into a workshop Order. Returns (quote, error_detail, status_code)."""
    try:
        quote = Quote.objects.select_for_update().get(pk=quote_id, status=Quote.Status.APPROVED)
    except Quote.DoesNotExist:
        return None, "Quote not found or not approved.", 404

    if quote.converted_order_id:
        return None, "Quote has already been converted to an order.", 400

    from orders.models import Order
    from orders.views import _gen_reference

    for attempt in range(5):
        try:
            with transaction.atomic():
                order = Order.objects.create(
                    reference_number=_gen_reference(),
                    branch=quote.branch,
                    created_by=user,
                    customer_name=quote.customer_name,
                    customer_phone=quote.customer_phone,
                    item_description=f"{quote.product_name}"
                                     + (f" — {quote.size}" if quote.size else ""),
                    quoted_price=quote.quoted_price,
                    status=Order.Status.OPS_QUEUE,
                    notes=quote.notes,
                )
                quote.converted_order = order
                quote.save(update_fields=["converted_order"])
            break
        except Exception:
            if attempt == 4:
                raise

    return quote, None, 201


# ---------------------------------------------------------------------------
# Image cover selection
# ---------------------------------------------------------------------------

def set_image_cover(user, item_id, image_id):
    """Make image_id the cover (display_order=0) for an item at the user's branch.

    Returns (item, error_detail, status_code).
    """
    if not user.branch_id:
        return None, _NO_BRANCH, 400

    with transaction.atomic():
        try:
            item = ShowroomItem.objects.select_for_update().get(
                pk=item_id, branch=user.branch
            )
        except ShowroomItem.DoesNotExist:
            return None, _NOT_FOUND, 404

        try:
            target = ShowroomItemImage.objects.get(pk=image_id, item=item)
        except ShowroomItemImage.DoesNotExist:
            return None, "Image not found.", 404

        images = list(
            ShowroomItemImage.objects.filter(item=item).order_by("display_order", "uploaded_at")
        )
        if target in images:
            images.remove(target)
        ordered = [target] + images
        for i, img in enumerate(ordered):
            if img.display_order != i:
                img.display_order = i
                img.save(update_fields=["display_order"])

    return item, None, 200
