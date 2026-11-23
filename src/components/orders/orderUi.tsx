import { useLiveQuery } from 'dexie-react-hooks'
import { CloudUpload, TriangleAlert } from 'lucide-react'
import { db, type LocalOrder, type OrderStatus } from '@/lib/db'
import { businessDate, STATUS_LABEL } from '@/lib/format'
import { isUnpaid, setOrderStatus } from '@/lib/orders'
import { requestSync } from '@/lib/sync'
import { cn } from '@/lib/utils'

const STATUS_STYLE: Record<OrderStatus, string> = {
  new: 'bg-status-new-bg text-status-new-fg',
  preparing: 'bg-status-preparing-bg text-status-preparing-fg',
  done: 'bg-status-done-bg text-status-done-fg',
  voided: 'bg-status-voided-bg text-status-voided-fg',
}

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <span className={cn('rounded-sm px-2 py-0.5 text-xs font-semibold whitespace-nowrap', STATUS_STYLE[status], className)}>
      {STATUS_LABEL[status]}
    </span>
  )
}

/** Marks an order that hasn't been paid yet (pay later). */
export function UnpaidBadge({ className }: { className?: string }) {
  return (
    <span className={cn('rounded-sm bg-warning-bg px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-warning', className)}>
      Unpaid
    </span>
  )
}

/** Small marker for an order (or its status change) that hasn't reached the server. */
export function SyncMarker({ order }: { order: LocalOrder }) {
  if (order.syncStatus === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive" title={order.syncError ?? undefined}>
        <TriangleAlert className="size-3.5" aria-hidden="true" /> Not synced
      </span>
    )
  }
  if (order.syncStatus === 'pending' || order.statusSync === 'pending' || order.paymentSync === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning">
        <CloudUpload className="size-3.5" aria-hidden="true" /> Waiting to sync
      </span>
    )
  }
  return null
}

/** The next step in New → Preparing → Done (6.2). */
export const NEXT_STEP: Partial<Record<OrderStatus, { to: 'preparing' | 'done'; label: string; short: string; style: string }>> = {
  new: {
    to: 'preparing',
    label: 'Start preparing',
    short: 'Start',
    style: 'border border-status-preparing-fg bg-status-preparing-bg text-status-preparing-fg hover:bg-status-preparing-bg/80',
  },
  preparing: {
    to: 'done',
    label: 'Mark as done',
    short: 'Mark as done',
    style: 'border border-status-done-fg bg-status-done-bg text-status-done-fg hover:bg-status-done-bg/80',
  },
}

export async function advanceOrder(order: LocalOrder): Promise<void> {
  const step = NEXT_STEP[order.status]
  if (!step) return
  await setOrderStatus(order, step.to)
  void requestSync()
}

/** Today's open orders (New or Preparing), oldest first: the queue (6.1). */
export function useQueue(timeZone: string): LocalOrder[] {
  const today = businessDate(new Date(), timeZone)
  return useLiveQuery(
    async () =>
      (
        await db.orders
          .where('businessDate')
          .equals(today)
          .filter((o) => o.status === 'new' || o.status === 'preparing')
          .toArray()
      ).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [today],
    [],
  )
}

/**
 * Every order on this device that still has to be paid, oldest first: today's
 * and earlier days' (the sync keeps recent unpaid orders on the device).
 */
export function useUnpaid(): LocalOrder[] {
  return useLiveQuery(
    async () => (await db.orders.filter(isUnpaid).toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [],
    [],
  )
}

/** "SPANISH LATTE, 2× AMERICANO" */
export function itemsSummary(o: LocalOrder): string {
  return o.items.map((i) => `${i.quantity > 1 ? `${i.quantity}× ` : ''}${i.itemName}`).join(', ')
}

/** "Iced Regular · Oat milk · note: less ice" for a queue card line. */
export function itemDetail(i: LocalOrder['items'][number], showVariant = true): string {
  const parts: string[] = []
  if (showVariant && i.variantName && i.variantName !== 'Regular') parts.push(i.variantName)
  for (const m of i.modifiers) parts.push(`${m.quantity > 1 ? `${m.quantity}× ` : ''}${m.name}`)
  if (i.notes) parts.push(`note: ${i.notes}`)
  return parts.join(' · ')
}
