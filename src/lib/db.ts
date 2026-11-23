import Dexie, { type EntityTable, type Table } from 'dexie'
import type { Enums, Tables } from './supabase'

/**
 * Local (offline) database (supladitos.md §2).
 *
 * - Menu cache: a copy of the branch's menu tables, refreshed whenever the app
 *   is online. The POS reads the menu only from here.
 * - Discounts: the branch's discount types, cached with the menu.
 * - Orders: the outbox. Every sale is written here first with
 *   syncStatus = 'pending', then pushed through the submit_order RPC.
 *   Today's orders from the server are copied in too, so the queue shows
 *   orders taken on other devices.
 */

export type Category = Tables<'categories'>
export type MenuItem = Tables<'menu_items'>
export type ItemVariant = Tables<'item_variants'>
export type ModifierGroup = Tables<'modifier_groups'>
export type Modifier = Tables<'modifiers'>
export type ModifierVariantPrice = Tables<'modifier_variant_prices'>
export type ItemModifierGroup = Tables<'item_modifier_groups'>
export type Discount = Tables<'discounts'>

export type OrderStatus = Enums<'order_status'>
export type OrderType = Enums<'order_type'>
export type PaymentMethod = Enums<'payment_method'>
export type SyncStatus = 'pending' | 'synced' | 'failed'

export interface LocalOrderModifier {
  id: string
  modifierId: string | null
  name: string
  priceDelta: number
  quantity: number
}

/** A percentage off some units of a line (e.g. 2 of 5 drinks). */
export interface LineDiscount {
  discountId: string | null
  name: string
  percent: number
  /** How many units of the line get the discount. */
  quantity: number
}

export interface LocalOrderItem {
  id: string
  menuItemId: string | null
  variantId: string | null
  itemName: string
  variantName: string | null
  unitPrice: number
  quantity: number
  lineTotal: number
  notes: string | null
  modifiers: LocalOrderModifier[]
  /** unitPrice and lineTotal stay at the full price; `amount` is what came off. */
  discount?: (LineDiscount & { amount: number }) | null
}

export interface LocalPayment {
  id: string
  method: PaymentMethod
  amount: number
  amountReceived: number | null
  changeDue: number | null
  /** When the payment was taken (later than the order for pay-later orders). */
  paidAt?: string | null
}

export interface LocalOrder {
  id: string
  branchId: string
  orderNumber: number
  businessDate: string
  orderType: OrderType
  customerName: string | null
  status: OrderStatus
  statusChangedAt: string | null
  voidReason: string | null
  voidedAt: string | null
  /** Full price of all lines. */
  subtotal: number
  /** Sum of the line discounts (missing on orders saved before discounts existed). */
  discountTotal?: number
  /** What the customer pays: subtotal - discountTotal. */
  total: number
  items: LocalOrderItem[]
  /** Null while the order is unpaid (pay later). */
  payment: LocalPayment | null
  createdAt: string
  createdBy: string | null
  /** Whether the order itself has reached the server. */
  syncStatus: SyncStatus
  /** A status change (or void) made on this device that the server has not seen yet. */
  statusSync: 'pending' | 'synced'
  /** A payment taken on this device after the order was saved, not on the server yet. */
  paymentSync?: 'pending' | 'synced'
  /** Discounts changed on this device after the order was saved, not on the server yet. */
  discountSync?: 'pending' | 'synced'
  discountChangedAt?: string | null
  syncAttempts: number
  syncError: string | null
  lastSyncAttemptAt: string | null
  priceMismatch: boolean
}

export interface MetaRow {
  key: string
  value: unknown
}

export const db = new Dexie('supladitos') as Dexie & {
  meta: EntityTable<MetaRow, 'key'>
  categories: EntityTable<Category, 'id'>
  menuItems: EntityTable<MenuItem, 'id'>
  itemVariants: EntityTable<ItemVariant, 'id'>
  modifierGroups: EntityTable<ModifierGroup, 'id'>
  modifiers: EntityTable<Modifier, 'id'>
  modifierVariantPrices: Table<ModifierVariantPrice, [string, string]>
  itemModifierGroups: Table<ItemModifierGroup, [string, string]>
  discounts: EntityTable<Discount, 'id'>
  orders: EntityTable<LocalOrder, 'id'>
}

db.version(1).stores({
  meta: 'key',
})

db.version(2).stores({
  meta: 'key',
  categories: 'id, sort_order',
  menuItems: 'id, category_id, sort_order',
  itemVariants: 'id, menu_item_id',
  modifierGroups: 'id',
  modifiers: 'id, modifier_group_id',
  modifierVariantPrices: '[modifier_id+variant_name], modifier_id',
  itemModifierGroups: '[menu_item_id+modifier_group_id], menu_item_id',
  orders: 'id, syncStatus, statusSync, businessDate, status, createdAt, [businessDate+orderNumber]',
})

db.version(3).stores({
  orders: 'id, syncStatus, statusSync, paymentSync, businessDate, status, createdAt, [businessDate+orderNumber]',
})

db.version(4).stores({
  discounts: 'id',
  orders: 'id, syncStatus, statusSync, paymentSync, discountSync, businessDate, status, createdAt, [businessDate+orderNumber]',
})

// ---- meta helpers -----------------------------------------------------------

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

/** Clears everything tied to the signed-in user (on sign-out). Pending orders are kept. */
export async function clearUserCache(): Promise<void> {
  await db.transaction(
    'rw',
    [db.meta, db.categories, db.menuItems, db.itemVariants, db.modifierGroups, db.modifiers, db.modifierVariantPrices, db.itemModifierGroups, db.discounts],
    async () => {
      await Promise.all([
        db.meta.where('key').anyOf('profile', 'menuSyncedAt', 'lastServerOrderNumber').delete(),
        db.categories.clear(),
        db.menuItems.clear(),
        db.itemVariants.clear(),
        db.modifierGroups.clear(),
        db.modifiers.clear(),
        db.modifierVariantPrices.clear(),
        db.itemModifierGroups.clear(),
        db.discounts.clear(),
      ])
    },
  )
}
