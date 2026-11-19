// Smoke test for the local database: auth, RLS and the submit_order RPC.
// Run against a freshly reset local stack: `npm run db:reset && npm run db:smoke`.
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const env = Object.fromEntries(
  execSync('npx supabase status -o env', { encoding: 'utf8' })
    .split('\n')
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
)
const url = env.API_URL
const anonKey = env.ANON_KEY
const serviceKey = env.SERVICE_ROLE_KEY
// Realtime is not used here; the stub keeps supabase-js happy on Node 20 (no native WebSocket).
const opts = { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: class {} } }

let failures = 0
async function check(name, fn) {
  try {
    await fn()
    console.log(`  ok  ${name}`)
  } catch (e) {
    failures++
    console.log(`  FAIL ${name}\n       ${e.message}`)
  }
}

// --- anon sees nothing -------------------------------------------------------
const anon = createClient(url, anonKey, opts)
await check('anon cannot read menu items', async () => {
  const { data, error } = await anon.from('menu_items').select('id')
  assert.ok(error || data.length === 0, 'anon read menu items')
})
await check('anon cannot call submit_order', async () => {
  const { error } = await anon.rpc('submit_order', { p_order: {} })
  assert.ok(error, 'anon call succeeded')
})

// --- owner -------------------------------------------------------------------
const owner = createClient(url, anonKey, opts)
const { error: signInError } = await owner.auth.signInWithPassword({
  email: 'owner@supladitos.local',
  password: 'supladitos',
})
assert.ifError(signInError)

let menu
await check('owner reads the seeded menu', async () => {
  const { data, error } = await owner
    .from('menu_items')
    .select('id, name, item_variants(id, name, price), item_modifier_groups(modifier_groups(id, name, modifiers(id, name, price_delta)))')
  assert.ifError(error)
  assert.ok(data.length >= 14, `expected >= 14 items, got ${data.length}`)
  menu = data
})

const latte = () => menu.find((m) => m.name === 'SPANISH LATTE')
const variant = (item, name) => item.item_variants.find((v) => v.name === name)
const modifier = (item, name) =>
  item.item_modifier_groups.flatMap((g) => g.modifier_groups.modifiers).find((m) => m.name === name)

function buildOrder({ total, unitPrice, orderNumber = 1 } = {}) {
  const item = latte()
  const v = variant(item, 'Iced Regular')
  const oat = modifier(item, 'Oat milk')
  const regular = modifier(item, 'Regular')
  const unit = unitPrice ?? Number(v.price) + Number(oat.price_delta)
  return {
    id: randomUUID(),
    created_at: new Date().toISOString(),
    order_number: orderNumber,
    order_type: 'dine_in',
    customer_name: 'Mia',
    status: 'new',
    subtotal: total ?? unit * 2,
    total: total ?? unit * 2,
    items: [
      {
        id: randomUUID(),
        menu_item_id: item.id,
        variant_id: v.id,
        item_name: item.name,
        variant_name: v.name,
        unit_price: unit,
        quantity: 2,
        line_total: unit * 2,
        notes: 'less ice',
        modifiers: [
          { id: randomUUID(), modifier_id: oat.id, name: oat.name, price_delta: Number(oat.price_delta), quantity: 1 },
          { id: randomUUID(), modifier_id: regular.id, name: regular.name, price_delta: 0, quantity: 1 },
        ],
      },
    ],
    payment: { id: randomUUID(), method: 'cash', amount: total ?? unit * 2, amount_received: 500, change_due: 500 - (total ?? unit * 2) },
  }
}

let first
await check('submit_order saves a correct order without a mismatch', async () => {
  first = buildOrder()
  const { data, error } = await owner.rpc('submit_order', { p_order: first })
  assert.ifError(error)
  assert.equal(data.price_mismatch, false)
  assert.equal(Number(data.computed_total), 380)
  assert.equal(data.duplicate, false)
  const { data: rows } = await owner.from('orders').select('*, order_items(*, order_item_modifiers(*)), payments(*)').eq('id', first.id).single()
  assert.equal(rows.order_items.length, 1)
  assert.equal(rows.order_items[0].order_item_modifiers.length, 2)
  assert.equal(rows.payments.length, 1)
})

await check('submit_order is idempotent (same id twice = one order)', async () => {
  const { data, error } = await owner.rpc('submit_order', { p_order: first })
  assert.ifError(error)
  assert.equal(data.duplicate, true)
  const { count } = await owner.from('orders').select('id', { count: 'exact', head: true }).eq('id', first.id)
  assert.equal(count, 1)
  const { count: items } = await owner.from('order_items').select('id', { count: 'exact', head: true }).eq('order_id', first.id)
  assert.equal(items, 1)
})

await check('a taken order number gets the next free one', async () => {
  const second = buildOrder({ orderNumber: first.order_number })
  const { data, error } = await owner.rpc('submit_order', { p_order: second })
  assert.ifError(error)
  assert.equal(data.order_number, 2)
})

await check('a device-picked free number is kept (offline numbering)', async () => {
  const offline = buildOrder({ orderNumber: 7 })
  const { data, error } = await owner.rpc('submit_order', { p_order: offline })
  assert.ifError(error)
  assert.equal(data.order_number, 7)
  const { data: last } = await owner.rpc('last_order_number')
  assert.equal(last, 7)
})

await check('a wrong price is saved as charged and flagged', async () => {
  const cheap = buildOrder({ unitPrice: 100, orderNumber: 8 })
  const { data, error } = await owner.rpc('submit_order', { p_order: cheap })
  assert.ifError(error)
  assert.equal(data.price_mismatch, true)
  assert.equal(Number(data.computed_total), 380)
  const { data: row } = await owner.from('orders').select('total, price_mismatch').eq('id', cheap.id).single()
  assert.equal(Number(row.total), 200)
  assert.equal(row.price_mismatch, true)
})

await check('staff cannot insert orders directly (RPC only)', async () => {
  const { error } = await owner.from('orders').insert({ id: randomUUID(), branch_id: randomUUID(), order_number: 99, business_date: '2026-01-01', subtotal: 1, total: 1 })
  assert.ok(error, 'direct insert succeeded')
})

await check('staff can change status but not totals', async () => {
  const { error } = await owner.from('orders').update({ status: 'preparing' }).eq('id', first.id)
  assert.ifError(error)
  const { error: totalError } = await owner.from('orders').update({ total: 1 }).eq('id', first.id)
  assert.ok(totalError, 'total update succeeded')
})

await check('voiding requires a reason', async () => {
  const { error } = await owner.from('orders').update({ status: 'voided' }).eq('id', first.id)
  assert.ok(error, 'void without reason succeeded')
})

// --- menu management RPCs (milestone 4) ----------------------------------------
await check('save_menu_item saves item, variants and groups in one go', async () => {
  const item = latte()
  const id = randomUUID()
  const groupIds = item.item_modifier_groups.map((g) => g.modifier_groups.id)
  const { error } = await owner.rpc('save_menu_item', {
    p_item: {
      id,
      category_id: (await owner.from('menu_items').select('category_id').eq('id', item.id).single()).data.category_id,
      name: 'SMOKE LATTE',
      variants: [{ id: randomUUID(), name: 'Hot', price: 111 }, { id: randomUUID(), name: 'Iced Regular', price: 122 }],
      modifier_group_ids: groupIds,
    },
  })
  assert.ifError(error)
  const { data } = await owner.from('menu_items').select('name, category_id, item_variants(name, price), item_modifier_groups(modifier_group_id)').eq('id', id).single()
  assert.equal(data.item_variants.length, 2)
  assert.equal(data.item_modifier_groups.length, groupIds.length)
  // A bad variant rolls the whole save back.
  const { error: bad } = await owner.rpc('save_menu_item', {
    p_item: { id, category_id: data.category_id, name: 'RENAMED', variants: [{ id: randomUUID(), name: '', price: 1 }] },
  })
  assert.ok(bad, 'save with an unnamed variant succeeded')
  const { data: after } = await owner.from('menu_items').select('name').eq('id', id).single()
  assert.equal(after.name, 'SMOKE LATTE')
  await owner.from('menu_items').delete().eq('id', id)
})

// --- another branch cannot see this branch ------------------------------------
const admin = createClient(url, serviceKey, opts)

await check('a barista can read the menu but not change it', async () => {
  const email = `barista-${Date.now()}@supladitos.local`
  const { data: user, error } = await admin.auth.admin.createUser({ email, password: 'smoke-test-pw', email_confirm: true })
  assert.ifError(error)
  const branchId = (await owner.from('branches').select('id').single()).data.id
  await admin.from('staff').insert({ id: user.user.id, branch_id: branchId, role: 'barista' })
  const barista = createClient(url, anonKey, opts)
  await barista.auth.signInWithPassword({ email, password: 'smoke-test-pw' })
  try {
    const { data: items } = await barista.from('menu_items').select('id')
    assert.ok(items.length > 0, 'barista cannot read the menu')
    const { error: saveError } = await barista.rpc('save_menu_item', {
      p_item: { id: randomUUID(), category_id: randomUUID(), name: 'NOPE', variants: [{ id: randomUUID(), name: 'Hot', price: 1 }] },
    })
    assert.ok(saveError, 'barista saved a menu item')
    const { data: updated } = await barista.from('menu_items').update({ is_available: false }).eq('id', latte().id).select()
    assert.equal(updated.length, 0, 'barista changed availability')
  } finally {
    await admin.auth.admin.deleteUser(user.user.id)
    await admin.from('staff').delete().eq('id', user.user.id)
  }
})
await check('staff from another branch see none of this branch', async () => {
  const { data: branch } = await admin.from('branches').insert({ name: 'Smoke test branch' }).select().single()
  const email = `smoke-${Date.now()}@supladitos.local`
  const { data: user, error } = await admin.auth.admin.createUser({ email, password: 'smoke-test-pw', email_confirm: true })
  assert.ifError(error)
  await admin.from('staff').insert({ id: user.user.id, branch_id: branch.id, role: 'owner' })
  const other = createClient(url, anonKey, opts)
  await other.auth.signInWithPassword({ email, password: 'smoke-test-pw' })
  const { data: items } = await other.from('menu_items').select('id')
  const { data: orders } = await other.from('orders').select('id')
  const { error: rpcError } = await other.rpc('submit_order', { p_order: first })
  try {
    assert.equal(items.length, 0)
    assert.equal(orders.length, 0)
    assert.ok(rpcError, 'other branch could resubmit this branch order')
  } finally {
    await admin.auth.admin.deleteUser(user.user.id)
    await admin.from('staff').delete().eq('id', user.user.id)
    await admin.from('branches').delete().eq('id', branch.id)
  }
})

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
