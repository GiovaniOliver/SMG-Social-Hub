'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { PlatformIcon } from '@/components/platform-icons'
import { PLATFORMS } from '@/types'
import type { Platform } from '@/types'

interface Brand {
  id: string
  name: string
  slug: string
}

interface HistoryItem {
  id: string
  platform: string
  contentType: string
  topic: string | null
  content: string
  hook: string
  tip: string | null
  imageUrl: string | null
  videoUrl: string | null
  createdAt: string
}

function isPlatform(value: string): value is Platform {
  return (PLATFORMS as string[]).includes(value)
}

export default function LibraryPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [brandId, setBrandId] = useState('')
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

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

  const loadHistory = useCallback((id: string) => {
    if (!id) {
      setItems([])
      return
    }
    setLoading(true)
    fetch(`/api/content/history?brandId=${id}`)
      .then((r) => r.json())
      .then((json) => setItems(json.data ?? []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadHistory(brandId)
  }, [brandId, loadHistory])

  function handleCopy(item: HistoryItem) {
    navigator.clipboard.writeText(item.content).then(() => {
      setCopiedId(item.id)
      setTimeout(() => setCopiedId(null), 1800)
    })
  }

  function handleSchedule(item: HistoryItem) {
    sessionStorage.setItem('smg_prefill_content', item.content)
    sessionStorage.setItem('smg_prefill_platform', item.platform)
    sessionStorage.setItem('smg_prefill_brandId', brandId)
    const mediaUrl = item.imageUrl ?? item.videoUrl
    if (mediaUrl) sessionStorage.setItem('smg_prefill_media', mediaUrl)
    window.location.href = '/schedule'
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Library</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Every piece of content Content Lab has generated for this brand, saved automatically.
        </p>
      </div>

      {brands.length > 0 && (
        <select
          value={brandId}
          onChange={(e) => setBrandId(e.target.value)}
          className="w-full sm:w-64 bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      )}

      {loading ? (
        <div className="h-20 bg-slate-800 border border-slate-700 rounded-xl animate-pulse" />
      ) : items.length === 0 ? (
        <p className="text-slate-500 text-sm">No generated content yet for this brand.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isPlatform(item.platform) && <PlatformIcon platform={item.platform} size={18} />}
                  <span className="text-xs text-slate-500">{item.contentType}</span>
                  <span className="text-xs text-slate-600">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleCopy(item)}
                    type="button"
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    {copiedId === item.id ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={() => handleSchedule(item)}
                    type="button"
                    className="text-xs text-blue-400 hover:underline"
                  >
                    Schedule this
                  </button>
                </div>
              </div>
              <p className="text-sm text-slate-200 whitespace-pre-wrap">{item.content}</p>
              {item.imageUrl && (
                <Image
                  src={item.imageUrl}
                  alt="Generated visual"
                  width={640}
                  height={360}
                  sizes="(max-width: 640px) 100vw, 320px"
                  unoptimized
                  loader={({ src }) => src}
                  className="w-full h-auto max-w-xs rounded-lg border border-slate-700"
                />
              )}
              {item.videoUrl && (
                <video src={item.videoUrl} controls className="w-full max-w-xs rounded-lg border border-slate-700" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
