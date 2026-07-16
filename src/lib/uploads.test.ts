import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mkdirSync, writeFileSync } = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('fs', () => ({
  default: { mkdirSync, writeFileSync },
  mkdirSync,
  writeFileSync,
}))

const { randomUUID } = vi.hoisted(() => ({ randomUUID: vi.fn(() => 'fixed-uuid') }))
vi.mock('crypto', () => ({ randomUUID }))

import { sanitizeFilename, isAllowedImageExtension, isWithinSizeLimit, saveLogoBuffer, isValidLogoUrl } from './uploads'

beforeEach(() => {
  mkdirSync.mockReset()
  writeFileSync.mockReset()
})

describe('sanitizeFilename', () => {
  it('lowercases and replaces unsafe characters with dashes', () => {
    expect(sanitizeFilename('My Logo File!.PNG')).toBe('my-logo-file-.png')
  })

  it('collapses repeated dashes', () => {
    expect(sanitizeFilename('a   b---c.png')).toBe('a-b-c.png')
  })
})

describe('isAllowedImageExtension', () => {
  it('allows png, jpg, jpeg, svg, webp case-insensitively', () => {
    expect(isAllowedImageExtension('logo.PNG')).toBe(true)
    expect(isAllowedImageExtension('logo.jpg')).toBe(true)
    expect(isAllowedImageExtension('logo.jpeg')).toBe(true)
    expect(isAllowedImageExtension('logo.svg')).toBe(true)
    expect(isAllowedImageExtension('logo.webp')).toBe(true)
  })

  it('rejects other extensions', () => {
    expect(isAllowedImageExtension('logo.gif')).toBe(false)
    expect(isAllowedImageExtension('logo.exe')).toBe(false)
  })
})

describe('isWithinSizeLimit', () => {
  it('allows exactly 5MB', () => {
    expect(isWithinSizeLimit(5 * 1024 * 1024)).toBe(true)
  })

  it('rejects over 5MB', () => {
    expect(isWithinSizeLimit(5 * 1024 * 1024 + 1)).toBe(false)
  })
})

describe('saveLogoBuffer', () => {
  it('creates the upload directory and writes the file, returning a public URL', () => {
    const url = saveLogoBuffer(Buffer.from('fake-image-bytes'), 'My Logo.png')

    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('uploads'), { recursive: true })
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('fixed-uuid-my-logo.png'),
      Buffer.from('fake-image-bytes')
    )
    expect(url).toBe('/uploads/logos/fixed-uuid-my-logo.png')
  })
})

describe('isValidLogoUrl', () => {
  it('accepts a relative path starting with /', () => {
    expect(isValidLogoUrl('/uploads/logos/abc-logo.png')).toBe(true)
  })

  it('accepts an absolute https URL', () => {
    expect(isValidLogoUrl('https://example.com/logo.png')).toBe(true)
  })

  it('accepts an absolute http URL', () => {
    expect(isValidLogoUrl('http://example.com/logo.png')).toBe(true)
  })

  it('rejects a bare filename with no leading slash and no scheme', () => {
    expect(isValidLogoUrl('logo.png')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isValidLogoUrl('')).toBe(false)
  })

  it('rejects a non-http(s) scheme', () => {
    expect(isValidLogoUrl('ftp://example.com/logo.png')).toBe(false)
  })
})
