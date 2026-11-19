import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useOnline } from '@/hooks/useOnline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BrandBadge } from '@/components/BrandBadge'

export default function Login() {
  const { state, signIn } = useAuth()
  const online = useOnline()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (state.status === 'signedIn') {
    const to = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={to} replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn(email, password)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(
        message === 'Invalid login credentials'
          ? 'That email and password don’t match.'
          : !navigator.onLine
            ? 'You’re offline. Connect to the internet to sign in the first time.'
            : message,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col gap-8 px-6 pt-12 pb-8">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <BrandBadge className="size-24" />
        <h1 className="wordmark text-[40px] leading-[44px]">Supladitos</h1>
        <p className="text-base text-muted-foreground italic">forget brewed, we pour rude</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            className="h-12"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            className="h-12"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="text-lg" disabled={busy || !email || !password}>
          {busy && <Loader2 className="animate-spin" />}
          Sign in
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {online ? 'You stay signed in on this device, even offline.' : 'You’re offline. Signing in needs a connection.'}
        </p>
      </form>

      <p className="column-head flex justify-center gap-2 text-xs text-muted-foreground">
        <span>MON – SAT</span>
        <span aria-hidden="true">·</span>
        <span>8AM – 6PM</span>
      </p>
    </main>
  )
}
