import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Ban, Loader2, TriangleAlert } from 'lucide-react'
import { db, type LocalOrder } from '@/lib/db'
import { voidOrder } from '@/lib/orders'
import { requestSync } from '@/lib/sync'
import { useAction } from '@/hooks/useAction'
import { ORDER_TYPE_LABEL, PAYMENT_LABEL, orderNo, peso, shortDate, timeOfDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { EditorDialog } from '@/components/EditorDialog'
import { NEXT_STEP, StatusBadge, SyncMarker, advanceOrder } from './orderUi'

const VOID_REASONS = ['Wrong order', 'Customer cancelled', 'Duplicate', 'Test sale']

/**
 * Order detail (6.5): lines with modifiers and notes, payment, status, and
 * the actions: next status and void with a required reason (6.6).
 */
export function OrderDetail({
  order: given,
  timeZone,
  onClose,
}: {
  order: LocalOrder | null
  timeZone: string
  onClose: () => void
}) {
  // Follow this device's copy live, so a status change shows straight away.
  const live = useLiveQuery(() => (given ? db.orders.get(given.id) : undefined), [given?.id])
  const order = live ?? given
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  const { busy, run } = useAction()

  if (!order) return null
  const step = NEXT_STEP[order.status]
  const voided = order.status === 'voided'

  async function confirmVoid() {
    const ok = await run(async () => {
      await voidOrder(order!, reason)
      void requestSync()
    }, `Order ${orderNo(order!.orderNumber)} voided`)
    if (ok) {
      setVoiding(false)
      setReason('')
    }
  }

  return (
    <>
      <EditorDialog
        open={!!given && !voiding}
        onOpenChange={(o) => !o && onClose()}
        title={
          <span className="flex items-center gap-3">
            <span className="font-display text-[28px] leading-8 font-normal">{orderNo(order.orderNumber)}</span>
            <StatusBadge status={order.status} />
          </span>
        }
        description={`${shortDate(order.businessDate, timeZone)} · ${timeOfDay(order.createdAt, timeZone)} · ${ORDER_TYPE_LABEL[order.orderType]}${
          order.customerName ? ` · ${order.customerName}` : ''
        }`}
        footer={
          <>
            {!voided && (
              <Button variant="ghost" className="text-destructive" onClick={() => setVoiding(true)}>
                <Ban /> Void
              </Button>
            )}
            <span className="flex-1" />
            {step && (
              <Button className={cn('font-bold', step.style)} onClick={() => void advanceOrder(order)}>
                {step.label}
              </Button>
            )}
            {!step && (
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            )}
          </>
        }
      >
        <SyncMarker order={order} />
        {order.priceMismatch && (
          <p className="flex gap-2 rounded-lg bg-warning-bg p-3 text-sm text-warning">
            <TriangleAlert className="mt-0.5 size-4 flex-none" aria-hidden="true" />
            The server’s menu prices don’t match what was charged. The sale is kept as charged; check the menu prices.
          </p>
        )}
        {voided && (
          <p className="rounded-lg bg-status-voided-bg p-3 text-sm text-status-voided-fg">
            <b className="font-semibold">Voided</b>
            {order.voidedAt && ` ${timeOfDay(order.voidedAt, timeZone)}`}: {order.voidReason}
          </p>
        )}

        <ul className="flex flex-col border-t">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 border-b py-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[15px] leading-5 font-extrabold tracking-[0.01em]">
                  {i.quantity}× {i.itemName}
                </span>
                {i.variantName && i.variantName !== 'Regular' && (
                  <span className="text-[13px] text-muted-foreground">
                    {i.variantName}
                  </span>
                )}
                {i.modifiers.map((m) => (
                  <span key={m.id} className="text-[13px] text-muted-foreground">
                    + {m.quantity > 1 ? `${m.quantity}× ` : ''}
                    {m.name}
                    {m.priceDelta ? ` (${peso(m.priceDelta * m.quantity)})` : ''}
                  </span>
                ))}
                {i.notes && (
                  <span className="self-start rounded-sm bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                    Note: {i.notes}
                  </span>
                )}
              </div>
              <span className="flex flex-col items-end">
                <span className={cn('tabular font-bold', voided && 'text-muted-foreground line-through')}>{peso(i.lineTotal)}</span>
                {i.quantity > 1 && <span className="tabular text-xs text-muted-foreground">{peso(i.unitPrice)} each</span>}
              </span>
            </li>
          ))}
        </ul>

        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex items-baseline justify-between">
            <dt className="text-base font-bold">Total</dt>
            <dd className={cn('font-display text-[28px] leading-8', voided && 'text-muted-foreground line-through')}>{peso(order.total)}</dd>
          </div>
          {order.payment && (
            <>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Paid by</dt>
                <dd className="font-semibold">{PAYMENT_LABEL[order.payment.method]}</dd>
              </div>
              {order.payment.amountReceived != null && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Cash received</dt>
                  <dd className="tabular">{peso(order.payment.amountReceived)}</dd>
                </div>
              )}
              {order.payment.changeDue != null && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Change</dt>
                  <dd className="tabular">{peso(order.payment.changeDue)}</dd>
                </div>
              )}
            </>
          )}
        </dl>
      </EditorDialog>

      <EditorDialog
        open={voiding}
        onOpenChange={(o) => !o && !busy && setVoiding(false)}
        title={`Void order ${orderNo(order.orderNumber)}?`}
        description={`The ${peso(order.total)} sale is kept on record but left out of sales and the day close.`}
        footer={
          <>
            <span className="flex-1" />
            <Button variant="outline" onClick={() => setVoiding(false)} disabled={busy}>
              Keep order
            </Button>
            <Button variant="destructive" onClick={() => void confirmVoid()} disabled={busy || !reason.trim()}>
              {busy && <Loader2 className="animate-spin" />} Void order
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="void-reason" className="text-sm font-semibold">
            Reason <span className="font-normal text-muted-foreground">(required)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {VOID_REASONS.map((r) => (
              <Button
                key={r}
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={reason === r}
                className={cn(reason === r && 'border-2 border-ring bg-secondary')}
                onClick={() => setReason(r)}
              >
                {r}
              </Button>
            ))}
          </div>
          <Textarea
            id="void-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What happened?"
            className="min-h-20 text-base"
          />
        </div>
      </EditorDialog>
    </>
  )
}
