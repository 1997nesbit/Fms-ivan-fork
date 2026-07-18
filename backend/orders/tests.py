import json
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from branches.models import Branch
from .models import Order, OrderImage, OrderItem

User = get_user_model()


class OrderItemSyncTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Main Branch")
        self.user = User.objects.create_user(
            username="frontdesk1", password="x", role=User.Role.FRONT_DESK, branch=self.branch
        )
        self.order = Order.objects.create(
            reference_number="FMS-TEST-0001",
            branch=self.branch,
            created_by=self.user,
            customer_name="Amina Yusuf",
            customer_phone="+255700000000",
        )

    def test_sync_from_items_aggregates_names_and_prices(self):
        OrderItem.objects.create(
            order=self.order, name="Sofa", quoted_price=Decimal("500000"), confirmed_price=Decimal("500000")
        )
        OrderItem.objects.create(
            order=self.order, name="Coffee Table", quoted_price=Decimal("150000"), confirmed_price=Decimal("150000")
        )

        self.order.sync_from_items()
        self.order.refresh_from_db()

        self.assertEqual(self.order.item_description, "Sofa; Coffee Table")
        self.assertEqual(self.order.quoted_price, Decimal("650000"))
        self.assertEqual(self.order.confirmed_price, Decimal("650000"))

    def test_sync_confirmed_price_is_none_until_every_item_confirmed(self):
        OrderItem.objects.create(order=self.order, name="Sofa", confirmed_price=Decimal("500000"))
        OrderItem.objects.create(order=self.order, name="Coffee Table", confirmed_price=None)

        self.order.sync_from_items()
        self.order.refresh_from_db()

        self.assertIsNone(self.order.confirmed_price)

    def test_order_image_belongs_to_item(self):
        item = OrderItem.objects.create(order=self.order, name="Sofa")
        img = OrderImage.objects.create(item=item, image_file="order_images/test.jpg")
        self.assertEqual(item.images.first(), img)


class OrderCreateMultiItemTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Main Branch")
        self.fd = User.objects.create_user(
            username="frontdesk2", password="x", role=User.Role.FRONT_DESK, branch=self.branch
        )
        self.director = User.objects.create_user(
            username="director2", password="x", role=User.Role.DIRECTOR
        )
        self.client_api = APIClient()
        self.client_api.force_authenticate(self.fd)

    def test_create_order_with_two_items(self):
        payload = {
            "customer_name": "Amina Yusuf",
            "customer_phone": "+255700000000",
            "delivery_date": "2026-08-01",
            "items": json.dumps([
                {"name": "Sofa", "notes": "3-seater, grey fabric", "measurements": "W200xH80xD90", "quoted_price": "500000"},
                {"name": "Coffee Table", "notes": "Glass top", "measurements": "W100xH45xD60", "quoted_price": "150000"},
            ]),
        }
        resp = self.client_api.post("/api/orders/", payload, format="multipart")

        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(len(resp.data["items"]), 2)
        self.assertEqual(resp.data["item_description"], "Sofa; Coffee Table")
        self.assertEqual(resp.data["quoted_price"], "650000.00")

    def test_create_order_requires_at_least_one_item(self):
        payload = {
            "customer_name": "Amina Yusuf",
            "customer_phone": "+255700000000",
            "delivery_date": "2026-08-01",
            "items": json.dumps([]),
        }
        resp = self.client_api.post("/api/orders/", payload, format="multipart")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("items", resp.data["errors"])

    def test_confirm_price_per_item_syncs_order_total(self):
        order = Order.objects.create(
            reference_number="FMS-TEST-0002",
            branch=self.branch,
            created_by=self.fd,
            customer_name="Amina Yusuf",
            customer_phone="+255700000000",
            status=Order.Status.PRICE_REVIEW,
        )
        i1 = OrderItem.objects.create(order=order, name="Sofa")
        i2 = OrderItem.objects.create(order=order, name="Coffee Table")

        director_client = APIClient()
        director_client.force_authenticate(self.director)
        resp = director_client.patch(
            f"/api/orders/{order.pk}/confirm-price/",
            {"items": [{"item_id": i1.id, "confirmed_price": "500000"}, {"item_id": i2.id, "confirmed_price": "150000"}]},
            format="json",
        )

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["confirmed_price"], "650000.00")
        self.assertEqual(resp.data["status"], "OPS_QUEUE")
