"use client"

import { useState } from "react"
import { BarChart3 } from "lucide-react"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  | "gross" | "showroom-sales" | "custom-order-sales" | "combined-ledger"
  | "office-expenses" | "stock-availability" | "technician-pay-individual"
  | "technician-pay-grouped" | "snapshot" | "invoices" | "shop-reports"

const REPORTS: { key: ReportKey; label: string; usesFilters: boolean }[] = [
  { key: "gross", label: "Gross Report", usesFilters: true },
  { key: "showroom-sales", label: "Showroom Sales", usesFilters: true },
  { key: "custom-order-sales", label: "Custom Order Sales", usesFilters: true },
  { key: "combined-ledger", label: "Combined Ledger", usesFilters: true },
  { key: "office-expenses", label: "Office Expenses", usesFilters: true },
  { key: "stock-availability", label: "Stock Availability", usesFilters: true },
  { key: "technician-pay-individual", label: "Technician Pay (Individual)", usesFilters: true },
  { key: "technician-pay-grouped", label: "Technician Pay (Grouped)", usesFilters: true },
  { key: "snapshot", label: "Snapshot", usesFilters: false },
  { key: "invoices", label: "Invoices", usesFilters: false },
  { key: "shop-reports", label: "Shop Reports", usesFilters: false },
]

export function ReportsPortal() {
  const [tab, setTab] = useState<ReportKey>("gross")
  const [filters, setFilters] = useState<ReportFilterState>({ dateFrom: "", dateTo: "", branchId: "" })

  const activeMeta = REPORTS.find((r) => r.key === tab)!

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

      <Tabs value={tab} onValueChange={(v) => setTab(v as ReportKey)}>
        <TabsList className="h-auto flex-wrap">
          {REPORTS.map((r) => (
            <TabsTrigger key={r.key} value={r.key}>{r.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {activeMeta.usesFilters && <ReportFilterBar value={filters} onChange={setFilters} />}

      {tab === "gross" && <GrossReportTab filters={filters} />}
      {tab === "showroom-sales" && <ShowroomSalesReportTab filters={filters} />}
      {tab === "custom-order-sales" && <CustomOrderSalesReportTab filters={filters} />}
      {tab === "combined-ledger" && <CombinedLedgerReportTab filters={filters} />}
      {tab === "office-expenses" && <OfficeExpensesReportTab filters={filters} />}
      {tab === "stock-availability" && <StockAvailabilityReportTab filters={filters} />}
      {tab === "technician-pay-individual" && <IndividualTechnicianPayReportTab filters={filters} />}
      {tab === "technician-pay-grouped" && <GroupedTechnicianPayReportTab filters={filters} />}
      {tab === "snapshot" && <SnapshotReportTab />}
      {tab === "invoices" && <InvoiceScreen />}
      {tab === "shop-reports" && <ShopReportsScreen />}
    </div>
  )
}
