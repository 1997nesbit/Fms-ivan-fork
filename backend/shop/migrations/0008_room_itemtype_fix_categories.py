from django.db import migrations, models

_ROOMS = [
    ("Dining Room", "DR"),
    ("Living Room", "LR"),
    ("Bedroom",     "BD"),
    ("Office",      "OF"),
    ("Kitchen",     "KT"),
    ("Outdoor",     "OD"),
    ("Storage",     "ST"),
    ("Entryway",    "EN"),
]

_ITEM_TYPES = [
    ("Table",              "TBL"),
    ("Chair",              "CHR"),
    ("Sofa",               "SFA"),
    ("Bed Frame",          "BED"),
    ("Wardrobe",           "WRD"),
    ("Desk",               "DSK"),
    ("Cabinet/Sideboard",  "CBS"),
    ("Coffee Table",       "CFF"),
    ("TV Unit",            "TVU"),
    ("Bench",              "BNK"),
    ("Dresser",            "DRS"),
    ("Shelving",           "SHL"),
    ("Ottoman",            "OTM"),
    ("Nightstand",         "NGT"),
    ("Bar Unit",           "BAR"),
    ("Stool",              "STL"),
]


def normalize_and_deduplicate_categories(apps, schema_editor):
    Category = apps.get_model("shop", "Category")
    ShowroomItem = apps.get_model("shop", "ShowroomItem")

    # Normalize whitespace on all names first
    for cat in Category.objects.all():
        normalized = " ".join(cat.name.strip().split())
        if cat.name != normalized:
            cat.name = normalized
            cat.save(update_fields=["name"])

    # Merge case-insensitive duplicates: keep lowest id, reassign items
    seen = {}  # lower-cased name → keeper Category
    for cat in Category.objects.order_by("id"):
        key = cat.name.lower()
        if key in seen:
            keeper = seen[key]
            ShowroomItem.objects.filter(category=cat).update(category=keeper)
            cat.delete()
        else:
            seen[key] = cat


def seed_rooms(apps, schema_editor):
    Room = apps.get_model("shop", "Room")
    for name, code in _ROOMS:
        Room.objects.get_or_create(code=code, defaults={"name": name})


def seed_item_types(apps, schema_editor):
    ItemType = apps.get_model("shop", "ItemType")
    for name, code in _ITEM_TYPES:
        ItemType.objects.get_or_create(code=code, defaults={"name": name})


class Migration(migrations.Migration):

    dependencies = [
        ("shop", "0007_category_and_image_order"),
    ]

    operations = [
        # Fix category case duplicates
        migrations.RunPython(normalize_and_deduplicate_categories, migrations.RunPython.noop),

        # Room model
        migrations.CreateModel(
            name="Room",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=100)),
                ("code", models.CharField(max_length=10, unique=True)),
                ("is_active", models.BooleanField(default=True)),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.RunPython(seed_rooms, migrations.RunPython.noop),

        # ItemType model
        migrations.CreateModel(
            name="ItemType",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=100)),
                ("code", models.CharField(max_length=10, unique=True)),
                ("is_active", models.BooleanField(default=True)),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.RunPython(seed_item_types, migrations.RunPython.noop),
    ]
