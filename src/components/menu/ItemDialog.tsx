import { useEffect, useState } from 'react'
import { Check, Loader2, Plus, Trash2, X } from 'lucide-react'
import type { Category } from '@/lib/db'
import { deleteItem, saveItem, type ItemDraft } from '@/lib/menuAdmin'
import { groupRuleLabel, type MenuEntry, type MenuGroup } from '@/hooks/useMenu'
import { useAction } from '@/hooks/useAction'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog, EditorDialog, Field } from '@/components/EditorDialog'

const DRINK_SIZES = ['Hot', 'Iced Regular', 'Iced Upsized']

function emptyDraft(categoryId: string): ItemDraft {
  return {
    id: crypto.randomUUID(),
    categoryId,
    name: '',
    description: '',
    isAvailable: true,
    variants: [{ id: crypto.randomUUID(), name: 'Regular', price: '' }],
    groupIds: [],
  }
}

function toDraft(item: MenuEntry): ItemDraft {
  return {
    id: item.id,
    categoryId: item.category_id,
    name: item.name,
    description: item.description ?? '',
    isAvailable: item.is_available,
    variants: item.variants.map((v) => ({ id: v.id, name: v.name, price: String(Number(v.price)) })),
    groupIds: item.groups.map((g) => g.id),
  }
}

/** Create or edit a menu item: category, prices per size, modifier groups, availability. */
export function ItemDialog({
  open,
  onOpenChange,
  item,
  defaultCategoryId,
  categories,
  groups,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: MenuEntry | null
  defaultCategoryId: string
  categories: Category[]
  groups: MenuGroup[]
}) {
  const [draft, setDraft] = useState<ItemDraft>(() => emptyDraft(defaultCategoryId))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { busy, run } = useAction()

  useEffect(() => {
    if (open) setDraft(item ? toDraft(item) : emptyDraft(defaultCategoryId))
  }, [open, item, defaultCategoryId])

  const set = (patch: Partial<ItemDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const setVariant = (id: string, patch: Partial<ItemDraft['variants'][number]>) =>
    set({ variants: draft.variants.map((v) => (v.id === id ? { ...v, ...patch } : v)) })

  function applyPreset(names: string[]) {
    // Keep ids (and prices) of variants whose names match, so past sales stay linked.
    const byName = new Map(draft.variants.map((v) => [v.name.toLowerCase(), v]))
    set({
      variants: names.map((n) => byName.get(n.toLowerCase()) ?? { id: crypto.randomUUID(), name: n, price: '' }),
    })
  }

  function toggleGroup(id: string) {
    set({
      groupIds: draft.groupIds.includes(id)
        ? draft.groupIds.filter((g) => g !== id)
        : // keep the groups in their global order
          groups.map((g) => g.id).filter((g) => g === id || draft.groupIds.includes(g)),
    })
  }

  async function onSave() {
    const ok = await run(() => saveItem(draft), item ? 'Item saved' : 'Item added')
    if (ok) onOpenChange(false)
  }

  return (
    <>
      <EditorDialog
        open={open}
        onOpenChange={onOpenChange}
        title={item ? 'Edit item' : 'New item'}
        footer={
          <>
            {item && (
              <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={busy}>
                <Trash2 /> Delete
              </Button>
            )}
            <span className="flex-1" />
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Save
            </Button>
          </>
        }
      >
        <Field label="Name" htmlFor="item-name">
          <Input
            id="item-name"
            value={draft.name}
            onChange={(e) => set({ name: e.target.value.toUpperCase() })}
            placeholder="e.g. SPANISH LATTE"
            className="h-11"
          />
        </Field>
        <Field label="Description" hint="(optional)" htmlFor="item-desc">
          <Input
            id="item-desc"
            value={draft.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="e.g. Espresso, Steamed Milk, & Condensed Milk"
            className="h-11"
          />
        </Field>
        <div className="grid grid-cols-[1fr_auto] items-end gap-4">
          <Field label="Category">
            <Select value={draft.categoryId} onValueChange={(v) => set({ categoryId: v })}>
              <SelectTrigger className="w-full" aria-label="Category">
                <SelectValue placeholder="Pick a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="h-11">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <label className="flex h-11 items-center gap-2 text-sm font-semibold">
            {draft.isAvailable ? 'On sale' : 'Sold out'}
            <Switch checked={draft.isAvailable} onCheckedChange={(v) => set({ isAvailable: v })} aria-label="Available" />
          </label>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 flex w-full items-baseline justify-between gap-2">
            <span className="text-base font-bold">Prices</span>
            <span className="flex gap-1">
              <Button type="button" variant="secondary" size="sm" onClick={() => applyPreset(DRINK_SIZES)}>
                Hot · Iced R · Iced U
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => applyPreset(['Regular'])}>
                Single price
              </Button>
            </span>
          </legend>
          {draft.variants.map((v, i) => (
            <div key={v.id} className="flex items-center gap-2">
              <Input
                aria-label={`Size ${i + 1} name`}
                value={v.name}
                onChange={(e) => setVariant(v.id, { name: e.target.value })}
                placeholder="e.g. Hot"
                className="h-11 flex-1"
              />
              <span className="flex h-11 w-28 items-center gap-1 rounded-md border border-input px-3 focus-within:ring-[3px] focus-within:ring-ring/50">
                <span className="text-muted-foreground">₱</span>
                <input
                  aria-label={`${v.name || `Size ${i + 1}`} price`}
                  inputMode="decimal"
                  value={v.price}
                  onChange={(e) => setVariant(v.id, { price: e.target.value.replace(/[^\d.]/g, '') })}
                  className="tabular w-full min-w-0 bg-transparent text-base outline-none"
                />
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${v.name || 'size'}`}
                disabled={draft.variants.length === 1}
                onClick={() => set({ variants: draft.variants.filter((x) => x.id !== v.id) })}
              >
                <X />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => set({ variants: [...draft.variants, { id: crypto.randomUUID(), name: '', price: '' }] })}
          >
            <Plus /> Add size
          </Button>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-base font-bold">Modifier groups</legend>
          {groups.length === 0 && <p className="text-sm text-muted-foreground">No modifier groups yet.</p>}
          <div className="flex flex-col gap-2">
            {groups.map((g) => {
              const on = draft.groupIds.includes(g.id)
              return (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleGroup(g.id)}
                  className={cn(
                    'flex min-h-14 items-center gap-3 rounded-md px-3 text-left',
                    on ? 'border-2 border-ring bg-primary text-primary-foreground' : 'border border-input',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-5 flex-none items-center justify-center rounded-sm border',
                      on ? 'border-primary-foreground' : 'border-input',
                    )}
                  >
                    {on && <Check className="size-4" />}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">{g.name}</span>
                    <span className={cn('text-xs', on ? 'text-primary-foreground' : 'text-muted-foreground')}>
                      {groupRuleLabel(g)} · {g.modifiers.map((m) => m.name).join(', ') || 'no options'}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </fieldset>
      </EditorDialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${item?.name ?? 'item'}?`}
        description="It disappears from the POS. Past sales keep its name and price. To hide it for a while, mark it sold out instead."
        confirmLabel="Delete item"
        onConfirm={() => void run(() => deleteItem(item!.id), 'Item deleted').then((ok) => ok && onOpenChange(false))}
      />
    </>
  )
}
