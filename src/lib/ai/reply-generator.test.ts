import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BrandVoice, BrandContext } from '@/types'

// A key must be present or getClient() throws before the mocked call is reached.
process.env.ANTHROPIC_API_KEY = 'test-key'

// Mock the Anthropic SDK so generateReply can be exercised without a network call.
// vi.hoisted lets the factory (which is hoisted above imports) share the spy.
const { create } = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create }
  },
}))

import { generateReply, type ReplyGeneratorParams } from './reply-generator'

// Mirrors the Anthropic Messages API response shape: content is an array of blocks.
function mockModelText(text: string): void {
  create.mockResolvedValue({ content: [{ type: 'text', text }] })
}

const voice: BrandVoice = {
  tone: 'friendly',
  personality: 'helpful',
  avoid: ['jargon'],
}

const context: BrandContext = {
  products: ['SnapRegister'],
  faqs: [{ q: 'How do I register?', a: 'Use the setup page.' }],
  targetAudience: ['new owners'],
  keyMessages: ['stay organized'],
}

function params(overrides: Partial<ReplyGeneratorParams> = {}): ReplyGeneratorParams {
  return {
    platform: 'FACEBOOK',
    commentText: 'How do I register my product?',
    brandName: 'Acme',
    brandVoice: voice,
    brandContext: context,
    isOwned: false,
    ...overrides,
  }
}

describe('generateReply', () => {
  beforeEach(() => {
    create.mockReset()
  })

  it('parses a clean JSON response', async () => {
    mockModelText(
      JSON.stringify({ content: 'Here are the steps…', reasoning: 'Answered directly', warnings: [] })
    )
    const reply = await generateReply(params())
    expect(reply.content).toBe('Here are the steps…')
    expect(reply.reasoning).toBe('Answered directly')
    expect(reply.warnings).toBeUndefined() // empty array collapses to undefined
  })

  it('extracts JSON even when wrapped in prose or code fences', async () => {
    mockModelText(
      'Sure! Here is the reply:\n```json\n{"content":"Hello there","reasoning":"greeting","warnings":[]}\n```\nHope that helps.'
    )
    const reply = await generateReply(params())
    expect(reply.content).toBe('Hello there')
  })

  it('passes through warnings when present', async () => {
    mockModelText(
      JSON.stringify({
        content: 'Please contact support.',
        reasoning: 'Legal-sounding',
        warnings: ['possible legal issue'],
      })
    )
    const reply = await generateReply(params())
    expect(reply.warnings).toEqual(['possible legal issue'])
  })

  it('throws when the response contains no JSON object', async () => {
    mockModelText('I could not generate a reply.')
    await expect(generateReply(params())).rejects.toThrow(/did not contain valid JSON/)
  })

  it('throws when the returned content is empty', async () => {
    mockModelText(JSON.stringify({ content: '', reasoning: 'n/a', warnings: [] }))
    await expect(generateReply(params())).rejects.toThrow(/empty content/)
  })

  it('truncates content that exceeds the platform hard limit and adds a warning', async () => {
    const longContent = 'a'.repeat(300) // Twitter limit is 280
    mockModelText(JSON.stringify({ content: longContent, reasoning: 'long', warnings: [] }))
    const reply = await generateReply(params({ platform: 'TWITTER' }))
    expect(reply.content.length).toBeLessThanOrEqual(280)
    expect(reply.warnings?.some((w) => w.includes('truncated'))).toBe(true)
    expect(reply.warnings?.some((w) => w.includes('280'))).toBe(true)
  })

  it('honours an explicit maxLength over the platform default', async () => {
    const content = 'b'.repeat(100)
    mockModelText(JSON.stringify({ content, reasoning: 'x', warnings: [] }))
    const reply = await generateReply(params({ platform: 'FACEBOOK', maxLength: 50 }))
    expect(reply.content.length).toBeLessThanOrEqual(50)
    expect(reply.warnings?.some((w) => w.includes('50'))).toBe(true)
  })

  it('falls back to a 400-char limit for an unknown platform', async () => {
    const content = 'c'.repeat(500)
    mockModelText(JSON.stringify({ content, reasoning: 'x', warnings: [] }))
    const reply = await generateReply(params({ platform: 'MYSPACE' }))
    expect(reply.content.length).toBeLessThanOrEqual(400)
    expect(reply.warnings?.some((w) => w.includes('400'))).toBe(true)
  })

  it('does not truncate or warn when content is within the limit', async () => {
    mockModelText(JSON.stringify({ content: 'short and sweet', reasoning: 'x', warnings: [] }))
    const reply = await generateReply(params({ platform: 'TWITTER' }))
    expect(reply.content).toBe('short and sweet')
    expect(reply.warnings).toBeUndefined()
  })
})
