import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    brand: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))
import { parseGoals, parseSocialUrls } from './brands'

describe('parseGoals', () => {
  it('returns an empty array for null', () => {
    expect(parseGoals(null)).toEqual([])
  })

  it('parses a JSON string array', () => {
    expect(parseGoals('["grow signups", "reduce churn"]')).toEqual(['grow signups', 'reduce churn'])
  })

  it('filters out non-string entries', () => {
    expect(parseGoals('["a", 1, null, "b"]')).toEqual(['a', 'b'])
  })

  it('returns an empty array for malformed JSON', () => {
    expect(parseGoals('not json')).toEqual([])
  })

  it('returns an empty array when the JSON is not an array', () => {
    expect(parseGoals('{"a":1}')).toEqual([])
  })
})

describe('parseSocialUrls', () => {
  it('returns an empty object for null', () => {
    expect(parseSocialUrls(null)).toEqual({})
  })

  it('parses known platform keys and trims values', () => {
    expect(parseSocialUrls('{"FACEBOOK":" https://fb.com/acme ","INSTAGRAM":"https://ig.com/acme"}')).toEqual({
      FACEBOOK: 'https://fb.com/acme',
      INSTAGRAM: 'https://ig.com/acme',
    })
  })

  it('drops unknown keys and empty values', () => {
    expect(parseSocialUrls('{"FACEBOOK":"https://fb.com/acme","MYSPACE":"https://myspace.com/acme","TWITTER":""}')).toEqual({
      FACEBOOK: 'https://fb.com/acme',
    })
  })

  it('returns an empty object for malformed JSON', () => {
    expect(parseSocialUrls('not json')).toEqual({})
  })
})
