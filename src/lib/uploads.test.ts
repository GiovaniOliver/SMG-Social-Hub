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

import { sanitizeFilename, isAllowedImageExtension, isWithinSizeLimit, saveLogoBuffer } from './uploads'

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
