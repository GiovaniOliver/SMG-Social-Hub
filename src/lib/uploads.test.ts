import { describe, it, expect, vi, beforeEach } from 'vitest'

const { upload, getPublicUrl, createClient } = vi.hoisted(() => {
  const upload = vi.fn()
  const getPublicUrl = vi.fn()
  const createClient = vi.fn(() => ({
    storage: { from: () => ({ upload, getPublicUrl }) },
  }))
  return { upload, getPublicUrl, createClient }
})

vi.mock('@supabase/supabase-js', () => ({ createClient }))

const { randomUUID } = vi.hoisted(() => ({ randomUUID: vi.fn(() => 'fixed-uuid') }))
vi.mock('crypto', () => ({ randomUUID }))

import { sanitizeFilename, isAllowedImageExtension, isWithinSizeLimit, saveLogoBuffer, isValidLogoUrl } from './uploads'

const originalEnv = { ...process.env }

beforeEach(() => {
  upload.mockReset()
  getPublicUrl.mockReset()
  createClient.mockClear()
  process.env = { ...originalEnv, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key' }
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
  it('uploads to Supabase Storage and returns the public URL', async () => {
    upload.mockResolvedValue({ error: null })
    getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://example.supabase.co/storage/v1/object/public/social-hub-logos/fixed-uuid-my-logo.png' } })

    const url = await saveLogoBuffer(Buffer.from('fake-image-bytes'), 'My Logo.png')

    expect(upload).toHaveBeenCalledWith(
      'fixed-uuid-my-logo.png',
      Buffer.from('fake-image-bytes'),
      expect.objectContaining({ contentType: 'image/png' })
    )
    expect(url).toBe('https://example.supabase.co/storage/v1/object/public/social-hub-logos/fixed-uuid-my-logo.png')
  })

  it('throws when the upload fails', async () => {
    upload.mockResolvedValue({ error: { message: 'bucket not found' } })

    await expect(saveLogoBuffer(Buffer.from('x'), 'logo.png')).rejects.toThrow(/bucket not found/)
  })

  it('throws when Supabase env vars are not configured', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    await expect(saveLogoBuffer(Buffer.from('x'), 'logo.png')).rejects.toThrow(/SUPABASE_URL/)
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
