"use client"

import { useQuery } from "@tanstack/react-query"

import api from "@/lib/api"
import { Input } from "@/components/ui/input"

export interface Branch {
  id: number
  name: string
}

export interface ReportFilterState {
  dateFrom: string
  dateTo: string
  branchId: string // "" means all branches
}

export function useBranches() {
  return useQuery({
    queryKey: ["report-branches"],
    queryFn: async () => {
      const { data } = await api.get<{ results: Branch[] }>("/branches/")
      return data.results
    },
    staleTime: 5 * 60_000,
  })
}

/** Builds the query-string params shared by every historical report. */
export function filterParams(f: ReportFilterState): Record<string, string> {
  const params: Record<string, string> = {}
  if (f.dateFrom) params.date_from = f.dateFrom
  if (f.dateTo) params.date_to = f.dateTo
  if (f.branchId) params.branch_id = f.branchId
  return params
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** First and last day of "this month" or "last month" relative to today. */
function monthRange(offset: 0 | -1): { from: string; to: string } {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  return { from: toISODate(first), to: toISODate(last) }
}

export function ReportFilterBar({
  value,
  onChange,
}: {
  value: ReportFilterState
  onChange: (next: ReportFilterState) => void
}) {
  const { data: branches = [] } = useBranches()

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Quick range</label>
        <div className="flex gap-1">
          <button
            type="button"
            className="h-8 rounded-md border border-input px-2 text-xs font-medium hover:bg-muted"
            onClick={() => {
              const r = monthRange(0)
              onChange({ ...value, dateFrom: r.from, dateTo: r.to })
            }}
          >
            This month
          </button>
          <button
            type="button"
            className="h-8 rounded-md border border-input px-2 text-xs font-medium hover:bg-muted"
            onClick={() => {
              const r = monthRange(-1)
              onChange({ ...value, dateFrom: r.from, dateTo: r.to })
            }}
          >
            Last month
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">From</label>
        <Input
          type="date"
          className="h-8 w-36 text-sm"
          value={value.dateFrom}
          onChange={(e) => onChange({ ...value, dateFrom: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">To</label>
        <Input
          type="date"
          className="h-8 w-36 text-sm"
          value={value.dateTo}
          onChange={(e) => onChange({ ...value, dateTo: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Branch</label>
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          value={value.branchId}
          onChange={(e) => onChange({ ...value, branchId: e.target.value })}
        >
          <option value="">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={String(b.id)}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      {(value.dateFrom || value.dateTo || value.branchId) && (
        <button
          type="button"
          onClick={() => onChange({ dateFrom: "", dateTo: "", branchId: "" })}
          className="h-8 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
