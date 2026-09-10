'use client'

import { FormEvent, useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { PLATFORMS, PLATFORM_LABELS, type Platform } from '@/types'

export function ManualAccountForm() {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    const form = new FormData(event.currentTarget)
    const payload = {
      platform: form.get('platform'),
      accountType: form.get('accountType'),
      displayName: form.get('displayName'),
      handle: form.get('handle'),
      profileUrl: form.get('profileUrl'),
      notes: form.get('notes'),
    }

    try {
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to add account')
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add account')
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button className="btn-secondary flex items-center gap-2" onClick={() => setOpen(true)}>
        <Plus size={15} />
        Add manual account
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="card mt-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Register an existing account manually</h3>
          <p className="text-xs text-slate-400 mt-1">
            Use this for identities that are not returned by a platform API, including Facebook additional profiles.
          </p>
        </div>
        <button type="button" className="text-xs text-slate-400 hover:text-white" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-xs text-slate-400">
          Platform
          <select name="platform" className="input mt-1 w-full" defaultValue="FACEBOOK">
            {PLATFORMS.map((platform: Platform) => (
              <option key={platform} value={platform}>{PLATFORM_LABELS[platform]}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Account type
          <select name="accountType" className="input mt-1 w-full" defaultValue="PROFILE">
            <option value="PROFILE">Profile</option>
            <option value="ADDITIONAL_PROFILE">Additional profile</option>
            <option value="PAGE">Page</option>
            <option value="PROFESSIONAL">Professional account</option>
            <option value="CHANNEL">Channel</option>
            <option value="ORGANIZATION">Organization</option>
            <option value="COMMUNITY">Community</option>
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Display name
          <input name="displayName" required maxLength={200} className="input mt-1 w-full" placeholder="Account name" />
        </label>
        <label className="text-xs text-slate-400">
          Handle
          <input name="handle" maxLength={200} className="input mt-1 w-full" placeholder="@username" />
        </label>
        <label className="text-xs text-slate-400 md:col-span-2">
          Profile URL
          <input name="profileUrl" type="url" className="input mt-1 w-full" placeholder="https://..." />
        </label>
        <label className="text-xs text-slate-400 md:col-span-2">
          Notes
          <textarea name="notes" maxLength={1000} className="input mt-1 w-full min-h-20" placeholder="Optional ownership or setup notes" />
        </label>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button disabled={saving} className="btn-primary flex items-center gap-2">
        {saving && <Loader2 size={14} className="animate-spin" />}
        Save account
      </button>
    </form>
  )
}
