import { describe, it, expect, vi, beforeEach } from 'vitest'

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }))

vi.mock('dns', () => ({
  default: { lookup: (hostname: string, cb: (err: Error | null, address?: string) => void) => lookupMock(hostname, cb) },
  lookup: (hostname: string, cb: (err: Error | null, address?: string) => void) => lookupMock(hostname, cb),
}))

import { isPrivateIp, isPublicHttpUrl } from './url-safety'

beforeEach(() => {
  lookupMock.mockReset()
})

function mockResolvesTo(address: string) {
  lookupMock.mockImplementation((_hostname: string, cb: (err: Error | null, address?: string) => void) => cb(null, address))
}

describe('isPrivateIp', () => {
  it('flags loopback (127.x.x.x)', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true)
  })
  it('flags 10.x.x.x', () => {
    expect(isPrivateIp('10.1.2.3')).toBe(true)
  })
  it('flags 192.168.x.x', () => {
    expect(isPrivateIp('192.168.1.1')).toBe(true)
  })
  it('flags 172.16-31.x.x', () => {
    expect(isPrivateIp('172.16.0.1')).toBe(true)
    expect(isPrivateIp('172.31.255.255')).toBe(true)
    expect(isPrivateIp('172.32.0.1')).toBe(false)
  })
  it('flags link-local / cloud metadata range (169.254.x.x)', () => {
    expect(isPrivateIp('169.254.169.254')).toBe(true)
  })
  it('flags 0.x.x.x', () => {
    expect(isPrivateIp('0.0.0.0')).toBe(true)
  })
  it('allows a public IPv4 address', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false)
  })
  it('flags IPv6 loopback (::1)', () => {
    expect(isPrivateIp('::1')).toBe(true)
  })
  it('flags IPv6 unique-local (fc00::/7)', () => {
    expect(isPrivateIp('fd12:3456:789a::1')).toBe(true)
  })
  it('flags IPv6 link-local (fe80::/10)', () => {
    expect(isPrivateIp('fe80::1')).toBe(true)
  })
  it('allows a public IPv6 address', () => {
    expect(isPrivateIp('2001:4860:4860::8888')).toBe(false)
  })
})

describe('isPublicHttpUrl', () => {
  it('rejects non-http(s) schemes', async () => {
    expect(await isPublicHttpUrl('ftp://example.com')).toBe(false)
    expect(await isPublicHttpUrl('file:///etc/passwd')).toBe(false)
  })

  it('rejects malformed URLs', async () => {
    expect(await isPublicHttpUrl('not a url')).toBe(false)
  })

  it('rejects the literal hostname "localhost" without a DNS lookup', async () => {
    expect(await isPublicHttpUrl('http://localhost:3000')).toBe(false)
    expect(lookupMock).not.toHaveBeenCalled()
  })

  it('rejects when the hostname resolves to a private IP', async () => {
    mockResolvesTo('169.254.169.254')
    expect(await isPublicHttpUrl('https://metadata.internal.example')).toBe(false)
  })

  it('allows when the hostname resolves to a public IP', async () => {
    mockResolvesTo('93.184.216.34')
    expect(await isPublicHttpUrl('https://example.com')).toBe(true)
  })

  it('rejects when DNS resolution fails', async () => {
    lookupMock.mockImplementation((_hostname: string, cb: (err: Error | null, address?: string) => void) => cb(new Error('ENOTFOUND')))
    expect(await isPublicHttpUrl('https://does-not-exist.invalid')).toBe(false)
  })
})
