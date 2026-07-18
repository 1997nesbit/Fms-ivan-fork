# Batch Orders, Per-Item Production Splitting, and Invoice Payments — Design

Date: 2026-07-18
Status: Approved for planning

## Problem

Today an `Order` is a single furniture item (one `item_description` free-text field). Clients who order multiple related items (e.g. a sofa + coffee table) have no way to place one comprehensive order — Front Desk creates separate orders, losing the "these belong together" relationship and forcing vague, unstructured descriptions instead of per-item notes/measurements/photos.

On the production side, `ProductionStage` belongs to the whole `Order`, so there is no way to send one item to Artisan A for Stage 1 while another item in the same order goes to Artisan B — everything in an order moves through the same stage pipeline together.

On the financial side, `Invoice.status` is a flat `DRAFT`/`ISSUED`/`PAID` enum. There is no `Payment` model anywhere in the codebase — no way to record an advance payment, no partial-payment state, and no way to revisit an invoice later to log a new installment when a client pays down their balance.

## Goals

1. Let Front Desk place a single batch order containing multiple items under one Order ID, each item with its own notes, measurements, and photos.
2. Let the Operations Manager see a batch order as one unit but split, assign, and independently track production stages per item, across different artisans.
3. Let invoices show each item by name, record an advance payment at order creation, track partial-payment status and remaining balance, and allow new installments to be logged later against an existing invoice.

## Non-Goals

- Changing technician wage/payout tracking (`TechnicianPayment`) — out of scope, unaffected.
- Structured/numeric measurement fields — measurements stay free text, matching the existing notes field pattern.
- Multi-branch or multi-currency invoicing — out of scope.
- Front Desk logging payment installments after the initial advance — installments after the advance are Director/Reports-only.

## Architecture Overview

Three phases, each building on the last:

- **Phase 1 — Batch Orders**: `Order` gains child `OrderItem` rows (name, notes, measurements, photos, pricing) replacing the single `item_description` field.
- **Phase 2 — Per-Item Production**: `ProductionStage` moves from belonging to `Order` to belonging to `OrderItem`. Each item runs its own independent Stage 1 → Stage 2 → ... pipeline with its own artisan assignments. `Order.status` becomes computed from the aggregate of item statuses.
- **Phase 3 — Invoice Payments**: a new `Payment` model tracks installments against an `Invoice`. `Invoice.status` gains a computed `PARTIALLY_PAID` state, and a `balance_remaining` property. The advance payment recorded by Front Desk at order creation becomes the invoice's first `Payment` row.

Phase 2 depends on Phase 1 (needs `OrderItem` to exist). Phase 3 depends on Phase 1 for item names on line items, but its payment/installment mechanics are otherwise independent.

## Phase 1: Batch Orders

### Data model (`backend/orders/models.py`)

New `OrderItem`:
- `order` — FK to `Order`
- `name` — short label (e.g. "3-Seater Sofa")
- `notes` — free text (replaces `Order.item_description`)
- `measurements` — free text
- `quoted_price` / `confirmed_price` — moved from `Order` to per-item

`Order` gains a computed `total_price` property summing its items' prices. `item_description`, `quoted_price`, `confirmed_price` are removed from `Order` after the data migration below.

`OrderImage` FK changes from `Order` → `OrderItem`. Each item has its own photo set instead of one shared pool per order.

### Data migration

For every existing `Order` row:
1. Create one `OrderItem` carrying over `item_description` → `notes`, `quoted_price`, `confirmed_price`.
2. Re-point existing `OrderImage` rows from the order to that new item.
3. Drop the now-unused fields from `Order`.

This is a data migration (not just schema) — it must run in the same deploy as the schema change, backfilling before the old columns are dropped. Existing orders keep working, represented as 1-item batches. Verify row counts before/after (order count == OrderItem count immediately post-migration).

### Frontend

`components/front-desk/create-order-dialog.tsx` becomes a repeatable item list: an "Add another item" control, each row with name, notes, measurements, and its own photo upload (reusing the existing per-file image-type validation and thumbnail preview already built for the current single upload). The order-level advance-payment amount field (Phase 3) lives once at the bottom of this same form, since payment is per-order, not per-item.

## Phase 2: Per-Item Production Splitting

### Data model (`backend/production/models.py`)

`ProductionStage` FK changes from `Order` → `OrderItem`. Each item independently owns its sequence of stages (`sequence_number` unique per item, not per order), each stage still has one `assigned_technician`, `agreed_wage`, `allotted_time`, `status`. Stage auto-activation logic (`CompleteStageView`) keys off the item's stage sequence instead of the order's.

`AssignStagesView` becomes per-item: it replaces one `OrderItem`'s stage plan, not the whole order's.

### Order status rollup

`Order.status` becomes a computed property derived from all its items' pipeline states:
- `IN_PRODUCTION` while any item has an active (non-DONE, non-PENDING) stage
- `WORKSHOP_COMPLETE` only once every item's final stage is `DONE`
- Existing pre-production statuses (`PENDING`, `PRICE_REVIEW`, `OPS_QUEUE`) still apply at the order level until any item enters production

No manual order-status field for the production range — it can't drift out of sync with item reality.

### Frontend

`components/operations/assign-stages-dialog.tsx` gains an item selector — Ops Manager opens a batch order, picks an item, assigns/splits that item's stage plan. `ops-queue.tsx` and `pipeline-board.tsx` cards show per-item progress within one order card (e.g. "Item 1: Stage 2 — Artisan X · Item 2: Stage 1 — Artisan Y") instead of one progress bar per order.

## Phase 3: Invoice Payments

### Data model (`backend/reports/models.py`)

New `Payment`:
- `invoice` — FK to `Invoice`
- `amount`
- `paid_at`
- `recorded_by` — FK to user
- `note` — optional

`Invoice` is auto-created 1:1 at `Order` creation time, using `quoted_price` for each `InvoiceLineItem` initially. Line items and totals are kept in sync automatically as item prices are confirmed during `PRICE_REVIEW` (switching from `quoted_price` to `confirmed_price` once set). Creating the invoice immediately gives the Front Desk advance payment something to attach to. `Invoice.status` becomes computed:
- `DRAFT` → `ISSUED` (existing transition, unchanged)
- `PARTIALLY_PAID` once `0 < sum(payments) < total`
- `PAID` once `sum(payments) >= total`

`Invoice` gains a `balance_remaining` computed property (`total - sum(payments)`).

The advance payment entered by Front Desk on the create-order form becomes the invoice's first `Payment` row, `recorded_by` the Front Desk user who created the order.

### Frontend

`components/director/invoice-screen.tsx` gets a "Log Payment" action (amount + optional note) that creates a `Payment` and refreshes the invoice's status/balance display. Item names already render via existing `InvoiceLineItem` support. `lib/generators/invoice.ts` (PDF export) is updated to show item names, payment history, and remaining balance.

## Error Handling

- Order creation: at least one `OrderItem` is required — reject batch orders with zero items.
- Stage assignment: an item's stages can only be reassigned wholesale while all of that item's stages are still `PENDING` (same rule as today, now scoped per item instead of per order).
- Payments: reject a `Payment` amount that would push `sum(payments)` negative or non-numeric; overpayment (payments exceeding total) is allowed but surfaced clearly (e.g. `balance_remaining` can show negative / "credit").
- Migration: abort and roll back if any `Order` fails to produce exactly one `OrderItem`, or any `OrderImage` fails to re-parent.

## Testing

- Backend: migration test asserting order count == OrderItem count post-migration and no orphaned `OrderImage` rows; stage-splitting tests confirming two items on one order can have independent active stages/artisans; payment-status computation tests covering zero, partial, exact, and over payment boundaries.
- Frontend: manual verification via the browser preview — create a batch order with 2+ items (each with notes/measurements/photo), split stages across two different artisans, log a partial payment, confirm the invoice screen and PDF reflect the correct balance and status.

