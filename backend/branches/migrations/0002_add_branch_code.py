from django.db import migrations, models


def populate_branch_codes(apps, schema_editor):
    branch_model = apps.get_model("branches", "Branch")
    for i, branch in enumerate(branch_model.objects.order_by("id")):
        branch.code = chr(65 + i)   # 0→A, 1→B, 2→C …
        branch.save(update_fields=["code"])


class Migration(migrations.Migration):

    dependencies = [
        ("branches", "0001_initial"),
    ]

    operations = [
        # 1. Add field without the unique constraint so all rows can start as ""
        migrations.AddField(
            model_name="branch",
            name="code",
            field=models.CharField(blank=True, default="", max_length=5),
        ),
        # 2. Populate codes from branch order
        migrations.RunPython(populate_branch_codes, migrations.RunPython.noop),
        # 3. Now it's safe to add the unique constraint
        migrations.AlterField(
            model_name="branch",
            name="code",
            field=models.CharField(blank=True, default="", max_length=5, unique=True),
        ),
    ]
