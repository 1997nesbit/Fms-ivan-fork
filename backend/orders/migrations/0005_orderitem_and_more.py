from django.db import migrations, models
import django.db.models.deletion


def backfill_order_items(apps, schema_editor):
    Order = apps.get_model("orders", "Order")
    OrderItem = apps.get_model("orders", "OrderItem")
    OrderImage = apps.get_model("orders", "OrderImage")

    for order in Order.objects.all():
        item = OrderItem.objects.create(
            order=order,
            name=(order.item_description or "Item")[:200],
            notes=order.item_description or "",
            quoted_price=order.quoted_price,
            confirmed_price=order.confirmed_price,
        )
        OrderImage.objects.filter(order_old=order).update(item=item)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0004_remove_order_showroom_item_order_cancellation_reason_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="OrderItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=200)),
                ("notes", models.TextField(blank=True)),
                ("measurements", models.CharField(blank=True, max_length=200)),
                ("quoted_price", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("confirmed_price", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("order", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="items", to="orders.order")),
            ],
            options={"ordering": ["id"]},
        ),
        # Keep the old FK around under a temp name so the data migration can
        # read which order each image belonged to, then drop it afterwards.
        migrations.RenameField(model_name="orderimage", old_name="order", new_name="order_old"),
        migrations.AddField(
            model_name="orderimage",
            name="item",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="images",
                to="orders.orderitem",
            ),
        ),
        migrations.RunPython(backfill_order_items, noop_reverse),
        migrations.RemoveField(model_name="orderimage", name="order_old"),
        migrations.AlterField(
            model_name="orderimage",
            name="item",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="images", to="orders.orderitem"),
        ),
        migrations.AlterField(
            model_name="order",
            name="item_description",
            field=models.TextField(blank=True),
        ),
    ]
