from decimal import Decimal

from .models import Invoice, InvoiceLineItem, Payment


def _next_invoice_number():
    last = Invoice.objects.order_by("-id").first()
    seq = (last.id + 1) if last else 1
    return f"INV-{seq:06d}"


def create_invoice_for_order(order, user, advance_payment=None):
    """Auto-creates the invoice for a freshly-placed batch order: one line
    item per OrderItem (priced at quoted_price until confirmed), and — if
    the customer paid a deposit at order creation — that deposit as the
    invoice's first Payment."""
    inv = Invoice.objects.create(
        invoice_number=_next_invoice_number(),
        order=order,
        branch=order.branch,
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        issue_date=order.created_at.date(),
        created_by=user,
    )
    for item in order.items.all():
        InvoiceLineItem.objects.create(
            invoice=inv,
            order_item=item,
            description=item.name,
            unit_price=item.confirmed_price or item.quoted_price or Decimal("0"),
        )
    if advance_payment:
        Payment.objects.create(
            invoice=inv,
            amount=advance_payment,
            note="Advance payment at order creation",
            recorded_by=user,
        )
        inv.recompute_status()
    return inv


def sync_invoice_line_items(order):
    """Called whenever an order's item prices are confirmed — keeps every
    linked InvoiceLineItem's unit_price current, then re-derives the
    invoice's payment status against the new subtotal."""
    invoices = order.invoices.prefetch_related("line_items", "payments").all()
    for inv in invoices:
        for line in inv.line_items.select_related("order_item"):
            item = line.order_item
            if item is None:
                continue
            price = item.confirmed_price or item.quoted_price or Decimal("0")
            if line.unit_price != price:
                line.unit_price = price
                line.save(update_fields=["unit_price"])
        inv.recompute_status()
