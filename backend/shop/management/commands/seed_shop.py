"""
Management command: seed_shop
Creates realistic showroom inventory and exercises all three sale flows.

Usage
-----
    py manage.py seed_shop            # create (skips if already seeded)
    py manage.py seed_shop --flush    # wipe all SHOP- items and re-create

What gets created
-----------------
Showroom items (12 total)
  - 8 standalone items (AVAILABLE)
  - 1 set with 3 components (set = AVAILABLE, components = AVAILABLE)
  - 1 standalone pre-sold via SHOP sale (item = SOLD)
  - 1 standalone RESERVED by a custom order in production
  - 1 standalone SOLD by a completed custom order

Orders (3 custom-order flow examples)
  - CUSTOM-PRICE  : order in PRICE_REVIEW, showroom item RESERVED
  - CUSTOM-PROD   : order IN_PRODUCTION, showroom item RESERVED
  - CUSTOM-DONE   : order DISPATCHED, showroom item SOLD, Sale(CUSTOM) created

Sales (2 plain shop sales for reference)
  - SHOP sale on the pre-sold standalone item
"""

from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from branches.models import Branch
from orders.models import Order, OrderImage
from production.models import ProductionStage
from shop.models import BranchTransferRequest, Sale, SetBreakRequest, ShowroomItem
from users.models import User

SKU_PREFIX = "SHOP-SEED"

# ---------------------------------------------------------------------------
# Item catalogue
# ---------------------------------------------------------------------------

STANDALONE_ITEMS = [
    ("SHOP-SEED-001", "3-Seater Sofa",         "Sofas",    4_500_000),
    ("SHOP-SEED-002", "King Bed Frame",         "Beds",     3_200_000),
    ("SHOP-SEED-003", "Wardrobe 4-Door",        "Storage",  5_800_000),
    ("SHOP-SEED-004", "TV Stand 1.8 m",         "Living",   1_200_000),
    ("SHOP-SEED-005", "Office Desk 140×70 cm",  "Office",   2_100_000),
    ("SHOP-SEED-006", "Bookshelf 5-Tier",       "Storage",  950_000),
    # reserved by a custom order in production
    ("SHOP-SEED-007", "Corner Sofa Left-hand",  "Sofas",    7_200_000),
    # sold via completed custom order
    ("SHOP-SEED-008", "Dressing Table w/ Mirror","Bedroom",  2_800_000),
    # sold via plain shop sale
    ("SHOP-SEED-009", "Coffee Table Glass Top", "Living",   1_600_000),
    # available - reserved for set-break demo transfer
    ("SHOP-SEED-010", "Single Sofa Chair",      "Sofas",    1_900_000),
]

SET_ITEM = ("SHOP-SEED-SET", "Living Room Set",   "Sets",   12_000_000)
SET_COMPONENTS = [
    ("SHOP-SEED-SET-A", "3-Seater Sofa (Set)",   "Sofas",  4_000_000),
    ("SHOP-SEED-SET-B", "Armchair (Set)",         "Sofas",  2_500_000),
    ("SHOP-SEED-SET-C", "Coffee Table (Set)",     "Living", 1_800_000),
]

STAGE_TEMPLATES = [
    "Cutting & Sizing",
    "Frame Assembly",
    "Sanding & Finishing",
    "Upholstery / Paint",
    "Quality Check",
]


class Command(BaseCommand):
    help = "Seed showroom inventory and custom-order flow examples."

    def add_arguments(self, parser):
        parser.add_argument(
            "--flush",
            action="store_true",
            help="Delete all SHOP-SEED items/orders/sales before re-creating.",
        )

    def handle(self, *args, **options):
        branch = Branch.objects.first()
        if not branch:
            self.stderr.write(self.style.ERROR("No branches found. Run seed_users first."))
            return

        second_branch = Branch.objects.exclude(pk=branch.pk).first()

        front_desk = User.objects.filter(role=User.Role.FRONT_DESK).first()
        director   = User.objects.filter(role=User.Role.DIRECTOR).first()
        technician = User.objects.filter(role=User.Role.TECHNICIAN).first()

        if not front_desk or not director:
            self.stderr.write(self.style.ERROR("Need at least one FRONT_DESK and one DIRECTOR user."))
            return

        if options["flush"]:
            self._flush()

        if ShowroomItem.objects.filter(sku__startswith="SHOP-SEED").exists():
            self.stdout.write(self.style.WARNING("Shop seed already present. Use --flush to reset."))
            return

        # ------------------------------------------------------------------ #
        # 1. Standalone items (6 plain AVAILABLE)
        # ------------------------------------------------------------------ #
        available_items = []
        for sku, name, cat, price in STANDALONE_ITEMS[:6]:
            item = ShowroomItem.objects.create(
                sku=sku, name=name, category=cat, price=price,
                branch=branch, status=ShowroomItem.Status.AVAILABLE,
            )
            available_items.append(item)

        # ------------------------------------------------------------------ #
        # 2. Set + components (all AVAILABLE)
        # ------------------------------------------------------------------ #
        the_set = ShowroomItem.objects.create(
            sku=SET_ITEM[0], name=SET_ITEM[1], category=SET_ITEM[2],
            price=SET_ITEM[3], branch=branch, is_set=True,
            status=ShowroomItem.Status.AVAILABLE,
        )
        for sku, name, cat, price in SET_COMPONENTS:
            ShowroomItem.objects.create(
                sku=sku, name=name, category=cat, price=price,
                branch=branch, parent_set=the_set,
                status=ShowroomItem.Status.AVAILABLE,
            )
        self.stdout.write(f"  Created set {the_set.sku} with {len(SET_COMPONENTS)} components")

        # ------------------------------------------------------------------ #
        # 3. RESERVED item - custom order in PRICE_REVIEW
        # ------------------------------------------------------------------ #
        item_reserved_1 = ShowroomItem.objects.create(
            sku="SHOP-SEED-007", name="Corner Sofa Left-hand", category="Sofas",
            price=7_200_000, branch=branch, status=ShowroomItem.Status.RESERVED,
        )
        order_price_review = self._create_order(
            ref="CUSTOM-PRICE-001",
            item=item_reserved_1,
            status=Order.Status.PRICE_REVIEW,
            customer_name="Hassan Ally",
            customer_phone="+255 712 100 008",
            quoted_price=7_200_000,
            confirmed_price=None,
            days_ago=3,
            front_desk=front_desk,
            branch=branch,
        )
        self.stdout.write(f"  Order {order_price_review.reference_number} - PRICE_REVIEW (item RESERVED)")

        # ------------------------------------------------------------------ #
        # 4. RESERVED item - custom order IN_PRODUCTION
        # ------------------------------------------------------------------ #
        item_reserved_2 = ShowroomItem.objects.create(
            sku="SHOP-SEED-008", name="Dressing Table w/ Mirror", category="Bedroom",
            price=2_800_000, branch=branch, status=ShowroomItem.Status.RESERVED,
        )
        order_in_prod = self._create_order(
            ref="CUSTOM-PROD-001",
            item=item_reserved_2,
            status=Order.Status.IN_PRODUCTION,
            customer_name="Irene Kimaro",
            customer_phone="+255 712 100 009",
            quoted_price=2_800_000,
            confirmed_price=2_800_000,
            days_ago=10,
            front_desk=front_desk,
            branch=branch,
        )
        self._seed_stages(order_in_prod, Order.Status.IN_PRODUCTION, technician)
        self.stdout.write(f"  Order {order_in_prod.reference_number} - IN_PRODUCTION (item RESERVED)")

        # ------------------------------------------------------------------ #
        # 5. SOLD item - completed custom order (DISPATCHED)
        # ------------------------------------------------------------------ #
        item_sold_custom = ShowroomItem.objects.create(
            sku="SHOP-SEED-009", name="Coffee Table Glass Top", category="Living",
            price=1_600_000, branch=branch, status=ShowroomItem.Status.SOLD,
        )
        order_done = self._create_order(
            ref="CUSTOM-DONE-001",
            item=item_sold_custom,
            status=Order.Status.DISPATCHED,
            customer_name="Grace Mwangi",
            customer_phone="+255 712 100 007",
            quoted_price=1_600_000,
            confirmed_price=1_600_000,
            days_ago=20,
            front_desk=front_desk,
            branch=branch,
        )
        self._seed_stages(order_done, Order.Status.DISPATCHED, technician)
        Sale.objects.create(
            item=item_sold_custom,
            branch=branch,
            order=order_done,
            sale_price=1_600_000,
            sold_by=front_desk,
            order_type=Sale.OrderType.CUSTOM,
        )
        self.stdout.write(f"  Order {order_done.reference_number} - DISPATCHED + Sale(CUSTOM) created")

        # ------------------------------------------------------------------ #
        # 6. Plain SHOP sale (standalone item already sold)
        # ------------------------------------------------------------------ #
        item_sold_shop = ShowroomItem.objects.create(
            sku="SHOP-SEED-010", name="Single Sofa Chair", category="Sofas",
            price=1_900_000, branch=branch, status=ShowroomItem.Status.SOLD,
        )
        Sale.objects.create(
            item=item_sold_shop,
            branch=branch,
            order=None,
            sale_price=1_800_000,
            sold_by=front_desk,
            order_type=Sale.OrderType.SHOP,
        )
        self.stdout.write(f"  Plain SHOP sale created for {item_sold_shop.sku}")

        # ------------------------------------------------------------------ #
        # 7. Transfer request example (if second branch exists)
        # ------------------------------------------------------------------ #
        item_for_transfer = ShowroomItem.objects.create(
            sku="SHOP-SEED-011", name="Bookshelf 6-Tier", category="Storage",
            price=1_100_000, branch=branch, status=ShowroomItem.Status.AVAILABLE,
        )
        if second_branch:
            BranchTransferRequest.objects.create(
                item=item_for_transfer,
                from_branch=branch,
                to_branch=second_branch,
                requested_by=front_desk,
                status=BranchTransferRequest.Status.PENDING,
            )
            self.stdout.write(
                f"  Transfer request: {item_for_transfer.sku} ->{second_branch.name} (PENDING)"
            )

        # ------------------------------------------------------------------ #
        # 8. Set-break request example
        # ------------------------------------------------------------------ #
        SetBreakRequest.objects.create(
            item=the_set,
            requested_by=front_desk,
            reason="Customer wants individual pieces from the living room set.",
            status=SetBreakRequest.Status.PENDING,
        )
        self.stdout.write(f"  Set-break request for {the_set.sku} (PENDING)")

        # ------------------------------------------------------------------ #
        # Summary
        # ------------------------------------------------------------------ #
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 52))
        self.stdout.write(self.style.SUCCESS("  Shop seed complete"))
        self.stdout.write(self.style.SUCCESS("=" * 52))
        self.stdout.write(f"  ShowroomItems   {ShowroomItem.objects.filter(sku__startswith='SHOP-SEED').count()}")
        self.stdout.write(f"  Orders          {Order.objects.filter(reference_number__startswith='CUSTOM-').count()}")
        self.stdout.write(f"  Sales (SHOP)    {Sale.objects.filter(order_type=Sale.OrderType.SHOP).count()}")
        self.stdout.write(f"  Sales (CUSTOM)  {Sale.objects.filter(order_type=Sale.OrderType.CUSTOM).count()}")
        self.stdout.write(self.style.SUCCESS("=" * 52))
        self.stdout.write("")
        self.stdout.write("  Test flows:")
        self.stdout.write(f"  [*] Director price approval  -> order {order_price_review.reference_number}")
        self.stdout.write(f"  [*] In-production tracking   -> order {order_in_prod.reference_number}")
        self.stdout.write(f"  [*] Completed custom sale    -> order {order_done.reference_number}")
        self.stdout.write(f"  [*] Set-break pending        -> {the_set.sku}")
        if second_branch:
            self.stdout.write(f"  [*] Transfer pending         -> {item_for_transfer.sku}")
        self.stdout.write(self.style.SUCCESS("=" * 52))

    # ---------------------------------------------------------------------- #
    # Helpers
    # ---------------------------------------------------------------------- #

    def _flush(self):
        Sale.objects.filter(item__sku__startswith="SHOP-SEED").delete()
        Sale.objects.filter(order__reference_number__startswith="CUSTOM-").delete()
        SetBreakRequest.objects.filter(item__sku__startswith="SHOP-SEED").delete()
        BranchTransferRequest.objects.filter(item__sku__startswith="SHOP-SEED").delete()
        Order.objects.filter(reference_number__startswith="CUSTOM-").delete()
        deleted, _ = ShowroomItem.objects.filter(sku__startswith="SHOP-SEED").delete()
        self.stdout.write(self.style.WARNING(f"Flushed {deleted} seeded showroom item(s)."))

    def _create_order(
        self, *, ref, item, status, customer_name, customer_phone,
        quoted_price, confirmed_price, days_ago, front_desk, branch,
    ):
        order = Order.objects.create(
            reference_number=ref,
            showroom_item=item,
            branch=branch,
            created_by=front_desk,
            customer_name=customer_name,
            customer_phone=customer_phone,
            item_description=f"{item.name} - custom finish",
            quoted_price=quoted_price,
            confirmed_price=confirmed_price,
            delivery_date=date.today() + timedelta(days=14),
            status=status,
            notes="Custom colour/finish as per customer request.",
        )
        Order.objects.filter(pk=order.pk).update(
            created_at=timezone.now() - timedelta(days=days_ago)
        )
        return order

    def _seed_stages(self, order, order_status, technician):
        if order_status == Order.Status.IN_PRODUCTION:
            stage_statuses = [
                ProductionStage.Status.DONE,
                ProductionStage.Status.ACTIVE,
                ProductionStage.Status.PENDING,
                ProductionStage.Status.PENDING,
                ProductionStage.Status.PENDING,
            ]
        else:
            stage_statuses = [ProductionStage.Status.DONE] * len(STAGE_TEMPLATES)

        for i, (name, stage_status) in enumerate(zip(STAGE_TEMPLATES, stage_statuses), start=1):
            ProductionStage.objects.create(
                order=order,
                stage_name=name,
                sequence_number=i,
                assigned_technician=technician,
                status=stage_status,
            )
