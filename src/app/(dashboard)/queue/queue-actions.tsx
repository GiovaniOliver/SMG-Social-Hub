'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PostStatus } from '@/types'

interface QueueActionsProps {
  postId: string
  status: PostStatus
}

export function QueueActions({ postId, status }: QueueActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCancel() {
    if (!confirm('Cancel this scheduled post?')) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/schedule/${postId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) {
        setError(json.error ?? 'Failed to cancel.')
        return
      }
      router.refresh()
    } catch {
      setError('Network error.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRetry() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/schedule/retry/${postId}`, { method: 'POST' })
      const json = await res.json()
      if (!json.success) {
        setError(json.error ?? 'Retry failed.')
        return
      }
      router.refresh()
    } catch {
      setError('Network error.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {status === 'PENDING' && (
        <>
          <a
            href={`/schedule/edit/${postId}`}
            className="text-xs text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 rounded px-2 py-0.5 transition-colors"
          >
            Edit
          </a>
          <button
            onClick={handleCancel}
            disabled={loading}
            className="text-xs text-red-400 hover:text-red-300 border border-red-800/50 hover:border-red-600/50 rounded px-2 py-0.5 transition-colors disabled:opacity-50"
          >
            {loading ? 'Cancelling...' : 'Cancel'}
          </button>
        </>
      )}

      {status === 'FAILED' && (
        <button
          onClick={handleRetry}
          disabled={loading}
          className="text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-800/50 hover:border-yellow-600/50 rounded px-2 py-0.5 transition-colors disabled:opacity-50"
        >
          {loading ? 'Retrying...' : 'Retry'}
        </button>
      )}

      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}
    </div>
  )
}
