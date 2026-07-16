'use client'

import { useState } from 'react'
import { Upload, Loader2, AlertTriangle } from 'lucide-react'

interface LogoUploadFieldProps {
  logoUrl: string | null
  onChange: (url: string) => void
}

export function LogoUploadField({ logoUrl, onChange }: LogoUploadFieldProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/brands/upload-logo', { method: 'POST', body: formData })
      const json = (await res.json()) as { success: boolean; data?: { url: string }; error?: string }
      if (!json.success || !json.data) throw new Error(json.error ?? 'Upload failed')
      onChange(json.data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">Logo</label>
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Brand logo" className="w-full h-full object-cover" />
          ) : (
            <Upload size={18} className="text-slate-600" />
          )}
        </div>
        <label className="btn-secondary text-xs cursor-pointer">
          {uploading ? 'Uploading...' : logoUrl ? 'Replace logo' : 'Upload logo'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            onChange={(e) => void handleFileChange(e)}
            disabled={uploading}
            className="hidden"
          />
        </label>
        {uploading && <Loader2 size={14} className="animate-spin text-slate-400" />}
      </div>
      {!logoUrl && (
        <p className="flex items-center gap-1.5 text-xs text-yellow-500 mt-2">
          <AlertTriangle size={12} />
          No logo yet — content generation works better with one.
        </p>
      )}
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  )
}
