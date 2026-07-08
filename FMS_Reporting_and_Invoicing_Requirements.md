# FMS — Reporting, Invoicing & Catalogue Requirements

**Source:** Customer feedback (July 2026)
**Purpose:** Turn raw feedback into precise, testable requirements, mapped against what the system already does, so we only build what is actually missing.

---

## Status legend

| Tag | Meaning |
|-----|---------|
| ✅ **Done** | Already implemented; feedback is satisfied (may only need surfacing in UI). |
| 🟡 **Partial** | Data/UI partly exists; needs extension or a proper report screen. |
| 🔴 **Missing** | Not built. New model / endpoint / screen required. |

**Key architectural note:** the backend `reports` app is currently an **empty stub** (`backend/reports/{models,views,urls}.py` are placeholders, no migrations). Today all "reporting" is done **client-side** — the frontend fetches raw lists (orders, sales, payments) and aggregates in the browser (e.g. `components/shop/shop-reports-screen.tsx`, `components/director/revenue-view.tsx`). This works for small data but does not scale and cannot express server-side timeframe/branch aggregation cleanly. **Recommendation:** build dedicated aggregation endpoints under the `reports` app and have report screens consume those.

---

## 0. Cross-cutting requirements (apply to every report)

| # | Requirement | Current state | Change needed |
|---|-------------|---------------|---------------|
| X1 | Every report is **filterable by branch** (single branch or all). | 🟡 Partial — some screens filter client-side; `Order`, `Sale`, `ShowroomItem`, `Quote` all carry `branch` FK, so the data supports it. | Add branch filter param to report endpoints; standardise the branch selector across all report screens. |
| X2 | Every report is **filterable by timeframe** (date-from / date-to, plus quick presets: this week / month / quarter). | 🟡 Partial — `weekly-report-view.tsx` has a week selector; `shop-reports-screen.tsx` has date-from/to; no shared, server-side timeframe filter. | Standard `date_from` / `date_to` query params on all report endpoints; reusable timeframe picker component. |
| X3 | Reports render as **charts (pie + bar/line), not just tables** — "I want to see diagrams, piechart". | 🟡 Partial — `recharts` is installed; `revenue-view.tsx` already uses `PieChart` + `BarChart`. `shop-reports-screen.tsx` and most others are **tables only**. | Add pie/bar charts to every report screen where the feedback asks for a diagram (sales, inventory, per-stage cost, branch performance). |
| X4 | **Every report screen must be downloadable as a PDF** (confirmed hard requirement, not optional). | 🔴 Missing entirely — no export capability anywhere in the frontend today. | Add a "Download PDF" action to every report screen (§1–§7): renders the currently-applied branch + timeframe filters and any charts into a PDF, not just the raw table. Needs a shared PDF-generation approach (e.g. render the report view to PDF client-side, or a server-side endpoint that returns `application/pdf` for the same filtered dataset) so it isn't rebuilt per screen. Distinct from the Invoice PDF (§8), which is a single transaction document rather than an aggregated report. |

---

## 1. Showroom sales & inventory report

> Feedback: *"Reports for showroom sales and inventory worth — tumeuza kiasi flani, tumeadd kiasi flani, cost kiasi flani"*
> (= how much we **sold**, how much we **added**, and the **cost**, within a timeframe.)

| # | Requirement | Current state | Change needed |
|---|-------------|---------------|---------------|
| 1.1 | **Amount sold** in timeframe (value + units), per branch. | 🟡 Partial — `shop-reports-screen.tsx` computes `totalSalesValue` and `unitsSold` from `Sale`. | Move aggregation server-side; add branch + timeframe params; add chart. |
| 1.2 | **Amount added** (new stock brought into showroom) in timeframe. | 🔴 Missing — `ShowroomItem` has `created_at` and `quantity`, but there is no "units added in period" metric anywhere. | Add an "items/units added" aggregation over `ShowroomItem.created_at` (and any restock events). |
| 1.3 | **Cost** of goods (so we can see margin, not just revenue). | 🔴 **Missing — blocker.** `ShowroomItem` has only `price` (retail). There is **no cost/purchase price** field, so true cost and margin cannot be computed. "Unsold value" today is retail value, not cost. | **Add a cost field** (`cost_price` / `unit_cost`) to `ShowroomItem` (and to inventory — see §6). Without it, "cost kiasi flani" is impossible. |
| 1.4 | **Inventory worth** (valuation of unsold showroom stock) in timeframe, per branch. | 🟡 Partial — `shop-reports-screen.tsx` shows `unsoldValue` but at **retail price**. | Decide valuation basis (cost vs retail) — depends on 1.3. Show both if useful. |
| 1.5 | Present as diagram/pie chart, filterable by branch & timeframe. | 🔴 Missing — screen is tables only. | Add charts (X3). |

---

## 2. Technician / production reports

> Feedback: *"Each stage imetumia kiasi gani in a certain timeframe. Which stage is more expensive — group expenses per stage."*
> Superseding clarification: *"Technician reports → by tasks, cost, and comparison of earnings between stages or technicians — easily shown in a graph of bars, au downloadable."*

| # | Requirement | Current state | Change needed |
|---|-------------|---------------|---------------|
| 2.1 | **Cost per production stage** within a timeframe (how much each stage consumed). | 🟡 Partial — data exists: `ProductionStage.agreed_wage`, `TechnicianPayment.amount`, timestamps (`activated_at`, `completed_at`, `settled_at`). `cost-breakdown.tsx` already aggregates payments. | Add **grouping by `stage_name`** and a timeframe filter; expose as an endpoint. |
| 2.2 | **Which stage is most expensive** — rank/group total expense per stage. | 🟡 Partial — cost data exists; grouping-by-stage view not confirmed. | Aggregate `SUM(amount)` grouped by `stage_name`, sorted desc; show as bar chart. |
| 2.3 | **Cost per stage includes materials**, not just labour. | 🔴 Missing (depends on §6) — material issuance (`Issuance`) has quantity but no cost, so a stage's *material* cost cannot be valued. | Requires inventory unit-cost (§6). Then stage cost = labour (`TechnicianPayment`) + materials (`Issuance` × unit cost). |
| 2.4 | **Per-technician tasks report** — count/list of stages by status (pending, active, done), within timeframe. | 🟡 Partial — `ProductionStage.status` already has `PENDING` / `ACTIVE` / `DONE`; no per-technician status-count view exists yet. | Per-technician summary: count of stages by status, within timeframe. |
| 2.5 | **Per-technician cost report** — wages (`TechnicianPayment.amount`, paid vs. pending), within timeframe. | 🟡 Partial — `payroll-view.tsx` + `cost-breakdown.tsx` show payments; `TechnicianPayment` has `technician`, `amount`, `status`. | Per-technician summary: total wages (paid + pending), within timeframe. |
| 2.6 | **Comparison of earnings between stages or between technicians** — e.g. "which technician earned most", "which stage pays out most" — as a bar chart, and downloadable as PDF (ties to §0.X3/X4). | 🔴 Missing — no ranking/comparison view exists; §2.2 covers stage comparison but there's no technician-vs-technician view. | Single comparison endpoint/view: bar chart ranking technicians (or stages) by total earnings in a timeframe; reuse for both axes (by technician, by stage). |

**Note:** this clarification **supersedes** the earlier split of "cost basis" and "tasks" into separate per-technician summaries — those are folded into 2.4/2.5 above, with 2.6 added as the explicit comparison/ranking view.

---

## 3. Branch performance report

> Feedback: *"Reports on branches performance — graph tuone, who is a better performer."*

| # | Requirement | Current state | Change needed |
|---|-------------|---------------|---------------|
| 3.1 | Compare branches on performance (revenue, sales volume, orders completed) in a timeframe. | 🟡 Partial — `branches-view.tsx` exists; `revenue-view.tsx` has per-branch pie chart. | Define "performance" metrics (see 3.2); build a comparison endpoint. |
| 3.2 | Agree the performance metric set: e.g. revenue, units sold, orders fulfilled, avg margin. | 🔴 Undecided — **needs product decision.** | Confirm which KPIs rank a branch as "better performer". |
| 3.3 | Show as **graph** comparing branches side by side, ranked. | 🟡 Partial — charts exist elsewhere; branch-comparison bar chart to be added. | Add ranked bar chart. |

---

## 4. Sales, revenue & cost report

> Feedback: *"Reports on sales and revenue and cost."*

| # | Requirement | Current state | Change needed |
|---|-------------|---------------|---------------|
| 4.1 | Revenue report (shop sales + custom order revenue) by timeframe/branch. | 🟡 Partial — `revenue-view.tsx` splits shop vs custom revenue with charts, using `Sale` + `Order.confirmed_price`. | Add timeframe/branch params server-side; keep existing charts. |
| 4.2 | **Cost** report alongside revenue (COGS + labour + materials) to show profit. | 🔴 Missing — no COGS (needs 1.3 / §6); labour cost exists via `TechnicianPayment`. | Requires cost fields (§6). Then revenue − cost = margin. |

---

## 5. Custom-order tasks report

> Feedback: *"Reports on tasks done within a timeframe — should be filterable by items and categories."*

| # | Requirement | Current state | Change needed |
|---|-------------|---------------|---------------|
| 5.1 | List/aggregate **tasks (stages) completed** in a timeframe. | 🟡 Partial — `ProductionStage.completed_at` + status `DONE` support this. | Add endpoint aggregating completed stages by timeframe. |
| 5.2 | **Filter by item and by category.** | 🔴 Missing — `Order.item_description` is free text; orders are **not linked to a `Category`** (only `ShowroomItem`/`CatalogueProduct` carry `Category`). | To filter tasks by category, orders/stages need a **category reference** (or item type). Product decision + schema change. |

---

## 6. Stock purchase report  ← foundational for all "cost" reporting

> Feedback: *"Reports on stock purchases."*

| # | Requirement | Current state | Change needed |
|---|-------------|---------------|---------------|
| 6.1 | Report on stock **purchased** (what, quantity, cost, when) in a timeframe. | 🟡 Partial — `RestockRequest` has `item_name`, `quantity_needed`, `estimated_cost`, `status`. But this is a *request/estimate*, **not a recorded purchase** with actual cost/date received. | Add a **StockPurchase / GoodsReceived** record (actual qty, actual unit cost, received date, supplier) OR extend `RestockRequest` with actual-cost + received fields. |
| 6.2 | **Unit cost on inventory** so materials consumed and stock value can be costed. | 🔴 **Missing — cross-cutting blocker.** `InventoryItem` has no cost field; `Issuance` has no cost. | Add `unit_cost` to `InventoryItem` (or derive from purchases via weighted-average). Unblocks 1.3, 2.4, 4.2. |

> ⚠️ **Dependency:** requirements 1.3, 2.4, 4.2 and 6.1 all depend on introducing **cost data**. Recommend scheduling §6 first.

---

## 7. Showroom & custom-sales catalogue report

> Feedback: *"Reports on showroom and custom sales catalogue."*

| # | Requirement | Current state | Change needed |
|---|-------------|---------------|---------------|
| 7.1 | Catalogue coverage report (which `CatalogueProduct`s sell / convert to quotes/orders). | 🟡 Partial — `CatalogueProduct` and `Quote.catalogue_item` exist. | Build a catalogue-performance view if needed (confirm scope). |

---

## 8. Invoice feature (Director)

> Feedback: *"Invoice feature iwe kwa director"* + reference: *"Custom Furniture Store Invoice Template (PDF)".*

| # | Requirement | Current state | Change needed |
|---|-------------|---------------|---------------|
| 8.1 | Director can **generate an invoice** (for a custom order / shop sale). | 🔴 **Missing** — no `Invoice` model anywhere in the codebase. | New `Invoice` model: number, customer, line items, amounts, tax, dates, link to `Order`/`Sale`, created_by (director). |
| 8.2 | Invoice matches the **provided PDF template** layout (store header/logo, invoice #, bill-to, itemised lines, subtotal/tax/total, terms). | ✅ **Spec confirmed** — sample reviewed (`Custom Furniture Store Invoice Template - 000107.pdf`). It's a **generic** layout, not furniture-specific — see field breakdown below. | Build a print/PDF template mirroring this layout, populated from our data. |
| 8.3 | Invoice generation is **restricted to the Director** role. | 🟡 Enforceable — `User.Role.DIRECTOR` exists. | Add role-gated endpoint + UI under the director portal. |
| 8.4 | Invoice numbering is unique/sequential. | 🔴 Missing. | Define numbering scheme (see naming-conventions doc). |

### 8.5 Confirmed template layout (from sample PDF)

Single-page, 3-band layout — purple header/footer, white body:

- **Header band:** "INVOICE" title, right-aligned (store logo would go top-left, currently blank).
- **Bill From** (our store) / **Bill To** (customer), side by side, plus **Issue Date** / **Due Date** top-right.
- **Line items table:** `Description | Price | QTY | Total` — 6 blank rows in the sample (should be dynamic/repeatable in ours).
- **Totals block** (bottom-right of table): `Subtotal`, `Tax`, **`Total Due`** (bold).
- **Footer band:** `Payment Terms` and `Notes`, free text.

**Mapping to our data model** (no furniture-specific fields in the template — order reference, stage breakdown, technician, etc. are internal detail, not invoice-facing):

| Template field | Source |
|---|---|
| Bill From | `Branch` (name, location) or company-wide settings |
| Bill To | `Order.customer_name` / `customer_phone`, or `Sale` buyer |
| Issue Date | `Invoice.created_at` |
| Due Date | `Invoice.due_date` (new field — needs a payment-terms default, e.g. net 7/14/30) |
| Description / Price / QTY / Total (rows) | New `InvoiceLineItem` model, seeded from `Order` (custom) or `Sale` (showroom) — one row per item, or one summary row for a custom order |
| Subtotal / Tax / Total Due | Computed from line items; **tax rate/policy needs confirming** (VAT? none?) |
| Payment Terms / Notes | Free-text fields on `Invoice` |

**Open question:** does the template's blank **Tax** field mean tax is optional/not currently applied? Confirm with customer whether invoices need VAT or are tax-exempt, since the template leaves it unfilled.

---

## Summary — what to build vs. what exists

### 🔴 New work — schema / models
1. **Inventory & item cost** (`InventoryItem.unit_cost`, `ShowroomItem.cost_price`) — unblocks all cost/margin reporting. *(Do first.)*
2. **StockPurchase / goods-received** record with actual cost — §6.1
3. **Invoice** model + PDF template, director-gated — §8
4. **Category/item link on custom orders** (to filter tasks by item/category) — §5.2

### 🔴 New work — reporting layer
5. Build the empty `reports` app into **real aggregation endpoints** (branch + timeframe params) feeding: showroom sales/inventory (§1), per-stage cost (§2), branch performance (§3), sales/revenue/cost (§4), tasks (§5), stock purchases (§6), catalogue (§7).
6. Add **charts** (pie/bar) to every report screen — §0.X3.
7. Add **PDF download** to every report screen — §0.X4 (confirmed hard requirement).

### ❓ Needs a customer/product decision
- Branch "performance" KPI definition — §3.2
- Inventory valuation basis: cost vs retail — §1.4
- Scope of catalogue-performance report — §7.1

---

## Suggested build order
1. **Cost foundation** (§6.2, §1.3) — add cost fields. *Everything downstream needs this.*
2. **Reports app + aggregation endpoints** (§0, §5) — server-side branch/timeframe.
3. **Charts + PDF download** on existing + new report screens (§0.X3–X4).
4. **Stock purchase tracking** (§6.1).
5. **Invoice feature** (§8) — independent, can run in parallel.
6. **Task-by-category filtering** (§5.2) — after order/category link decided.
