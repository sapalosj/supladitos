import { useState } from 'react'
import { toast } from 'sonner'
import type { LocalOrder } from '@/lib/db'
import { payOrder } from '@/lib/orders'
import { requestSync } from '@/lib/sync'
import { orderNo, peso } from '@/lib/format'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { PaymentPanel, type PaymentInput } from '@/components/pos/PaymentPanel'

/** Take payment for an order that was saved unpaid (pay later). */
export function TakePaymentDialog({ order, onClose }: { order: LocalOrder | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false)

  async function complete(p: PaymentInput) {
    if (!order) return
    setBusy(true)
    try {
      await payOrder(order, p)
      toast.success(`Order ${orderNo(order.orderNumber)} paid`, {
        description: p.changeDue ? `Change due ${peso(p.changeDue)}` : undefined,
      })
      void requestSync()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent showCloseButton={false} className="flex h-[min(760px,92dvh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogTitle className="sr-only">Take payment</DialogTitle>
        <DialogDescription className="sr-only">Take payment for an unpaid order</DialogDescription>
        {order && (
          <PaymentPanel
            key={order.id}
            title={`Payment · ${orderNo(order.orderNumber)}`}
            backLabel="Back"
            completeLabel="Record payment"
            total={order.total}
            orderType={order.orderType}
            customerName={order.customerName ?? ''}
            busy={busy}
            onBack={onClose}
            onComplete={(p) => void complete(p)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
