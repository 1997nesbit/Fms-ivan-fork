from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from branches.models import Branch

from .models import Invoice, InvoiceLineItem, Payment

User = get_user_model()


class InvoiceRecomputeStatusTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Main", location="Town")
        self.director = User.objects.create_user(
            username="director-inv", password="x", role=User.Role.DIRECTOR
        )
        self.invoice = Invoice.objects.create(
            invoice_number="INV-TEST-0001",
            branch=self.branch,
            customer_name="Jane",
            issue_date="2026-07-18",
            created_by=self.director,
        )
        InvoiceLineItem.objects.create(invoice=self.invoice, description="Sofa", unit_price=Decimal("100000"))

    def test_no_payments_leaves_status_unchanged(self):
        self.invoice.status = Invoice.Status.ISSUED
        self.invoice.save(update_fields=["status"])
        self.invoice.recompute_status()
        self.assertEqual(self.invoice.status, Invoice.Status.ISSUED)

    def test_partial_payment_sets_partially_paid(self):
        Payment.objects.create(invoice=self.invoice, amount=Decimal("40000"), recorded_by=self.director)
        self.invoice.recompute_status()
        self.assertEqual(self.invoice.status, Invoice.Status.PARTIALLY_PAID)
        self.assertEqual(self.invoice.total_paid, Decimal("40000"))
        self.assertEqual(self.invoice.balance_remaining, Decimal("60000"))

    def test_full_payment_sets_paid(self):
        Payment.objects.create(invoice=self.invoice, amount=Decimal("100000"), recorded_by=self.director)
        self.invoice.recompute_status()
        self.assertEqual(self.invoice.status, Invoice.Status.PAID)
        self.assertEqual(self.invoice.balance_remaining, Decimal("0"))

    def test_overpayment_still_counts_as_paid_with_negative_balance(self):
        Payment.objects.create(invoice=self.invoice, amount=Decimal("120000"), recorded_by=self.director)
        self.invoice.recompute_status()
        self.assertEqual(self.invoice.status, Invoice.Status.PAID)
        self.assertEqual(self.invoice.balance_remaining, Decimal("-20000"))


class LogPaymentViewTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Main", location="Town")
        self.director = User.objects.create_user(
            username="director-pay", password="x", role=User.Role.DIRECTOR
        )
        self.front_desk = User.objects.create_user(
            username="frontdesk-pay", password="x", role=User.Role.FRONT_DESK, branch=self.branch
        )
        self.invoice = Invoice.objects.create(
            invoice_number="INV-TEST-0002",
            branch=self.branch,
            customer_name="Jane",
            issue_date="2026-07-18",
            created_by=self.director,
        )
        InvoiceLineItem.objects.create(invoice=self.invoice, description="Sofa", unit_price=Decimal("100000"))
        self.client_api = APIClient()

    def test_director_logs_payment_and_status_updates(self):
        self.client_api.force_authenticate(self.director)
        resp = self.client_api.post(
            f"/api/reports/invoices/{self.invoice.id}/payments/",
            {"amount": "40000", "note": "Second installment"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["status"], "PARTIALLY_PAID")
        self.assertEqual(resp.data["total_paid"], "40000")
        self.assertEqual(len(resp.data["payments"]), 1)

    def test_non_director_forbidden_from_logging_payment(self):
        self.client_api.force_authenticate(self.front_desk)
        resp = self.client_api.post(
            f"/api/reports/invoices/{self.invoice.id}/payments/",
            {"amount": "40000"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_rejects_non_positive_amount(self):
        self.client_api.force_authenticate(self.director)
        resp = self.client_api.post(
            f"/api/reports/invoices/{self.invoice.id}/payments/",
            {"amount": "0"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
