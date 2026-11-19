import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CloudOff, LoaderCircle, TrendingDown, TrendingUp } from 'lucide-react'
import { useProfile } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { LocalOrder } from '@/lib/db'
import { useOnline } from '@/hooks/useOnline'
import { useOrders } from '@/hooks/useOrders'
import { businessDate, PAYMENT_LABEL, peso, shortDate } from '@/lib/format'
import { change, METHODS, periodRange, summarize, type Period, type Summary } from '@/lib/reports'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs } from '@/components/ui/tabs'
import { PageBody, PageHeader, Section, Segment, SegmentedList } from '@/components/layout/Page'

const METHOD_COLOR = { cash: 'bg-chart-1', gcash: 'bg-chart-2', maya: 'bg-chart-3' } as const

/** Branches this account can see; the filter only shows when there's more than one (7.6). */
function useBranches() {
  const online = useOnline()
  return useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await supabase.from('branches').select('id, name').eq('is_active', true).order('name')
      if (error) throw error
      return data
    },
    enabled: online,
    staleTime: 10 * 60_000,
  })
}

function forBranch(orders: LocalOrder[], branch: string): LocalOrder[] {
  return branch === 'all' ? orders : orders.filter((o) => o.branchId === branch)
}

function hourLabel(h: number): string {
  if (h === 0) return '12A'
  if (h === 12) return '12P'
  return h < 12 ? `${h}A` : `${h - 12}P`
}

function hourLong(h: number): string {
  const suffix = h < 12 ? 'AM' : 'PM'
  const n = h % 12 === 0 ? 12 : h % 12
  return `${n} ${suffix}`
}

/** Reports (Pages Design: "Dashboard"; milestone 7). Voided orders are left out. */
export default function Dashboard() {
  const profile = useProfile()
  const tz = profile.timezone
  const [period, setPeriod] = useState<Period>('today')
  const [branch, setBranch] = useState<string>('all')
  const today = businessDate(new Date(), tz)
  const range = periodRange(period, today)
  const branches = useBranches()

  const current = useOrders(range.from, range.to)
  const previous = useOrders(range.prevFrom, range.prevTo)

  const summary = useMemo(() => summarize(forBranch(current.orders, branch), tz), [current.orders, branch, tz])
  const prevSummary = useMemo(() => summarize(forBranch(previous.orders, branch), tz), [previous.orders, branch, tz])
  const delta = previous.complete ? change(summary.sales, prevSummary.sales) : null

  const subtitle =
    period === 'today' ? shortDate(today, tz) : `${shortDate(range.from, tz)} – ${shortDate(range.to, tz)}`

  return (
    <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)} className="flex min-h-0 flex-1 flex-col gap-0">
      <PageHeader title="Reports" subtitle={subtitle}>
        <SegmentedList>
          <Segment value="today">Today</Segment>
          <Segment value="week">Week</Segment>
          <Segment value="month">Month</Segment>
        </SegmentedList>
        {(branches.data?.length ?? 0) > 1 && (
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="w-full" aria-label="Branch">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="h-11">All branches</SelectItem>
              {branches.data!.map((b) => (
                <SelectItem key={b.id} value={b.id} className="h-11">
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </PageHeader>
      <PageBody>
        {!current.complete && !current.loading && (
          <p className="flex items-start gap-2 rounded-lg bg-warning-bg p-3 text-sm text-warning" role="status">
            <CloudOff className="mt-0.5 size-4 flex-none" aria-hidden="true" />
            Offline: these figures only count orders stored on this device.
          </p>
        )}
        {current.loading ? (
          <div className="flex justify-center py-16">
            <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-label="Loading report" />
          </div>
        ) : (
          <Report summary={summary} delta={delta} compareLabel={range.compareLabel} />
        )}
      </PageBody>
    </Tabs>
  )
}

function Report({ summary: s, delta, compareLabel }: { summary: Summary; delta: number | null; compareLabel: string }) {
  return (
    <>
      <section className="flex flex-col gap-1 rounded-xl border bg-card p-4 shadow-sm" aria-label="Sales">
        <span className="text-sm font-semibold text-muted-foreground">Sales</span>
        <span className="font-display text-[44px] leading-[48px]" data-testid="sales">
          {peso(s.sales)}
        </span>
        {delta !== null && (
          <span className={cn('flex items-center gap-1 text-xs font-medium', delta >= 0 ? 'text-success' : 'text-destructive')}>
            {delta >= 0 ? <TrendingUp className="size-3.5" aria-hidden="true" /> : <TrendingDown className="size-3.5" aria-hidden="true" />}
            {delta >= 0 ? '+' : '−'}
            {Math.abs(Math.round(delta * 100))}% vs {compareLabel}
          </span>
        )}
        {s.voidedCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {s.voidedCount} voided {s.voidedCount === 1 ? 'order' : 'orders'} not counted
          </span>
        )}
      </section>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Orders" value={String(s.orderCount)} testId="order-count" />
        <Stat label="Avg order" value={peso(s.averageOrder)} testId="avg-order" />
      </div>

      {s.orderCount === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No sales yet for this period.</p>
      ) : (
        <>
          <Section title="Sales by hour">
            <HourChart byHour={s.byHour} />
          </Section>
          <Section title="By payment method">
            <MethodBreakdown summary={s} />
          </Section>
          <Section title="Top items" aside={s.topItems.length > 5 ? `Top 5 of ${s.topItems.length}` : undefined}>
            <TopItems items={s.topItems.slice(0, 5)} />
          </Section>
          <Section title="Add-on revenue">
            {s.modifierRevenue.length === 0 ? (
              <p className="text-sm text-muted-foreground">No paid add-ons sold.</p>
            ) : (
              <dl className="flex flex-col gap-2.5 text-sm" data-testid="modifier-revenue">
                {s.modifierRevenue.map((m) => (
                  <div key={m.name} className="flex justify-between gap-3">
                    <dt>
                      {m.name} · {m.quantity}×
                    </dt>
                    <dd className="tabular font-semibold">{peso(m.revenue)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Section>
        </>
      )}
    </>
  )
}

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <section className="flex flex-col gap-1 rounded-xl border bg-card p-3.5 shadow-sm">
      <span className="text-[13px] font-semibold text-muted-foreground">{label}</span>
      <span className="font-display text-[32px] leading-9" data-testid={testId}>
        {value}
      </span>
    </section>
  )
}

/** Bars per hour (7.3). Tap or hover a bar to read its value; the peak is shown by default. */
function HourChart({ byHour }: { byHour: number[] }) {
  const withSales = byHour.map((v, h) => (v > 0 ? h : -1)).filter((h) => h >= 0)
  const start = Math.min(8, ...withSales)
  const end = Math.max(17, ...withSales)
  const hours = Array.from({ length: end - start + 1 }, (_, i) => start + i)
  const max = Math.max(...byHour)
  const peak = byHour.indexOf(max)
  const [active, setActive] = useState<number | null>(null)
  const shown = active ?? peak
  const ticks = hours.filter((h) => (h - start) % 2 === 0)

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm" aria-live="polite">
        <span className="text-muted-foreground">{active === null ? 'Busiest: ' : ''}</span>
        <b className="font-semibold">{hourLong(shown)}</b> · <span className="tabular">{peso(byHour[shown])}</span>
      </p>
      <div className="flex h-28 items-end gap-[2px] border-b" onMouseLeave={() => setActive(null)}>
        {hours.map((h) => {
          const v = byHour[h]
          const pct = max ? (v / max) * 100 : 0
          return (
            <button
              key={h}
              type="button"
              aria-label={`${hourLong(h)}: ${peso(v)}`}
              onMouseEnter={() => setActive(h)}
              onFocus={() => setActive(h)}
              onClick={() => setActive(h)}
              className="group flex h-full flex-1 items-end outline-none"
            >
              <span
                className={cn(
                  'block w-full rounded-t-[4px] transition-colors',
                  h === shown ? 'bg-caramel-text' : 'bg-chart-1 group-hover:bg-caramel-text',
                  v > 0 ? 'min-h-[3px]' : 'h-0',
                )}
                style={{ height: `${pct}%` }}
              />
            </button>
          )
        })}
      </div>
      <div aria-hidden="true" className="flex text-[11px] text-muted-foreground">
        {hours.map((h) => (
          <span key={h} className="flex-1 text-center">
            {ticks.includes(h) ? hourLabel(h) : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Stacked bar plus a labelled list (7.4); the list carries the names and amounts. */
function MethodBreakdown({ summary: s }: { summary: Summary }) {
  const total = METHODS.reduce((n, m) => n + s.byMethod[m], 0)
  return (
    <div className="flex flex-col gap-3">
      <div aria-hidden="true" className="flex h-3.5 gap-[2px] overflow-hidden rounded-full">
        {METHODS.filter((m) => s.byMethod[m] > 0).map((m) => (
          <span key={m} className={METHOD_COLOR[m]} style={{ width: `${(s.byMethod[m] / total) * 100}%` }} />
        ))}
      </div>
      <dl className="flex flex-col gap-2 text-sm" data-testid="by-method">
        {METHODS.map((m) => (
          <div key={m} className="flex items-center gap-2">
            <span className={cn('size-2.5 flex-none rounded-full', METHOD_COLOR[m])} aria-hidden="true" />
            <dt className="flex-1">
              {PAYMENT_LABEL[m]}{' '}
              <span className="text-xs text-muted-foreground">
                · {s.countByMethod[m]} {s.countByMethod[m] === 1 ? 'order' : 'orders'}
                {total > 0 && ` · ${Math.round((s.byMethod[m] / total) * 100)}%`}
              </span>
            </dt>
            <dd className="tabular font-semibold">{peso(s.byMethod[m])}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function TopItems({ items }: { items: Summary['topItems'] }) {
  const max = items[0]?.sales ?? 0
  return (
    <ol className="flex flex-col gap-2.5" data-testid="top-items">
      {items.map((t) => (
        <li key={t.name} className="flex flex-col gap-1">
          <span className="flex justify-between gap-3 text-[13px]">
            <b className="font-extrabold tracking-[0.01em]">{t.name}</b>
            <span className="tabular text-muted-foreground">
              {t.quantity} sold · {peso(t.sales)}
            </span>
          </span>
          <span className="h-1.5 rounded-full bg-secondary" aria-hidden="true">
            <span className="block h-1.5 rounded-full bg-chart-1" style={{ width: `${max ? (t.sales / max) * 100 : 0}%` }} />
          </span>
        </li>
      ))}
    </ol>
  )
}
