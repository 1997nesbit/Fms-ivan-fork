from django.conf import settings
from django.db import models

BRANCH = "branches.Branch"


class Category(models.Model):
    name       = models.CharField(max_length=100, unique=True)
    is_active  = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class Room(models.Model):
    name      = models.CharField(max_length=100)
    code      = models.CharField(max_length=10, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.code})"


class ItemType(models.Model):
    name      = models.CharField(max_length=100)
    code      = models.CharField(max_length=10, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.code})"


class ShowroomItem(models.Model):
    class Status(models.TextChoices):
        AVAILABLE    = "AVAILABLE",    "Available"
        OUT_OF_STOCK = "OUT_OF_STOCK", "Out of stock"

    sku           = models.CharField(max_length=100)
    serial_number = models.CharField(max_length=100, blank=True, default="")
    name          = models.CharField(max_length=200)
    branch        = models.ForeignKey(BRANCH, on_delete=models.RESTRICT, related_name="showroom_items")
    category      = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="items",
    )
    description   = models.TextField(blank=True, default="")
    price         = models.DecimalField(max_digits=12, decimal_places=2)
    quantity      = models.PositiveIntegerField(default=1)
    status        = models.CharField(max_length=15, choices=Status.choices, default=Status.AVAILABLE)
    is_set           = models.BooleanField(default=False)
    is_discontinued  = models.BooleanField(default=False)
    created_at       = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("sku", "branch")]
        indexes = [
            models.Index(fields=["branch", "status"]),
            models.Index(fields=["sku"]),
        ]

    def __str__(self):
        return f"{self.sku} — {self.name}"


class ShowroomItemImage(models.Model):
    item          = models.ForeignKey(ShowroomItem, on_delete=models.CASCADE, related_name="images")
    image         = models.ImageField(upload_to="showroom/images/%Y/%m/")
    display_order = models.PositiveIntegerField(default=0)
    uploaded_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["display_order", "uploaded_at"]

    def __str__(self):
        return f"Image for {self.item.sku}"


class CatalogueProduct(models.Model):
    name        = models.CharField(max_length=200)
    category    = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="catalogue_products",
    )
    description = models.TextField(blank=True, default="")
    min_price   = models.DecimalField(max_digits=12, decimal_places=2)
    max_price   = models.DecimalField(max_digits=12, decimal_places=2)
    photo       = models.ImageField(upload_to="catalogue/photos/%Y/%m/", null=True, blank=True)
    is_active   = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Quote(models.Model):
    class Status(models.TextChoices):
        PENDING_DIRECTOR = "PENDING_DIRECTOR", "Pending Director"
        APPROVED         = "APPROVED",         "Approved"
        REJECTED         = "REJECTED",         "Rejected"

    branch          = models.ForeignKey(BRANCH, on_delete=models.RESTRICT, related_name="quotes")
    created_by      = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.RESTRICT,
        related_name="created_quotes",
    )
    customer_name   = models.CharField(max_length=200)
    customer_phone  = models.CharField(max_length=20, blank=True, default="")
    catalogue_item  = models.ForeignKey(
        CatalogueProduct,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="quotes",
    )
    product_name    = models.CharField(max_length=200)
    size            = models.CharField(max_length=100, blank=True, default="")
    ref_min         = models.DecimalField(max_digits=12, decimal_places=2)
    ref_max         = models.DecimalField(max_digits=12, decimal_places=2)
    quoted_price    = models.DecimalField(max_digits=12, decimal_places=2)
    within_range    = models.BooleanField()
    notes           = models.TextField(blank=True, default="")
    status          = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING_DIRECTOR)
    director_note   = models.TextField(blank=True, default="")
    decided_at      = models.DateTimeField(null=True, blank=True)
    converted_order = models.OneToOneField(
        "orders.Order",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="source_quote",
    )
    created_at      = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["branch", "status"])]

    def __str__(self):
        return f"Q-{self.pk:04d} — {self.product_name} ({self.customer_name})"


class Reservation(models.Model):
    item = models.ForeignKey(ShowroomItem, on_delete=models.RESTRICT, related_name="reservations")
    customer_name = models.CharField(max_length=200)
    customer_phone = models.CharField(max_length=20)
    deposit_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    expiry_date = models.DateField()
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.RESTRICT,
        related_name="reservations",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["is_active", "expiry_date"])]

    def __str__(self):
        return f"{self.customer_name} — {self.item.sku}"


class Sale(models.Model):
    class OrderType(models.TextChoices):
        SHOP   = "SHOP",   "Shop"
        CUSTOM = "CUSTOM", "Custom"

    item          = models.ForeignKey(ShowroomItem, on_delete=models.RESTRICT, related_name="sales")
    branch        = models.ForeignKey(BRANCH, on_delete=models.RESTRICT, related_name="sales")
    order         = models.ForeignKey(
        "orders.Order",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_sales",
    )
    sale_price    = models.DecimalField(max_digits=12, decimal_places=2)
    quantity_sold = models.PositiveIntegerField(default=1)
    sold_by       = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.RESTRICT, related_name="sales"
    )
    order_type    = models.CharField(max_length=6, choices=OrderType.choices, default=OrderType.SHOP)
    sold_at       = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["branch", "-sold_at"])]

    def __str__(self):
        return f"{self.item.sku} ×{self.quantity_sold} sold at {self.sold_at:%Y-%m-%d}"
