import { useEffect, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import type { Category } from '@/lib/db'
import { deleteCategory, saveCategory } from '@/lib/menuAdmin'
import { useAction } from '@/hooks/useAction'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog, EditorDialog, Field } from '@/components/EditorDialog'

/** Create or rename a category, or delete it with its items (4.1). */
export function CategoryDialog({
  open,
  onOpenChange,
  category,
  itemCount,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: Category | null
  itemCount: number
}) {
  const [name, setName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { busy, run } = useAction()

  useEffect(() => {
    if (open) setName(category?.name ?? '')
  }, [open, category])

  async function onSave() {
    const ok = await run(() => saveCategory({ id: category?.id, name: name.toUpperCase() }), category ? 'Category saved' : 'Category added')
    if (ok) onOpenChange(false)
  }

  return (
    <>
      <EditorDialog
        open={open}
        onOpenChange={onOpenChange}
        title={category ? 'Edit category' : 'New category'}
        footer={
          <>
            {category && (
              <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={busy}>
                <Trash2 /> Delete
              </Button>
            )}
            <span className="flex-1" />
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={busy || !name.trim()}>
              {busy && <Loader2 className="animate-spin" />} Save
            </Button>
          </>
        }
      >
        <Field label="Name" htmlFor="category-name">
          <Input
            id="category-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && void onSave()}
            placeholder="e.g. PASTRIES"
            className="h-11 uppercase"
            autoFocus
          />
        </Field>
      </EditorDialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${category?.name ?? 'category'}?`}
        description={
          itemCount > 0
            ? `Its ${itemCount} ${itemCount === 1 ? 'item is' : 'items are'} deleted too. Past sales keep their names and prices.`
            : 'Past sales are not affected.'
        }
        confirmLabel="Delete category"
        onConfirm={() =>
          void run(() => deleteCategory(category!.id), 'Category deleted').then((ok) => ok && onOpenChange(false))
        }
      />
    </>
  )
}
