from django.db import migrations, models
import django.db.models.deletion


def backfill_categories(apps, schema_editor):
    Category = apps.get_model("shop", "Category")
    ShowroomItem = apps.get_model("shop", "ShowroomItem")

    cat_map = {}
    for item in ShowroomItem.objects.exclude(category_text="").exclude(category_text__isnull=True):
        name = item.category_text.strip()
        if not name:
            continue
        if name not in cat_map:
            cat, _ = Category.objects.get_or_create(name=name)
            cat_map[name] = cat
        item.category_fk = cat_map[name]
        item.save(update_fields=["category_fk"])


def backfill_display_order(apps, schema_editor):
    ShowroomItem = apps.get_model("shop", "ShowroomItem")
    ShowroomItemImage = apps.get_model("shop", "ShowroomItemImage")

    for item in ShowroomItem.objects.all():
        for i, img in enumerate(
            ShowroomItemImage.objects.filter(item=item).order_by("uploaded_at")
        ):
            img.display_order = i
            img.save(update_fields=["display_order"])


class Migration(migrations.Migration):

    dependencies = [
        ("shop", "0006_add_is_discontinued"),
    ]

    operations = [
        # 1. Create Category table
        migrations.CreateModel(
            name="Category",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=100, unique=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["name"], "verbose_name_plural": "categories"},
        ),
        # 2. Rename old free-text field so we can reuse the name for the FK
        migrations.RenameField(
            model_name="showroomitem",
            old_name="category",
            new_name="category_text",
        ),
        # 3. Add the new FK column (nullable)
        migrations.AddField(
            model_name="showroomitem",
            name="category_fk",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="items",
                to="shop.category",
            ),
        ),
        # 4. Add display_order to ShowroomItemImage
        migrations.AddField(
            model_name="showroomitemimage",
            name="display_order",
            field=models.PositiveIntegerField(default=0),
        ),
        # 5. Backfill: create Category rows from existing strings, set FK
        migrations.RunPython(backfill_categories, migrations.RunPython.noop),
        # 6. Backfill display_order per item
        migrations.RunPython(backfill_display_order, migrations.RunPython.noop),
        # 7. Drop the old text field
        migrations.RemoveField(
            model_name="showroomitem",
            name="category_text",
        ),
        # 8. Rename FK column to 'category'
        migrations.RenameField(
            model_name="showroomitem",
            old_name="category_fk",
            new_name="category",
        ),
        # 9. Update ShowroomItemImage ordering
        migrations.AlterModelOptions(
            name="showroomitemimage",
            options={"ordering": ["display_order", "uploaded_at"]},
        ),
    ]
