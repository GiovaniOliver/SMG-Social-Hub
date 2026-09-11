'use client'

import { useEffect, useState } from 'react'
import { Bot, CheckCircle2, DatabaseZap, ImageIcon, Loader2, ServerCog } from 'lucide-react'

type AIProvider = 'gemini' | 'anthropic' | 'openai' | 'ollama'

type IntegrationStatus = {
  gemini: boolean
  anthropic: boolean
  openai: boolean
  runware: boolean
  ollamaBaseUrl: string
  defaultProvider: AIProvider
  models: Record<AIProvider, string>
}

const PROVIDERS: Array<{
  id: AIProvider | 'runware'
  label: string
  description: string
  category: 'LLM' | 'Media' | 'Local'
  defaultModel?: string
}> = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    description: 'Brand extraction, structured generation, and general content workflows.',
    category: 'LLM',
    defaultModel: 'gemini-3.5-flash-lite',
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    description: 'Long-form writing, analysis, and comment/reply generation.',
    category: 'LLM',
    defaultModel: 'claude-haiku-4-5',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'General text and structured content generation.',
    category: 'LLM',
    defaultModel: 'gpt-4o',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    description: 'Optional self-hosted/local model endpoint.',
    category: 'Local',
    defaultModel: 'llama3.3',
  },
  {
    id: 'runware',
    label: 'Runware',
    description: 'Image and video generation used by Content Lab.',
    category: 'Media',
  },
]

export default function AIIntegrationsPage() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [models, setModels] = useState<Record<string, string>>({})
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function load() {
    setError('')
    const res = await fetch('/api/settings/ai-integrations', { cache: 'no-store' })
    const json = await res.json()
    if (!json.success) throw new Error(json.error ?? 'Failed to load integrations')
    const data = json.data as IntegrationStatus
    setStatus(data)
    setModels(data.models)
    setOllamaBaseUrl(data.ollamaBaseUrl)
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load integrations'))
  }, [])

  async function saveProvider(provider: AIProvider | 'runware') {
    setSaving(provider)
    setError('')
    setMessage('')
    try {
      const res = await fetch('/api/settings/ai-integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          secret: secrets[provider] || undefined,
          defaultModel: provider !== 'runware' ? models[provider] || undefined : undefined,
          baseUrl: provider === 'ollama' ? ollamaBaseUrl : undefined,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Failed to save integration')
      const next = json.data as IntegrationStatus
      setStatus(next)
      setModels(next.models)
      setOllamaBaseUrl(next.ollamaBaseUrl)
      setSecrets((current) => ({ ...current, [provider]: '' }))
      setMessage(`${PROVIDERS.find((item) => item.id === provider)?.label ?? provider} saved.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save integration')
    } finally {
      setSaving(null)
    }
  }

  if (!status) {
    return <div className="p-6 text-sm text-slate-400">{error || 'Loading AI integrations…'}</div>
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">AI Integrations</h1>
        <p className="text-sm text-slate-400 mt-1 max-w-3xl">
          Manage LLM, media-generation, and local AI providers from one place. Secrets are stored
          encrypted on the server and never returned to the browser.
        </p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-md border border-red-800 bg-red-950/50 text-red-300 text-sm">
          {error}
        </div>
      )}
      {message && (
        <div className="px-4 py-3 rounded-md border border-green-800 bg-green-950/50 text-green-300 text-sm">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card">
          <Bot size={18} className="text-blue-300" />
          <p className="text-sm font-medium text-white mt-3">Language models</p>
          <p className="text-xs text-slate-400 mt-1">Gemini, Claude, OpenAI, and Ollama.</p>
        </div>
        <div className="card">
          <ImageIcon size={18} className="text-blue-300" />
          <p className="text-sm font-medium text-white mt-3">Media providers</p>
          <p className="text-xs text-slate-400 mt-1">Runware today; FAL and other services can plug in here next.</p>
        </div>
        <div className="card">
          <DatabaseZap size={18} className="text-blue-300" />
          <p className="text-sm font-medium text-white mt-3">Central configuration</p>
          <p className="text-xs text-slate-400 mt-1">Provider models and credentials are no longer hard-coded per workflow.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {PROVIDERS.map((provider) => {
          const configured = provider.id === 'runware'
            ? status.runware
            : provider.id === 'ollama'
              ? Boolean(ollamaBaseUrl)
              : status[provider.id]

          return (
            <section key={provider.id} className="card space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-white">{provider.label}</h2>
                    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      {provider.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{provider.description}</p>
                </div>
                {configured && <CheckCircle2 size={17} className="text-green-400 flex-shrink-0" />}
              </div>

              {provider.id !== 'ollama' && (
                <label className="block">
                  <span className="text-xs text-slate-400">API key</span>
                  <input
                    type="password"
                    value={secrets[provider.id] ?? ''}
                    onChange={(event) => setSecrets((current) => ({ ...current, [provider.id]: event.target.value }))}
                    placeholder={configured ? 'Configured — enter a new key to replace' : 'Enter API key'}
                    className="mt-1.5 w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
              )}

              {provider.id !== 'runware' && (
                <label className="block">
                  <span className="text-xs text-slate-400">Default model</span>
                  <input
                    type="text"
                    value={models[provider.id] ?? provider.defaultModel ?? ''}
                    onChange={(event) => setModels((current) => ({ ...current, [provider.id]: event.target.value }))}
                    className="mt-1.5 w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
              )}

              {provider.id === 'ollama' && (
                <label className="block">
                  <span className="text-xs text-slate-400">Base URL</span>
                  <input
                    type="text"
                    value={ollamaBaseUrl}
                    onChange={(event) => setOllamaBaseUrl(event.target.value)}
                    placeholder="http://localhost:11434"
                    className="mt-1.5 w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
              )}

              <button
                type="button"
                onClick={() => saveProvider(provider.id)}
                disabled={saving === provider.id}
                className="btn-primary flex items-center justify-center gap-2"
              >
                {saving === provider.id && <Loader2 size={14} className="animate-spin" />}
                Save {provider.label}
              </button>
            </section>
          )
        })}
      </div>

      <div className="card flex gap-3">
        <ServerCog size={18} className="text-amber-300 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-white">Production note</p>
          <p className="text-xs text-slate-400 mt-1">
            Vercel environment variables remain valid fallbacks. Saving a provider here overrides
            the matching API key/model for Social Hub without requiring a redeploy.
          </p>
        </div>
      </div>
    </div>
  )
}
