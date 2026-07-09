from decimal import Decimal

from django.db.models import Count, Sum, Q
from django.utils.dateparse import parse_date
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from branches.models import Branch
from orders.models import Order
from production.models import ProductionStage, TechnicianPayment
from shop.models import Sale, ShowroomItem
from users.models import User

from .models import Invoice, InvoiceLineItem

_NOT_AUTHORIZED = "Not authorized."
_REQUIRED = "This field is required."

DIRECTOR = User.Role.DIRECTOR


# ---------------------------------------------------------------------------
# Payload helpers
# ---------------------------------------------------------------------------

def _invoice_payload(inv):
    return {
        "id": inv.id,
        "invoice_number": inv.invoice_number,
        "order_id": inv.order_id,
        "branch_id": inv.branch_id,
        "branch_name": inv.branch.name,
        "customer_name": inv.customer_name,
        "customer_phone": inv.customer_phone,
        "customer_address": inv.customer_address,
        "issue_date": inv.issue_date.isoformat() if inv.issue_date else None,
        "due_date": inv.due_date.isoformat() if inv.due_date else None,
        "payment_terms": inv.payment_terms,
        "notes": inv.notes,
        "status": inv.status,
        "line_items": [
            {
                "id": li.id,
                "description": li.description,
                "quantity": str(li.quantity),
                "unit_price": str(li.unit_price),
                "total": str(li.total),
            }
            for li in inv.line_items.all()
        ],
        "subtotal": str(inv.subtotal),
        "created_by": inv.created_by.get_full_name() or inv.created_by.username,
        "created_at": inv.created_at.isoformat(),
    }


def _next_invoice_number():
    last = Invoice.objects.order_by("-id").first()
    seq = (last.id + 1) if last else 1
    return f"INV-{seq:06d}"


# ---------------------------------------------------------------------------
# Invoice endpoints
# ---------------------------------------------------------------------------

class InvoiceListCreateView(APIView):
    """
    GET  /api/reports/invoices/  — list invoices (Director only).
    POST /api/reports/invoices/  — create invoice (Director only).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != DIRECTOR:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)
        invoices = Invoice.objects.select_related("branch", "order", "created_by").prefetch_related("line_items").order_by("-created_at")
        branch_id = request.query_params.get("branch_id")
        if branch_id:
            invoices = invoices.filter(branch_id=branch_id)
        return Response([_invoice_payload(inv) for inv in invoices])

    def post(self, request):
        if request.user.role != DIRECTOR:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)

        errors: dict[str, list[str]] = {}
        data = request.data

        customer_name = str(data.get("customer_name", "")).strip()
        if not customer_name:
            errors["customer_name"] = [_REQUIRED]

        branch_id = data.get("branch_id")
        try:
            branch = Branch.objects.get(pk=branch_id)
        except (Branch.DoesNotExist, TypeError, ValueError):
            errors["branch_id"] = ["Valid branch required."]
            branch = None

        issue_date_raw = str(data.get("issue_date", "")).strip()
        issue_date = parse_date(issue_date_raw)
        if not issue_date:
            errors["issue_date"] = ["Valid date required (YYYY-MM-DD)."]

        due_date = None
        due_date_raw = str(data.get("due_date", "")).strip()
        if due_date_raw:
            due_date = parse_date(due_date_raw)

        line_items_data = data.get("line_items", [])
        if not isinstance(line_items_data, list) or len(line_items_data) == 0:
            errors["line_items"] = ["At least one line item is required."]

        if errors:
            return Response({"errors": errors}, status=400)

        order = None
        order_id = data.get("order_id")
        if order_id:
            try:
                order = Order.objects.get(pk=order_id)
            except Order.DoesNotExist:
                pass

        inv = Invoice.objects.create(
            invoice_number=_next_invoice_number(),
            order=order,
            branch=branch,
            customer_name=customer_name,
            customer_phone=str(data.get("customer_phone", "")).strip(),
            customer_address=str(data.get("customer_address", "")).strip(),
            issue_date=issue_date,
            due_date=due_date,
            payment_terms=str(data.get("payment_terms", "")).strip(),
            notes=str(data.get("notes", "")).strip(),
            created_by=request.user,
        )

        for li in line_items_data:
            try:
                qty = Decimal(str(li.get("quantity", 1)))
                unit_price = Decimal(str(li.get("unit_price", 0)))
            except Exception:
                qty = Decimal("1")
                unit_price = Decimal("0")
            InvoiceLineItem.objects.create(
                invoice=inv,
                description=str(li.get("description", "")).strip(),
                quantity=qty,
                unit_price=unit_price,
            )

        inv.refresh_from_db()
        return Response(_invoice_payload(inv), status=201)


class InvoiceDetailView(APIView):
    """
    GET   /api/reports/invoices/<pk>/  — retrieve.
    PATCH /api/reports/invoices/<pk>/  — update status (Director only).
    """
    permission_classes = [IsAuthenticated]

    def _get_invoice(self, pk):
        return Invoice.objects.select_related("branch", "order", "created_by").prefetch_related("line_items").get(pk=pk)

    def get(self, request, pk):
        if request.user.role != DIRECTOR:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)
        try:
            inv = self._get_invoice(pk)
        except Invoice.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)
        return Response(_invoice_payload(inv))

    def patch(self, request, pk):
        if request.user.role != DIRECTOR:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)
        try:
            inv = self._get_invoice(pk)
        except Invoice.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)

        allowed_statuses = {s.value for s in Invoice.Status}
        new_status = request.data.get("status")
        if new_status and new_status in allowed_statuses:
            inv.status = new_status
            inv.save(update_fields=["status", "updated_at"])
        return Response(_invoice_payload(inv))


# ---------------------------------------------------------------------------
# Reports: Showroom Sales & Inventory
# ---------------------------------------------------------------------------

def _parse_date_params(request):
    date_from = parse_date(request.query_params.get("date_from", ""))
    date_to = parse_date(request.query_params.get("date_to", ""))
    return date_from, date_to


def _apply_sale_date_filters(qs, date_from, date_to):
    if date_from:
        qs = qs.filter(sold_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(sold_at__date__lte=date_to)
    return qs


def _inventory_worth(items_qs):
    unsold = items_qs.filter(status=ShowroomItem.Status.AVAILABLE)
    at_cost = sum((i.cost_price or i.price) * i.quantity for i in unsold)
    at_retail = sum(i.price * i.quantity for i in unsold)
    return str(at_cost), str(at_retail)


class ShowroomSalesReportView(APIView):
    """
    GET /api/reports/showroom-sales/
    Query params: branch_id, date_from, date_to
    Returns: sales totals, items added, unsold inventory (at cost), per-branch breakdown.
    """
    permission_classes = [IsAuthenticated]
    _ALLOWED = {User.Role.DIRECTOR, User.Role.FRONT_DESK}

    def get(self, request):
        if request.user.role not in self._ALLOWED:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)

        date_from, date_to = _parse_date_params(request)
        branch_id = request.query_params.get("branch_id")

        sales_qs = _apply_sale_date_filters(Sale.objects.all(), date_from, date_to)
        items_qs = ShowroomItem.objects.all()
        if branch_id:
            sales_qs = sales_qs.filter(item__branch_id=branch_id)
            items_qs = items_qs.filter(branch_id=branch_id)

        items_qs_new = items_qs
        if date_from:
            items_qs_new = items_qs_new.filter(created_at__date__gte=date_from)
        if date_to:
            items_qs_new = items_qs_new.filter(created_at__date__lte=date_to)

        sales_agg = sales_qs.aggregate(
            total_revenue=Sum("sale_price"),
            units_sold=Sum("quantity_sold"),
            transaction_count=Count("id"),
        )
        items_added = items_qs_new.aggregate(count=Count("id"), units=Sum("quantity"))

        at_cost, at_retail = _inventory_worth(items_qs)

        per_branch_qs = _apply_sale_date_filters(Sale.objects.all(), date_from, date_to)
        if branch_id:
            per_branch_qs = per_branch_qs.filter(item__branch_id=branch_id)
        per_branch = (
            per_branch_qs
            .values("item__branch__name")
            .annotate(revenue=Sum("sale_price"), units=Sum("quantity_sold"))
            .order_by("-revenue")
        )

        return Response({
            "sales": {
                "total_revenue": str(sales_agg["total_revenue"] or 0),
                "units_sold": sales_agg["units_sold"] or 0,
                "transaction_count": sales_agg["transaction_count"] or 0,
            },
            "items_added": {
                "count": items_added["count"] or 0,
                "units": items_added["units"] or 0,
            },
            "inventory_worth": {"at_cost": at_cost, "at_retail": at_retail},
            "by_branch": [
                {
                    "branch": row["item__branch__name"],
                    "revenue": str(row["revenue"] or 0),
                    "units": row["units"] or 0,
                }
                for row in per_branch
            ],
        })


# ---------------------------------------------------------------------------
# Reports: Branch Performance
# ---------------------------------------------------------------------------

class BranchPerformanceReportView(APIView):
    """
    GET /api/reports/branch-performance/  ("Gross Report")
    Query params: date_from, date_to, branch_id
    KPIs: revenue (sales + dispatched orders), units sold.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != DIRECTOR:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)

        date_from, date_to = _parse_date_params(request)
        branch_id = request.query_params.get("branch_id")

        # Showroom sales per branch
        sales_qs = Sale.objects.all()
        if date_from:
            sales_qs = sales_qs.filter(sold_at__date__gte=date_from)
        if date_to:
            sales_qs = sales_qs.filter(sold_at__date__lte=date_to)
        if branch_id:
            sales_qs = sales_qs.filter(item__branch_id=branch_id)

        sales_by_branch = {
            row["item__branch_id"]: {"revenue": row["revenue"], "units": row["units"]}
            for row in sales_qs.values("item__branch_id")
            .annotate(revenue=Sum("sale_price"), units=Sum("quantity_sold"))
        }

        # Orders (confirmed_price, dispatched) per branch
        orders_qs = Order.objects.filter(status=Order.Status.DISPATCHED)
        if date_from:
            orders_qs = orders_qs.filter(created_at__date__gte=date_from)
        if date_to:
            orders_qs = orders_qs.filter(created_at__date__lte=date_to)
        if branch_id:
            orders_qs = orders_qs.filter(branch_id=branch_id)

        orders_by_branch = {
            row["branch_id"]: {"order_revenue": row["revenue"], "orders": row["count"]}
            for row in orders_qs.values("branch_id")
            .annotate(revenue=Sum("confirmed_price"), count=Count("id"))
        }

        branches = Branch.objects.order_by("name")
        if branch_id:
            branches = branches.filter(pk=branch_id)
        result = []
        for b in branches:
            sale_data = sales_by_branch.get(b.id, {})
            order_data = orders_by_branch.get(b.id, {})
            sale_rev = Decimal(sale_data.get("revenue") or 0)
            order_rev = Decimal(order_data.get("order_revenue") or 0)
            result.append({
                "branch_id": b.id,
                "branch_name": b.name,
                "showroom_revenue": str(sale_rev),
                "order_revenue": str(order_rev),
                "total_revenue": str(sale_rev + order_rev),
                "units_sold": sale_data.get("units") or 0,
                "orders_fulfilled": order_data.get("orders") or 0,
            })

        result.sort(key=lambda r: float(r["total_revenue"]), reverse=True)
        grand_total = sum(Decimal(r["total_revenue"]) for r in result)
        return Response({"branches": result, "grand_total": str(grand_total)})


# ---------------------------------------------------------------------------
# Reports: Production Cost (per stage, per technician)
# ---------------------------------------------------------------------------

class ProductionCostReportView(APIView):
    """
    GET /api/reports/production-cost/  ("Grouped Technician Pay")
    Query params: date_from, date_to, branch_id
    Returns: per-stage totals, per-technician totals, overall totals.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != DIRECTOR:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)

        date_from, date_to = _parse_date_params(request)
        branch_id = request.query_params.get("branch_id")

        payments_qs = TechnicianPayment.objects.select_related("stage", "stage__order", "technician")
        if date_from:
            payments_qs = payments_qs.filter(created_at__date__gte=date_from)
        if date_to:
            payments_qs = payments_qs.filter(created_at__date__lte=date_to)
        if branch_id:
            payments_qs = payments_qs.filter(stage__order__branch_id=branch_id)

        # Group by stage name
        by_stage: dict[str, dict] = {}
        by_tech: dict[int, dict] = {}
        # Orders each technician touched, for revenue attribution. Full order
        # value is credited to every technician who completed a stage on it —
        # not split — so summing this across technicians can exceed total
        # order revenue when an order had multiple technicians.
        tech_order_ids: dict[int, set] = {}

        for p in payments_qs:
            stage_name = p.stage.stage_name
            if stage_name not in by_stage:
                by_stage[stage_name] = {"stage_name": stage_name, "total": Decimal(0), "count": 0}
            by_stage[stage_name]["total"] += p.amount
            by_stage[stage_name]["count"] += 1

            tech_id = p.technician_id
            if tech_id not in by_tech:
                tech = p.technician
                by_tech[tech_id] = {
                    "technician_id": tech_id,
                    "technician_name": tech.get_full_name() or tech.username,
                    "total": Decimal(0),
                    "stages_completed": 0,
                    "revenue_attributed": Decimal(0),
                }
                tech_order_ids[tech_id] = set()
            by_tech[tech_id]["total"] += p.amount
            by_tech[tech_id]["stages_completed"] += 1

            order = p.stage.order
            if order.id not in tech_order_ids[tech_id]:
                tech_order_ids[tech_id].add(order.id)
                by_tech[tech_id]["revenue_attributed"] += order.confirmed_price or Decimal(0)

        stages_list = sorted(by_stage.values(), key=lambda r: r["total"], reverse=True)
        for r in stages_list:
            r["total"] = str(r["total"])

        tech_list = sorted(by_tech.values(), key=lambda r: r["revenue_attributed"], reverse=True)
        for r in tech_list:
            r["total"] = str(r["total"])
            r["revenue_attributed"] = str(r["revenue_attributed"])

        grand_total = sum(float(r["total"]) for r in stages_list)

        return Response({
            "by_stage": stages_list,
            "by_technician": tech_list,
            "grand_total": str(grand_total),
        })


# ---------------------------------------------------------------------------
# Reports: Custom Order Sales
# ---------------------------------------------------------------------------

class CustomOrderSalesReportView(APIView):
    """
    GET /api/reports/custom-order-sales/
    Query params: date_from, date_to, branch_id
    Dispatched custom orders with their confirmed price. Dispatch date is
    approximated by updated_at, since dispatch is a terminal status change
    and nothing else updates the order afterwards.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != DIRECTOR:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)

        date_from, date_to = _parse_date_params(request)
        branch_id = request.query_params.get("branch_id")

        orders_qs = Order.objects.filter(status=Order.Status.DISPATCHED).select_related("branch")
        if date_from:
            orders_qs = orders_qs.filter(updated_at__date__gte=date_from)
        if date_to:
            orders_qs = orders_qs.filter(updated_at__date__lte=date_to)
        if branch_id:
            orders_qs = orders_qs.filter(branch_id=branch_id)
        orders_qs = orders_qs.order_by("-updated_at")

        rows = [
            {
                "order_id": o.id,
                "reference_number": o.reference_number,
                "customer_name": o.customer_name,
                "item_description": o.item_description,
                "confirmed_price": str(o.confirmed_price or 0),
                "branch_id": o.branch_id,
                "branch_name": o.branch.name,
                "dispatched_at": o.updated_at.isoformat(),
            }
            for o in orders_qs
        ]
        total = sum(Decimal(r["confirmed_price"]) for r in rows)
        return Response({"orders": rows, "total_revenue": str(total), "count": len(rows)})


# ---------------------------------------------------------------------------
# Reports: Combined Sales Ledger ("mkeka")
# ---------------------------------------------------------------------------

class CombinedSalesLedgerView(APIView):
    """
    GET /api/reports/combined-sales-ledger/
    Query params: date_from, date_to, branch_id
    Merges showroom sales and dispatched custom orders into one
    chronological, type-tagged ledger with subtotals per type.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != DIRECTOR:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)

        date_from, date_to = _parse_date_params(request)
        branch_id = request.query_params.get("branch_id")

        sales_qs = Sale.objects.select_related("item", "branch")
        if date_from:
            sales_qs = sales_qs.filter(sold_at__date__gte=date_from)
        if date_to:
            sales_qs = sales_qs.filter(sold_at__date__lte=date_to)
        if branch_id:
            sales_qs = sales_qs.filter(branch_id=branch_id)

        orders_qs = Order.objects.filter(status=Order.Status.DISPATCHED).select_related("branch")
        if date_from:
            orders_qs = orders_qs.filter(updated_at__date__gte=date_from)
        if date_to:
            orders_qs = orders_qs.filter(updated_at__date__lte=date_to)
        if branch_id:
            orders_qs = orders_qs.filter(branch_id=branch_id)

        rows = []
        for s in sales_qs:
            rows.append({
                "type": "SHOWROOM",
                "reference": f"SL-{s.id:06d}",
                "description": f"{s.item.name} x{s.quantity_sold}",
                "branch_id": s.branch_id,
                "branch_name": s.branch.name,
                "amount": str(s.sale_price),
                "date": s.sold_at.isoformat(),
            })
        for o in orders_qs:
            rows.append({
                "type": "CUSTOM",
                "reference": o.reference_number,
                "description": o.item_description,
                "branch_id": o.branch_id,
                "branch_name": o.branch.name,
                "amount": str(o.confirmed_price or 0),
                "date": o.updated_at.isoformat(),
            })

        rows.sort(key=lambda r: r["date"], reverse=True)

        showroom_total = sum((Decimal(r["amount"]) for r in rows if r["type"] == "SHOWROOM"), Decimal(0))
        custom_total = sum((Decimal(r["amount"]) for r in rows if r["type"] == "CUSTOM"), Decimal(0))
        return Response({
            "rows": rows,
            "subtotals": {
                "showroom": str(showroom_total),
                "custom": str(custom_total),
            },
            "grand_total": str(showroom_total + custom_total),
        })


# ---------------------------------------------------------------------------
# Reports: Stock Availability
# ---------------------------------------------------------------------------

class StockAvailabilityReportView(APIView):
    """
    GET /api/reports/stock-availability/
    Query params: branch_id (applies to showroom stock only — raw
    materials are company-wide and have no branch dimension)
    Current-state snapshot of raw material and showroom stock levels.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != DIRECTOR:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)

        from stock.models import InventoryItem

        branch_id = request.query_params.get("branch_id")

        materials = [
            {
                "id": i.id,
                "name": i.name,
                "unit": i.unit,
                "current_quantity": str(i.current_quantity),
                "minimum_threshold": str(i.minimum_threshold),
                "is_low_stock": i.is_low_stock,
                "unit_cost": str(i.unit_cost) if i.unit_cost is not None else None,
                "worth": str((i.unit_cost or 0) * i.current_quantity),
            }
            for i in InventoryItem.objects.order_by("name")
        ]
        materials_worth_total = sum((Decimal(m["worth"]) for m in materials), Decimal(0))

        showroom_qs = ShowroomItem.objects.filter(
            status=ShowroomItem.Status.AVAILABLE
        ).select_related("branch")
        if branch_id:
            showroom_qs = showroom_qs.filter(branch_id=branch_id)

        showroom = [
            {
                "id": s.id,
                "sku": s.sku,
                "name": s.name,
                "branch_id": s.branch_id,
                "branch_name": s.branch.name,
                "quantity": s.quantity,
                "unit_worth": str(s.cost_price or s.price),
                "worth": str((s.cost_price or s.price) * s.quantity),
            }
            for s in showroom_qs.order_by("branch__name", "name")
        ]
        showroom_worth_total = sum((Decimal(s["worth"]) for s in showroom), Decimal(0))

        return Response({
            "raw_materials": materials,
            "raw_materials_worth_total": str(materials_worth_total),
            "showroom_stock": showroom,
            "showroom_worth_total": str(showroom_worth_total),
        })


# ---------------------------------------------------------------------------
# Reports: Individual Technician Pay
# ---------------------------------------------------------------------------

def _format_duration(start, end) -> str | None:
    """Human-readable elapsed time between two datetimes, e.g. '2d 3h' or '5h 20m'."""
    if not start or not end:
        return None
    seconds = (end - start).total_seconds()
    if seconds < 0:
        return None
    hours_total = seconds / 3600
    days, hours = divmod(hours_total, 24)
    if days >= 1:
        return f"{int(days)}d {int(hours)}h"
    minutes = (hours_total - int(hours_total)) * 60
    if hours_total >= 1:
        return f"{int(hours_total)}h {int(minutes)}m"
    return f"{int(minutes)}m"


class IndividualTechnicianPayReportView(APIView):
    """
    GET /api/reports/technician-pay/
    Query params: technician_id (required), date_from, date_to
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != DIRECTOR:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)

        technician_id = request.query_params.get("technician_id")
        if not technician_id:
            return Response({"errors": {"technician_id": [_REQUIRED]}}, status=400)

        date_from, date_to = _parse_date_params(request)

        try:
            technician = User.objects.get(pk=technician_id, role=User.Role.TECHNICIAN)
        except (User.DoesNotExist, ValueError):
            return Response({"detail": "Technician not found."}, status=404)

        payments_qs = TechnicianPayment.objects.filter(
            technician_id=technician_id
        ).select_related("stage", "stage__order")
        if date_from:
            payments_qs = payments_qs.filter(created_at__date__gte=date_from)
        if date_to:
            payments_qs = payments_qs.filter(created_at__date__lte=date_to)
        payments_qs = payments_qs.order_by("-created_at")

        rows = [
            {
                "id": p.id,
                "stage_name": p.stage.stage_name,
                "order_reference": p.stage.order.reference_number,
                "item_description": p.stage.order.item_description,
                "amount": str(p.amount),
                "status": p.status,
                "date": p.created_at.isoformat(),
                "settled_at": p.settled_at.isoformat() if p.settled_at else None,
                "time_spent": _format_duration(p.stage.activated_at, p.stage.completed_at),
            }
            for p in payments_qs
        ]
        total = sum((Decimal(r["amount"]) for r in rows), Decimal(0))
        return Response({
            "technician_id": technician.id,
            "technician_name": technician.get_full_name() or technician.username,
            "payments": rows,
            "total": str(total),
        })


# ---------------------------------------------------------------------------
# Reports: Snapshot (current-state dashboard)
# ---------------------------------------------------------------------------

class SnapshotReportView(APIView):
    """
    GET /api/reports/snapshot/
    No date filter — current-state dashboard: inventory worth by branch,
    orders grouped by status, stock levels, sold items by branch.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != DIRECTOR:
            return Response({"detail": _NOT_AUTHORIZED}, status=403)

        from stock.models import InventoryItem

        branches = Branch.objects.order_by("name")
        by_branch = []
        for b in branches:
            avail_qs = ShowroomItem.objects.filter(branch=b, status=ShowroomItem.Status.AVAILABLE)
            worth = sum(((i.cost_price or i.price) * i.quantity for i in avail_qs), Decimal(0))
            showroom_sold = Sale.objects.filter(branch=b).aggregate(
                count=Count("id"), units=Sum("quantity_sold")
            )
            custom_sold = Order.objects.filter(branch=b, status=Order.Status.DISPATCHED).count()
            by_branch.append({
                "branch_id": b.id,
                "branch_name": b.name,
                "inventory_worth": str(worth),
                "showroom_items_sold": showroom_sold["count"] or 0,
                "showroom_units_sold": showroom_sold["units"] or 0,
                "custom_orders_sold": custom_sold,
            })

        orders_by_status = [
            {"status": row["status"], "count": row["count"]}
            for row in Order.objects.values("status").annotate(count=Count("id")).order_by("status")
        ]

        materials = [
            {
                "id": i.id,
                "name": i.name,
                "unit": i.unit,
                "current_quantity": str(i.current_quantity),
                "is_low_stock": i.is_low_stock,
            }
            for i in InventoryItem.objects.order_by("name")
        ]

        return Response({
            "by_branch": by_branch,
            "orders_by_status": orders_by_status,
            "raw_materials": materials,
        })
