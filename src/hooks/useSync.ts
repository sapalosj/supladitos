import { useEffect, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { getSyncState, startSync, subscribeSync, type SyncState } from '@/lib/sync'

/** Runs the sync engine while a signed-in screen is mounted (3.5). */
export function useSyncEngine(timeZone: string): void {
  useEffect(() => startSync(timeZone), [timeZone])
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeSync, getSyncState, getSyncState)
}

/** Orders the server rejected; they keep retrying slowly and can be retried by hand. */
export function useFailedOrderCount(): number {
  return useLiveQuery(() => db.orders.where('syncStatus').equals('failed').count(), [], 0)
}

/** When the menu on this device was last refreshed from the server. */
export function useMenuSyncedAt(): string | undefined {
  return useLiveQuery(async () => (await db.meta.get('menuSyncedAt'))?.value as string | undefined, [])
}
