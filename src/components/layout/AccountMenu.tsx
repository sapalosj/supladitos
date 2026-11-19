import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { useAuth, useProfile } from '@/lib/auth'
import { useOnline } from '@/hooks/useOnline'
import { usePendingOrderCount } from '@/hooks/useLocalCounts'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const ROLE_LABEL = { owner: 'Owner', manager: 'Manager', barista: 'Barista' } as const

/** Who is signed in, and sign out. Signing out offline is allowed but warned about. */
export function AccountMenu({ className }: { className?: string }) {
  const profile = useProfile()
  const { signOut } = useAuth()
  const online = useOnline()
  const pending = usePendingOrderCount()
  const [confirming, setConfirming] = useState(false)

  const name = profile.displayName || profile.email
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  const needsConfirm = !online || pending > 0

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Account: ${name}`}
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            className,
          )}
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">
            {initial}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">{name}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {ROLE_LABEL[profile.role]} · {profile.branchName}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="h-11"
            onSelect={() => (needsConfirm ? setConfirming(true) : void signOut())}
          >
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              {!online && 'You’re offline, so you can’t sign back in until the connection is back. '}
              {pending > 0 &&
                (pending === 1
                  ? '1 order is still waiting to sync. It stays on this device and syncs after the next sign-in.'
                  : `${pending} orders are still waiting to sync. They stay on this device and sync after the next sign-in.`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Stay signed in</AlertDialogCancel>
            <AlertDialogAction className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void signOut()}>
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
