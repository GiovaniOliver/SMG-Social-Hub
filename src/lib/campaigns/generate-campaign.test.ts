import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ParsedBrand } from '@/lib/brands'

const { generateText } = vi.hoisted(() => ({ generateText: vi.fn() }))
vi.mock('@/lib/ai/providers', () => ({ generateText }))

import { generateCampaignContent } from './generate-campaign'

function brand(overrides: Partial<ParsedBrand> = {}): ParsedBrand {
  return {
    id: 'b1',
    name: 'Acme',
    slug: 'acme',
    description: null,
    logoUrl: null,
    voice: { tone: '', personality: '', avoid: [] },
    context: { products: [], faqs: [], targetAudience: [], keyMessages: [] },
    niche: 'home organization',
    audience: 'homeowners',
    tone: 'friendly',
    goals: ['grow signups'],
    website: null,
    websiteContent: null,
    appStoreUrl: null,
    socialUrls: {},
    localFolderPath: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('generateCampaignContent', () => {
  beforeEach(() => {
    generateText.mockReset()
  })

  it('generates a roadmap, skeleton, and hydrates every piece', async () => {
    generateText
      .mockResolvedValueOnce(JSON.stringify({ weeks: [{ week: 1, theme: 'Launch', goals: [] }] })) // roadmap
      .mockResolvedValueOnce(
        JSON.stringify([
          { day: 1, platform: 'INSTAGRAM', format: 'Image', title: 'Piece 1' },
          { day: 1, platform: 'TIKTOK', format: 'Short', title: 'Piece 2' },
        ])
      ) // skeleton
      .mockResolvedValue(JSON.stringify({ hook: 'H', body: 'B', visualPrompt: 'V' })) // hydration x2

    const result = await generateCampaignContent({ brand: brand(), durationDays: 1, piecesPerDay: 2 })

    expect(result.roadmap.weeks).toHaveLength(1)
    expect(result.pieces).toHaveLength(2)
    expect(result.pieces.every((p) => !p.failed)).toBe(true)
    expect(result.pieces[0]?.body).toBe('B')
  })

  it('marks an individual piece as failed without failing the whole campaign', async () => {
    generateText
      .mockResolvedValueOnce(JSON.stringify({ weeks: [{ week: 1, theme: 'Launch', goals: [] }] })) // roadmap
      .mockResolvedValueOnce(
        JSON.stringify([
          { day: 1, platform: 'INSTAGRAM', format: 'Image', title: 'Piece 1' },
          { day: 1, platform: 'TIKTOK', format: 'Short', title: 'Piece 2' },
        ])
      ) // skeleton
      .mockResolvedValueOnce(JSON.stringify({ hook: 'H', body: 'B', visualPrompt: 'V' })) // piece 1 ok
      .mockRejectedValueOnce(new Error('provider timeout')) // piece 2 fails

    const result = await generateCampaignContent({ brand: brand(), durationDays: 1, piecesPerDay: 2 })

    expect(result.pieces).toHaveLength(2)
    const failed = result.pieces.find((p) => p.failed)
    expect(failed).toBeDefined()
    expect(failed?.body).toContain('provider timeout')
  })

  it('throws when the skeleton has no valid pieces', async () => {
    generateText
      .mockResolvedValueOnce(JSON.stringify({ weeks: [{ week: 1, theme: 'Launch', goals: [] }] })) // roadmap
      .mockResolvedValueOnce(JSON.stringify([])) // empty skeleton

    await expect(
      generateCampaignContent({ brand: brand(), durationDays: 1, piecesPerDay: 2 })
    ).rejects.toThrow(/did not generate any content pieces/)
  })
})
