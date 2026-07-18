'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Sparkles, Loader2, Trash2, AlertTriangle } from 'lucide-react'

interface Brand {
  id: string
  name: string
  slug: string
}

interface CampaignSummary {
  id: string
  name: string
  description: string | null
  status: string
  createdAt: string
  _count: { content: number }
}

interface FormState {
  name: string
  description: string
  durationDays: number
  piecesPerDay: number
}

const DEFAULT_FORM: FormState = { name: '', description: '', durationDays: 7, piecesPerDay: 2 }

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-700 text-slate-300',
  generating: 'bg-yellow-500/15 text-yellow-400',
  completed: 'bg-green-500/15 text-green-400',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[status] ?? STATUS_STYLES.draft}`}>
      {status}
    </span>
  )
}

export default function CampaignsPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [brandId, setBrandId] = useState('')
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [loadingCampaigns, setLoadingCampaigns] = useState(false)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

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

  const loadCampaigns = useCallback((id: string) => {
    if (!id) {
      setCampaigns([])
      return
    }
    setLoadingCampaigns(true)
    fetch(`/api/campaigns?brandId=${id}`)
      .then((r) => r.json())
      .then((json) => setCampaigns(json.data ?? []))
      .catch(() => setError('Failed to load campaigns.'))
      .finally(() => setLoadingCampaigns(false))
  }, [])

  useEffect(() => {
    loadCampaigns(brandId)
  }, [brandId, loadCampaigns])

  async function handleGenerate() {
    if (!brandId || !form.name.trim()) return
    setGenerating(true)
    setError(null)
    setWarning(null)
    try {
      const res = await fetch('/api/campaigns/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          name: form.name.trim(),
          description: form.description.trim(),
          durationDays: form.durationDays,
          piecesPerDay: form.piecesPerDay,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Campaign generation failed')
      setForm(DEFAULT_FORM)
      loadCampaigns(brandId)
      if (json.failedCount > 0) {
        setWarning(
          `Campaign created, but ${json.failedCount} piece(s) failed to generate — you can regenerate them from the campaign detail page.`
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Campaign generation failed')
    } finally {
      setGenerating(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this campaign and all its content pieces?')) return
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Failed to delete campaign')
      setCampaigns((prev) => prev.filter((c) => c.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete campaign')
    }
  }

  const canGenerate = !!brandId && form.name.trim().length > 0 && !generating
  const totalPieces = form.durationDays * form.piecesPerDay

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Campaigns</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Generate a full multi-day content campaign for a brand in one pass.
        </p>
      </div>

      {brands.length === 0 ? (
        <p className="text-slate-500 text-sm">
          No brands yet. <Link href="/brands" className="text-blue-400 hover:underline">Create one</Link>
        </p>
      ) : (
        <>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Brand
            </label>
            <select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className="w-full sm:w-64 bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">New Campaign</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400">Name</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Fall Launch Push"
                  className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400">Description (optional)</span>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400">Duration (days)</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={form.durationDays}
                  onChange={(e) => setForm((prev) => ({ ...prev, durationDays: Number(e.target.value) || 1 }))}
                  className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400">Pieces per day</span>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={form.piecesPerDay}
                  onChange={(e) => setForm((prev) => ({ ...prev, piecesPerDay: Number(e.target.value) || 1 }))}
                  className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            </div>
            <p className="text-xs text-slate-500">
              Will generate {totalPieces} content piece{totalPieces === 1 ? '' : 's'} — this runs {totalPieces + 2}{' '}
              AI calls and can take a minute or more.
            </p>
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="flex items-center justify-center gap-2 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              type="button"
            >
              {generating ? (
                <><Loader2 size={16} className="animate-spin" /> Generating campaign… this may take a minute</>
              ) : (
                <><Sparkles size={16} /> Generate Campaign</>
              )}
            </button>
            {error && (
              <div className="flex items-start gap-2 bg-red-950 border border-red-800 rounded-lg px-3 py-2.5 text-xs text-red-300">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}
            {warning && (
              <div className="flex items-start gap-2 bg-yellow-950 border border-yellow-800 rounded-lg px-3 py-2.5 text-xs text-yellow-300">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                {warning}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-white">Existing Campaigns</h2>
            {loadingCampaigns ? (
              <div className="h-20 bg-slate-800 border border-slate-700 rounded-xl animate-pulse" />
            ) : campaigns.length === 0 ? (
              <p className="text-slate-500 text-sm">No campaigns yet for this brand.</p>
            ) : (
              <div className="space-y-2">
                {campaigns.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-xl px-4 py-3"
                  >
                    <Link href={`/campaigns/${c.id}`} className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">{c.name}</span>
                        <StatusBadge status={c.status} />
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {c._count.content} piece{c._count.content === 1 ? '' : 's'} ·{' '}
                        {new Date(c.createdAt).toLocaleDateString()}
                      </p>
                    </Link>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="text-slate-500 hover:text-red-400 transition-colors p-2"
                      type="button"
                      aria-label="Delete campaign"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
