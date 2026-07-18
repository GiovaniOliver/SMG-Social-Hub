# Campaigns & Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing `Campaign`/`ContentPiece` Prisma models usable — create a campaign, have AI generate its full day-by-day content in one pass, view/edit/regenerate/delete pieces, and see them on a calendar.

**Architecture:** A pure generation library (`src/lib/campaigns/`) builds prompts and parses AI responses, orchestrated by one route (`POST /api/campaigns/generate`) that calls it and persists the result. Supporting CRUD routes and three new dashboard pages (`/campaigns`, `/campaigns/[id]`, `/calendar`) expose it. No schema changes — `Campaign`/`ContentPiece` already exist.

**Tech Stack:** Next.js App Router route handlers, Prisma/SQLite, Zod validation, the existing `generateText()` provider layer (`src/lib/ai/providers.ts`), Vitest for the lib layer.

## Global Constraints

- No Prisma schema changes — `Campaign` and `ContentPiece` (`prisma/schema.prisma:108-146`) already have every field this plan uses.
- `ContentPiece.platform` values must be exactly one of the Hub's `Platform` enum strings (`@/types`'s `PLATFORMS`) — not BrandFlow's mixed-case platform names.
- `ContentPiece.format` values are one of `'Image' | 'Video' | 'Short' | 'Article' | 'Thread'` (ported from BrandFlow's `CONTENT_SYSTEMS`).
- Generation is one synchronous flow: skeleton generation immediately followed by hydrating every piece in parallel (`Promise.allSettled`) — no separate manual "hydrate" step, no partial/incremental DB writes during generation.
- A single failed piece hydration must not fail the whole campaign — mark that piece `failed: true` with an explanatory `body`, matching the failure-isolation pattern already used in `src/lib/ai/content-generator.ts`'s `generateContent()`.
- API routes and `.tsx` page/component files are **not unit-tested** in this repo's convention — only the pure `src/lib/campaigns/*.ts` logic gets Vitest coverage (mocking `generateText` from `@/lib/ai/providers`, mirroring `src/lib/ai/reply-generator.test.ts`'s mocking style). Routes and pages are verified live in the browser.
- All new API responses follow this repo's `{ success: boolean, data?, error? }` shape (see any existing route in `src/app/api/brands/`).
- Dynamic route handlers use `{ params: Promise<{ id: string }> }` and `const { id } = await params` (see `src/app/api/brands/[id]/route.ts`) — this is a server-side convention. Client component pages read the same param via `useParams<{ id: string }>()` from `next/navigation`, not an awaited prop.
- New route-naming: per-content-piece endpoints live under `/api/content-pieces/*` (plural, hyphenated) — not `/api/content/*`, which is already used by Content Lab's unrelated single-post generator (`src/app/api/content/generate/route.ts`).

---

### Task 1: Campaign prompt/parsing library

**Files:**
- Create: `src/lib/campaigns/prompts.ts`
- Test: `src/lib/campaigns/prompts.test.ts`

**Interfaces:**
- Produces: `ContentFormat` type, `RoadmapWeek`/`Roadmap`/`SkeletonPiece`/`HydratedFields` interfaces, and six functions — `buildRoadmapPrompt`, `parseRoadmapResponse`, `buildSkeletonPrompt`, `parseSkeletonResponse`, `buildHydratePrompt`, `parseHydrateResponse` — all consumed by Task 2.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/campaigns/prompts.test.ts
import { describe, it, expect } from 'vitest'
import {
  buildRoadmapPrompt,
  parseRoadmapResponse,
  buildSkeletonPrompt,
  parseSkeletonResponse,
  buildHydratePrompt,
  parseHydrateResponse,
} from './prompts'
import type { ParsedBrand } from '@/lib/brands'

function brand(overrides: Partial<ParsedBrand> = {}): ParsedBrand {
  return {
    id: 'b1',
    name: 'Acme',
    slug: 'acme',
    description: null,
    logoUrl: null,
    voice: { tone: '', personality: '', avoid: [] },
    context: { products: [], faqs: [], targetAudience: [], keyMessages: [] },
    niche: 'home organization',
    audience: 'homeowners',
    tone: 'friendly',
    goals: ['grow signups'],
    website: null,
    websiteContent: null,
    appStoreUrl: null,
    socialUrls: {},
    localFolderPath: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('buildRoadmapPrompt', () => {
  it('includes brand name, niche, and goals', () => {
    const prompt = buildRoadmapPrompt(brand(), 14)
    expect(prompt).toContain('Acme')
    expect(prompt).toContain('home organization')
    expect(prompt).toContain('grow signups')
  })
})

describe('parseRoadmapResponse', () => {
  it('parses a clean JSON roadmap', () => {
    const roadmap = parseRoadmapResponse(
      JSON.stringify({ weeks: [{ week: 1, theme: 'Launch', goals: ['awareness'] }] })
    )
    expect(roadmap.weeks).toHaveLength(1)
    expect(roadmap.weeks[0]?.theme).toBe('Launch')
  })

  it('extracts JSON wrapped in prose or code fences', () => {
    const roadmap = parseRoadmapResponse(
      'Here you go:\n```json\n{"weeks":[{"week":1,"theme":"Launch","goals":[]}]}\n```'
    )
    expect(roadmap.weeks).toHaveLength(1)
  })

  it('throws when no weeks are present', () => {
    expect(() => parseRoadmapResponse(JSON.stringify({ weeks: [] }))).toThrow(/roadmap/i)
  })

  it('throws on unparseable text', () => {
    expect(() => parseRoadmapResponse('not json at all')).toThrow()
  })
})

describe('buildSkeletonPrompt', () => {
  it('includes the day range and pieces-per-day instruction', () => {
    const prompt = buildSkeletonPrompt(
      brand(),
      { weeks: [{ week: 1, theme: 'Launch', goals: [] }] },
      1,
      7,
      2
    )
    expect(prompt).toContain('Days 1 to 7')
    expect(prompt).toContain('2 content piece')
  })
})

describe('parseSkeletonResponse', () => {
  it('parses valid pieces', () => {
    const pieces = parseSkeletonResponse(
      JSON.stringify([
        { day: 1, platform: 'INSTAGRAM', format: 'Image', title: 'Piece 1' },
        { day: 1, platform: 'TIKTOK', format: 'Short', title: 'Piece 2' },
      ])
    )
    expect(pieces).toHaveLength(2)
    expect(pieces[0]?.platform).toBe('INSTAGRAM')
  })

  it('drops entries with an invalid platform or format', () => {
    const pieces = parseSkeletonResponse(
      JSON.stringify([
        { day: 1, platform: 'INSTAGRAM', format: 'Image', title: 'Valid' },
        { day: 1, platform: 'NOT_A_PLATFORM', format: 'Image', title: 'Invalid platform' },
        { day: 1, platform: 'INSTAGRAM', format: 'NotAFormat', title: 'Invalid format' },
      ])
    )
    expect(pieces).toHaveLength(1)
    expect(pieces[0]?.title).toBe('Valid')
  })

  it('returns an empty array for unparseable text', () => {
    expect(parseSkeletonResponse('not json')).toEqual([])
  })
})

describe('buildHydratePrompt', () => {
  it('uses the format-specific system prompt and includes the piece title', () => {
    const prompt = buildHydratePrompt(brand(), {
      day: 1,
      platform: 'INSTAGRAM',
      format: 'Video',
      title: 'Piece 1',
    })
    expect(prompt).toContain('Video Producer')
    expect(prompt).toContain('Piece 1')
  })
})

describe('parseHydrateResponse', () => {
  it('parses hook/body/visualPrompt', () => {
    const fields = parseHydrateResponse(JSON.stringify({ hook: 'H', body: 'B', visualPrompt: 'V' }))
    expect(fields).toEqual({ hook: 'H', body: 'B', visualPrompt: 'V' })
  })

  it('throws when body is empty', () => {
    expect(() =>
      parseHydrateResponse(JSON.stringify({ hook: 'H', body: '', visualPrompt: 'V' }))
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/campaigns/prompts.test.ts`
Expected: FAIL — `Cannot find module './prompts'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/campaigns/prompts.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/campaigns/prompts.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaigns/prompts.ts src/lib/campaigns/prompts.test.ts
git commit -m "feat(campaigns): add prompt-building and response-parsing library"
```

---

### Task 2: Campaign generation orchestrator

**Files:**
- Create: `src/lib/campaigns/generate-campaign.ts`
- Test: `src/lib/campaigns/generate-campaign.test.ts`

**Interfaces:**
- Consumes: everything from Task 1 (`src/lib/campaigns/prompts.ts`), `generateText` from `@/lib/ai/providers`, `ParsedBrand` from `@/lib/brands`.
- Produces: `GeneratedPiece` interface (`SkeletonPiece & { hook, body, visualPrompt, failed: boolean }`), `GenerateCampaignParams`/`GenerateCampaignResult` interfaces, and `generateCampaignContent(params): Promise<GenerateCampaignResult>` — consumed by Task 3 and Task 5 (regenerate route reuses `buildHydratePrompt`/`parseHydrateResponse` directly from Task 1, not this file).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/campaigns/generate-campaign.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ParsedBrand } from '@/lib/brands'

const { generateText } = vi.hoisted(() => ({ generateText: vi.fn() }))
vi.mock('@/lib/ai/providers', () => ({ generateText }))

import { generateCampaignContent } from './generate-campaign'

function brand(overrides: Partial<ParsedBrand> = {}): ParsedBrand {
  return {
    id: 'b1',
    name: 'Acme',
    slug: 'acme',
    description: null,
    logoUrl: null,
    voice: { tone: '', personality: '', avoid: [] },
    context: { products: [], faqs: [], targetAudience: [], keyMessages: [] },
    niche: 'home organization',
    audience: 'homeowners',
    tone: 'friendly',
    goals: ['grow signups'],
    website: null,
    websiteContent: null,
    appStoreUrl: null,
    socialUrls: {},
    localFolderPath: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('generateCampaignContent', () => {
  beforeEach(() => {
    generateText.mockReset()
  })

  it('generates a roadmap, skeleton, and hydrates every piece', async () => {
    generateText
      .mockResolvedValueOnce(JSON.stringify({ weeks: [{ week: 1, theme: 'Launch', goals: [] }] })) // roadmap
      .mockResolvedValueOnce(
        JSON.stringify([
          { day: 1, platform: 'INSTAGRAM', format: 'Image', title: 'Piece 1' },
          { day: 1, platform: 'TIKTOK', format: 'Short', title: 'Piece 2' },
        ])
      ) // skeleton
      .mockResolvedValue(JSON.stringify({ hook: 'H', body: 'B', visualPrompt: 'V' })) // hydration x2

    const result = await generateCampaignContent({ brand: brand(), durationDays: 1, piecesPerDay: 2 })

    expect(result.roadmap.weeks).toHaveLength(1)
    expect(result.pieces).toHaveLength(2)
    expect(result.pieces.every((p) => !p.failed)).toBe(true)
    expect(result.pieces[0]?.body).toBe('B')
  })

  it('marks an individual piece as failed without failing the whole campaign', async () => {
    generateText
      .mockResolvedValueOnce(JSON.stringify({ weeks: [{ week: 1, theme: 'Launch', goals: [] }] })) // roadmap
      .mockResolvedValueOnce(
        JSON.stringify([
          { day: 1, platform: 'INSTAGRAM', format: 'Image', title: 'Piece 1' },
          { day: 1, platform: 'TIKTOK', format: 'Short', title: 'Piece 2' },
        ])
      ) // skeleton
      .mockResolvedValueOnce(JSON.stringify({ hook: 'H', body: 'B', visualPrompt: 'V' })) // piece 1 ok
      .mockRejectedValueOnce(new Error('provider timeout')) // piece 2 fails

    const result = await generateCampaignContent({ brand: brand(), durationDays: 1, piecesPerDay: 2 })

    expect(result.pieces).toHaveLength(2)
    const failed = result.pieces.find((p) => p.failed)
    expect(failed).toBeDefined()
    expect(failed?.body).toContain('provider timeout')
  })

  it('throws when the skeleton has no valid pieces', async () => {
    generateText
      .mockResolvedValueOnce(JSON.stringify({ weeks: [{ week: 1, theme: 'Launch', goals: [] }] })) // roadmap
      .mockResolvedValueOnce(JSON.stringify([])) // empty skeleton

    await expect(
      generateCampaignContent({ brand: brand(), durationDays: 1, piecesPerDay: 2 })
    ).rejects.toThrow(/did not generate any content pieces/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/campaigns/generate-campaign.test.ts`
Expected: FAIL — `Cannot find module './generate-campaign'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/campaigns/generate-campaign.ts
import type { ParsedBrand } from '@/lib/brands'
import { generateText } from '@/lib/ai/providers'
import {
  buildRoadmapPrompt,
  parseRoadmapResponse,
  buildSkeletonPrompt,
  parseSkeletonResponse,
  buildHydratePrompt,
  parseHydrateResponse,
  type Roadmap,
  type SkeletonPiece,
} from './prompts'

export interface GeneratedPiece extends SkeletonPiece {
  hook: string
  body: string
  visualPrompt: string
  failed: boolean
}

export interface GenerateCampaignParams {
  brand: ParsedBrand
  durationDays: number
  piecesPerDay: number
}

export interface GenerateCampaignResult {
  roadmap: Roadmap
  pieces: GeneratedPiece[]
}

const SKELETON_BATCH_SIZE = 15

export async function generateCampaignContent(
  params: GenerateCampaignParams
): Promise<GenerateCampaignResult> {
  const { brand, durationDays, piecesPerDay } = params

  const roadmapText = await generateText(buildRoadmapPrompt(brand, durationDays), {
    jsonMode: true,
    maxTokens: 1024,
  })
  const roadmap = parseRoadmapResponse(roadmapText)

  const skeleton: SkeletonPiece[] = []
  for (let startDay = 1; startDay <= durationDays; startDay += SKELETON_BATCH_SIZE) {
    const numDays = Math.min(SKELETON_BATCH_SIZE, durationDays - startDay + 1)
    const batchText = await generateText(
      buildSkeletonPrompt(brand, roadmap, startDay, numDays, piecesPerDay),
      { jsonMode: true, maxTokens: 2048 }
    )
    skeleton.push(...parseSkeletonResponse(batchText))
  }

  if (skeleton.length === 0) {
    throw new Error('AI did not generate any content pieces for this campaign.')
  }

  const hydrated = await Promise.allSettled(
    skeleton.map(async (piece): Promise<GeneratedPiece> => {
      const text = await generateText(buildHydratePrompt(brand, piece), {
        jsonMode: true,
        maxTokens: 1024,
      })
      const fields = parseHydrateResponse(text)
      return { ...piece, ...fields, failed: false }
    })
  )

  const pieces: GeneratedPiece[] = hydrated.map((result, i) => {
    if (result.status === 'fulfilled') return result.value
    const piece = skeleton[i]!
    const reason = result.reason instanceof Error ? result.reason.message : 'Unknown error'
    return {
      ...piece,
      hook: '',
      body: `[Generation failed: ${reason}]`,
      visualPrompt: '',
      failed: true,
    }
  })

  return { roadmap, pieces }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/campaigns/generate-campaign.test.ts`
Expected: PASS — all three cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaigns/generate-campaign.ts src/lib/campaigns/generate-campaign.test.ts
git commit -m "feat(campaigns): add campaign generation orchestrator"
```

---

### Task 3: POST /api/campaigns/generate route

**Files:**
- Create: `src/app/api/campaigns/generate/route.ts`

**Interfaces:**
- Consumes: `generateCampaignContent` (Task 2), `getBrandById` from `@/lib/brands`, `prisma` from `@/lib/db`.
- Produces: `POST /api/campaigns/generate` — request `{ brandId, name, description?, durationDays, piecesPerDay }`, response `{ success, data: Campaign & { content: ContentPiece[] } }` — consumed by Task 7's create form.

- [ ] **Step 1: Write the implementation**

```typescript
// src/app/api/campaigns/generate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getBrandById } from '@/lib/brands'
import { generateCampaignContent } from '@/lib/campaigns/generate-campaign'

const schema = z.object({
  brandId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().default(''),
  durationDays: z.number().int().min(1).max(60),
  piecesPerDay: z.number().int().min(1).max(5),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      )
    }

    const { brandId, name, description, durationDays, piecesPerDay } = parsed.data
    const brand = await getBrandById(brandId)
    if (!brand) {
      return NextResponse.json({ success: false, error: 'Brand not found' }, { status: 404 })
    }

    const { roadmap, pieces } = await generateCampaignContent({ brand, durationDays, piecesPerDay })

    const campaign = await prisma.$transaction(async (tx) => {
      const created = await tx.campaign.create({
        data: {
          brandId,
          name,
          description: description || null,
          status: 'completed',
          analysis: '',
          trends: null,
          metadata: JSON.stringify({ roadmap }),
        },
      })

      await tx.contentPiece.createMany({
        data: pieces.map((p) => ({
          campaignId: created.id,
          brandId,
          day: p.day,
          platform: p.platform,
          format: p.format,
          title: p.title,
          hook: p.hook,
          body: p.body,
          visualPrompt: p.visualPrompt,
          status: 'draft',
        })),
      })

      return tx.campaign.findUniqueOrThrow({
        where: { id: created.id },
        include: { content: { orderBy: { day: 'asc' } } },
      })
    })

    return NextResponse.json({ success: true, data: campaign })
  } catch (error) {
    console.error('Campaign generation error:', error)
    const message = error instanceof Error ? error.message : 'Campaign generation failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev` (if not already running), then with a real brand id and a configured AI provider key:

```bash
curl -X POST http://localhost:3000/api/campaigns/generate \
  -H "Content-Type: application/json" \
  -d '{"brandId":"<real-brand-id>","name":"Test Campaign","durationDays":2,"piecesPerDay":1}'
```

Expected: `{"success":true,"data":{...,"content":[...]}}` with 2 content pieces, each having non-empty `hook`/`body`/`visualPrompt`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/campaigns/generate/route.ts
git commit -m "feat(campaigns): add campaign generation API route"
```

---

### Task 4: Campaign list/detail/update/delete routes

**Files:**
- Create: `src/app/api/campaigns/route.ts`
- Create: `src/app/api/campaigns/[id]/route.ts`

**Interfaces:**
- Produces: `GET /api/campaigns?brandId=` (list), `GET /api/campaigns/[id]` (detail with nested `content`), `PATCH /api/campaigns/[id]` (update name/description), `DELETE /api/campaigns/[id]` — consumed by Task 7 (list) and Task 8 (detail).

- [ ] **Step 1: Write the implementation**

```typescript
// src/app/api/campaigns/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get('brandId')
  if (!brandId) {
    return NextResponse.json({ success: false, error: 'brandId is required' }, { status: 400 })
  }
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { brandId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { content: true } } },
    })
    return NextResponse.json({ success: true, data: campaigns })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch campaigns'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
```

```typescript
// src/app/api/campaigns/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

const UpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
})

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: { content: { orderBy: { day: 'asc' } } },
    })
    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, data: campaign })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch campaign'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const body = await request.json()
    const parsed = UpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      )
    }
    const existing = await prisma.campaign.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 })
    }
    const updated = await prisma.campaign.update({ where: { id }, data: parsed.data })
    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update campaign'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const existing = await prisma.campaign.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 })
    }
    await prisma.campaign.delete({ where: { id } })
    return NextResponse.json({ success: true, data: { deleted: true } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete campaign'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify manually**

```bash
curl "http://localhost:3000/api/campaigns?brandId=<real-brand-id>"
curl "http://localhost:3000/api/campaigns/<campaign-id>"
curl -X PATCH "http://localhost:3000/api/campaigns/<campaign-id>" -H "Content-Type: application/json" -d '{"name":"Renamed"}'
curl -X DELETE "http://localhost:3000/api/campaigns/<campaign-id>"
```

Expected: each returns `{"success":true,...}`; after DELETE, a `GET` of that campaign returns 404, and its content pieces are gone too (`prisma.contentPiece.findMany({ where: { campaignId } })` returns `[]` — cascade delete from the schema's existing `onDelete: Cascade`).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/campaigns/route.ts "src/app/api/campaigns/[id]/route.ts"
git commit -m "feat(campaigns): add campaign list/detail/update/delete routes"
```

---

### Task 5: Content piece update/delete/regenerate routes

**Files:**
- Create: `src/app/api/content-pieces/[id]/route.ts`
- Create: `src/app/api/content-pieces/[id]/regenerate/route.ts`

**Interfaces:**
- Consumes: `buildHydratePrompt`/`parseHydrateResponse`/`SkeletonPiece`/`ContentFormat` from Task 1, `generateText` from `@/lib/ai/providers`, `getBrandById` from `@/lib/brands`.
- Produces: `PATCH /api/content-pieces/[id]`, `DELETE /api/content-pieces/[id]`, `POST /api/content-pieces/[id]/regenerate` — consumed by Task 8's `content-piece-card.tsx`.

- [ ] **Step 1: Write the implementation**

```typescript
// src/app/api/content-pieces/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { PLATFORMS } from '@/types'
import type { Platform } from '@/types'

type RouteContext = { params: Promise<{ id: string }> }

const UpdateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  hook: z.string().max(2000).optional(),
  body: z.string().max(10000).optional(),
  visualPrompt: z.string().max(4000).optional(),
  platform: z.enum(PLATFORMS as [Platform, ...Platform[]]).optional(),
  format: z.enum(['Image', 'Video', 'Short', 'Article', 'Thread']).optional(),
  day: z.number().int().min(1).optional(),
})

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const body = await request.json()
    const parsed = UpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      )
    }
    const existing = await prisma.contentPiece.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Content piece not found' }, { status: 404 })
    }
    const updated = await prisma.contentPiece.update({ where: { id }, data: parsed.data })
    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update content piece'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const existing = await prisma.contentPiece.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Content piece not found' }, { status: 404 })
    }
    await prisma.contentPiece.delete({ where: { id } })
    return NextResponse.json({ success: true, data: { deleted: true } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete content piece'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
```

```typescript
// src/app/api/content-pieces/[id]/regenerate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getBrandById } from '@/lib/brands'
import { generateText } from '@/lib/ai/providers'
import { buildHydratePrompt, parseHydrateResponse, type SkeletonPiece } from '@/lib/campaigns/prompts'
import type { Platform } from '@/types'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const piece = await prisma.contentPiece.findUnique({ where: { id } })
    if (!piece) {
      return NextResponse.json({ success: false, error: 'Content piece not found' }, { status: 404 })
    }
    const brand = await getBrandById(piece.brandId)
    if (!brand) {
      return NextResponse.json({ success: false, error: 'Brand not found' }, { status: 404 })
    }

    const skeletonPiece: SkeletonPiece = {
      day: piece.day,
      platform: piece.platform as Platform,
      format: piece.format as SkeletonPiece['format'],
      title: piece.title,
    }

    const text = await generateText(buildHydratePrompt(brand, skeletonPiece), {
      jsonMode: true,
      maxTokens: 1024,
    })
    const fields = parseHydrateResponse(text)

    const updated = await prisma.contentPiece.update({
      where: { id },
      data: { ...fields, status: 'draft' },
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to regenerate content piece'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify manually**

```bash
curl -X PATCH "http://localhost:3000/api/content-pieces/<piece-id>" -H "Content-Type: application/json" -d '{"title":"Edited title"}'
curl -X POST "http://localhost:3000/api/content-pieces/<piece-id>/regenerate"
curl -X DELETE "http://localhost:3000/api/content-pieces/<piece-id>"
```

Expected: each returns `{"success":true,...}`; regenerate returns a piece with a new `hook`/`body`/`visualPrompt`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/content-pieces/[id]/route.ts" "src/app/api/content-pieces/[id]/regenerate/route.ts"
git commit -m "feat(campaigns): add content piece update/delete/regenerate routes"
```

---

### Task 6: Calendar data route

**Files:**
- Create: `src/app/api/campaigns/calendar/route.ts`

**Interfaces:**
- Produces: `GET /api/campaigns/calendar?brandId=` — every `ContentPiece` for a brand across all campaigns, each with its parent campaign's `id`/`name` — consumed by Task 9's `/calendar` page.

- [ ] **Step 1: Write the implementation**

```typescript
// src/app/api/campaigns/calendar/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get('brandId')
  if (!brandId) {
    return NextResponse.json({ success: false, error: 'brandId is required' }, { status: 400 })
  }
  try {
    const pieces = await prisma.contentPiece.findMany({
      where: { brandId },
      orderBy: { day: 'asc' },
      include: { campaign: { select: { id: true, name: true } } },
    })
    return NextResponse.json({ success: true, data: pieces })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch calendar'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify manually**

```bash
curl "http://localhost:3000/api/campaigns/calendar?brandId=<real-brand-id>"
```

Expected: `{"success":true,"data":[{...,"campaign":{"id":"...","name":"..."}}]}`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/campaigns/calendar/route.ts
git commit -m "feat(campaigns): add cross-campaign calendar data route"
```

---

### Task 7: Campaigns page (list + create)

**Files:**
- Create: `src/app/(dashboard)/campaigns/page.tsx`

**Interfaces:**
- Consumes: `GET /api/brands`, `GET /api/campaigns?brandId=`, `POST /api/campaigns/generate`, `DELETE /api/campaigns/[id]` (Tasks 3, 4).

- [ ] **Step 1: Write the implementation**

```tsx
// src/app/(dashboard)/campaigns/page.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Sparkles, Loader2, Trash2, AlertTriangle } from 'lucide-react'

interface Brand {
  id: string
  name: string
  slug: string
}

interface CampaignSummary {
  id: string
  name: string
  description: string | null
  status: string
  createdAt: string
  _count: { content: number }
}

interface FormState {
  name: string
  description: string
  durationDays: number
  piecesPerDay: number
}

const DEFAULT_FORM: FormState = { name: '', description: '', durationDays: 7, piecesPerDay: 2 }

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-700 text-slate-300',
  generating: 'bg-yellow-500/15 text-yellow-400',
  completed: 'bg-green-500/15 text-green-400',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[status] ?? STATUS_STYLES.draft}`}>
      {status}
    </span>
  )
}

export default function CampaignsPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [brandId, setBrandId] = useState('')
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [loadingCampaigns, setLoadingCampaigns] = useState(false)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/brands')
      .then((r) => r.json())
      .then((json) => {
        const list: Brand[] = json.data ?? []
        setBrands(list)
        if (list.length > 0) setBrandId(list[0].id)
      })
      .catch(() => {})
  }, [])

  const loadCampaigns = useCallback((id: string) => {
    if (!id) {
      setCampaigns([])
      return
    }
    setLoadingCampaigns(true)
    fetch(`/api/campaigns?brandId=${id}`)
      .then((r) => r.json())
      .then((json) => setCampaigns(json.data ?? []))
      .catch(() => setError('Failed to load campaigns.'))
      .finally(() => setLoadingCampaigns(false))
  }, [])

  useEffect(() => {
    loadCampaigns(brandId)
  }, [brandId, loadCampaigns])

  async function handleGenerate() {
    if (!brandId || !form.name.trim()) return
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/campaigns/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          name: form.name.trim(),
          description: form.description.trim(),
          durationDays: form.durationDays,
          piecesPerDay: form.piecesPerDay,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Campaign generation failed')
      setForm(DEFAULT_FORM)
      loadCampaigns(brandId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Campaign generation failed')
    } finally {
      setGenerating(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this campaign and all its content pieces?')) return
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Failed to delete campaign')
      setCampaigns((prev) => prev.filter((c) => c.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete campaign')
    }
  }

  const canGenerate = !!brandId && form.name.trim().length > 0 && !generating
  const totalPieces = form.durationDays * form.piecesPerDay

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Campaigns</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Generate a full multi-day content campaign for a brand in one pass.
        </p>
      </div>

      {brands.length === 0 ? (
        <p className="text-slate-500 text-sm">
          No brands yet. <Link href="/brands" className="text-blue-400 hover:underline">Create one</Link>
        </p>
      ) : (
        <>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Brand
            </label>
            <select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className="w-full sm:w-64 bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">New Campaign</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400">Name</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Fall Launch Push"
                  className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400">Description (optional)</span>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400">Duration (days)</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={form.durationDays}
                  onChange={(e) => setForm((prev) => ({ ...prev, durationDays: Number(e.target.value) || 1 }))}
                  className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400">Pieces per day</span>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={form.piecesPerDay}
                  onChange={(e) => setForm((prev) => ({ ...prev, piecesPerDay: Number(e.target.value) || 1 }))}
                  className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            </div>
            <p className="text-xs text-slate-500">
              Will generate {totalPieces} content piece{totalPieces === 1 ? '' : 's'} — this runs {totalPieces + 2}{' '}
              AI calls and can take a minute or more.
            </p>
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="flex items-center justify-center gap-2 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              type="button"
            >
              {generating ? (
                <><Loader2 size={16} className="animate-spin" /> Generating campaign… this may take a minute</>
              ) : (
                <><Sparkles size={16} /> Generate Campaign</>
              )}
            </button>
            {error && (
              <div className="flex items-start gap-2 bg-red-950 border border-red-800 rounded-lg px-3 py-2.5 text-xs text-red-300">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-white">Existing Campaigns</h2>
            {loadingCampaigns ? (
              <div className="h-20 bg-slate-800 border border-slate-700 rounded-xl animate-pulse" />
            ) : campaigns.length === 0 ? (
              <p className="text-slate-500 text-sm">No campaigns yet for this brand.</p>
            ) : (
              <div className="space-y-2">
                {campaigns.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-xl px-4 py-3"
                  >
                    <Link href={`/campaigns/${c.id}`} className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">{c.name}</span>
                        <StatusBadge status={c.status} />
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {c._count.content} piece{c._count.content === 1 ? '' : 's'} ·{' '}
                        {new Date(c.createdAt).toLocaleDateString()}
                      </p>
                    </Link>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="text-slate-500 hover:text-red-400 transition-colors p-2"
                      type="button"
                      aria-label="Delete campaign"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev`, open `http://localhost:3000/campaigns`. Select a brand, fill in a name, generate a small campaign (durationDays=1, piecesPerDay=1) with a real provider key configured. Expected: loading state shows, then the new campaign appears in the list with a piece count and "completed" badge. Delete it and confirm it disappears.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/campaigns/page.tsx"
git commit -m "feat(campaigns): add campaigns list and create page"
```

---

### Task 8: Campaign detail page

**Files:**
- Create: `src/app/(dashboard)/campaigns/[id]/page.tsx`
- Create: `src/app/(dashboard)/campaigns/[id]/content-piece-card.tsx`

**Interfaces:**
- Consumes: `GET /api/campaigns/[id]`, `PATCH /api/content-pieces/[id]`, `DELETE /api/content-pieces/[id]`, `POST /api/content-pieces/[id]/regenerate` (Tasks 4, 5).

- [ ] **Step 1: Write the implementation**

```tsx
// src/app/(dashboard)/campaigns/[id]/content-piece-card.tsx
'use client'

import { useState } from 'react'
import { RefreshCw, Trash2, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { PlatformIcon } from '@/components/platform-icons'
import { PLATFORMS } from '@/types'
import type { Platform } from '@/types'

export interface ContentPiece {
  id: string
  day: number
  platform: string
  format: string
  title: string
  hook: string
  body: string
  visualPrompt: string
  status: string
}

interface Props {
  piece: ContentPiece
  onUpdated: (piece: ContentPiece) => void
  onDeleted: (id: string) => void
}

function isPlatform(value: string): value is Platform {
  return (PLATFORMS as string[]).includes(value)
}

export function ContentPieceCard({ piece, onUpdated, onDeleted }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    title: piece.title,
    hook: piece.hook,
    body: piece.body,
    visualPrompt: piece.visualPrompt,
  })
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/content-pieces/${piece.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Failed to save')
      onUpdated(json.data)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleRegenerate() {
    setRegenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/content-pieces/${piece.id}/regenerate`, { method: 'POST' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Failed to regenerate')
      onUpdated(json.data)
      setDraft({
        title: json.data.title,
        hook: json.data.hook,
        body: json.data.body,
        visualPrompt: json.data.visualPrompt,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate')
    } finally {
      setRegenerating(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this content piece?')) return
    try {
      const res = await fetch(`/api/content-pieces/${piece.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Failed to delete')
      onDeleted(piece.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded((v) => !v)}
          type="button"
          className="flex items-center gap-2 text-left min-w-0 flex-1"
        >
          {expanded ? (
            <ChevronDown size={14} className="text-slate-500 flex-shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-slate-500 flex-shrink-0" />
          )}
          {isPlatform(piece.platform) && <PlatformIcon platform={piece.platform} size={18} />}
          <span className="text-sm font-medium text-white truncate">{piece.title}</span>
          <span className="text-xs text-slate-500 flex-shrink-0">{piece.format}</span>
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            type="button"
            className="text-slate-500 hover:text-white p-1.5"
            aria-label="Regenerate"
          >
            {regenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
          <button
            onClick={handleDelete}
            type="button"
            className="text-slate-500 hover:text-red-400 p-1.5"
            aria-label="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 pt-1 border-t border-slate-700/50">
          {editing ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">Title</span>
                <input
                  value={draft.title}
                  onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">Hook</span>
                <textarea
                  value={draft.hook}
                  onChange={(e) => setDraft((p) => ({ ...p, hook: e.target.value }))}
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">Body</span>
                <textarea
                  value={draft.body}
                  onChange={(e) => setDraft((p) => ({ ...p, body: e.target.value }))}
                  rows={5}
                  className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">Visual prompt</span>
                <textarea
                  value={draft.visualPrompt}
                  onChange={(e) => setDraft((p) => ({ ...p, visualPrompt: e.target.value }))}
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2"
                />
              </label>
              <div className="flex gap-2">
                <button onClick={handleSave} disabled={saving} type="button" className="btn-primary text-xs">
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditing(false)} type="button" className="btn-secondary text-xs">
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-200 font-medium">{piece.hook}</p>
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{piece.body}</p>
              {piece.visualPrompt && (
                <p className="text-xs text-slate-500 italic">Visual: {piece.visualPrompt}</p>
              )}
              <button onClick={() => setEditing(true)} type="button" className="text-xs text-blue-400 hover:underline">
                Edit
              </button>
            </>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  )
}
```

```tsx
// src/app/(dashboard)/campaigns/[id]/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ContentPieceCard, type ContentPiece } from './content-piece-card'

interface CampaignDetail {
  id: string
  name: string
  description: string | null
  status: string
  content: ContentPiece[]
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/campaigns/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error ?? 'Failed to load campaign')
        setCampaign(json.data)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load campaign'))
      .finally(() => setLoading(false))
  }, [id])

  function updatePiece(updated: ContentPiece) {
    setCampaign((prev) =>
      prev ? { ...prev, content: prev.content.map((p) => (p.id === updated.id ? updated : p)) } : prev
    )
  }

  function removePiece(pieceId: string) {
    setCampaign((prev) => (prev ? { ...prev, content: prev.content.filter((p) => p.id !== pieceId) } : prev))
  }

  if (loading) {
    return <div className="p-6 max-w-4xl mx-auto text-slate-400 text-sm">Loading campaign…</div>
  }

  if (error || !campaign) {
    return <div className="p-6 max-w-4xl mx-auto text-red-400 text-sm">{error ?? 'Campaign not found'}</div>
  }

  const pieceDays = Array.from(new Set(campaign.content.map((p) => p.day))).sort((a, b) => a - b)

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Link href="/campaigns" className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white w-fit">
        <ArrowLeft size={14} /> Back to campaigns
      </Link>

      <div>
        <h1 className="text-xl font-bold text-white">{campaign.name}</h1>
        {campaign.description && <p className="text-sm text-slate-400 mt-1">{campaign.description}</p>}
      </div>

      {pieceDays.length === 0 ? (
        <p className="text-slate-500 text-sm">No content pieces in this campaign.</p>
      ) : (
        <div className="space-y-6">
          {pieceDays.map((day) => (
            <div key={day}>
              <h2 className="text-sm font-semibold text-slate-300 mb-3">Day {day}</h2>
              <div className="space-y-3">
                {campaign.content
                  .filter((p) => p.day === day)
                  .map((piece) => (
                    <ContentPieceCard key={piece.id} piece={piece} onUpdated={updatePiece} onDeleted={removePiece} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify manually**

Open a campaign from `/campaigns`. Expected: pieces grouped by day, each expandable; edit a piece's body and save (persists on reload); regenerate a piece (hook/body change); delete a piece (disappears from the list).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/campaigns/[id]/page.tsx" "src/app/(dashboard)/campaigns/[id]/content-piece-card.tsx"
git commit -m "feat(campaigns): add campaign detail page with editable pieces"
```

---

### Task 9: Calendar page and nav update

**Files:**
- Create: `src/app/(dashboard)/calendar/page.tsx`
- Modify: `src/components/sidebar-nav.tsx`

**Interfaces:**
- Consumes: `GET /api/brands`, `GET /api/campaigns/calendar?brandId=` (Task 6).

- [ ] **Step 1: Write the implementation**

```tsx
// src/app/(dashboard)/calendar/page.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { PlatformIcon } from '@/components/platform-icons'
import { PLATFORMS } from '@/types'
import type { Platform } from '@/types'

interface Brand {
  id: string
  name: string
  slug: string
}

interface CalendarPiece {
  id: string
  day: number
  platform: string
  format: string
  title: string
  status: string
  campaign: { id: string; name: string }
}

function isPlatform(value: string): value is Platform {
  return (PLATFORMS as string[]).includes(value)
}

export default function CalendarPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [brandId, setBrandId] = useState('')
  const [pieces, setPieces] = useState<CalendarPiece[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/brands')
      .then((r) => r.json())
      .then((json) => {
        const list: Brand[] = json.data ?? []
        setBrands(list)
        if (list.length > 0) setBrandId(list[0].id)
      })
      .catch(() => {})
  }, [])

  const loadPieces = useCallback((id: string) => {
    if (!id) {
      setPieces([])
      return
    }
    setLoading(true)
    fetch(`/api/campaigns/calendar?brandId=${id}`)
      .then((r) => r.json())
      .then((json) => setPieces(json.data ?? []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadPieces(brandId)
  }, [brandId, loadPieces])

  const days = Array.from(new Set(pieces.map((p) => p.day))).sort((a, b) => a - b)

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Calendar</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Every generated content piece across this brand's campaigns, by day.
        </p>
      </div>

      {brands.length > 0 && (
        <select
          value={brandId}
          onChange={(e) => setBrandId(e.target.value)}
          className="w-full sm:w-64 bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      )}

      {loading ? (
        <div className="h-20 bg-slate-800 border border-slate-700 rounded-xl animate-pulse" />
      ) : days.length === 0 ? (
        <p className="text-slate-500 text-sm">No campaign content yet for this brand.</p>
      ) : (
        <div className="space-y-6">
          {days.map((day) => (
            <div key={day}>
              <h2 className="text-sm font-semibold text-slate-300 mb-3">Day {day}</h2>
              <div className="space-y-2">
                {pieces
                  .filter((p) => p.day === day)
                  .map((piece) => (
                    <Link
                      key={piece.id}
                      href={`/campaigns/${piece.campaign.id}`}
                      className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 hover:border-slate-600 transition-colors"
                    >
                      {isPlatform(piece.platform) && <PlatformIcon platform={piece.platform} size={20} />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white truncate">{piece.title}</p>
                        <p className="text-xs text-slate-500">
                          {piece.campaign.name} · {piece.format}
                        </p>
                      </div>
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

Modify `src/components/sidebar-nav.tsx` — add `Rocket` and `CalendarDays` to the lucide-react import, and insert two new entries into `NAV_ITEMS` right after the Content Lab entry:

```typescript
// Before:
import {
  LayoutDashboard,
  Sparkles,
  CalendarPlus,
  ClipboardList,
  MessageSquare,
  Link2,
  Building2,
  Settings,
  LogOut,
} from 'lucide-react'
// ...
const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/create', label: 'Content Lab', icon: Sparkles },
  { href: '/schedule', label: 'Schedule', icon: CalendarPlus },
  { href: '/queue', label: 'Queue', icon: ClipboardList },
  { href: '/comments', label: 'Comments', icon: MessageSquare },
  { href: '/brands', label: 'Brands', icon: Building2 },
  { href: '/connect', label: 'Connect', icon: Link2 },
  { href: '/settings', label: 'Settings', icon: Settings },
]

// After:
import {
  LayoutDashboard,
  Sparkles,
  Rocket,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  MessageSquare,
  Link2,
  Building2,
  Settings,
  LogOut,
} from 'lucide-react'
// ...
const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/create', label: 'Content Lab', icon: Sparkles },
  { href: '/campaigns', label: 'Campaigns', icon: Rocket },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/schedule', label: 'Schedule', icon: CalendarPlus },
  { href: '/queue', label: 'Queue', icon: ClipboardList },
  { href: '/comments', label: 'Comments', icon: MessageSquare },
  { href: '/brands', label: 'Brands', icon: Building2 },
  { href: '/connect', label: 'Connect', icon: Link2 },
  { href: '/settings', label: 'Settings', icon: Settings },
]
```

- [ ] **Step 2: Verify manually**

Open `http://localhost:3000/calendar`. Expected: pieces grouped by day across all of the selected brand's campaigns, each linking to its campaign detail page. Confirm "Campaigns" and "Calendar" both appear in the sidebar and highlight correctly when active.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/calendar/page.tsx" src/components/sidebar-nav.tsx
git commit -m "feat(campaigns): add calendar page and nav entries"
```

---

## Self-Review Notes

- **Spec coverage:** all sections of `docs/superpowers/specs/2026-07-17-campaigns-calendar-design.md` are covered — generation flow (Tasks 1-3), campaign CRUD (Task 4), piece CRUD/regenerate (Task 5), calendar data (Task 6), all three new pages (Tasks 7-9), nav (Task 9).
- **Type consistency:** `SkeletonPiece`/`ContentFormat`/`HydratedFields` (Task 1) are the single source of truth, reused unchanged by Task 2 (orchestrator), Task 5 (regenerate route), and Task 8 (UI, via its own `ContentPiece` interface matching the Prisma row shape returned by the API — deliberately a separate, wider interface since the API returns extra fields like `status`).
- **Route naming:** confirmed no collision with existing `/api/content` (Content Lab) — new routes use `/api/content-pieces/*` and `/api/campaigns/*`.
