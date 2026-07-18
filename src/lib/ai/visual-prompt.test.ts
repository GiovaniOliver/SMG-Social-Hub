import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BrandVoice, BrandContext } from '@/types'

const { generateText } = vi.hoisted(() => ({ generateText: vi.fn() }))
vi.mock('./providers', () => ({ generateText }))

import { buildVisualPrompt } from './visual-prompt'

const voice: BrandVoice = { tone: 'friendly', personality: 'helpful', avoid: [] }
const context: BrandContext = { products: ['SnapRegister'], faqs: [], targetAudience: [], keyMessages: [] }

describe('buildVisualPrompt', () => {
  beforeEach(() => {
    generateText.mockReset()
  })

  it('returns the trimmed text response for an image prompt', async () => {
    generateText.mockResolvedValue('  A cozy living room, golden hour light.  ')
    const result = await buildVisualPrompt({
      mediaType: 'image',
      brandName: 'Acme',
      brandVoice: voice,
      brandContext: context,
      postContent: 'Keep your warranties organized.',
      postHook: 'Never lose a receipt again',
    })
    expect(result).toBe('A cozy living room, golden hour light.')
  })

  it('uses the video system prompt for video media type', async () => {
    generateText.mockResolvedValue('A cinematic pan across a home office.')
    await buildVisualPrompt({
      mediaType: 'video',
      brandName: 'Acme',
      brandVoice: voice,
      brandContext: context,
      postContent: 'Keep your warranties organized.',
      postHook: 'Never lose a receipt again',
    })
    const [prompt] = generateText.mock.calls[0]
    expect(prompt).toContain('Video Producer')
  })
})
