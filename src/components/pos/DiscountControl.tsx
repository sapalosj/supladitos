import { useLiveQuery } from 'dexie-react-hooks'
import { Minus, Plus, Tag } from 'lucide-react'
import { db, type Discount, type LineDiscount } from '@/lib/db'
import { peso } from '@/lib/format'
import { lineDiscount } from '@/lib/pricing'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

/** The branch's active discount types, as stored on this device. */
export function useDiscounts(): Discount[] {
  return useLiveQuery(
    async () =>
      (await db.discounts.toArray())
        .filter((d) => d.is_active)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [],
    [],
  )
}

/**
 * Discount on one line. Without a discount it's a "Discount" button (a menu
 * when the branch has several types); with one it shows the name, the amount
 * taken off, and how many of the line's units are discounted.
 */
export function DiscountControl({
  discounts,
  itemName,
  unitPrice,
  quantity,
  value,
  onChange,
}: {
  discounts: Discount[]
  itemName: string
  unitPrice: number
  /** Units on the line: the most that can be discounted. */
  quantity: number
  value: LineDiscount | null | undefined
  onChange: (d: LineDiscount | null) => void
}) {
  if (!value) {
    if (discounts.length === 0) return null
    const pick = (d: Discount) => onChange({ discountId: d.id, name: d.name, percent: Number(d.percent), quantity: 1 })
    const button = (
      <Button
        variant="ghost"
        className="px-2 text-caramel-text"
        aria-label={`Discount ${itemName}`}
        onClick={discounts.length === 1 ? () => pick(discounts[0]) : undefined}
      >
        <Tag /> Discount
      </Button>
    )
    if (discounts.length === 1) return button
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {discounts.map((d) => (
            <DropdownMenuItem key={d.id} className="h-11" onSelect={() => pick(d)}>
              {d.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const count = Math.min(value.quantity, quantity)
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-status-done-bg px-2.5 py-1.5 text-success">
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1.5 truncate text-[13px] font-semibold">
          <Tag className="size-3.5 flex-none" aria-hidden="true" /> {value.name}
        </span>
        <span className="tabular text-xs">
          {count} of {quantity} · −{peso(lineDiscount(unitPrice, quantity, value))}
        </span>
      </span>
      <span className="flex flex-none items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          className="text-foreground"
          aria-label={count <= 1 ? `Remove discount from ${itemName}` : `One less discounted ${itemName}`}
          onClick={() => onChange(count <= 1 ? null : { ...value, quantity: count - 1 })}
        >
          <Minus />
        </Button>
        <span className="tabular w-6 text-center text-sm font-bold" aria-label={`${count} discounted`}>
          {count}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          className="text-foreground"
          disabled={count >= quantity}
          aria-label={`One more discounted ${itemName}`}
          onClick={() => onChange({ ...value, quantity: count + 1 })}
        >
          <Plus />
        </Button>
      </span>
    </div>
  )
}
