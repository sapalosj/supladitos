import { useState } from 'react'
import { BookOpen, ChevronDown, ChevronUp, CloudOff, ListChecks, Lock, Plus } from 'lucide-react'
import { useProfile } from '@/lib/auth'
import { useOnline } from '@/hooks/useOnline'
import { groupRuleLabel, shortVariant, useMenu, type MenuEntry, type MenuGroup } from '@/hooks/useMenu'
import { moveInList, setItemAvailable, setSortOrder } from '@/lib/menuAdmin'
import { useAction } from '@/hooks/useAction'
import { priceList } from '@/lib/format'
import type { Category } from '@/lib/db'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { EmptyState, PageBody, PageHeader, Segment, SegmentedList } from '@/components/layout/Page'
import { CategoryDialog } from '@/components/menu/CategoryDialog'
import { ItemDialog } from '@/components/menu/ItemDialog'
import { GroupDialog } from '@/components/menu/GroupDialog'

/**
 * Menu & pricing (Pages Design: "Menu & pricing"; milestone 4). Reads the menu
 * from this device; changes are written to Supabase (owners and managers,
 * online only) and copied back down.
 */
export default function Menu() {
  const profile = useProfile()
  const online = useOnline()
  const menu = useMenu()
  const [tab, setTab] = useState('items')
  const [itemDialog, setItemDialog] = useState<{ item: MenuEntry | null; categoryId: string } | null>(null)
  const [categoryDialog, setCategoryDialog] = useState<{ category: Category | null } | null>(null)
  const [groupDialog, setGroupDialog] = useState<{ group: MenuGroup | null } | null>(null)
  const { busy, run } = useAction()

  const isManager = profile.role === 'owner' || profile.role === 'manager'
  const canEdit = isManager && online
  const categories = menu?.categories ?? []

  function move(table: 'categories' | 'menu_items' | 'modifier_groups', ids: string[], id: string, dir: -1 | 1) {
    const order = moveInList(ids, id, dir)
    if (order) void run(() => setSortOrder(table, order))
  }

  const headerAction =
    tab === 'items' ? (
      <Button onClick={() => setItemDialog({ item: null, categoryId: categories[0]?.id ?? '' })} disabled={!canEdit || categories.length === 0}>
        <Plus /> Add item
      </Button>
    ) : (
      <Button onClick={() => setGroupDialog({ group: null })} disabled={!canEdit}>
        <Plus /> Add group
      </Button>
    )

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
      <PageHeader title="Menu" actions={isManager ? headerAction : undefined}>
        <SegmentedList>
          <Segment value="items">Items</Segment>
          <Segment value="groups">Modifier groups</Segment>
        </SegmentedList>
      </PageHeader>
      <PageBody>
        {!isManager ? (
          <Notice icon={Lock}>Only owners and managers can change the menu.</Notice>
        ) : (
          !online && <Notice icon={CloudOff}>You’re offline. Menu changes need a connection; the POS keeps using the menu on this device.</Notice>
        )}

        <TabsContent value="items" className="flex flex-col gap-4">
          {categories.length === 0 ? (
            <EmptyState icon={BookOpen} title="No menu on this device yet">
              {canEdit ? 'Add a category to start.' : 'The menu downloads automatically whenever the app is online.'}
            </EmptyState>
          ) : (
            categories.map((c, ci) => {
              const items = menu?.itemsByCategory.get(c.id) ?? []
              const ids = items.map((i) => i.id)
              return (
                <section key={c.id} className="flex flex-col gap-2" aria-labelledby={`cat-${c.id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <h2 id={`cat-${c.id}`} className="section-title text-[22px] leading-7">
                      {c.name}
                    </h2>
                    {canEdit ? (
                      <span className="flex items-center">
                        <ReorderButtons
                          label={c.name}
                          first={ci === 0}
                          last={ci === categories.length - 1}
                          disabled={busy}
                          onMove={(dir) => move('categories', categories.map((x) => x.id), c.id, dir)}
                        />
                        <Button variant="ghost" className="text-caramel-text" onClick={() => setCategoryDialog({ category: c })}>
                          Edit
                        </Button>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {items.length} {items.length === 1 ? 'item' : 'items'}
                      </span>
                    )}
                  </div>
                  {items.length === 0 ? (
                    <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No items in this category.</p>
                  ) : (
                    <ul className="overflow-hidden rounded-xl border">
                      {items.map((item, i) => (
                        <ItemRow
                          key={item.id}
                          item={item}
                          canEdit={canEdit}
                          busy={busy}
                          first={i === 0}
                          last={i === items.length - 1}
                          onMove={(dir) => move('menu_items', ids, item.id, dir)}
                          onEdit={() => setItemDialog({ item, categoryId: c.id })}
                          onToggle={(v) =>
                            void run(() => setItemAvailable(item.id, v), v ? `${item.name} is back on sale` : `${item.name} marked sold out`)
                          }
                        />
                      ))}
                    </ul>
                  )}
                  {canEdit && (
                    <Button variant="ghost" className="self-start text-caramel-text" onClick={() => setItemDialog({ item: null, categoryId: c.id })}>
                      <Plus /> Add to {c.name}
                    </Button>
                  )}
                </section>
              )
            })
          )}
          {canEdit && (
            <Button variant="outline" className="self-start" onClick={() => setCategoryDialog({ category: null })}>
              <Plus /> Add category
            </Button>
          )}
        </TabsContent>

        <TabsContent value="groups" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Groups like Milk or Add-ons are defined once and attached to items. Options can cost extra and be marked sold out.
          </p>
          {(menu?.groups.length ?? 0) === 0 ? (
            <EmptyState icon={ListChecks} title="No modifier groups yet">
              Milk, add-ons and other options you can attach to items are managed here.
            </EmptyState>
          ) : (
            <ul className="overflow-hidden rounded-xl border">
              {menu!.groups.map((g, i) => {
                const usedBy = menu!.items.filter((it) => it.groups.some((x) => x.id === g.id)).length
                return (
                  <li key={g.id} className="flex min-h-[68px] items-center gap-2 border-b bg-card pr-2 pl-1 last:border-b-0">
                    {canEdit && (
                      <ReorderButtons
                        label={g.name}
                        first={i === 0}
                        last={i === menu!.groups.length - 1}
                        disabled={busy}
                        vertical
                        onMove={(dir) => move('modifier_groups', menu!.groups.map((x) => x.id), g.id, dir)}
                      />
                    )}
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setGroupDialog({ group: g })}
                      className="flex min-h-14 min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-md px-2 text-left enabled:hover:bg-accent"
                    >
                      <span className="text-sm font-bold">{g.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {groupRuleLabel(g)} · used by {usedBy} {usedBy === 1 ? 'item' : 'items'}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {g.modifiers
                          .map((m) => `${m.name}${Number(m.price_delta) ? ` +${Number(m.price_delta)}` : ''}${m.is_available ? '' : ' (sold out)'}`)
                          .join(' · ') || 'No options'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </TabsContent>
      </PageBody>

      {menu && (
        <>
          <ItemDialog
            open={!!itemDialog}
            onOpenChange={(o) => !o && setItemDialog(null)}
            item={itemDialog?.item ?? null}
            defaultCategoryId={itemDialog?.categoryId ?? ''}
            categories={menu.categories}
            groups={menu.groups}
          />
          <CategoryDialog
            open={!!categoryDialog}
            onOpenChange={(o) => !o && setCategoryDialog(null)}
            category={categoryDialog?.category ?? null}
            itemCount={categoryDialog?.category ? (menu.itemsByCategory.get(categoryDialog.category.id)?.length ?? 0) : 0}
          />
          <GroupDialog
            open={!!groupDialog}
            onOpenChange={(o) => !o && setGroupDialog(null)}
            group={groupDialog?.group ?? null}
            menu={menu}
          />
        </>
      )}
    </Tabs>
  )
}

function Notice({ icon: Icon, children }: { icon: typeof Lock; children: React.ReactNode }) {
  return (
    <div role="status" className="flex gap-3 rounded-xl border bg-warning-bg p-3 text-sm text-warning">
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

function ReorderButtons({
  label,
  first,
  last,
  disabled,
  vertical,
  onMove,
}: {
  label: string
  first: boolean
  last: boolean
  disabled?: boolean
  vertical?: boolean
  onMove: (dir: -1 | 1) => void
}) {
  return (
    <span className={cn('flex flex-none', vertical && 'flex-col')}>
      <Button
        variant="ghost"
        size="icon"
        className={cn('text-muted-foreground', vertical && 'h-8')}
        aria-label={`Move ${label} up`}
        disabled={first || disabled}
        onClick={() => onMove(-1)}
      >
        <ChevronUp />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn('text-muted-foreground', vertical && 'h-8')}
        aria-label={`Move ${label} down`}
        disabled={last || disabled}
        onClick={() => onMove(1)}
      >
        <ChevronDown />
      </Button>
    </span>
  )
}

function ItemRow({
  item,
  canEdit,
  busy,
  first,
  last,
  onMove,
  onEdit,
  onToggle,
}: {
  item: MenuEntry
  canEdit: boolean
  busy: boolean
  first: boolean
  last: boolean
  onMove: (dir: -1 | 1) => void
  onEdit: () => void
  onToggle: (available: boolean) => void
}) {
  const prices =
    item.variants.length === 1
      ? priceList([Number(item.variants[0].price)])
      : item.variants.map((v) => `${shortVariant(v.name)} ${Math.round(Number(v.price))}`).join(' · ')
  const groups = item.groups.length ? ` · ${item.groups.length} ${item.groups.length === 1 ? 'group' : 'groups'}` : ''
  return (
    <li className="flex min-h-[68px] items-center gap-1 border-b bg-card pr-2 pl-1 last:border-b-0">
      {canEdit && (
        <ReorderButtons label={item.name} first={first} last={last} disabled={busy} vertical onMove={onMove} />
      )}
      <button
        type="button"
        disabled={!canEdit}
        onClick={onEdit}
        className="flex min-h-14 min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-md px-2 text-left enabled:hover:bg-accent"
      >
        <span className={cn('text-sm leading-[18px] font-extrabold tracking-[0.01em]', !item.is_available && 'text-muted-foreground')}>
          {item.name}
        </span>
        <span className="tabular text-xs text-muted-foreground">
          {prices}
          {groups}
        </span>
      </button>
      <label
        className={cn(
          'flex h-11 flex-none items-center gap-2 text-xs font-semibold',
          item.is_available ? 'text-success' : 'text-muted-foreground',
        )}
      >
        {item.is_available ? 'On' : 'Sold out'}
        <Switch
          checked={item.is_available}
          onCheckedChange={onToggle}
          disabled={!canEdit || busy}
          aria-label={`${item.name} available`}
        />
      </label>
    </li>
  )
}
