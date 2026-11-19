import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AccountMenu } from './AccountMenu'
import { ConnectionStatus } from './ConnectionStatus'

/**
 * Connection status + account, shown in page headers on phones only.
 * On tablets the rail carries both.
 */
export function HeaderStatus() {
  return (
    <div className="flex shrink-0 items-center gap-1 md:hidden">
      <ConnectionStatus />
      <AccountMenu />
    </div>
  )
}

/** Back-office page header: title row, optional actions, then e.g. a segmented control. */
export function PageHeader({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="mx-auto flex w-full max-w-3xl flex-none flex-col gap-3 px-4 pt-4 pb-2 md:px-6 md:pt-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="text-2xl leading-8 font-extrabold">{title}</h1>
          {subtitle && <p className="truncate text-xs leading-4 font-medium text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <HeaderStatus />
        </div>
      </div>
      {children}
    </header>
  )
}

/** Scrolling body under a PageHeader. */
export function PageBody({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className={cn('mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-2 pb-6 md:px-6', className)}>{children}</div>
    </main>
  )
}

/** The design's two/three-way segmented control, built on Radix Tabs. */
export function SegmentedList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <TabsList className={cn('grid h-auto w-full group-data-[orientation=horizontal]/tabs:h-auto auto-cols-fr grid-flow-col gap-1 rounded-lg bg-muted p-1', className)}>
      {children}
    </TabsList>
  )
}

export function Segment({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsTrigger
      value={value}
      className="h-11 rounded-md text-sm font-semibold text-secondary-foreground data-[state=active]:bg-primary data-[state=active]:font-bold data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
    >
      {children}
    </TabsTrigger>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center',
        className,
      )}
    >
      <Icon className="size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
      <p className="text-base font-bold">{title}</p>
      {children && <p className="max-w-xs text-sm text-muted-foreground">{children}</p>}
    </div>
  )
}

/** A bordered card section with a small heading, as on Reports and Day close. */
export function Section({
  title,
  aside,
  children,
  className,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base leading-6 font-bold">{title}</h2>
        {aside && <span className="text-xs text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </section>
  )
}
