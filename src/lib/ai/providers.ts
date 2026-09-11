import fs from 'fs'
import path from 'path'
import type Anthropic from '@anthropic-ai/sdk'
import {
  getStoredIntegration,
  getStoredSecret,
  saveStoredIntegration,
  type IntegrationProvider,
} from './integration-store'

// Legacy local fallback for development/tests only. Production settings are stored
// encrypted in Supabase via integration-store.ts.
const KEYS_FILE = path.join(process.cwd(), '.provider-keys.json')

export type AIProvider = 'gemini' | 'anthropic' | 'openai' | 'ollama'
export type KeyedProvider = AIProvider | 'runware'

export interface ProviderKeys {
  gemini?: string
  anthropic?: string
  openai?: string
  runware?: string
  ollamaBaseUrl?: string
  defaultProvider?: AIProvider
}

export interface ProviderKeyStatus {
  gemini: boolean
  anthropic: boolean
  openai: boolean
  runware: boolean
  ollamaBaseUrl: string
  defaultProvider: AIProvider
}

export interface AIIntegrationStatus extends ProviderKeyStatus {
  models: Record<AIProvider, string>
}

export function loadKeys(): ProviderKeys {
  try {
    if (fs.existsSync(KEYS_FILE)) {
      return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf-8')) as ProviderKeys
    }
  } catch {
    // Development fallback only.
  }
  return {}
}

export function saveKeys(keys: ProviderKeys): void {
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), 'utf-8')
}

const ENV_VAR: Partial<Record<KeyedProvider, string>> = {
  gemini: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  runware: 'RUNWARE_API_KEY',
}

export function getKey(provider: KeyedProvider): string {
  const stored = loadKeys()
  const envVar = ENV_VAR[provider]
  const envFallback = envVar ? process.env[envVar] : undefined
  return stored[provider as 'gemini' | 'anthropic' | 'openai' | 'runware'] || envFallback || ''
}

export function getKeyStatus(): ProviderKeyStatus {
  const stored = loadKeys()
  return {
    gemini: !!getKey('gemini'),
    anthropic: !!getKey('anthropic'),
    openai: !!getKey('openai'),
    runware: !!getKey('runware'),
    ollamaBaseUrl: stored.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    defaultProvider: stored.defaultProvider || 'gemini',
  }
}

const DEFAULT_MODEL: Record<AIProvider, string> = {
  gemini: 'gemini-3.5-flash-lite',
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4o',
  ollama: 'llama3.3',
}

const PROVIDER_CATEGORY: Record<IntegrationProvider, 'llm' | 'media' | 'local'> = {
  gemini: 'llm',
  anthropic: 'llm',
  openai: 'llm',
  ollama: 'local',
  runware: 'media',
}

export async function getProviderSecret(provider: KeyedProvider): Promise<string> {
  try {
    const stored = await getStoredSecret(provider)
    if (stored) return stored
  } catch {
    // Fall back to env/local configuration if Supabase settings are unavailable.
  }
  return getKey(provider)
}

async function getProviderModel(provider: AIProvider): Promise<string> {
  try {
    const stored = await getStoredIntegration(provider)
    if (stored?.defaultModel) return stored.defaultModel
  } catch {
    // Fall back to code defaults.
  }
  return DEFAULT_MODEL[provider]
}

async function getOllamaBaseUrl(): Promise<string> {
  try {
    const stored = await getStoredIntegration('ollama')
    if (stored?.baseUrl) return stored.baseUrl
  } catch {
    // Fall back to development/env settings.
  }
  return getKeyStatus().ollamaBaseUrl
}

export async function getAIIntegrationStatus(): Promise<AIIntegrationStatus> {
  const legacy = getKeyStatus()
  const [gemini, anthropic, openai, runware, ollama, models] = await Promise.all([
    getProviderSecret('gemini'),
    getProviderSecret('anthropic'),
    getProviderSecret('openai'),
    getProviderSecret('runware'),
    getStoredIntegration('ollama').catch(() => null),
    Promise.all((['gemini', 'anthropic', 'openai', 'ollama'] as AIProvider[]).map(getProviderModel)),
  ])

  return {
    gemini: Boolean(gemini),
    anthropic: Boolean(anthropic),
    openai: Boolean(openai),
    runware: Boolean(runware),
    ollamaBaseUrl: ollama?.baseUrl || legacy.ollamaBaseUrl,
    defaultProvider: legacy.defaultProvider,
    models: {
      gemini: models[0],
      anthropic: models[1],
      openai: models[2],
      ollama: models[3],
    },
  }
}

export async function saveAIIntegrationSettings(input: {
  provider: IntegrationProvider
  secret?: string
  clearSecret?: boolean
  defaultModel?: string | null
  baseUrl?: string | null
  enabled?: boolean
}): Promise<void> {
  await saveStoredIntegration({
    provider: input.provider,
    category: PROVIDER_CATEGORY[input.provider],
    secret: input.secret,
    clearSecret: input.clearSecret,
    defaultModel: input.defaultModel,
    baseUrl: input.baseUrl,
    enabled: input.enabled,
  })
}

export interface GenerateTextOptions {
  provider?: AIProvider
  model?: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  jsonMode?: boolean
}

function extractGeminiText(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const payload = data as {
    output_text?: string
    steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>
  }
  if (typeof payload.output_text === 'string') return payload.output_text
  return (payload.steps ?? [])
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('')
}

async function generateWithGemini(prompt: string, model: string, options: GenerateTextOptions): Promise<string> {
  const apiKey = await getProviderSecret('gemini')
  if (!apiKey) throw new Error('Gemini API key not configured. Go to AI Integrations.')

  const body: Record<string, unknown> = {
    model,
    input: prompt,
    store: false,
  }
  if (options.systemPrompt) body.system_instruction = options.systemPrompt
  if (options.jsonMode) {
    body.response_format = { type: 'text', mime_type: 'application/json' }
  }

  const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
      'Api-Revision': '2026-05-20',
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) throw new Error(`Gemini error ${resp.status}: ${await resp.text()}`)
  const data = await resp.json()
  const text = extractGeminiText(data)
  if (!text) throw new Error('Gemini returned no text output')
  return text
}

async function generateWithAnthropic(prompt: string, model: string, options: GenerateTextOptions): Promise<string> {
  const apiKey = await getProviderSecret('anthropic')
  if (!apiKey) throw new Error('Anthropic API key not configured. Go to AI Integrations.')

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })
  const userContent = options.jsonMode ? `${prompt}\n\nReturn valid JSON only.` : prompt

  const message = await client.messages.create({
    model,
    max_tokens: options.maxTokens ?? 1024,
    ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
    messages: [{ role: 'user', content: userContent }],
  })

  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
}

async function generateWithOpenAI(prompt: string, model: string, options: GenerateTextOptions): Promise<string> {
  const apiKey = await getProviderSecret('openai')
  if (!apiKey) throw new Error('OpenAI API key not configured. Go to AI Integrations.')

  const messages: Array<{ role: string; content: string }> = []
  if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt })
  messages.push({ role: 'user', content: prompt })

  const body: Record<string, unknown> = { model, max_tokens: options.maxTokens ?? 1024, messages }
  if (options.jsonMode) body.response_format = { type: 'json_object' }

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })
  if (!resp.ok) throw new Error(`OpenAI error ${resp.status}: ${await resp.text()}`)

  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return data.choices?.[0]?.message?.content ?? ''
}

async function generateWithOllama(prompt: string, model: string, options: GenerateTextOptions): Promise<string> {
  const base = await getOllamaBaseUrl()
  const messages: Array<{ role: string; content: string }> = []
  if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt })
  messages.push({ role: 'user', content: prompt })

  const body: Record<string, unknown> = { model, messages, stream: false }
  if (options.jsonMode) body.format = 'json'

  const resp = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) throw new Error(`Ollama error ${resp.status}: ${await resp.text()}`)

  const data = (await resp.json()) as { message?: { content?: string } }
  return data.message?.content ?? ''
}

export async function generateText(prompt: string, options: GenerateTextOptions = {}): Promise<string> {
  const provider = options.provider ?? getKeyStatus().defaultProvider
  const model = options.model ?? await getProviderModel(provider)

  switch (provider) {
    case 'gemini':
      return generateWithGemini(prompt, model, options)
    case 'anthropic':
      return generateWithAnthropic(prompt, model, options)
    case 'openai':
      return generateWithOpenAI(prompt, model, options)
    case 'ollama':
      return generateWithOllama(prompt, model, options)
    default:
      throw new Error(`Unknown provider: ${provider as string}`)
  }
}
