from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from branches.models import Branch
from orders.models import Order

from .models import ProductionStage

User = get_user_model()


def _make_user(role, branch=None, username=None):
    return User.objects.create_user(
        username=username or f"{role.lower()}1",
        password="pass12345",
        role=role,
        branch=branch,
    )


class OpsQueueWorkflowTests(TestCase):
    """Front Desk order -> Ops Manager plan -> production, end to end."""

    def setUp(self):
        self.client = APIClient()
        self.branch = Branch.objects.create(name="Main", location="Town")
        self.front_desk = _make_user(User.Role.FRONT_DESK, self.branch)
        self.ops_manager = _make_user(User.Role.OPS_MANAGER, self.branch)
        self.technician = _make_user(User.Role.TECHNICIAN, self.branch, username="tech1")
        self.director = _make_user(User.Role.DIRECTOR, self.branch)

        self.order = Order.objects.create(
            reference_number="FMS-OPS-0001",
            branch=self.branch,
            created_by=self.front_desk,
            customer_name="Jane",
            customer_phone="0700000000",
            item_description="Wardrobe",
            status=Order.Status.OPS_QUEUE,
        )

    def test_ops_queue_lists_only_ops_queue_orders(self):
        other = Order.objects.create(
            reference_number="FMS-OPS-0002",
            branch=self.branch,
            created_by=self.front_desk,
            customer_name="Bob",
            customer_phone="0700000001",
            item_description="Chair",
            status=Order.Status.PENDING,
        )
        self.client.force_authenticate(self.ops_manager)
        resp = self.client.get("/api/production/ops-queue/")
        self.assertEqual(resp.status_code, 200)
        ids = [o["id"] for o in resp.data]
        self.assertIn(self.order.id, ids)
        self.assertNotIn(other.id, ids)

    def test_non_ops_manager_forbidden_from_ops_queue(self):
        self.client.force_authenticate(self.front_desk)
        resp = self.client.get("/api/production/ops-queue/")
        self.assertEqual(resp.status_code, 403)

    def test_assign_stages_creates_plan(self):
        self.client.force_authenticate(self.ops_manager)
        resp = self.client.post(
            f"/api/production/orders/{self.order.id}/assign-stages/",
            [
                {"stage_name": "Frame", "technician_id": self.technician.id, "allotted_time": "2 days"},
                {"stage_name": "Finish", "technician_id": self.technician.id, "allotted_time": "1 day"},
            ],
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(len(resp.data["stages"]), 2)
        self.assertEqual(resp.data["stages"][0]["stage_name"], "Frame")
        self.assertEqual(resp.data["stages"][0]["sequence_number"], 1)
        self.assertEqual(resp.data["stages"][0]["status"], "PENDING")
        self.assertEqual(
            resp.data["stages"][0]["assigned_technician"]["id"], self.technician.id
        )
        self.assertEqual(ProductionStage.objects.filter(order=self.order).count(), 2)

    def test_assign_stages_replaces_existing_plan(self):
        self.client.force_authenticate(self.ops_manager)
        self.client.post(
            f"/api/production/orders/{self.order.id}/assign-stages/",
            [{"stage_name": "Frame", "technician_id": self.technician.id, "allotted_time": ""}],
            format="json",
        )
        resp = self.client.post(
            f"/api/production/orders/{self.order.id}/assign-stages/",
            [
                {"stage_name": "Frame v2", "technician_id": self.technician.id, "allotted_time": ""},
                {"stage_name": "Paint", "technician_id": self.technician.id, "allotted_time": ""},
            ],
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(ProductionStage.objects.filter(order=self.order).count(), 2)
        names = [s.stage_name for s in ProductionStage.objects.filter(order=self.order).order_by("sequence_number")]
        self.assertEqual(names, ["Frame v2", "Paint"])

    def test_assign_stages_rejects_unknown_technician(self):
        self.client.force_authenticate(self.ops_manager)
        resp = self.client.post(
            f"/api/production/orders/{self.order.id}/assign-stages/",
            [{"stage_name": "Frame", "technician_id": 999999, "allotted_time": ""}],
            format="json",
        )
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(ProductionStage.objects.filter(order=self.order).count(), 0)

    def test_set_wages_updates_agreed_wage(self):
        stage = ProductionStage.objects.create(
            order=self.order, stage_name="Frame", sequence_number=1,
            assigned_technician=self.technician,
        )
        self.client.force_authenticate(self.ops_manager)
        resp = self.client.patch(
            f"/api/production/orders/{self.order.id}/set-wages/",
            [{"stage_id": stage.id, "wage": "50000"}],
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        stage.refresh_from_db()
        self.assertEqual(stage.agreed_wage, Decimal("50000"))

    def test_start_work_requires_wages_on_every_stage(self):
        ProductionStage.objects.create(
            order=self.order, stage_name="Frame", sequence_number=1,
            assigned_technician=self.technician,  # no agreed_wage
        )
        self.client.force_authenticate(self.ops_manager)
        resp = self.client.post(f"/api/production/orders/{self.order.id}/start-work/")
        self.assertEqual(resp.status_code, 400)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.OPS_QUEUE)

    def test_start_work_activates_first_stage_and_moves_order_in_production(self):
        s1 = ProductionStage.objects.create(
            order=self.order, stage_name="Frame", sequence_number=1,
            assigned_technician=self.technician, agreed_wage=Decimal("50000"),
        )
        s2 = ProductionStage.objects.create(
            order=self.order, stage_name="Finish", sequence_number=2,
            assigned_technician=self.technician, agreed_wage=Decimal("30000"),
        )
        self.client.force_authenticate(self.ops_manager)
        resp = self.client.post(f"/api/production/orders/{self.order.id}/start-work/")
        self.assertEqual(resp.status_code, 200, resp.content)

        self.order.refresh_from_db()
        s1.refresh_from_db()
        s2.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.IN_PRODUCTION)
        self.assertEqual(s1.status, ProductionStage.Status.ACTIVE)
        self.assertIsNotNone(s1.activated_at)
        self.assertEqual(s2.status, ProductionStage.Status.PENDING)

    def test_full_chain_end_to_end(self):
        self.client.force_authenticate(self.ops_manager)

        resp = self.client.post(
            f"/api/production/orders/{self.order.id}/assign-stages/",
            [{"stage_name": "Frame", "technician_id": self.technician.id, "allotted_time": "2 days"}],
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        stage_id = resp.data["stages"][0]["id"]

        resp = self.client.patch(
            f"/api/production/orders/{self.order.id}/set-wages/",
            [{"stage_id": stage_id, "wage": "40000"}],
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

        # And the technician now sees the active stage in their own queue.
        self.client.force_authenticate(self.technician)
        resp = self.client.get("/api/production/my-queue/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["status"], "ACTIVE")
