import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Backend quantity fields (material stock, requested/issued amounts) are
 * DecimalField(decimal_places=3) so fractional units like "2.5 kg" stay
 * possible, but that means whole numbers arrive as "2.000". This strips
 * trailing zeros for display without rounding away a real fraction —
 * "2.000" -> "2", "2.500" -> "2.5". Money fields are untouched; those are
 * already formatted through Intl.NumberFormat elsewhere.
 */
export function formatQty(value: string | number): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  return String(n)
}

/**
 * Normalizes an API/query result that should be a list, so `.sort()`,
 * `.filter()`, and `.map()` never throw on a shape that isn't one —
 * a raw array, a DRF-style `{results: [...]}` envelope, an error payload,
 * or a missing response all safely resolve to an array (empty if nothing
 * usable was found).
 */
export function toArray<T>(data: T[] | { results?: unknown } | null | undefined): T[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === "object" && Array.isArray((data as { results?: unknown }).results)) {
    return (data as { results: T[] }).results
  }
  return []
}
