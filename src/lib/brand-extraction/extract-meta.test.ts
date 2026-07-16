import { describe, it, expect } from 'vitest'
import { extractSuggestedLogo } from './extract-meta'

describe('extractSuggestedLogo', () => {
  it('finds og:image with property before content', () => {
    const html = '<meta property="og:image" content="https://example.com/logo.png">'
    expect(extractSuggestedLogo(html, 'https://example.com')).toBe('https://example.com/logo.png')
  })

  it('finds og:image with content before property', () => {
    const html = '<meta content="https://example.com/logo.png" property="og:image">'
    expect(extractSuggestedLogo(html, 'https://example.com')).toBe('https://example.com/logo.png')
  })

  it('resolves a relative og:image against the base URL', () => {
    const html = '<meta property="og:image" content="/assets/logo.png">'
    expect(extractSuggestedLogo(html, 'https://example.com/about')).toBe('https://example.com/assets/logo.png')
  })

  it('falls back to a favicon link tag when there is no og:image', () => {
    const html = '<link rel="icon" href="/favicon.ico">'
    expect(extractSuggestedLogo(html, 'https://example.com')).toBe('https://example.com/favicon.ico')
  })

  it('matches shortcut icon rel', () => {
    const html = '<link rel="shortcut icon" href="https://example.com/favicon.ico">'
    expect(extractSuggestedLogo(html, 'https://example.com')).toBe('https://example.com/favicon.ico')
  })

  it('returns null when neither og:image nor a favicon link is present', () => {
    expect(extractSuggestedLogo('<p>no meta here</p>', 'https://example.com')).toBeNull()
  })
})
