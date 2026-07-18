import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── fs mock (backs loadKeys/saveKeys/getKey) ────────────────────────────────
const { existsSync, readFileSync, writeFileSync } = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('fs', () => ({
  default: { existsSync, readFileSync, writeFileSync },
  existsSync,
  readFileSync,
  writeFileSync,
}))

// ── @google/generative-ai mock ──────────────────────────────────────────────
const { geminiGenerateContent, getGenerativeModel } = vi.hoisted(() => {
  const geminiGenerateContent = vi.fn()
  return {
    geminiGenerateContent,
    getGenerativeModel: vi.fn((_config: unknown) => ({ generateContent: geminiGenerateContent })),
  }
})

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel(config: unknown) {
      return getGenerativeModel(config)
    }
  },
}))

// ── @anthropic-ai/sdk mock ──────────────────────────────────────────────────
const { anthropicCreate } = vi.hoisted(() => ({ anthropicCreate: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: anthropicCreate }
  },
}))

import {
  loadKeys,
  saveKeys,
  getKey,
  getKeyStatus,
  generateText,
} from './providers'

function storedKeys(keys: Record<string, string>) {
  existsSync.mockReturnValue(true)
  readFileSync.mockReturnValue(JSON.stringify(keys))
}

const originalEnv = { ...process.env }
const originalFetch = global.fetch

beforeEach(() => {
  existsSync.mockReset()
  readFileSync.mockReset()
  writeFileSync.mockReset()
  geminiGenerateContent.mockReset()
  getGenerativeModel.mockClear()
  anthropicCreate.mockReset()
  process.env = { ...originalEnv }
  delete process.env.GEMINI_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.OPENAI_API_KEY
  delete process.env.RUNWARE_API_KEY
  existsSync.mockReturnValue(false)
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('loadKeys', () => {
  it('returns an empty object when the keys file does not exist', () => {
    existsSync.mockReturnValue(false)
    expect(loadKeys()).toEqual({})
  })

  it('parses stored keys from the keys file', () => {
    storedKeys({ gemini: 'g-key' })
    expect(loadKeys()).toEqual({ gemini: 'g-key' })
  })

  it('returns an empty object when the keys file is corrupt', () => {
    existsSync.mockReturnValue(true)
    readFileSync.mockReturnValue('not json')
    expect(loadKeys()).toEqual({})
  })
})

describe('saveKeys', () => {
  it('writes keys to disk as formatted JSON', () => {
    saveKeys({ gemini: 'g-key' })
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.provider-keys.json'),
      JSON.stringify({ gemini: 'g-key' }, null, 2),
      'utf-8'
    )
  })
})

describe('getKey', () => {
  it('prefers a stored key over the env fallback', () => {
    storedKeys({ gemini: 'stored' })
    process.env.GEMINI_API_KEY = 'env-key'
    expect(getKey('gemini')).toBe('stored')
  })

  it('falls back to the env var when no stored key exists', () => {
    existsSync.mockReturnValue(false)
    process.env.ANTHROPIC_API_KEY = 'env-anthropic'
    expect(getKey('anthropic')).toBe('env-anthropic')
  })

  it('returns an empty string for ollama, which has no key', () => {
    existsSync.mockReturnValue(false)
    expect(getKey('ollama')).toBe('')
  })
})

describe('getKeyStatus', () => {
  it('reports configured booleans without leaking key values, plus defaults', () => {
    storedKeys({ gemini: 'g-key' })
    const status = getKeyStatus()
    expect(status).toEqual({
      gemini: true,
      anthropic: false,
      openai: false,
      runware: false,
      ollamaBaseUrl: 'http://localhost:11434',
      defaultProvider: 'gemini',
    })
  })

  it('honours a stored ollamaBaseUrl and defaultProvider', () => {
    storedKeys({ anthropic: 'a-key', ollamaBaseUrl: 'http://box:11434', defaultProvider: 'anthropic' })
    const status = getKeyStatus()
    expect(status.ollamaBaseUrl).toBe('http://box:11434')
    expect(status.defaultProvider).toBe('anthropic')
    expect(status.anthropic).toBe(true)
  })
})

describe('generateText — gemini', () => {
  it('throws a clear error when no key is configured', async () => {
    await expect(generateText('hi', { provider: 'gemini' })).rejects.toThrow(/Gemini API key not configured/)
  })

  it('calls the Gemini SDK with the system prompt and returns the text', async () => {
    storedKeys({ gemini: 'g-key' })
    geminiGenerateContent.mockResolvedValue({ response: { text: () => 'hello from gemini' } })

    const text = await generateText('say hi', {
      provider: 'gemini',
      systemPrompt: 'be nice',
      jsonMode: true,
    })

    expect(text).toBe('hello from gemini')
    expect(getGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInstruction: 'be nice',
        generationConfig: expect.objectContaining({ responseMimeType: 'application/json' }),
      })
    )
    expect(geminiGenerateContent).toHaveBeenCalledWith('say hi')
  })
})

describe('generateText — anthropic', () => {
  it('throws a clear error when no key is configured', async () => {
    await expect(generateText('hi', { provider: 'anthropic' })).rejects.toThrow(/Anthropic API key not configured/)
  })

  it('calls the Anthropic SDK and returns the concatenated text blocks', async () => {
    storedKeys({ anthropic: 'a-key' })
    anthropicCreate.mockResolvedValue({ content: [{ type: 'text', text: 'hello from claude' }] })

    const text = await generateText('say hi', { provider: 'anthropic', systemPrompt: 'be nice' })

    expect(text).toBe('hello from claude')
    expect(anthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({ system: 'be nice', messages: [{ role: 'user', content: 'say hi' }] })
    )
  })

  it('appends a JSON instruction to the prompt in jsonMode (no native JSON mode)', async () => {
    storedKeys({ anthropic: 'a-key' })
    anthropicCreate.mockResolvedValue({ content: [{ type: 'text', text: '{}' }] })

    await generateText('say hi', { provider: 'anthropic', jsonMode: true })

    expect(anthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: expect.stringContaining('Return valid JSON only') }],
      })
    )
  })
})

describe('generateText — openai', () => {
  it('throws a clear error when no key is configured', async () => {
    await expect(generateText('hi', { provider: 'openai' })).rejects.toThrow(/OpenAI API key not configured/)
  })

  it('calls the OpenAI chat completions endpoint and returns the message content', async () => {
    storedKeys({ openai: 'o-key' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hello from gpt' } }] }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const text = await generateText('say hi', { provider: 'openai', systemPrompt: 'be nice', jsonMode: true })

    expect(text).toBe('hello from gpt')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer o-key')
    const body = JSON.parse(init.body)
    expect(body.messages).toEqual([
      { role: 'system', content: 'be nice' },
      { role: 'user', content: 'say hi' },
    ])
    expect(body.response_format).toEqual({ type: 'json_object' })
  })

  it('throws with status and body when the response is not ok', async () => {
    storedKeys({ openai: 'o-key' })
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid api key',
    }) as unknown as typeof fetch

    await expect(generateText('hi', { provider: 'openai' })).rejects.toThrow(/OpenAI error 401/)
  })
})

describe('generateText — ollama', () => {
  it('calls the local Ollama server with no key required', async () => {
    existsSync.mockReturnValue(false)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: 'hello from llama' } }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const text = await generateText('say hi', { provider: 'ollama' })

    expect(text).toBe('hello from llama')
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:11434/api/chat')
  })

  it('uses a stored custom ollamaBaseUrl', async () => {
    storedKeys({ ollamaBaseUrl: 'http://box:11434' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: 'hi' } }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    await generateText('say hi', { provider: 'ollama' })

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://box:11434/api/chat')
  })
})

describe('generateText — default provider selection', () => {
  it('uses the stored defaultProvider when no provider option is passed', async () => {
    storedKeys({ anthropic: 'a-key', defaultProvider: 'anthropic' })
    anthropicCreate.mockResolvedValue({ content: [{ type: 'text', text: 'default routed' }] })

    const text = await generateText('say hi')

    expect(text).toBe('default routed')
    expect(anthropicCreate).toHaveBeenCalled()
  })
})

describe('getKey — runware', () => {
  it('prefers a stored runware key over the env fallback', () => {
    storedKeys({ runware: 'stored-rw' })
    process.env.RUNWARE_API_KEY = 'env-rw'
    expect(getKey('runware')).toBe('stored-rw')
  })

  it('falls back to the env var when no stored runware key exists', () => {
    existsSync.mockReturnValue(false)
    process.env.RUNWARE_API_KEY = 'env-rw'
    expect(getKey('runware')).toBe('env-rw')
  })
})

describe('getKeyStatus — runware', () => {
  it('reports runware as configured when a key is stored', () => {
    storedKeys({ runware: 'rw-key' })
    expect(getKeyStatus().runware).toBe(true)
  })

  it('reports runware as not configured when no key is stored', () => {
    existsSync.mockReturnValue(false)
    expect(getKeyStatus().runware).toBe(false)
  })
})
