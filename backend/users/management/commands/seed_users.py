"""
Management command: seed_users
Creates the project branches and all staff users.

Usage:
    python manage.py seed_users            # create (skip if already exists)
    python manage.py seed_users --flush    # wipe all non-superusers and re-seed
"""

from django.core.management.base import BaseCommand

from branches.models import Branch
from users.models import User

BRANCHES = [
    {"name": "Main Branch", "code": "A", "location": "Dar es Salaam – Kariakoo"},
    {"name": "City Branch", "code": "B", "location": "Dar es Salaam – Mikocheni"},
]

# (username, first, last, role, branch_idx, phone, pin)
# pin is only used for TECHNICIAN accounts — it becomes the password so the
# 4-digit keypad on the login page works. Leave blank for staff users.
USERS = [
    ("ivan",   "Ivan",   "",  "DIRECTOR",     0, "", ""),
    ("shimi",  "Shimi",  "",  "DIRECTOR",     0, "", ""),
    ("john",   "John",   "",  "STOCK_KEEPER", 0, "", ""),
    ("nancy",  "Nancy",  "",  "FRONT_DESK",   1, "", ""),
    ("tecla",  "Tecla",  "",  "OPS_MANAGER",  0, "", ""),
    ("allen",  "Allen",  "",  "TECHNICIAN",   0, "", "1234"),
]


class Command(BaseCommand):
    help = "Seed branches and staff users."

    def add_arguments(self, parser):
        parser.add_argument(
            "--flush",
            action="store_true",
            help="Delete all non-superuser accounts and re-create from scratch.",
        )
        parser.add_argument(
            "--pass",
            dest="default_pass",
            default="ivan@123",
            help="Password assigned to every seeded user (default: ivan@123).",
        )

    def handle(self, *args, **options):
        default_pass = options["default_pass"]
        if options["flush"]:
            deleted, _ = User.objects.filter(is_superuser=False).delete()
            Branch.objects.all().delete()
            self.stdout.write(self.style.WARNING(
                f"Flushed {deleted} user(s) and all branches."
            ))

        # -- Branches --------------------------------------------------------
        branches = []
        for data in BRANCHES:
            branch, created = Branch.objects.get_or_create(
                name=data["name"],
                defaults={"location": data["location"], "code": data["code"]},
            )
            branches.append(branch)
            tag = "created" if created else "exists "
            self.stdout.write(f"  branch [{tag}]  {branch.name}")

        self.stdout.write("")

        # -- Users -----------------------------------------------------------
        for username, first, last, role, branch_idx, phone, pin in USERS:
            if User.objects.filter(username=username).exists():
                self.stdout.write(f"  user   [exists ]  {username:<12} ({role})")
                continue

            user = User(
                username=username,
                first_name=first,
                last_name=last,
                email=f"{username}@fms.internal",
                role=role,
                branch=branches[branch_idx],
                phone_number=phone,
            )
            user.set_password(pin if pin else default_pass)
            user.save()
            self.stdout.write(
                self.style.SUCCESS(f"  user   [created]  {username:<12} ({role})")
            )

        # -- Summary ---------------------------------------------------------
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 52))
        self.stdout.write(self.style.SUCCESS("  SEEDED CREDENTIALS"))
        self.stdout.write(self.style.SUCCESS("=" * 52))
        self.stdout.write(f"  {'USERNAME':<14} {'ROLE':<15} CREDENTIAL")
        self.stdout.write("  " + "-" * 46)
        for username, _, _, role, _, _, pin in USERS:
            credential = f"PIN: {pin}" if pin else default_pass
            self.stdout.write(f"  {username:<14} {role:<15} {credential}")
        self.stdout.write(self.style.SUCCESS("=" * 52))
