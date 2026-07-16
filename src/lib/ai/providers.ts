import fs from 'fs'
import path from 'path'
import type Anthropic from '@anthropic-ai/sdk'

// Server-side key store — keys are never sent from the browser, only stored
// and read here. Ported from BrandFlow's server.ts key-management functions.
const KEYS_FILE = path.join(process.cwd(), '.provider-keys.json')

export type AIProvider = 'gemini' | 'anthropic' | 'openai' | 'ollama'

export interface ProviderKeys {
  gemini?: string
  anthropic?: string
  openai?: string
  ollamaBaseUrl?: string
  defaultProvider?: AIProvider
}

export interface ProviderKeyStatus {
  gemini: boolean
  anthropic: boolean
  openai: boolean
  ollamaBaseUrl: string
  defaultProvider: AIProvider
}

export function loadKeys(): ProviderKeys {
  try {
    if (fs.existsSync(KEYS_FILE)) {
      return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf-8')) as ProviderKeys
    }
  } catch {
    // Corrupt or unreadable file — fall through to defaults.
  }
  return {}
}

export function saveKeys(keys: ProviderKeys): void {
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), 'utf-8')
}

const ENV_VAR: Partial<Record<AIProvider, string>> = {
  gemini: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
}

export function getKey(provider: AIProvider): string {
  const stored = loadKeys()
  const envVar = ENV_VAR[provider]
  const envFallback = envVar ? process.env[envVar] : undefined
  return stored[provider as 'gemini' | 'anthropic' | 'openai'] || envFallback || ''
}

export function getKeyStatus(): ProviderKeyStatus {
  const stored = loadKeys()
  return {
    gemini: !!getKey('gemini'),
    anthropic: !!getKey('anthropic'),
    openai: !!getKey('openai'),
    ollamaBaseUrl: stored.ollamaBaseUrl || 'http://localhost:11434',
    defaultProvider: stored.defaultProvider || 'gemini',
  }
}

export interface GenerateTextOptions {
  provider?: AIProvider
  model?: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  jsonMode?: boolean
}

const DEFAULT_MODEL: Record<AIProvider, string> = {
  gemini: 'gemini-2.0-flash-lite',
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4o',
  ollama: 'llama3.3',
}

async function generateWithGemini(prompt: string, model: string, options: GenerateTextOptions): Promise<string> {
  const apiKey = getKey('gemini')
  if (!apiKey) throw new Error('Gemini API key not configured. Go to Settings → API Keys.')

  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(apiKey)
  const genModel = genAI.getGenerativeModel({
    model,
    systemInstruction: options.systemPrompt,
    generationConfig: {
      temperature: options.temperature ?? 0.8,
      maxOutputTokens: options.maxTokens ?? 1024,
      ...(options.jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  })

  const result = await genModel.generateContent(prompt)
  return result.response.text()
}

async function generateWithAnthropic(prompt: string, model: string, options: GenerateTextOptions): Promise<string> {
  const apiKey = getKey('anthropic')
  if (!apiKey) throw new Error('Anthropic API key not configured. Go to Settings → API Keys.')

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
  const apiKey = getKey('openai')
  if (!apiKey) throw new Error('OpenAI API key not configured. Go to Settings → API Keys.')

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
  const base = getKeyStatus().ollamaBaseUrl

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

/**
 * Unified text-generation entry point across all four providers. Provider
 * defaults to the user's configured `defaultProvider` (Settings page) when
 * not specified explicitly.
 */
export async function generateText(prompt: string, options: GenerateTextOptions = {}): Promise<string> {
  const provider = options.provider ?? getKeyStatus().defaultProvider
  const model = options.model ?? DEFAULT_MODEL[provider]

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
