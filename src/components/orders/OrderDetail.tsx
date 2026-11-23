import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Ban, Banknote, Loader2, Tag, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { db, type LineDiscount, type LocalOrder } from '@/lib/db'
import { isUnpaid, setOrderDiscounts, voidOrder } from '@/lib/orders'
import { lineDiscount } from '@/lib/pricing'
import { requestSync } from '@/lib/sync'
import { useAction } from '@/hooks/useAction'
import { ORDER_TYPE_LABEL, PAYMENT_LABEL, orderNo, peso, shortDate, timeOfDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { EditorDialog } from '@/components/EditorDialog'
import { DiscountControl, useDiscounts } from '@/components/pos/DiscountControl'
import { NEXT_STEP, StatusBadge, SyncMarker, UnpaidBadge, advanceOrder } from './orderUi'
import { TakePaymentDialog } from './TakePaymentDialog'

const VOID_REASONS = ['Wrong order', 'Customer cancelled', 'Duplicate', 'Test sale']

/**
 * Order detail (6.5): lines with modifiers and notes, payment, status, and
 * the actions: next status, take payment for an unpaid order, change the
 * discounts (before payment, or after it with a refund), and void with a
 * required reason (6.6).
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
  const [paying, setPaying] = useState(false)
  /** Discounts being edited: order item id -> discount. Null when not editing. */
  const [draft, setDraft] = useState<Record<string, LineDiscount | null> | null>(null)
  const discounts = useDiscounts()
  const { busy, run } = useAction()

  if (!order) return null
  const step = NEXT_STEP[order.status]
  const voided = order.status === 'voided'
  const unpaid = isUnpaid(order)
  const discountTotal = order.discountTotal ?? 0
  const canDiscount = !voided && (discounts.length > 0 || discountTotal > 0)
  const draftDiscount = draft ? order.items.reduce((n, i) => n + lineDiscount(i.unitPrice, i.quantity, draft[i.id]), 0) : 0
  const draftTotal = order.subtotal - draftDiscount

  function editDiscounts() {
    setDraft(Object.fromEntries(order!.items.map((i) => [i.id, i.discount ?? null])))
  }

  async function saveDiscounts() {
    let refund = 0
    const ok = await run(async () => {
      refund = (await setOrderDiscounts(order!, draft ?? {})).refund
      void requestSync()
    })
    if (!ok) return
    setDraft(null)
    const no = orderNo(order!.orderNumber)
    if (refund > 0) toast.success(`Refund ${peso(refund)} for order ${no}`, { description: 'The order was already paid.', duration: 10_000 })
    else if (refund < 0) toast.warning(`Collect ${peso(-refund)} more for order ${no}`, { description: 'The order was already paid.', duration: 10_000 })
    else toast.success(`Discounts updated for order ${no}`)
  }

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
        open={!!given && !voiding && !paying && !draft}
        onOpenChange={(o) => !o && onClose()}
        title={
          <span className="flex items-center gap-3">
            <span className="font-display text-[28px] leading-8 font-normal">{orderNo(order.orderNumber)}</span>
            <StatusBadge status={order.status} />
            {unpaid && <UnpaidBadge />}
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
            {canDiscount && (
              <Button variant="ghost" className="text-caramel-text" onClick={editDiscounts}>
                <Tag /> Discount
              </Button>
            )}
            <span className="flex-1" />
            {step && (
              <Button className={cn('font-bold', step.style)} onClick={() => void advanceOrder(order)}>
                {step.label}
              </Button>
            )}
            {unpaid && (
              <Button onClick={() => setPaying(true)}>
                <Banknote /> Take payment
              </Button>
            )}
            {!step && !unpaid && (
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
                {i.discount && (
                  <span className="flex items-center gap-1 text-[13px] font-semibold text-success">
                    <Tag className="size-3.5" aria-hidden="true" />
                    {i.discount.name} · {i.discount.quantity} of {i.quantity} · −{peso(i.discount.amount)}
                  </span>
                )}
              </div>
              <span className="flex flex-col items-end">
                <span className={cn('tabular font-bold', voided && 'text-muted-foreground line-through')}>
                  {peso(i.lineTotal - (i.discount?.amount ?? 0))}
                </span>
                {i.quantity > 1 && <span className="tabular text-xs text-muted-foreground">{peso(i.unitPrice)} each</span>}
              </span>
            </li>
          ))}
        </ul>

        <dl className="flex flex-col gap-2 text-sm">
          {discountTotal > 0 && (
            <>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular">{peso(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-success">
                <dt>Discount</dt>
                <dd className="tabular font-semibold">−{peso(discountTotal)}</dd>
              </div>
            </>
          )}
          <div className="flex items-baseline justify-between">
            <dt className="text-base font-bold">Total</dt>
            <dd className={cn('font-display text-[28px] leading-8', voided && 'text-muted-foreground line-through')}>{peso(order.total)}</dd>
          </div>
          {unpaid && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Payment</dt>
              <dd className="font-semibold text-warning">
                Not paid yet{order.customerName ? ` · ${order.customerName}` : ''}
              </dd>
            </div>
          )}
          {order.payment && (
            <>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Paid by</dt>
                <dd className="font-semibold">
                  {PAYMENT_LABEL[order.payment.method]}
                  {order.payment.paidAt &&
                    new Date(order.payment.paidAt).getTime() - new Date(order.createdAt).getTime() > 60_000 &&
                    ` · ${shortDate(order.payment.paidAt, timeZone)} ${timeOfDay(order.payment.paidAt, timeZone)}`}
                </dd>
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

      <TakePaymentDialog order={paying ? order : null} onClose={() => setPaying(false)} />

      <EditorDialog
        open={!!draft}
        onOpenChange={(o) => !o && !busy && setDraft(null)}
        title={`Discounts · ${orderNo(order.orderNumber)}`}
        description={
          order.payment
            ? 'This order is already paid. Changing the discount changes the total; refund the difference.'
            : 'Mark the drinks that get a discount. The total to pay updates.'
        }
        footer={
          <>
            <span className="flex flex-col">
              <span className="text-xs text-muted-foreground">
                {order.payment && draftTotal !== order.total
                  ? draftTotal < order.total
                    ? `Refund ${peso(order.total - draftTotal)}`
                    : `Collect ${peso(draftTotal - order.total)} more`
                  : 'New total'}
              </span>
              <span className="font-display text-2xl leading-7" data-testid="discount-new-total">
                {peso(draftTotal)}
              </span>
            </span>
            <span className="flex-1" />
            <Button variant="outline" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void saveDiscounts()} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Save
            </Button>
          </>
        }
      >
        <ul className="flex flex-col border-t">
          {order.items.map((i) => (
            <li key={i.id} className="flex flex-col gap-2 border-b py-3">
              <div className="flex justify-between gap-3">
                <span className="text-[15px] leading-5 font-extrabold tracking-[0.01em]">
                  {i.quantity}× {i.itemName}
                  {i.variantName && i.variantName !== 'Regular' && (
                    <span className="font-normal text-muted-foreground"> · {i.variantName}</span>
                  )}
                </span>
                <span className="tabular text-sm text-muted-foreground">{peso(i.unitPrice)} each</span>
              </div>
              <div className="-ml-2 empty:hidden">
                <DiscountControl
                  discounts={discounts}
                  itemName={i.itemName}
                  unitPrice={i.unitPrice}
                  quantity={i.quantity}
                  value={draft?.[i.id]}
                  onChange={(d) => setDraft((prev) => ({ ...prev, [i.id]: d }))}
                />
              </div>
            </li>
          ))}
        </ul>
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
