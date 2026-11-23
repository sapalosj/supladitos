import { ChevronLeft, Clock, Minus, Pencil, Plus, ShoppingBag } from 'lucide-react'
import { lineDetail, useCart, type CartLine } from '@/hooks/useCart'
import { ORDER_TYPE_LABEL, peso } from '@/lib/format'
import { lineDiscount } from '@/lib/pricing'
import type { OrderType } from '@/lib/db'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/layout/Page'
import { DiscountControl, useDiscounts } from './DiscountControl'

/**
 * The cart (Pages Design: "POS — Cart" on phones, the docked column on
 * tablets; 5.6, 5.7): order type, optional customer name, lines with quantity,
 * edit, notes and discount, and the Charge button. "Pay later" saves the order unpaid
 * (the customer name is optional there too).
 */
export function CartPanel({
  layout,
  title,
  onBack,
  busy = false,
  onEdit,
  onCharge,
  onPayLater,
}: {
  layout: 'phone' | 'tablet'
  title: string
  onBack?: () => void
  busy?: boolean
  onEdit: (line: CartLine) => void
  onCharge: () => void
  onPayLater: () => void
}) {
  const cart = useCart()
  const phone = layout === 'phone'
  const discounts = useDiscounts()

  const orderMeta = (
    <>
      <div role="radiogroup" aria-label="Order type" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(Object.keys(ORDER_TYPE_LABEL) as OrderType[]).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={cart.orderType === t}
            onClick={() => cart.setOrderType(t)}
            className={cn(
              'h-11 rounded-md text-sm',
              cart.orderType === t ? 'bg-primary font-bold text-primary-foreground' : 'font-semibold text-secondary-foreground',
            )}
          >
            {ORDER_TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1.5">
        <span className={cn('text-sm font-semibold', !phone && 'sr-only')}>
          Customer name <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        <input
          value={cart.customerName}
          onChange={(e) => cart.setCustomerName(e.target.value)}
          placeholder={phone ? undefined : 'Customer name (optional)'}
          autoComplete="off"
          className="h-11 rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </label>
    </>
  )

  const lines =
    cart.lines.length === 0 ? (
      <div className="flex flex-1 items-center justify-center py-6">
        <EmptyState icon={ShoppingBag} title="Cart is empty" className="w-full border-0">
          Tap an item to add it.
        </EmptyState>
      </div>
    ) : (
      <ul className={cn('flex flex-col', phone && 'border-t')} aria-label="Cart lines">
        {cart.lines.map((l) => (
          <li key={l.key} className="flex flex-col gap-2 border-b py-3">
            <div className="flex justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[15px] leading-5 font-extrabold tracking-[0.01em]">{l.itemName}</span>
                {lineDetail(l) && <span className="text-[13px] leading-[18px] text-muted-foreground">{lineDetail(l)}</span>}
                {l.notes && (
                  <span className="self-start rounded-sm bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                    Note: {l.notes}
                  </span>
                )}
              </div>
              <span className="flex flex-col items-end">
                <span className="tabular text-base font-bold whitespace-nowrap">
                  {peso(l.unitPrice * l.quantity - lineDiscount(l.unitPrice, l.quantity, l.discount))}
                </span>
                {l.discount && (
                  <span className="tabular text-xs whitespace-nowrap text-muted-foreground line-through">
                    {peso(l.unitPrice * l.quantity)}
                  </span>
                )}
              </span>
            </div>
            {l.discount && (
              <DiscountControl
                discounts={discounts}
                itemName={l.itemName}
                unitPrice={l.unitPrice}
                quantity={l.quantity}
                value={l.discount}
                onChange={(d) => cart.setDiscount(l.key, d)}
              />
            )}
            <div className="flex items-center justify-between">
              <span className="-ml-2 flex items-center">
                <Button variant="ghost" className="px-2 text-caramel-text" onClick={() => onEdit(l)}>
                  <Pencil /> Edit
                </Button>
                {!l.discount && (
                  <DiscountControl
                    discounts={discounts}
                    itemName={l.itemName}
                    unitPrice={l.unitPrice}
                    quantity={l.quantity}
                    value={null}
                    onChange={(d) => cart.setDiscount(l.key, d)}
                  />
                )}
              </span>
              <span className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={l.quantity === 1 ? `Remove ${l.itemName}` : `One less ${l.itemName}`}
                  onClick={() => cart.setQuantity(l.key, l.quantity - 1)}
                >
                  <Minus />
                </Button>
                <span className="tabular w-8 text-center font-bold" aria-label={`${l.itemName} quantity ${l.quantity}`}>
                  {l.quantity}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={`One more ${l.itemName}`}
                  onClick={() => cart.setQuantity(l.key, l.quantity + 1)}
                >
                  <Plus />
                </Button>
              </span>
            </div>
          </li>
        ))}
      </ul>
    )

  const footer = (
    <div className="flex flex-none flex-col gap-3 border-t px-4 pt-3 pb-4">
      {cart.discountTotal > 0 && (
        <dl className="flex flex-col gap-1 text-sm" data-testid="cart-discount">
          <div className="flex justify-between text-muted-foreground">
            <dt>Subtotal</dt>
            <dd className="tabular">{peso(cart.subtotal)}</dd>
          </div>
          <div className="flex justify-between text-success">
            <dt>Discount</dt>
            <dd className="tabular font-semibold">−{peso(cart.discountTotal)}</dd>
          </div>
        </dl>
      )}
      <div className="flex items-baseline justify-between">
        <span className="text-base font-bold">Total</span>
        <span className="font-display text-[32px] leading-9">{peso(cart.total)}</span>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="lg" disabled={cart.lines.length === 0 || busy} onClick={onPayLater}>
          <Clock /> Pay later
        </Button>
        <Button size="lg" className="min-w-0 flex-1 text-lg" disabled={cart.lines.length === 0 || busy} onClick={onCharge}>
          {cart.lines.length ? `Charge ${peso(cart.total)}` : 'Charge'}
        </Button>
      </div>
    </div>
  )

  if (phone) {
    return (
      <div className="flex h-full flex-col">
        <header className="flex flex-none items-center gap-2 border-b px-2 py-3">
          <Button variant="ghost" size="icon" aria-label="Back to menu" onClick={onBack}>
            <ChevronLeft />
          </Button>
          <h2 className="flex-1 text-xl leading-7 font-extrabold">
            Cart{' '}
            <span className="text-sm font-medium text-muted-foreground">
              · {cart.count} {cart.count === 1 ? 'item' : 'items'}
            </span>
          </h2>
          {cart.lines.length > 0 && (
            <Button variant="ghost" className="text-destructive" onClick={cart.clear}>
              Clear
            </Button>
          )}
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {orderMeta}
          {lines}
        </div>
        {footer}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-none flex-col gap-3 border-b p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl leading-7 font-extrabold">{title}</h2>
          {cart.lines.length > 0 && (
            <Button variant="ghost" size="sm" className="text-destructive" onClick={cart.clear}>
              Clear
            </Button>
          )}
        </div>
        {orderMeta}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4">{lines}</div>
      {footer}
    </div>
  )
}
