import type { LocalOrder, PaymentMethod } from './db'

/**
 * Report figures (milestone 7) and day close totals (milestone 8), computed
 * from orders on the client so the same numbers show online and offline.
 * Voided orders are left out of every figure except `voidedCount`.
 */

export interface Summary {
  sales: number
  orderCount: number
  averageOrder: number
  voidedCount: number
  byMethod: Record<PaymentMethod, number>
  /** Order count per payment method (non-voided). */
  countByMethod: Record<PaymentMethod, number>
  /** Sales per hour of the day (branch time), 0–23. */
  byHour: number[]
  topItems: { name: string; quantity: number; sales: number }[]
  /** Paid modifiers: how many and how much they added. */
  modifierRevenue: { name: string; quantity: number; revenue: number }[]
}

const METHODS: PaymentMethod[] = ['cash', 'gcash', 'maya']

function hourIn(iso: string, timeZone: string): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
  return Number(h) % 24
}

export function summarize(orders: LocalOrder[], timeZone: string): Summary {
  const byMethod = { cash: 0, gcash: 0, maya: 0 } as Record<PaymentMethod, number>
  const countByMethod = { cash: 0, gcash: 0, maya: 0 } as Record<PaymentMethod, number>
  const byHour = Array.from({ length: 24 }, () => 0)
  const items = new Map<string, { name: string; quantity: number; sales: number }>()
  const mods = new Map<string, { name: string; quantity: number; revenue: number }>()
  let sales = 0
  let orderCount = 0
  let voidedCount = 0

  for (const o of orders) {
    if (o.status === 'voided') {
      voidedCount++
      continue
    }
    orderCount++
    sales += o.total
    byHour[hourIn(o.createdAt, timeZone)] += o.total
    if (o.payment) {
      byMethod[o.payment.method] += o.total
      countByMethod[o.payment.method]++
    }
    for (const i of o.items) {
      const it = items.get(i.itemName) ?? { name: i.itemName, quantity: 0, sales: 0 }
      it.quantity += i.quantity
      it.sales += i.lineTotal
      items.set(i.itemName, it)
      for (const m of i.modifiers) {
        if (!m.priceDelta) continue
        const md = mods.get(m.name) ?? { name: m.name, quantity: 0, revenue: 0 }
        md.quantity += m.quantity * i.quantity
        md.revenue += m.priceDelta * m.quantity * i.quantity
        mods.set(m.name, md)
      }
    }
  }

  return {
    sales,
    orderCount,
    averageOrder: orderCount ? sales / orderCount : 0,
    voidedCount,
    byMethod,
    countByMethod,
    byHour,
    topItems: [...items.values()].sort((a, b) => b.sales - a.sales || b.quantity - a.quantity),
    modifierRevenue: [...mods.values()].sort((a, b) => b.revenue - a.revenue),
  }
}

export { METHODS }

// ---- Periods -------------------------------------------------------------------

export type Period = 'today' | 'week' | 'month'

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86_400_000)
}

export interface PeriodRange {
  from: string
  to: string
  /** The same span one period earlier, for "vs last …". */
  prevFrom: string
  prevTo: string
  compareLabel: string
}

/**
 * Today; this week (Monday to today); this month (1st to today). Each is
 * compared with the same span of the previous week/week/month.
 */
export function periodRange(period: Period, today: string): PeriodRange {
  if (period === 'today') {
    const prev = addDays(today, -7)
    const weekday = new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
    return { from: today, to: today, prevFrom: prev, prevTo: prev, compareLabel: `last ${weekday}` }
  }
  if (period === 'week') {
    const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7 // Monday = 0
    const from = addDays(today, -dow)
    return { from, to: today, prevFrom: addDays(from, -7), prevTo: addDays(today, -7), compareLabel: 'the same days last week' }
  }
  const from = `${today.slice(0, 8)}01`
  const span = daysBetween(from, today)
  const d = new Date(`${from}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - 1)
  const prevFrom = d.toISOString().slice(0, 10)
  // Clamp to the end of the previous month (e.g. Mar 31 -> Feb 28).
  const prevEnd = addDays(from, -1)
  const prevTo = addDays(prevFrom, span) > prevEnd ? prevEnd : addDays(prevFrom, span)
  return { from, to: today, prevFrom, prevTo, compareLabel: 'the same days last month' }
}

/** "+12%" / "−4%" / null when there's nothing to compare with. */
export function change(current: number, previous: number): number | null {
  if (!previous) return null
  return (current - previous) / previous
}
