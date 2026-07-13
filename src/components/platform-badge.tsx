'use client'

import type { Platform } from '@/types'
import { PLATFORM_LABELS } from '@/types'

const PLATFORM_COLORS: Record<Platform, string> = {
  FACEBOOK: 'bg-blue-900 text-blue-300 border-blue-700',
  INSTAGRAM: 'bg-pink-900 text-pink-300 border-pink-700',
  TWITTER: 'bg-sky-900 text-sky-300 border-sky-700',
  LINKEDIN: 'bg-indigo-900 text-indigo-300 border-indigo-700',
  TIKTOK: 'bg-slate-800 text-slate-200 border-slate-600',
  YOUTUBE: 'bg-red-900 text-red-300 border-red-700',
  REDDIT: 'bg-orange-900 text-orange-300 border-orange-700',
}

const PLATFORM_ICONS: Record<Platform, string> = {
  FACEBOOK: 'f',
  INSTAGRAM: 'ig',
  TWITTER: 'x',
  LINKEDIN: 'in',
  TIKTOK: 'tt',
  YOUTUBE: 'yt',
  REDDIT: 'rd',
}

interface PlatformBadgeProps {
  platform: Platform | string
  size?: 'sm' | 'md'
}

export function PlatformBadge({ platform, size = 'md' }: PlatformBadgeProps) {
  const normalizedPlatform = platform.toUpperCase() as Platform
  const colors = PLATFORM_COLORS[normalizedPlatform] ?? 'bg-slate-700 text-slate-300 border-slate-600'
  const icon = PLATFORM_ICONS[normalizedPlatform] ?? '?'
  const label = PLATFORM_LABELS[normalizedPlatform] ?? platform

  const sizeClasses = size === 'sm'
    ? 'px-1.5 py-0.5 text-xs gap-1'
    : 'px-2.5 py-1 text-sm gap-1.5'

  return (
    <span
      className={`inline-flex items-center rounded-md border font-medium ${colors} ${sizeClasses}`}
    >
      <span className="font-bold uppercase text-xs leading-none">{icon}</span>
      <span>{label}</span>
    </span>
  )
}
