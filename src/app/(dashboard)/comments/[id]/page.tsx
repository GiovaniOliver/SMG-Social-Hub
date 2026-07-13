'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  SkipForward,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  User,
  Building2,
  Globe,
  Lock,
} from 'lucide-react'
import { PlatformBadge } from '@/components/platform-badge'
import { CopyToClipboard } from '@/components/copy-to-clipboard'
import { RiskBadge } from '@/components/risk-badge'
import type { Platform, CommentStatus, BrandVoice } from '@/types'
import { PLATFORM_LABELS } from '@/types'

// ---------- Types ----------

interface CommentDraft {
  id: string
  opportunityId: string
  content: string
  isApproved: boolean
  createdAt: string
}

interface Opportunity {
  id: string
  brandId: string
  brand: {
    name: string
    voice: string
    context: string
  }
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
  status: CommentStatus
  approvedReply: string | null
  postedAt: string | null
  discoveredAt: string
  updatedAt: string
  drafts: CommentDraft[]
}

interface RiskAssessment {
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  flags: string[]
  requiresHumanReview: boolean
}

interface GeneratedDraft {
  id: string
  content: string
  reasoning: string
  warnings?: string[]
}

// ---------- Status Badge ----------

const STATUS_CONFIG: Record<CommentStatus, { label: string; classes: string }> = {
  PENDING: { label: 'Pending', classes: 'badge-pending' },
  DRAFT_READY: { label: 'Draft Ready', classes: 'badge-draft' },
  APPROVED: { label: 'Approved', classes: 'bg-purple-900 text-purple-300 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium' },
  POSTED: { label: 'Posted', classes: 'badge-published' },
  SKIPPED: { label: 'Skipped', classes: 'badge-skipped' },
}

function StatusBadge({ status }: { status: CommentStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING
  return <span className={config.classes}>{config.label}</span>
}

// ---------- Character counter ----------

function CharCounter({ text, limit }: { text: string; limit: number }) {
  const remaining = limit - text.length
  const overLimit = remaining < 0
  const nearLimit = remaining >= 0 && remaining < 40

  return (
    <span className={`text-xs tabular-nums ${overLimit ? 'text-red-400' : nearLimit ? 'text-yellow-400' : 'text-slate-500'}`}>
      {text.length}/{limit}
    </span>
  )
}

// ---------- Platform char limits ----------

const PLATFORM_CHAR_LIMITS: Record<string, number> = {
  TWITTER: 280,
  INSTAGRAM: 2200,
  FACEBOOK: 8000,
  LINKEDIN: 1250,
  TIKTOK: 2200,
  YOUTUBE: 10000,
  REDDIT: 10000,
}

// ---------- Helper: parse voice ----------

function parseVoice(raw: string): BrandVoice {
  try {
    const parsed = JSON.parse(raw) as Partial<BrandVoice>
    return {
      tone: parsed.tone ?? '',
      personality: parsed.personality ?? '',
      avoid: Array.isArray(parsed.avoid) ? parsed.avoid : [],
      cta: parsed.cta,
    }
  } catch {
    return { tone: '', personality: '', avoid: [] }
  }
}

// ---------- Main Page ----------

export default function CommentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [opportunity, setOpportunity] = useState<Opportunity | null>(null)
  const [loadingPage, setLoadingPage] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)

  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  const [currentDraft, setCurrentDraft] = useState<GeneratedDraft | null>(null)
  const [riskAssessment, setRiskAssessment] = useState<RiskAssessment | null>(null)
  const [replyText, setReplyText] = useState('')
  const [reasoningOpen, setReasoningOpen] = useState(false)

  const [approving, setApproving] = useState(false)
  const [approveError, setApproveError] = useState<string | null>(null)

  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)

  const [skipping, setSkipping] = useState(false)

  const fetchOpportunity = useCallback(async () => {
    const res = await fetch(`/api/comments/${id}`, { cache: 'no-store' })

    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: 'Unknown error' })) as { error?: string }
      throw new Error(json.error ?? `HTTP ${res.status}`)
    }

    const json = await res.json() as { success: boolean; data?: Opportunity; error?: string }
    if (!json.success || !json.data) {
      throw new Error(json.error ?? 'Failed to load opportunity')
    }
    return json.data
  }, [id])

  useEffect(() => {
    setLoadingPage(true)
    fetchOpportunity()
      .then((data) => {
        setOpportunity(data)
        // If there's already an approved reply, pre-fill the textarea
        if (data.approvedReply) {
          setReplyText(data.approvedReply)
        }
        // If there are existing drafts, load the most recent one
        if (data.drafts.length > 0 && !data.approvedReply) {
          const latest = data.drafts[0]
          setCurrentDraft({
            id: latest.id,
            content: latest.content,
            reasoning: '',
            warnings: undefined,
          })
          setReplyText(latest.content)
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to load'
        setPageError(msg)
      })
      .finally(() => setLoadingPage(false))
  }, [fetchOpportunity])

  const platform = opportunity?.platform.toUpperCase() ?? 'TWITTER'
  const charLimit = PLATFORM_CHAR_LIMITS[platform] ?? 400

  async function handleGenerate() {
    if (!opportunity) return
    setGenerating(true)
    setGenError(null)
    setReasoningOpen(false)

    try {
      const res = await fetch(`/api/comments/${id}/generate-reply`, {
        method: 'POST',
      })
      const json = await res.json() as {
        success: boolean
        data?: {
          draft: GeneratedDraft
          riskAssessment: RiskAssessment
        }
        error?: string
      }

      if (!json.success || !json.data) {
        throw new Error(json.error ?? 'Generation failed')
      }

      const { draft, riskAssessment: risk } = json.data
      setCurrentDraft(draft)
      setRiskAssessment(risk)
      setReplyText(draft.content)

      // Refresh opportunity to get updated status + new draft in list
      const refreshed = await fetchOpportunity()
      setOpportunity(refreshed)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Generation failed'
      setGenError(msg)
    } finally {
      setGenerating(false)
    }
  }

  async function handleApprove() {
    if (!opportunity) return
    setApproving(true)
    setApproveError(null)

    const body = currentDraft && replyText === currentDraft.content
      ? { draftId: currentDraft.id }
      : { draftId: currentDraft?.id, customReply: replyText }

    try {
      const res = await fetch(`/api/comments/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json() as { success: boolean; error?: string }

      if (!json.success) throw new Error(json.error ?? 'Approval failed')

      const refreshed = await fetchOpportunity()
      setOpportunity(refreshed)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Approval failed'
      setApproveError(msg)
    } finally {
      setApproving(false)
    }
  }

  async function handlePost() {
    if (!opportunity) return
    setPosting(true)
    setPostError(null)

    try {
      const res = await fetch(`/api/comments/${id}/post`, { method: 'POST' })
      const json = await res.json() as { success: boolean; error?: string }

      if (!json.success) throw new Error(json.error ?? 'Post failed')

      const refreshed = await fetchOpportunity()
      setOpportunity(refreshed)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Post failed'
      setPostError(msg)
    } finally {
      setPosting(false)
    }
  }

  async function handleSkip() {
    if (!opportunity) return
    setSkipping(true)

    try {
      const res = await fetch(`/api/comments/${id}/skip`, { method: 'POST' })
      const json = await res.json() as { success: boolean; error?: string }

      if (!json.success) throw new Error(json.error ?? 'Skip failed')

      router.push('/comments')
    } catch {
      setSkipping(false)
    }
  }

  // ---------- Loading / Error ----------

  if (loadingPage) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw size={18} className="animate-spin" />
          <span>Loading opportunity...</span>
        </div>
      </div>
    )
  }

  if (pageError || !opportunity) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Link href="/comments" className="flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-6 transition-colors">
          <ArrowLeft size={16} /> Back to Comments
        </Link>
        <div className="card border-red-700 bg-red-950">
          <div className="flex items-center gap-2 text-red-400 mb-2">
            <AlertTriangle size={18} />
            <span className="font-medium">Failed to load</span>
          </div>
          <p className="text-slate-400 text-sm">{pageError ?? 'Opportunity not found'}</p>
        </div>
      </div>
    )
  }

  const voice = parseVoice(opportunity.brand.voice)
  const isActionable = !['POSTED', 'SKIPPED'].includes(opportunity.status)
  const isApproved = opportunity.status === 'APPROVED' || opportunity.status === 'POSTED'
  const platformLabel = PLATFORM_LABELS[opportunity.platform as Platform] ?? opportunity.platform

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/comments"
          className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Comments
        </Link>
        <StatusBadge status={opportunity.status} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ===== LEFT COLUMN — Context ===== */}
        <div className="space-y-4">

          {/* Platform + Channel Type */}
          <div className="flex items-center gap-2 flex-wrap">
            <PlatformBadge platform={opportunity.platform} />
            {opportunity.isOwned ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-900 border border-blue-700 text-blue-300 text-xs font-medium">
                <Lock size={11} />
                Owned Channel
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-700 border border-slate-600 text-slate-300 text-xs font-medium">
                <Globe size={11} />
                External Community
              </span>
            )}
          </div>

          {/* Post Info */}
          <div className="card">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Post Context</h3>

            {opportunity.postTitle && (
              <p className="text-white font-medium text-sm mb-2">{opportunity.postTitle}</p>
            )}

            <a
              href={opportunity.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-xs mb-3 transition-colors break-all"
            >
              <ExternalLink size={12} className="flex-shrink-0" />
              <span className="truncate">{opportunity.postUrl}</span>
            </a>

            {opportunity.postContent && (
              <div className="bg-slate-900 rounded-md p-3 text-sm text-slate-300 leading-relaxed">
                {opportunity.postContent}
              </div>
            )}
          </div>

          {/* Comment */}
          {opportunity.commentText && (
            <div className="card">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Comment to Reply To</h3>

              {opportunity.authorName && (
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 bg-slate-700 rounded-full flex items-center justify-center flex-shrink-0">
                    <User size={14} className="text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{opportunity.authorName}</p>
                    {opportunity.authorHandle && (
                      <p className="text-xs text-slate-500">@{opportunity.authorHandle}</p>
                    )}
                  </div>
                </div>
              )}

              <blockquote className="border-l-2 border-blue-500 pl-3 text-slate-200 text-sm leading-relaxed italic">
                {opportunity.commentText}
              </blockquote>
            </div>
          )}

          {/* Relevance Note */}
          {opportunity.relevanceNote && (
            <div className="card border-yellow-800 bg-yellow-950/20">
              <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wide mb-1">Why This Matters</p>
              <p className="text-sm text-slate-300">{opportunity.relevanceNote}</p>
            </div>
          )}

          {/* Brand Info */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <Building2 size={15} className="text-slate-400" />
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Brand</h3>
            </div>

            <p className="text-white font-medium text-sm mb-3">{opportunity.brand.name}</p>

            {voice.tone && (
              <p className="text-xs text-slate-400 mb-1">
                <span className="text-slate-500">Tone:</span> {voice.tone}
              </p>
            )}
            {voice.personality && (
              <p className="text-xs text-slate-400 mb-2">
                <span className="text-slate-500">Personality:</span> {voice.personality}
              </p>
            )}

            {voice.avoid.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-1.5">Avoid:</p>
                <div className="flex flex-wrap gap-1.5">
                  {voice.avoid.map((item) => (
                    <span
                      key={item}
                      className="px-2 py-0.5 bg-red-900/40 border border-red-800 text-red-400 text-xs rounded-md"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Post Style Reminder */}
          <div className="card border-slate-600">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Reply Style Guide</p>
            <ul className="space-y-1.5 text-xs">
              <li className="flex items-start gap-2 text-slate-300">
                <span className="text-green-400 mt-0.5">✓</span>
                Start with the problem they&apos;re having
              </li>
              <li className="flex items-start gap-2 text-slate-300">
                <span className="text-green-400 mt-0.5">✓</span>
                Give a 2–4 step answer
              </li>
              <li className="flex items-start gap-2 text-slate-300">
                <span className="text-red-400 mt-0.5">✗</span>
                Don&apos;t drop product link in first comment
              </li>
              <li className="flex items-start gap-2 text-slate-300">
                <span className="text-red-400 mt-0.5">✗</span>
                Don&apos;t fake urgency or make legal promises
              </li>
              <li className="flex items-start gap-2 text-slate-400">
                <span className="text-slate-500 mt-0.5">→</span>
                Only mention {opportunity.brand.name} if they directly ask how to stay organized
              </li>
            </ul>
          </div>
        </div>

        {/* ===== RIGHT COLUMN — Reply Generator ===== */}
        <div className="space-y-4">

          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={16} className="text-blue-400" />
              <h2 className="text-sm font-semibold text-white">Generate AI Reply</h2>
            </div>

            {/* Current Status Action Prompt */}
            <div className={`rounded-md px-3 py-2 mb-4 text-xs font-medium ${
              opportunity.status === 'PENDING' ? 'bg-yellow-900/30 text-yellow-300 border border-yellow-800' :
              opportunity.status === 'DRAFT_READY' ? 'bg-blue-900/30 text-blue-300 border border-blue-800' :
              opportunity.status === 'APPROVED' ? 'bg-purple-900/30 text-purple-300 border border-purple-800' :
              opportunity.status === 'POSTED' ? 'bg-green-900/30 text-green-300 border border-green-800' :
              'bg-slate-800 text-slate-400 border border-slate-700'
            }`}>
              {opportunity.status === 'PENDING' && 'Click "Generate Reply" to draft an AI response.'}
              {opportunity.status === 'DRAFT_READY' && 'Review the draft below, edit if needed, then approve.'}
              {opportunity.status === 'APPROVED' && opportunity.isOwned && 'Reply approved. Click "Post Reply" to publish it.'}
              {opportunity.status === 'APPROVED' && !opportunity.isOwned && 'Reply approved. Copy and paste it manually on ' + platformLabel + '.'}
              {opportunity.status === 'POSTED' && 'Reply has been posted successfully.'}
              {opportunity.status === 'SKIPPED' && 'This opportunity was skipped.'}
            </div>

            {/* Generate / Regenerate Button */}
            {isActionable && (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="btn-primary w-full flex items-center justify-center gap-2 mb-4"
                type="button"
              >
                {generating ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    Generating...
                  </>
                ) : currentDraft || opportunity.drafts.length > 0 ? (
                  <>
                    <RefreshCw size={15} />
                    Regenerate Reply
                  </>
                ) : (
                  <>
                    <Sparkles size={15} />
                    Generate Reply
                  </>
                )}
              </button>
            )}

            {genError && (
              <div className="flex items-start gap-2 bg-red-950 border border-red-800 rounded-md px-3 py-2 mb-4">
                <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-red-300 text-xs">{genError}</p>
              </div>
            )}

            {/* Warnings */}
            {currentDraft?.warnings && currentDraft.warnings.length > 0 && (
              <div className="bg-yellow-950/30 border border-yellow-800 rounded-md px-3 py-2 mb-4 space-y-1">
                {currentDraft.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <AlertTriangle size={13} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                    <p className="text-yellow-300 text-xs">{w}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Risk Assessment */}
            {riskAssessment && (
              <div className="mb-4">
                <p className="text-xs text-slate-500 mb-2">Risk Assessment</p>
                <RiskBadge
                  level={riskAssessment.riskLevel}
                  flags={riskAssessment.flags}
                  showFlags={riskAssessment.flags.length > 0}
                />
              </div>
            )}

            {/* Reply Textarea */}
            {(currentDraft || opportunity.approvedReply || opportunity.drafts.length > 0) && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-400">
                    {isApproved ? 'Approved Reply' : 'Draft Reply'} — edit before approving
                  </label>
                  <CharCounter text={replyText} limit={charLimit} />
                </div>

                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  readOnly={opportunity.status === 'POSTED' || opportunity.status === 'SKIPPED'}
                  rows={5}
                  className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2.5 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-60"
                  placeholder="Reply will appear here after generation..."
                  maxLength={charLimit + 100}
                />
              </div>
            )}

            {/* Reasoning (collapsible) */}
            {currentDraft?.reasoning && (
              <div className="mb-4">
                <button
                  onClick={() => setReasoningOpen((prev) => !prev)}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  type="button"
                >
                  {reasoningOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  AI Reasoning
                </button>
                {reasoningOpen && (
                  <p className="mt-2 text-xs text-slate-400 bg-slate-900 rounded-md px-3 py-2 border border-slate-700 leading-relaxed">
                    {currentDraft.reasoning}
                  </p>
                )}
              </div>
            )}

            {/* Action Buttons */}
            {isActionable && replyText.trim().length > 0 && opportunity.status !== 'APPROVED' && (
              <div className="space-y-2">
                {approveError && (
                  <div className="flex items-start gap-2 bg-red-950 border border-red-800 rounded-md px-3 py-2">
                    <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                    <p className="text-red-300 text-xs">{approveError}</p>
                  </div>
                )}

                <button
                  onClick={handleApprove}
                  disabled={approving || replyText.length > charLimit}
                  className="w-full flex items-center justify-center gap-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                  type="button"
                >
                  {approving ? (
                    <><RefreshCw size={15} className="animate-spin" /> Approving...</>
                  ) : (
                    <><CheckCircle2 size={15} /> Approve Reply</>
                  )}
                </button>
              </div>
            )}

            {/* Post-Approval Actions */}
            {opportunity.status === 'APPROVED' && opportunity.approvedReply && (
              <div className="space-y-3">
                {opportunity.isOwned ? (
                  <>
                    {postError && (
                      <div className="flex items-start gap-2 bg-red-950 border border-red-800 rounded-md px-3 py-2">
                        <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                        <p className="text-red-300 text-xs">{postError}</p>
                      </div>
                    )}
                    <button
                      onClick={handlePost}
                      disabled={posting}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                      type="button"
                    >
                      {posting ? (
                        <><RefreshCw size={15} className="animate-spin" /> Posting...</>
                      ) : (
                        <><ExternalLink size={15} /> Post Reply</>
                      )}
                    </button>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-slate-900 border border-slate-700 rounded-md px-3 py-2.5">
                      <p className="text-xs text-slate-400 mb-1">Manual posting required:</p>
                      <p className="text-xs text-slate-300">
                        Log into <span className="text-white font-medium">{platformLabel}</span> and paste this reply manually on the post.
                      </p>
                    </div>

                    <CopyToClipboard
                      text={opportunity.approvedReply}
                      label="Copy Reply to Clipboard"
                      className="w-full flex items-center justify-center gap-2 btn-secondary"
                    />

                    <button
                      onClick={handlePost}
                      disabled={posting}
                      className="w-full flex items-center justify-center gap-2 btn-secondary text-sm"
                      type="button"
                    >
                      {posting ? (
                        <><RefreshCw size={15} className="animate-spin" /> Updating...</>
                      ) : (
                        <><CheckCircle2 size={15} /> Mark as Posted</>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* POSTED confirmation */}
            {opportunity.status === 'POSTED' && (
              <div className="bg-green-900/30 border border-green-700 rounded-md px-3 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 size={15} className="text-green-400" />
                  <span className="text-green-300 text-sm font-medium">Reply Posted</span>
                </div>
                {opportunity.postedAt && (
                  <p className="text-xs text-slate-400">
                    {new Date(opportunity.postedAt).toLocaleString()}
                  </p>
                )}
                {opportunity.approvedReply && (
                  <CopyToClipboard
                    text={opportunity.approvedReply}
                    label="Copy for reference"
                    className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  />
                )}
              </div>
            )}

            {/* Skip Button */}
            {isActionable && opportunity.status !== 'APPROVED' && (
              <button
                onClick={handleSkip}
                disabled={skipping}
                className="w-full flex items-center justify-center gap-2 text-slate-500 hover:text-slate-300 text-sm py-2 transition-colors mt-2"
                type="button"
              >
                <SkipForward size={14} />
                {skipping ? 'Skipping...' : 'Skip This Post'}
              </button>
            )}
          </div>

          {/* Previous Drafts */}
          {opportunity.drafts.length > 1 && (
            <div className="card">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                Previous Drafts ({opportunity.drafts.length})
              </h3>
              <div className="space-y-2">
                {opportunity.drafts.map((draft, i) => (
                  <div
                    key={draft.id}
                    className="bg-slate-900 rounded-md p-3 border border-slate-700 cursor-pointer hover:border-slate-500 transition-colors"
                    onClick={() => {
                      if (opportunity.status !== 'POSTED' && opportunity.status !== 'SKIPPED') {
                        setCurrentDraft({ id: draft.id, content: draft.content, reasoning: '' })
                        setReplyText(draft.content)
                      }
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-500">Draft #{opportunity.drafts.length - i}</span>
                      {draft.isApproved && (
                        <span className="text-xs text-green-400 flex items-center gap-1">
                          <CheckCircle2 size={11} /> Approved
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 line-clamp-2">{draft.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
