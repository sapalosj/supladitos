import { useMemo, useState } from 'react'
import { Banknote, CalendarDays, CircleCheck, CloudOff, History, LoaderCircle, ReceiptText } from 'lucide-react'
import { useProfile } from '@/lib/auth'
import type { LocalOrder, OrderStatus, PaymentMethod } from '@/lib/db'
import { useOrders } from '@/hooks/useOrders'
import { isUnpaid } from '@/lib/orders'
import { businessDate, ORDER_TYPE_LABEL, orderNo, PAYMENT_LABEL, peso, relativeTime, shortDate, STATUS_LABEL, timeOfDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { EmptyState, PageBody, PageHeader, Segment, SegmentedList } from '@/components/layout/Page'
import {
  NEXT_STEP,
  StatusBadge,
  SyncMarker,
  UnpaidBadge,
  advanceOrder,
  itemDetail,
  itemsSummary,
  useQueue,
  useUnpaid,
} from '@/components/orders/orderUi'
import { OrderDetail } from '@/components/orders/OrderDetail'
import { TakePaymentDialog } from '@/components/orders/TakePaymentDialog'

const pill =
  'h-9 rounded-full border border-input bg-background px-3 text-[13px] font-semibold data-[size=default]:h-9 shadow-none'

/**
 * Orders — queue, unpaid & history (Pages Design: "Orders — queue & history";
 * milestone 6). Unpaid lists every pay-later order that hasn't been paid yet.
 */
export default function Orders() {
  const profile = useProfile()
  const tz = profile.timezone
  const queue = useQueue(tz)
  const unpaid = useUnpaid()
  const [open, setOpen] = useState<LocalOrder | null>(null)
  const [paying, setPaying] = useState<LocalOrder | null>(null)
  const today = businessDate(new Date(), tz)

  return (
    <Tabs defaultValue="queue" className="flex min-h-0 flex-1 flex-col gap-0">
      <PageHeader title="Orders">
        <SegmentedList>
          <Segment value="queue">Queue · {queue.length}</Segment>
          <Segment value="unpaid">Unpaid · {unpaid.length}</Segment>
          <Segment value="history">History</Segment>
        </SegmentedList>
      </PageHeader>
      <PageBody>
        <TabsContent value="queue" className="flex flex-col gap-3">
          {queue.length === 0 ? (
            <EmptyState icon={ReceiptText} title="No orders in the queue">
              New orders from the Sell screen show up here until they’re done.
            </EmptyState>
          ) : (
            queue.map((o) => <QueueCard key={o.id} order={o} onOpen={() => setOpen(o)} />)
          )}
        </TabsContent>
        <TabsContent value="unpaid" className="flex flex-col gap-3">
          {unpaid.length === 0 ? (
            <EmptyState icon={CircleCheck} title="Everyone has paid">
              Orders saved with “Pay later” stay here until the payment is taken.
            </EmptyState>
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <h2 className="text-base font-bold">Not paid yet</h2>
                <span className="tabular text-xs text-muted-foreground" data-testid="unpaid-total">
                  {unpaid.length} {unpaid.length === 1 ? 'order' : 'orders'} · {peso(unpaid.reduce((n, o) => n + o.total, 0))}
                </span>
              </div>
              {unpaid.map((o) => (
                <UnpaidCard key={o.id} order={o} today={today} timeZone={tz} onOpen={() => setOpen(o)} onPay={() => setPaying(o)} />
              ))}
            </>
          )}
        </TabsContent>
        <TabsContent value="history">
          <OrderHistory timeZone={tz} onOpen={setOpen} />
        </TabsContent>
      </PageBody>
      <OrderDetail order={open} timeZone={tz} onClose={() => setOpen(null)} />
      <TakePaymentDialog order={paying} onClose={() => setPaying(null)} />
    </Tabs>
  )
}

function QueueCard({ order: o, onOpen }: { order: LocalOrder; onOpen: () => void }) {
  const step = NEXT_STEP[o.status]!
  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-3.5 shadow-sm">
      <button type="button" onClick={onOpen} className="-m-1 flex flex-col gap-3 rounded-md p-1 text-left hover:bg-accent/40">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="font-display text-[22px] leading-[26px]">{orderNo(o.orderNumber)}</span>
            <span className="truncate text-[13px] text-muted-foreground">
              {ORDER_TYPE_LABEL[o.orderType]}
              {o.customerName && ` · ${o.customerName}`} · {relativeTime(o.createdAt)}
            </span>
          </div>
          <span className="flex flex-none items-center gap-1.5">
            {!o.payment && <UnpaidBadge />}
            <StatusBadge status={o.status} />
          </span>
        </div>
        <ul className="flex flex-col gap-1.5 text-sm">
          {o.items.map((i) => (
            <li key={i.id}>
              <b className="font-extrabold">
                {i.quantity}× {i.itemName}
              </b>
              {itemDetail(i) && <span className="text-muted-foreground"> · {itemDetail(i)}</span>}
            </li>
          ))}
        </ul>
        <SyncMarker order={o} />
      </button>
      <Button className={cn('h-12 text-[15px] font-bold', step.style)} onClick={() => void advanceOrder(o)}>
        {step.label}
      </Button>
    </article>
  )
}

/** One unpaid order: who owes, how much, since when. */
function UnpaidCard({
  order: o,
  today,
  timeZone,
  onOpen,
  onPay,
}: {
  order: LocalOrder
  today: string
  timeZone: string
  onOpen: () => void
  onPay: () => void
}) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-3.5 shadow-sm">
      <button type="button" onClick={onOpen} className="-m-1 flex flex-col gap-1.5 rounded-md p-1 text-left hover:bg-accent/40">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-base font-extrabold">{o.customerName ?? `Order ${orderNo(o.orderNumber)}`}</span>
          <span className="tabular flex-none font-display text-[22px] leading-[26px]">{peso(o.total)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] text-muted-foreground">
            {orderNo(o.orderNumber)} · {ORDER_TYPE_LABEL[o.orderType]} ·{' '}
            {o.businessDate === today ? timeOfDay(o.createdAt, timeZone) : shortDate(o.businessDate, timeZone)}
          </span>
          <StatusBadge status={o.status} />
        </div>
        <span className="truncate text-[13px] text-muted-foreground">{itemsSummary(o)}</span>
        <SyncMarker order={o} />
      </button>
      <Button className="h-12 text-[15px] font-bold" onClick={onPay}>
        <Banknote /> Take payment · {peso(o.total)}
      </Button>
    </article>
  )
}

function dayOffset(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Order history with filters: date, status, payment method (6.4). */
function OrderHistory({ timeZone, onOpen }: { timeZone: string; onOpen: (o: LocalOrder) => void }) {
  const today = businessDate(new Date(), timeZone)
  const [date, setDate] = useState(today)
  const [status, setStatus] = useState<'all' | OrderStatus>('all')
  const [method, setMethod] = useState<'all' | 'unpaid' | PaymentMethod>('all')
  const { orders, loading, complete } = useOrders(date, date)

  const shown = useMemo(
    () =>
      orders
        .filter((o) => (status === 'all' || o.status === status) && (method === 'all' || (method === 'unpaid' ? isUnpaid(o) : o.payment?.method === method)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [orders, status, method],
  )
  const sales = shown.filter((o) => o.status !== 'voided').reduce((n, o) => n + o.total, 0)
  const dateLabel = date === today ? 'Today' : date === dayOffset(today, -1) ? 'Yesterday' : shortDate(date, timeZone)

  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {[
          { label: 'Today', value: today },
          { label: 'Yesterday', value: dayOffset(today, -1) },
        ].map((d) => (
          <button
            key={d.label}
            type="button"
            aria-pressed={date === d.value}
            onClick={() => setDate(d.value)}
            className={cn(
              'flex h-9 flex-none items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold',
              date === d.value ? 'border-ring bg-primary text-primary-foreground' : 'border-input bg-background',
            )}
          >
            {d.label === 'Today' && <CalendarDays className="size-4" aria-hidden="true" />}
            {d.label}
          </button>
        ))}
        <input
          type="date"
          aria-label="Pick a date"
          value={date}
          max={today}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="h-9 flex-none rounded-full border border-input bg-background px-3 text-[13px] font-semibold"
        />
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className={pill} aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="h-11">All statuses</SelectItem>
            {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => (
              <SelectItem key={s} value={s} className="h-11">
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
          <SelectTrigger className={pill} aria-label="Payment method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="h-11">All payments</SelectItem>
            {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
              <SelectItem key={m} value={m} className="h-11">
                {PAYMENT_LABEL[m]}
              </SelectItem>
            ))}
            <SelectItem value="unpaid" className="h-11">Unpaid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!complete && !loading && (
        <p className="flex items-start gap-2 rounded-lg bg-warning-bg p-3 text-sm text-warning" role="status">
          <CloudOff className="mt-0.5 size-4 flex-none" aria-hidden="true" />
          Offline: showing only the orders stored on this device.
        </p>
      )}

      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-bold">{dateLabel}</h2>
        <span className="tabular text-xs text-muted-foreground">
          {shown.length} {shown.length === 1 ? 'order' : 'orders'} · {peso(sales)}
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-label="Loading orders" />
        </div>
      ) : shown.length === 0 ? (
        <EmptyState icon={History} title="No orders">
          {status !== 'all' || method !== 'all' ? 'Nothing matches these filters.' : 'No sales on this date.'}
        </EmptyState>
      ) : (
        <ul className="border-t" aria-label="Order history">
          {shown.map((o) => {
            const voided = o.status === 'voided'
            return (
              <li key={o.id} className="border-b">
                <button type="button" onClick={() => onOpen(o)} className="flex min-h-[60px] w-full items-center gap-3 py-2 text-left hover:bg-accent/40">
                  <span className="w-[58px] flex-none font-display text-lg">{orderNo(o.orderNumber)}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-semibold">
                      {timeOfDay(o.createdAt, timeZone)} ·{' '}
                      {o.payment ? PAYMENT_LABEL[o.payment.method] : voided ? '—' : <span className="text-warning">Unpaid</span>}
                      {!o.payment && !voided && o.customerName && ` · ${o.customerName}`}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{itemsSummary(o)}</span>
                    <SyncMarker order={o} />
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className={cn('tabular text-sm font-bold', voided && 'text-muted-foreground line-through')}>{peso(o.total)}</span>
                    <StatusBadge status={o.status} className="text-[11px]" />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
