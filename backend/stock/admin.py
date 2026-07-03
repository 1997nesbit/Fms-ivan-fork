from django.contrib import admin

from .models import InventoryItem, Issuance, MaterialEstimate, MaterialRequest, RestockRequest


@admin.register(InventoryItem)
class InventoryItemAdmin(admin.ModelAdmin):
    list_display = ("name", "unit", "current_quantity", "minimum_threshold", "is_low_stock", "last_updated")
    list_filter = ("unit",)
    search_fields = ("name", "unit")


@admin.register(MaterialRequest)
class MaterialRequestAdmin(admin.ModelAdmin):
    list_display = ("material_name", "quantity", "unit", "status", "requested_by", "stage", "created_at")
    list_filter = ("status",)
    search_fields = ("material_name",)


@admin.register(Issuance)
class IssuanceAdmin(admin.ModelAdmin):
    list_display = ("inventory_item", "quantity_issued", "order", "material_request", "issuance_type", "issued_by", "issued_at")
    list_filter = ("issuance_type",)


@admin.register(RestockRequest)
class RestockRequestAdmin(admin.ModelAdmin):
    list_display = ("item_name", "quantity_needed", "unit", "status", "requested_by", "created_at")
    list_filter = ("status",)
    search_fields = ("item_name",)


admin.site.register(MaterialEstimate)
