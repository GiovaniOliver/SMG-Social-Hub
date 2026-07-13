'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw,
  PlusCircle,
  MessageSquare,
  Clock,
  CheckCircle2,
  Send,
  XCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import clsx from 'clsx'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommentDraft {
  id: string
  content: string
  isApproved: boolean
  createdAt: string
}

interface Opportunity {
  id: string
  brandId: string
  platform: string
  postUrl: string
  postTitle: string | null
  postContent: string | null
  commentId: string | null
  commentText: string | null
  authorName: string | null
  authorHandle: string | null
  isOwned: boolean
  relevanceNote: string | null
  status: string
  approvedReply: string | null
  postedAt: string | null
  discoveredAt: string
  updatedAt: string
  drafts: CommentDraft[]
}

interface Brand {
  id: string
  name: string
  slug: string
}

interface StatsData {
  pending: number
  draftReady: number
  approved: number
  postedTotal: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type PlatformKey =
  | 'ALL'
  | 'FACEBOOK'
  | 'INSTAGRAM'
  | 'TWITTER'
  | 'LINKEDIN'
  | 'TIKTOK'
  | 'YOUTUBE'
  | 'REDDIT'

const ALL_PLATFORMS: PlatformKey[] = [
  'ALL',
  'FACEBOOK',
  'INSTAGRAM',
  'TWITTER',
  'LINKEDIN',
  'TIKTOK',
  'YOUTUBE',
  'REDDIT',
]

const PLATFORM_LABELS: Record<PlatformKey, string> = {
  ALL: 'All',
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  TWITTER: 'Twitter / X',
  LINKEDIN: 'LinkedIn',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
  REDDIT: 'Reddit',
}

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'DRAFT_READY', label: 'Draft Ready' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'POSTED', label: 'Posted' },
  { value: 'SKIPPED', label: 'Skipped' },
]

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20',
  DRAFT_READY: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  APPROVED: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
  POSTED: 'bg-slate-500/15 text-slate-400 border border-slate-600/30',
  SKIPPED: 'bg-slate-700/40 text-slate-500 border border-slate-700/30',
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  DRAFT_READY: 'Draft Ready',
  APPROVED: 'Approved',
  POSTED: 'Posted',
  SKIPPED: 'Skipped',
}

const PLATFORM_DOT_COLORS: Record<string, string> = {
  FACEBOOK: 'bg-blue-500',
  INSTAGRAM: 'bg-pink-500',
  TWITTER: 'bg-sky-400',
  LINKEDIN: 'bg-blue-600',
  TIKTOK: 'bg-slate-300',
  YOUTUBE: 'bg-red-500',
  REDDIT: 'bg-orange-500',
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function truncate(str: string | null | undefined, maxLen: number): string {
  if (!str) return ''
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str
}

function formatRelative(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ---------------------------------------------------------------------------
// Add URL modal
// ---------------------------------------------------------------------------

interface AddUrlModalProps {
  brandId: string
  onClose: () => void
  onAdded: () => void
}

// Platforms whose comments are fetched from a single pasted post URL/id via the
// scan endpoint, rather than recorded as a bare entry to monitor manually.
const ID_DRIVEN_PLATFORMS = new Set(['LINKEDIN', 'TIKTOK'])

const ID_DRIVEN_HINTS: Record<string, { placeholder: string; hint: string }> = {
  LINKEDIN: {
    placeholder: 'Post URL or urn:li:activity:…',
    hint: 'Paste a LinkedIn post URL or its urn:li:activity / share id — we’ll pull the comments on that post.',
  },
  TIKTOK: {
    placeholder: 'Video URL or numeric video id',
    hint: 'Paste a TikTok video URL (…/video/123…) or the numeric video id — we’ll pull the comments on that video.',
  },
}

function AddUrlModal({ brandId, onClose, onAdded }: AddUrlModalProps) {
  const [platform, setPlatform] = useState<string>('FACEBOOK')
  const [postUrl, setPostUrl] = useState('')
  const [relevanceNote, setRelevanceNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const isIdDriven = ID_DRIVEN_PLATFORMS.has(platform)
  const idHint = ID_DRIVEN_HINTS[platform]

  async function submitBareUrl() {
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brandId,
        platform,
        postUrl,
        relevanceNote: relevanceNote.trim() || undefined,
      }),
    })
    const json = await res.json()
    if (!json.success) throw new Error(json.error ?? 'Failed to add URL')
    onAdded()
    onClose()
  }

  async function submitIdDrivenScan() {
    const res = await fetch('/api/comments/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brandId,
        additionalUrls: [
          {
            platform,
            url: postUrl.trim(),
            relevanceNote: relevanceNote.trim() || undefined,
          },
        ],
      }),
    })
    const json = await res.json()
    if (!json.success) throw new Error(json.error ?? 'Failed to fetch comments')

    const created: number = json.data?.created ?? 0
    onAdded()
    if (created > 0) {
      setResult(
        `Fetched ${created} new comment opportunit${created !== 1 ? 'ies' : 'y'} from this post.`
      )
    } else {
      setResult(
        `No new comments found. Check the ${PLATFORM_LABELS[platform as PlatformKey]} id/URL and that the account is connected.`
      )
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setResult(null)
    setSubmitting(true)
    try {
      if (isIdDriven) {
        await submitIdDrivenScan()
      } else {
        await submitBareUrl()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-white font-semibold text-base mb-5">
          {isIdDriven ? 'Fetch Comments from a Post' : 'Monitor a Post URL'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Platform</label>
            <select
              value={platform}
              onChange={(e) => {
                setPlatform(e.target.value)
                setResult(null)
                setError(null)
              }}
              className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ALL_PLATFORMS.filter((p) => p !== 'ALL').map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              {isIdDriven ? 'Post URL or ID' : 'Post URL'}
            </label>
            <input
              type={isIdDriven ? 'text' : 'url'}
              value={postUrl}
              onChange={(e) => setPostUrl(e.target.value)}
              required
              placeholder={idHint?.placeholder ?? 'https://...'}
              className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-md px-3 py-2 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {idHint && (
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{idHint.hint}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Relevance Note{' '}
              <span className="text-slate-600 font-normal">(optional)</span>
            </label>
            <textarea
              value={relevanceNote}
              onChange={(e) => setRelevanceNote(e.target.value)}
              rows={2}
              placeholder="Why is this post relevant?"
              className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-md px-3 py-2 placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
              {error}
            </p>
          )}

          {result && (
            <p className="text-emerald-300 text-xs bg-emerald-500/10 border border-emerald-500/20 rounded px-3 py-2">
              {result}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary">
              {result ? 'Close' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={submitting || !postUrl.trim()}
              className="flex-1 btn-primary"
            >
              {submitting
                ? isIdDriven
                  ? 'Fetching…'
                  : 'Adding…'
                : isIdDriven
                  ? 'Fetch Comments'
                  : 'Add URL'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Opportunity card
// ---------------------------------------------------------------------------

interface OpportunityCardProps {
  opportunity: Opportunity
  onStatusChange: (id: string, status: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

function OpportunityCard({ opportunity, onStatusChange, onDelete }: OpportunityCardProps) {
  const [busy, setBusy] = useState(false)

  async function act(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const dotColor = PLATFORM_DOT_COLORS[opportunity.platform] ?? 'bg-slate-500'
  const platformLabel =
    PLATFORM_LABELS[opportunity.platform as PlatformKey] ?? opportunity.platform

  const isActionable =
    opportunity.status !== 'SKIPPED' && opportunity.status !== 'POSTED'

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex flex-col gap-3 hover:border-slate-600 transition-colors">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', dotColor)} />
          <span className="text-xs font-semibold text-white">{platformLabel}</span>
          <span
            className={clsx(
              'text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0',
              opportunity.isOwned
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-slate-600/40 text-slate-400'
            )}
          >
            {opportunity.isOwned ? 'Owned' : 'External'}
          </span>
        </div>

        <span
          className={clsx(
            'text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0',
            STATUS_STYLES[opportunity.status] ?? STATUS_STYLES.PENDING
          )}
        >
          {STATUS_LABELS[opportunity.status] ?? opportunity.status}
        </span>
      </div>

      {/* Post info */}
      {(opportunity.postTitle || opportunity.postContent) && (
        <div className="text-xs text-slate-400 leading-relaxed space-y-0.5">
          {opportunity.postTitle && (
            <p className="font-medium text-slate-300">
              {truncate(opportunity.postTitle, 80)}
            </p>
          )}
          {opportunity.postContent && (
            <p>{truncate(opportunity.postContent, 120)}</p>
          )}
        </div>
      )}

      {/* Comment blockquote */}
      {opportunity.commentText && (
        <blockquote className="border-l-2 border-blue-500/30 pl-3 text-xs text-slate-300 italic leading-relaxed">
          {truncate(opportunity.commentText, 200)}
        </blockquote>
      )}

      {/* Author */}
      {opportunity.authorName && (
        <p className="text-xs text-slate-500">
          <span className="text-slate-400">{opportunity.authorName}</span>
          {opportunity.authorHandle && (
            <span className="ml-1 text-slate-600">({opportunity.authorHandle})</span>
          )}
        </p>
      )}

      {/* Relevance */}
      {opportunity.relevanceNote && (
        <p className="text-xs text-amber-400/80 bg-amber-500/5 border border-amber-500/10 rounded px-2.5 py-2 leading-relaxed">
          {opportunity.relevanceNote}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-700/50">
        <span className="text-xs text-slate-600">{formatRelative(opportunity.discoveredAt)}</span>

        <div className="flex items-center gap-1">
          {/* Open post link */}
          <a
            href={opportunity.postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-slate-600 hover:text-slate-300 transition-colors rounded"
            title="Open post"
          >
            <ExternalLink size={13} />
          </a>

          {/* Skip */}
          {isActionable && (
            <button
              onClick={() => act(() => onStatusChange(opportunity.id, 'SKIPPED'))}
              disabled={busy}
              title="Skip"
              className="p-1.5 text-slate-600 hover:text-red-400 transition-colors rounded disabled:opacity-30"
            >
              <XCircle size={13} />
            </button>
          )}

          {/* Mark posted (for APPROVED) */}
          {opportunity.status === 'APPROVED' && (
            <button
              onClick={() => act(() => onStatusChange(opportunity.id, 'POSTED'))}
              disabled={busy}
              title="Mark as posted"
              className="p-1.5 text-slate-600 hover:text-emerald-400 transition-colors rounded disabled:opacity-30"
            >
              <Send size={13} />
            </button>
          )}

          {/* Reply CTA */}
          <a
            href={`/comments/${opportunity.id}`}
            className="text-xs px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
          >
            Reply
          </a>

          {/* Delete */}
          <button
            onClick={() => act(() => onDelete(opportunity.id))}
            disabled={busy}
            title="Remove"
            className="p-1.5 text-slate-700 hover:text-red-500 transition-colors rounded disabled:opacity-30"
          >
            <XCircle size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stats strip
// ---------------------------------------------------------------------------

function StatsStrip({ stats }: { stats: StatsData }) {
  const items = [
    { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-yellow-400' },
    { label: 'Draft Ready', value: stats.draftReady, icon: MessageSquare, color: 'text-blue-400' },
    { label: 'Approved', value: stats.approved, icon: CheckCircle2, color: 'text-emerald-400' },
    { label: 'Posted', value: stats.postedTotal, icon: Send, color: 'text-slate-400' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Icon size={13} className={color} />
            <span className="text-xs text-slate-500">{label}</span>
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

const PAGE_SIZE = 18

export default function CommentsPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [selectedBrandId, setSelectedBrandId] = useState<string>('')
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [stats, setStats] = useState<StatsData>({
    pending: 0,
    draftReady: 0,
    approved: 0,
    postedTotal: 0,
  })
  const [activePlatform, setActivePlatform] = useState<string>('ALL')
  const [activeStatus, setActiveStatus] = useState<string>('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [scanMessage, setScanMessage] = useState<{ text: string; ok: boolean } | null>(null)

  // Load brands
  useEffect(() => {
    fetch('/api/brands')
      .then((r) => r.json())
      .then((json) => {
        const list: Brand[] = json.data ?? []
        setBrands(list)
        if (list.length > 0) setSelectedBrandId(list[0].id)
      })
      .catch(() => {})
  }, [])

  const loadOpportunities = useCallback(async () => {
    if (!selectedBrandId) return
    setLoading(true)
    try {
      const qs = new URLSearchParams({
        brandId: selectedBrandId,
        page: String(page),
        limit: String(PAGE_SIZE),
      })
      if (activePlatform !== 'ALL') qs.set('platform', activePlatform)
      if (activeStatus) qs.set('status', activeStatus)

      const res = await fetch(`/api/comments?${qs.toString()}`)
      const json = await res.json()
      if (json.success) {
        setOpportunities(json.data ?? [])
        setTotal(json.meta?.total ?? 0)
      }
    } catch {
      // swallow
    } finally {
      setLoading(false)
    }
  }, [selectedBrandId, page, activePlatform, activeStatus])

  const loadStats = useCallback(async () => {
    if (!selectedBrandId) return
    try {
      const [pendingJson, draftJson, approvedJson, postedJson] = await Promise.all(
        ['PENDING', 'DRAFT_READY', 'APPROVED', 'POSTED'].map((s) =>
          fetch(`/api/comments?brandId=${selectedBrandId}&status=${s}&limit=1`).then((r) =>
            r.json()
          )
        )
      )
      setStats({
        pending: pendingJson.meta?.total ?? 0,
        draftReady: draftJson.meta?.total ?? 0,
        approved: approvedJson.meta?.total ?? 0,
        postedTotal: postedJson.meta?.total ?? 0,
      })
    } catch {
      // swallow
    }
  }, [selectedBrandId])

  useEffect(() => {
    loadOpportunities()
    loadStats()
  }, [loadOpportunities, loadStats])

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [activePlatform, activeStatus, selectedBrandId])

  async function handleScan() {
    if (!selectedBrandId || scanning) return
    setScanning(true)
    setScanMessage(null)
    try {
      const res = await fetch('/api/comments/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: selectedBrandId }),
      })
      const json = await res.json()
      if (json.success) {
        const { created, platforms } = json.data as { created: number; platforms: string[] }
        setScanMessage({
          ok: true,
          text:
            created > 0
              ? `Found ${created} new opportunit${created !== 1 ? 'ies' : 'y'} across: ${platforms.join(', ')}.`
              : 'Scan complete — no new opportunities found.',
        })
        await Promise.all([loadOpportunities(), loadStats()])
      } else {
        setScanMessage({ ok: false, text: json.error ?? 'Scan failed.' })
      }
    } catch {
      setScanMessage({ ok: false, text: 'Scan failed — check your platform connections.' })
    } finally {
      setScanning(false)
    }
  }

  async function handleStatusChange(id: string, status: string) {
    try {
      await fetch(`/api/comments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      await Promise.all([loadOpportunities(), loadStats()])
    } catch {
      // swallow
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this opportunity?')) return
    try {
      await fetch(`/api/comments/${id}`, { method: 'DELETE' })
      await Promise.all([loadOpportunities(), loadStats()])
    } catch {
      // swallow
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="min-h-full p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Comment Monitor</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Surface engagement opportunities and manage replies across all platforms.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowAddModal(true)}
            disabled={!selectedBrandId}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <PlusCircle size={14} />
            Add URL
          </button>
          <button
            onClick={handleScan}
            disabled={scanning || !selectedBrandId}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <RefreshCw size={14} className={clsx(scanning && 'animate-spin')} />
            {scanning ? 'Scanning…' : 'Scan Now'}
          </button>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Brand selector */}
        <select
          value={selectedBrandId}
          onChange={(e) => setSelectedBrandId(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={activeStatus}
          onChange={(e) => setActiveStatus(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Platform tabs */}
      <div className="flex items-center gap-1 flex-wrap border-b border-slate-700/50 pb-1">
        {ALL_PLATFORMS.map((p) => (
          <button
            key={p}
            onClick={() => setActivePlatform(p)}
            className={clsx(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              activePlatform === p
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            )}
          >
            {PLATFORM_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Scan message */}
      {scanMessage && (
        <div
          className={clsx(
            'flex items-center justify-between gap-2 rounded-md px-4 py-2.5 text-sm border',
            scanMessage.ok
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-red-500/10 border-red-500/20 text-red-300'
          )}
        >
          <span>{scanMessage.text}</span>
          <button
            onClick={() => setScanMessage(null)}
            className="text-current opacity-50 hover:opacity-100 text-xs flex-shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Stats */}
      <StatsStrip stats={stats} />

      {/* Grid */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-52 bg-slate-800 border border-slate-700 rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : opportunities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <MessageSquare size={40} className="text-slate-700 mb-4" />
          <p className="text-slate-400 font-medium">No opportunities found</p>
          <p className="text-slate-500 text-sm mt-1 max-w-xs">
            Run a scan or add a post URL manually to start monitoring conversations.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {opportunities.map((opp) => (
              <OpportunityCard
                key={opp.id}
                opportunity={opp}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-700/50 pt-4">
              <p className="text-xs text-slate-500">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs text-slate-500 w-14 text-center">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add URL modal */}
      {showAddModal && selectedBrandId && (
        <AddUrlModal
          brandId={selectedBrandId}
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            loadOpportunities()
            loadStats()
          }}
        />
      )}
    </div>
  )
}
