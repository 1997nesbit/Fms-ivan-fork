from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction

from .models import Sale, ShowroomItem

_REQUIRED = "This field is required."


def validate_and_create_item(user, data):
    """Validate POST /shop/items/ payload and create a ShowroomItem.

    Returns (item, errors). On validation failure item is None and errors
    is a non-empty dict of field -> [messages].
    """
    errors: dict[str, list[str]] = {}

    if not user.branch_id:
        return None, {"non_field": ["Your account has no branch assigned."]}

    name = str(data.get("name", "")).strip()
    sku = str(data.get("sku", "")).strip()
    serial_number = str(data.get("serial_number", "")).strip()
    category = str(data.get("category", "")).strip()

    if not name:
        errors["name"] = [_REQUIRED]
    if not sku:
        errors["sku"] = [_REQUIRED]
    if not serial_number:
        errors["serial_number"] = [_REQUIRED]

    price = None
    raw_price = str(data.get("price", "")).strip()
    if not raw_price:
        errors["price"] = [_REQUIRED]
    else:
        try:
            price = Decimal(raw_price)
            if price <= 0:
                errors["price"] = ["Must be greater than zero."]
        except InvalidOperation:
            errors["price"] = ["Enter a valid number."]

    if not errors:
        if ShowroomItem.objects.filter(branch=user.branch, sku=sku).exists():
            errors["sku"] = ["An item with this SKU already exists at your branch."]
        if ShowroomItem.objects.filter(serial_number=serial_number).exists():
            errors["serial_number"] = ["This serial number is already registered."]

    if errors:
        return None, errors

    try:
        item = ShowroomItem.objects.create(
            sku=sku,
            serial_number=serial_number,
            name=name,
            branch=user.branch,
            category=category,
            price=price,
        )
    except IntegrityError:
        return None, {"non_field": ["This SKU or serial number was just registered by someone else."]}

    return item, {}


def record_sale(user, item_id, raw_sale_price):
    """Validate and record a showroom sale, marking the item SOLD.

    Returns (sale, error_detail, status_code). On success error_detail is None.
    """
    if not user.branch_id:
        return None, "Your account has no branch assigned.", 400

    try:
        sale_price = Decimal(str(raw_sale_price))
        if sale_price <= 0:
            raise InvalidOperation
    except (InvalidOperation, TypeError):
        return None, "Enter a valid positive sale price.", 400

    with transaction.atomic():
        try:
            item = ShowroomItem.objects.select_for_update().get(
                pk=item_id, branch=user.branch
            )
        except ShowroomItem.DoesNotExist:
            return None, "Item not found at your branch.", 404

        if item.status != ShowroomItem.Status.AVAILABLE:
            return None, f"Item is already {item.status.title()}.", 400

        sale = Sale.objects.create(
            item=item,
            branch=item.branch,
            sale_price=sale_price,
            sold_by=user,
            order_type=Sale.OrderType.SHOP,
        )
        item.status = ShowroomItem.Status.SOLD
        item.save(update_fields=["status"])

    return sale, None, 201
