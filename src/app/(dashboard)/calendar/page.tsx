'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { PlatformIcon } from '@/components/platform-icons'
import { PLATFORMS } from '@/types'
import type { Platform } from '@/types'

interface Brand {
  id: string
  name: string
  slug: string
}

interface CalendarPiece {
  id: string
  day: number
  platform: string
  format: string
  title: string
  status: string
  campaign: { id: string; name: string }
}

function isPlatform(value: string): value is Platform {
  return (PLATFORMS as string[]).includes(value)
}

export default function CalendarPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [brandId, setBrandId] = useState('')
  const [pieces, setPieces] = useState<CalendarPiece[]>([])
  const [loading, setLoading] = useState(false)

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

  const loadPieces = useCallback((id: string) => {
    if (!id) {
      setPieces([])
      return
    }
    setLoading(true)
    fetch(`/api/campaigns/calendar?brandId=${id}`)
      .then((r) => r.json())
      .then((json) => setPieces(json.data ?? []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadPieces(brandId)
  }, [brandId, loadPieces])

  const days = Array.from(new Set(pieces.map((p) => p.day))).sort((a, b) => a - b)

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Calendar</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Every generated content piece across this brand&apos;s campaigns, by day.
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
      ) : days.length === 0 ? (
        <p className="text-slate-500 text-sm">No campaign content yet for this brand.</p>
      ) : (
        <div className="space-y-6">
          {days.map((day) => (
            <div key={day}>
              <h2 className="text-sm font-semibold text-slate-300 mb-3">Day {day}</h2>
              <div className="space-y-2">
                {pieces
                  .filter((p) => p.day === day)
                  .map((piece) => (
                    <Link
                      key={piece.id}
                      href={`/campaigns/${piece.campaign.id}`}
                      className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 hover:border-slate-600 transition-colors"
                    >
                      {isPlatform(piece.platform) && <PlatformIcon platform={piece.platform} size={20} />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white truncate">{piece.title}</p>
                        <p className="text-xs text-slate-500">
                          {piece.campaign.name} · {piece.format}
                        </p>
                      </div>
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
