'use client'

import { PLATFORMS, PLATFORM_LABELS } from '@/types'
import type { Platform } from '@/types'

interface SocialLinksFieldsProps {
  values: Partial<Record<Platform, string>>
  onChange: (values: Partial<Record<Platform, string>>) => void
}

export function SocialLinksFields({ values, onChange }: SocialLinksFieldsProps) {
  function setPlatform(platform: Platform, url: string) {
    const next = { ...values }
    if (url.trim()) next[platform] = url.trim()
    else delete next[platform]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Social Pages</h3>
      {PLATFORMS.map((platform) => (
        <div key={platform}>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">{PLATFORM_LABELS[platform]}</label>
          <input
            type="url"
            value={values[platform] ?? ''}
            onChange={(e) => setPlatform(platform, e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="https://..."
          />
        </div>
      ))}
    </div>
  )
}
