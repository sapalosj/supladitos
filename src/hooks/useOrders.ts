import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type LocalOrder } from '@/lib/db'
import { fetchServerOrders, mergeOrders } from '@/lib/orders'
import { useOnline } from './useOnline'
import { useSyncState } from './useSync'

export interface OrdersResult {
  orders: LocalOrder[]
  /** Still loading the first result. */
  loading: boolean
  /**
   * True when the server's orders are included. False offline (or when the
   * server can't be reached): only the orders stored on this device are shown.
   */
  complete: boolean
  error: string | null
}

/**
 * Orders for a business-date range (YYYY-MM-DD, inclusive): the server's
 * copy merged with this device's live copy, so unsynced sales and status
 * changes show straight away (History, Reports, Day close).
 */
export function useOrders(from: string, to: string): OrdersResult {
  const online = useOnline()
  const queryClient = useQueryClient()
  const { lastPushedAt } = useSyncState()

  const server = useQuery({
    queryKey: ['orders', from, to],
    queryFn: () => fetchServerOrders(from, to),
    enabled: online,
    staleTime: 15_000,
    refetchInterval: online ? (from === to ? 60_000 : 300_000) : false,
    retry: 1,
  })

  // After a sync pushed something, the server copy is out of date.
  useEffect(() => {
    if (lastPushedAt) void queryClient.invalidateQueries({ queryKey: ['orders'] })
  }, [lastPushedAt, queryClient])

  const local = useLiveQuery(() => db.orders.where('businessDate').between(from, to, true, true).toArray(), [from, to])

  const orders = useMemo(() => mergeOrders(server.data ?? [], local ?? []), [server.data, local])

  return {
    orders,
    loading: local === undefined || (online && server.isPending),
    complete: !!server.data && online,
    error: server.error ? (server.error as Error).message : null,
  }
}
