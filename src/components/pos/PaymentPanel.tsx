import { useMemo, useState } from 'react'
import { Banknote, Check, ChevronLeft, CloudOff, Loader2, Smartphone } from 'lucide-react'
import type { PaymentMethod } from '@/lib/db'
import { useOnline } from '@/hooks/useOnline'
import { ORDER_TYPE_LABEL, PAYMENT_LABEL, peso } from '@/lib/format'
import type { OrderType } from '@/lib/db'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export interface PaymentInput {
  method: PaymentMethod
  amountReceived: number | null
  changeDue: number | null
}

const METHOD_ICON = { cash: Banknote, gcash: Smartphone, maya: Smartphone }

/** Quick cash amounts above the total: the next 50, 100, 500 and 1,000. */
export function quickAmounts(total: number): number[] {
  const steps = [50, 100, 500, 1000]
  const out = new Set<number>()
  for (const s of steps) {
    const v = Math.ceil(total / s) * s
    if (v > total) out.add(v)
  }
  return [...out].sort((a, b) => a - b).slice(0, 3)
}

/**
 * Payment (Pages Design: "POS — Payment"; 5.8): Cash / GCash / Maya. Cash
 * takes the amount received and shows the change due.
 */
export function PaymentPanel({
  total,
  orderType,
  customerName,
  busy,
  onBack,
  onComplete,
}: {
  total: number
  orderType: OrderType
  customerName: string
  busy: boolean
  onBack: () => void
  onComplete: (p: PaymentInput) => void
}) {
  const online = useOnline()
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [received, setReceived] = useState('')
  const amounts = useMemo(() => quickAmounts(total), [total])

  const receivedNum = received === '' ? null : Number(received)
  const change = receivedNum == null ? null : receivedNum - total
  const short = method === 'cash' && (receivedNum == null || receivedNum < total)

  function complete() {
    if (short) return
    onComplete(
      method === 'cash'
        ? { method, amountReceived: receivedNum, changeDue: change }
        : { method, amountReceived: null, changeDue: null },
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-none items-center gap-2 border-b px-2 py-3">
        <Button variant="ghost" size="icon" aria-label="Back to cart" onClick={onBack} disabled={busy}>
          <ChevronLeft />
        </Button>
        <h2 className="flex-1 text-xl leading-7 font-extrabold">Payment</h2>
        <span className="truncate pr-3 text-sm text-muted-foreground">
          {ORDER_TYPE_LABEL[orderType]}
          {customerName.trim() && ` · ${customerName.trim()}`}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-5">
        <div className="flex flex-col items-center gap-1 py-2">
          <span className="column-head text-muted-foreground">Total due</span>
          <span className="font-display text-[56px] leading-[56px]" data-testid="total-due">
            {peso(total)}
          </span>
        </div>

        <fieldset>
          <legend className="mb-2 text-base font-bold">Payment method</legend>
          <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-3 gap-2">
            {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => {
              const Icon = METHOD_ICON[m]
              const on = method === m
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setMethod(m)}
                  className={cn(
                    'flex h-[72px] flex-col items-center justify-center gap-1 rounded-xl text-sm',
                    on ? 'border-2 border-ring bg-primary font-bold text-primary-foreground' : 'border border-input font-semibold',
                  )}
                >
                  <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
                  {PAYMENT_LABEL[m]}
                </button>
              )
            })}
          </div>
        </fieldset>

        {method === 'cash' ? (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Cash received</span>
              <span className="flex h-14 items-center gap-2 rounded-md border-2 border-ring px-3.5">
                <span className="font-display text-2xl text-muted-foreground">₱</span>
                <input
                  inputMode="decimal"
                  value={received}
                  onChange={(e) => setReceived(e.target.value.replace(/[^\d.]/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && complete()}
                  aria-label="Cash received"
                  className="tabular min-w-0 flex-1 bg-transparent font-display text-[28px] outline-none"
                  autoFocus
                />
              </span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[total, ...amounts].map((a, i) => (
                <Button
                  key={a}
                  variant="outline"
                  aria-pressed={receivedNum === a}
                  className={cn('tabular', receivedNum === a && 'border-2 border-ring bg-secondary')}
                  onClick={() => setReceived(String(a))}
                >
                  {i === 0 ? 'Exact' : a.toLocaleString('en-PH')}
                </Button>
              ))}
            </div>
            {change != null && change >= 0 ? (
              <div className="flex items-center justify-between rounded-xl bg-status-done-bg p-4 text-success" role="status">
                <span className="column-head">Change due</span>
                <span className="font-display text-[40px] leading-[44px]">{peso(change)}</span>
              </div>
            ) : (
              change != null && (
                <p className="rounded-xl bg-destructive/10 p-4 text-sm font-semibold text-destructive" role="status">
                  {peso(-change)} short
                </p>
              )
            )}
          </>
        ) : (
          <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
            Check the {PAYMENT_LABEL[method]} payment of {peso(total)} on the customer’s phone before completing the sale.
          </p>
        )}

        {!online && (
          <p className="flex items-start gap-2 text-[13px] leading-[18px] text-muted-foreground">
            <CloudOff className="mt-px size-4 flex-none" aria-hidden="true" />
            You’re offline. This sale is saved on this device and syncs when you’re back online.
          </p>
        )}
      </div>

      <footer className="flex-none border-t px-4 pt-3 pb-5">
        <Button size="lg" className="w-full text-lg" disabled={short || busy} onClick={complete}>
          {busy ? <Loader2 className="animate-spin" /> : <Check className="size-5" />}
          {short && receivedNum == null ? 'Enter cash received' : 'Complete sale'}
        </Button>
      </footer>
    </div>
  )
}
