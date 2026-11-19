import { Cloud, CloudAlert, CloudOff, CloudUpload, LoaderCircle, RefreshCw } from 'lucide-react'
import { useOnline } from '@/hooks/useOnline'
import { usePendingOrderCount } from '@/hooks/useLocalCounts'
import { useFailedOrderCount, useMenuSyncedAt, useSyncState } from '@/hooks/useSync'
import { requestSync, retryFailedOrders } from '@/lib/sync'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function describe(online: boolean, pending: number, failed: number) {
  const waiting = pending > 0 ? `${pending} waiting` : null
  const waitingLong = `${pending} ${pending === 1 ? 'order' : 'orders'} waiting to sync`
  if (!online) {
    return {
      icon: CloudOff,
      label: waiting ?? 'Offline',
      title: pending > 0 ? `Offline · ${waitingLong}` : 'Offline. Orders are saved on this device and sync when you reconnect.',
      tone: 'warning' as const,
    }
  }
  if (failed > 0) {
    return { icon: CloudAlert, label: waiting!, title: `Online · ${waitingLong} · ${failed} failed`, tone: 'error' as const }
  }
  if (pending > 0) {
    return { icon: CloudUpload, label: waiting!, title: `Online · ${waitingLong}`, tone: 'warning' as const }
  }
  return { icon: Cloud, label: 'Online', title: 'Online · everything is synced', tone: 'ok' as const }
}

const TONE = {
  ok: 'text-success',
  warning: 'text-warning',
  error: 'text-destructive',
}

/**
 * Online/offline indicator (2.6) with the count of orders waiting to sync (3.6).
 * Tapping it shows the sync details and a "Sync now" action.
 * `pill` sits in the phone header; `rail` sits at the bottom of the tablet rail.
 */
export function ConnectionStatus({ variant = 'pill', className }: { variant?: 'pill' | 'rail'; className?: string }) {
  const online = useOnline()
  const pending = usePendingOrderCount()
  const failed = useFailedOrderCount()
  const sync = useSyncState()
  const menuSyncedAt = useMenuSyncedAt()
  const { icon: Icon, label, title, tone } = describe(online, pending, failed)

  const trigger =
    variant === 'rail' ? (
      <DropdownMenuTrigger
        title={title}
        aria-label={title}
        className={cn(
          'flex min-h-11 w-[72px] flex-col items-center justify-center gap-1 rounded-lg text-center text-[11px] leading-tight font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          TONE[tone],
          className,
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
        <span role="status">{label}</span>
      </DropdownMenuTrigger>
    ) : (
      <DropdownMenuTrigger
        title={title}
        aria-label={title}
        className={cn(
          'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          tone === 'ok' ? 'bg-background' : 'bg-warning-bg',
          TONE[tone],
          className,
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
        <span role="status">{label}</span>
      </DropdownMenuTrigger>
    )

  return (
    <DropdownMenu>
      {trigger}
      <DropdownMenuContent align="end" side={variant === 'rail' ? 'right' : 'bottom'} className="w-72">
        <DropdownMenuLabel className="flex flex-col gap-1">
          <span className={cn('text-sm font-semibold', TONE[tone])}>{online ? 'Online' : 'Offline'}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {pending === 0
              ? 'Every order on this device is on the server.'
              : `${pending} ${pending === 1 ? 'order is' : 'orders are'} waiting to sync${online ? '' : '. They sync when you’re back online'}.`}
          </span>
          {failed > 0 && (
            <span className="text-xs font-normal text-destructive">
              {failed} {failed === 1 ? 'order was' : 'orders were'} rejected by the server. They’re kept on this device and retried every few minutes.
            </span>
          )}
          {sync.lastError && online && (
            <span className="text-xs font-normal text-destructive">Last sync failed: {sync.lastError}</span>
          )}
          <span className="text-xs font-normal text-muted-foreground">
            Last sync: {sync.lastSyncedAt ? relativeTime(sync.lastSyncedAt) : 'not yet'} · Menu:{' '}
            {menuSyncedAt ? relativeTime(menuSyncedAt) : 'not downloaded'}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="h-11"
          disabled={!online || sync.running}
          onSelect={(e) => {
            e.preventDefault()
            void (failed > 0 ? retryFailedOrders() : requestSync({ menu: true }))
          }}
        >
          {sync.running ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
          {sync.running ? 'Syncing…' : 'Sync now'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
