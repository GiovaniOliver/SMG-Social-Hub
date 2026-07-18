'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  CalendarPlus,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { PlatformIcon } from '@/components/platform-icons'
import { PLATFORMS, PLATFORM_LABELS } from '@/types'
import type { Platform } from '@/types'
import { CONTENT_TYPES } from '@/lib/ai/content-types'
import type { ContentType } from '@/lib/ai/content-types'
import type { GeneratedPost } from '@/lib/ai/content-generator'
import clsx from 'clsx'

// ---------- Types ----------

interface Brand {
  id: string
  name: string
  slug: string
}

// ---------- Character bar ----------

function CharBar({ count, limit }: { count: number; limit: number }) {
  const pct = Math.min(100, (count / limit) * 100)
  const over = count > limit
  const near = pct >= 85 && !over

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className={over ? 'text-red-400' : near ? 'text-yellow-400' : 'text-slate-500'}>
          {count.toLocaleString()} / {limit.toLocaleString()}
        </span>
        {over && <span className="text-red-400">{(count - limit).toLocaleString()} over</span>}
      </div>
      <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={clsx(
            'h-full rounded-full transition-all',
            over ? 'bg-red-500' : near ? 'bg-yellow-400' : 'bg-blue-500'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ---------- Copy button ----------

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <button
      onClick={handleCopy}
      className={clsx(
        'flex items-center gap-1.5 text-xs font-medium transition-colors',
        copied ? 'text-green-400' : 'text-slate-400 hover:text-white',
        className
      )}
      type="button"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ---------- Result card ----------

interface ResultCardProps {
  result: GeneratedPost & { error?: boolean }
  onSchedule: (result: GeneratedPost) => void
}

function ResultCard({ result, onSchedule }: ResultCardProps) {
  const [tipOpen, setTipOpen] = useState(false)
  const hasError = !result.content

  return (
    <div className={clsx(
      'bg-slate-800 border rounded-xl p-4 space-y-3',
      hasError ? 'border-red-700' : 'border-slate-700'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PlatformIcon platform={result.platform} size={22} />
          <span className="text-sm font-semibold text-white">
            {PLATFORM_LABELS[result.platform]}
          </span>
        </div>
        {!hasError && <CopyButton text={result.content} />}
      </div>

      {hasError ? (
        <div className="flex items-start gap-2 text-red-400 text-xs">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{result.tip ?? 'Generation failed.'}</span>
        </div>
      ) : (
        <>
          {/* Content */}
          <div className="bg-slate-900 rounded-lg p-3 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed border border-slate-700/50">
            {result.content}
          </div>

          {/* Char bar */}
          <CharBar count={result.characterCount} limit={result.characterLimit} />

          {/* Media */}
          {result.imageUrl && (
            <img
              src={result.imageUrl}
              alt="Generated visual"
              className="w-full rounded-lg border border-slate-700"
            />
          )}
          {result.videoUrl && (
            <video src={result.videoUrl} controls className="w-full rounded-lg border border-slate-700" />
          )}
          {result.mediaWarning && (
            <p className="text-xs text-yellow-400">Media generation failed: {result.mediaWarning}</p>
          )}

          {/* Tip (collapsible) */}
          {result.tip && (
            <div>
              <button
                onClick={() => setTipOpen((v) => !v)}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                type="button"
              >
                {tipOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                AI note
              </button>
              {tipOpen && (
                <p className="mt-1.5 text-xs text-slate-400 bg-slate-900 rounded px-2.5 py-2 border border-slate-700">
                  {result.tip}
                </p>
              )}
            </div>
          )}

          {/* Schedule button */}
          <button
            onClick={() => onSchedule(result)}
            className="w-full flex items-center justify-center gap-2 btn-secondary text-sm"
            type="button"
          >
            <CalendarPlus size={14} />
            Schedule this post
          </button>
        </>
      )}
    </div>
  )
}

// ---------- Platform chip ----------

function PlatformChip({
  platform,
  selected,
  onToggle,
}: {
  platform: Platform
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      type="button"
      className={clsx(
        'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
        selected
          ? 'border-blue-500/60 bg-blue-500/10 text-white'
          : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-600'
      )}
    >
      <PlatformIcon platform={platform} size={20} />
      {PLATFORM_LABELS[platform]}
    </button>
  )
}

// ---------- Main page ----------

export default function CreatePage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [brandId, setBrandId] = useState('')
  const [contentType, setContentType] = useState<ContentType>('educational')
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(['INSTAGRAM', 'LINKEDIN'])
  const [topic, setTopic] = useState('')
  const [wantImage, setWantImage] = useState(false)
  const [wantVideo, setWantVideo] = useState(false)

  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<GeneratedPost[]>([])

  useEffect(() => {
    fetch('/api/brands')
      .then((r) => r.json())
      .then((json) => {
        const list: Brand[] = json.data ?? []
        setBrands(list)
        if (list.length > 0) setBrandId(list[0].id)
      })
      .catch(() => {})
  }, [])

  function togglePlatform(p: Platform) {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    )
  }

  function toggleImage() {
    setWantImage((v) => {
      const next = !v
      if (next) setWantVideo(false)
      return next
    })
  }

  function toggleVideo() {
    setWantVideo((v) => {
      const next = !v
      if (next) setWantImage(false)
      return next
    })
  }

  async function handleGenerate() {
    if (!brandId || selectedPlatforms.length === 0) return
    setGenerating(true)
    setError(null)
    setResults([])

    try {
      const res = await fetch('/api/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          platforms: selectedPlatforms,
          contentType,
          topic,
          generateImage: wantImage,
          generateVideo: wantVideo,
        }),
      })
      const json = await res.json() as { success: boolean; data?: GeneratedPost[]; error?: string }

      if (!json.success || !json.data) {
        throw new Error(json.error ?? 'Generation failed')
      }
      setResults(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  function handleSchedule(result: GeneratedPost) {
    sessionStorage.setItem('smg_prefill_content', result.content)
    sessionStorage.setItem('smg_prefill_platform', result.platform)
    sessionStorage.setItem('smg_prefill_brandId', brandId)
    const mediaUrl = result.imageUrl ?? result.videoUrl
    if (mediaUrl) sessionStorage.setItem('smg_prefill_media', mediaUrl)
    window.location.href = '/schedule'
  }

  const canGenerate = !!brandId && selectedPlatforms.length > 0 && !generating

  return (
    <div className="min-h-full p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Content Lab</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          AI-generated, platform-adapted post copy based on your brand voice.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ===== LEFT — Controls ===== */}
        <div className="xl:col-span-1 space-y-5">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-5">

            {/* Brand */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Brand
              </label>
              {brands.length === 0 ? (
                <p className="text-slate-500 text-sm">
                  No brands yet.{' '}
                  <Link href="/brands" className="text-blue-400 hover:underline">Create one</Link>
                </p>
              ) : (
                <select
                  value={brandId}
                  onChange={(e) => setBrandId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Content type */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Content Type
              </label>
              <div className="space-y-1.5">
                {(Object.entries(CONTENT_TYPES) as [ContentType, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setContentType(key)}
                    type="button"
                    className={clsx(
                      'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                      contentType === key
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Topic */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Topic / Prompt
                <span className="ml-1 text-slate-600 font-normal normal-case">(optional)</span>
              </label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="e.g. 'How to set up product registration in 60 seconds'"
                className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2.5 resize-none placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-600 mt-1">Leave blank to let AI pick a relevant topic from brand context.</p>
            </div>
          </div>

          {/* Platforms */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
              Platforms ({selectedPlatforms.length} selected)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PLATFORMS.map((p) => (
                <PlatformChip
                  key={p}
                  platform={p}
                  selected={selectedPlatforms.includes(p)}
                  onToggle={() => togglePlatform(p)}
                />
              ))}
            </div>
            {selectedPlatforms.length === 0 && (
              <p className="text-xs text-yellow-400 mt-2">Select at least one platform.</p>
            )}
          </div>

          {/* Media */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
              Media (optional, uses Runware)
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={toggleImage}
                className={clsx(
                  'flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                  wantImage
                    ? 'border-blue-500/60 bg-blue-500/10 text-white'
                    : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-600'
                )}
              >
                Generate image
              </button>
              <button
                type="button"
                onClick={toggleVideo}
                className={clsx(
                  'flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                  wantVideo
                    ? 'border-blue-500/60 bg-blue-500/10 text-white'
                    : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-600'
                )}
              >
                Generate video
              </button>
            </div>
            {wantVideo && (
              <p className="text-xs text-slate-500 mt-2">Video generation can take up to 2 minutes.</p>
            )}
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
            type="button"
          >
            {generating ? (
              <><RefreshCw size={16} className="animate-spin" /> Generating...</>
            ) : results.length > 0 ? (
              <><RefreshCw size={16} /> Regenerate</>
            ) : (
              <><Sparkles size={16} /> Generate Content</>
            )}
          </button>

          {error && (
            <div className="flex items-start gap-2 bg-red-950 border border-red-800 rounded-lg px-3 py-2.5 text-xs text-red-300">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>

        {/* ===== RIGHT — Results ===== */}
        <div className="xl:col-span-2">
          {generating && (
            <div className="grid gap-4 sm:grid-cols-2">
              {selectedPlatforms.map((p) => (
                <div key={p} className="h-56 bg-slate-800 border border-slate-700 rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {!generating && results.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Sparkles size={40} className="text-slate-700 mb-4" />
              <p className="text-slate-400 font-medium">Ready to generate</p>
              <p className="text-slate-500 text-sm mt-1 max-w-xs">
                Select a brand, content type, and platforms — then hit Generate.
              </p>
            </div>
          )}

          {!generating && results.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {results.map((r) => (
                <ResultCard
                  key={r.platform}
                  result={r}
                  onSchedule={handleSchedule}
                />
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
