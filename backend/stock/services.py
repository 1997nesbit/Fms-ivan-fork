from django.db import transaction

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
    APPROVED — on success it's linked to the issuance and flips to ISSUED so it
    can only ever be fulfilled once. Any failure (bad IDs, insufficient stock,
    already-issued request) rolls back the whole block, leaving inventory and
    the request's status untouched.

    Returns (issuance, error_detail, status_code). On failure `issuance` is
    None and `error_detail` is the message to surface to the client.
    """
    with transaction.atomic():
        material_request = None
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
            material_request.status = MaterialRequest.Status.ISSUED
            material_request.save(update_fields=["status"])

        log_inventory_event(
            user, "material_issued", inv_item,
            {"quantity_issued": str(quantity), "order_reference": order.reference_number},
        )

    return issuance, None, 201
