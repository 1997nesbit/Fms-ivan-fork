from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from branches.models import Branch
from orders.models import Order, OrderItem

from .models import ProductionStage

User = get_user_model()


def _make_user(role, branch=None, username=None):
    return User.objects.create_user(
        username=username or f"{role.lower()}1",
        password="pass12345",
        role=role,
        branch=branch,
    )


class ProductionStageItemTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Main", location="Town")
        self.front_desk = _make_user(User.Role.FRONT_DESK, self.branch)
        self.technician = _make_user(User.Role.TECHNICIAN, self.branch, username="tech-item")
        self.order = Order.objects.create(
            reference_number="FMS-ITEM-0001",
            branch=self.branch,
            created_by=self.front_desk,
            customer_name="Jane",
            customer_phone="0700000000",
        )
        self.item = OrderItem.objects.create(order=self.order, name="Sofa")

    def test_stage_order_property_proxies_to_item_order(self):
        stage = ProductionStage.objects.create(
            item=self.item, stage_name="Frame", sequence_number=1,
            assigned_technician=self.technician,
        )
        self.assertEqual(stage.order, self.order)
        self.assertEqual(stage.order.reference_number, "FMS-ITEM-0001")

    def test_sequence_number_unique_per_item_not_per_order(self):
        item2 = OrderItem.objects.create(order=self.order, name="Coffee Table")
        ProductionStage.objects.create(
            item=self.item, stage_name="Frame", sequence_number=1,
            assigned_technician=self.technician,
        )
        # Same sequence_number=1 on a different item of the same order is fine.
        ProductionStage.objects.create(
            item=item2, stage_name="Cut", sequence_number=1,
            assigned_technician=self.technician,
        )
        self.assertEqual(ProductionStage.objects.filter(item__order=self.order).count(), 2)


class OpsQueueWorkflowTests(TestCase):
    """Front Desk batch order -> Ops Manager per-item plan -> production, end to end."""

    def setUp(self):
        self.client = APIClient()
        self.branch = Branch.objects.create(name="Main", location="Town")
        self.front_desk = _make_user(User.Role.FRONT_DESK, self.branch)
        self.ops_manager = _make_user(User.Role.OPS_MANAGER, self.branch)
        self.tech_a = _make_user(User.Role.TECHNICIAN, self.branch, username="tech-a")
        self.tech_b = _make_user(User.Role.TECHNICIAN, self.branch, username="tech-b")

        self.order = Order.objects.create(
            reference_number="FMS-OPS-0001",
            branch=self.branch,
            created_by=self.front_desk,
            customer_name="Jane",
            customer_phone="0700000000",
            status=Order.Status.OPS_QUEUE,
        )
        self.item1 = OrderItem.objects.create(order=self.order, name="Sofa")
        self.item2 = OrderItem.objects.create(order=self.order, name="Coffee Table")

    def test_ops_queue_lists_only_ops_queue_orders_with_items(self):
        other = Order.objects.create(
            reference_number="FMS-OPS-0002",
            branch=self.branch,
            created_by=self.front_desk,
            customer_name="Bob",
            customer_phone="0700000001",
            status=Order.Status.PENDING,
        )
        self.client.force_authenticate(self.ops_manager)
        resp = self.client.get("/api/production/ops-queue/")
        self.assertEqual(resp.status_code, 200)
        ids = [o["id"] for o in resp.data]
        self.assertIn(self.order.id, ids)
        self.assertNotIn(other.id, ids)
        order_payload = next(o for o in resp.data if o["id"] == self.order.id)
        self.assertEqual(len(order_payload["items"]), 2)

    def test_non_ops_manager_forbidden_from_ops_queue(self):
        self.client.force_authenticate(self.front_desk)
        resp = self.client.get("/api/production/ops-queue/")
        self.assertEqual(resp.status_code, 403)

    def test_assign_stages_is_scoped_to_one_item(self):
        self.client.force_authenticate(self.ops_manager)
        resp = self.client.post(
            f"/api/production/items/{self.item1.id}/assign-stages/",
            [{"stage_name": "Frame", "technician_id": self.tech_a.id, "allotted_time": "2 days"}],
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(len(resp.data["stages"]), 1)
        self.assertEqual(resp.data["stages"][0]["stage_name"], "Frame")
        self.assertEqual(ProductionStage.objects.filter(item=self.item1).count(), 1)
        self.assertEqual(ProductionStage.objects.filter(item=self.item2).count(), 0)

    def test_assign_stages_rejects_unknown_technician(self):
        self.client.force_authenticate(self.ops_manager)
        resp = self.client.post(
            f"/api/production/items/{self.item1.id}/assign-stages/",
            [{"stage_name": "Frame", "technician_id": 999999, "allotted_time": ""}],
            format="json",
        )
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(ProductionStage.objects.filter(item=self.item1).count(), 0)

    def test_set_wages_updates_agreed_wage(self):
        stage = ProductionStage.objects.create(
            item=self.item1, stage_name="Frame", sequence_number=1,
            assigned_technician=self.tech_a,
        )
        self.client.force_authenticate(self.ops_manager)
        resp = self.client.patch(
            f"/api/production/items/{self.item1.id}/set-wages/",
            [{"stage_id": stage.id, "wage": "50000"}],
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        stage.refresh_from_db()
        self.assertEqual(stage.agreed_wage, Decimal("50000"))

    def test_start_work_requires_every_item_to_have_stages(self):
        ProductionStage.objects.create(
            item=self.item1, stage_name="Frame", sequence_number=1,
            assigned_technician=self.tech_a, agreed_wage=Decimal("50000"),
        )
        # item2 has no stages yet.
        self.client.force_authenticate(self.ops_manager)
        resp = self.client.post(f"/api/production/orders/{self.order.id}/start-work/")
        self.assertEqual(resp.status_code, 400)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.OPS_QUEUE)

    def test_start_work_activates_first_stage_of_every_item(self):
        self.client.force_authenticate(self.ops_manager)
        self.client.post(
            f"/api/production/items/{self.item1.id}/assign-stages/",
            [{"stage_name": "Frame", "technician_id": self.tech_a.id, "allotted_time": ""}],
            format="json",
        )
        self.client.post(
            f"/api/production/items/{self.item2.id}/assign-stages/",
            [{"stage_name": "Cut", "technician_id": self.tech_b.id, "allotted_time": ""}],
            format="json",
        )
        s1 = ProductionStage.objects.get(item=self.item1)
        s2 = ProductionStage.objects.get(item=self.item2)
        self.client.patch(
            f"/api/production/items/{self.item1.id}/set-wages/",
            [{"stage_id": s1.id, "wage": "50000"}], format="json",
        )
        self.client.patch(
            f"/api/production/items/{self.item2.id}/set-wages/",
            [{"stage_id": s2.id, "wage": "30000"}], format="json",
        )

        resp = self.client.post(f"/api/production/orders/{self.order.id}/start-work/")
        self.assertEqual(resp.status_code, 200, resp.content)

        s1.refresh_from_db()
        s2.refresh_from_db()
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.IN_PRODUCTION)
        self.assertEqual(s1.status, ProductionStage.Status.ACTIVE)
        self.assertEqual(s2.status, ProductionStage.Status.ACTIVE)

    def test_items_progress_independently_and_order_completes_when_both_items_done(self):
        self.client.force_authenticate(self.ops_manager)
        self.client.post(
            f"/api/production/items/{self.item1.id}/assign-stages/",
            [{"stage_name": "Frame", "technician_id": self.tech_a.id, "allotted_time": ""}],
            format="json",
        )
        self.client.post(
            f"/api/production/items/{self.item2.id}/assign-stages/",
            [
                {"stage_name": "Cut", "technician_id": self.tech_b.id, "allotted_time": ""},
                {"stage_name": "Glue", "technician_id": self.tech_b.id, "allotted_time": ""},
            ],
            format="json",
        )
        s1 = ProductionStage.objects.get(item=self.item1)
        item2_stages = list(ProductionStage.objects.filter(item=self.item2).order_by("sequence_number"))
        self.client.patch(
            f"/api/production/items/{self.item1.id}/set-wages/",
            [{"stage_id": s1.id, "wage": "50000"}], format="json",
        )
        self.client.patch(
            f"/api/production/items/{self.item2.id}/set-wages/",
            [{"stage_id": s.id, "wage": "20000"} for s in item2_stages], format="json",
        )
        self.client.post(f"/api/production/orders/{self.order.id}/start-work/")

        # Item 1 (single stage) finishes first — order must NOT be complete yet,
        # since item 2 still has an undone stage.
        self.client.force_authenticate(self.tech_a)
        self.client.post(f"/api/production/stages/{s1.id}/complete/")
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.IN_PRODUCTION)

        # Item 2 finishes both its stages — now the order is complete.
        self.client.force_authenticate(self.tech_b)
        self.client.post(f"/api/production/stages/{item2_stages[0].id}/complete/")
        item2_stages[1].refresh_from_db()
        self.assertEqual(item2_stages[1].status, ProductionStage.Status.ACTIVE)
        self.client.post(f"/api/production/stages/{item2_stages[1].id}/complete/")

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.WORKSHOP_COMPLETE)

    def test_full_chain_end_to_end(self):
        self.client.force_authenticate(self.ops_manager)

        resp = self.client.post(
            f"/api/production/items/{self.item1.id}/assign-stages/",
            [{"stage_name": "Frame", "technician_id": self.tech_a.id, "allotted_time": "2 days"}],
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        stage_id = resp.data["stages"][0]["id"]

        resp = self.client.post(
            f"/api/production/items/{self.item2.id}/assign-stages/",
            [{"stage_name": "Cut", "technician_id": self.tech_b.id, "allotted_time": "1 day"}],
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        stage2_id = resp.data["stages"][0]["id"]

        resp = self.client.patch(
            f"/api/production/items/{self.item1.id}/set-wages/",
            [{"stage_id": stage_id, "wage": "40000"}],
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        resp = self.client.patch(
            f"/api/production/items/{self.item2.id}/set-wages/",
            [{"stage_id": stage2_id, "wage": "20000"}],
            format="json",
        )
        self.assertEqual(resp.status_code, 200)

        resp = self.client.post(f"/api/production/orders/{self.order.id}/start-work/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "IN_PRODUCTION")

        # Order has left the ops queue now.
        resp = self.client.get("/api/production/ops-queue/")
        ids = [o["id"] for o in resp.data]
        self.assertNotIn(self.order.id, ids)

        # And each technician now sees their own active stage in their queue.
        self.client.force_authenticate(self.tech_a)
        resp = self.client.get("/api/production/my-queue/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["status"], "ACTIVE")
        self.assertEqual(resp.data[0]["order"]["item_description"], "Sofa")

        self.client.force_authenticate(self.tech_b)
        resp = self.client.get("/api/production/my-queue/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["order"]["item_description"], "Coffee Table")
