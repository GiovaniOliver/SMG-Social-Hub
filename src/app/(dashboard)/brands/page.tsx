'use client'

import { useState, useEffect } from 'react'
import {
  Building2,
  Plus,
  ChevronDown,
  ChevronRight,
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import type { BrandVoice, BrandContext } from '@/types'
import { TagInput, FaqEditor } from './form-controls'

// ---------- Types ----------

interface BrandListItem {
  id: string
  name: string
  slug: string
  description: string | null
  isActive: boolean
  _count?: { connections: number }
}

interface BrandDetail {
  id: string
  name: string
  slug: string
  description: string | null
  isActive: boolean
  voice: BrandVoice
  context: BrandContext
}

// ---------- Helpers ----------

function emptyVoice(): BrandVoice {
  return { tone: '', personality: '', avoid: [], cta: '' }
}

function emptyContext(): BrandContext {
  return { products: [], faqs: [], targetAudience: [], keyMessages: [] }
}

// ---------- Brand Edit Form ----------

interface BrandEditFormProps {
  brand: BrandDetail
  onSaved: (updated: BrandDetail) => void
  onCancel: () => void
}

function BrandEditForm({ brand, onSaved, onCancel }: BrandEditFormProps) {
  const [name, setName] = useState(brand.name)
  const [description, setDescription] = useState(brand.description ?? '')
  const [voice, setVoice] = useState<BrandVoice>({ ...brand.voice })
  const [context, setContext] = useState<BrandContext>({
    ...brand.context,
    faqs: brand.context.faqs ?? [],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const res = await fetch(`/api/brands/${brand.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || brand.name,
          description: description.trim() || null,
          voice: {
            tone: voice.tone,
            personality: voice.personality,
            avoid: voice.avoid,
            cta: voice.cta || undefined,
          },
          context: {
            products: context.products,
            faqs: context.faqs.filter((f) => f.q.trim() && f.a.trim()),
            targetAudience: context.targetAudience,
            keyMessages: context.keyMessages,
          },
        }),
      })

      const json = await res.json() as { success: boolean; error?: string }
      if (!json.success) throw new Error(json.error ?? 'Save failed')

      setSuccess(true)
      onSaved({
        ...brand,
        name: name.trim() || brand.name,
        description: description.trim() || null,
        voice: { ...voice },
        context: { ...context },
      })

      setTimeout(() => setSuccess(false), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Basic Info</h3>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Brand Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="Brand name"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
            placeholder="Brief description of the brand..."
          />
        </div>
      </div>

      {/* Brand Voice */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Brand Voice</h3>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Tone</label>
          <input
            value={voice.tone}
            onChange={(e) => setVoice({ ...voice, tone: e.target.value })}
            className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="e.g. professional, friendly, direct"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Personality</label>
          <input
            value={voice.personality}
            onChange={(e) => setVoice({ ...voice, personality: e.target.value })}
            className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="e.g. knowledgeable, approachable, concise"
          />
        </div>

        <TagInput
          label="Things to Avoid"
          tags={voice.avoid}
          onChange={(tags) => setVoice({ ...voice, avoid: tags })}
          placeholder="Add things to avoid..."
        />

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">CTA Hint (optional)</label>
          <input
            value={voice.cta ?? ''}
            onChange={(e) => setVoice({ ...voice, cta: e.target.value })}
            className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="e.g. Mention free trial when relevant"
          />
        </div>
      </div>

      {/* Brand Context */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Brand Context</h3>

        <TagInput
          label="Products / Services"
          tags={context.products}
          onChange={(tags) => setContext({ ...context, products: tags })}
          placeholder="Add product or service..."
        />

        <TagInput
          label="Target Audience"
          tags={context.targetAudience}
          onChange={(tags) => setContext({ ...context, targetAudience: tags })}
          placeholder="Add audience segment..."
        />

        <TagInput
          label="Key Messages"
          tags={context.keyMessages}
          onChange={(tags) => setContext({ ...context, keyMessages: tags })}
          placeholder="Add a key message..."
        />

        <FaqEditor
          faqs={context.faqs}
          onChange={(faqs) => setContext({ ...context, faqs })}
        />
      </div>

      {/* Actions */}
      {error && (
        <div className="flex items-start gap-2 bg-red-950 border border-red-800 rounded-md px-3 py-2">
          <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-red-300 text-xs">{error}</p>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 bg-green-950 border border-green-800 rounded-md px-3 py-2">
          <CheckCircle2 size={14} className="text-green-400" />
          <p className="text-green-300 text-xs">Brand saved successfully.</p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ---------- Brand Card ----------

interface BrandCardProps {
  brand: BrandListItem
}

function BrandCard({ brand }: BrandCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState<BrandDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [editing, setEditing] = useState(false)
  const [currentBrand, setCurrentBrand] = useState<BrandListItem>(brand)

  async function handleExpand() {
    if (expanded) {
      setExpanded(false)
      setEditing(false)
      return
    }

    setExpanded(true)
    if (!detail) {
      setLoadingDetail(true)
      try {
        const res = await fetch(`/api/brands/${brand.id}`)
        const json = await res.json() as { success: boolean; data?: BrandDetail }
        if (json.success && json.data) setDetail(json.data)
      } catch {
        // fail silently — form will show empty
      } finally {
        setLoadingDetail(false)
      }
    }
  }

  function handleSaved(updated: BrandDetail) {
    setDetail(updated)
    setCurrentBrand({ ...currentBrand, name: updated.name, description: updated.description })
    setEditing(false)
  }

  return (
    <div className="card">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <Building2 size={15} className="text-slate-400 flex-shrink-0" />
            <h3 className="text-sm font-semibold text-white">{currentBrand.name}</h3>
            {!currentBrand.isActive && (
              <span className="badge-skipped">Inactive</span>
            )}
          </div>
          <p className="text-xs text-slate-500 ml-5">{currentBrand.slug}</p>
          {currentBrand.description && (
            <p className="text-xs text-slate-400 mt-1 ml-5 line-clamp-1">{currentBrand.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              if (!expanded) void handleExpand()
              else {
                setEditing(true)
                if (!expanded) void handleExpand()
              }
            }}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleExpand}
            className="p-1.5 text-slate-400 hover:text-white transition-colors"
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-slate-700">
          {loadingDetail ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
              <Loader2 size={14} className="animate-spin" />
              Loading brand details...
            </div>
          ) : detail ? (
            editing ? (
              <BrandEditForm
                brand={detail}
                onSaved={handleSaved}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <div className="space-y-4">
                {/* Voice preview */}
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Voice</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {detail.voice.tone && (
                      <div>
                        <span className="text-slate-500">Tone: </span>
                        <span className="text-slate-200">{detail.voice.tone}</span>
                      </div>
                    )}
                    {detail.voice.personality && (
                      <div>
                        <span className="text-slate-500">Personality: </span>
                        <span className="text-slate-200">{detail.voice.personality}</span>
                      </div>
                    )}
                  </div>
                  {detail.voice.avoid.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {detail.voice.avoid.map((a) => (
                        <span key={a} className="px-2 py-0.5 bg-red-900/40 border border-red-800 text-red-400 text-xs rounded-md">
                          {a}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Context preview */}
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Context</p>
                  {detail.context.keyMessages.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs text-slate-500 mb-1">Key Messages:</p>
                      <ul className="space-y-0.5">
                        {detail.context.keyMessages.map((m) => (
                          <li key={m} className="text-xs text-slate-300 flex items-start gap-1.5">
                            <span className="text-slate-600 mt-0.5">•</span> {m}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {detail.context.products.length > 0 && (
                    <p className="text-xs text-slate-400">
                      <span className="text-slate-500">Products: </span>
                      {detail.context.products.join(', ')}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="btn-secondary text-xs"
                >
                  Edit Brand
                </button>
              </div>
            )
          ) : (
            <p className="text-sm text-slate-500">Failed to load brand details.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Create Brand Modal ----------

interface CreateBrandFormProps {
  onCreated: (brand: BrandListItem) => void
  onCancel: () => void
}

function CreateBrandForm({ onCreated, onCancel }: CreateBrandFormProps) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function derivedSlug(n: string) {
    return n.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim() || derivedSlug(name.trim()),
          description: description.trim() || undefined,
          voice: emptyVoice(),
          context: emptyContext(),
        }),
      })

      const json = await res.json() as { success: boolean; data?: BrandListItem; error?: string }
      if (!json.success || !json.data) throw new Error(json.error ?? 'Create failed')

      onCreated(json.data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <h3 className="text-sm font-semibold text-white">New Brand</h3>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Name *</label>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setSlug(derivedSlug(e.target.value))
          }}
          required
          className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
          placeholder="Brand name"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Slug *</label>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          required
          className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors font-mono"
          placeholder="brand-slug"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
          placeholder="Brief description..."
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-950 border border-red-800 rounded-md px-3 py-2">
          <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-red-300 text-xs">{error}</p>
        </div>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          {saving ? 'Creating...' : 'Create Brand'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
      </div>
    </form>
  )
}

// ---------- Main Page ----------

export default function BrandsPage() {
  const [brands, setBrands] = useState<BrandListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch('/api/brands')
      .then((r) => r.json())
      .then((json: { success: boolean; data?: BrandListItem[]; error?: string }) => {
        if (json.success && json.data) setBrands(json.data)
        else setError(json.error ?? 'Failed to load brands')
      })
      .catch(() => setError('Failed to load brands'))
      .finally(() => setLoading(false))
  }, [])

  function handleCreated(brand: BrandListItem) {
    setBrands((prev) => [brand, ...prev])
    setCreating(false)
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 size={18} className="animate-spin" />
          <span>Loading brands...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Brands</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Manage brand voice and context used for AI reply generation.
          </p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={15} />
            New Brand
          </button>
        )}
      </div>

      {creating && (
        <div className="mb-4">
          <CreateBrandForm
            onCreated={handleCreated}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-950 border border-red-800 rounded-md px-4 py-3 mb-4">
          <AlertTriangle size={15} className="text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {brands.length === 0 && !error ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Building2 size={40} className="text-slate-600 mb-4" />
          <h2 className="text-white font-medium mb-1">No brands yet</h2>
          <p className="text-slate-400 text-sm max-w-sm mb-4">
            Create your first brand to start managing voice, context, and AI-generated replies.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={15} />
            Create First Brand
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {brands.map((brand) => (
            <BrandCard key={brand.id} brand={brand} />
          ))}
        </div>
      )}
    </div>
  )
}
