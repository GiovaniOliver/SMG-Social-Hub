import type { Platform } from '@/types'
import { PLATFORMS } from '@/types'
import type { ParsedBrand } from '@/lib/brands'

export type ContentFormat = 'Image' | 'Video' | 'Short' | 'Article' | 'Thread'

const CONTENT_FORMATS: ContentFormat[] = ['Image', 'Video', 'Short', 'Article', 'Thread']

export interface RoadmapWeek {
  week: number
  theme: string
  goals: string[]
}

export interface Roadmap {
  weeks: RoadmapWeek[]
}

export interface SkeletonPiece {
  day: number
  platform: Platform
  format: ContentFormat
  title: string
}

export interface HydratedFields {
  hook: string
  body: string
  visualPrompt: string
}

const CONTENT_SYSTEMS: Record<ContentFormat, { system: string; instructions: string; structure: string }> = {
  Video: {
    system: 'You are a world-class Video Producer, Cinematographer, and Visual Storyteller.',
    instructions:
      'Create high-fidelity, cinematic video prompts that tell a story. Focus on: 1. Narrative Arc (start, middle, end), 2. Camera Movement (dynamic tracking, sweeping pans, slow-zoom, handheld), 3. Lighting (cinematic, volumetric, high-contrast, Rembrandt, or soft natural), 4. Atmospheric details (particles, depth of field, motion blur), 5. Subject action (fluid, intentional, emotionally resonant). Use technical film terms and sensory language.',
    structure: 'Narrative Context, Subject Action, Camera Path & Lens Choice, Lighting & Atmosphere, Color Grade & Texture.',
  },
  Short: {
    system: 'You are a master of Viral Vertical Video and High-Impact Visual Storytelling.',
    instructions:
      'Create scroll-stopping vertical video prompts for mobile. Focus on: 1. Immediate Visual Hook (vibrant colors, unexpected movement, extreme close-up), 2. Fast-paced transitions, 3. Visual Density (rich textures, layering), 4. Trendy aesthetic. Punchy, visually dense, optimized for 9:16.',
    structure: 'Hook Visual, Main Action, Dynamic Camera Movement, Style/Vibe & Lighting.',
  },
  Image: {
    system: 'You are a world-class Art Director and Photographer.',
    instructions:
      'Focus on composition, lighting (golden hour, soft studio, etc.), and aesthetic consistency. Describe textures, colors, and vibe in detail.',
    structure: 'Subject, Environment, Lighting, Style, Technical Specs.',
  },
  Article: {
    system: 'You are a top-tier Thought Leader and SEO Copywriter.',
    instructions: 'Focus on deep value, structured insights, and engaging narrative. Use subheadings and bullet points.',
    structure: 'Compelling Headline, Problem, Solution, Actionable Steps, Conclusion.',
  },
  Thread: {
    system: 'You are a master of Twitter/X storytelling and viral growth.',
    instructions:
      '1. Hook (Tweet 1): scroll-stopping statement or stat. 2. Build a narrative arc. 3. Each tweet = standalone value-bomb. 4. Varied sentence lengths, minimal emojis. 5. CTA at end.',
    structure: 'Tweet 1: Hook, Tweet 2: Stakes, Tweets 3-7: Core Value, Tweet 8: Summary, Tweet 9: CTA.',
  },
}

function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON object found in AI response')
  return JSON.parse(text.slice(start, end + 1))
}

function extractJsonArray(text: string): unknown {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1) return []
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
}

function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && (PLATFORMS as string[]).includes(value)
}

function isContentFormat(value: unknown): value is ContentFormat {
  return typeof value === 'string' && (CONTENT_FORMATS as string[]).includes(value)
}

export function buildRoadmapPrompt(brand: ParsedBrand, durationDays: number): string {
  const weeks = Math.ceil(durationDays / 7)
  const goalsText = brand.goals.length > 0 ? brand.goals.join(', ') : 'None specified.'
  return `Act as a Strategic Marketing Director. Create a ${weeks}-week roadmap for a ${durationDays}-day campaign.
Brand: ${brand.name}
Niche: ${brand.niche ?? 'Not specified'}
Brand goals: ${goalsText}

For each week define a central theme and 3 strategic goals.
Return valid JSON: { "weeks": [{ "week": 1, "theme": "", "goals": [] }] }`
}

export function parseRoadmapResponse(raw: string): Roadmap {
  const parsed = extractJsonObject(raw) as { weeks?: unknown }
  const weeks = Array.isArray(parsed.weeks)
    ? parsed.weeks
        .filter((w): w is Record<string, unknown> => typeof w === 'object' && w !== null)
        .map((w) => ({
          week: typeof w.week === 'number' ? w.week : 0,
          theme: typeof w.theme === 'string' ? w.theme : '',
          goals: Array.isArray(w.goals) ? w.goals.filter((g): g is string => typeof g === 'string') : [],
        }))
    : []

  if (weeks.length === 0) {
    throw new Error('AI roadmap response did not contain any weeks.')
  }

  return { weeks }
}

export function buildSkeletonPrompt(
  brand: ParsedBrand,
  roadmap: Roadmap,
  startDay: number,
  numDays: number,
  piecesPerDay: number
): string {
  const endDay = startDay + numDays - 1
  return `Act as a Content Planner. Create a content calendar skeleton for Days ${startDay} to ${endDay}.
Brand: ${brand.name}
Roadmap: ${JSON.stringify(roadmap)}

Generate ${piecesPerDay} content piece${piecesPerDay === 1 ? '' : 's'} per day. For each piece provide ONLY: day, platform (one of ${PLATFORMS.join('/')}), format (one of ${CONTENT_FORMATS.join('/')}), title.
Align titles with weekly themes.
Return valid JSON array: [{ "day": 1, "platform": "", "format": "", "title": "" }]`
}

export function parseSkeletonResponse(raw: string): SkeletonPiece[] {
  const parsed = extractJsonArray(raw)
  if (!Array.isArray(parsed)) return []

  const pieces: SkeletonPiece[] = []
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue
    const { day, platform, format, title } = item as Record<string, unknown>
    if (typeof day !== 'number') continue
    if (!isPlatform(platform)) continue
    if (!isContentFormat(format)) continue
    if (typeof title !== 'string' || !title.trim()) continue
    pieces.push({ day, platform, format, title: title.trim() })
  }
  return pieces
}

export function buildHydratePrompt(brand: ParsedBrand, piece: SkeletonPiece): string {
  const system = CONTENT_SYSTEMS[piece.format]
  return `${system.system} ${system.instructions}

Act as a world-class Copywriter and Art Director. Complete this content piece:
Brand: ${brand.name} | Niche: ${brand.niche ?? 'Not specified'} | Tone: ${brand.tone ?? 'Not specified'}
Day: ${piece.day} | Platform: ${piece.platform} | Format: ${piece.format} | Title: ${piece.title}
Structure: ${system.structure}

Generate:
1. Hook: scroll-stopping opening line
2. Body: full caption or post content
3. Visual Prompt: detailed AI image/video generation prompt

Return valid JSON: { "hook": "", "body": "", "visualPrompt": "" }`
}

export function parseHydrateResponse(raw: string): HydratedFields {
  const parsed = extractJsonObject(raw) as { hook?: unknown; body?: unknown; visualPrompt?: unknown }
  const body = typeof parsed.body === 'string' ? parsed.body.trim() : ''
  if (!body) {
    throw new Error('AI hydration response had empty body content.')
  }
  return {
    hook: typeof parsed.hook === 'string' ? parsed.hook.trim() : '',
    body,
    visualPrompt: typeof parsed.visualPrompt === 'string' ? parsed.visualPrompt.trim() : '',
  }
}
