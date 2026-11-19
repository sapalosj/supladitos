import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { businessDate } from '@/lib/format'

/** Orders on this device that have not reached the server yet (pending or failed). */
export function usePendingOrderCount(): number {
  return useLiveQuery(() => db.orders.where('syncStatus').notEqual('synced').count(), [], 0)
}

/** Today's orders still in the queue (New or Preparing), for the Orders nav badge. */
export function useOpenOrderCount(timeZone: string): number {
  const today = businessDate(new Date(), timeZone)
  return useLiveQuery(
    () =>
      db.orders
        .where('businessDate')
        .equals(today)
        .filter((o) => o.status === 'new' || o.status === 'preparing')
        .count(),
    [today],
    0,
  )
}
