import type { Platform } from '@/types'

interface PlatformIconProps {
  platform: Platform
  size?: number
  className?: string
}

interface IconConfig {
  label: string
  abbr: string
  bg: string
  text: string
  border: string
}

const ICON_CONFIG: Record<Platform, IconConfig> = {
  FACEBOOK: {
    label: 'Facebook',
    abbr: 'F',
    bg: 'bg-blue-600',
    text: 'text-white',
    border: 'border-blue-700',
  },
  INSTAGRAM: {
    label: 'Instagram',
    abbr: 'IG',
    bg: 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400',
    text: 'text-white',
    border: 'border-pink-600',
  },
  TWITTER: {
    label: 'Twitter / X',
    abbr: 'X',
    bg: 'bg-sky-500',
    text: 'text-white',
    border: 'border-sky-600',
  },
  LINKEDIN: {
    label: 'LinkedIn',
    abbr: 'Li',
    bg: 'bg-indigo-600',
    text: 'text-white',
    border: 'border-indigo-700',
  },
  TIKTOK: {
    label: 'TikTok',
    abbr: 'TT',
    bg: 'bg-slate-900',
    text: 'text-white',
    border: 'border-slate-600',
  },
  YOUTUBE: {
    label: 'YouTube',
    abbr: 'YT',
    bg: 'bg-red-600',
    text: 'text-white',
    border: 'border-red-700',
  },
  REDDIT: {
    label: 'Reddit',
    abbr: 'R',
    bg: 'bg-orange-500',
    text: 'text-white',
    border: 'border-orange-600',
  },
}

export function PlatformIcon({ platform, size = 32, className = '' }: PlatformIconProps) {
  const config = ICON_CONFIG[platform]
  const fontSize = size <= 24 ? 'text-xs' : size <= 32 ? 'text-xs' : 'text-sm'

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold border ${config.bg} ${config.text} ${config.border} ${fontSize} ${className}`}
      style={{ width: size, height: size, minWidth: size, fontSize: size * 0.35 }}
      title={config.label}
      aria-label={config.label}
    >
      {config.abbr}
    </span>
  )
}

interface PlatformIconListProps {
  platforms: Platform[]
  size?: number
}

export function PlatformIconList({ platforms, size = 28 }: PlatformIconListProps) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {platforms.map((platform) => (
        <PlatformIcon key={platform} platform={platform} size={size} />
      ))}
    </div>
  )
}
