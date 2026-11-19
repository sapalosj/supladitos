import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { db, type LocalOrder } from './db'
import { businessDate } from './format'
import { syncMenu } from './menuSync'
import { ORDER_SELECT, fromServerOrder, hasLocalChanges, setLastServerOrderNumber, toSubmitPayload } from './orders'

/**
 * Sync engine (3.4, 3.5).
 *
 * Push: every order in the outbox (syncStatus pending or failed) goes through
 * the idempotent submit_order RPC, oldest first. Status changes and voids made
 * on this device are sent once their order is on the server.
 * Pull: today's orders from the server are copied into Dexie so the queue
 * shows orders taken on other devices; the menu is refreshed too.
 *
 * Triggers: app start, the `online` event, every 30 s, and right after a sale
 * or a status change (`requestSync`). One run at a time; a request made during
 * a run starts one more run when it ends.
 */

export const SYNC_INTERVAL_MS = 30_000
const MENU_INTERVAL_MS = 5 * 60_000
/** A rejected order (server error, not a network error) is retried this often. */
const FAILED_RETRY_MS = 5 * 60_000
/** Synced orders older than this are dropped from the device. */
const KEEP_DAYS = 35

export interface SyncState {
  running: boolean
  lastSyncedAt: string | null
  lastError: string | null
  /** Last time an order or status change reached the server (server-side copies are stale after this). */
  lastPushedAt: string | null
}

let state: SyncState = { running: false, lastSyncedAt: null, lastError: null, lastPushedAt: null }

function markPushed() {
  setState({ lastPushedAt: new Date().toISOString() })
}
const listeners = new Set<() => void>()

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function subscribeSync(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getSyncState(): SyncState {
  return state
}

// ---- Errors -------------------------------------------------------------------

interface ErrorLike {
  code?: string
  message?: string
  status?: number
}

/**
 * Network trouble and expired/missing auth are worth retrying straight away;
 * anything the database rejected is not (the order is marked failed and
 * retried slowly, in case it was a server-side problem that gets fixed).
 */
function isTransient(e: unknown): boolean {
  if (!navigator.onLine) return true
  if (isAuthRetryableFetchError(e)) return true
  const err = (e ?? {}) as ErrorLike
  const msg = String(err.message ?? e)
  if (/fetch|network|load failed|timeout|aborted/i.test(msg)) return true
  if (err.code?.startsWith('PGRST3')) return true // JWT expired / invalid: refreshes on its own
  if (err.status === 401 || err.status === 0 || (err.status ?? 0) >= 500) return true
  return !err.code
}

function describeError(e: unknown): string {
  const err = (e ?? {}) as ErrorLike
  return err.message ?? String(e)
}

// ---- Push -----------------------------------------------------------------------

async function pushOrder(order: LocalOrder): Promise<void> {
  const sent = { status: order.status, voidReason: order.voidReason, statusChangedAt: order.statusChangedAt }
  const { data, error } = await supabase.rpc('submit_order', { p_order: toSubmitPayload(order) })
  if (error) throw error

  const result = data as { order_number: number; business_date: string; price_mismatch: boolean }
  await db.transaction('rw', db.orders, db.meta, async () => {
    const current = await db.orders.get(order.id)
    if (!current) return
    // The payload carried the status; if it changed while the request was in
    // flight, leave statusSync pending so the newer status is sent next.
    const statusUnchanged =
      current.status === sent.status &&
      current.voidReason === sent.voidReason &&
      current.statusChangedAt === sent.statusChangedAt
    await db.orders.update(order.id, {
      syncStatus: 'synced',
      statusSync: statusUnchanged ? 'synced' : 'pending',
      orderNumber: result.order_number,
      priceMismatch: result.price_mismatch,
      syncError: null,
      lastSyncAttemptAt: new Date().toISOString(),
    })
    await setLastServerOrderNumber(result.business_date, result.order_number)
  })
  markPushed()
}

async function pushOrders(): Promise<void> {
  const outbox = await db.orders.where('syncStatus').anyOf('pending', 'failed').sortBy('createdAt')
  const now = Date.now()
  for (const order of outbox) {
    if (
      order.syncStatus === 'failed' &&
      order.lastSyncAttemptAt &&
      now - new Date(order.lastSyncAttemptAt).getTime() < FAILED_RETRY_MS
    ) {
      continue
    }
    try {
      await pushOrder(order)
    } catch (e) {
      const transient = isTransient(e)
      await db.orders.update(order.id, {
        syncStatus: transient && order.syncStatus !== 'failed' ? 'pending' : 'failed',
        syncAttempts: order.syncAttempts + 1,
        syncError: describeError(e),
        lastSyncAttemptAt: new Date().toISOString(),
      })
      // Offline or signed out: the rest will fail the same way.
      if (transient) throw e
    }
  }
}

async function pushStatuses(): Promise<void> {
  const changed = await db.orders
    .where('statusSync')
    .equals('pending')
    .filter((o) => o.syncStatus === 'synced')
    .toArray()
  if (changed.length === 0) return
  const { data: auth } = await supabase.auth.getUser()
  for (const order of changed) {
    const sent = { status: order.status, statusChangedAt: order.statusChangedAt }
    const voided = order.status === 'voided'
    const { error } = await supabase
      .from('orders')
      .update({
        status: order.status,
        status_changed_at: order.statusChangedAt,
        void_reason: voided ? order.voidReason : null,
        voided_at: voided ? order.voidedAt : null,
        voided_by: voided ? (auth.user?.id ?? null) : null,
      })
      .eq('id', order.id)
    if (error) {
      await db.orders.update(order.id, { syncError: describeError(error) })
      if (isTransient(error)) throw error
      continue
    }
    await db.transaction('rw', db.orders, async () => {
      const current = await db.orders.get(order.id)
      if (current && current.status === sent.status && current.statusChangedAt === sent.statusChangedAt) {
        await db.orders.update(order.id, { statusSync: 'synced', syncError: null })
      }
    })
    markPushed()
  }
}

// ---- Pull -----------------------------------------------------------------------

async function pullTodaysOrders(timeZone: string): Promise<void> {
  const today = businessDate(new Date(), timeZone)
  const [{ data, error }, last] = await Promise.all([
    supabase.from('orders').select(ORDER_SELECT).eq('business_date', today),
    supabase.rpc('last_order_number', { p_business_date: today }),
  ])
  if (error) throw error
  if (!last.error && typeof last.data === 'number') await setLastServerOrderNumber(today, last.data)

  const server = data.map(fromServerOrder)
  await db.transaction('rw', db.orders, async () => {
    const local = await db.orders.bulkGet(server.map((o) => o.id))
    const toPut = server.filter((_, i) => {
      const mine = local[i]
      return !mine || !hasLocalChanges(mine)
    })
    await db.orders.bulkPut(toPut)

    // Housekeeping: drop old orders that are safely on the server.
    const cutoff = businessDate(new Date(Date.now() - KEEP_DAYS * 86_400_000), timeZone)
    await db.orders
      .where('businessDate')
      .below(cutoff)
      .filter((o) => !hasLocalChanges(o))
      .delete()
  })
}

// ---- Runner -------------------------------------------------------------------

let current: Promise<void> | null = null
let again = false
let lastMenuSync = 0
let timeZone = 'Asia/Manila'

async function runOnce(): Promise<void> {
  if (!navigator.onLine) return
  // No session (signed out, or an offline start that hasn't refreshed yet): nothing to do.
  const { data } = await supabase.auth.getSession()
  if (!data.session) return

  setState({ running: true })
  try {
    await pushOrders()
    await pushStatuses()
    await pullTodaysOrders(timeZone)
    if (Date.now() - lastMenuSync > MENU_INTERVAL_MS) {
      await syncMenu()
      lastMenuSync = Date.now()
    }
    setState({ lastSyncedAt: new Date().toISOString(), lastError: null })
  } catch (e) {
    setState({ lastError: describeError(e) })
  } finally {
    setState({ running: false })
  }
}

/**
 * Ask for a sync. Resolves when a run that started after this call finishes.
 * `menu: true` also refreshes the menu (after a menu edit, on start, on reconnect).
 */
export function requestSync(opts: { menu?: boolean } = {}): Promise<void> {
  if (opts.menu) lastMenuSync = 0
  if (current) {
    // The running loop goes round once more before it resolves.
    again = true
    return current
  }
  current = (async () => {
    do {
      again = false
      await withLock(runOnce)
    } while (again)
  })().finally(() => {
    current = null
  })
  return current
}

/** One sync across all tabs of the app on this device (Web Locks, where supported). */
async function withLock(fn: () => Promise<void>): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    await navigator.locks.request('supladitos-sync', fn)
  } else {
    await fn()
  }
}

/** Retry failed orders now instead of waiting for the slow retry. */
export async function retryFailedOrders(): Promise<void> {
  await db.orders.where('syncStatus').equals('failed').modify({ lastSyncAttemptAt: null })
  await requestSync()
}

/**
 * Start the triggers (3.5). Returns a stop function. Called once the user is
 * signed in; the time zone is the branch's, for today's business date.
 */
export function startSync(branchTimeZone: string): () => void {
  timeZone = branchTimeZone
  lastMenuSync = 0
  const kick = () => void requestSync()
  const onOnline = () => void requestSync({ menu: true })
  const onVisible = () => {
    if (document.visibilityState === 'visible') kick()
  }
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  const timer = window.setInterval(kick, SYNC_INTERVAL_MS)
  // When the session refreshes after an offline start, sync straight away.
  const { data: sub } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') kick()
  })
  void requestSync({ menu: true })
  return () => {
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    window.clearInterval(timer)
    sub.subscription.unsubscribe()
  }
}
