'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PlatformIcon } from '@/components/platform-icons'
import type { Platform } from '@/types'
import { PLATFORMS, PLATFORM_LABELS } from '@/types'

const CHAR_LIMITS: Record<Platform, number> = {
  FACEBOOK: 2200,
  INSTAGRAM: 2200,
  TWITTER: 280,
  LINKEDIN: 3000,
  TIKTOK: 2200,
  YOUTUBE: 2200,
  REDDIT: 2200,
}

interface Brand {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  isActive: boolean
}

interface Connection {
  platform: Platform
  isActive: boolean
}

interface FormState {
  brandId: string
  platforms: Platform[]
  content: string
  mediaUrlsRaw: string
  scheduledAt: string
  notes: string
}

function getMinDateTime(): string {
  const d = new Date(Date.now() + 5 * 60 * 1000 + 30 * 1000)
  return d.toISOString().slice(0, 16)
}

function parseMediaUrls(raw: string): string[] {
  return raw
    .split('\n')
    .map((u) => u.trim())
    .filter((u) => u.length > 0)
}

export default function SchedulePage() {
  const router = useRouter()

  const [brands, setBrands] = useState<Brand[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [loadingBrands, setLoadingBrands] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [form, setForm] = useState<FormState>({
    brandId: '',
    platforms: [],
    content: '',
    mediaUrlsRaw: '',
    scheduledAt: '',
    notes: '',
  })

  // Pick up pre-filled content from Content Lab
  useEffect(() => {
    const prefill = sessionStorage.getItem('smg_prefill_content')
    const prefillPlatform = sessionStorage.getItem('smg_prefill_platform') as Platform | null
    const prefillBrandId = sessionStorage.getItem('smg_prefill_brandId')
    const prefillMedia = sessionStorage.getItem('smg_prefill_media')
    if (prefill) {
      sessionStorage.removeItem('smg_prefill_content')
      sessionStorage.removeItem('smg_prefill_platform')
      sessionStorage.removeItem('smg_prefill_brandId')
      sessionStorage.removeItem('smg_prefill_media')
      setForm((prev) => ({
        ...prev,
        content: prefill,
        platforms: prefillPlatform ? [prefillPlatform] : prev.platforms,
        brandId: prefillBrandId || prev.brandId,
        mediaUrlsRaw: prefillMedia || prev.mediaUrlsRaw,
      }))
    }
  }, [])

  useEffect(() => {
    fetch('/api/brands')
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setBrands(json.data)
      })
      .catch(() => {
        setError('Failed to load brands.')
      })
      .finally(() => setLoadingBrands(false))
  }, [])

  const fetchConnections = useCallback(async (brandId: string) => {
    if (!brandId) {
      setConnections([])
      return
    }
    try {
      const res = await fetch(`/api/connections?brandId=${brandId}`)
      const json = await res.json()
      if (json.success) {
        setConnections(json.data ?? [])
      }
    } catch {
      setConnections([])
    }
  }, [])

  useEffect(() => {
    fetchConnections(form.brandId)
  }, [form.brandId, fetchConnections])

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function togglePlatform(platform: Platform) {
    setForm((prev) => {
      const selected = prev.platforms.includes(platform)
      return {
        ...prev,
        platforms: selected
          ? prev.platforms.filter((p) => p !== platform)
          : [...prev.platforms, platform],
      }
    })
  }

  function isConnected(platform: Platform): boolean {
    return connections.some((c) => c.platform === platform && c.isActive)
  }

  const criticalLimitPlatforms = form.platforms.filter(
    (p) => form.content.length > CHAR_LIMITS[p]
  )

  const warningPlatforms = form.platforms.filter(
    (p) => form.content.length > CHAR_LIMITS[p] * 0.9 && form.content.length <= CHAR_LIMITS[p]
  )

  const disconnectedSelected = form.platforms.filter((p) => !isConnected(p))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.brandId) {
      setError('Please select a brand.')
      return
    }
    if (form.platforms.length === 0) {
      setError('Please select at least one platform.')
      return
    }
    if (!form.content.trim()) {
      setError('Post content is required.')
      return
    }
    if (!form.scheduledAt) {
      setError('Please set a scheduled date and time.')
      return
    }
    const scheduledDate = new Date(form.scheduledAt)
    if (scheduledDate.getTime() <= Date.now() + 5 * 60 * 1000) {
      setError('Scheduled time must be at least 5 minutes in the future.')
      return
    }

    setSubmitting(true)

    const mediaUrls = parseMediaUrls(form.mediaUrlsRaw)

    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: form.brandId,
          platforms: form.platforms,
          content: form.content,
          mediaUrls,
          scheduledAt: scheduledDate.toISOString(),
          notes: form.notes || undefined,
        }),
      })

      const json = await res.json()

      if (!json.success) {
        setError(json.error ?? 'Failed to schedule post.')
        return
      }

      setSuccess(true)
      setTimeout(() => router.push('/queue'), 1200)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Schedule a Post</h1>
        <p className="text-slate-400 text-sm mt-1">
          Compose your post and schedule it across multiple platforms.
        </p>
      </div>

      {success && (
        <div className="mb-4 rounded-lg bg-green-500/15 border border-green-500/30 text-green-400 px-4 py-3 text-sm">
          Post scheduled successfully. Redirecting to queue...
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          {/* Left panel — composer */}
          <div className="xl:col-span-3 space-y-5">
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-5">
              {/* Brand selector */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Brand <span className="text-red-400">*</span>
                </label>
                {loadingBrands ? (
                  <div className="h-10 bg-slate-700 rounded-lg animate-pulse" />
                ) : brands.length === 0 ? (
                  <p className="text-slate-500 text-sm">
                    No brands found.{' '}
                    <a href="/connect" className="text-blue-400 hover:underline">
                      Create one first.
                    </a>
                  </p>
                ) : (
                  <select
                    value={form.brandId}
                    onChange={(e) => updateForm('brandId', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Select a brand —</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Platform checkboxes */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Platforms <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PLATFORMS.map((platform) => {
                    const checked = form.platforms.includes(platform)
                    const connected = isConnected(platform)
                    const overLimit =
                      checked && form.content.length > CHAR_LIMITS[platform]

                    return (
                      <label
                        key={platform}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                          checked
                            ? overLimit
                              ? 'border-red-500/50 bg-red-500/10'
                              : 'border-blue-500/50 bg-blue-500/10'
                            : 'border-slate-700 bg-slate-900 hover:border-slate-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePlatform(platform)}
                          className="sr-only"
                        />
                        <PlatformIcon platform={platform} size={26} />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-white truncate">
                            {PLATFORM_LABELS[platform]}
                          </div>
                          <div
                            className={`text-xs ${
                              form.brandId
                                ? connected
                                  ? 'text-green-400'
                                  : 'text-slate-500'
                                : 'text-slate-500'
                            }`}
                          >
                            {form.brandId
                              ? connected
                                ? 'Connected'
                                : 'Not connected'
                              : `Limit: ${CHAR_LIMITS[platform].toLocaleString()}`}
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Content textarea */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-slate-300">
                    Content <span className="text-red-400">*</span>
                  </label>
                  <span className="text-xs text-slate-500">
                    {form.content.length.toLocaleString()} chars
                  </span>
                </div>
                <textarea
                  value={form.content}
                  onChange={(e) => updateForm('content', e.target.value)}
                  rows={8}
                  placeholder="Write your post content here..."
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2.5 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-600"
                />
                {criticalLimitPlatforms.length > 0 && (
                  <p className="mt-1 text-xs text-red-400">
                    Over character limit for:{' '}
                    {criticalLimitPlatforms
                      .map((p) => `${PLATFORM_LABELS[p]} (max ${CHAR_LIMITS[p]})`)
                      .join(', ')}
                  </p>
                )}
                {warningPlatforms.length > 0 && (
                  <p className="mt-1 text-xs text-yellow-400">
                    Approaching limit for:{' '}
                    {warningPlatforms.map((p) => PLATFORM_LABELS[p]).join(', ')}
                  </p>
                )}
              </div>

              {/* Media URLs */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Media URLs{' '}
                  <span className="text-slate-500 font-normal">(optional — one per line)</span>
                </label>
                <textarea
                  value={form.mediaUrlsRaw}
                  onChange={(e) => updateForm('mediaUrlsRaw', e.target.value)}
                  rows={3}
                  placeholder="https://example.com/image.jpg"
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2.5 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-600 font-mono"
                />
              </div>

              {/* Schedule date/time */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Schedule For <span className="text-red-400">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={form.scheduledAt}
                  min={getMinDateTime()}
                  onChange={(e) => updateForm('scheduledAt', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Must be at least 5 minutes from now.
                </p>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Notes{' '}
                  <span className="text-slate-500 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => updateForm('notes', e.target.value)}
                  maxLength={1000}
                  placeholder="Internal notes about this post..."
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-600"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || success}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
              >
                {submitting ? 'Scheduling...' : 'Schedule Post'}
              </button>
            </div>
          </div>

          {/* Right panel — preview */}
          <div className="xl:col-span-2 space-y-4">
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Post Preview</h2>

              {form.content.trim() === '' ? (
                <p className="text-slate-500 text-sm italic">
                  Start writing to see a preview...
                </p>
              ) : (
                <div className="bg-slate-900 rounded-lg border border-slate-700 p-3">
                  <p className="text-sm text-slate-200 whitespace-pre-wrap break-words">
                    {form.content.length > 300
                      ? form.content.slice(0, 300) + '\u2026'
                      : form.content}
                  </p>
                  {parseMediaUrls(form.mediaUrlsRaw).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {parseMediaUrls(form.mediaUrlsRaw).map((url, i) => (
                        <span
                          key={i}
                          className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded px-2 py-0.5 truncate max-w-[200px]"
                          title={url}
                        >
                          Media {i + 1}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Character counts per platform */}
            {form.platforms.length > 0 && (
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
                <h2 className="text-sm font-semibold text-white mb-3">Character Limits</h2>
                <div className="space-y-3">
                  {form.platforms.map((platform) => {
                    const limit = CHAR_LIMITS[platform]
                    const count = form.content.length
                    const pct = Math.min(100, (count / limit) * 100)
                    const overLimit = count > limit
                    const nearLimit = pct >= 90 && !overLimit

                    return (
                      <div key={platform}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <PlatformIcon platform={platform} size={18} />
                            <span className="text-xs text-slate-300">
                              {PLATFORM_LABELS[platform]}
                            </span>
                          </div>
                          <span
                            className={`text-xs font-mono ${
                              overLimit
                                ? 'text-red-400'
                                : nearLimit
                                ? 'text-yellow-400'
                                : 'text-slate-500'
                            }`}
                          >
                            {count.toLocaleString()}/{limit.toLocaleString()}
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              overLimit
                                ? 'bg-red-500'
                                : nearLimit
                                ? 'bg-yellow-400'
                                : 'bg-blue-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {overLimit && (
                          <p className="text-xs text-red-400 mt-0.5">
                            {(count - limit).toLocaleString()} chars over — content may be truncated
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Connection status */}
            {form.brandId && form.platforms.length > 0 && (
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
                <h2 className="text-sm font-semibold text-white mb-3">Platform Status</h2>
                <div className="space-y-2">
                  {form.platforms.map((platform) => {
                    const connected = isConnected(platform)
                    return (
                      <div
                        key={platform}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <PlatformIcon platform={platform} size={22} />
                          <span className="text-xs text-slate-300">
                            {PLATFORM_LABELS[platform]}
                          </span>
                        </div>
                        <span
                          className={`text-xs font-medium ${
                            connected ? 'text-green-400' : 'text-red-400'
                          }`}
                        >
                          {connected ? 'Connected' : 'Not connected'}
                        </span>
                      </div>
                    )
                  })}
                </div>
                {disconnectedSelected.length > 0 && (
                  <div className="mt-3 p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <p className="text-xs text-yellow-400">
                      Warning:{' '}
                      {disconnectedSelected.map((p) => PLATFORM_LABELS[p]).join(', ')}{' '}
                      {disconnectedSelected.length === 1 ? 'is' : 'are'} not connected. The
                      post will fail for those platforms.{' '}
                      <a href="/connect" className="underline hover:text-yellow-300">
                        Connect now
                      </a>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Schedule summary */}
            {form.scheduledAt && (
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
                <h2 className="text-sm font-semibold text-white mb-2">Summary</h2>
                <dl className="space-y-1.5 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <dt>Platforms selected</dt>
                    <dd className="text-slate-200">{form.platforms.length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Media files</dt>
                    <dd className="text-slate-200">
                      {parseMediaUrls(form.mediaUrlsRaw).length}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Scheduled for</dt>
                    <dd className="text-slate-200">
                      {new Date(form.scheduledAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}
