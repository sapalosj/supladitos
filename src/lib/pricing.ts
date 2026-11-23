import type { ItemVariant, LineDiscount, Modifier } from './db'
import { modifierPrice, type MenuData, type MenuEntry, type MenuGroup } from '@/hooks/useMenu'

/**
 * Discount on one unit: the percentage off the unit price (drink plus
 * add-ons), rounded to the peso. Must match line_discount_amount in the database.
 */
export function discountPerUnit(unitPrice: number, percent: number): number {
  return Math.round((Math.round(unitPrice * 100) * percent) / 10000)
}

/** Discount on a line: the per-unit discount times the discounted units. */
export function lineDiscount(unitPrice: number, quantity: number, d: LineDiscount | null | undefined): number {
  if (!d || d.quantity <= 0) return 0
  return discountPerUnit(unitPrice, d.percent) * Math.min(d.quantity, quantity)
}

/** Selected modifiers: modifier id -> quantity (1 unless the group allows quantity). */
export type Selections = Record<string, number>

export interface PricedModifier {
  modifierId: string
  name: string
  priceDelta: number
  quantity: number
}

/** Minimum picks for a group: `is_required` means at least one. */
export function groupMin(g: MenuGroup): number {
  return Math.max(g.min_select, g.is_required ? 1 : 0)
}

export function groupCount(g: MenuGroup, sel: Selections): number {
  return g.modifiers.reduce((n, m) => n + (sel[m.id] ?? 0), 0)
}

/**
 * Tap on a modifier chip (5.4). Single-pick groups behave like radio buttons;
 * multi-pick groups toggle, up to the maximum. Returns the new selections, or
 * null if the tap isn't allowed (group full).
 */
export function toggleModifier(g: MenuGroup, m: Modifier, sel: Selections): Selections | null {
  const next = { ...sel }
  const on = (sel[m.id] ?? 0) > 0
  if (on) {
    // A required single-pick group can't be emptied by tapping its choice again.
    if (g.max_select === 1 && groupMin(g) >= 1) return sel
    delete next[m.id]
    return next
  }
  if (g.max_select === 1) {
    for (const x of g.modifiers) delete next[x.id]
    next[m.id] = 1
    return next
  }
  if (g.max_select != null && groupCount(g, sel) >= g.max_select) return null
  next[m.id] = 1
  return next
}

/** +/- on a modifier in a group that allows quantity. */
export function stepModifier(g: MenuGroup, m: Modifier, sel: Selections, delta: 1 | -1): Selections | null {
  const qty = (sel[m.id] ?? 0) + delta
  if (qty < 0) return null
  if (delta > 0 && g.max_select != null && groupCount(g, sel) >= g.max_select) return null
  const next = { ...sel }
  if (qty === 0) delete next[m.id]
  else next[m.id] = qty
  return next
}

/** Starting selections: required single-pick groups get their first available option. */
export function defaultSelections(item: MenuEntry): Selections {
  const sel: Selections = {}
  for (const g of item.groups) {
    if (g.max_select === 1 && groupMin(g) === 1) {
      const first = g.modifiers.find((m) => m.is_available)
      if (first) sel[first.id] = 1
    }
  }
  return sel
}

/** Groups whose rules aren't met yet (5.4). */
export function unmetGroups(item: MenuEntry, sel: Selections): MenuGroup[] {
  return item.groups.filter((g) => {
    const n = groupCount(g, sel)
    return n < groupMin(g) || (g.max_select != null && n > g.max_select)
  })
}

/** Price one unit of the item with these options (5.5). */
export function priceItem(
  menu: Pick<MenuData, 'variantPrices'>,
  item: MenuEntry,
  variant: ItemVariant,
  sel: Selections,
): { unitPrice: number; modifiers: PricedModifier[] } {
  const modifiers: PricedModifier[] = []
  let unit = Number(variant.price)
  for (const g of item.groups) {
    for (const m of g.modifiers) {
      const qty = sel[m.id] ?? 0
      if (qty <= 0) continue
      const delta = modifierPrice(menu, m, variant.name)
      unit += delta * qty
      modifiers.push({ modifierId: m.id, name: m.name, priceDelta: delta, quantity: qty })
    }
  }
  return { unitPrice: unit, modifiers }
}
