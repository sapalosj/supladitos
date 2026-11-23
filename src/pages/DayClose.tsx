import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarCheck, CircleCheck, CloudOff, History, Loader2, LoaderCircle, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { useProfile } from '@/lib/auth'
import { db } from '@/lib/db'
import { supabase, type Tables } from '@/lib/supabase'
import { useOnline } from '@/hooks/useOnline'
import { useOrders } from '@/hooks/useOrders'
import { businessDate, PAYMENT_LABEL, pesoExact, shortDate, timeOfDay } from '@/lib/format'
import { METHODS, summarize } from '@/lib/reports'
import { requestSync } from '@/lib/sync'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { EmptyState, PageBody, PageHeader, Section, Segment, SegmentedList } from '@/components/layout/Page'
import { ConfirmDialog } from '@/components/EditorDialog'

type DayCloseRow = Tables<'day_closes'>

function useDayCloses() {
  const online = useOnline()
  return useQuery({
    queryKey: ['day_closes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('day_closes').select('*').order('business_date', { ascending: false }).limit(90)
      if (error) throw error
      return data
    },
    enabled: online,
  })
}

/** Day close (Pages Design: "Day close"; milestone 8). */
export default function DayClose() {
  const profile = useProfile()
  const closes = useDayCloses()

  return (
    <Tabs defaultValue="close" className="flex min-h-0 flex-1 flex-col gap-0">
      <PageHeader title="Day close" subtitle={profile.branchName}>
        <SegmentedList>
          <Segment value="close">Close a day</Segment>
          <Segment value="history">History</Segment>
        </SegmentedList>
      </PageHeader>
      <PageBody>
        <TabsContent value="close" className="flex flex-col gap-4">
          <CloseDay closes={closes.data} closesLoading={closes.isPending} />
        </TabsContent>
        <TabsContent value="history" className="flex flex-col gap-3">
          <CloseHistory closes={closes.data} loading={closes.isPending} timeZone={profile.timezone} />
        </TabsContent>
      </PageBody>
    </Tabs>
  )
}

function variance(v: number) {
  if (Math.abs(v) < 0.005) return { label: 'Exact', tone: 'text-success', bg: 'bg-status-done-bg' }
  return v < 0
    ? { label: 'Short', tone: 'text-destructive', bg: 'bg-destructive/10' }
    : { label: 'Over', tone: 'text-warning', bg: 'bg-warning-bg' }
}

function signed(v: number): string {
  return `${v < 0 ? '−' : v > 0 ? '+' : ''}${pesoExact(Math.abs(v))}`
}

function CloseDay({ closes, closesLoading }: { closes: DayCloseRow[] | undefined; closesLoading: boolean }) {
  const profile = useProfile()
  const tz = profile.timezone
  const online = useOnline()
  const queryClient = useQueryClient()
  const today = businessDate(new Date(), tz)
  const [date, setDate] = useState(today)
  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)

  const { orders, loading, complete } = useOrders(date, date)
  const s = useMemo(() => summarize(orders, tz), [orders, tz])
  const pending = useLiveQuery(
    () => db.orders.where('businessDate').equals(date).filter((o) => o.syncStatus !== 'synced' || o.statusSync === 'pending').count(),
    [date],
    0,
  )
  const open = orders.filter((o) => o.status === 'new' || o.status === 'preparing').length
  const existing = closes?.find((c) => c.business_date === date)

  const expected = s.byMethod.cash
  const actual = counted.trim() === '' ? null : Number(counted)
  const diff = actual == null || !Number.isFinite(actual) ? null : actual - expected
  const canClose = online && complete && !existing && !closesLoading && diff !== null && !saving

  async function close() {
    if (actual == null || diff == null) return
    setSaving(true)
    try {
      // Push anything still waiting so the server has every sale first.
      await requestSync()
      const { error } = await supabase.from('day_closes').insert({
        business_date: date,
        order_count: s.orderCount,
        gross_sales: s.sales,
        // "unpaid" is only there when something was still unpaid at the close.
        totals_by_method: s.unpaid > 0 ? { ...s.byMethod, unpaid: s.unpaid } : s.byMethod,
        expected_cash: expected,
        actual_cash: actual,
        notes: note.trim() || null,
      })
      if (error) {
        throw new Error(error.code === '23505' ? `${shortDate(date, tz)} is already closed.` : error.message)
      }
      toast.success(`${shortDate(date, tz)} closed`, { description: `Variance ${signed(diff)}` })
      setCounted('')
      setNote('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
      void queryClient.invalidateQueries({ queryKey: ['day_closes'] })
    }
  }

  if (existing) {
    return (
      <>
        <DatePicker date={date} today={today} timeZone={tz} onChange={setDate} />
        <ClosedDay close={existing} timeZone={tz} />
      </>
    )
  }

  return (
    <>
      <DatePicker date={date} today={today} timeZone={tz} onChange={setDate} />

      {!online && (
        <Banner icon={CloudOff}>
          <b className="font-bold">You’re offline.</b> You can check the totals, but closing the day needs a connection.
        </Banner>
      )}
      {pending > 0 && (
        <Banner icon={TriangleAlert}>
          <b className="font-bold">
            {pending} {pending === 1 ? 'order is' : 'orders are'} waiting to sync.
          </b>{' '}
          They’re included below. Get online before closing so the report matches.
        </Banner>
      )}
      {open > 0 && (
        <Banner icon={TriangleAlert}>
          {open} {open === 1 ? 'order is' : 'orders are'} still in the queue. They count as sales; void any that were cancelled.
        </Banner>
      )}
      {s.unpaidCount > 0 && (
        <Banner icon={TriangleAlert}>
          <b className="font-bold">
            {s.unpaidCount} {s.unpaidCount === 1 ? 'order is' : 'orders are'} not paid yet ({pesoExact(s.unpaid)}).
          </b>{' '}
          They count as sales but not as cash. Take the payments from Orders → Unpaid before closing, or void what won’t be paid.
        </Banner>
      )}

      <Section
        title={date === today ? 'Today’s sales' : `Sales · ${shortDate(date, tz)}`}
        aside={`${s.orderCount} ${s.orderCount === 1 ? 'order' : 'orders'}${s.voidedCount ? ` · ${s.voidedCount} voided` : ''}`}
      >
        {loading ? (
          <LoaderCircle className="mx-auto size-6 animate-spin text-muted-foreground" aria-label="Loading totals" />
        ) : (
          <dl className="flex flex-col gap-2.5 text-[15px]" data-testid="close-totals">
            {METHODS.map((m) => (
              <div key={m} className="flex justify-between">
                <dt>{PAYMENT_LABEL[m]}</dt>
                <dd className="tabular font-semibold">{pesoExact(s.byMethod[m])}</dd>
              </div>
            ))}
            {s.unpaid > 0 && (
              <div className="flex justify-between text-warning">
                <dt>Unpaid</dt>
                <dd className="tabular font-semibold">{pesoExact(s.unpaid)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t pt-2.5">
              <dt className="font-bold">Total</dt>
              <dd className="font-display text-[26px] leading-[30px]">{pesoExact(s.sales)}</dd>
            </div>
            {s.discounts > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <dt>Discounts given (already taken off)</dt>
                <dd className="tabular">{pesoExact(s.discounts)}</dd>
              </div>
            )}
          </dl>
        )}
      </Section>

      <Section title="Cash drawer">
        <div className="flex justify-between text-[15px]">
          <span className="text-muted-foreground">Expected cash</span>
          <span className="tabular font-semibold" data-testid="expected-cash">
            {pesoExact(expected)}
          </span>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Actual cash counted</span>
          <span className="flex h-14 items-center gap-2 rounded-md border-2 border-ring px-3.5">
            <span className="font-display text-[22px] text-muted-foreground">₱</span>
            <input
              inputMode="decimal"
              aria-label="Actual cash counted"
              value={counted}
              onChange={(e) => setCounted(e.target.value.replace(/[^\d.]/g, ''))}
              className="tabular min-w-0 flex-1 bg-transparent font-display text-[26px] outline-none"
            />
          </span>
        </label>
        {diff !== null && (
          <div className={cn('flex items-center justify-between rounded-xl p-3.5', variance(diff).bg)} role="status" data-testid="variance">
            <span className="flex flex-col">
              <span className={cn('column-head', variance(diff).tone)}>Variance · {variance(diff).label}</span>
              <span className="text-xs text-muted-foreground">Recorded with this close</span>
            </span>
            <span className={cn('font-display text-[32px] leading-9', variance(diff).tone)}>{signed(diff)}</span>
          </div>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">
            Note <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. gave extra change to a regular"
            className="h-11 rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </label>
      </Section>

      <Button size="lg" className="text-lg" disabled={!canClose} onClick={() => setConfirming(true)}>
        {saving && <Loader2 className="animate-spin" />}
        {date === today ? 'Close day' : `Close ${shortDate(date, tz)}`}
      </Button>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        destructive={false}
        title={`Close ${shortDate(date, tz)}?`}
        description={`Sales ${pesoExact(s.sales)}, cash counted ${pesoExact(actual ?? 0)}, variance ${signed(diff ?? 0)}. A day can only be closed once.`}
        confirmLabel="Close day"
        onConfirm={() => void close()}
      />
    </>
  )
}

function DatePicker({ date, today, timeZone, onChange }: { date: string; today: string; timeZone: string; onChange: (d: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm font-semibold">
      <span className="flex items-center gap-2">
        <CalendarCheck className="size-4 text-muted-foreground" aria-hidden="true" />
        Business date{date === today ? ' · today' : ''}
      </span>
      <input
        type="date"
        aria-label="Business date"
        value={date}
        max={today}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="h-11 rounded-md border border-input bg-background px-3 text-sm"
        title={shortDate(date, timeZone)}
      />
    </label>
  )
}

function Banner({ icon: Icon, children }: { icon: typeof TriangleAlert; children: React.ReactNode }) {
  return (
    <div role="status" className="flex gap-3 rounded-xl border bg-warning-bg p-3 text-[13px] leading-[18px] text-warning">
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

/** A day that's already closed: the record, read-only (8.3 blocks a second close). */
function ClosedDay({ close: c, timeZone }: { close: DayCloseRow; timeZone: string }) {
  const totals = (c.totals_by_method ?? {}) as Record<string, number>
  const v = variance(Number(c.variance))
  return (
    <>
      <div role="status" className="flex gap-3 rounded-xl border bg-status-done-bg p-3 text-sm text-success" data-testid="already-closed">
        <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          <b className="font-bold">{shortDate(c.business_date, timeZone)} is closed.</b> Closed at {timeOfDay(c.closed_at, timeZone)}
          {' '}on {shortDate(c.closed_at, timeZone)}. A day can only be closed once.
        </span>
      </div>
      <Section title="Sales" aside={`${c.order_count} ${c.order_count === 1 ? 'order' : 'orders'}`}>
        <dl className="flex flex-col gap-2.5 text-[15px]">
          {METHODS.map((m) => (
            <div key={m} className="flex justify-between">
              <dt>{PAYMENT_LABEL[m]}</dt>
              <dd className="tabular font-semibold">{pesoExact(Number(totals[m] ?? 0))}</dd>
            </div>
          ))}
          {Number(totals.unpaid ?? 0) > 0 && (
            <div className="flex justify-between text-warning">
              <dt>Unpaid at close</dt>
              <dd className="tabular font-semibold">{pesoExact(Number(totals.unpaid))}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t pt-2.5">
            <dt className="font-bold">Total</dt>
            <dd className="font-display text-[26px] leading-[30px]">{pesoExact(Number(c.gross_sales))}</dd>
          </div>
        </dl>
      </Section>
      <Section title="Cash drawer">
        <dl className="flex flex-col gap-2.5 text-[15px]">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Expected cash</dt>
            <dd className="tabular font-semibold">{pesoExact(Number(c.expected_cash))}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Counted</dt>
            <dd className="tabular font-semibold">{pesoExact(Number(c.actual_cash))}</dd>
          </div>
          <div className={cn('flex items-center justify-between rounded-xl p-3.5', v.bg)}>
            <dt className={cn('column-head', v.tone)}>Variance · {v.label}</dt>
            <dd className={cn('font-display text-[28px] leading-8', v.tone)}>{signed(Number(c.variance))}</dd>
          </div>
          {c.notes && <p className="text-sm text-muted-foreground">Note: {c.notes}</p>}
        </dl>
      </Section>
    </>
  )
}

/** Past closes (8.4). */
function CloseHistory({ closes, loading, timeZone }: { closes: DayCloseRow[] | undefined; loading: boolean; timeZone: string }) {
  const online = useOnline()
  if (!online && !closes) {
    return <EmptyState icon={CloudOff} title="Offline">Day close history needs a connection.</EmptyState>
  }
  if (loading) {
    return <LoaderCircle className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" aria-label="Loading history" />
  }
  if (!closes?.length) {
    return <EmptyState icon={History} title="No days closed yet">Each closed day shows up here with its cash variance.</EmptyState>
  }
  return (
    <ul className="border-t" aria-label="Closed days" data-testid="close-history">
      {closes.map((c) => {
        const v = variance(Number(c.variance))
        return (
          <li key={c.id} className="flex min-h-[64px] items-center gap-3 border-b py-2">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold">{shortDate(c.business_date, timeZone)}</span>
              <span className="tabular truncate text-xs text-muted-foreground">
                {c.order_count} orders · sales {pesoExact(Number(c.gross_sales))} · cash {pesoExact(Number(c.actual_cash))}
                {c.notes ? ` · ${c.notes}` : ''}
              </span>
            </span>
            <span className="flex flex-col items-end">
              <span className={cn('tabular text-sm font-bold', v.tone)}>{signed(Number(c.variance))}</span>
              <span className={cn('text-[11px] font-semibold', v.tone)}>{v.label}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
