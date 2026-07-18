'use client'

import { useState } from 'react'
import clsx from 'clsx'
import { RefreshCw, Trash2, Loader2, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { PlatformIcon } from '@/components/platform-icons'
import { PLATFORMS } from '@/types'
import type { Platform } from '@/types'

export interface ContentPiece {
  id: string
  day: number
  platform: string
  format: string
  title: string
  hook: string
  body: string
  visualPrompt: string
  status: string
}

interface Props {
  piece: ContentPiece
  onUpdated: (piece: ContentPiece) => void
  onDeleted: (id: string) => void
}

function isPlatform(value: string): value is Platform {
  return (PLATFORMS as string[]).includes(value)
}

export function ContentPieceCard({ piece, onUpdated, onDeleted }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    title: piece.title,
    hook: piece.hook,
    body: piece.body,
    visualPrompt: piece.visualPrompt,
  })
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const failed = piece.status === 'failed'

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/content-pieces/${piece.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Failed to save')
      onUpdated(json.data)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleRegenerate() {
    setRegenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/content-pieces/${piece.id}/regenerate`, { method: 'POST' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Failed to regenerate')
      onUpdated(json.data)
      setDraft({
        title: json.data.title,
        hook: json.data.hook,
        body: json.data.body,
        visualPrompt: json.data.visualPrompt,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate')
    } finally {
      setRegenerating(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this content piece?')) return
    try {
      const res = await fetch(`/api/content-pieces/${piece.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Failed to delete')
      onDeleted(piece.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  return (
    <div
      className={clsx(
        'bg-slate-800 border rounded-xl p-4 space-y-3',
        failed ? 'border-red-800' : 'border-slate-700'
      )}
    >
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded((v) => !v)}
          type="button"
          className="flex items-center gap-2 text-left min-w-0 flex-1"
        >
          {expanded ? (
            <ChevronDown size={14} className="text-slate-500 flex-shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-slate-500 flex-shrink-0" />
          )}
          {isPlatform(piece.platform) && <PlatformIcon platform={piece.platform} size={18} />}
          <span className="text-sm font-medium text-white truncate">{piece.title}</span>
          <span className="text-xs text-slate-500 flex-shrink-0">{piece.format}</span>
          {failed && (
            <span className="flex items-center gap-1 text-xs text-red-400 flex-shrink-0">
              <AlertTriangle size={12} /> Generation failed — try regenerating
            </span>
          )}
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            type="button"
            className="text-slate-500 hover:text-white p-1.5"
            aria-label="Regenerate"
          >
            {regenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
          <button
            onClick={handleDelete}
            type="button"
            className="text-slate-500 hover:text-red-400 p-1.5"
            aria-label="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 pt-1 border-t border-slate-700/50">
          {editing ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">Title</span>
                <input
                  value={draft.title}
                  onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">Hook</span>
                <textarea
                  value={draft.hook}
                  onChange={(e) => setDraft((p) => ({ ...p, hook: e.target.value }))}
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">Body</span>
                <textarea
                  value={draft.body}
                  onChange={(e) => setDraft((p) => ({ ...p, body: e.target.value }))}
                  rows={5}
                  className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">Visual prompt</span>
                <textarea
                  value={draft.visualPrompt}
                  onChange={(e) => setDraft((p) => ({ ...p, visualPrompt: e.target.value }))}
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2"
                />
              </label>
              <div className="flex gap-2">
                <button onClick={handleSave} disabled={saving} type="button" className="btn-primary text-xs">
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditing(false)} type="button" className="btn-secondary text-xs">
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-200 font-medium">{piece.hook}</p>
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{piece.body}</p>
              {piece.visualPrompt && (
                <p className="text-xs text-slate-500 italic">Visual: {piece.visualPrompt}</p>
              )}
              <button onClick={() => setEditing(true)} type="button" className="text-xs text-blue-400 hover:underline">
                Edit
              </button>
            </>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  )
}
