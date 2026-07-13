import type { PostStatus } from '@/types'

interface StatusBadgeProps {
  status: PostStatus
  className?: string
}

const STATUS_CONFIG: Record<
  PostStatus,
  { label: string; bg: string; text: string; ring: string }
> = {
  PENDING: {
    label: 'Pending',
    bg: 'bg-yellow-500/15',
    text: 'text-yellow-400',
    ring: 'ring-yellow-500/30',
  },
  PUBLISHING: {
    label: 'Publishing',
    bg: 'bg-blue-500/15',
    text: 'text-blue-400',
    ring: 'ring-blue-500/30',
  },
  PUBLISHED: {
    label: 'Published',
    bg: 'bg-green-500/15',
    text: 'text-green-400',
    ring: 'ring-green-500/30',
  },
  FAILED: {
    label: 'Failed',
    bg: 'bg-red-500/15',
    text: 'text-red-400',
    ring: 'ring-red-500/30',
  },
  CANCELLED: {
    label: 'Cancelled',
    bg: 'bg-slate-500/15',
    text: 'text-slate-400',
    ring: 'ring-slate-500/30',
  },
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status]

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ${config.bg} ${config.text} ${config.ring} ${className}`}
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${
          status === 'PUBLISHING' ? 'animate-pulse bg-blue-400' : `bg-current`
        }`}
        aria-hidden="true"
      />
      {config.label}
    </span>
  )
}
