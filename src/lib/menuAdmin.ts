import { supabase } from './supabase'
import { db } from './db'
import { requestSync } from './sync'

/**
 * Menu management writes (milestone 4). They go straight to Supabase (online
 * only, owners and managers per RLS), then the menu is copied into Dexie
 * again so the POS and this screen see the change.
 */

async function refresh() {
  await requestSync({ menu: true })
}

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data
}

// ---- Categories (4.1) -----------------------------------------------------------

export async function saveCategory(c: { id?: string; name: string }): Promise<void> {
  const name = c.name.trim()
  if (!name) throw new Error('Give the category a name.')
  if (c.id) {
    check(await supabase.from('categories').update({ name }).eq('id', c.id))
  } else {
    const last = await db.categories.orderBy('sort_order').last()
    check(await supabase.from('categories').insert({ name, sort_order: (last?.sort_order ?? 0) + 1 }))
  }
  await refresh()
}

export async function deleteCategory(id: string): Promise<void> {
  check(await supabase.from('categories').delete().eq('id', id))
  await refresh()
}

// ---- Sort order (4.1, 4.2) ------------------------------------------------------

export async function setSortOrder(table: 'categories' | 'menu_items' | 'modifier_groups', ids: string[]): Promise<void> {
  check(await supabase.rpc('set_sort_order', { p_table: table, p_ids: ids }))
  await refresh()
}

/** Move one id up (-1) or down (+1) in an ordered list; returns the new order. */
export function moveInList(ids: string[], id: string, dir: -1 | 1): string[] | null {
  const i = ids.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= ids.length) return null
  const next = [...ids]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

// ---- Items (4.2, 4.3, 4.6, 4.7) -------------------------------------------------

export interface ItemDraft {
  id: string
  categoryId: string
  name: string
  description: string
  isAvailable: boolean
  variants: { id: string; name: string; price: string }[]
  groupIds: string[]
}

export async function saveItem(d: ItemDraft): Promise<void> {
  const name = d.name.trim()
  if (!name) throw new Error('Give the item a name.')
  if (!d.categoryId) throw new Error('Pick a category.')
  if (d.variants.length === 0) throw new Error('Add at least one price.')
  const variants = d.variants.map((v) => {
    const price = Number(v.price)
    if (!v.name.trim()) throw new Error('Every price needs a name, e.g. Hot or Regular.')
    if (v.price.trim() === '' || !Number.isFinite(price) || price < 0) throw new Error(`Enter a price for ${v.name.trim()}.`)
    return { id: v.id, name: v.name.trim(), price }
  })
  const names = new Set(variants.map((v) => v.name.toLowerCase()))
  if (names.size !== variants.length) throw new Error('Two prices have the same name.')
  check(
    await supabase.rpc('save_menu_item', {
      p_item: {
        id: d.id,
        category_id: d.categoryId,
        name,
        description: d.description.trim() || null,
        is_available: d.isAvailable,
        variants,
        modifier_group_ids: d.groupIds,
      },
    }),
  )
  await refresh()
}

export async function deleteItem(id: string): Promise<void> {
  check(await supabase.from('menu_items').delete().eq('id', id))
  await refresh()
}

/** Sold-out toggle (4.7). Updates this device straight away so the POS reacts. */
export async function setItemAvailable(id: string, available: boolean): Promise<void> {
  check(await supabase.from('menu_items').update({ is_available: available }).eq('id', id))
  await db.menuItems.update(id, { is_available: available })
  void refresh()
}

export async function setModifierAvailable(id: string, available: boolean): Promise<void> {
  check(await supabase.from('modifiers').update({ is_available: available }).eq('id', id))
  await db.modifiers.update(id, { is_available: available })
  void refresh()
}

// ---- Modifier groups (4.4, 4.5) -------------------------------------------------

export interface GroupDraft {
  id: string
  name: string
  isRequired: boolean
  minSelect: string
  maxSelect: string
  allowQuantity: boolean
  modifiers: {
    id: string
    name: string
    priceDelta: string
    isAvailable: boolean
    /** variant name -> price delta (blank = use priceDelta) */
    variantPrices: Record<string, string>
  }[]
}

export async function saveGroup(d: GroupDraft): Promise<void> {
  const name = d.name.trim()
  if (!name) throw new Error('Give the group a name.')
  const min = d.minSelect.trim() === '' ? 0 : Number(d.minSelect)
  const max = d.maxSelect.trim() === '' ? null : Number(d.maxSelect)
  if (!Number.isInteger(min) || min < 0) throw new Error('Minimum must be 0 or more.')
  if (max !== null && (!Number.isInteger(max) || max < 1)) throw new Error('Maximum must be 1 or more, or blank for no limit.')
  const minSelect = d.isRequired ? Math.max(min, 1) : min
  if (max !== null && minSelect > max) throw new Error('Minimum can’t be more than the maximum.')
  const modifiers = d.modifiers.map((m) => {
    if (!m.name.trim()) throw new Error('Every option needs a name.')
    const delta = m.priceDelta.trim() === '' ? 0 : Number(m.priceDelta)
    if (!Number.isFinite(delta)) throw new Error(`Check the price of ${m.name.trim()}.`)
    const variantPrices: Record<string, number> = {}
    for (const [variant, value] of Object.entries(m.variantPrices)) {
      if (value.trim() === '') continue
      const n = Number(value)
      if (!Number.isFinite(n)) throw new Error(`Check the ${variant} price of ${m.name.trim()}.`)
      variantPrices[variant] = n
    }
    return { id: m.id, name: m.name.trim(), price_delta: delta, is_available: m.isAvailable, variant_prices: variantPrices }
  })
  check(
    await supabase.rpc('save_modifier_group', {
      p_group: {
        id: d.id,
        name,
        min_select: minSelect,
        max_select: max,
        is_required: d.isRequired || minSelect > 0,
        allow_quantity: d.allowQuantity,
        modifiers,
      },
    }),
  )
  await refresh()
}

export async function deleteGroup(id: string): Promise<void> {
  check(await supabase.from('modifier_groups').delete().eq('id', id))
  await refresh()
}
