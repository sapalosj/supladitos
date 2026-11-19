import { useCallback, useState } from 'react'
import { toast } from 'sonner'

/**
 * Wraps an async action with a busy flag and an error toast. Returns true if
 * the action succeeded.
 */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const run = useCallback(async (fn: () => Promise<unknown>, success?: string): Promise<boolean> => {
    setBusy(true)
    try {
      await fn()
      if (success) toast.success(success)
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setBusy(false)
    }
  }, [])
  return { busy, run }
}
