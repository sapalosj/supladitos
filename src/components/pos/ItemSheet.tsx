import { useEffect, useMemo, useState } from 'react'
import { Check, Minus, Plus, X } from 'lucide-react'
import type { MenuData, MenuEntry, MenuGroup } from '@/hooks/useMenu'
import { groupRuleLabel, modifierPrice } from '@/hooks/useMenu'
import { useIsTablet } from '@/hooks/useMediaQuery'
import type { CartLine } from '@/hooks/useCart'
import {
  defaultSelections,
  groupCount,
  priceItem,
  stepModifier,
  toggleModifier,
  unmetGroups,
  type Selections,
} from '@/lib/pricing'
import { peso } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'

const chip = (on: boolean) =>
  cn(
    'flex h-11 items-center gap-1.5 rounded-md px-3.5 text-sm font-semibold disabled:opacity-50',
    on ? 'border-2 border-ring bg-primary text-primary-foreground' : 'border border-input bg-background',
  )

/**
 * Item options (Pages Design: "POS — Item options"; 5.2, 5.4, 5.5): size,
 * modifier chips (or steppers for groups that allow quantity), a note and
 * quantity, with the price updating live. Bottom sheet on phones, dialog on tablets.
 */
export function ItemSheet({
  menu,
  item,
  editing,
  onClose,
  onAdd,
}: {
  menu: MenuData
  item: MenuEntry | null
  /** When editing a cart line, its current choices. */
  editing: CartLine | null
  onClose: () => void
  onAdd: (line: Omit<CartLine, 'key'>) => void
}) {
  const isTablet = useIsTablet()
  const open = !!item

  const body = item && <ItemOptions key={`${item.id}-${editing?.key ?? 'new'}`} menu={menu} item={item} editing={editing} onClose={onClose} onAdd={onAdd} />

  if (isTablet) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent showCloseButton={false} className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogTitle className="sr-only">{item?.name}</DialogTitle>
          <DialogDescription className="sr-only">Choose size and options</DialogDescription>
          {body}
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" showCloseButton={false} className="flex h-[88dvh] flex-col gap-0 rounded-t-xl p-0">
        <SheetTitle className="sr-only">{item?.name}</SheetTitle>
        <SheetDescription className="sr-only">Choose size and options</SheetDescription>
        <div className="flex flex-none justify-center pt-2" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-border" />
        </div>
        {body}
      </SheetContent>
    </Sheet>
  )
}

function ItemOptions({
  menu,
  item,
  editing,
  onClose,
  onAdd,
}: {
  menu: MenuData
  item: MenuEntry
  editing: CartLine | null
  onClose: () => void
  onAdd: (line: Omit<CartLine, 'key'>) => void
}) {
  const [variantId, setVariantId] = useState<string | null>(
    editing?.variantId ?? (item.variants.length === 1 ? item.variants[0].id : null),
  )
  const [sel, setSel] = useState<Selections>(() => editing?.selections ?? defaultSelections(item))
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [qty, setQty] = useState(editing?.quantity ?? 1)
  const [shake, setShake] = useState<string | null>(null)

  useEffect(() => {
    if (!shake) return
    const t = setTimeout(() => setShake(null), 1200)
    return () => clearTimeout(t)
  }, [shake])

  const variant = item.variants.find((v) => v.id === variantId) ?? null
  const priced = useMemo(() => (variant ? priceItem(menu, item, variant, sel) : null), [menu, item, variant, sel])
  const unmet = unmetGroups(item, sel)
  const missing = !variant ? 'Pick a size' : unmet.length ? `Pick ${unmet[0].name.toLowerCase()}` : null

  function add() {
    if (!variant || !priced || missing) {
      setShake(!variant ? 'size' : unmet[0]?.id ?? null)
      return
    }
    onAdd({
      menuItemId: item.id,
      variantId: variant.id,
      itemName: item.name,
      variantName: variant.name,
      singleVariant: item.variants.length === 1,
      unitPrice: priced.unitPrice,
      quantity: qty,
      notes: notes.trim(),
      modifiers: priced.modifiers,
      selections: sel,
    })
  }

  return (
    <>
      <header className="flex flex-none items-start justify-between gap-3 border-b px-4 pt-3 pb-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl leading-6 font-extrabold tracking-[0.01em]">{item.name}</h2>
          {item.description && <p className="description">{item.description}</p>}
        </div>
        <Button variant="secondary" size="icon" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        {item.variants.length > 1 && (
          <fieldset className={cn('flex flex-col gap-2 rounded-md', shake === 'size' && 'animate-pulse ring-2 ring-destructive ring-offset-4')}>
            <legend className="mb-2 flex items-baseline gap-2">
              <span className="text-base font-bold">Size</span>
              <span className="text-xs font-medium text-muted-foreground">Required</span>
            </legend>
            <div role="radiogroup" aria-label="Size" className="grid grid-cols-[repeat(auto-fit,minmax(96px,1fr))] gap-2">
              {item.variants.map((v) => {
                const on = v.id === variantId
                return (
                  <button
                    key={v.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setVariantId(v.id)}
                    className={cn(
                      'flex h-[72px] flex-col items-center justify-center gap-0.5 rounded-md px-2',
                      on ? 'border-2 border-ring bg-primary text-primary-foreground' : 'border border-input bg-background',
                    )}
                  >
                    <span className="text-center text-xs font-extrabold tracking-[0.02em] uppercase">{v.name}</span>
                    <span className="font-display text-xl leading-6">{Math.round(Number(v.price))}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>
        )}

        {item.groups.map((g) => (
          <GroupPicker
            key={g.id}
            group={g}
            menu={menu}
            variantName={variant?.name ?? null}
            sel={sel}
            highlight={shake === g.id}
            onChange={setSel}
          />
        ))}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Note for this {item.variants.length > 1 || item.groups.length ? 'drink' : 'item'}</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. less ice"
            className="h-11 rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </label>
      </div>

      <footer className="flex flex-none items-center gap-3 border-t px-4 pt-3 pb-5">
        <span className="flex items-center gap-1">
          <Button variant="outline" className="h-14 w-12" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>
            <Minus />
          </Button>
          <span className="tabular w-7 text-center text-lg font-bold" aria-live="polite" aria-label={`Quantity ${qty}`}>
            {qty}
          </span>
          <Button variant="outline" className="h-14 w-12" aria-label="Increase quantity" onClick={() => setQty(qty + 1)}>
            <Plus />
          </Button>
        </span>
        <Button size="lg" className="h-14 flex-1 justify-between px-4 text-base" onClick={add} aria-disabled={!!missing}>
          <span>{missing ?? (editing ? 'Update line' : 'Add to cart')}</span>
          {priced && <span className="font-display text-[22px] font-normal">{peso(priced.unitPrice * qty)}</span>}
        </Button>
      </footer>
    </>
  )
}

function GroupPicker({
  group: g,
  menu,
  variantName,
  sel,
  highlight,
  onChange,
}: {
  group: MenuGroup
  menu: MenuData
  variantName: string | null
  sel: Selections
  highlight: boolean
  onChange: (s: Selections) => void
}) {
  const full = g.max_select != null && groupCount(g, sel) >= g.max_select
  return (
    <fieldset className={cn('flex flex-col gap-2 rounded-md', highlight && 'animate-pulse ring-2 ring-destructive ring-offset-4')}>
      <legend className="mb-2 flex items-baseline gap-2">
        <span className="text-base font-bold">{g.name}</span>
        <span className="text-xs font-medium text-muted-foreground">{groupRuleLabel(g)}</span>
      </legend>
      {g.allow_quantity ? (
        <div className="flex flex-col gap-2">
          {g.modifiers.map((m) => {
            const qty = sel[m.id] ?? 0
            const price = modifierPrice(menu, m, variantName)
            return (
              <div
                key={m.id}
                className={cn(
                  'flex min-h-14 items-center justify-between rounded-md py-1 pr-1 pl-3.5',
                  qty > 0 ? 'border-2 border-ring' : 'border border-input',
                  !m.is_available && 'opacity-50',
                )}
              >
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">{m.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.is_available ? (price ? `+${Math.round(price)} each` : 'Free') : 'Sold out'}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={`Remove one ${m.name}`}
                    disabled={qty === 0}
                    onClick={() => {
                      const next = stepModifier(g, m, sel, -1)
                      if (next) onChange(next)
                    }}
                  >
                    <Minus />
                  </Button>
                  <span className="tabular w-8 text-center font-bold" aria-label={`${m.name} quantity ${qty}`}>
                    {qty}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={`Add one ${m.name}`}
                    disabled={!m.is_available || full}
                    onClick={() => {
                      const next = stepModifier(g, m, sel, 1)
                      if (next) onChange(next)
                    }}
                  >
                    <Plus />
                  </Button>
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {g.modifiers.map((m) => {
            const on = (sel[m.id] ?? 0) > 0
            const price = modifierPrice(menu, m, variantName)
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                disabled={!m.is_available || (!on && full && g.max_select !== 1)}
                onClick={() => {
                  const next = toggleModifier(g, m, sel)
                  if (next) onChange(next)
                }}
                className={chip(on)}
              >
                {on && <Check className="size-4" aria-hidden="true" />}
                <span className={cn(!m.is_available && 'line-through')}>{m.name}</span>
                {!m.is_available ? (
                  <span className="text-xs">Sold out</span>
                ) : (
                  price !== 0 && (
                    <span className={cn('tabular', !on && 'text-muted-foreground')}>
                      {price > 0 ? '+' : '−'}
                      {Math.abs(Math.round(price))}
                    </span>
                  )
                )}
              </button>
            )
          })}
        </div>
      )}
    </fieldset>
  )
}
