import { describe, it, expect } from 'vitest'
import { extractLinkedInUrn, extractTikTokVideoId, extractPostIdentifier } from './parse'

describe('extractLinkedInUrn', () => {
  it('returns a raw activity URN unchanged', () => {
    expect(extractLinkedInUrn('urn:li:activity:7012345678901234567')).toBe(
      'urn:li:activity:7012345678901234567'
    )
  })

  it('normalises share and ugcPost URNs', () => {
    expect(extractLinkedInUrn('urn:li:share:123')).toBe('urn:li:share:123')
    expect(extractLinkedInUrn('urn:li:ugcPost:456')).toBe('urn:li:ugcPost:456')
  })

  it('extracts a URN embedded in a /feed/update/ URL', () => {
    expect(
      extractLinkedInUrn('https://www.linkedin.com/feed/update/urn:li:activity:7012345678901234567/')
    ).toBe('urn:li:activity:7012345678901234567')
  })

  it('extracts a URL-encoded URN', () => {
    expect(
      extractLinkedInUrn(
        'https://www.linkedin.com/feed/update/urn%3Ali%3Aactivity%3A7012345678901234567/'
      )
    ).toBe('urn:li:activity:7012345678901234567')
  })

  it('extracts the activity id from a /posts/ share URL slug', () => {
    expect(
      extractLinkedInUrn(
        'https://www.linkedin.com/posts/jane-doe_marketing-tips-activity-7012345678901234567-AbCd'
      )
    ).toBe('urn:li:activity:7012345678901234567')
  })

  it('treats a bare numeric id as an activity id', () => {
    expect(extractLinkedInUrn('7012345678901234567')).toBe('urn:li:activity:7012345678901234567')
  })

  it('returns null for empty or non-post input', () => {
    expect(extractLinkedInUrn('')).toBeNull()
    expect(extractLinkedInUrn('   ')).toBeNull()
    expect(extractLinkedInUrn('https://www.linkedin.com/company/acme/')).toBeNull()
  })
})

describe('extractTikTokVideoId', () => {
  it('returns a bare numeric id unchanged', () => {
    expect(extractTikTokVideoId('7212345678901234567')).toBe('7212345678901234567')
  })

  it('extracts the id from a canonical video URL', () => {
    expect(
      extractTikTokVideoId('https://www.tiktok.com/@someuser/video/7212345678901234567')
    ).toBe('7212345678901234567')
  })

  it('extracts the id from a video URL with query params', () => {
    expect(
      extractTikTokVideoId('https://www.tiktok.com/@someuser/video/7212345678901234567?is_from_webapp=1')
    ).toBe('7212345678901234567')
  })

  it('extracts the id from a /photo/ URL', () => {
    expect(extractTikTokVideoId('https://www.tiktok.com/@u/photo/7212345678901234567')).toBe(
      '7212345678901234567'
    )
  })

  it('returns null for short links that need resolving', () => {
    expect(extractTikTokVideoId('https://vm.tiktok.com/ZMabcdef/')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(extractTikTokVideoId('')).toBeNull()
    expect(extractTikTokVideoId('  ')).toBeNull()
  })
})

describe('extractPostIdentifier', () => {
  it('routes LinkedIn input to the URN parser (case-insensitive)', () => {
    expect(extractPostIdentifier('linkedin', 'urn:li:activity:123')).toBe('urn:li:activity:123')
  })

  it('routes TikTok input to the video-id parser', () => {
    expect(extractPostIdentifier('TIKTOK', 'https://www.tiktok.com/@u/video/999')).toBe('999')
  })

  it('returns null for platforms that are not id-driven', () => {
    expect(extractPostIdentifier('FACEBOOK', 'https://facebook.com/post/1')).toBeNull()
    expect(extractPostIdentifier('YOUTUBE', 'anything')).toBeNull()
  })
})
