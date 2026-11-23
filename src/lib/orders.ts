import type { Json } from './database.types'
import {
  db,
  getMeta,
  setMeta,
  type LineDiscount,
  type LocalOrder,
  type LocalOrderItem,
  type LocalPayment,
  type OrderStatus,
} from './db'
import { lineDiscount } from './pricing'
import { supabase, type Tables } from './supabase'
import { businessDate } from './format'

/** Last order number the server reported for a business date (see 1.7). */
interface LastServerNumber {
  businessDate: string
  number: number
}

export async function setLastServerOrderNumber(date: string, number: number): Promise<void> {
  const prev = await getMeta<LastServerNumber>('lastServerOrderNumber')
  if (prev?.businessDate === date && prev.number >= number) return
  await setMeta('lastServerOrderNumber', { businessDate: date, number })
}

/**
 * Next order number for today on this device: one past the highest number seen
 * locally or reported by the server. Must run inside a Dexie transaction that
 * covers `orders` and `meta`, together with the insert, so two quick sales
 * can't take the same number. If another device used it while offline, the
 * server assigns the next free one on sync.
 */
export async function nextOrderNumber(date: string): Promise<number> {
  const local = await db.orders.where('[businessDate+orderNumber]').between([date, 0], [date, Infinity]).last()
  const server = await getMeta<LastServerNumber>('lastServerOrderNumber')
  const serverNumber = server?.businessDate === date ? server.number : 0
  return Math.max(local?.orderNumber ?? 0, serverNumber) + 1
}

export type NewOrder = Omit<
  LocalOrder,
  | 'orderNumber'
  | 'businessDate'
  | 'status'
  | 'statusChangedAt'
  | 'voidReason'
  | 'voidedAt'
  | 'createdAt'
  | 'syncStatus'
  | 'statusSync'
  | 'paymentSync'
  | 'discountSync'
  | 'discountChangedAt'
  | 'syncAttempts'
  | 'syncError'
  | 'lastSyncAttemptAt'
  | 'priceMismatch'
>

/** Save a sale to the outbox (5.9). Returns the stored order with its number. */
export async function saveOrder(order: NewOrder, timeZone: string): Promise<LocalOrder> {
  const now = new Date()
  return db.transaction('rw', db.orders, db.meta, async () => {
    const date = businessDate(now, timeZone)
    const stored: LocalOrder = {
      ...order,
      orderNumber: await nextOrderNumber(date),
      businessDate: date,
      status: 'new',
      statusChangedAt: null,
      voidReason: null,
      voidedAt: null,
      createdAt: now.toISOString(),
      syncStatus: 'pending',
      statusSync: 'synced',
      paymentSync: 'synced',
      discountSync: 'synced',
      discountChangedAt: null,
      syncAttempts: 0,
      syncError: null,
      lastSyncAttemptAt: null,
      priceMismatch: false,
    }
    await db.orders.add(stored)
    return stored
  })
}

/**
 * Apply a change to an order on this device. Orders from History may only
 * exist on the server; they're stored locally first so the change can wait
 * in the outbox like any other.
 */
async function changeOrder(order: LocalOrder, patch: Partial<LocalOrder>): Promise<void> {
  await db.transaction('rw', db.orders, async () => {
    const current = (await db.orders.get(order.id)) ?? order
    await db.orders.put({ ...current, ...patch })
  })
}

/** Change an order's status on this device; the sync engine sends it (6.2, 6.3). */
export async function setOrderStatus(order: LocalOrder, status: Exclude<OrderStatus, 'voided'>): Promise<void> {
  await changeOrder(order, { status, statusChangedAt: new Date().toISOString(), statusSync: 'pending' })
}

/** Void an order with a required reason (6.6). */
export async function voidOrder(order: LocalOrder, reason: string): Promise<void> {
  const trimmed = reason.trim()
  if (!trimmed) throw new Error('A reason is required to void an order.')
  const at = new Date().toISOString()
  await changeOrder(order, {
    status: 'voided',
    voidReason: trimmed,
    voidedAt: at,
    statusChangedAt: at,
    statusSync: 'pending',
  })
}

/** True for an order that still has to be paid (pay later). Voided orders owe nothing. */
export function isUnpaid(o: LocalOrder): boolean {
  return !o.payment && o.status !== 'voided'
}

/**
 * Take payment for an order that was saved unpaid. The amount is always the
 * order's total; the sync engine sends it through pay_order.
 */
export async function payOrder(
  order: LocalOrder,
  p: Pick<LocalPayment, 'method' | 'amountReceived' | 'changeDue'>,
): Promise<void> {
  await db.transaction('rw', db.orders, async () => {
    const current = (await db.orders.get(order.id)) ?? order
    if (current.payment) throw new Error('This order is already paid.')
    if (current.status === 'voided') throw new Error('This order is voided.')
    await db.orders.put({
      ...current,
      payment: { id: crypto.randomUUID(), amount: current.total, paidAt: new Date().toISOString(), ...p },
      paymentSync: 'pending',
    })
  })
}

/**
 * Change the discounts on a saved order: `discounts` maps an order item id to
 * its discount (lines left out lose theirs). Works for unpaid orders (before
 * taking payment) and for paid ones; for a paid order the payment follows the
 * new total and the difference is returned, to refund (or collect, if
 * negative). The sync engine sends the change through set_order_discounts.
 */
export async function setOrderDiscounts(
  order: LocalOrder,
  discounts: Record<string, LineDiscount | null | undefined>,
): Promise<{ total: number; refund: number }> {
  return db.transaction('rw', db.orders, async () => {
    const current = (await db.orders.get(order.id)) ?? order
    if (current.status === 'voided') throw new Error('This order is voided.')
    const items = current.items.map((i) => {
      const d = discounts[i.id]
      const amount = lineDiscount(i.unitPrice, i.quantity, d)
      return { ...i, discount: d && amount > 0 ? { ...d, quantity: Math.min(d.quantity, i.quantity), amount } : null }
    })
    const discountTotal = Math.min(
      items.reduce((n, i) => n + (i.discount?.amount ?? 0), 0),
      current.subtotal,
    )
    const total = current.subtotal - discountTotal
    await db.orders.put({
      ...current,
      items,
      discountTotal,
      total,
      payment: current.payment && { ...current.payment, amount: total },
      discountSync: 'pending',
      discountChangedAt: new Date().toISOString(),
    })
    return { total, refund: current.payment ? current.total - total : 0 }
  })
}

// ---- RPC payload --------------------------------------------------------------

/** The submit_order payload (snake_case JSON, see the 1.9 migration). */
export function toSubmitPayload(o: LocalOrder): Json {
  return {
    id: o.id,
    created_at: o.createdAt,
    business_date: o.businessDate,
    order_number: o.orderNumber,
    order_type: o.orderType,
    customer_name: o.customerName,
    status: o.status,
    status_changed_at: o.statusChangedAt,
    void_reason: o.voidReason,
    voided_at: o.voidedAt,
    subtotal: o.subtotal,
    discount_total: o.discountTotal ?? 0,
    total: o.total,
    items: o.items.map((i) => ({
      id: i.id,
      menu_item_id: i.menuItemId,
      variant_id: i.variantId,
      item_name: i.itemName,
      variant_name: i.variantName,
      unit_price: i.unitPrice,
      quantity: i.quantity,
      line_total: i.lineTotal,
      notes: i.notes,
      discount_id: i.discount?.discountId ?? null,
      discount_name: i.discount?.name ?? null,
      discount_percent: i.discount?.percent ?? null,
      discount_quantity: i.discount?.quantity ?? 0,
      discount_amount: i.discount?.amount ?? 0,
      modifiers: i.modifiers.map((m) => ({
        id: m.id,
        modifier_id: m.modifierId,
        name: m.name,
        price_delta: m.priceDelta,
        quantity: m.quantity,
      })),
    })),
    payment: o.payment && {
      id: o.payment.id,
      method: o.payment.method,
      amount: o.payment.amount,
      amount_received: o.payment.amountReceived,
      change_due: o.payment.changeDue,
    },
  }
}

/** The set_order_discounts payload: every line that has a discount. */
export function toDiscountsPayload(o: LocalOrder): Json {
  return {
    items: o.items
      .filter((i) => i.discount)
      .map((i) => ({
        id: i.id,
        discount_id: i.discount!.discountId,
        discount_name: i.discount!.name,
        discount_percent: i.discount!.percent,
        discount_quantity: i.discount!.quantity,
      })),
  }
}

/** The pay_order payload for an order paid after it was saved. */
export function toPaymentPayload(p: LocalPayment): Json {
  return {
    id: p.id,
    method: p.method,
    amount_received: p.amountReceived,
    change_due: p.changeDue,
    paid_at: p.paidAt ?? null,
  }
}

// ---- Server rows -> local orders ---------------------------------------------

export const ORDER_SELECT =
  '*, order_items(*, order_item_modifiers(*)), payments(*)' as const

type ServerOrder = Tables<'orders'> & {
  order_items: (Tables<'order_items'> & { order_item_modifiers: Tables<'order_item_modifiers'>[] })[]
  payments: Tables<'payments'>[]
}

export function fromServerOrder(o: ServerOrder): LocalOrder {
  const payment = o.payments[0]
  const items: LocalOrderItem[] = [...o.order_items]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => ({
      id: i.id,
      menuItemId: i.menu_item_id,
      variantId: i.variant_id,
      itemName: i.item_name_snapshot,
      variantName: i.variant_name_snapshot,
      unitPrice: Number(i.unit_price),
      quantity: i.quantity,
      lineTotal: Number(i.line_total),
      notes: i.notes,
      discount:
        i.discount_quantity > 0
          ? {
              discountId: i.discount_id,
              name: i.discount_name ?? 'Discount',
              percent: Number(i.discount_percent ?? 0),
              quantity: i.discount_quantity,
              amount: Number(i.discount_amount),
            }
          : null,
      modifiers: i.order_item_modifiers.map((m) => ({
        id: m.id,
        modifierId: m.modifier_id,
        name: m.name_snapshot,
        priceDelta: Number(m.price_delta),
        quantity: m.quantity,
      })),
    }))
  return {
    id: o.id,
    branchId: o.branch_id,
    orderNumber: o.order_number,
    businessDate: o.business_date,
    orderType: o.order_type,
    customerName: o.customer_name,
    status: o.status,
    statusChangedAt: o.status_changed_at,
    voidReason: o.void_reason,
    voidedAt: o.voided_at,
    subtotal: Number(o.subtotal),
    discountTotal: Number(o.discount_total),
    total: Number(o.total),
    items,
    payment: payment
      ? {
          id: payment.id,
          method: payment.method,
          amount: Number(payment.amount),
          amountReceived: payment.amount_received == null ? null : Number(payment.amount_received),
          changeDue: payment.change_due == null ? null : Number(payment.change_due),
          paidAt: payment.created_at,
        }
      : null,
    createdAt: o.created_at,
    createdBy: o.created_by,
    syncStatus: 'synced',
    statusSync: 'synced',
    paymentSync: 'synced',
    discountSync: 'synced',
    discountChangedAt: null,
    syncAttempts: 0,
    syncError: null,
    lastSyncAttemptAt: null,
    priceMismatch: o.price_mismatch,
  }
}

/** True if this device has changes to the order the server hasn't seen yet. */
export function hasLocalChanges(o: LocalOrder): boolean {
  return o.syncStatus !== 'synced' || o.statusSync === 'pending' || o.paymentSync === 'pending' || o.discountSync === 'pending'
}

/**
 * Fetch a business-date range of orders from the server (paginated past
 * PostgREST's row limit). Dates are inclusive, YYYY-MM-DD.
 */
export async function fetchServerOrders(from: string, to: string): Promise<LocalOrder[]> {
  const pageSize = 500
  const out: LocalOrder[] = []
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .gte('business_date', from)
      .lte('business_date', to)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1)
    if (error) throw error
    out.push(...(data as ServerOrder[]).map(fromServerOrder))
    if (data.length < pageSize) break
  }
  return out
}

/**
 * Unpaid orders (not voided, no payment) on or after a business date, from
 * the server. Embedding `payments` and filtering it for null keeps only the
 * orders that have none.
 */
export async function fetchServerUnpaidOrders(from: string): Promise<LocalOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .gte('business_date', from)
    .neq('status', 'voided')
    .is('payments', null)
    .order('created_at', { ascending: true })
    .limit(500)
  if (error) throw error
  return (data as ServerOrder[]).map(fromServerOrder)
}

/**
 * Orders as this device knows them best: the server's copy, with this
 * device's unsynced orders and newer status changes laid on top.
 */
export function mergeOrders(server: LocalOrder[], local: LocalOrder[]): LocalOrder[] {
  const byId = new Map(server.map((o) => [o.id, o]))
  for (const o of local) {
    const s = byId.get(o.id)
    if (!s || hasLocalChanges(o) || changedAt(o) > changedAt(s)) byId.set(o.id, o)
  }
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

function changedAt(o: LocalOrder): number {
  return o.statusChangedAt ? new Date(o.statusChangedAt).getTime() : 0
}
