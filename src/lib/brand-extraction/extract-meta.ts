export function extractSuggestedLogo(html: string, baseUrl: string): string | null {
  const ogImageMatch =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
  if (ogImageMatch?.[1]) return resolveUrl(ogImageMatch[1], baseUrl)

  const iconMatch =
    html.match(/<link[^>]+rel=["'](?:shortcut icon|icon)["'][^>]+href=["']([^"']+)["']/i) ??
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut icon|icon)["']/i)
  if (iconMatch?.[1]) return resolveUrl(iconMatch[1], baseUrl)

  return null
}

function resolveUrl(candidate: string, baseUrl: string): string {
  try {
    return new URL(candidate, baseUrl).toString()
  } catch {
    return candidate
  }
}
