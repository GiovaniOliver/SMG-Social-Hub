# Content Lab Media Generation & Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Runware-powered image/video generation to Content Lab, and persist every successful generation to a new `GeneratedContent` table so it survives navigation/refresh, with a minimal Library page to browse and reuse it later.

**Architecture:** A new media-provider client (`src/lib/ai/media-providers.ts`) wraps Runware's REST API. A new visual-prompt builder (`src/lib/ai/visual-prompt.ts`) uses the existing text-provider layer to turn a generated post into a Runware prompt. The existing `POST /api/content/generate` route is extended to call both, attach the resulting media URL to every platform result, and persist all successful results. A new `/library` page and `GET /api/content/history` route expose the persisted history.

**Tech Stack:** Next.js App Router route handlers, Prisma/SQLite (schema change this time — see Task 4), Zod validation, the existing `generateText()` provider layer, Vitest for the lib layer, Runware's REST API (`https://api.runware.ai/v1`).

## Global Constraints

- This plan depends on `docs/superpowers/plans/2026-07-17-campaigns-calendar.md` having already modified `src/components/sidebar-nav.tsx` (added "Campaigns"/"Calendar"). Task 8 here adds one more entry on top of that — if this plan runs first for any reason, adapt the diff accordingly.
- Runware is a **media-only** provider — it does not participate in `generateText()`'s provider switch (`src/lib/ai/providers.ts`) and has no "default provider" concept. Its key is stored in the same `.provider-keys.json` file via the existing `loadKeys`/`saveKeys` machinery, keyed as `runware`.
- Exactly **one** shared image or video is generated per Content Lab request (not one per platform) — attached to every successful platform result.
- Image generation is synchronous (Runware returns `imageURL` in the same response). Video generation is asynchronous — submit, then poll `getResponse` until `status: 'success'` or a timeout.
- A media generation failure must not fail the text generation — attach a `mediaWarning` to the affected results instead of throwing.
- Every successful (`content` non-empty) platform result from `POST /api/content/generate` is persisted to `GeneratedContent`, regardless of whether media was requested or whether the post is later scheduled. Failed results are not persisted.
- API routes and `.tsx` page/component files are **not unit-tested** in this repo's convention — only `src/lib/ai/media-providers.ts` and `src/lib/ai/visual-prompt.ts` get Vitest coverage. Routes and pages are verified live in the browser.
- This repo has no `prisma/migrations` directory — schema changes are applied with `npx prisma db push` followed by `npx prisma generate` (see `package.json`'s `db:push`/`db:generate` scripts), not `prisma migrate`.
- All new/changed API responses follow this repo's `{ success: boolean, data?, error? }` shape.

---

### Task 1: Extend provider key storage for Runware

**Files:**
- Modify: `src/lib/ai/providers.ts`
- Modify: `src/lib/ai/providers.test.ts`

**Interfaces:**
- Produces: a widened `getKey(provider: AIProvider | 'runware'): string`, `ProviderKeys.runware?: string`, `ProviderKeyStatus.runware: boolean` — consumed by Task 2 (media client) and Task 6 (Settings route/page).
- This task modifies an existing, fully-tested file. Do not change any behavior for the 4 existing providers — only add the `runware` key alongside them.

- [ ] **Step 1: Write the failing tests**

Add these blocks to the end of `src/lib/ai/providers.test.ts` (keep all existing tests unchanged):

```typescript
describe('getKey — runware', () => {
  it('prefers a stored runware key over the env fallback', () => {
    storedKeys({ runware: 'stored-rw' })
    process.env.RUNWARE_API_KEY = 'env-rw'
    expect(getKey('runware')).toBe('stored-rw')
  })

  it('falls back to the env var when no stored runware key exists', () => {
    existsSync.mockReturnValue(false)
    process.env.RUNWARE_API_KEY = 'env-rw'
    expect(getKey('runware')).toBe('env-rw')
  })
})

describe('getKeyStatus — runware', () => {
  it('reports runware as configured when a key is stored', () => {
    storedKeys({ runware: 'rw-key' })
    expect(getKeyStatus().runware).toBe(true)
  })

  it('reports runware as not configured when no key is stored', () => {
    existsSync.mockReturnValue(false)
    expect(getKeyStatus().runware).toBe(false)
  })
})
```

Also update the existing `beforeEach` block to clean up the new env var — change:

```typescript
beforeEach(() => {
  existsSync.mockReset()
  readFileSync.mockReset()
  writeFileSync.mockReset()
  geminiGenerateContent.mockReset()
  getGenerativeModel.mockClear()
  anthropicCreate.mockReset()
  process.env = { ...originalEnv }
  delete process.env.GEMINI_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.OPENAI_API_KEY
  existsSync.mockReturnValue(false)
})
```

to:

```typescript
beforeEach(() => {
  existsSync.mockReset()
  readFileSync.mockReset()
  writeFileSync.mockReset()
  geminiGenerateContent.mockReset()
  getGenerativeModel.mockClear()
  anthropicCreate.mockReset()
  process.env = { ...originalEnv }
  delete process.env.GEMINI_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.OPENAI_API_KEY
  delete process.env.RUNWARE_API_KEY
  existsSync.mockReturnValue(false)
})
```

And update the existing `getKeyStatus` test that uses `toEqual` (it will fail once `runware` appears in the returned object) — change:

```typescript
it('reports configured booleans without leaking key values, plus defaults', () => {
    storedKeys({ gemini: 'g-key' })
    const status = getKeyStatus()
    expect(status).toEqual({
      gemini: true,
      anthropic: false,
      openai: false,
      ollamaBaseUrl: 'http://localhost:11434',
      defaultProvider: 'gemini',
    })
  })
```

to:

```typescript
it('reports configured booleans without leaking key values, plus defaults', () => {
    storedKeys({ gemini: 'g-key' })
    const status = getKeyStatus()
    expect(status).toEqual({
      gemini: true,
      anthropic: false,
      openai: false,
      runware: false,
      ollamaBaseUrl: 'http://localhost:11434',
      defaultProvider: 'gemini',
    })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/ai/providers.test.ts`
Expected: FAIL — the two new `describe` blocks fail (`getKey`/`getKeyStatus` don't know about `'runware'` yet), and the updated `toEqual` test fails (actual object is missing `runware`).

- [ ] **Step 3: Write the implementation**

In `src/lib/ai/providers.ts`, change:

```typescript
export type AIProvider = 'gemini' | 'anthropic' | 'openai' | 'ollama'

export interface ProviderKeys {
  gemini?: string
  anthropic?: string
  openai?: string
  ollamaBaseUrl?: string
  defaultProvider?: AIProvider
}

export interface ProviderKeyStatus {
  gemini: boolean
  anthropic: boolean
  openai: boolean
  ollamaBaseUrl: string
  defaultProvider: AIProvider
}
```

to:

```typescript
export type AIProvider = 'gemini' | 'anthropic' | 'openai' | 'ollama'
export type KeyedProvider = AIProvider | 'runware'

export interface ProviderKeys {
  gemini?: string
  anthropic?: string
  openai?: string
  runware?: string
  ollamaBaseUrl?: string
  defaultProvider?: AIProvider
}

export interface ProviderKeyStatus {
  gemini: boolean
  anthropic: boolean
  openai: boolean
  runware: boolean
  ollamaBaseUrl: string
  defaultProvider: AIProvider
}
```

Change:

```typescript
const ENV_VAR: Partial<Record<AIProvider, string>> = {
  gemini: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
}

export function getKey(provider: AIProvider): string {
  const stored = loadKeys()
  const envVar = ENV_VAR[provider]
  const envFallback = envVar ? process.env[envVar] : undefined
  return stored[provider as 'gemini' | 'anthropic' | 'openai'] || envFallback || ''
}

export function getKeyStatus(): ProviderKeyStatus {
  const stored = loadKeys()
  return {
    gemini: !!getKey('gemini'),
    anthropic: !!getKey('anthropic'),
    openai: !!getKey('openai'),
    ollamaBaseUrl: stored.ollamaBaseUrl || 'http://localhost:11434',
    defaultProvider: stored.defaultProvider || 'gemini',
  }
}
```

to:

```typescript
const ENV_VAR: Partial<Record<KeyedProvider, string>> = {
  gemini: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  runware: 'RUNWARE_API_KEY',
}

export function getKey(provider: KeyedProvider): string {
  const stored = loadKeys()
  const envVar = ENV_VAR[provider]
  const envFallback = envVar ? process.env[envVar] : undefined
  return stored[provider as 'gemini' | 'anthropic' | 'openai' | 'runware'] || envFallback || ''
}

export function getKeyStatus(): ProviderKeyStatus {
  const stored = loadKeys()
  return {
    gemini: !!getKey('gemini'),
    anthropic: !!getKey('anthropic'),
    openai: !!getKey('openai'),
    runware: !!getKey('runware'),
    ollamaBaseUrl: stored.ollamaBaseUrl || 'http://localhost:11434',
    defaultProvider: stored.defaultProvider || 'gemini',
  }
}
```

Leave every other function in the file (`loadKeys`, `saveKeys`, `generateWithGemini`, `generateWithAnthropic`, `generateWithOpenAI`, `generateWithOllama`, `generateText`) untouched — `generateText`'s provider switch stays exactly as-is, since Runware never appears there.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/ai/providers.test.ts`
Expected: PASS — all 20 original tests plus the 4 new ones green (24 total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/providers.ts src/lib/ai/providers.test.ts
git commit -m "feat(media): extend provider key storage for Runware"
```

---

### Task 2: Runware media client

**Files:**
- Create: `src/lib/ai/media-providers.ts`
- Test: `src/lib/ai/media-providers.test.ts`

**Interfaces:**
- Consumes: `getKey` from `./providers` (Task 1).
- Produces: `generateImage(prompt, options?): Promise<MediaResult>`, `generateVideo(prompt, options?): Promise<MediaResult>`, `MediaResult` interface (`{ url: string; cost: number }`) — consumed by Task 5's route.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/ai/media-providers.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { getKey } = vi.hoisted(() => ({ getKey: vi.fn() }))
vi.mock('./providers', () => ({ getKey }))

import { generateImage, generateVideo } from './media-providers'

const originalFetch = global.fetch

beforeEach(() => {
  getKey.mockReset()
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('generateImage', () => {
  it('throws when no Runware key is configured', async () => {
    getKey.mockReturnValue('')
    await expect(generateImage('a cat')).rejects.toThrow(/Runware API key not configured/)
  })

  it('returns the imageURL from a successful response', async () => {
    getKey.mockReturnValue('rw-key')
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
    getKey.mockReturnValue('rw-key')
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{}] }),
    }) as unknown as typeof fetch

    await expect(generateImage('x')).rejects.toThrow(/no imageURL/)
  })

  it('throws with status and body when the response is not ok', async () => {
    getKey.mockReturnValue('rw-key')
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
    getKey.mockReturnValue('')
    await expect(generateVideo('a river')).rejects.toThrow(/Runware API key not configured/)
  })

  it('submits the task then polls until success', async () => {
    getKey.mockReturnValue('rw-key')
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
    getKey.mockReturnValue('rw-key')
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
    getKey.mockReturnValue('rw-key')
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: 'processing' }] }),
    }) as unknown as typeof fetch

    await expect(generateVideo('x', { pollIntervalMs: 1, pollTimeoutMs: 5 })).rejects.toThrow(/timed out/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/ai/media-providers.test.ts`
Expected: FAIL — `Cannot find module './media-providers'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/ai/media-providers.ts
import { getKey } from './providers'

const RUNWARE_URL = 'https://api.runware.ai/v1'
const DEFAULT_IMAGE_MODEL = 'runware:100@1'
const DEFAULT_VIDEO_MODEL = 'bytedance:seedance@2.0'
const VIDEO_POLL_INTERVAL_MS = 3000
const VIDEO_POLL_TIMEOUT_MS = 120000

export interface MediaResult {
  url: string
  cost: number
}

export interface GenerateImageOptions {
  model?: string
  width?: number
  height?: number
}

export interface GenerateVideoOptions {
  model?: string
  width?: number
  height?: number
  duration?: number
  pollIntervalMs?: number
  pollTimeoutMs?: number
}

interface RunwareTaskResult {
  taskType?: string
  taskUUID?: string
  imageURL?: string
  videoURL?: string
  status?: string
  cost?: number
  [key: string]: unknown
}

function requireRunwareKey(): string {
  const key = getKey('runware')
  if (!key) throw new Error('Runware API key not configured. Go to Settings → API Keys.')
  return key
}

async function runwareRequest(apiKey: string, tasks: Record<string, unknown>[]): Promise<RunwareTaskResult[]> {
  const resp = await fetch(RUNWARE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(tasks),
  })
  if (!resp.ok) throw new Error(`Runware error ${resp.status}: ${await resp.text()}`)
  const json = (await resp.json()) as { data?: RunwareTaskResult[] }
  return json.data ?? []
}

export async function generateImage(prompt: string, options: GenerateImageOptions = {}): Promise<MediaResult> {
  const apiKey = requireRunwareKey()
  const data = await runwareRequest(apiKey, [
    {
      taskType: 'imageInference',
      taskUUID: crypto.randomUUID(),
      positivePrompt: prompt,
      model: options.model ?? DEFAULT_IMAGE_MODEL,
      width: options.width ?? 1024,
      height: options.height ?? 1024,
      numberResults: 1,
    },
  ])
  const result = data[0]
  if (!result?.imageURL) throw new Error('Runware image generation returned no imageURL')
  return { url: result.imageURL, cost: typeof result.cost === 'number' ? result.cost : 0 }
}

export async function generateVideo(prompt: string, options: GenerateVideoOptions = {}): Promise<MediaResult> {
  const apiKey = requireRunwareKey()
  const id = crypto.randomUUID()

  await runwareRequest(apiKey, [
    {
      taskType: 'videoInference',
      taskUUID: id,
      positivePrompt: prompt,
      model: options.model ?? DEFAULT_VIDEO_MODEL,
      width: options.width ?? 1280,
      height: options.height ?? 720,
      duration: options.duration ?? 5,
      numberResults: 1,
      deliveryMethod: 'async',
    },
  ])

  const pollIntervalMs = options.pollIntervalMs ?? VIDEO_POLL_INTERVAL_MS
  const pollTimeoutMs = options.pollTimeoutMs ?? VIDEO_POLL_TIMEOUT_MS
  const deadline = Date.now() + pollTimeoutMs

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    const pollData = await runwareRequest(apiKey, [{ taskType: 'getResponse', taskUUID: id }])
    const status = pollData[0]
    if (status?.status === 'success' && status.videoURL) {
      return { url: status.videoURL, cost: typeof status.cost === 'number' ? status.cost : 0 }
    }
    if (status?.status === 'error') {
      throw new Error(`Runware video generation failed: ${JSON.stringify(status)}`)
    }
  }
  throw new Error('Runware video generation timed out')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/ai/media-providers.test.ts`
Expected: PASS — all 8 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/media-providers.ts src/lib/ai/media-providers.test.ts
git commit -m "feat(media): add Runware image/video generation client"
```

---

### Task 3: Visual-prompt builder

**Files:**
- Create: `src/lib/ai/visual-prompt.ts`
- Test: `src/lib/ai/visual-prompt.test.ts`

**Interfaces:**
- Consumes: `generateText` from `./providers`, `BrandVoice`/`BrandContext` from `@/types`.
- Produces: `buildVisualPrompt(params): Promise<string>`, `VisualMediaType` type — consumed by Task 5's route.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/ai/visual-prompt.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BrandVoice, BrandContext } from '@/types'

const { generateText } = vi.hoisted(() => ({ generateText: vi.fn() }))
vi.mock('./providers', () => ({ generateText }))

import { buildVisualPrompt } from './visual-prompt'

const voice: BrandVoice = { tone: 'friendly', personality: 'helpful', avoid: [] }
const context: BrandContext = { products: ['SnapRegister'], faqs: [], targetAudience: [], keyMessages: [] }

describe('buildVisualPrompt', () => {
  beforeEach(() => {
    generateText.mockReset()
  })

  it('returns the trimmed text response for an image prompt', async () => {
    generateText.mockResolvedValue('  A cozy living room, golden hour light.  ')
    const result = await buildVisualPrompt({
      mediaType: 'image',
      brandName: 'Acme',
      brandVoice: voice,
      brandContext: context,
      postContent: 'Keep your warranties organized.',
      postHook: 'Never lose a receipt again',
    })
    expect(result).toBe('A cozy living room, golden hour light.')
  })

  it('uses the video system prompt for video media type', async () => {
    generateText.mockResolvedValue('A cinematic pan across a home office.')
    await buildVisualPrompt({
      mediaType: 'video',
      brandName: 'Acme',
      brandVoice: voice,
      brandContext: context,
      postContent: 'Keep your warranties organized.',
      postHook: 'Never lose a receipt again',
    })
    const [prompt] = generateText.mock.calls[0]
    expect(prompt).toContain('Video Producer')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/ai/visual-prompt.test.ts`
Expected: FAIL — `Cannot find module './visual-prompt'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/ai/visual-prompt.ts
import type { BrandVoice, BrandContext } from '@/types'
import { generateText } from './providers'

export type VisualMediaType = 'image' | 'video'

export interface BuildVisualPromptParams {
  mediaType: VisualMediaType
  brandName: string
  brandVoice: BrandVoice
  brandContext: BrandContext
  postContent: string
  postHook: string
}

const SYSTEM_PROMPTS: Record<VisualMediaType, string> = {
  image:
    'You are a world-class Art Director and Photographer. Focus on composition, lighting (golden hour, soft studio, etc.), and aesthetic consistency. Describe textures, colors, and vibe in detail.',
  video:
    'You are a world-class Video Producer, Cinematographer, and Visual Storyteller. Create a high-fidelity, cinematic video description: narrative arc, camera movement, lighting, atmosphere, and subject action. Use technical film terms and sensory language.',
}

export async function buildVisualPrompt(params: BuildVisualPromptParams): Promise<string> {
  const { mediaType, brandName, brandVoice, brandContext, postContent, postHook } = params
  const system = SYSTEM_PROMPTS[mediaType]

  const prompt = `${system}

Brand: ${brandName} | Tone: ${brandVoice.tone} | Personality: ${brandVoice.personality}
Products: ${brandContext.products.length > 0 ? brandContext.products.join(', ') : 'None listed.'}

Write a single, detailed ${mediaType} generation prompt (plain text, 2-4 sentences, no JSON, no markdown) for a visual to accompany this social post:
Hook: ${postHook}
Content: ${postContent.slice(0, 500)}`

  const text = await generateText(prompt, { maxTokens: 300, temperature: 0.8 })
  return text.trim()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/ai/visual-prompt.test.ts`
Expected: PASS — both cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/visual-prompt.ts src/lib/ai/visual-prompt.test.ts
git commit -m "feat(media): add visual-prompt builder"
```

---

### Task 4: GeneratedContent schema

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `prisma.generatedContent` Prisma Client model — consumed by Task 5's route and Task 8's history route.

- [ ] **Step 1: Modify the schema**

In `prisma/schema.prisma`, add `generatedContent GeneratedContent[]` to the `Brand` model's relations block — change:

```prisma
  connections          PlatformConnection[]
  scheduledPosts       ScheduledPost[]
  commentOpportunities CommentOpportunity[]
  campaigns            Campaign[]
}
```

to:

```prisma
  connections          PlatformConnection[]
  scheduledPosts       ScheduledPost[]
  commentOpportunities CommentOpportunity[]
  campaigns            Campaign[]
  generatedContent     GeneratedContent[]
}
```

Then append a new model at the end of the file:

```prisma
model GeneratedContent {
  id           String   @id @default(cuid())
  brandId      String
  brand        Brand    @relation(fields: [brandId], references: [id], onDelete: Cascade)
  platform     String
  contentType  String
  topic        String?
  content      String
  hook         String
  tip          String?
  imageUrl     String?
  videoUrl     String?
  visualPrompt String?
  createdAt    DateTime @default(now())
}
```

- [ ] **Step 2: Push the schema and regenerate the client**

Run: `npx prisma db push`
Expected: `Your database is now in sync with your Prisma schema.`

Run: `npx prisma generate`
Expected: `Generated Prisma Client`

Run: `npx tsc --noEmit`
Expected: no errors (confirms `prisma.generatedContent` is now typed).

If the dev server is running, restart it so it picks up the regenerated Prisma Client (this repo has needed this after every prior schema change).

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(media): add GeneratedContent model for Content Lab history"
```

---

### Task 5: Extend content generation route + add history route

**Files:**
- Modify: `src/lib/ai/content-generator.ts`
- Modify: `src/app/api/content/generate/route.ts`
- Create: `src/app/api/content/history/route.ts`

**Interfaces:**
- Consumes: `generateImage`/`generateVideo` (Task 2), `buildVisualPrompt` (Task 3), `prisma.generatedContent` (Task 4).
- Produces: `POST /api/content/generate` gains optional `generateImage`/`generateVideo` request fields and `imageUrl`/`videoUrl`/`mediaWarning` response fields, and now persists every successful result. `GET /api/content/history?brandId=` — consumed by Task 7 (Content Lab UI) and Task 8 (Library page).

- [ ] **Step 1: Widen the `GeneratedPost` interface**

In `src/lib/ai/content-generator.ts`, change:

```typescript
export interface GeneratedPost {
  platform: Platform
  content: string
  hook: string
  tip?: string
  characterCount: number
  characterLimit: number
}
```

to:

```typescript
export interface GeneratedPost {
  platform: Platform
  content: string
  hook: string
  tip?: string
  characterCount: number
  characterLimit: number
  imageUrl?: string
  videoUrl?: string
  mediaWarning?: string
}
```

No other change to this file — `generateContent()` and `generateForPlatform()` are untouched; media attachment happens in the route, not here.

- [ ] **Step 2: Rewrite the route**

Replace the full contents of `src/app/api/content/generate/route.ts` with:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateContent, type GeneratedPost } from '@/lib/ai/content-generator'
import { CONTENT_TYPES } from '@/lib/ai/content-types'
import type { ContentType } from '@/lib/ai/content-types'
import { getBrandById } from '@/lib/brands'
import { generateImage, generateVideo } from '@/lib/ai/media-providers'
import { buildVisualPrompt } from '@/lib/ai/visual-prompt'
import { prisma } from '@/lib/db'
import type { Platform } from '@/types'
import { PLATFORMS } from '@/types'

const schema = z.object({
  brandId: z.string().min(1),
  platforms: z.array(z.enum(PLATFORMS as [Platform, ...Platform[]])).min(1),
  contentType: z.enum(Object.keys(CONTENT_TYPES) as [ContentType, ...ContentType[]]),
  topic: z.string().max(500).optional().default(''),
  generateImage: z.boolean().optional().default(false),
  generateVideo: z.boolean().optional().default(false),
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

    const {
      brandId,
      platforms,
      contentType,
      topic,
      generateImage: wantImage,
      generateVideo: wantVideo,
    } = parsed.data

    const brand = await getBrandById(brandId)
    if (!brand) {
      return NextResponse.json({ success: false, error: 'Brand not found' }, { status: 404 })
    }

    const { voice, context } = brand
    const results = await generateContent(platforms, brand.name, voice, context, contentType, topic)

    let mediaUrl: string | undefined
    let visualPromptText: string | undefined
    let mediaWarning: string | undefined

    if (wantImage || wantVideo) {
      const firstOk = results.find((r) => r.content)
      if (firstOk) {
        try {
          visualPromptText = await buildVisualPrompt({
            mediaType: wantVideo ? 'video' : 'image',
            brandName: brand.name,
            brandVoice: voice,
            brandContext: context,
            postContent: firstOk.content,
            postHook: firstOk.hook,
          })
          const media = wantVideo ? await generateVideo(visualPromptText) : await generateImage(visualPromptText)
          mediaUrl = media.url
        } catch (err) {
          mediaWarning = err instanceof Error ? err.message : 'Media generation failed'
        }
      }
    }

    const withMedia: GeneratedPost[] = results.map((r) => {
      if (!r.content || !mediaUrl) return r
      return wantVideo ? { ...r, videoUrl: mediaUrl } : { ...r, imageUrl: mediaUrl }
    })

    const finalResults: GeneratedPost[] = mediaWarning
      ? withMedia.map((r) => (r.content ? { ...r, mediaWarning } : r))
      : withMedia

    const successful = finalResults.filter((r) => r.content)
    if (successful.length > 0) {
      await prisma.generatedContent.createMany({
        data: successful.map((r) => ({
          brandId,
          platform: r.platform,
          contentType,
          topic: topic || null,
          content: r.content,
          hook: r.hook,
          tip: r.tip ?? null,
          imageUrl: r.imageUrl ?? null,
          videoUrl: r.videoUrl ?? null,
          visualPrompt: visualPromptText ?? null,
        })),
      })
    }

    return NextResponse.json({ success: true, data: finalResults })
  } catch (error) {
    console.error('Content generation error:', error)
    return NextResponse.json(
      { success: false, error: 'Content generation failed. Please try again.' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 3: Add the history route**

```typescript
// src/app/api/content/history/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get('brandId')
  if (!brandId) {
    return NextResponse.json({ success: false, error: 'brandId is required' }, { status: 400 })
  }
  try {
    const items = await prisma.generatedContent.findMany({
      where: { brandId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return NextResponse.json({ success: true, data: items })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch content history'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
```

`take: 100` is a deliberate simple cap for this v1 flat history list — no pagination yet.

- [ ] **Step 4: Verify manually**

With a real brand id, a configured text provider key, and a configured Runware key:

```bash
curl -X POST http://localhost:3000/api/content/generate \
  -H "Content-Type: application/json" \
  -d '{"brandId":"<real-brand-id>","platforms":["INSTAGRAM"],"contentType":"educational","generateImage":true}'
```

Expected: `{"success":true,"data":[{...,"imageUrl":"https://..."}]}`. Then:

```bash
curl "http://localhost:3000/api/content/history?brandId=<real-brand-id>"
```

Expected: the same generation now appears in the history list. Also verify without `generateImage`/`generateVideo` (plain text generation) still persists and still works exactly as before.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/content-generator.ts "src/app/api/content/generate/route.ts" src/app/api/content/history/route.ts
git commit -m "feat(media): generate optional image/video and persist all generated content"
```

---

### Task 6: Settings page Runware key field

**Files:**
- Modify: `src/app/api/settings/keys/route.ts`
- Modify: `src/app/(dashboard)/settings/page.tsx`

**Interfaces:**
- Consumes: `getKeyStatus`/`saveKeys`/`loadKeys` (Task 1's widened types).

- [ ] **Step 1: Extend the API route**

In `src/app/api/settings/keys/route.ts`, change:

```typescript
const schema = z.object({
  gemini: z.string().optional(),
  anthropic: z.string().optional(),
  openai: z.string().optional(),
  ollamaBaseUrl: z.string().optional(),
  defaultProvider: z.enum(['gemini', 'anthropic', 'openai', 'ollama']).optional(),
})
```

to:

```typescript
const schema = z.object({
  gemini: z.string().optional(),
  anthropic: z.string().optional(),
  openai: z.string().optional(),
  runware: z.string().optional(),
  ollamaBaseUrl: z.string().optional(),
  defaultProvider: z.enum(['gemini', 'anthropic', 'openai', 'ollama']).optional(),
})
```

And change:

```typescript
    const { gemini, anthropic, openai, ollamaBaseUrl, defaultProvider } = parsed.data
    const existing = loadKeys()

    // Empty string clears a key; undefined leaves the stored value untouched.
    saveKeys({
      gemini: gemini !== undefined ? gemini || undefined : existing.gemini,
      anthropic: anthropic !== undefined ? anthropic || undefined : existing.anthropic,
      openai: openai !== undefined ? openai || undefined : existing.openai,
      ollamaBaseUrl: ollamaBaseUrl !== undefined ? ollamaBaseUrl || undefined : existing.ollamaBaseUrl,
      defaultProvider: defaultProvider ?? existing.defaultProvider,
    })
```

to:

```typescript
    const { gemini, anthropic, openai, runware, ollamaBaseUrl, defaultProvider } = parsed.data
    const existing = loadKeys()

    // Empty string clears a key; undefined leaves the stored value untouched.
    saveKeys({
      gemini: gemini !== undefined ? gemini || undefined : existing.gemini,
      anthropic: anthropic !== undefined ? anthropic || undefined : existing.anthropic,
      openai: openai !== undefined ? openai || undefined : existing.openai,
      runware: runware !== undefined ? runware || undefined : existing.runware,
      ollamaBaseUrl: ollamaBaseUrl !== undefined ? ollamaBaseUrl || undefined : existing.ollamaBaseUrl,
      defaultProvider: defaultProvider ?? existing.defaultProvider,
    })
```

- [ ] **Step 2: Extend the Settings page**

In `src/app/(dashboard)/settings/page.tsx`, change the `KeyStatus` interface:

```typescript
interface KeyStatus {
  gemini: boolean
  anthropic: boolean
  openai: boolean
  ollamaBaseUrl: string
  defaultProvider: AIProvider
}
```

to:

```typescript
interface KeyStatus {
  gemini: boolean
  anthropic: boolean
  openai: boolean
  runware: boolean
  ollamaBaseUrl: string
  defaultProvider: AIProvider
}
```

Then change the closing of the "API Keys" card and the button below it — replace:

```tsx
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto self-start"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {saved ? 'Saved' : saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </div>
  )
}
```

with:

```tsx
      </div>

      <div className="card flex flex-col gap-4 mt-6">
        <div>
          <h2 className="text-sm font-semibold text-white">Media Generation</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Runware powers image and video generation in Content Lab.
          </p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-slate-400">
            Runware API key {status.runware && (
              <span className="text-green-400">(configured — leave blank to keep)</span>
            )}
          </span>
          <input
            type="password"
            value={keyInputs.runware ?? ''}
            onChange={(e) => setKeyInputs((prev) => ({ ...prev, runware: e.target.value }))}
            placeholder="rw_…"
            className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto self-start mt-6"
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        {saved ? 'Saved' : saving ? 'Saving…' : 'Save settings'}
      </button>
    </div>
  )
}
```

(This moves the single Save button below both cards — it already POSTs the full `keyInputs` object via `...keyInputs`, so `runware` is included automatically once the input exists.)

- [ ] **Step 3: Verify manually**

Open `http://localhost:3000/settings`. Expected: a new "Media Generation" card with a Runware key field; entering a key and clicking "Save settings" persists it (reload the page — the field shows "(configured — leave blank to keep)").

- [ ] **Step 4: Commit**

```bash
git add src/app/api/settings/keys/route.ts "src/app/(dashboard)/settings/page.tsx"
git commit -m "feat(media): add Runware key field to Settings"
```

---

### Task 7: Content Lab UI — media toggles, preview, and schedule handoff

**Files:**
- Modify: `src/app/(dashboard)/create/page.tsx`
- Modify: `src/app/(dashboard)/schedule/page.tsx`

**Interfaces:**
- Consumes: the widened `GeneratedPost` (Task 5), `POST /api/content/generate`'s new request/response fields (Task 5).

- [ ] **Step 1: Add media toggle state and wire it into the request**

In `src/app/(dashboard)/create/page.tsx`, add state near the existing `topic` state:

```typescript
  const [wantImage, setWantImage] = useState(false)
  const [wantVideo, setWantVideo] = useState(false)
```

Add these handlers near `togglePlatform`:

```typescript
  function toggleImage() {
    setWantImage((v) => {
      const next = !v
      if (next) setWantVideo(false)
      return next
    })
  }

  function toggleVideo() {
    setWantVideo((v) => {
      const next = !v
      if (next) setWantImage(false)
      return next
    })
  }
```

In `handleGenerate`, change the fetch body:

```typescript
        body: JSON.stringify({ brandId, platforms: selectedPlatforms, contentType, topic }),
```

to:

```typescript
        body: JSON.stringify({
          brandId,
          platforms: selectedPlatforms,
          contentType,
          topic,
          generateImage: wantImage,
          generateVideo: wantVideo,
        }),
```

- [ ] **Step 2: Add the media toggle UI**

Insert this new panel right after the "Platforms" panel (`</div>` that closes the platforms `bg-slate-800` card) and before the "Generate button":

```tsx
          {/* Media */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
              Media (optional, uses Runware)
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={toggleImage}
                className={clsx(
                  'flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                  wantImage
                    ? 'border-blue-500/60 bg-blue-500/10 text-white'
                    : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-600'
                )}
              >
                Generate image
              </button>
              <button
                type="button"
                onClick={toggleVideo}
                className={clsx(
                  'flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                  wantVideo
                    ? 'border-blue-500/60 bg-blue-500/10 text-white'
                    : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-600'
                )}
              >
                Generate video
              </button>
            </div>
            {wantVideo && (
              <p className="text-xs text-slate-500 mt-2">Video generation can take up to 2 minutes.</p>
            )}
          </div>

```

- [ ] **Step 3: Show media in the result card**

In `ResultCard`, insert this block right after the `<CharBar .../>` line and before the "Tip (collapsible)" block:

```tsx
          {/* Media */}
          {result.imageUrl && (
            <img
              src={result.imageUrl}
              alt="Generated visual"
              className="w-full rounded-lg border border-slate-700"
            />
          )}
          {result.videoUrl && (
            <video src={result.videoUrl} controls className="w-full rounded-lg border border-slate-700" />
          )}
          {result.mediaWarning && (
            <p className="text-xs text-yellow-400">Media generation failed: {result.mediaWarning}</p>
          )}

```

- [ ] **Step 4: Carry media through the schedule handoff**

Change `handleSchedule`:

```typescript
  function handleSchedule(result: GeneratedPost) {
    sessionStorage.setItem('smg_prefill_content', result.content)
    sessionStorage.setItem('smg_prefill_platform', result.platform)
    sessionStorage.setItem('smg_prefill_brandId', brandId)
    window.location.href = '/schedule'
  }
```

to:

```typescript
  function handleSchedule(result: GeneratedPost) {
    sessionStorage.setItem('smg_prefill_content', result.content)
    sessionStorage.setItem('smg_prefill_platform', result.platform)
    sessionStorage.setItem('smg_prefill_brandId', brandId)
    const mediaUrl = result.imageUrl ?? result.videoUrl
    if (mediaUrl) sessionStorage.setItem('smg_prefill_media', mediaUrl)
    window.location.href = '/schedule'
  }
```

In `src/app/(dashboard)/schedule/page.tsx`, change the prefill effect:

```typescript
  useEffect(() => {
    const prefill = sessionStorage.getItem('smg_prefill_content')
    const prefillPlatform = sessionStorage.getItem('smg_prefill_platform') as Platform | null
    const prefillBrandId = sessionStorage.getItem('smg_prefill_brandId')
    if (prefill) {
      sessionStorage.removeItem('smg_prefill_content')
      sessionStorage.removeItem('smg_prefill_platform')
      sessionStorage.removeItem('smg_prefill_brandId')
      setForm((prev) => ({
        ...prev,
        content: prefill,
        platforms: prefillPlatform ? [prefillPlatform] : prev.platforms,
        brandId: prefillBrandId || prev.brandId,
      }))
    }
  }, [])
```

to:

```typescript
  useEffect(() => {
    const prefill = sessionStorage.getItem('smg_prefill_content')
    const prefillPlatform = sessionStorage.getItem('smg_prefill_platform') as Platform | null
    const prefillBrandId = sessionStorage.getItem('smg_prefill_brandId')
    const prefillMedia = sessionStorage.getItem('smg_prefill_media')
    if (prefill) {
      sessionStorage.removeItem('smg_prefill_content')
      sessionStorage.removeItem('smg_prefill_platform')
      sessionStorage.removeItem('smg_prefill_brandId')
      sessionStorage.removeItem('smg_prefill_media')
      setForm((prev) => ({
        ...prev,
        content: prefill,
        platforms: prefillPlatform ? [prefillPlatform] : prev.platforms,
        brandId: prefillBrandId || prev.brandId,
        mediaUrlsRaw: prefillMedia || prev.mediaUrlsRaw,
      }))
    }
  }, [])
```

- [ ] **Step 5: Verify manually**

With a Runware key configured: generate content with "Generate image" checked. Expected: an image preview appears on each successful result card. Click "Schedule this post" — expected: Schedule page opens with brand, content, platform, AND the media URL pre-filled in the Media URLs field. Repeat for "Generate video" (allow up to ~2 minutes). Also verify plain text generation (no media toggles) is unaffected.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/create/page.tsx" "src/app/(dashboard)/schedule/page.tsx"
git commit -m "feat(media): add image/video generation toggles to Content Lab"
```

---

### Task 8: Library page and nav update

**Files:**
- Create: `src/app/(dashboard)/library/page.tsx`
- Modify: `src/components/sidebar-nav.tsx`

**Interfaces:**
- Consumes: `GET /api/brands`, `GET /api/content/history?brandId=` (Task 5).

- [ ] **Step 1: Write the implementation**

```tsx
// src/app/(dashboard)/library/page.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { PlatformIcon } from '@/components/platform-icons'
import { PLATFORMS } from '@/types'
import type { Platform } from '@/types'

interface Brand {
  id: string
  name: string
  slug: string
}

interface HistoryItem {
  id: string
  platform: string
  contentType: string
  topic: string | null
  content: string
  hook: string
  tip: string | null
  imageUrl: string | null
  videoUrl: string | null
  createdAt: string
}

function isPlatform(value: string): value is Platform {
  return (PLATFORMS as string[]).includes(value)
}

export default function LibraryPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [brandId, setBrandId] = useState('')
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

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

  const loadHistory = useCallback((id: string) => {
    if (!id) {
      setItems([])
      return
    }
    setLoading(true)
    fetch(`/api/content/history?brandId=${id}`)
      .then((r) => r.json())
      .then((json) => setItems(json.data ?? []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadHistory(brandId)
  }, [brandId, loadHistory])

  function handleCopy(item: HistoryItem) {
    navigator.clipboard.writeText(item.content).then(() => {
      setCopiedId(item.id)
      setTimeout(() => setCopiedId(null), 1800)
    })
  }

  function handleSchedule(item: HistoryItem) {
    sessionStorage.setItem('smg_prefill_content', item.content)
    sessionStorage.setItem('smg_prefill_platform', item.platform)
    sessionStorage.setItem('smg_prefill_brandId', brandId)
    const mediaUrl = item.imageUrl ?? item.videoUrl
    if (mediaUrl) sessionStorage.setItem('smg_prefill_media', mediaUrl)
    window.location.href = '/schedule'
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Library</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Every piece of content Content Lab has generated for this brand, saved automatically.
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
      ) : items.length === 0 ? (
        <p className="text-slate-500 text-sm">No generated content yet for this brand.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isPlatform(item.platform) && <PlatformIcon platform={item.platform} size={18} />}
                  <span className="text-xs text-slate-500">{item.contentType}</span>
                  <span className="text-xs text-slate-600">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleCopy(item)}
                    type="button"
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    {copiedId === item.id ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={() => handleSchedule(item)}
                    type="button"
                    className="text-xs text-blue-400 hover:underline"
                  >
                    Schedule this
                  </button>
                </div>
              </div>
              <p className="text-sm text-slate-200 whitespace-pre-wrap">{item.content}</p>
              {item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt="Generated visual"
                  className="w-full max-w-xs rounded-lg border border-slate-700"
                />
              )}
              {item.videoUrl && (
                <video src={item.videoUrl} controls className="w-full max-w-xs rounded-lg border border-slate-700" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

Modify `src/components/sidebar-nav.tsx` — add `Library` to the lucide-react import and one new entry to `NAV_ITEMS`. This plan assumes `docs/superpowers/plans/2026-07-17-campaigns-calendar.md` has already added "Campaigns"/"Calendar" (see Global Constraints) — insert "Library" right after them:

```typescript
import {
  LayoutDashboard,
  Sparkles,
  Rocket,
  CalendarDays,
  Library,
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
  { href: '/library', label: 'Library', icon: Library },
  { href: '/schedule', label: 'Schedule', icon: CalendarPlus },
  { href: '/queue', label: 'Queue', icon: ClipboardList },
  { href: '/comments', label: 'Comments', icon: MessageSquare },
  { href: '/brands', label: 'Brands', icon: Building2 },
  { href: '/connect', label: 'Connect', icon: Link2 },
  { href: '/settings', label: 'Settings', icon: Settings },
]
```

If `Rocket`/`CalendarDays` and the `/campaigns`/`/calendar` entries are not already present when this task runs, add only `Library`/`/library` and leave the rest of the file as you find it.

- [ ] **Step 2: Verify manually**

Open `http://localhost:3000/library`. Expected: past Content Lab generations for the selected brand appear, newest first, with media previews where applicable. "Schedule this" pre-fills the Schedule page correctly (content, platform, brand, media).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/library/page.tsx" src/components/sidebar-nav.tsx
git commit -m "feat(media): add Library page and nav entry"
```

---

## Self-Review Notes

- **Spec coverage:** all sections of `docs/superpowers/specs/2026-07-17-content-lab-media-and-persistence-design.md` are covered — Runware client (Tasks 1-2), visual-prompt bridging (Task 3), schema (Task 4), generation+persistence (Task 5), Settings (Task 6), Content Lab UI (Task 7), Library+nav (Task 8).
- **Type consistency:** `MediaResult`/`GenerateImageOptions`/`GenerateVideoOptions` (Task 2) match their usage in Task 5's route unchanged. `GeneratedPost`'s three new optional fields (Task 5, Step 1) are the same names used by Task 7's UI and Task 8's `HistoryItem` (a separate, API-row-shaped interface, deliberately not reusing `GeneratedPost`).
- **Sequencing:** Task 8 explicitly handles the case where the sibling Campaigns/Calendar plan's nav change hasn't landed yet, per the Global Constraints note.
