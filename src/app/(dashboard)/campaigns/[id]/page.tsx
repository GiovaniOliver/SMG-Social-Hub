'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ContentPieceCard, type ContentPiece } from './content-piece-card'

interface CampaignDetail {
  id: string
  name: string
  description: string | null
  status: string
  content: ContentPiece[]
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/campaigns/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error ?? 'Failed to load campaign')
        setCampaign(json.data)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load campaign'))
      .finally(() => setLoading(false))
  }, [id])

  function updatePiece(updated: ContentPiece) {
    setCampaign((prev) =>
      prev ? { ...prev, content: prev.content.map((p) => (p.id === updated.id ? updated : p)) } : prev
    )
  }

  function removePiece(pieceId: string) {
    setCampaign((prev) => (prev ? { ...prev, content: prev.content.filter((p) => p.id !== pieceId) } : prev))
  }

  if (loading) {
    return <div className="p-6 max-w-4xl mx-auto text-slate-400 text-sm">Loading campaign…</div>
  }

  if (error || !campaign) {
    return <div className="p-6 max-w-4xl mx-auto text-red-400 text-sm">{error ?? 'Campaign not found'}</div>
  }

  const pieceDays = Array.from(new Set(campaign.content.map((p) => p.day))).sort((a, b) => a - b)

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Link href="/campaigns" className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white w-fit">
        <ArrowLeft size={14} /> Back to campaigns
      </Link>

      <div>
        <h1 className="text-xl font-bold text-white">{campaign.name}</h1>
        {campaign.description && <p className="text-sm text-slate-400 mt-1">{campaign.description}</p>}
      </div>

      {pieceDays.length === 0 ? (
        <p className="text-slate-500 text-sm">No content pieces in this campaign.</p>
      ) : (
        <div className="space-y-6">
          {pieceDays.map((day) => (
            <div key={day}>
              <h2 className="text-sm font-semibold text-slate-300 mb-3">Day {day}</h2>
              <div className="space-y-3">
                {campaign.content
                  .filter((p) => p.day === day)
                  .map((piece) => (
                    <ContentPieceCard key={piece.id} piece={piece} onUpdated={updatePiece} onDeleted={removePiece} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
