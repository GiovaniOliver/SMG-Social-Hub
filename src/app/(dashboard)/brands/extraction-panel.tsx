'use client'

import { useState } from 'react'
import { Sparkles, FolderSearch, Loader2 } from 'lucide-react'
import type { ExtractedBrandInfo } from '@/lib/brand-extraction/types'

interface ExtractionPanelProps {
  onExtracted: (info: ExtractedBrandInfo) => void
}

export function ExtractionPanel({ onExtracted }: ExtractionPanelProps) {
  const [url, setUrl] = useState('')
  const [folderPath, setFolderPath] = useState('')
  const [loading, setLoading] = useState<'url' | 'folder' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runExtraction(endpoint: string, body: Record<string, string>, kind: 'url' | 'folder') {
    setLoading(kind)
    setError(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { success: boolean; data?: ExtractedBrandInfo; error?: string }
      if (!json.success || !json.data) throw new Error(json.error ?? 'Extraction failed')
      onExtracted(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-3 bg-slate-900/50 border border-slate-700 rounded-md p-3">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">AI-Assisted Fill</h3>
      <p className="text-xs text-slate-500">
        Pulls suggested values into the fields below for you to review — nothing saves until you hit Save.
      </p>

      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Website or app store URL"
          className="flex-1 bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
        />
        <button
          type="button"
          disabled={!url.trim() || loading !== null}
          onClick={() => void runExtraction('/api/brands/gather-from-url', { url: url.trim() }, 'url')}
          className="btn-secondary text-xs flex items-center gap-1.5 flex-shrink-0"
        >
          {loading === 'url' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          Gather
        </button>
      </div>

      <div className="flex gap-2">
        <input
          value={folderPath}
          onChange={(e) => setFolderPath(e.target.value)}
          placeholder="Local folder path (e.g. C:\Brands\Acme)"
          className="flex-1 bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
        />
        <button
          type="button"
          disabled={!folderPath.trim() || loading !== null}
          onClick={() => void runExtraction('/api/brands/scan-folder', { folderPath: folderPath.trim() }, 'folder')}
          className="btn-secondary text-xs flex items-center gap-1.5 flex-shrink-0"
        >
          {loading === 'folder' ? <Loader2 size={13} className="animate-spin" /> : <FolderSearch size={13} />}
          Scan
        </button>
      </div>
      <p className="text-xs text-slate-600">
        Folder scan only works when this app is running on the same machine as the folder.
      </p>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
