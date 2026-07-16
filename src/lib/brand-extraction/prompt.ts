import type { ExtractedBrandInfo } from './types'

export function buildExtractionPrompt(sourceText: string, sourceNote: string): string {
  return `You are extracting brand profile information from raw source text for a marketing tool.

SOURCE: ${sourceNote}

SOURCE TEXT:
${sourceText}

Extract what you can find about this brand. Only include a field if the source text actually supports it — do not invent details. Return valid JSON only, no other text, in this exact shape:
{
  "niche": "one-line description of what the brand does, or empty string",
  "audience": "who the brand serves, or empty string",
  "tone": "how the brand communicates (e.g. professional, playful), or empty string",
  "goals": ["array of business goals mentioned, or empty array"],
  "products": ["array of products/services mentioned, or empty array"],
  "targetAudience": ["array of audience segments, or empty array"],
  "keyMessages": ["array of key marketing messages/value props, or empty array"],
  "voiceTone": "one or two words for brand voice tone, or empty string",
  "voicePersonality": "one or two words for brand personality, or empty string"
}`
}

export function parseExtractionResponse(raw: string, sourceNote: string): ExtractedBrandInfo {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) {
    throw new Error('AI response did not contain valid JSON')
  }

  const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>

  const asString = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined
  const asStringArray = (v: unknown): string[] | undefined => {
    if (!Array.isArray(v)) return undefined
    const filtered = v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    return filtered.length > 0 ? filtered : undefined
  }

  return {
    niche: asString(parsed.niche),
    audience: asString(parsed.audience),
    tone: asString(parsed.tone),
    goals: asStringArray(parsed.goals),
    products: asStringArray(parsed.products),
    targetAudience: asStringArray(parsed.targetAudience),
    keyMessages: asStringArray(parsed.keyMessages),
    voiceTone: asString(parsed.voiceTone),
    voicePersonality: asString(parsed.voicePersonality),
    sourceNote,
  }
}
