'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { Flame, RefreshCw, WandSparkles, ExternalLink } from 'lucide-react'

interface Brand { id: string; name: string; slug: string }
interface FormatDNA {
  hook_pattern?: string
  hook_text_paraphrase?: string
  structure_beats?: string[]
  pacing?: string
  cta_style?: string
  hashtag_strategy?: string
  tone_markers?: string[]
  why_it_works?: string
}
interface TrendPost {
  id: string
  platform: 'youtube' | 'reddit' | 'tiktok' | 'facebook'
  url: string
  title: string | null
  creator_name: string | null
  thumbnail_url: string | null
  view_count: number | null
  like_count: number | null
  comment_count: number | null
  brand_fit_score: number
  format_analysis: FormatDNA | null
}

const WINDOWS = ['24h','7d','30d','6m','all'] as const
const PLATFORMS = ['', 'youtube','reddit','tiktok','facebook'] as const

function compact(value: number | null) {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

export default function TrendsPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [brandId, setBrandId] = useState('')
  const [items, setItems] = useState<TrendPost[]>([])
  const [window, setWindow] = useState<(typeof WINDOWS)[number]>('7d')
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/brands').then(r => r.json()).then(json => {
      const list = (json.data ?? []) as Brand[]
      setBrands(list)
      if (list[0]) setBrandId(list[0].id)
    }).catch(() => {})
  }, [])

  async function load() {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ window, limit: '40' })
      if (platform) params.set('platform', platform)
      const res = await fetch(`/api/trends?${params}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load trends')
      setItems(json.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trends')
      setItems([])
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [window, platform])

  const selectedBrand = useMemo(() => brands.find(b => b.id === brandId), [brands, brandId])

  function useFormat(post: TrendPost) {
    if (!brandId || !post.format_analysis) return
    sessionStorage.setItem('smg_prefill_brandId', brandId)
    sessionStorage.setItem('smg_prefill_trend_format', JSON.stringify(post.format_analysis))
    sessionStorage.setItem('smg_prefill_trend_title', post.title || `${post.platform} viral format`)
    window.location.href = '/create'
  }

  return (
    <div className="min-h-full p-4 sm:p-6 space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Flame size={22} className="text-orange-400" />
            <h1 className="text-xl font-bold text-white">Viral / Trends</h1>
          </div>
          <p className="mt-1 text-sm text-slate-400">Shared viral formats from SMG discovery, ready to reuse across brands.</p>
        </div>
        <button onClick={() => void load()} className="btn-secondary inline-flex items-center gap-2 text-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="card grid gap-3 md:grid-cols-3">
        <label className="text-xs text-slate-400">
          Brand
          <select value={brandId} onChange={e => setBrandId(e.target.value)} className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-white">
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Window
          <select value={window} onChange={e => setWindow(e.target.value as typeof window)} className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-white">
            {WINDOWS.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Platform
          <select value={platform} onChange={e => setPlatform(e.target.value as typeof platform)} className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-white">
            {PLATFORMS.map(v => <option key={v || 'all'} value={v}>{v || 'All platforms'}</option>)}
          </select>
        </label>
      </div>

      {selectedBrand && <p className="text-xs text-slate-500">Formats will open in Content Lab with <span className="text-slate-300 font-medium">{selectedBrand.name}</span> preselected.</p>}
      {error && <div className="rounded-md border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300">{error}</div>}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({length:6}).map((_,i)=><div key={i} className="h-72 rounded-xl border border-slate-700 bg-slate-800 animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <div className="card py-12 text-center text-sm text-slate-500">No viral posts match these filters yet.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map(post => {
            const dna = post.format_analysis && Object.keys(post.format_analysis).length ? post.format_analysis : null
            return <article key={post.id} className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
              {post.thumbnail_url && <a href={post.url} target="_blank" rel="noreferrer" className="block bg-black">
                <Image src={post.thumbnail_url} alt="" width={960} height={540} unoptimized loader={({src})=>src} className="w-full h-auto object-cover" />
              </a>}
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase tracking-wide text-blue-400">{post.platform}</span>
                    <h2 className="mt-1 line-clamp-2 text-sm font-semibold text-white">{post.title || post.url}</h2>
                    {post.creator_name && <p className="mt-1 text-xs text-slate-500">{post.creator_name}</p>}
                  </div>
                  <span className="rounded-full bg-indigo-950 px-2 py-1 text-[10px] font-semibold text-indigo-300">{Math.round((post.brand_fit_score || 0)*100)}% format fit</span>
                </div>
                <div className="flex gap-3 text-xs text-slate-500"><span>{compact(post.view_count)} views</span><span>{compact(post.like_count)} likes</span><span>{compact(post.comment_count)} comments</span></div>
                {dna ? <div className="rounded-lg border border-indigo-900 bg-indigo-950/40 p-3 text-xs text-indigo-200 space-y-1.5">
                  <p><strong>Hook:</strong> {(dna.hook_pattern || 'other').replace(/_/g,' ')}</p>
                  <p><strong>Pacing:</strong> {(dna.pacing || 'steady').replace(/_/g,' ')}</p>
                  {dna.why_it_works && <p className="text-indigo-300">{dna.why_it_works}</p>}
                </div> : <p className="text-xs italic text-slate-500">Format DNA is still processing.</p>}
                <div className="flex gap-2">
                  <button disabled={!brandId || !dna} onClick={() => useFormat(post)} className="btn-primary flex-1 inline-flex items-center justify-center gap-2 text-xs disabled:opacity-50"><WandSparkles size={13}/>Use format</button>
                  <a href={post.url} target="_blank" rel="noreferrer" className="btn-secondary inline-flex items-center justify-center px-3"><ExternalLink size={13}/></a>
                </div>
              </div>
            </article>
          })}
        </div>
      )}
    </div>
  )
}
