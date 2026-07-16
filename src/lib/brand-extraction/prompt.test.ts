import { describe, it, expect } from 'vitest'
import { buildExtractionPrompt, parseExtractionResponse } from './prompt'

describe('buildExtractionPrompt', () => {
  it('includes the source note and source text in the prompt', () => {
    const prompt = buildExtractionPrompt('Some brand text', 'Extracted from example.com')
    expect(prompt).toContain('Extracted from example.com')
    expect(prompt).toContain('Some brand text')
  })
})

describe('parseExtractionResponse', () => {
  it('parses a clean JSON response with all fields', () => {
    const raw = JSON.stringify({
      niche: 'home warranty tracking',
      audience: 'property hosts',
      tone: 'friendly',
      goals: ['grow signups'],
      products: ['SnapRegister'],
      targetAudience: ['hosts'],
      keyMessages: ['stay organized'],
      voiceTone: 'friendly',
      voicePersonality: 'helpful',
    })
    const info = parseExtractionResponse(raw, 'Extracted from example.com')
    expect(info).toEqual({
      niche: 'home warranty tracking',
      audience: 'property hosts',
      tone: 'friendly',
      goals: ['grow signups'],
      products: ['SnapRegister'],
      targetAudience: ['hosts'],
      keyMessages: ['stay organized'],
      voiceTone: 'friendly',
      voicePersonality: 'helpful',
      sourceNote: 'Extracted from example.com',
    })
  })

  it('extracts JSON wrapped in prose or code fences', () => {
    const raw = 'Sure! Here you go:\n```json\n{"niche":"tools"}\n```\nHope that helps.'
    const info = parseExtractionResponse(raw, 'src')
    expect(info.niche).toBe('tools')
  })

  it('converts empty strings and empty arrays to undefined', () => {
    const raw = JSON.stringify({ niche: '', goals: [], products: ['  '] })
    const info = parseExtractionResponse(raw, 'src')
    expect(info.niche).toBeUndefined()
    expect(info.goals).toBeUndefined()
    expect(info.products).toBeUndefined()
  })

  it('leaves missing fields as undefined', () => {
    const info = parseExtractionResponse('{}', 'src')
    expect(info.niche).toBeUndefined()
    expect(info.audience).toBeUndefined()
    expect(info.sourceNote).toBe('src')
  })

  it('throws when the response contains no JSON object', () => {
    expect(() => parseExtractionResponse('I could not extract anything.', 'src')).toThrow(
      /did not contain valid JSON/
    )
  })
})
