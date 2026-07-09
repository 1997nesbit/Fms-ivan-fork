"use client"

import { useState } from "react"
import {
  BarChart3, TrendingUp, ShoppingBag, Hammer, Layers, Store,
  User, Users, Wallet, FileText, Package, LayoutDashboard,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { ReportFilterState } from "./report-filters"
import { ReportFilterBar } from "./report-filters"
import { GrossReportTab } from "./gross-report"
import { ShowroomSalesReportTab } from "./showroom-sales-report"
import { CustomOrderSalesReportTab } from "./custom-order-sales-report"
import { CombinedLedgerReportTab } from "./combined-ledger-report"
import { OfficeExpensesReportTab } from "./office-expenses-report"
import { StockAvailabilityReportTab } from "./stock-availability-report"
import { IndividualTechnicianPayReportTab } from "./individual-technician-pay-report"
import { GroupedTechnicianPayReportTab } from "./grouped-technician-pay-report"
import { SnapshotReportTab } from "./snapshot-report"
import { InvoiceScreen } from "@/components/director/invoice-screen"
import { ShopReportsScreen } from "@/components/shop/shop-reports-screen"

type ReportKey =
  | "gross" | "showroom-sales" | "custom-order-sales" | "combined-ledger" | "shop-reports"
  | "technician-pay-individual" | "technician-pay-grouped"
  | "office-expenses" | "invoices"
  | "stock-availability" | "snapshot"

interface ReportMeta {
  key: ReportKey
  label: string
  description: string
  icon: LucideIcon
  usesFilters: boolean
}

interface ReportCategory {
  label: string
  icon: LucideIcon
  reports: ReportMeta[]
}

const CATEGORIES: ReportCategory[] = [
  {
    label: "Sales & Revenue",
    icon: TrendingUp,
    reports: [
      { key: "gross", label: "Gross Report", description: "All-branch revenue overview", icon: TrendingUp, usesFilters: true },
      { key: "showroom-sales", label: "Showroom Sales", description: "Showroom transactions & revenue", icon: ShoppingBag, usesFilters: true },
      { key: "custom-order-sales", label: "Custom Order Sales", description: "Dispatched custom orders", icon: Hammer, usesFilters: true },
      { key: "combined-ledger", label: "Combined Ledger", description: "Merged sales feed with subtotals", icon: Layers, usesFilters: true },
      { key: "shop-reports", label: "Shop Reports", description: "Showroom sales & inventory value", icon: Store, usesFilters: false },
    ],
  },
  {
    label: "Payroll",
    icon: Users,
    reports: [
      { key: "technician-pay-individual", label: "Individual Technician", description: "Tasks, pay & time spent per technician", icon: User, usesFilters: true },
      { key: "technician-pay-grouped", label: "Grouped Technician", description: "Pay by stage & by technician", icon: Users, usesFilters: true },
    ],
  },
  {
    label: "Finance",
    icon: Wallet,
    reports: [
      { key: "office-expenses", label: "Office Expenses", description: "Restock fund requests", icon: Wallet, usesFilters: true },
      { key: "invoices", label: "Invoices", description: "Create & manage invoices", icon: FileText, usesFilters: false },
    ],
  },
  {
    label: "Inventory & Operations",
    icon: Package,
    reports: [
      { key: "stock-availability", label: "Stock Availability", description: "Raw material & showroom stock", icon: Package, usesFilters: true },
      { key: "snapshot", label: "Snapshot", description: "Current-state dashboard", icon: LayoutDashboard, usesFilters: false },
    ],
  },
]

const ALL_REPORTS = CATEGORIES.flatMap((c) => c.reports)

export function ReportsPortal() {
  const [tab, setTab] = useState<ReportKey>("gross")
  const [filters, setFilters] = useState<ReportFilterState>({ dateFrom: "", dateTo: "", branchId: "" })

  const activeMeta = ALL_REPORTS.find((r) => r.key === tab)!

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <BarChart3 className="size-5" />
        </span>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-balance">Reports</h2>
          <p className="text-sm text-muted-foreground">
            All business reports in one place — filter by date range and branch, then export any report as a PDF.
          </p>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-[260px_1fr]">
        {/* Category nav — desktop only */}
        <nav className="hidden min-w-0 flex-col gap-5 md:flex md:border-r md:border-border md:pr-4">
          {CATEGORIES.map((cat) => (
            <div key={cat.label} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 px-2 pb-1">
                <cat.icon className="size-3.5 text-muted-foreground" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {cat.label}
                </p>
              </div>
              {cat.reports.map((r) => {
                const isActive = tab === r.key
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setTab(r.key)}
                    className={cn(
                      "flex items-start gap-2.5 rounded-md border-l-2 px-2.5 py-2 text-left transition-colors",
                      isActive
                        ? "border-l-primary bg-accent"
                        : "border-l-transparent hover:bg-muted",
                    )}
                  >
                    <r.icon
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        isActive ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className={cn("text-sm font-medium leading-tight", isActive ? "text-foreground" : "text-foreground/90")}>
                        {r.label}
                      </span>
                      <span className="text-xs leading-tight text-muted-foreground">
                        {r.description}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Active report */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* Report picker — mobile only */}
          <div className="flex flex-col gap-1 md:hidden">
            <label className="text-xs font-medium text-muted-foreground">Report</label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={tab}
              onChange={(e) => setTab(e.target.value as ReportKey)}
            >
              {CATEGORIES.map((cat) => (
                <optgroup key={cat.label} label={cat.label}>
                  {cat.reports.map((r) => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{activeMeta.description}</p>
          </div>

          {activeMeta.usesFilters && <ReportFilterBar value={filters} onChange={setFilters} />}

          {tab === "gross" && <GrossReportTab filters={filters} />}
          {tab === "showroom-sales" && <ShowroomSalesReportTab filters={filters} />}
          {tab === "custom-order-sales" && <CustomOrderSalesReportTab filters={filters} />}
          {tab === "combined-ledger" && <CombinedLedgerReportTab filters={filters} />}
          {tab === "shop-reports" && <ShopReportsScreen />}
          {tab === "technician-pay-individual" && <IndividualTechnicianPayReportTab filters={filters} />}
          {tab === "technician-pay-grouped" && <GroupedTechnicianPayReportTab filters={filters} />}
          {tab === "office-expenses" && <OfficeExpensesReportTab filters={filters} />}
          {tab === "invoices" && <InvoiceScreen />}
          {tab === "stock-availability" && <StockAvailabilityReportTab filters={filters} />}
          {tab === "snapshot" && <SnapshotReportTab />}
        </div>
      </div>
    </div>
  )
}
