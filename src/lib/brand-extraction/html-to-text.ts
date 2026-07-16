const MAX_CHARS_DEFAULT = 8000

export function stripHtmlToText(html: string, maxChars: number = MAX_CHARS_DEFAULT): string {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  const withoutStyles = withoutScripts.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const withoutTags = withoutStyles.replace(/<[^>]+>/g, ' ')
  const decoded = withoutTags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  const collapsed = decoded.replace(/\s+/g, ' ').trim()
  return collapsed.length > maxChars ? collapsed.slice(0, maxChars) : collapsed
}
