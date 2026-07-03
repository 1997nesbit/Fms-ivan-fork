from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from branches.models import Branch

from .models import ShowroomItem

User = get_user_model()


def _make_user(role, branch=None, username=None):
    return User.objects.create_user(
        username=username or f"{role.lower()}1",
        password="pass12345",
        role=role,
        branch=branch,
    )


class ShowroomItemTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.branch = Branch.objects.create(name="Main", location="Town")
        self.other_branch = Branch.objects.create(name="Annex", location="Other Town")
        self.front_desk = _make_user(User.Role.FRONT_DESK, self.branch)
        self.director = _make_user(User.Role.DIRECTOR, self.branch)
        self.stock_keeper = _make_user(User.Role.STOCK_KEEPER, self.branch)

    def _add_item_payload(self, **overrides):
        payload = {
            "name": "Teak Coffee Table",
            "category": "Tables",
            "sku": "TBL-001",
            "serial_number": "SN-0001",
            "price": "150000",
        }
        payload.update(overrides)
        return payload

    def test_front_desk_can_add_item(self):
        self.client.force_authenticate(self.front_desk)
        resp = self.client.post("/api/shop/items/", self._add_item_payload(), format="json")
        self.assertEqual(resp.status_code, 201)
        item = ShowroomItem.objects.get()
        self.assertEqual(item.status, ShowroomItem.Status.AVAILABLE)
        self.assertEqual(item.branch_id, self.branch.id)

    def test_director_cannot_add_item(self):
        self.client.force_authenticate(self.director)
        resp = self.client.post("/api/shop/items/", self._add_item_payload(), format="json")
        self.assertEqual(resp.status_code, 403)

    def test_duplicate_serial_number_rejected(self):
        self.client.force_authenticate(self.front_desk)
        self.client.post("/api/shop/items/", self._add_item_payload(), format="json")
        resp = self.client.post(
            "/api/shop/items/",
            self._add_item_payload(sku="TBL-002"),  # different SKU, same serial
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("serial_number", resp.data["errors"])
        self.assertEqual(ShowroomItem.objects.count(), 1)

    def test_duplicate_sku_same_branch_rejected(self):
        self.client.force_authenticate(self.front_desk)
        self.client.post("/api/shop/items/", self._add_item_payload(), format="json")
        resp = self.client.post(
            "/api/shop/items/",
            self._add_item_payload(serial_number="SN-0002"),  # same SKU
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("sku", resp.data["errors"])

    def test_stock_keeper_forbidden_from_showroom(self):
        self.client.force_authenticate(self.stock_keeper)
        resp = self.client.get("/api/shop/items/")
        self.assertEqual(resp.status_code, 403)

    def test_list_filters_by_branch(self):
        ShowroomItem.objects.create(
            sku="A", serial_number="S1", name="Chair", branch=self.branch, price=1000
        )
        ShowroomItem.objects.create(
            sku="B", serial_number="S2", name="Sofa", branch=self.other_branch, price=2000
        )
        self.client.force_authenticate(self.director)
        resp = self.client.get(f"/api/shop/items/?branch_id={self.branch.id}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertEqual(resp.data["results"][0]["sku"], "A")


class SaleTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.branch = Branch.objects.create(name="Main", location="Town")
        self.front_desk = _make_user(User.Role.FRONT_DESK, self.branch)
        self.director = _make_user(User.Role.DIRECTOR, self.branch)
        self.item = ShowroomItem.objects.create(
            sku="TBL-001", serial_number="SN-0001", name="Table",
            branch=self.branch, price=150000,
        )

    def test_front_desk_can_sell_available_item(self):
        self.client.force_authenticate(self.front_desk)
        resp = self.client.post(
            "/api/shop/sales/", {"item_id": self.item.id, "sale_price": "150000"}, format="json"
        )
        self.assertEqual(resp.status_code, 201)
        self.item.refresh_from_db()
        self.assertEqual(self.item.status, ShowroomItem.Status.SOLD)

    def test_cannot_sell_already_sold_item(self):
        self.client.force_authenticate(self.front_desk)
        self.client.post(
            "/api/shop/sales/", {"item_id": self.item.id, "sale_price": "150000"}, format="json"
        )
        resp = self.client.post(
            "/api/shop/sales/", {"item_id": self.item.id, "sale_price": "150000"}, format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(self.item.sales.count(), 1)

    def test_director_cannot_sell(self):
        self.client.force_authenticate(self.director)
        resp = self.client.post(
            "/api/shop/sales/", {"item_id": self.item.id, "sale_price": "150000"}, format="json"
        )
        self.assertEqual(resp.status_code, 403)

    def test_director_can_view_sales_reports(self):
        self.client.force_authenticate(self.front_desk)
        self.client.post(
            "/api/shop/sales/", {"item_id": self.item.id, "sale_price": "150000"}, format="json"
        )
        self.client.force_authenticate(self.director)
        resp = self.client.get("/api/shop/sales/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertTrue(resp.data["results"][0]["reference"].startswith("SL-"))
