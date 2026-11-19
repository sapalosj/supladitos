import { cn } from '@/lib/utils'

/**
 * The round Supladitos badge from the menu. A 288px raster: keep it at 96px
 * or smaller, always on its white disc (both themes).
 */
export function BrandBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 rounded-full bg-white p-0.5 ring-1 ring-border', className)}>
      <img src="/brand/supladitos-badge-round.png" alt="Supladitos" className="size-full rounded-full" draggable={false} />
    </span>
  )
}
