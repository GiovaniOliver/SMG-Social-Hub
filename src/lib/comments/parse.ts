// Parsing helpers that turn user-pasted input (a full post URL *or* a raw
// identifier) into the specific IDs the platform comment fetchers require.
//
// These are pure functions with no I/O so they are cheap to unit-test against
// the many URL shapes each platform emits.

/**
 * Safely decode a possibly URL-encoded string. Returns the input unchanged if
 * it is not valid percent-encoding (decodeURIComponent throws on malformed %).
 */
function safeDecode(input: string): string {
  try {
    return decodeURIComponent(input)
  } catch {
    return input
  }
}

const LINKEDIN_URN_RE = /urn:li:(activity|share|ugcPost|comment):(\d+)/i
// e.g. ".../posts/jane-doe_some-slug-activity-7012345678901234567-AbCd"
const LINKEDIN_ACTIVITY_SLUG_RE = /activity[-:](\d+)/i
const DIGITS_ONLY_RE = /^\d+$/

/**
 * Extract a LinkedIn post URN (e.g. `urn:li:activity:7012345678901234567`) from
 * either a raw URN, a `/feed/update/` URL, or a `/posts/...-activity-<id>-...`
 * share URL. A bare numeric id is treated as an activity id.
 *
 * Returns null when no id can be recovered (e.g. a short link that needs
 * resolving, or a company-page URL with no post id).
 */
export function extractLinkedInUrn(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null

  const decoded = safeDecode(raw)

  const urnMatch = decoded.match(LINKEDIN_URN_RE)
  if (urnMatch) {
    return `urn:li:${urnMatch[1]}:${urnMatch[2]}`
  }

  const slugMatch = decoded.match(LINKEDIN_ACTIVITY_SLUG_RE)
  if (slugMatch) {
    return `urn:li:activity:${slugMatch[1]}`
  }

  if (DIGITS_ONLY_RE.test(decoded)) {
    return `urn:li:activity:${decoded}`
  }

  return null
}

const TIKTOK_VIDEO_PATH_RE = /\/video\/(\d+)/
const TIKTOK_PHOTO_PATH_RE = /\/photo\/(\d+)/

/**
 * Extract a TikTok video id from either a raw numeric id or a canonical
 * `https://www.tiktok.com/@user/video/<id>` (or `/photo/<id>`) URL.
 *
 * Short links (vm.tiktok.com/…) cannot be resolved without a network hop, so
 * they return null.
 */
export function extractTikTokVideoId(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null

  if (DIGITS_ONLY_RE.test(raw)) return raw

  const videoMatch = raw.match(TIKTOK_VIDEO_PATH_RE) ?? raw.match(TIKTOK_PHOTO_PATH_RE)
  if (videoMatch) return videoMatch[1]

  return null
}

/**
 * Given a platform and pasted input, return the canonical identifier the
 * fetcher needs, or null if the platform is not id-driven or the id can't be
 * parsed. Centralises the platform → parser mapping.
 */
export function extractPostIdentifier(platform: string, input: string): string | null {
  switch (platform.toUpperCase()) {
    case 'LINKEDIN':
      return extractLinkedInUrn(input)
    case 'TIKTOK':
      return extractTikTokVideoId(input)
    default:
      return null
  }
}
