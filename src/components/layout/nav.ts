import { BookOpen, Calculator, ChartNoAxesColumn, Coffee, ReceiptText, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

/** Main navigation, in the order of the Pages Design bottom bar / tablet rail. */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Sell', icon: Coffee },
  { to: '/orders', label: 'Orders', icon: ReceiptText },
  { to: '/menu', label: 'Menu', icon: BookOpen },
  { to: '/dashboard', label: 'Reports', icon: ChartNoAxesColumn },
  { to: '/day-close', label: 'Close', icon: Calculator },
]
