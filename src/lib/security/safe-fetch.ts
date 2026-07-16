import { isPublicHttpUrl } from './url-safety'

const DEFAULT_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 5

/**
 * Fetches a URL the way `fetch` normally would, except every hop (the
 * original URL and every redirect target) is re-validated with
 * `isPublicHttpUrl` before being requested — closing the SSRF bypass where
 * a URL that passes initial validation redirects to an internal address.
 */
export async function fetchPublicUrl(url: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<Response> {
  let currentUrl = url

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await isPublicHttpUrl(currentUrl))) {
      throw new Error('That URL is not allowed.')
    }

    const res = await fetch(currentUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })

    const isRedirect = res.status >= 300 && res.status < 400
    if (!isRedirect) {
      return res
    }

    const location = res.headers.get('location')
    if (!location) {
      throw new Error('Redirect response had no Location header')
    }
    currentUrl = new URL(location, currentUrl).toString()
  }

  throw new Error('Too many redirects')
}
