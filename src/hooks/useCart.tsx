import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { LineDiscount, OrderType } from '@/lib/db'
import { lineDiscount, type PricedModifier, type Selections } from '@/lib/pricing'

export interface CartLine {
  key: string
  menuItemId: string
  variantId: string
  itemName: string
  variantName: string
  /** Variant count of the item: a single-price item hides its variant name. */
  singleVariant: boolean
  unitPrice: number
  quantity: number
  notes: string
  modifiers: PricedModifier[]
  /** Raw selections, to reopen the line for editing. */
  selections: Selections
  /** A percentage off some of the line's units (e.g. 2 of 5). */
  discount?: LineDiscount | null
}

export interface Cart {
  lines: CartLine[]
  orderType: OrderType
  customerName: string
}

interface CartContextValue extends Cart {
  count: number
  /** Full price of all lines. */
  subtotal: number
  discountTotal: number
  /** What the customer pays: subtotal - discountTotal. */
  total: number
  /** Set (or clear, with null) the discount on a line. */
  setDiscount: (key: string, discount: LineDiscount | null) => void
  /** Adds a line; an identical line (same item, size, options, note) just gets more quantity. */
  addLine: (line: Omit<CartLine, 'key'>) => void
  replaceLine: (key: string, line: Omit<CartLine, 'key'>) => void
  setQuantity: (key: string, quantity: number) => void
  removeLine: (key: string) => void
  setOrderType: (t: OrderType) => void
  setCustomerName: (name: string) => void
  clear: () => void
}

const STORAGE_KEY = 'supladitos.cart'
const EMPTY: Cart = { lines: [], orderType: 'dine_in', customerName: '' }

function load(): Cart {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...EMPTY, ...(JSON.parse(raw) as Cart) }
  } catch {
    // storage unavailable or corrupt: start empty
  }
  return EMPTY
}

/** Lines with the same signature merge into one. */
function signature(l: Omit<CartLine, 'key'>): string {
  const mods = [...l.modifiers]
    .sort((a, b) => a.modifierId.localeCompare(b.modifierId))
    .map((m) => `${m.modifierId}x${m.quantity}`)
    .join(',')
  return `${l.variantId}|${mods}|${l.notes.trim()}|${l.unitPrice}`
}

/** A line's discount can't cover more units than the line has. */
function clampDiscount(d: LineDiscount | null | undefined, quantity: number): LineDiscount | null {
  if (!d || d.quantity <= 0) return null
  return d.quantity > quantity ? { ...d, quantity } : d
}

const CartContext = createContext<CartContextValue | null>(null)

/** The order being rung up (5.6, 5.7). Kept per device so a reload doesn't lose it. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart))
    } catch {
      // ignore: the cart still works for this session
    }
  }, [cart])

  const addLine = useCallback((line: Omit<CartLine, 'key'>) => {
    setCart((c) => {
      const sig = signature(line)
      const existing = c.lines.find((l) => signature(l) === sig)
      if (existing) {
        return {
          ...c,
          lines: c.lines.map((l) => (l === existing ? { ...l, quantity: l.quantity + line.quantity } : l)),
        }
      }
      return { ...c, lines: [...c.lines, { ...line, key: crypto.randomUUID() }] }
    })
  }, [])

  const replaceLine = useCallback((key: string, line: Omit<CartLine, 'key'>) => {
    setCart((c) => ({ ...c, lines: c.lines.map((l) => (l.key === key ? { ...line, key, discount: clampDiscount(l.discount, line.quantity) } : l)),
    }))
  }, [])

  const setQuantity = useCallback((key: string, quantity: number) => {
    setCart((c) => ({
      ...c,
      lines: quantity <= 0 ? c.lines.filter((l) => l.key !== key) : c.lines.map((l) => (l.key === key ? { ...l, quantity, discount: clampDiscount(l.discount, quantity) } : l)),
    }))
  }, [])

  const setDiscount = useCallback((key: string, discount: LineDiscount | null) => {
    setCart((c) => ({
      ...c,
      lines: c.lines.map((l) => (l.key === key ? { ...l, discount: clampDiscount(discount, l.quantity) } : l)),
    }))
  }, [])

  const removeLine = useCallback((key: string) => {
    setCart((c) => ({ ...c, lines: c.lines.filter((l) => l.key !== key) }))
  }, [])

  const setOrderType = useCallback((orderType: OrderType) => setCart((c) => ({ ...c, orderType })), [])
  const setCustomerName = useCallback((customerName: string) => setCart((c) => ({ ...c, customerName })), [])
  const clear = useCallback(() => setCart(EMPTY), [])

  const value = useMemo<CartContextValue>(() => {
    const count = cart.lines.reduce((n, l) => n + l.quantity, 0)
    const subtotal = cart.lines.reduce((n, l) => n + l.unitPrice * l.quantity, 0)
    const discountTotal = cart.lines.reduce((n, l) => n + lineDiscount(l.unitPrice, l.quantity, l.discount), 0)
    return {
      ...cart,
      count,
      subtotal,
      discountTotal,
      total: subtotal - discountTotal,
      addLine,
      replaceLine,
      setQuantity,
      setDiscount,
      removeLine,
      setOrderType,
      setCustomerName,
      clear,
    }
  }, [cart, addLine, replaceLine, setQuantity, setDiscount, removeLine, setOrderType, setCustomerName, clear])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}

/** "Iced Regular · Oat milk +30 · 2× Extra shot" */
export function lineDetail(l: Pick<CartLine, 'variantName' | 'singleVariant' | 'modifiers'>): string {
  const parts: string[] = []
  if (!l.singleVariant) parts.push(l.variantName)
  for (const m of l.modifiers) {
    const qty = m.quantity > 1 ? `${m.quantity}× ` : ''
    const price = m.priceDelta ? ` +${Math.round(m.priceDelta * m.quantity)}` : ''
    parts.push(`${qty}${m.name}${price}`)
  }
  return parts.join(' · ')
}
