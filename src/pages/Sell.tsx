import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, Search, SearchX } from 'lucide-react'
import { toast } from 'sonner'
import { useProfile } from '@/lib/auth'
import { useMenu, shortVariant, type MenuEntry } from '@/hooks/useMenu'
import { useCart, type CartLine } from '@/hooks/useCart'
import { useIsTablet } from '@/hooks/useMediaQuery'
import { nextOrderNumber, saveOrder } from '@/lib/orders'
import { lineDiscount } from '@/lib/pricing'
import { requestSync } from '@/lib/sync'
import { businessDate, orderNo, peso, priceList, shortDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { EmptyState, HeaderStatus } from '@/components/layout/Page'
import { ItemSheet } from '@/components/pos/ItemSheet'
import { CartPanel } from '@/components/pos/CartPanel'
import { PaymentPanel, type PaymentInput } from '@/components/pos/PaymentPanel'
import { QueueStrip } from '@/components/orders/QueueStrip'

/** The number the next sale will most likely get (the cart title on tablets). */
function useNextOrderNumber(timeZone: string): number {
  const today = businessDate(new Date(), timeZone)
  return useLiveQuery(() => nextOrderNumber(today), [today], 1)
}

/** "HOT · ICED R · ICED U" when every multi-size item in the category has the same sizes. */
function sizeColumns(items: MenuEntry[], short: boolean): string | null {
  const sets = items.filter((i) => i.variants.length > 1).map((i) => i.variants.map((v) => v.name).join('|'))
  if (sets.length === 0 || new Set(sets).size !== 1) return null
  return sets[0]
    .split('|')
    .map((n) => (short ? shortVariant(n) : n).toUpperCase())
    .join(' · ')
}

/**
 * POS — Sell (Pages Design: "POS — Sell", "POS — Tablet landscape"; milestone 5).
 * The menu comes from Dexie, sales go to the outbox, so all of it works offline.
 */
export default function Sell() {
  const profile = useProfile()
  const menu = useMenu()
  const cart = useCart()
  const isTablet = useIsTablet()
  const nextNumber = useNextOrderNumber(profile.timezone)

  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sheet, setSheet] = useState<{ item: MenuEntry; editing: CartLine | null } | null>(null)
  const [phoneView, setPhoneView] = useState<'cart' | 'payment' | null>(null)
  const [paying, setPaying] = useState(false)
  const [saving, setSaving] = useState(false)

  const categories = menu?.categories ?? []
  const active = categories.find((c) => c.id === selected) ?? categories[0]
  const q = query.trim().toLowerCase()

  const tiles = useMemo(() => {
    if (!menu) return []
    if (q) {
      return menu.items.filter(
        (i) => i.variants.length > 0 && (i.name.toLowerCase().includes(q) || (i.description ?? '').toLowerCase().includes(q)),
      )
    }
    return (active ? (menu.itemsByCategory.get(active.id) ?? []) : []).filter((i) => i.variants.length > 0)
  }, [menu, active, q])

  function tap(item: MenuEntry) {
    // One tap for single-price items with no options (5.3).
    if (item.variants.length === 1 && item.groups.length === 0) {
      const v = item.variants[0]
      cart.addLine({
        menuItemId: item.id,
        variantId: v.id,
        itemName: item.name,
        variantName: v.name,
        singleVariant: true,
        unitPrice: Number(v.price),
        quantity: 1,
        notes: '',
        modifiers: [],
        selections: {},
      })
      toast.success(`Added ${item.name}`, { duration: 1200 })
      return
    }
    setSheet({ item, editing: null })
  }

  function editLine(line: CartLine) {
    const item = menu?.items.find((i) => i.id === line.menuItemId)
    if (!item) {
      toast.error('This item is no longer on the menu. Remove it and add it again.')
      return
    }
    setSheet({ item, editing: line })
  }

  function onAdd(line: Omit<CartLine, 'key'>) {
    if (sheet?.editing) cart.replaceLine(sheet.editing.key, line)
    else {
      cart.addLine(line)
      toast.success(`Added ${line.quantity > 1 ? `${line.quantity}× ` : ''}${line.itemName}`, { duration: 1200 })
    }
    setSheet(null)
  }

  function charge() {
    if (isTablet) setPaying(true)
    else setPhoneView('payment')
  }

  /** Save the sale. `p` is null for "pay later": the order is saved unpaid. */
  async function complete(p: PaymentInput | null) {
    if (saving) return
    setSaving(true)
    try {
      const total = cart.total
      const order = await saveOrder(
        {
          id: crypto.randomUUID(),
          branchId: profile.branchId,
          orderType: cart.orderType,
          customerName: cart.customerName.trim() || null,
          subtotal: cart.subtotal,
          discountTotal: cart.discountTotal,
          total,
          items: cart.lines.map((l) => ({
            id: crypto.randomUUID(),
            menuItemId: l.menuItemId,
            variantId: l.variantId,
            itemName: l.itemName,
            variantName: l.variantName,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            lineTotal: l.unitPrice * l.quantity,
            notes: l.notes || null,
            discount: l.discount
              ? { ...l.discount, amount: lineDiscount(l.unitPrice, l.quantity, l.discount) }
              : null,
            modifiers: l.modifiers.map((m) => ({
              id: crypto.randomUUID(),
              modifierId: m.modifierId,
              name: m.name,
              priceDelta: m.priceDelta,
              quantity: m.quantity,
            })),
          })),
          payment: p && {
            id: crypto.randomUUID(),
            method: p.method,
            amount: total,
            amountReceived: p.amountReceived,
            changeDue: p.changeDue,
            paidAt: new Date().toISOString(),
          },
          createdBy: profile.userId,
        },
        profile.timezone,
      )
      cart.clear()
      setPaying(false)
      setPhoneView(null)
      toast.success(`Order ${orderNo(order.orderNumber)} saved`, {
        description: p
          ? p.changeDue
            ? `Change due ${peso(p.changeDue)}`
            : undefined
          : `Not paid yet: ${order.customerName ? `${order.customerName} owes ` : ''}${peso(total)}`,
      })
      void requestSync()
    } catch (e) {
      toast.error(`Couldn’t save the order: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  const sizes = !q && active ? sizeColumns(menu?.itemsByCategory.get(active.id) ?? [], !isTablet) : null

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        {/* Phone header: wordmark, branch and date, connection status */}
        <header className="flex flex-none items-center justify-between gap-3 px-4 pt-4 pb-2 md:hidden">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="wordmark text-xl leading-6">Supladitos</span>
            <span className="truncate text-xs leading-4 font-medium text-muted-foreground">
              {profile.branchName} · {shortDate(new Date(), profile.timezone)}
            </span>
          </div>
          <HeaderStatus />
        </header>

        <div className="flex flex-none flex-col gap-2 px-4 py-2 md:flex-row-reverse md:items-center md:gap-3 md:px-5 md:pt-4">
          <label className="flex h-11 items-center gap-2 rounded-md border border-input bg-muted px-3 text-muted-foreground md:w-56 md:bg-background">
            <Search className="size-5" strokeWidth={1.75} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search menu"
              aria-label="Search menu"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <nav aria-label="Categories" className="-mx-4 flex flex-1 gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={!q && c.id === active?.id}
                onClick={() => {
                  setSelected(c.id)
                  setQuery('')
                }}
                className={cn(
                  'column-head h-11 flex-none rounded-md px-4 md:h-12',
                  !q && c.id === active?.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground',
                )}
              >
                {c.name}
              </button>
            ))}
          </nav>
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4 md:px-5">
          {!menu ? null : categories.length === 0 ? (
            <EmptyState icon={BookOpen} title="No menu on this device yet" className="mt-4">
              The menu downloads automatically whenever the app is online. Tiles appear here once it has.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <h1 className="section-title text-2xl leading-7 md:text-[28px] md:leading-8">{q ? 'Results' : active?.name}</h1>
                {sizes && <span className="column-head text-right text-xs text-muted-foreground md:text-[13px]">{sizes}</span>}
              </div>
              {tiles.length === 0 ? (
                <EmptyState icon={SearchX} title={q ? `Nothing matches “${query.trim()}”` : 'No items in this category'} />
              ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fill,minmax(168px,1fr))]">
                  {tiles.map((item) => (
                    <Tile key={item.id} item={item} onTap={() => tap(item)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Tablet: queue under the tiles (6.1) */}
        <QueueStrip className="hidden md:flex" />

        {/* Phone cart bar */}
        <div className="flex-none border-t px-4 py-2 md:hidden">
          <Button size="lg" className="w-full justify-between px-4" disabled={cart.count === 0} onClick={() => setPhoneView('cart')}>
            <span className="flex items-center gap-2.5">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary-foreground text-sm font-bold text-secondary">
                {cart.count}
              </span>
              View cart
            </span>
            <span className="font-display text-2xl font-normal">{peso(cart.total)}</span>
          </Button>
        </div>
      </section>

      {/* Tablet: cart docked on the right */}
      {isTablet && (
        <aside aria-label="Cart" className="w-[340px] flex-none border-l">
          <CartPanel
            layout="tablet"
            title={`Order ${orderNo(nextNumber)}`}
            busy={saving}
            onEdit={editLine}
            onCharge={charge}
            onPayLater={() => void complete(null)}
          />
        </aside>
      )}

      {menu && <ItemSheet menu={menu} item={sheet?.item ?? null} editing={sheet?.editing ?? null} onClose={() => setSheet(null)} onAdd={onAdd} />}

      {/* Phone: cart and payment as full-screen sheets */}
      <Sheet open={!isTablet && phoneView !== null} onOpenChange={(o) => !o && !saving && setPhoneView(null)}>
        <SheetContent side="bottom" showCloseButton={false} className="h-dvh gap-0 p-0">
          <SheetTitle className="sr-only">{phoneView === 'payment' ? 'Payment' : 'Cart'}</SheetTitle>
          <SheetDescription className="sr-only">Review the order and take payment</SheetDescription>
          {phoneView === 'payment' ? (
            <PaymentPanel
              total={cart.total}
              orderType={cart.orderType}
              customerName={cart.customerName}
              busy={saving}
              onBack={() => setPhoneView('cart')}
              onComplete={complete}
            />
          ) : (
            <CartPanel
              layout="phone"
              title="Cart"
              busy={saving}
              onBack={() => setPhoneView(null)}
              onEdit={editLine}
              onCharge={charge}
              onPayLater={() => void complete(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Tablet: payment dialog */}
      <Dialog open={isTablet && paying} onOpenChange={(o) => !o && !saving && setPaying(false)}>
        <DialogContent showCloseButton={false} className="flex h-[min(760px,92dvh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogTitle className="sr-only">Payment</DialogTitle>
          <DialogDescription className="sr-only">Take payment for this order</DialogDescription>
          <PaymentPanel
            total={cart.total}
            orderType={cart.orderType}
            customerName={cart.customerName}
            busy={saving}
            onBack={() => setPaying(false)}
            onComplete={complete}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Tile({ item, onTap }: { item: MenuEntry; onTap: () => void }) {
  if (!item.is_available) {
    return (
      <button
        type="button"
        disabled
        className="flex min-h-tile flex-col justify-between gap-2 rounded-xl border border-dashed bg-muted p-3 text-left text-muted-foreground md:min-h-[120px] md:p-3.5"
      >
        <span className="flex flex-col gap-1">
          <span className="text-sm leading-[18px] font-extrabold tracking-[0.01em] line-through md:text-[15px] md:leading-5">{item.name}</span>
          {item.description && <span className="text-[11px] leading-[14px] tracking-[0.03em] md:text-xs">{item.description}</span>}
        </span>
        <span className="self-start rounded-sm bg-status-voided-bg px-2 py-0.5 text-xs font-semibold text-status-voided-fg">Sold out</span>
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onTap}
      className="flex min-h-tile flex-col justify-between gap-2 rounded-xl border bg-card p-3 text-left shadow-sm transition-transform active:scale-[0.98] md:min-h-[120px] md:p-3.5"
    >
      <span className="flex flex-col gap-1">
        <span className="text-sm leading-[18px] font-extrabold tracking-[0.01em] md:text-[15px] md:leading-5">{item.name}</span>
        {item.description && <span className="description text-[11px] leading-[14px] md:text-xs">{item.description}</span>}
      </span>
      <span className="font-display text-lg leading-[22px] tracking-[0.02em] md:text-xl md:leading-6">
        {priceList(item.variants.map((v) => Number(v.price)))}
      </span>
    </button>
  )
}
