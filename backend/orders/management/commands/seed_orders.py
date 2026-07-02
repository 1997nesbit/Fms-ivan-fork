"""
Management command: seed_orders
Creates a realistic volume of orders across all statuses for pagination testing.

Usage:
    python manage.py seed_orders            # create (skips existing SEED- refs)
    python manage.py seed_orders --flush    # wipe all SEED- orders and re-create
    python manage.py seed_orders --count 80 # override total order count (default 60)
"""

import random
from datetime import date, timedelta

from django.utils import timezone

from django.core.management.base import BaseCommand

from branches.models import Branch
from orders.models import Order
from production.models import ProductionStage
from users.models import User

# ---------------------------------------------------------------------------
# Seed data pools
# ---------------------------------------------------------------------------

CUSTOMERS = [
    ("Amina Yusuf",      "+255 712 100 001"),
    ("Brian Omondi",     "+255 712 100 002"),
    ("Celia Mkwawa",     "+255 712 100 003"),
    ("Daniel Swai",      "+255 712 100 004"),
    ("Esther Njoroge",   "+255 712 100 005"),
    ("Farouk Hassan",    "+255 712 100 006"),
    ("Grace Mwangi",     "+255 712 100 007"),
    ("Hassan Ally",      "+255 712 100 008"),
    ("Irene Kimaro",     "+255 712 100 009"),
    ("James Mbeki",      "+255 712 100 010"),
    ("Khadija Omar",     "+255 712 100 011"),
    ("Leonard Temu",     "+255 712 100 012"),
    ("Mary Lupembe",     "+255 712 100 013"),
    ("Nassoro Said",     "+255 712 100 014"),
    ("Olivia Msuya",     "+255 712 100 015"),
    ("Peter Mwakasege",  "+255 712 100 016"),
    ("Queen Nkya",       "+255 712 100 017"),
    ("Robert Chacha",    "+255 712 100 018"),
    ("Salma Bakari",     "+255 712 100 019"),
    ("Thomas Minja",     "+255 712 100 020"),
]

ITEMS = [
    ("6-Seater Dining Table",    ["180×90 cm", "200×100 cm", "160×80 cm"]),
    ("3-Seater Sofa",            ["Standard", "L-Shape", "Recliner"]),
    ("King Bed Frame",           ["180×200 cm", "160×200 cm"]),
    ("Queen Bed Frame",          ["150×200 cm", "140×190 cm"]),
    ("Wardrobe",                 ["4-Door Sliding", "3-Door Hinged", "6-Door"]),
    ("Single Sofa Chair",        ["Standard", "Wingback", "Recliner"]),
    ("TV Stand",                 ["1.8 m", "2.1 m", "1.5 m"]),
    ("Office Desk",              ["120×60 cm", "140×70 cm", "160×80 cm"]),
    ("Bookshelf",                ["5-Tier", "6-Tier", "Wall-mounted"]),
    ("Coffee Table",             ["Oval Glass Top", "Rectangular Wood", "Round"]),
    ("Dressing Table",           ["With Mirror", "Without Mirror"]),
    ("Shoe Rack",                ["8-Tier", "10-Tier", "6-Tier"]),
    ("Bar Stool Set",            ["Set of 2", "Set of 4"]),
    ("Corner Sofa",              ["Left-hand", "Right-hand"]),
    ("Bunk Bed",                 ["Standard", "With Storage", "Triple"]),
]

NOTES_POOL = [
    "Customer wants mahogany finish.",
    "Non-catalogue size — Director approval required.",
    "Rush order — delivery before end of month.",
    "Customer will supply own fabric.",
    "Matching set with previous order.",
    "Delivery to second floor, no lift.",
    "Customer confirmed dimensions twice.",
    "Bargained price — needs Director sign-off.",
    "",
    "",
    "",  # empty notes are common
]

STAGE_TEMPLATES = [
    "Cutting & Sizing",
    "Frame Assembly",
    "Sanding & Finishing",
    "Upholstery / Paint",
    "Quality Check",
]

# How many orders of each status to create (must sum to --count default)
STATUS_DISTRIBUTION = [
    (Order.Status.PENDING,           6),
    (Order.Status.PRICE_REVIEW,      10),
    (Order.Status.OPS_QUEUE,         12),
    (Order.Status.IN_PRODUCTION,     14),
    (Order.Status.WORKSHOP_COMPLETE, 8),
    (Order.Status.DISPATCHED,        10),
]
DEFAULT_COUNT = sum(n for _, n in STATUS_DISTRIBUTION)  # 60


class Command(BaseCommand):
    help = f"Seed ~{DEFAULT_COUNT} orders across all statuses to exercise pagination."

    def add_arguments(self, parser):
        parser.add_argument(
            "--flush",
            action="store_true",
            help="Delete all SEED- prefixed orders before re-creating.",
        )
        parser.add_argument(
            "--count",
            type=int,
            default=DEFAULT_COUNT,
            help=f"Total orders to create (default {DEFAULT_COUNT}).",
        )

    def handle(self, *args, **options):
        rng = random.Random(42)  # fixed seed → reproducible data

        branch = Branch.objects.first()
        if not branch:
            self.stdout.write(self.style.ERROR("No branches found. Run: py manage.py seed_users first."))
            return

        front_desk_users = list(User.objects.filter(role=User.Role.FRONT_DESK))
        technician = User.objects.filter(role=User.Role.TECHNICIAN).first()

        if not front_desk_users:
            self.stdout.write(self.style.ERROR("No FRONT_DESK users found. Run: py manage.py seed_users first."))
            return

        if options["flush"]:
            deleted, _ = Order.objects.filter(reference_number__startswith="SEED-").delete()
            self.stdout.write(self.style.WARNING(f"Flushed {deleted} seeded order(s)."))

        # Build the full list of (status, count) scaled to --count
        target = options["count"]
        scale = target / DEFAULT_COUNT
        plan: list[Order.Status] = []
        for status, base_n in STATUS_DISTRIBUTION:
            plan.extend([status] * max(1, round(base_n * scale)))
        rng.shuffle(plan)

        created = 0
        skipped = 0

        for i, status in enumerate(plan, start=1):
            ref = f"SEED-{i:04d}"

            if Order.objects.filter(reference_number=ref).exists():
                skipped += 1
                continue

            customer, phone = rng.choice(CUSTOMERS)
            furniture, sizes = rng.choice(ITEMS)
            size = rng.choice(sizes)
            description = f"{furniture} — {size}"
            notes = rng.choice(NOTES_POOL)
            delivery_offset = rng.randint(-10, 45)
            created_offset  = rng.randint(0, 30)

            quoted = rng.choice([None] + [rng.randint(3, 50) * 100_000 for _ in range(8)])
            confirmed = quoted if status not in (
                Order.Status.PENDING, Order.Status.PRICE_REVIEW
            ) else None

            order = Order.objects.create(
                reference_number=ref,
                branch=branch,
                created_by=rng.choice(front_desk_users),
                customer_name=customer,
                customer_phone=phone,
                item_description=description,
                quoted_price=quoted,
                confirmed_price=confirmed,
                delivery_date=date.today() + timedelta(days=delivery_offset),
                status=status,
                notes=notes,
            )

            # Back-date created_at for realism
            Order.objects.filter(pk=order.pk).update(
                created_at=timezone.now() - timedelta(days=created_offset)
            )

            if status in (
                Order.Status.IN_PRODUCTION,
                Order.Status.WORKSHOP_COMPLETE,
                Order.Status.DISPATCHED,
            ):
                self._seed_stages(order, status, technician)

            created += 1

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 52))
        self.stdout.write(self.style.SUCCESS(f"  {created} order(s) created  |  {skipped} skipped"))
        self.stdout.write(self.style.SUCCESS("=" * 52))

        # Summary by status
        for status, _ in STATUS_DISTRIBUTION:
            n = Order.objects.filter(
                reference_number__startswith="SEED-", status=status
            ).count()
            self.stdout.write(f"  {status:<22} {n}")
        self.stdout.write(self.style.SUCCESS("=" * 52))

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

        for i, (name, stage_status) in enumerate(
            zip(STAGE_TEMPLATES, stage_statuses), start=1
        ):
            ProductionStage.objects.create(
                order=order,
                stage_name=name,
                sequence_number=i,
                assigned_technician=technician,
                status=stage_status,
            )
