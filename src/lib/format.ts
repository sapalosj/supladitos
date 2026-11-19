/** ₱120 — POS amounts: whole pesos, no decimals (design system: content fundamentals). */
export function peso(amount: number): string {
  return `₱${Math.round(amount).toLocaleString('en-PH')}`
}

/** ₱1,240.00 — reports and day close. */
export function pesoExact(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Tile prices drop the symbol, as the menu does: "120 · 140 · 160". */
export function priceList(prices: number[]): string {
  return prices.map((p) => Math.round(p).toString()).join(' · ')
}

/** #0042 */
export function orderNo(n: number): string {
  return `#${String(n).padStart(4, '0')}`
}

/** YYYY-MM-DD for a moment in the branch's time zone. */
export function businessDate(at: Date = new Date(), timeZone = 'Asia/Manila'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

export function timeOfDay(iso: string, timeZone = 'Asia/Manila'): string {
  return new Intl.DateTimeFormat('en-PH', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

/** "Wed, Nov 18" */
export function shortDate(at: Date | string = new Date(), timeZone = 'Asia/Manila'): string {
  const d = typeof at === 'string' ? new Date(at.length === 10 ? `${at}T12:00:00+08:00` : at) : at
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(d)
}

export function relativeTime(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

export const PAYMENT_LABEL = { cash: 'Cash', gcash: 'GCash', maya: 'Maya' } as const
export const ORDER_TYPE_LABEL = { dine_in: 'Dine-in', takeout: 'Takeout' } as const
export const STATUS_LABEL = { new: 'New', preparing: 'Preparing', done: 'Done', voided: 'Voided' } as const
