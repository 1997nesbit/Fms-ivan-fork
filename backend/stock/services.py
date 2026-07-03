from decimal import Decimal

from django.db import transaction
from django.db.models import Sum

from users.models import AuditLog

from .models import InventoryItem, Issuance, MaterialRequest


def log_inventory_event(user, action, item, metadata=None):
    """Record an inventory audit trail entry against the shared AuditLog."""
    AuditLog.objects.create(
        user=user,
        action=action,
        resource_type="InventoryItem",
        resource_id=str(item.id),
        metadata=metadata or {},
    )


def issue_materials(
    *,
    user,
    order,
    inventory_item_id,
    quantity,
    stage_id=None,
    issuance_type=Issuance.IssuanceType.INITIAL,
    material_request_id=None,
):
    """Atomically deduct inventory and record an Issuance.

    If `material_request_id` is given, the request is locked and must still be
    APPROVED. On success it's linked to the issuance; the request only flips
    to ISSUED once the running total issued against it meets the originally
    requested quantity, so a partial issuance (less than what was asked for)
    leaves it APPROVED — still visible in the issue queue and still issuable
    for the remainder. Any failure (bad IDs, insufficient stock, a request
    that's already fully issued) rolls back the whole block, leaving
    inventory and the request's status untouched.

    `issuance_type` is only honoured when there's no `material_request_id` to
    derive it from. Once a request is linked, whether this is the first or a
    follow-up batch is computed from how many issuances already exist against
    it — the caller's `issuance_type` is ignored so a stock keeper can't
    mislabel a second or third partial issuance as "Initial".

    Returns (issuance, error_detail, status_code). On failure `issuance` is
    None and `error_detail` is the message to surface to the client.
    """
    with transaction.atomic():
        material_request = None
        prior_issuance_count = 0
        if material_request_id:
            try:
                material_request = MaterialRequest.objects.select_for_update().get(
                    pk=material_request_id
                )
            except MaterialRequest.DoesNotExist:
                return None, "Material request not found.", 404
            if material_request.status != MaterialRequest.Status.APPROVED:
                return (
                    None,
                    f"This request has already been {material_request.get_status_display().lower()}.",
                    400,
                )
            prior_issuance_count = Issuance.objects.filter(material_request=material_request).count()
            issuance_type = (
                Issuance.IssuanceType.INITIAL if prior_issuance_count == 0
                else Issuance.IssuanceType.ADDITIONAL
            )

        try:
            inv_item = InventoryItem.objects.select_for_update().get(pk=inventory_item_id)
        except InventoryItem.DoesNotExist:
            return None, "Inventory item not found.", 404

        if inv_item.current_quantity < quantity:
            return (
                None,
                f"Insufficient stock: {inv_item.current_quantity} {inv_item.unit} available.",
                400,
            )

        inv_item.current_quantity -= quantity
        inv_item.save(update_fields=["current_quantity"])

        issuance = Issuance.objects.create(
            order=order,
            stage_id=stage_id,
            inventory_item=inv_item,
            material_request=material_request,
            quantity_issued=quantity,
            issued_by=user,
            issuance_type=issuance_type,
        )

        if material_request:
            total_issued = (
                Issuance.objects.filter(material_request=material_request)
                .aggregate(total=Sum("quantity_issued"))["total"]
                or Decimal("0")
            )
            if total_issued >= material_request.quantity:
                material_request.status = MaterialRequest.Status.ISSUED
                material_request.save(update_fields=["status"])
            # else: still owed materials -- stays APPROVED, so it remains
            # visible in the issue queue and can be issued against again.

        log_inventory_event(
            user, "material_issued", inv_item,
            {"quantity_issued": str(quantity), "order_reference": order.reference_number},
        )

    return issuance, None, 201
