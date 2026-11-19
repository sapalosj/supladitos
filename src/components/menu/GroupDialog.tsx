import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, Plus, Trash2, X } from 'lucide-react'
import { deleteGroup, moveInList, saveGroup, type GroupDraft } from '@/lib/menuAdmin'
import type { MenuData, MenuGroup } from '@/hooks/useMenu'
import { useAction } from '@/hooks/useAction'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ConfirmDialog, EditorDialog, Field } from '@/components/EditorDialog'

type DraftModifier = GroupDraft['modifiers'][number]

function newModifier(): DraftModifier {
  return { id: crypto.randomUUID(), name: '', priceDelta: '', isAvailable: true, variantPrices: {} }
}

function emptyDraft(): GroupDraft {
  return {
    id: crypto.randomUUID(),
    name: '',
    isRequired: false,
    minSelect: '0',
    maxSelect: '1',
    allowQuantity: false,
    modifiers: [newModifier()],
  }
}

function toDraft(g: MenuGroup, menu: MenuData): GroupDraft {
  return {
    id: g.id,
    name: g.name,
    isRequired: g.is_required,
    minSelect: String(g.min_select),
    maxSelect: g.max_select == null ? '' : String(g.max_select),
    allowQuantity: g.allow_quantity,
    modifiers: g.modifiers.map((m) => {
      const variantPrices: Record<string, string> = {}
      for (const name of menu.variantNames) {
        const p = menu.variantPrices.get(`${m.id}|${name}`)
        if (p !== undefined) variantPrices[name] = String(p)
      }
      return { id: m.id, name: m.name, priceDelta: String(Number(m.price_delta)), isAvailable: m.is_available, variantPrices }
    }),
  }
}

function MoneyInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <span className="flex h-11 w-24 flex-none items-center gap-1 rounded-md border border-input px-2 focus-within:ring-[3px] focus-within:ring-ring/50">
      <span className="text-sm text-muted-foreground">+₱</span>
      <input
        aria-label={label}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.-]/g, ''))}
        className="tabular w-full min-w-0 bg-transparent text-base outline-none"
      />
    </span>
  )
}

/** Create or edit a modifier group: selection rules and its options (4.4, 4.5, 4.7). */
export function GroupDialog({
  open,
  onOpenChange,
  group,
  menu,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: MenuGroup | null
  menu: MenuData
}) {
  const [draft, setDraft] = useState<GroupDraft>(emptyDraft)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { busy, run } = useAction()

  useEffect(() => {
    if (open) {
      setDraft(group ? toDraft(group, menu) : emptyDraft())
      setExpanded(null)
    }
    // menu changes after a save; only reset when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group])

  const set = (patch: Partial<GroupDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const setMod = (id: string, patch: Partial<DraftModifier>) =>
    set({ modifiers: draft.modifiers.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
  const usedBy = group ? menu.items.filter((i) => i.groups.some((g) => g.id === group.id)).length : 0

  async function onSave() {
    const ok = await run(() => saveGroup(draft), group ? 'Group saved' : 'Group added')
    if (ok) onOpenChange(false)
  }

  return (
    <>
      <EditorDialog
        open={open}
        onOpenChange={onOpenChange}
        title={group ? 'Edit modifier group' : 'New modifier group'}
        description={group && usedBy > 0 ? `Used by ${usedBy} ${usedBy === 1 ? 'item' : 'items'}.` : undefined}
        footer={
          <>
            {group && (
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
        <Field label="Name" htmlFor="group-name">
          <Input
            id="group-name"
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. Milk"
            className="h-11"
          />
        </Field>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-base font-bold">Rules</legend>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-semibold">
            <span className="flex flex-col">
              Required
              <span className="text-xs font-normal text-muted-foreground">The cashier must pick before adding to cart.</span>
            </span>
            <Switch
              checked={draft.isRequired}
              onCheckedChange={(v) =>
                set({ isRequired: v, minSelect: v && (Number(draft.minSelect) || 0) < 1 ? '1' : v ? draft.minSelect : '0' })
              }
              aria-label="Required"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pick at least" htmlFor="group-min">
              <Input
                id="group-min"
                inputMode="numeric"
                value={draft.minSelect}
                onChange={(e) => set({ minSelect: e.target.value.replace(/\D/g, '') })}
                className="h-11"
              />
            </Field>
            <Field label="Pick at most" hint="(blank = no limit)" htmlFor="group-max">
              <Input
                id="group-max"
                inputMode="numeric"
                value={draft.maxSelect}
                onChange={(e) => set({ maxSelect: e.target.value.replace(/\D/g, '') })}
                className="h-11"
              />
            </Field>
          </div>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-semibold">
            <span className="flex flex-col">
              Allow quantity
              <span className="text-xs font-normal text-muted-foreground">The same option can be added more than once (2× extra shot).</span>
            </span>
            <Switch checked={draft.allowQuantity} onCheckedChange={(v) => set({ allowQuantity: v })} aria-label="Allow quantity" />
          </label>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-base font-bold">Options</legend>
          {draft.modifiers.map((m, i) => {
            const ids = draft.modifiers.map((x) => x.id)
            const overrides = Object.values(m.variantPrices).filter((v) => v.trim() !== '').length
            return (
              <div key={m.id} className="flex flex-col gap-2 rounded-lg border p-2">
                <div className="flex items-center gap-1.5">
                  <span className="flex flex-col">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="h-6"
                      aria-label={`Move ${m.name || 'option'} up`}
                      disabled={i === 0}
                      onClick={() => {
                        const order = moveInList(ids, m.id, -1)
                        if (order) set({ modifiers: order.map((id) => draft.modifiers.find((x) => x.id === id)!) })
                      }}
                    >
                      <ChevronUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="h-6"
                      aria-label={`Move ${m.name || 'option'} down`}
                      disabled={i === draft.modifiers.length - 1}
                      onClick={() => {
                        const order = moveInList(ids, m.id, 1)
                        if (order) set({ modifiers: order.map((id) => draft.modifiers.find((x) => x.id === id)!) })
                      }}
                    >
                      <ChevronDown />
                    </Button>
                  </span>
                  <Input
                    aria-label={`Option ${i + 1} name`}
                    value={m.name}
                    onChange={(e) => setMod(m.id, { name: e.target.value })}
                    placeholder="e.g. Oat milk"
                    className="h-11 min-w-0 flex-1"
                  />
                  <MoneyInput
                    label={`${m.name || `Option ${i + 1}`} price`}
                    value={m.priceDelta}
                    onChange={(v) => setMod(m.id, { priceDelta: v })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${m.name || 'option'}`}
                    onClick={() => set({ modifiers: draft.modifiers.filter((x) => x.id !== m.id) })}
                  >
                    <X />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pl-10">
                  <label className="flex h-11 items-center gap-2 text-xs font-semibold">
                    <Switch
                      checked={m.isAvailable}
                      onCheckedChange={(v) => setMod(m.id, { isAvailable: v })}
                      aria-label={`${m.name || 'Option'} available`}
                    />
                    {m.isAvailable ? 'Available' : 'Sold out'}
                  </label>
                  {menu.variantNames.length > 0 && (
                    <Button
                      type="button"
                      variant="link"
                      className="h-11 px-0 text-caramel-text"
                      aria-expanded={expanded === m.id}
                      onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                    >
                      Price by size{overrides > 0 ? ` · ${overrides} set` : ''}
                    </Button>
                  )}
                </div>
                {expanded === m.id && (
                  <div className="flex flex-col gap-2 pl-10">
                    <p className="text-xs text-muted-foreground">
                      Leave blank to charge +₱{m.priceDelta || '0'} on that size.
                    </p>
                    {menu.variantNames.map((name) => (
                      <div key={name} className="flex items-center justify-between gap-2 text-sm">
                        <span>{name}</span>
                        <MoneyInput
                          label={`${m.name || 'Option'} price on ${name}`}
                          value={m.variantPrices[name] ?? ''}
                          onChange={(v) => setMod(m.id, { variantPrices: { ...m.variantPrices, [name]: v } })}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => set({ modifiers: [...draft.modifiers, newModifier()] })}
          >
            <Plus /> Add option
          </Button>
        </fieldset>
      </EditorDialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${group?.name ?? 'group'}?`}
        description={
          usedBy > 0
            ? `It’s removed from ${usedBy} ${usedBy === 1 ? 'item' : 'items'}. Past sales are not affected.`
            : 'Past sales are not affected.'
        }
        confirmLabel="Delete group"
        onConfirm={() => void run(() => deleteGroup(group!.id), 'Group deleted').then((ok) => ok && onOpenChange(false))}
      />
    </>
  )
}
