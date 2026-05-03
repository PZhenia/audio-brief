import type { PropsWithChildren } from 'react'

type BadgeTone =
  | 'pending'
  | 'processing'
  | 'done'
  | 'error'
  | 'neutral'
  | 'created'
  | 'queued'

const tones: Record<BadgeTone, string> = {
  pending:
    'bg-amber-100 text-amber-900 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/25',
  processing:
    'bg-blue-100 text-blue-900 border border-blue-200 dark:bg-blue-500/15 dark:text-blue-200 dark:border-blue-500/25',
  done: 'bg-emerald-100 text-emerald-900 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/25',
  error: 'bg-red-100 text-red-900 border border-red-200 dark:bg-red-500/15 dark:text-red-200 dark:border-red-500/25',
  neutral:
    'bg-gray-100 text-gray-700 border border-gray-200 dark:bg-gray-600/20 dark:text-gray-300 dark:border-gray-500/25',
  created:
    'bg-amber-100 text-amber-900 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/25',
  queued:
    'bg-amber-100 text-amber-900 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/25',
}

type BadgeProps = PropsWithChildren<{
  tone?: BadgeTone
  className?: string
}>

export function Badge({ children, tone = 'neutral', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
