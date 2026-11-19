import { NavLink, Outlet } from 'react-router-dom'
import { useProfile } from '@/lib/auth'
import { useOpenOrderCount } from '@/hooks/useLocalCounts'
import { useSyncEngine } from '@/hooks/useSync'
import { CartProvider } from '@/hooks/useCart'
import { cn } from '@/lib/utils'
import { BrandBadge } from '@/components/BrandBadge'
import { AccountMenu } from './AccountMenu'
import { ConnectionStatus } from './ConnectionStatus'
import { NAV_ITEMS, type NavItem } from './nav'

/**
 * App layout (2.4, 2.5). Phone: page above a five-item bottom bar.
 * Tablet and wider (md+): a left rail with the badge, the same five items,
 * and the connection status at the bottom (Pages Design: "POS — Tablet landscape").
 * Pages own their header and scrolling.
 */
export function AppLayout() {
  const profile = useProfile()
  const openOrders = useOpenOrderCount(profile.timezone)
  useSyncEngine(profile.timezone)

  return (
    <div className="flex h-full flex-col md:flex-row">
      <nav
        aria-label="Main"
        className="hidden w-[88px] flex-none flex-col items-center gap-2 border-r bg-sidebar py-4 md:flex"
      >
        <BrandBadge className="mb-3 size-12" />
        {NAV_ITEMS.map((item) => (
          <RailLink key={item.to} item={item} badge={item.to === '/orders' ? openOrders : 0} />
        ))}
        <span className="flex-1" />
        <ConnectionStatus variant="rail" className="px-1" />
        <AccountMenu />
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <CartProvider>
          <Outlet />
        </CartProvider>
      </div>

      <nav
        aria-label="Main"
        className="grid flex-none grid-cols-5 border-t bg-background pb-[max(4px,env(safe-area-inset-bottom))] md:hidden"
      >
        {NAV_ITEMS.map((item) => (
          <BarLink key={item.to} item={item} badge={item.to === '/orders' ? openOrders : 0} />
        ))}
      </nav>
    </div>
  )
}

function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-[5px] text-[11px] font-bold text-primary-foreground',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

function linkLabel(item: NavItem, badge: number) {
  return badge > 0 ? `${item.label}, ${badge} open` : item.label
}

function BarLink({ item, badge }: { item: NavItem; badge: number }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      aria-label={linkLabel(item, badge)}
      className={({ isActive }) =>
        cn(
          'relative flex h-16 flex-col items-center justify-center gap-1 text-xs outline-none focus-visible:bg-accent',
          isActive ? 'font-bold text-caramel-text' : 'font-semibold text-muted-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span className={cn('flex h-[30px] w-14 items-center justify-center rounded-full', isActive && 'bg-secondary')}>
            <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
          </span>
          {item.label}
          <CountBadge count={badge} className="top-1.5 left-1/2 ml-2" />
        </>
      )}
    </NavLink>
  )
}

function RailLink({ item, badge }: { item: NavItem; badge: number }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      aria-label={linkLabel(item, badge)}
      className={({ isActive }) =>
        cn(
          'relative flex h-16 w-[72px] flex-col items-center justify-center gap-1 rounded-lg text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          isActive
            ? 'bg-primary font-bold text-primary-foreground'
            : 'font-semibold text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
          {item.label}
          <CountBadge
            count={badge}
            className={cn('top-1.5 right-2.5', isActive && 'bg-primary-foreground text-primary')}
          />
        </>
      )}
    </NavLink>
  )
}
