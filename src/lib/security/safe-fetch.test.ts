import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))
global.fetch = fetchMock as unknown as typeof fetch

const { isPublicHttpUrlMock } = vi.hoisted(() => ({
  isPublicHttpUrlMock: vi.fn(async (url: string) => !url.includes('169.254') && !url.includes('localhost')),
}))
vi.mock('./url-safety', () => ({ isPublicHttpUrl: isPublicHttpUrlMock }))

beforeEach(() => {
  fetchMock.mockReset()
  isPublicHttpUrlMock.mockClear()
})

import { fetchPublicUrl } from './safe-fetch'

function response(status: number, headers: Record<string, string> = {}) {
  return {
    status,
    headers: { get: (key: string) => headers[key.toLowerCase()] ?? null },
  } as Response
}

describe('fetchPublicUrl', () => {
  it('returns the response directly for a public URL with no redirect', async () => {
    fetchMock.mockResolvedValue(response(200))
    const res = await fetchPublicUrl('https://example.com')
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith('https://example.com', expect.objectContaining({ redirect: 'manual' }))
  })

  it('rejects a URL that fails initial validation without calling fetch', async () => {
    await expect(fetchPublicUrl('http://localhost')).rejects.toThrow('That URL is not allowed.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('follows a redirect to another public URL', async () => {
    fetchMock
      .mockResolvedValueOnce(response(302, { location: 'https://example.com/final' }))
      .mockResolvedValueOnce(response(200))
    const res = await fetchPublicUrl('https://example.com/start')
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://example.com/final', expect.objectContaining({ redirect: 'manual' }))
  })

  it('rejects when a redirect points at a private/internal address', async () => {
    fetchMock.mockResolvedValueOnce(response(302, { location: 'http://169.254.169.254/latest/meta-data' }))
    await expect(fetchPublicUrl('https://example.com/start')).rejects.toThrow('That URL is not allowed.')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('resolves a relative Location header against the current URL', async () => {
    fetchMock
      .mockResolvedValueOnce(response(302, { location: '/final' }))
      .mockResolvedValueOnce(response(200))
    await fetchPublicUrl('https://example.com/start')
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://example.com/final', expect.objectContaining({ redirect: 'manual' }))
  })

  it('throws when a redirect response has no Location header', async () => {
    fetchMock.mockResolvedValueOnce(response(302))
    await expect(fetchPublicUrl('https://example.com')).rejects.toThrow('no Location header')
  })

  it('throws after too many redirects', async () => {
    fetchMock.mockResolvedValue(response(302, { location: 'https://example.com/next' }))
    await expect(fetchPublicUrl('https://example.com')).rejects.toThrow('Too many redirects')
  })
})
