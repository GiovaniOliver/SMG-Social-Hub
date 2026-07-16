import dns from 'dns'
import { promisify } from 'util'

const lookup = promisify(dns.lookup)

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false
  const [a, b] = parts
  if (a === 0) return true
  if (a === 10) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower === '::1') return true
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // fc00::/7 unique-local
  if (/^fe[89ab]/.test(lower)) return true // fe80::/10 link-local
  if (lower.startsWith('::ffff:')) {
    return isPrivateIPv4(lower.replace('::ffff:', ''))
  }
  return false
}

export function isPrivateIp(ip: string): boolean {
  return ip.includes(':') ? isPrivateIPv6(ip) : isPrivateIPv4(ip)
}

/**
 * True only for well-formed http(s) URLs whose hostname resolves to a
 * public (non-private, non-loopback, non-link-local) IP address. Used to
 * block SSRF via user-supplied URLs that the server fetches on their behalf.
 */
export async function isPublicHttpUrl(urlString: string): Promise<boolean> {
  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    return false
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false

  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost') return false

  try {
    // Node's real dns.lookup has a custom promisify implementation that
    // resolves to `{ address, family }`. In tests, a mocked dns.lookup
    // invoked with a single callback result arg makes promisify resolve to
    // the bare address string instead. Support both shapes.
    const result = await lookup(hostname)
    const address = typeof result === 'string' ? result : result.address
    return !isPrivateIp(address)
  } catch {
    return false
  }
}
