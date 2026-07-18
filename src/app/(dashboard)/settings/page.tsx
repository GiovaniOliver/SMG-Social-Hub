'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import clsx from 'clsx'

type AIProvider = 'gemini' | 'anthropic' | 'openai' | 'ollama'

interface KeyStatus {
  gemini: boolean
  anthropic: boolean
  openai: boolean
  runware: boolean
  ollamaBaseUrl: string
  defaultProvider: AIProvider
}

const PROVIDERS: Array<{ id: AIProvider; label: string; keyField: 'gemini' | 'anthropic' | 'openai' | null; placeholder: string }> = [
  { id: 'gemini', label: 'Gemini', keyField: 'gemini', placeholder: 'AIza…' },
  { id: 'anthropic', label: 'Claude (Anthropic)', keyField: 'anthropic', placeholder: 'sk-ant-…' },
  { id: 'openai', label: 'OpenAI', keyField: 'openai', placeholder: 'sk-…' },
  { id: 'ollama', label: 'Ollama (local)', keyField: null, placeholder: '' },
]

export default function SettingsPage() {
  const [status, setStatus] = useState<KeyStatus | null>(null)
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('')
  const [defaultProvider, setDefaultProvider] = useState<AIProvider>('gemini')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/settings/keys')
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error ?? 'Failed to load settings')
        const data = json.data as KeyStatus
        setStatus(data)
        setOllamaBaseUrl(data.ollamaBaseUrl)
        setDefaultProvider(data.defaultProvider)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load settings'))
  }, [])

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const res = await fetch('/api/settings/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...keyInputs,
          ollamaBaseUrl,
          defaultProvider,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Failed to save settings')
      setStatus(json.data as KeyStatus)
      setKeyInputs({})
      setSaved(true)
      setTimeout(() => setSaved(false), 5000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (!status) {
    return (
      <div className="p-6 max-w-3xl mx-auto text-slate-400 text-sm">
        {error || 'Loading settings…'}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Choose the default AI provider and manage API keys. Content Lab and comment replies
          route through whichever provider is selected here.
        </p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-900/50 border border-red-700 rounded-md text-red-300 text-sm">
          {error}
        </div>
      )}

      {saved && (
        <div className="mb-4 px-4 py-3 bg-green-900/50 border border-green-700 rounded-md text-green-300 text-sm flex items-center gap-2">
          <CheckCircle2 size={16} />
          Settings saved successfully.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {PROVIDERS.map((p) => {
          const configured = p.keyField ? status[p.keyField] : true
          const isDefault = defaultProvider === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setDefaultProvider(p.id)}
              className={clsx(
                'text-left p-4 rounded-2xl border-2 transition-all',
                isDefault ? 'border-blue-500 bg-blue-600/20' : 'border-slate-700 bg-slate-800 hover:border-slate-600'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">{p.label}</span>
                {configured && <CheckCircle2 size={16} className="text-green-400" />}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {isDefault
                  ? 'Default provider'
                  : p.keyField === null
                    ? 'No key required'
                    : configured
                      ? 'Key configured'
                      : 'Not configured'}
              </p>
            </button>
          )
        })}
      </div>

      <div className="card flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-white">API Keys</h2>

        {PROVIDERS.filter((p) => p.keyField).map((p) => (
          <label key={p.id} className="flex flex-col gap-1.5">
            <span className="text-xs text-slate-400">
              {p.label} API key {status[p.keyField as 'gemini' | 'anthropic' | 'openai'] && (
                <span className="text-green-400">(configured — leave blank to keep)</span>
              )}
            </span>
            <input
              type="password"
              value={keyInputs[p.keyField as string] ?? ''}
              onChange={(e) => setKeyInputs((prev) => ({ ...prev, [p.keyField as string]: e.target.value }))}
              placeholder={p.placeholder}
              className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
        ))}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-slate-400">Ollama base URL</span>
          <input
            type="text"
            value={ollamaBaseUrl}
            onChange={(e) => setOllamaBaseUrl(e.target.value)}
            placeholder="http://localhost:11434"
            className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

      </div>

      <div className="card flex flex-col gap-4 mt-6">
        <div>
          <h2 className="text-sm font-semibold text-white">Media Generation</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Runware powers image and video generation in Content Lab.
          </p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-slate-400">
            Runware API key {status.runware && (
              <span className="text-green-400">(configured — leave blank to keep)</span>
            )}
          </span>
          <input
            type="password"
            value={keyInputs.runware ?? ''}
            onChange={(e) => setKeyInputs((prev) => ({ ...prev, runware: e.target.value }))}
            placeholder="rw_…"
            className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto self-start mt-6"
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        {saved ? 'Saved' : saving ? 'Saving…' : 'Save settings'}
      </button>
    </div>
  )
}
