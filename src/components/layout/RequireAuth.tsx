import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { BrandBadge } from '@/components/BrandBadge'

/** Route guard (2.4): renders child routes only for a signed-in staff member. */
export function RequireAuth() {
  const { state } = useAuth()
  const location = useLocation()

  if (state.status === 'loading') return <Splash />
  if (state.status === 'signedOut') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}

export function Splash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4" aria-busy="true">
      <BrandBadge className="size-20" />
      <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  )
}
