import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  type Category,
  type ItemVariant,
  type MenuItem,
  type Modifier,
  type ModifierGroup,
  type ModifierVariantPrice,
} from '@/lib/db'

export interface MenuGroup extends ModifierGroup {
  modifiers: Modifier[]
}

export interface MenuEntry extends MenuItem {
  variants: ItemVariant[]
  /** Attached modifier groups, in the item's order. */
  groups: MenuGroup[]
}

export interface MenuData {
  categories: Category[]
  /** Items per category id, sorted. */
  itemsByCategory: Map<string, MenuEntry[]>
  items: MenuEntry[]
  /** All modifier groups (sorted), with their modifiers (sorted). */
  groups: MenuGroup[]
  /** "<modifier id>|<variant name>" -> price delta override */
  variantPrices: Map<string, number>
  /** Distinct variant names used on the menu (Hot, Iced Regular, …). */
  variantNames: string[]
}

const bySort = <T extends { sort_order: number; name?: string }>(a: T, b: T) =>
  a.sort_order - b.sort_order || (a.name ?? '').localeCompare(b.name ?? '')

/** The menu as stored on this device (the POS never reads it from the server). */
export function useMenu(): MenuData | undefined {
  return useLiveQuery(async () => {
    const [categories, items, variants, groups, modifiers, variantPrices, links] = await Promise.all([
      db.categories.toArray(),
      db.menuItems.toArray(),
      db.itemVariants.toArray(),
      db.modifierGroups.toArray(),
      db.modifiers.toArray(),
      db.modifierVariantPrices.toArray(),
      db.itemModifierGroups.toArray(),
    ])
    return buildMenu(categories, items, variants, groups, modifiers, variantPrices, links)
  }, [])
}

function buildMenu(
  categories: Category[],
  items: MenuItem[],
  variants: ItemVariant[],
  groups: ModifierGroup[],
  modifiers: Modifier[],
  variantPrices: ModifierVariantPrice[],
  links: { menu_item_id: string; modifier_group_id: string; sort_order: number }[],
): MenuData {
  const menuGroups: MenuGroup[] = [...groups].sort(bySort).map((g) => ({
    ...g,
    modifiers: modifiers.filter((m) => m.modifier_group_id === g.id).sort(bySort),
  }))
  const groupById = new Map(menuGroups.map((g) => [g.id, g]))

  const entries: MenuEntry[] = [...items].sort(bySort).map((item) => ({
    ...item,
    variants: variants.filter((v) => v.menu_item_id === item.id).sort(bySort),
    groups: links
      .filter((l) => l.menu_item_id === item.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((l) => groupById.get(l.modifier_group_id))
      .filter((g): g is MenuGroup => !!g),
  }))

  const itemsByCategory = new Map<string, MenuEntry[]>()
  for (const e of entries) {
    const list = itemsByCategory.get(e.category_id) ?? []
    list.push(e)
    itemsByCategory.set(e.category_id, list)
  }

  const nameOrder = new Map<string, number>()
  for (const v of [...variants].sort((a, b) => a.sort_order - b.sort_order)) {
    if (!nameOrder.has(v.name)) nameOrder.set(v.name, v.sort_order)
  }

  return {
    categories: [...categories].sort(bySort),
    itemsByCategory,
    items: entries,
    groups: menuGroups,
    variantPrices: new Map(variantPrices.map((p) => [`${p.modifier_id}|${p.variant_name}`, Number(p.price_delta)])),
    variantNames: [...nameOrder.keys()],
  }
}

/** A modifier's price on a given variant (per-variant override, else its delta). */
export function modifierPrice(menu: Pick<MenuData, 'variantPrices'>, modifier: Modifier, variantName: string | null): number {
  if (variantName) {
    const override = menu.variantPrices.get(`${modifier.id}|${variantName}`)
    if (override !== undefined) return override
  }
  return Number(modifier.price_delta)
}

/** Short label for variant names in tight spots: "Iced Regular" -> "Iced R". */
export function shortVariant(name: string): string {
  const m = name.match(/^(Iced) (\w)\w+$/)
  return m ? `${m[1]} ${m[2]}` : name
}

/** "Optional · pick 1", "Required · pick 1", "Optional · can repeat" */
export function groupRuleLabel(g: ModifierGroup): string {
  const required = g.is_required || g.min_select > 0
  const parts = [required ? 'Required' : 'Optional']
  const min = Math.max(g.min_select, required ? 1 : 0)
  if (g.max_select === 1) parts.push('pick 1')
  else if (g.max_select && min > 0 && min === g.max_select) parts.push(`pick ${min}`)
  else if (g.max_select && min > 0) parts.push(`pick ${min}–${g.max_select}`)
  else if (g.max_select) parts.push(`up to ${g.max_select}`)
  else if (min > 1) parts.push(`at least ${min}`)
  if (g.allow_quantity) parts.push('can repeat')
  return parts.join(' · ')
}
