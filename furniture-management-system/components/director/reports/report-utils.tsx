const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "TZS",
  maximumFractionDigits: 0,
})

export function formatMoney(v: number | string) {
  return currency.format(Number(v))
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { dateStyle: "medium" })
}

export function dateRangeLabel(dateFrom: string, dateTo: string): string {
  if (!dateFrom && !dateTo) return "All time"
  if (dateFrom && dateTo) return `${dateFrom} to ${dateTo}`
  if (dateFrom) return `From ${dateFrom}`
  return `Through ${dateTo}`
}
