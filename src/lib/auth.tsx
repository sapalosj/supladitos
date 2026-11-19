import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js'
import { supabase, type Enums } from './supabase'
import { clearUserCache, db, getMeta, setMeta } from './db'

/**
 * The signed-in staff member, cached in Dexie so the app can start with no
 * network (2.2, 2.3).
 */
export interface Profile {
  userId: string
  email: string
  displayName: string | null
  role: Enums<'staff_role'>
  branchId: string
  branchName: string
  timezone: string
}

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; profile: Profile; session: Session | null }

interface AuthContextValue {
  state: AuthState
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchProfile(userId: string, email: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('staff')
    .select('id, role, display_name, is_active, branch:branches(id, name, timezone)')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data || !data.is_active || !data.branch) {
    throw new NotStaffError()
  }
  return {
    userId,
    email,
    displayName: data.display_name,
    role: data.role,
    branchId: data.branch.id,
    branchName: data.branch.name,
    timezone: data.branch.timezone,
  }
}

export class NotStaffError extends Error {
  constructor() {
    super("This account isn't set up as staff for a branch.")
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function init() {
      const cached = await getMeta<Profile>('profile')
      if (cancelled) return

      // Open straight from the cached profile. With an expired access token and
      // no network, getSession() keeps retrying the refresh and does not
      // return until the connection is back, so it must not gate the app.
      if (cached) setState({ status: 'signedIn', profile: cached, session: null })

      const { data, error } = await supabase.auth.getSession()
      if (cancelled) return

      const session = data.session
      if (session) {
        const profile = cached?.userId === session.user.id ? cached : undefined
        if (profile) {
          setState({ status: 'signedIn', profile, session })
          // Refresh branch/role in the background when online.
          fetchProfile(session.user.id, session.user.email ?? '')
            .then(async (fresh) => {
              await setMeta('profile', fresh)
              if (!cancelled) setState({ status: 'signedIn', profile: fresh, session })
            })
            .catch(() => {})
          return
        }
        try {
          const fresh = await fetchProfile(session.user.id, session.user.email ?? '')
          await setMeta('profile', fresh)
          if (!cancelled) setState({ status: 'signedIn', profile: fresh, session })
        } catch {
          if (!cancelled) setState({ status: 'signedOut' })
        }
        return
      }

      // No usable session. If we can't reach the server (offline, or the token
      // could not be refreshed for lack of network), keep working from the
      // cached profile. The stored refresh token is kept by supabase-js and
      // used once the network is back.
      const offline = !navigator.onLine || (error && isAuthRetryableFetchError(error))
      if (cached && offline) return // already signed in from the cache above
      if (cached && !offline) {
        // Online, but signed out on the server side (e.g. password changed).
        await clearUserCache()
      }
      setState({ status: 'signedOut' })
    }

    void init()

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        // Fired after signOut() and when the refresh token is rejected.
        setState((s) => (s.status === 'signedIn' && !navigator.onLine ? s : { status: 'signedOut' }))
        return
      }
      if (session && (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN')) {
        setState((s) => (s.status === 'signedIn' ? { ...s, session } : s))
      }
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw error
    try {
      const profile = await fetchProfile(data.user.id, data.user.email ?? email)
      await setMeta('profile', profile)
      setState({ status: 'signedIn', profile, session: data.session })
    } catch (e) {
      await supabase.auth.signOut({ scope: 'local' })
      throw e
    }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    await clearUserCache()
    try {
      localStorage.removeItem('supladitos.cart')
    } catch {
      // storage unavailable: nothing to clear
    }
    setState({ status: 'signedOut' })
  }, [])

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** The signed-in profile. Only use below the route guard. */
export function useProfile(): Profile {
  const { state } = useAuth()
  if (state.status !== 'signedIn') throw new Error('useProfile used while signed out')
  return state.profile
}

export async function pendingOrderCount(): Promise<number> {
  return db.orders.where('syncStatus').notEqual('synced').count()
}
