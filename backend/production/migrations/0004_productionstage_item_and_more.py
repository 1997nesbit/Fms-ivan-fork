from django.db import migrations, models
import django.db.models.deletion


def backfill_stage_items(apps, schema_editor):
    ProductionStage = apps.get_model("production", "ProductionStage")
    OrderItem = apps.get_model("orders", "OrderItem")

    for stage in ProductionStage.objects.all():
        item = OrderItem.objects.filter(order_id=stage.order_old_id).first()
        stage.item = item
        stage.save(update_fields=["item"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("production", "0003_productionstage_agreed_wage_and_more"),
        ("orders", "0005_orderitem_and_more"),
    ]

    operations = [
        migrations.RenameField(model_name="productionstage", old_name="order", new_name="order_old"),
        migrations.AlterUniqueTogether(name="productionstage", unique_together=set()),
        migrations.AddField(
            model_name="productionstage",
            name="item",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="stages",
                to="orders.orderitem",
            ),
        ),
        migrations.RunPython(backfill_stage_items, noop_reverse),
        migrations.RemoveField(model_name="productionstage", name="order_old"),
        migrations.AlterField(
            model_name="productionstage",
            name="item",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="stages", to="orders.orderitem"),
        ),
        migrations.AlterUniqueTogether(name="productionstage", unique_together={("item", "sequence_number")}),
    ]
