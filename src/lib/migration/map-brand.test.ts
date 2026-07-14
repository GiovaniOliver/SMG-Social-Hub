import { describe, it, expect } from 'vitest'
import { slugify, normalizeBrandKey, mapBrandEngineFields } from './map-brand'

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('Snap Registers')).toBe('snap-registers')
  })
  it('collapses non-alphanumeric runs and trims hyphens', () => {
    expect(slugify('  Quiet   Wealth!! ')).toBe('quiet-wealth')
  })
  it('handles single-word names', () => {
    expect(slugify('SnapRegister')).toBe('snapregister')
  })
})

describe('normalizeBrandKey', () => {
  it('strips all non-alphanumeric and lowercases', () => {
    expect(normalizeBrandKey('Snap Registers')).toBe('snapregisters')
    expect(normalizeBrandKey('SnapRegister')).toBe('snapregister')
  })
})

describe('mapBrandEngineFields', () => {
  it('passes through engine fields and renames settings -> engineSettings', () => {
    const bf = {
      id: 'x', name: 'SnapRegister', niche: 'n', audience: 'a', tone: 't',
      goals: '["g"]', website: 'https://w', websiteContent: 'wc',
      brandKit: '{"colors":[]}', settings: '{"provider":"gemini"}',
    }
    expect(mapBrandEngineFields(bf)).toEqual({
      niche: 'n', audience: 'a', tone: 't', goals: '["g"]',
      website: 'https://w', websiteContent: 'wc',
      brandKit: '{"colors":[]}', engineSettings: '{"provider":"gemini"}',
    })
  })
  it('defaults missing optional fields to null', () => {
    const bf = { id: 'x', name: 'N', niche: 'n', audience: 'a', tone: 't', goals: '[]' }
    const out = mapBrandEngineFields(bf)
    expect(out.website).toBeNull()
    expect(out.brandKit).toBeNull()
    expect(out.engineSettings).toBeNull()
  })
})
