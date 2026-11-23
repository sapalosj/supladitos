import { useProfile } from '@/lib/auth'
import { orderNo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { NEXT_STEP, StatusBadge, UnpaidBadge, advanceOrder, itemsSummary, useQueue } from './orderUi'

/**
 * The order queue under the tiles on the tablet POS (Pages Design: "POS —
 * Tablet landscape"; 6.1). Phones see the queue on the Orders screen.
 */
export function QueueStrip({ className }: { className?: string }) {
  const profile = useProfile()
  const queue = useQueue(profile.timezone)
  if (queue.length === 0) return null

  return (
    <section aria-label="Order queue" className={cn('flex-none flex-col gap-2 border-t bg-muted px-5 py-3', className)}>
      <h2 className="text-sm font-bold">Queue · {queue.length}</h2>
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {queue.map((o) => {
          const step = NEXT_STEP[o.status]!
          return (
            <li
              key={o.id}
              className="flex w-[min(440px,48%)] min-w-[320px] flex-none items-center gap-3 rounded-xl border bg-card px-3 py-2.5"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span className="font-display text-xl leading-6">{orderNo(o.orderNumber)}</span>
                  <StatusBadge status={o.status} />
                  {!o.payment && <UnpaidBadge />}
                  {o.customerName && <span className="truncate text-xs text-muted-foreground">{o.customerName}</span>}
                </span>
                <span className="truncate text-[13px] text-muted-foreground">{itemsSummary(o)}</span>
              </span>
              <Button
                className={cn('h-11 px-3 text-[13px] font-bold', step.style)}
                aria-label={`${step.label}: order ${orderNo(o.orderNumber)}`}
                onClick={() => void advanceOrder(o)}
              >
                {step.short}
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
