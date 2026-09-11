import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { getProviderSecret } = vi.hoisted(() => ({ getProviderSecret: vi.fn() }))
vi.mock('./providers', () => ({ getProviderSecret }))

import { generateImage, generateVideo } from './media-providers'

const originalFetch = global.fetch

beforeEach(() => {
  getProviderSecret.mockReset()
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('generateImage', () => {
  it('throws when no Runware key is configured', async () => {
    getProviderSecret.mockResolvedValue('')
    await expect(generateImage('a cat')).rejects.toThrow(/Runware API key not configured/)
  })

  it('returns the imageURL from a successful response', async () => {
    getProviderSecret.mockResolvedValue('rw-key')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ taskType: 'imageInference', imageURL: 'https://im.runware.ai/x.jpg', cost: 0.05 }],
      }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await generateImage('a golden retriever')

    expect(result).toEqual({ url: 'https://im.runware.ai/x.jpg', cost: 0.05 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.runware.ai/v1')
    expect(init.headers.Authorization).toBe('Bearer rw-key')
    const body = JSON.parse(init.body)
    expect(body[0].taskType).toBe('imageInference')
    expect(body[0].positivePrompt).toBe('a golden retriever')
  })

  it('throws when the response has no imageURL', async () => {
    getProviderSecret.mockResolvedValue('rw-key')
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{}] }),
    }) as unknown as typeof fetch

    await expect(generateImage('x')).rejects.toThrow(/no imageURL/)
  })

  it('throws with status and body when the response is not ok', async () => {
    getProviderSecret.mockResolvedValue('rw-key')
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'bad key',
    }) as unknown as typeof fetch

    await expect(generateImage('x')).rejects.toThrow(/Runware error 401/)
  })
})

describe('generateVideo', () => {
  it('throws when no Runware key is configured', async () => {
    getProviderSecret.mockResolvedValue('')
    await expect(generateVideo('a river')).rejects.toThrow(/Runware API key not configured/)
  })

  it('submits the task then polls until success', async () => {
    getProviderSecret.mockResolvedValue('rw-key')
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ taskType: 'videoInference' }] }) }) // submit
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ status: 'processing', progress: 40 }] }) }) // poll 1
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ status: 'success', videoURL: 'https://runware.ai/v.mp4', cost: 0.18 }] }),
      }) // poll 2
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await generateVideo('a river', { pollIntervalMs: 1, pollTimeoutMs: 100 })

    expect(result).toEqual({ url: 'https://runware.ai/v.mp4', cost: 0.18 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('throws on a Runware error status', async () => {
    getProviderSecret.mockResolvedValue('rw-key')
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ taskType: 'videoInference' }] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ status: 'error', errorMessage: 'nsfw content' }] }),
      })
    global.fetch = fetchMock as unknown as typeof fetch

    await expect(generateVideo('x', { pollIntervalMs: 1, pollTimeoutMs: 100 })).rejects.toThrow(
      /Runware video generation failed/
    )
  })

  it('throws a timeout error if the poll never succeeds', async () => {
    getProviderSecret.mockResolvedValue('rw-key')
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: 'processing' }] }),
    }) as unknown as typeof fetch

    await expect(generateVideo('x', { pollIntervalMs: 1, pollTimeoutMs: 5 })).rejects.toThrow(/timed out/)
  })

  it('throws immediately if a poll reports success with no videoURL, without waiting for the timeout', async () => {
    getProviderSecret.mockResolvedValue('rw-key')
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ taskType: 'videoInference' }] }) }) // submit
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ status: 'success' }] }) }) // poll: malformed
    global.fetch = fetchMock as unknown as typeof fetch

    await expect(
      generateVideo('x', { pollIntervalMs: 1, pollTimeoutMs: 5000 })
    ).rejects.toThrow(/reported success but returned no videoURL/)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws immediately when Runware reports an error in the errors array', async () => {
    getProviderSecret.mockResolvedValue('rw-key')
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [], errors: [{ message: 'invalid model' }] }),
    }) as unknown as typeof fetch

    await expect(generateVideo('x', { pollIntervalMs: 1, pollTimeoutMs: 5000 })).rejects.toThrow(
      /Runware error:.*invalid model/
    )
  })
})
