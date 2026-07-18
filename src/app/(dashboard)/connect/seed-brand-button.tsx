'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

export function SeedBrandButton() {
  const [seeding, setSeeding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSeed() {
    setSeeding(true)
    setError(null)
    try {
      const res = await fetch('/api/seed', { method: 'POST' })
      const data = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Seed failed')
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Seed failed')
      setSeeding(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={handleSeed}
        disabled={seeding}
        className="btn-primary inline-flex items-center gap-1.5"
      >
        {seeding && <Loader2 size={13} className="animate-spin" />}
        Seed SnapRegister brand
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
