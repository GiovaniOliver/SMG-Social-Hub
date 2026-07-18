import { describe, it, expect } from 'vitest'
import {
  buildRoadmapPrompt,
  parseRoadmapResponse,
  buildSkeletonPrompt,
  parseSkeletonResponse,
  buildHydratePrompt,
  parseHydrateResponse,
} from './prompts'
import type { ParsedBrand } from '@/lib/brands'

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

describe('buildRoadmapPrompt', () => {
  it('includes brand name, niche, and goals', () => {
    const prompt = buildRoadmapPrompt(brand(), 14)
    expect(prompt).toContain('Acme')
    expect(prompt).toContain('home organization')
    expect(prompt).toContain('grow signups')
  })
})

describe('parseRoadmapResponse', () => {
  it('parses a clean JSON roadmap', () => {
    const roadmap = parseRoadmapResponse(
      JSON.stringify({ weeks: [{ week: 1, theme: 'Launch', goals: ['awareness'] }] })
    )
    expect(roadmap.weeks).toHaveLength(1)
    expect(roadmap.weeks[0]?.theme).toBe('Launch')
  })

  it('extracts JSON wrapped in prose or code fences', () => {
    const roadmap = parseRoadmapResponse(
      'Here you go:\n```json\n{"weeks":[{"week":1,"theme":"Launch","goals":[]}]}\n```'
    )
    expect(roadmap.weeks).toHaveLength(1)
  })

  it('throws when no weeks are present', () => {
    expect(() => parseRoadmapResponse(JSON.stringify({ weeks: [] }))).toThrow(/roadmap/i)
  })

  it('throws on unparseable text', () => {
    expect(() => parseRoadmapResponse('not json at all')).toThrow()
  })
})

describe('buildSkeletonPrompt', () => {
  it('includes the day range and pieces-per-day instruction', () => {
    const prompt = buildSkeletonPrompt(
      brand(),
      { weeks: [{ week: 1, theme: 'Launch', goals: [] }] },
      1,
      7,
      2
    )
    expect(prompt).toContain('Days 1 to 7')
    expect(prompt).toContain('2 content piece')
  })
})

describe('parseSkeletonResponse', () => {
  it('parses valid pieces', () => {
    const pieces = parseSkeletonResponse(
      JSON.stringify([
        { day: 1, platform: 'INSTAGRAM', format: 'Image', title: 'Piece 1' },
        { day: 1, platform: 'TIKTOK', format: 'Short', title: 'Piece 2' },
      ])
    )
    expect(pieces).toHaveLength(2)
    expect(pieces[0]?.platform).toBe('INSTAGRAM')
  })

  it('drops entries with an invalid platform or format', () => {
    const pieces = parseSkeletonResponse(
      JSON.stringify([
        { day: 1, platform: 'INSTAGRAM', format: 'Image', title: 'Valid' },
        { day: 1, platform: 'NOT_A_PLATFORM', format: 'Image', title: 'Invalid platform' },
        { day: 1, platform: 'INSTAGRAM', format: 'NotAFormat', title: 'Invalid format' },
      ])
    )
    expect(pieces).toHaveLength(1)
    expect(pieces[0]?.title).toBe('Valid')
  })

  it('returns an empty array for unparseable text', () => {
    expect(parseSkeletonResponse('not json')).toEqual([])
  })
})

describe('buildHydratePrompt', () => {
  it('uses the format-specific system prompt and includes the piece title', () => {
    const prompt = buildHydratePrompt(brand(), {
      day: 1,
      platform: 'INSTAGRAM',
      format: 'Video',
      title: 'Piece 1',
    })
    expect(prompt).toContain('Video Producer')
    expect(prompt).toContain('Piece 1')
  })
})

describe('parseHydrateResponse', () => {
  it('parses hook/body/visualPrompt', () => {
    const fields = parseHydrateResponse(JSON.stringify({ hook: 'H', body: 'B', visualPrompt: 'V' }))
    expect(fields).toEqual({ hook: 'H', body: 'B', visualPrompt: 'V' })
  })

  it('throws when body is empty', () => {
    expect(() =>
      parseHydrateResponse(JSON.stringify({ hook: 'H', body: '', visualPrompt: 'V' }))
    ).toThrow()
  })
})
