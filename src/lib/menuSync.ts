import { supabase } from './supabase'
import { db, setMeta } from './db'

/**
 * Menu sync (3.2): copy the branch's menu from Supabase into Dexie.
 *
 * Every table is fetched first; Dexie is only touched once all of them
 * arrived, and then replaced in one transaction, so the POS never sees half a
 * menu. RLS scopes every query to the signed-in user's branch.
 */
export async function syncMenu(): Promise<void> {
  const [categories, items, variants, groups, modifiers, variantPrices, links] = await Promise.all([
    supabase.from('categories').select('*'),
    supabase.from('menu_items').select('*'),
    supabase.from('item_variants').select('*'),
    supabase.from('modifier_groups').select('*'),
    supabase.from('modifiers').select('*'),
    supabase.from('modifier_variant_prices').select('*'),
    supabase.from('item_modifier_groups').select('*'),
  ])
  for (const r of [categories, items, variants, groups, modifiers, variantPrices, links]) {
    if (r.error) throw r.error
  }

  await db.transaction(
    'rw',
    [db.meta, db.categories, db.menuItems, db.itemVariants, db.modifierGroups, db.modifiers, db.modifierVariantPrices, db.itemModifierGroups],
    async () => {
      await Promise.all([
        db.categories.clear(),
        db.menuItems.clear(),
        db.itemVariants.clear(),
        db.modifierGroups.clear(),
        db.modifiers.clear(),
        db.modifierVariantPrices.clear(),
        db.itemModifierGroups.clear(),
      ])
      await Promise.all([
        db.categories.bulkPut(categories.data!),
        db.menuItems.bulkPut(items.data!),
        db.itemVariants.bulkPut(variants.data!),
        db.modifierGroups.bulkPut(groups.data!),
        db.modifiers.bulkPut(modifiers.data!),
        db.modifierVariantPrices.bulkPut(variantPrices.data!),
        db.itemModifierGroups.bulkPut(links.data!),
      ])
      await setMeta('menuSyncedAt', new Date().toISOString())
    },
  )
}
