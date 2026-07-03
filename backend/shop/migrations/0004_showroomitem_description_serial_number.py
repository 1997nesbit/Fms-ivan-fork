from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("shop", "0003_setbreakrequest"),
    ]

    operations = [
        migrations.AddField(
            model_name="showroomitem",
            name="description",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="showroomitem",
            name="serial_number",
            field=models.CharField(default="", max_length=100, unique=True),
            preserve_default=False,
        ),
    ]
