# Brand Profile Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Brand profile with app store/social URLs, real logo upload, and two AI-assisted "fill this form for me" actions (from a URL, from a local folder) — all reviewed by the user before saving.

**Architecture:** New Prisma columns on `Brand`; a small provider-agnostic extraction library (`src/lib/brand-extraction/*`) that turns raw text (fetched HTML or local files) into a structured suggestion object via the existing `generateText()` layer from Phase 2; two new API routes that orchestrate fetch/scan → extract → return (never write to the DB directly — the client merges suggestions into form state, user still hits Save); a logo upload route + shared `src/lib/uploads.ts` helper; new small form-section components wired into the existing `BrandEditForm`/`CreateBrandForm` in `brands/page.tsx`.

**Tech Stack:** Next.js App Router route handlers, Prisma/SQLite, Zod, Vitest (node environment), `mammoth` (new, .docx text extraction), `pdf-parse` (new, .pdf text extraction). No new AI SDK — reuses `src/lib/ai/providers.ts` from Phase 2.

## Global Constraints

- Provider-agnostic: extraction must go through `generateText()` from `src/lib/ai/providers.ts`, not a hardcoded SDK — matches the Phase 2 architecture.
- Review-before-save: extraction routes return suggestions only; nothing writes to the `Brand` row until the user submits the create/edit form.
- Folder scan is local-machine-only; the route reads a filesystem path from the server process's perspective. UI copy must say so.
- Images in folder scan: v1 only does logo *filename* detection (`logo.png`/`.jpg`/`.jpeg`/`.svg`/`.webp`), no vision-model analysis of image contents.
- Folder scan: top-level files only, no recursion. Caps: 20 files max, 4000 chars/file, 20000 chars total.
- Logo: optional field; UI shows a non-blocking warning badge when missing, per approved spec (not a hard requirement to save).
- Lib functions (`src/lib/**/*.ts`) get Vitest unit tests, following `src/lib/ai/providers.test.ts` conventions (mocked `fs`/dynamic imports/`fetch`). Next.js route handlers and `.tsx` components get manual smoke-test verification only — matches this repo's existing convention (no route-handler or component test infra exists; `vitest.config.ts` only includes `src/**/*.test.ts` in a `node` environment, no jsdom).
- Follow existing code style: 2-space indent, no semicolons-optional inconsistency (match surrounding file), Tailwind utility classes matching `btn-primary`/`btn-secondary`/`card` conventions in `globals.css`.

---

### Task 1: Prisma schema — new Brand columns

**Files:**
- Modify: `prisma/schema.prisma` (Brand model)

**Interfaces:**
- Produces: `Brand.appStoreUrl: String?`, `Brand.socialUrls: String?` (JSON), `Brand.localFolderPath: String?` — consumed by Tasks 2–3 and the UI tasks.

- [ ] **Step 1: Add the three new columns to the Brand model**

In `prisma/schema.prisma`, find the Brand model's Content Engine section and add the new fields directly after `websiteContent`:

```prisma
model Brand {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  description String?
  logoUrl     String?
  voice       String   @default("{}")  // JSON: { tone, personality, avoid, cta }
  context     String   @default("{}")  // JSON: { products, faqs, targetAudience, keyMessages }
  // --- Content Engine fields (ported from BrandFlow) ---
  niche          String?
  audience       String?
  tone           String?
  goals          String?  // JSON string array
  website        String?
  websiteContent String?
  appStoreUrl    String?  // NEW
  socialUrls     String?  // NEW — JSON: { FACEBOOK?, INSTAGRAM?, TWITTER?, LINKEDIN?, TIKTOK?, YOUTUBE?, REDDIT? }
  localFolderPath String? // NEW — last-scanned local folder path, convenience only
  brandKit       String?  // JSON string
  engineSettings String?  // JSON string (BrandFlow per-brand settings)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  connections          PlatformConnection[]
  scheduledPosts       ScheduledPost[]
  commentOpportunities CommentOpportunity[]
  campaigns            Campaign[]
}
```

- [ ] **Step 2: Push the schema and regenerate the client**

Run: `npx prisma db push && npx prisma generate`
Expected: `Your database is now in sync with your Prisma schema.` and `Generated Prisma Client`.

- [ ] **Step 3: Verify the columns exist**

Run:
```bash
node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.brand.findFirst().then(b=>{console.log('appStoreUrl' in b, 'socialUrls' in b, 'localFolderPath' in b);p.\$disconnect()})"
```
Expected: `true true true`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(db): add appStoreUrl, socialUrls, localFolderPath to Brand"
```

---

### Task 2: `src/lib/brands.ts` — parse new fields (TDD)

**Files:**
- Create: `src/lib/brands.test.ts`
- Modify: `src/lib/brands.ts`

**Interfaces:**
- Consumes: `Platform`, `PLATFORMS` from `@/types`
- Produces: `parseGoals(raw: string | null): string[]`, `parseSocialUrls(raw: string | null): Partial<Record<Platform, string>>` (exported for testing and reuse), extended `ParsedBrand` interface with `niche`, `audience`, `tone`, `goals`, `website`, `websiteContent`, `appStoreUrl`, `socialUrls`, `localFolderPath`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/brands.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseGoals, parseSocialUrls } from './brands'

describe('parseGoals', () => {
  it('returns an empty array for null', () => {
    expect(parseGoals(null)).toEqual([])
  })

  it('parses a JSON string array', () => {
    expect(parseGoals('["grow signups", "reduce churn"]')).toEqual(['grow signups', 'reduce churn'])
  })

  it('filters out non-string entries', () => {
    expect(parseGoals('["a", 1, null, "b"]')).toEqual(['a', 'b'])
  })

  it('returns an empty array for malformed JSON', () => {
    expect(parseGoals('not json')).toEqual([])
  })

  it('returns an empty array when the JSON is not an array', () => {
    expect(parseGoals('{"a":1}')).toEqual([])
  })
})

describe('parseSocialUrls', () => {
  it('returns an empty object for null', () => {
    expect(parseSocialUrls(null)).toEqual({})
  })

  it('parses known platform keys and trims values', () => {
    expect(parseSocialUrls('{"FACEBOOK":" https://fb.com/acme ","INSTAGRAM":"https://ig.com/acme"}')).toEqual({
      FACEBOOK: 'https://fb.com/acme',
      INSTAGRAM: 'https://ig.com/acme',
    })
  })

  it('drops unknown keys and empty values', () => {
    expect(parseSocialUrls('{"FACEBOOK":"https://fb.com/acme","MYSPACE":"https://myspace.com/acme","TWITTER":""}')).toEqual({
      FACEBOOK: 'https://fb.com/acme',
    })
  })

  it('returns an empty object for malformed JSON', () => {
    expect(parseSocialUrls('not json')).toEqual({})
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/brands.test.ts`
Expected: FAIL — `parseGoals`/`parseSocialUrls` are not exported from `./brands`.

- [ ] **Step 3: Implement**

In `src/lib/brands.ts`, add the import and the two new parse functions, extend `ParsedBrand`, and update `mapBrand`:

```ts
import { prisma } from '@/lib/db'
import type { BrandVoice, BrandContext, Platform } from '@/types'
import { PLATFORMS } from '@/types'

export interface ParsedBrand {
  id: string
  name: string
  slug: string
  description: string | null
  logoUrl: string | null
  voice: BrandVoice
  context: BrandContext
  niche: string | null
  audience: string | null
  tone: string | null
  goals: string[]
  website: string | null
  websiteContent: string | null
  appStoreUrl: string | null
  socialUrls: Partial<Record<Platform, string>>
  localFolderPath: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
```

Add below `parseContext`:

```ts
export function parseGoals(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((g): g is string => typeof g === 'string') : []
  } catch {
    return []
  }
}

export function parseSocialUrls(raw: string | null): Partial<Record<Platform, string>> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const result: Partial<Record<Platform, string>> = {}
    for (const platform of PLATFORMS) {
      const value = parsed[platform]
      if (typeof value === 'string' && value.trim()) result[platform] = value.trim()
    }
    return result
  } catch {
    return {}
  }
}
```

Update `mapBrand`'s parameter type and return value:

```ts
function mapBrand(brand: {
  id: string
  name: string
  slug: string
  description: string | null
  logoUrl: string | null
  voice: string
  context: string
  niche: string | null
  audience: string | null
  tone: string | null
  goals: string | null
  website: string | null
  websiteContent: string | null
  appStoreUrl: string | null
  socialUrls: string | null
  localFolderPath: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}): ParsedBrand {
  return {
    ...brand,
    voice: parseVoice(brand.voice),
    context: parseContext(brand.context),
    goals: parseGoals(brand.goals),
    socialUrls: parseSocialUrls(brand.socialUrls),
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/brands.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (Prisma's generated `Brand` type now includes the new columns from Task 1, so the `mapBrand` parameter type is structurally compatible)

- [ ] **Step 6: Commit**

```bash
git add src/lib/brands.ts src/lib/brands.test.ts
git commit -m "feat: parse new brand fields (goals, socialUrls)"
```

---

### Task 3: Brand API routes — accept the new fields

**Files:**
- Modify: `src/app/api/brands/route.ts` (POST)
- Modify: `src/app/api/brands/[id]/route.ts` (PATCH)

**Interfaces:**
- Consumes: `PLATFORMS` from `@/types`, `parseGoals`/`parseSocialUrls` not needed here (write path only).
- Produces: brand rows created/updated with the new columns populated from request bodies.

- [ ] **Step 1: Extend `CreateBrandSchema` in `src/app/api/brands/route.ts`**

```ts
const CreateBrandSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  description: z.string().max(500).optional(),
  logoUrl: z.string().url().optional(),
  voice: z
    .object({
      tone: z.string().default(''),
      personality: z.string().default(''),
      avoid: z.array(z.string()).default([]),
      cta: z.string().optional(),
    })
    .optional(),
  context: z
    .object({
      products: z.array(z.string()).default([]),
      faqs: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
      targetAudience: z.array(z.string()).default([]),
      keyMessages: z.array(z.string()).default([]),
    })
    .optional(),
  niche: z.string().max(300).optional(),
  audience: z.string().max(300).optional(),
  tone: z.string().max(300).optional(),
  goals: z.array(z.string()).default([]).optional(),
  website: z.string().url().optional(),
  websiteContent: z.string().max(20000).optional(),
  appStoreUrl: z.string().url().optional(),
  socialUrls: z.record(z.string(), z.string().url()).optional(),
})
```

Update the `POST` handler to write the new fields:

```ts
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = CreateBrandSchema.safeParse(body)

    if (!validated.success) {
      return Response.json(
        { success: false, error: validated.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const {
      name, slug, description, logoUrl, voice, context,
      niche, audience, tone, goals, website, websiteContent, appStoreUrl, socialUrls,
    } = validated.data

    const existing = await prisma.brand.findUnique({ where: { slug } })
    if (existing) {
      return Response.json(
        { success: false, error: `A brand with slug "${slug}" already exists` },
        { status: 409 }
      )
    }

    const brand = await prisma.brand.create({
      data: {
        name,
        slug,
        description: description ?? null,
        logoUrl: logoUrl ?? null,
        voice: JSON.stringify(voice ?? {}),
        context: JSON.stringify(context ?? {}),
        niche: niche ?? null,
        audience: audience ?? null,
        tone: tone ?? null,
        goals: JSON.stringify(goals ?? []),
        website: website ?? null,
        websiteContent: websiteContent ?? null,
        appStoreUrl: appStoreUrl ?? null,
        socialUrls: JSON.stringify(socialUrls ?? {}),
      },
    })

    return Response.json({ success: true, data: brand }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create brand'
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Extend `UpdateBrandSchema` in `src/app/api/brands/[id]/route.ts`**

```ts
const UpdateBrandSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  isActive: z.boolean().optional(),
  voice: z
    .object({
      tone: z.string(),
      personality: z.string(),
      avoid: z.array(z.string()),
      cta: z.string().optional(),
    })
    .optional(),
  context: z
    .object({
      products: z.array(z.string()),
      faqs: z.array(z.object({ q: z.string(), a: z.string() })),
      targetAudience: z.array(z.string()),
      keyMessages: z.array(z.string()),
    })
    .optional(),
  niche: z.string().max(300).nullable().optional(),
  audience: z.string().max(300).nullable().optional(),
  tone: z.string().max(300).nullable().optional(),
  goals: z.array(z.string()).optional(),
  website: z.string().url().nullable().optional(),
  websiteContent: z.string().max(20000).nullable().optional(),
  appStoreUrl: z.string().url().nullable().optional(),
  socialUrls: z.record(z.string(), z.string().url()).optional(),
  localFolderPath: z.string().max(500).nullable().optional(),
})
```

Update the `PATCH` handler's data mapping (the `voice`/`context` destructure already excludes them from `...rest`; add `goals` and `socialUrls` to that same destructure since they also need JSON.stringify):

```ts
export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {
  const { id } = await params
  try {
    const body = await request.json()
    const validated = UpdateBrandSchema.safeParse(body)

    if (!validated.success) {
      return Response.json(
        { success: false, error: validated.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { voice, context, goals, socialUrls, ...rest } = validated.data

    const existing = await prisma.brand.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ success: false, error: 'Brand not found' }, { status: 404 })
    }

    const updated = await prisma.brand.update({
      where: { id },
      data: {
        ...rest,
        ...(voice !== undefined ? { voice: JSON.stringify(voice) } : {}),
        ...(context !== undefined ? { context: JSON.stringify(context) } : {}),
        ...(goals !== undefined ? { goals: JSON.stringify(goals) } : {}),
        ...(socialUrls !== undefined ? { socialUrls: JSON.stringify(socialUrls) } : {}),
      },
    })

    return Response.json({ success: true, data: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update brand'
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Manual smoke test**

With the dev server running and an authenticated session cookie in the browser, use the browser devtools console on any dashboard page to run:
```js
fetch('/api/brands').then(r => r.json()).then(d => console.log(d.data[0].id))
```
Copy the id, then:
```js
fetch('/api/brands/<id>', { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ niche: 'test niche', goals: ['a','b'], socialUrls: { FACEBOOK: 'https://facebook.com/test' } }) }).then(r => r.json()).then(console.log)
```
Expected: `{ success: true, data: { ...niche: 'test niche', goals: '["a","b"]', socialUrls: '{"FACEBOOK":"https://facebook.com/test"}', ... } }`

- [ ] **Step 5: Commit**

```bash
git add src/app/api/brands/route.ts "src/app/api/brands/[id]/route.ts"
git commit -m "feat(api): accept new brand fields in create/update routes"
```

---

### Task 4: `src/lib/uploads.ts` — shared logo storage helper (TDD)

**Files:**
- Create: `src/lib/uploads.test.ts`
- Create: `src/lib/uploads.ts`

**Interfaces:**
- Produces: `sanitizeFilename(name: string): string`, `isAllowedImageExtension(filename: string): boolean`, `isWithinSizeLimit(byteLength: number): boolean`, `saveLogoBuffer(buffer: Buffer, originalFilename: string): string` (returns a `/uploads/logos/...` URL) — consumed by Task 5 (upload route) and Task 12 (scan-folder route).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/uploads.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mkdirSync, writeFileSync } = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('fs', () => ({
  default: { mkdirSync, writeFileSync },
  mkdirSync,
  writeFileSync,
}))

const { randomUUID } = vi.hoisted(() => ({ randomUUID: vi.fn(() => 'fixed-uuid') }))
vi.mock('crypto', () => ({ randomUUID }))

import { sanitizeFilename, isAllowedImageExtension, isWithinSizeLimit, saveLogoBuffer } from './uploads'

beforeEach(() => {
  mkdirSync.mockReset()
  writeFileSync.mockReset()
})

describe('sanitizeFilename', () => {
  it('lowercases and replaces unsafe characters with dashes', () => {
    expect(sanitizeFilename('My Logo File!.PNG')).toBe('my-logo-file-.png')
  })

  it('collapses repeated dashes', () => {
    expect(sanitizeFilename('a   b---c.png')).toBe('a-b-c.png')
  })
})

describe('isAllowedImageExtension', () => {
  it('allows png, jpg, jpeg, svg, webp case-insensitively', () => {
    expect(isAllowedImageExtension('logo.PNG')).toBe(true)
    expect(isAllowedImageExtension('logo.jpg')).toBe(true)
    expect(isAllowedImageExtension('logo.jpeg')).toBe(true)
    expect(isAllowedImageExtension('logo.svg')).toBe(true)
    expect(isAllowedImageExtension('logo.webp')).toBe(true)
  })

  it('rejects other extensions', () => {
    expect(isAllowedImageExtension('logo.gif')).toBe(false)
    expect(isAllowedImageExtension('logo.exe')).toBe(false)
  })
})

describe('isWithinSizeLimit', () => {
  it('allows exactly 5MB', () => {
    expect(isWithinSizeLimit(5 * 1024 * 1024)).toBe(true)
  })

  it('rejects over 5MB', () => {
    expect(isWithinSizeLimit(5 * 1024 * 1024 + 1)).toBe(false)
  })
})

describe('saveLogoBuffer', () => {
  it('creates the upload directory and writes the file, returning a public URL', () => {
    const url = saveLogoBuffer(Buffer.from('fake-image-bytes'), 'My Logo.png')

    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('uploads'), { recursive: true })
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('fixed-uuid-my-logo.png'),
      Buffer.from('fake-image-bytes')
    )
    expect(url).toBe('/uploads/logos/fixed-uuid-my-logo.png')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/uploads.test.ts`
Expected: FAIL — `Cannot find module './uploads'`

- [ ] **Step 3: Implement**

Create `src/lib/uploads.ts`:

```ts
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'logos')
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp']
const MAX_BYTES = 5 * 1024 * 1024 // 5MB

export function sanitizeFilename(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9.-]/g, '-').replace(/-+/g, '-')
}

export function isAllowedImageExtension(filename: string): boolean {
  return ALLOWED_EXTENSIONS.includes(path.extname(filename).toLowerCase())
}

export function isWithinSizeLimit(byteLength: number): boolean {
  return byteLength <= MAX_BYTES
}

export function saveLogoBuffer(buffer: Buffer, originalFilename: string): string {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  const filename = `${randomUUID()}-${sanitizeFilename(originalFilename)}`
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer)
  return `/uploads/logos/${filename}`
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/uploads.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Ensure uploads are gitignored**

Add to `.gitignore` (near the Prisma section):
```
# Uploaded brand assets
/public/uploads/
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/uploads.ts src/lib/uploads.test.ts .gitignore
git commit -m "feat: add logo upload storage helper"
```

---

### Task 5: `POST /api/brands/upload-logo` route

**Files:**
- Create: `src/app/api/brands/upload-logo/route.ts`

**Interfaces:**
- Consumes: `isAllowedImageExtension`, `isWithinSizeLimit`, `saveLogoBuffer` from `@/lib/uploads`
- Produces: `POST` returning `{ success: true, data: { url: string } }` or `{ success: false, error: string }`

- [ ] **Step 1: Implement the route**

Create `src/app/api/brands/upload-logo/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { isAllowedImageExtension, isWithinSizeLimit, saveLogoBuffer } from '@/lib/uploads'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 })
    }

    if (!isAllowedImageExtension(file.name)) {
      return NextResponse.json(
        { success: false, error: 'Unsupported file type. Use PNG, JPG, SVG, or WEBP.' },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    if (!isWithinSizeLimit(arrayBuffer.byteLength)) {
      return NextResponse.json({ success: false, error: 'File too large (5MB max).' }, { status: 400 })
    }

    const url = saveLogoBuffer(Buffer.from(arrayBuffer), file.name)
    return NextResponse.json({ success: true, data: { url } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manual smoke test**

With the dev server running, from a terminal (this doesn't need a session cookie only if middleware treats it as protected — it does, so use the browser instead): open the browser devtools console on any authenticated dashboard page and run:
```js
const fd = new FormData()
fd.append('file', new Blob(['fake'], { type: 'image/png' }), 'test-logo.png')
fetch('/api/brands/upload-logo', { method: 'POST', body: fd }).then(r => r.json()).then(console.log)
```
Expected: `{ success: true, data: { url: '/uploads/logos/<uuid>-test-logo.png' } }`. Then verify the file exists: check `public/uploads/logos/` in the file explorer/terminal.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/brands/upload-logo/route.ts
git commit -m "feat(api): add logo upload route"
```

---

### Task 6: `src/lib/brand-extraction/types.ts` — shared extraction shape

**Files:**
- Create: `src/lib/brand-extraction/types.ts`

**Interfaces:**
- Produces: `ExtractedBrandInfo` — consumed by Tasks 8, 11, 12, 17.

- [ ] **Step 1: Create the types file (no logic, no test needed)**

```ts
export interface ExtractedBrandInfo {
  niche?: string
  audience?: string
  tone?: string
  goals?: string[]
  products?: string[]
  targetAudience?: string[]
  keyMessages?: string[]
  voiceTone?: string
  voicePersonality?: string
  suggestedLogoUrl?: string
  sourceNote: string
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/brand-extraction/types.ts
git commit -m "feat: add ExtractedBrandInfo shared type"
```

---

### Task 7: `src/lib/brand-extraction/html-to-text.ts` (TDD)

**Files:**
- Create: `src/lib/brand-extraction/html-to-text.test.ts`
- Create: `src/lib/brand-extraction/html-to-text.ts`

**Interfaces:**
- Produces: `stripHtmlToText(html: string, maxChars?: number): string` — consumed by Task 11.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { stripHtmlToText } from './html-to-text'

describe('stripHtmlToText', () => {
  it('removes script tag contents', () => {
    expect(stripHtmlToText('<p>Hello</p><script>alert(1)</script><p>World</p>')).toBe('Hello World')
  })

  it('removes style tag contents', () => {
    expect(stripHtmlToText('<style>.a{color:red}</style><p>Hello</p>')).toBe('Hello')
  })

  it('strips remaining tags leaving text', () => {
    expect(stripHtmlToText('<div><h1>Title</h1><p>Body text</p></div>')).toBe('Title Body text')
  })

  it('decodes common HTML entities', () => {
    expect(stripHtmlToText('<p>Tom &amp; Jerry &lt;3 &quot;fun&quot;</p>')).toBe('Tom & Jerry <3 "fun"')
  })

  it('collapses repeated whitespace and newlines', () => {
    expect(stripHtmlToText('<p>Hello\n\n\n   World</p>')).toBe('Hello World')
  })

  it('truncates to the default max length', () => {
    const longText = `<p>${'a'.repeat(10000)}</p>`
    expect(stripHtmlToText(longText).length).toBe(8000)
  })

  it('respects a custom maxChars', () => {
    expect(stripHtmlToText('<p>hello world</p>', 5)).toBe('hello')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/brand-extraction/html-to-text.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/brand-extraction/html-to-text.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/brand-extraction/html-to-text.ts src/lib/brand-extraction/html-to-text.test.ts
git commit -m "feat: add HTML-to-text stripper for brand extraction"
```

---

### Task 8: `src/lib/brand-extraction/extract-meta.ts` (TDD)

**Files:**
- Create: `src/lib/brand-extraction/extract-meta.test.ts`
- Create: `src/lib/brand-extraction/extract-meta.ts`

**Interfaces:**
- Produces: `extractSuggestedLogo(html: string, baseUrl: string): string | null` — consumed by Task 11.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { extractSuggestedLogo } from './extract-meta'

describe('extractSuggestedLogo', () => {
  it('finds og:image with property before content', () => {
    const html = '<meta property="og:image" content="https://example.com/logo.png">'
    expect(extractSuggestedLogo(html, 'https://example.com')).toBe('https://example.com/logo.png')
  })

  it('finds og:image with content before property', () => {
    const html = '<meta content="https://example.com/logo.png" property="og:image">'
    expect(extractSuggestedLogo(html, 'https://example.com')).toBe('https://example.com/logo.png')
  })

  it('resolves a relative og:image against the base URL', () => {
    const html = '<meta property="og:image" content="/assets/logo.png">'
    expect(extractSuggestedLogo(html, 'https://example.com/about')).toBe('https://example.com/assets/logo.png')
  })

  it('falls back to a favicon link tag when there is no og:image', () => {
    const html = '<link rel="icon" href="/favicon.ico">'
    expect(extractSuggestedLogo(html, 'https://example.com')).toBe('https://example.com/favicon.ico')
  })

  it('matches shortcut icon rel', () => {
    const html = '<link rel="shortcut icon" href="https://example.com/favicon.ico">'
    expect(extractSuggestedLogo(html, 'https://example.com')).toBe('https://example.com/favicon.ico')
  })

  it('returns null when neither og:image nor a favicon link is present', () => {
    expect(extractSuggestedLogo('<p>no meta here</p>', 'https://example.com')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/brand-extraction/extract-meta.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/brand-extraction/extract-meta.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/brand-extraction/extract-meta.ts src/lib/brand-extraction/extract-meta.test.ts
git commit -m "feat: add og:image/favicon extraction for brand extraction"
```

---

### Task 9: `src/lib/brand-extraction/prompt.ts` (TDD)

**Files:**
- Create: `src/lib/brand-extraction/prompt.test.ts`
- Create: `src/lib/brand-extraction/prompt.ts`

**Interfaces:**
- Consumes: `ExtractedBrandInfo` from `./types`
- Produces: `buildExtractionPrompt(sourceText: string, sourceNote: string): string`, `parseExtractionResponse(raw: string, sourceNote: string): ExtractedBrandInfo` — consumed by Tasks 11, 12.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { buildExtractionPrompt, parseExtractionResponse } from './prompt'

describe('buildExtractionPrompt', () => {
  it('includes the source note and source text in the prompt', () => {
    const prompt = buildExtractionPrompt('Some brand text', 'Extracted from example.com')
    expect(prompt).toContain('Extracted from example.com')
    expect(prompt).toContain('Some brand text')
  })
})

describe('parseExtractionResponse', () => {
  it('parses a clean JSON response with all fields', () => {
    const raw = JSON.stringify({
      niche: 'home warranty tracking',
      audience: 'property hosts',
      tone: 'friendly',
      goals: ['grow signups'],
      products: ['SnapRegister'],
      targetAudience: ['hosts'],
      keyMessages: ['stay organized'],
      voiceTone: 'friendly',
      voicePersonality: 'helpful',
    })
    const info = parseExtractionResponse(raw, 'Extracted from example.com')
    expect(info).toEqual({
      niche: 'home warranty tracking',
      audience: 'property hosts',
      tone: 'friendly',
      goals: ['grow signups'],
      products: ['SnapRegister'],
      targetAudience: ['hosts'],
      keyMessages: ['stay organized'],
      voiceTone: 'friendly',
      voicePersonality: 'helpful',
      sourceNote: 'Extracted from example.com',
    })
  })

  it('extracts JSON wrapped in prose or code fences', () => {
    const raw = 'Sure! Here you go:\n```json\n{"niche":"tools"}\n```\nHope that helps.'
    const info = parseExtractionResponse(raw, 'src')
    expect(info.niche).toBe('tools')
  })

  it('converts empty strings and empty arrays to undefined', () => {
    const raw = JSON.stringify({ niche: '', goals: [], products: ['  '] })
    const info = parseExtractionResponse(raw, 'src')
    expect(info.niche).toBeUndefined()
    expect(info.goals).toBeUndefined()
    expect(info.products).toBeUndefined()
  })

  it('leaves missing fields as undefined', () => {
    const info = parseExtractionResponse('{}', 'src')
    expect(info.niche).toBeUndefined()
    expect(info.audience).toBeUndefined()
    expect(info.sourceNote).toBe('src')
  })

  it('throws when the response contains no JSON object', () => {
    expect(() => parseExtractionResponse('I could not extract anything.', 'src')).toThrow(
      /did not contain valid JSON/
    )
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/brand-extraction/prompt.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/brand-extraction/prompt.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/brand-extraction/prompt.ts src/lib/brand-extraction/prompt.test.ts
git commit -m "feat: add brand extraction prompt builder and response parser"
```

---

### Task 10: `src/lib/brand-extraction/file-readers.ts` (TDD)

**Files:**
- Create: `src/lib/brand-extraction/file-readers.test.ts`
- Create: `src/lib/brand-extraction/file-readers.ts`
- Modify: `package.json` (add `mammoth`, `pdf-parse`)

**Interfaces:**
- Produces: `readFileAsText(filePath: string): Promise<string>`, `isRecognizedTextFile(filePath: string): boolean`, `isLikelyLogoFile(filePath: string): boolean` — consumed by Task 11 (folder-walker).

- [ ] **Step 1: Install the new dependencies**

Run: `npm install mammoth pdf-parse`
Expected: both added to `package.json` `dependencies`.

- [ ] **Step 2: Write the failing tests**

Create `src/lib/brand-extraction/file-readers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { readFileSync } = vi.hoisted(() => ({ readFileSync: vi.fn() }))
vi.mock('fs', () => ({ default: { readFileSync }, readFileSync }))

const { extractRawText } = vi.hoisted(() => ({ extractRawText: vi.fn() }))
vi.mock('mammoth', () => ({ extractRawText }))

const { pdfParseFn } = vi.hoisted(() => ({ pdfParseFn: vi.fn() }))
vi.mock('pdf-parse', () => ({ default: pdfParseFn }))

import { readFileAsText, isRecognizedTextFile, isLikelyLogoFile } from './file-readers'

beforeEach(() => {
  readFileSync.mockReset()
  extractRawText.mockReset()
  pdfParseFn.mockReset()
})

describe('readFileAsText', () => {
  it('reads .txt files directly', async () => {
    readFileSync.mockReturnValue('plain text content')
    expect(await readFileAsText('/brand/notes.txt')).toBe('plain text content')
  })

  it('reads .md files directly', async () => {
    readFileSync.mockReturnValue('# Heading\n\nBody')
    expect(await readFileAsText('/brand/notes.md')).toBe('# Heading\n\nBody')
  })

  it('truncates long text files to 4000 chars', async () => {
    readFileSync.mockReturnValue('a'.repeat(5000))
    const result = await readFileAsText('/brand/notes.txt')
    expect(result.length).toBe(4000)
  })

  it('reads .docx files via mammoth', async () => {
    extractRawText.mockResolvedValue({ value: 'docx contents' })
    const result = await readFileAsText('/brand/guidelines.docx')
    expect(extractRawText).toHaveBeenCalledWith({ path: '/brand/guidelines.docx' })
    expect(result).toBe('docx contents')
  })

  it('reads .pdf files via pdf-parse', async () => {
    readFileSync.mockReturnValue(Buffer.from('fake-pdf-bytes'))
    pdfParseFn.mockResolvedValue({ text: 'pdf contents' })
    const result = await readFileAsText('/brand/guidelines.pdf')
    expect(pdfParseFn).toHaveBeenCalledWith(Buffer.from('fake-pdf-bytes'))
    expect(result).toBe('pdf contents')
  })

  it('throws on an unsupported extension', async () => {
    await expect(readFileAsText('/brand/logo.png')).rejects.toThrow(/Unsupported file type/)
  })
})

describe('isRecognizedTextFile', () => {
  it('accepts .txt, .md, .docx, .pdf case-insensitively', () => {
    expect(isRecognizedTextFile('a.TXT')).toBe(true)
    expect(isRecognizedTextFile('a.md')).toBe(true)
    expect(isRecognizedTextFile('a.DOCX')).toBe(true)
    expect(isRecognizedTextFile('a.pdf')).toBe(true)
  })

  it('rejects other extensions', () => {
    expect(isRecognizedTextFile('a.png')).toBe(false)
    expect(isRecognizedTextFile('a.xlsx')).toBe(false)
  })
})

describe('isLikelyLogoFile', () => {
  it('matches logo.png/jpg/jpeg/svg/webp case-insensitively', () => {
    expect(isLikelyLogoFile('/x/logo.png')).toBe(true)
    expect(isLikelyLogoFile('/x/Logo.JPG')).toBe(true)
    expect(isLikelyLogoFile('/x/logo.svg')).toBe(true)
  })

  it('rejects non-matching filenames', () => {
    expect(isLikelyLogoFile('/x/brand-logo.png')).toBe(false)
    expect(isLikelyLogoFile('/x/logo.txt')).toBe(false)
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/lib/brand-extraction/file-readers.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement**

```ts
import fs from 'fs'
import path from 'path'

const MAX_CHARS_PER_FILE = 4000
const RECOGNIZED_EXTENSIONS = ['.txt', '.md', '.docx', '.pdf']
const LOGO_FILENAME_PATTERN = /^logo\.(png|jpe?g|svg|webp)$/i

export async function readFileAsText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.txt' || ext === '.md') {
    return truncate(fs.readFileSync(filePath, 'utf-8'))
  }

  if (ext === '.docx') {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ path: filePath })
    return truncate(result.value)
  }

  if (ext === '.pdf') {
    const pdfParse = (await import('pdf-parse')).default
    const buffer = fs.readFileSync(filePath)
    const result = await pdfParse(buffer)
    return truncate(result.text)
  }

  throw new Error(`Unsupported file type: ${ext}`)
}

export function isRecognizedTextFile(filePath: string): boolean {
  return RECOGNIZED_EXTENSIONS.includes(path.extname(filePath).toLowerCase())
}

export function isLikelyLogoFile(filePath: string): boolean {
  return LOGO_FILENAME_PATTERN.test(path.basename(filePath))
}

function truncate(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length > MAX_CHARS_PER_FILE ? collapsed.slice(0, MAX_CHARS_PER_FILE) : collapsed
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/lib/brand-extraction/file-readers.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If `mammoth`/`pdf-parse` lack bundled types, add a small ambient declaration `src/types/pdf-parse.d.ts`:
```ts
declare module 'pdf-parse' {
  interface PdfParseResult { text: string }
  function pdfParse(buffer: Buffer): Promise<PdfParseResult>
  export default pdfParse
}
```
Only add this file if `tsc` reports `Could not find a declaration file for module 'pdf-parse'`; skip it otherwise.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/brand-extraction/file-readers.ts src/lib/brand-extraction/file-readers.test.ts
git commit -m "feat: add text extraction for txt/md/docx/pdf files"
```

---

### Task 11: `src/lib/brand-extraction/folder-walker.ts` (TDD)

**Files:**
- Create: `src/lib/brand-extraction/folder-walker.test.ts`
- Create: `src/lib/brand-extraction/folder-walker.ts`

**Interfaces:**
- Consumes: `readFileAsText`, `isRecognizedTextFile`, `isLikelyLogoFile` from `./file-readers`
- Produces: `scanFolder(folderPath: string): Promise<FolderScanResult>` where `FolderScanResult = { text: string; sourceNote: string; suggestedLogoPath: string | null }` — consumed by Task 12.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { statSync, readdirSync } = vi.hoisted(() => ({
  statSync: vi.fn(),
  readdirSync: vi.fn(),
}))
vi.mock('fs', () => ({ default: { statSync, readdirSync }, statSync, readdirSync }))

const { readFileAsText } = vi.hoisted(() => ({ readFileAsText: vi.fn() }))
vi.mock('./file-readers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./file-readers')>()
  return { ...actual, readFileAsText }
})

import { scanFolder } from './folder-walker'
import path from 'path'

function fileStat() {
  return { isDirectory: () => false, isFile: () => true }
}
function dirStat() {
  return { isDirectory: () => true, isFile: () => false }
}

beforeEach(() => {
  statSync.mockReset()
  readdirSync.mockReset()
  readFileAsText.mockReset()
})

describe('scanFolder', () => {
  it('throws when the path is not a directory', async () => {
    statSync.mockReturnValue(fileStat())
    await expect(scanFolder('/not-a-dir')).rejects.toThrow(/Not a directory/)
  })

  it('reads recognized files and concatenates their text', async () => {
    statSync.mockImplementation((p: string) => (p === '/brand' ? dirStat() : fileStat()))
    readdirSync.mockReturnValue(['notes.txt', 'ignore.xlsx'])
    readFileAsText.mockResolvedValue('brand notes here')

    const result = await scanFolder('/brand')

    expect(result.text).toContain('brand notes here')
    expect(result.text).toContain('notes.txt')
    expect(readFileAsText).toHaveBeenCalledTimes(1)
    expect(readFileAsText).toHaveBeenCalledWith(path.join('/brand', 'notes.txt'))
  })

  it('detects a suggested logo file', async () => {
    statSync.mockImplementation((p: string) => (p === '/brand' ? dirStat() : fileStat()))
    readdirSync.mockReturnValue(['logo.png', 'notes.txt'])
    readFileAsText.mockResolvedValue('notes')

    const result = await scanFolder('/brand')

    expect(result.suggestedLogoPath).toBe(path.join('/brand', 'logo.png'))
  })

  it('returns a null suggestedLogoPath when no logo file is found', async () => {
    statSync.mockImplementation((p: string) => (p === '/brand' ? dirStat() : fileStat()))
    readdirSync.mockReturnValue(['notes.txt'])
    readFileAsText.mockResolvedValue('notes')

    const result = await scanFolder('/brand')

    expect(result.suggestedLogoPath).toBeNull()
  })

  it('continues past a file that throws during read', async () => {
    statSync.mockImplementation((p: string) => (p === '/brand' ? dirStat() : fileStat()))
    readdirSync.mockReturnValue(['bad.txt', 'good.txt'])
    readFileAsText.mockImplementation(async (p: string) => {
      if (p.includes('bad.txt')) throw new Error('read error')
      return 'good content'
    })

    const result = await scanFolder('/brand')

    expect(result.text).toContain('good content')
  })

  it('caps the number of files read to 20', async () => {
    statSync.mockImplementation((p: string) => (p === '/brand' ? dirStat() : fileStat()))
    const files = Array.from({ length: 30 }, (_, i) => `file${i}.txt`)
    readdirSync.mockReturnValue(files)
    readFileAsText.mockResolvedValue('x')

    await scanFolder('/brand')

    expect(readFileAsText).toHaveBeenCalledTimes(20)
  })

  it('produces a singular sourceNote when exactly one file is read', async () => {
    statSync.mockImplementation((p: string) => (p === '/brand' ? dirStat() : fileStat()))
    readdirSync.mockReturnValue(['notes.txt'])
    readFileAsText.mockResolvedValue('notes')

    const result = await scanFolder('/brand')

    expect(result.sourceNote).toBe('Extracted from 1 file in /brand')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/brand-extraction/folder-walker.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
import fs from 'fs'
import path from 'path'
import { readFileAsText, isRecognizedTextFile, isLikelyLogoFile } from './file-readers'

const MAX_FILES = 20
const MAX_TOTAL_CHARS = 20000

export interface FolderScanResult {
  text: string
  sourceNote: string
  suggestedLogoPath: string | null
}

export async function scanFolder(folderPath: string): Promise<FolderScanResult> {
  const stat = fs.statSync(folderPath)
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${folderPath}`)
  }

  const entries = fs.readdirSync(folderPath)
  const filePaths = entries
    .map((name) => path.join(folderPath, name))
    .filter((p) => fs.statSync(p).isFile())

  const suggestedLogoPath = filePaths.find((p) => isLikelyLogoFile(p)) ?? null

  const textFiles = filePaths.filter((p) => isRecognizedTextFile(p)).slice(0, MAX_FILES)

  const chunks: string[] = []
  let totalChars = 0
  let filesRead = 0

  for (const filePath of textFiles) {
    if (totalChars >= MAX_TOTAL_CHARS) break
    try {
      const text = await readFileAsText(filePath)
      if (!text) continue
      chunks.push(`--- ${path.basename(filePath)} ---\n${text}`)
      totalChars += text.length
      filesRead += 1
    } catch {
      // Skip unreadable files — a bad file shouldn't fail the whole scan.
    }
  }

  return {
    text: chunks.join('\n\n').slice(0, MAX_TOTAL_CHARS),
    sourceNote: `Extracted from ${filesRead} file${filesRead === 1 ? '' : 's'} in ${folderPath}`,
    suggestedLogoPath,
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/brand-extraction/folder-walker.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/brand-extraction/folder-walker.ts src/lib/brand-extraction/folder-walker.test.ts
git commit -m "feat: add local folder scanner for brand extraction"
```

---

### Task 12: `POST /api/brands/gather-from-url` route

**Files:**
- Create: `src/app/api/brands/gather-from-url/route.ts`

**Interfaces:**
- Consumes: `stripHtmlToText` (Task 7), `extractSuggestedLogo` (Task 8), `buildExtractionPrompt`/`parseExtractionResponse` (Task 9), `generateText` from `@/lib/ai/providers` (Phase 2)
- Produces: `POST` returning `{ success: true, data: ExtractedBrandInfo }` or `{ success: false, error: string }`

- [ ] **Step 1: Implement the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { stripHtmlToText } from '@/lib/brand-extraction/html-to-text'
import { extractSuggestedLogo } from '@/lib/brand-extraction/extract-meta'
import { buildExtractionPrompt, parseExtractionResponse } from '@/lib/brand-extraction/prompt'
import { generateText } from '@/lib/ai/providers'

const schema = z.object({ url: z.string().url() })

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'A valid URL is required' }, { status: 400 })
    }

    const { url } = parsed.data

    const pageRes = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!pageRes.ok) {
      return NextResponse.json(
        { success: false, error: `Could not fetch that URL (${pageRes.status})` },
        { status: 400 }
      )
    }

    const html = (await pageRes.text()).slice(0, 500_000)
    const text = stripHtmlToText(html)
    if (!text) {
      return NextResponse.json({ success: false, error: 'No readable content found at that URL' }, { status: 400 })
    }

    const suggestedLogoUrl = extractSuggestedLogo(html, url) ?? undefined
    const sourceNote = `Extracted from ${url}`
    const prompt = buildExtractionPrompt(text, sourceNote)
    const raw = await generateText(prompt, { jsonMode: true, maxTokens: 1024 })
    const info = parseExtractionResponse(raw, sourceNote)

    return NextResponse.json({ success: true, data: { ...info, suggestedLogoUrl } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to gather brand info from URL'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manual smoke test**

In the browser devtools console on an authenticated dashboard page:
```js
fetch('/api/brands/gather-from-url', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ url: 'https://example.com' }) }).then(r => r.json()).then(console.log)
```
Expected: `{ success: true, data: { sourceNote: 'Extracted from https://example.com', ... } }` (fields may be sparse since example.com has minimal content — that's fine, confirms the pipeline runs end-to-end). If no AI provider key is configured, expect a clear `{ success: false, error: '... API key not configured ...' }` from the Phase 2 layer, not a crash.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/brands/gather-from-url/route.ts
git commit -m "feat(api): add gather-from-url brand extraction route"
```

---

### Task 13: `POST /api/brands/scan-folder` route

**Files:**
- Create: `src/app/api/brands/scan-folder/route.ts`

**Interfaces:**
- Consumes: `scanFolder` (Task 11), `buildExtractionPrompt`/`parseExtractionResponse` (Task 9), `generateText` (Phase 2), `saveLogoBuffer` (Task 4)
- Produces: `POST` returning `{ success: true, data: ExtractedBrandInfo }` or `{ success: false, error: string }`

- [ ] **Step 1: Implement the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import fs from 'fs'
import { scanFolder } from '@/lib/brand-extraction/folder-walker'
import { buildExtractionPrompt, parseExtractionResponse } from '@/lib/brand-extraction/prompt'
import { generateText } from '@/lib/ai/providers'
import { saveLogoBuffer } from '@/lib/uploads'

const schema = z.object({ folderPath: z.string().min(1) })

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'A folder path is required' }, { status: 400 })
    }

    const { folderPath } = parsed.data
    const { text, sourceNote, suggestedLogoPath } = await scanFolder(folderPath)

    if (!text) {
      return NextResponse.json(
        { success: false, error: 'No readable .txt, .md, .docx, or .pdf files found in that folder' },
        { status: 400 }
      )
    }

    let suggestedLogoUrl: string | undefined
    if (suggestedLogoPath) {
      const buffer = fs.readFileSync(suggestedLogoPath)
      suggestedLogoUrl = saveLogoBuffer(buffer, suggestedLogoPath.split(/[\\/]/).pop() ?? 'logo.png')
    }

    const prompt = buildExtractionPrompt(text, sourceNote)
    const raw = await generateText(prompt, { jsonMode: true, maxTokens: 1024 })
    const info = parseExtractionResponse(raw, sourceNote)

    return NextResponse.json({ success: true, data: { ...info, suggestedLogoUrl } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to scan folder'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manual smoke test**

Create a scratch folder with a test file, e.g. `C:\Users\OliverProductions\Desktop\brand-scan-test\notes.txt` containing a few sentences describing a fictional brand. In the browser devtools console on an authenticated dashboard page:
```js
fetch('/api/brands/scan-folder', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ folderPath: 'C:\\Users\\OliverProductions\\Desktop\\brand-scan-test' }) }).then(r => r.json()).then(console.log)
```
Expected: `{ success: true, data: { sourceNote: 'Extracted from 1 file in ...', ... } }` reflecting the test file's content.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/brands/scan-folder/route.ts
git commit -m "feat(api): add scan-folder brand extraction route"
```

---

### Task 14: Extract `TagInput`/`FaqEditor` into `form-controls.tsx`

**Files:**
- Create: `src/app/(dashboard)/brands/form-controls.tsx`
- Modify: `src/app/(dashboard)/brands/page.tsx`

**Interfaces:**
- Produces: `TagInput` (props: `label`, `tags: string[]`, `onChange: (tags: string[]) => void`, `placeholder?: string`), `FaqEditor` (props: `faqs`, `onChange`) — consumed by Task 15 (`ContentEngineFields`) and `page.tsx`.

- [ ] **Step 1: Create `form-controls.tsx` with the moved components**

Move the existing `TagInput` (lines 51-109) and `FaqEditor` (lines 111-179) function bodies verbatim from `brands/page.tsx` into a new file `src/app/(dashboard)/brands/form-controls.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'

// ---------- Tag Input ----------

interface TagInputProps {
  label: string
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}

export function TagInput({ label, tags, onChange, placeholder = 'Add item...' }: TagInputProps) {
  const [inputValue, setInputValue] = useState('')

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === ',') && inputValue.trim()) {
      e.preventDefault()
      const newTag = inputValue.trim().replace(/,$/, '')
      if (newTag && !tags.includes(newTag)) {
        onChange([...tags, newTag])
      }
      setInputValue('')
    }
    if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag))
  }

  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      <div className="min-h-[38px] flex flex-wrap gap-1.5 bg-slate-900 border border-slate-600 rounded-md px-2.5 py-2 focus-within:border-blue-500 transition-colors">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-700 text-slate-200 text-xs rounded-md"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-white placeholder-slate-600 outline-none"
        />
      </div>
      <p className="text-xs text-slate-600 mt-1">Press Enter or comma to add</p>
    </div>
  )
}

// ---------- FAQ Editor ----------

interface FaqEditorProps {
  faqs: Array<{ q: string; a: string }>
  onChange: (faqs: Array<{ q: string; a: string }>) => void
}

export function FaqEditor({ faqs, onChange }: FaqEditorProps) {
  function updateFaq(index: number, field: 'q' | 'a', value: string) {
    const updated = faqs.map((faq, i) => (i === index ? { ...faq, [field]: value } : faq))
    onChange(updated)
  }

  function addFaq() {
    onChange([...faqs, { q: '', a: '' }])
  }

  function removeFaq(index: number) {
    onChange(faqs.filter((_, i) => i !== index))
  }

  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-2">FAQs</label>
      <div className="space-y-3">
        {faqs.map((faq, i) => (
          <div key={i} className="bg-slate-900 border border-slate-700 rounded-md p-3 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-xs text-slate-500 mt-1.5 flex-shrink-0 w-3">Q:</span>
              <textarea
                value={faq.q}
                onChange={(e) => updateFaq(i, 'q', e.target.value)}
                placeholder="Question..."
                rows={1}
                className="flex-1 bg-transparent border-b border-slate-700 text-sm text-white placeholder-slate-600 outline-none pb-1 resize-none"
              />
              <button
                type="button"
                onClick={() => removeFaq(i)}
                className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-xs text-slate-500 mt-1.5 flex-shrink-0 w-3">A:</span>
              <textarea
                value={faq.a}
                onChange={(e) => updateFaq(i, 'a', e.target.value)}
                placeholder="Answer..."
                rows={2}
                className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 outline-none resize-none"
              />
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addFaq}
          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          <Plus size={13} />
          Add FAQ
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Remove the moved code from `page.tsx` and import instead**

In `src/app/(dashboard)/brands/page.tsx`:
1. Delete the `TagInput` function and its `TagInputProps` interface (original lines 51-109).
2. Delete the `FaqEditor` function and its `FaqEditorProps` interface (original lines 111-179).
3. Remove `X`, `Plus`, `Trash2` from the `lucide-react` import if they become unused elsewhere in the file (check: `Plus` is still used by `CreateBrandForm`'s submit button and the page's "New Brand" button — keep `Plus`; `X` and `Trash2` were only used inside the moved components — remove them).
4. Add near the top, after the existing type imports:
```tsx
import { TagInput, FaqEditor } from './form-controls'
```

- [ ] **Step 3: Verify the app still compiles and the brands page still works**

Run: `npx tsc --noEmit`
Expected: no errors

Start the dev server if not running, navigate to `/brands`, expand a brand, click Edit, confirm the Voice/Context tag inputs and FAQ editor still render and function identically to before.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/brands/form-controls.tsx" "src/app/(dashboard)/brands/page.tsx"
git commit -m "refactor: extract TagInput/FaqEditor into form-controls.tsx"
```

---

### Task 15: `logo-upload.tsx` component

**Files:**
- Create: `src/app/(dashboard)/brands/logo-upload.tsx`

**Interfaces:**
- Produces: `LogoUploadField` (props: `logoUrl: string | null`, `onChange: (url: string) => void`) — consumed by Task 18/19 (form wiring).

- [ ] **Step 1: Implement the component**

```tsx
'use client'

import { useState } from 'react'
import { Upload, Loader2, AlertTriangle } from 'lucide-react'

interface LogoUploadFieldProps {
  logoUrl: string | null
  onChange: (url: string) => void
}

export function LogoUploadField({ logoUrl, onChange }: LogoUploadFieldProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/brands/upload-logo', { method: 'POST', body: formData })
      const json = (await res.json()) as { success: boolean; data?: { url: string }; error?: string }
      if (!json.success || !json.data) throw new Error(json.error ?? 'Upload failed')
      onChange(json.data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">Logo</label>
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Brand logo" className="w-full h-full object-cover" />
          ) : (
            <Upload size={18} className="text-slate-600" />
          )}
        </div>
        <label className="btn-secondary text-xs cursor-pointer">
          {uploading ? 'Uploading...' : logoUrl ? 'Replace logo' : 'Upload logo'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            onChange={(e) => void handleFileChange(e)}
            disabled={uploading}
            className="hidden"
          />
        </label>
        {uploading && <Loader2 size={14} className="animate-spin text-slate-400" />}
      </div>
      {!logoUrl && (
        <p className="flex items-center gap-1.5 text-xs text-yellow-500 mt-2">
          <AlertTriangle size={12} />
          No logo yet — content generation works better with one.
        </p>
      )}
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/brands/logo-upload.tsx"
git commit -m "feat: add logo upload field component"
```

---

### Task 16: `content-engine-fields.tsx` component

**Files:**
- Create: `src/app/(dashboard)/brands/content-engine-fields.tsx`

**Interfaces:**
- Consumes: `TagInput` from `./form-controls`
- Produces: `ContentEngineValues` interface, `ContentEngineFields` component — consumed by Task 18/19.

- [ ] **Step 1: Implement the component**

```tsx
'use client'

import { TagInput } from './form-controls'

export interface ContentEngineValues {
  niche: string
  audience: string
  engineTone: string
  goals: string[]
  website: string
  appStoreUrl: string
}

interface ContentEngineFieldsProps {
  values: ContentEngineValues
  onChange: (values: ContentEngineValues) => void
}

export function ContentEngineFields({ values, onChange }: ContentEngineFieldsProps) {
  function set<K extends keyof ContentEngineValues>(key: K, value: ContentEngineValues[K]) {
    onChange({ ...values, [key]: value })
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Content Engine</h3>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Niche</label>
        <input
          value={values.niche}
          onChange={(e) => set('niche', e.target.value)}
          className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
          placeholder="e.g. home warranty tracking for property hosts"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Audience</label>
        <input
          value={values.audience}
          onChange={(e) => set('audience', e.target.value)}
          className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
          placeholder="e.g. Airbnb hosts managing multiple properties"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Engine Tone</label>
        <input
          value={values.engineTone}
          onChange={(e) => set('engineTone', e.target.value)}
          className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
          placeholder="e.g. helpful, no-nonsense"
        />
        <p className="text-xs text-slate-600 mt-1">
          Used by the Content Engine — separate from the Brand Voice tone above.
        </p>
      </div>

      <TagInput
        label="Goals"
        tags={values.goals}
        onChange={(tags) => set('goals', tags)}
        placeholder="Add a business goal..."
      />

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Website URL</label>
        <input
          type="url"
          value={values.website}
          onChange={(e) => set('website', e.target.value)}
          className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
          placeholder="https://example.com"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">App Store URL</label>
        <input
          type="url"
          value={values.appStoreUrl}
          onChange={(e) => set('appStoreUrl', e.target.value)}
          className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
          placeholder="https://apps.apple.com/..."
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/brands/content-engine-fields.tsx"
git commit -m "feat: add Content Engine fields form section"
```

---

### Task 17: `social-links-fields.tsx` component

**Files:**
- Create: `src/app/(dashboard)/brands/social-links-fields.tsx`

**Interfaces:**
- Consumes: `Platform`, `PLATFORMS`, `PLATFORM_LABELS` from `@/types`
- Produces: `SocialLinksFields` component (props: `values: Partial<Record<Platform, string>>`, `onChange`) — consumed by Task 18/19.

- [ ] **Step 1: Implement the component**

```tsx
'use client'

import { PLATFORMS, PLATFORM_LABELS } from '@/types'
import type { Platform } from '@/types'

interface SocialLinksFieldsProps {
  values: Partial<Record<Platform, string>>
  onChange: (values: Partial<Record<Platform, string>>) => void
}

export function SocialLinksFields({ values, onChange }: SocialLinksFieldsProps) {
  function setPlatform(platform: Platform, url: string) {
    const next = { ...values }
    if (url.trim()) next[platform] = url.trim()
    else delete next[platform]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Social Pages</h3>
      {PLATFORMS.map((platform) => (
        <div key={platform}>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">{PLATFORM_LABELS[platform]}</label>
          <input
            type="url"
            value={values[platform] ?? ''}
            onChange={(e) => setPlatform(platform, e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="https://..."
          />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/brands/social-links-fields.tsx"
git commit -m "feat: add social links form section"
```

---

### Task 18: `extraction-panel.tsx` component

**Files:**
- Create: `src/app/(dashboard)/brands/extraction-panel.tsx`

**Interfaces:**
- Consumes: `ExtractedBrandInfo` from `@/lib/brand-extraction/types`
- Produces: `ExtractionPanel` component (props: `onExtracted: (info: ExtractedBrandInfo) => void`) — consumed by Task 19/20.

- [ ] **Step 1: Implement the component**

```tsx
'use client'

import { useState } from 'react'
import { Sparkles, FolderSearch, Loader2 } from 'lucide-react'
import type { ExtractedBrandInfo } from '@/lib/brand-extraction/types'

interface ExtractionPanelProps {
  onExtracted: (info: ExtractedBrandInfo) => void
}

export function ExtractionPanel({ onExtracted }: ExtractionPanelProps) {
  const [url, setUrl] = useState('')
  const [folderPath, setFolderPath] = useState('')
  const [loading, setLoading] = useState<'url' | 'folder' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runExtraction(endpoint: string, body: Record<string, string>, kind: 'url' | 'folder') {
    setLoading(kind)
    setError(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { success: boolean; data?: ExtractedBrandInfo; error?: string }
      if (!json.success || !json.data) throw new Error(json.error ?? 'Extraction failed')
      onExtracted(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-3 bg-slate-900/50 border border-slate-700 rounded-md p-3">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">AI-Assisted Fill</h3>
      <p className="text-xs text-slate-500">
        Pulls suggested values into the fields below for you to review — nothing saves until you hit Save.
      </p>

      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Website or app store URL"
          className="flex-1 bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
        />
        <button
          type="button"
          disabled={!url.trim() || loading !== null}
          onClick={() => void runExtraction('/api/brands/gather-from-url', { url: url.trim() }, 'url')}
          className="btn-secondary text-xs flex items-center gap-1.5 flex-shrink-0"
        >
          {loading === 'url' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          Gather
        </button>
      </div>

      <div className="flex gap-2">
        <input
          value={folderPath}
          onChange={(e) => setFolderPath(e.target.value)}
          placeholder="Local folder path (e.g. C:\Brands\Acme)"
          className="flex-1 bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
        />
        <button
          type="button"
          disabled={!folderPath.trim() || loading !== null}
          onClick={() => void runExtraction('/api/brands/scan-folder', { folderPath: folderPath.trim() }, 'folder')}
          className="btn-secondary text-xs flex items-center gap-1.5 flex-shrink-0"
        >
          {loading === 'folder' ? <Loader2 size={13} className="animate-spin" /> : <FolderSearch size={13} />}
          Scan
        </button>
      </div>
      <p className="text-xs text-slate-600">
        Folder scan only works when this app is running on the same machine as the folder.
      </p>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/brands/extraction-panel.tsx"
git commit -m "feat: add URL/folder AI extraction panel component"
```

---

### Task 19: Wire everything into `BrandEditForm`

**Files:**
- Modify: `src/app/(dashboard)/brands/page.tsx`

**Interfaces:**
- Consumes: `LogoUploadField` (Task 15), `ContentEngineFields`/`ContentEngineValues` (Task 16), `SocialLinksFields` (Task 17), `ExtractionPanel` (Task 18), `ExtractedBrandInfo` (Task 6), `Platform` from `@/types`.

- [ ] **Step 1: Extend `BrandDetail` and imports**

At the top of `page.tsx`, update imports and the `BrandDetail` interface:

```tsx
import type { BrandVoice, BrandContext, Platform } from '@/types'
import { LogoUploadField } from './logo-upload'
import { ContentEngineFields, type ContentEngineValues } from './content-engine-fields'
import { SocialLinksFields } from './social-links-fields'
import { ExtractionPanel } from './extraction-panel'
import type { ExtractedBrandInfo } from '@/lib/brand-extraction/types'
```

```tsx
interface BrandDetail {
  id: string
  name: string
  slug: string
  description: string | null
  logoUrl: string | null
  isActive: boolean
  voice: BrandVoice
  context: BrandContext
  niche: string | null
  audience: string | null
  tone: string | null
  goals: string[]
  website: string | null
  appStoreUrl: string | null
  socialUrls: Partial<Record<Platform, string>>
}
```

- [ ] **Step 2: Rewrite `BrandEditForm` to include the new sections**

Replace the entire `BrandEditForm` function with:

```tsx
function BrandEditForm({ brand, onSaved, onCancel }: BrandEditFormProps) {
  const [name, setName] = useState(brand.name)
  const [description, setDescription] = useState(brand.description ?? '')
  const [logoUrl, setLogoUrl] = useState<string | null>(brand.logoUrl)
  const [voice, setVoice] = useState<BrandVoice>({ ...brand.voice })
  const [context, setContext] = useState<BrandContext>({
    ...brand.context,
    faqs: brand.context.faqs ?? [],
  })
  const [engine, setEngine] = useState<ContentEngineValues>({
    niche: brand.niche ?? '',
    audience: brand.audience ?? '',
    engineTone: brand.tone ?? '',
    goals: brand.goals,
    website: brand.website ?? '',
    appStoreUrl: brand.appStoreUrl ?? '',
  })
  const [socialUrls, setSocialUrls] = useState<Partial<Record<Platform, string>>>(brand.socialUrls)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function handleExtracted(info: ExtractedBrandInfo) {
    setEngine((prev) => ({
      niche: info.niche ?? prev.niche,
      audience: info.audience ?? prev.audience,
      engineTone: info.tone ?? prev.engineTone,
      goals: info.goals ?? prev.goals,
      website: prev.website,
      appStoreUrl: prev.appStoreUrl,
    }))
    if (info.voiceTone || info.voicePersonality) {
      setVoice((prev) => ({
        ...prev,
        tone: info.voiceTone ?? prev.tone,
        personality: info.voicePersonality ?? prev.personality,
      }))
    }
    if (info.products || info.targetAudience || info.keyMessages) {
      setContext((prev) => ({
        ...prev,
        products: info.products ?? prev.products,
        targetAudience: info.targetAudience ?? prev.targetAudience,
        keyMessages: info.keyMessages ?? prev.keyMessages,
      }))
    }
    if (info.suggestedLogoUrl && !logoUrl) {
      setLogoUrl(info.suggestedLogoUrl)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const res = await fetch(`/api/brands/${brand.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || brand.name,
          description: description.trim() || null,
          logoUrl: logoUrl || null,
          voice: {
            tone: voice.tone,
            personality: voice.personality,
            avoid: voice.avoid,
            cta: voice.cta || undefined,
          },
          context: {
            products: context.products,
            faqs: context.faqs.filter((f) => f.q.trim() && f.a.trim()),
            targetAudience: context.targetAudience,
            keyMessages: context.keyMessages,
          },
          niche: engine.niche.trim() || null,
          audience: engine.audience.trim() || null,
          tone: engine.engineTone.trim() || null,
          goals: engine.goals,
          website: engine.website.trim() || null,
          appStoreUrl: engine.appStoreUrl.trim() || null,
          socialUrls,
        }),
      })

      const json = (await res.json()) as { success: boolean; error?: string }
      if (!json.success) throw new Error(json.error ?? 'Save failed')

      setSuccess(true)
      onSaved({
        ...brand,
        name: name.trim() || brand.name,
        description: description.trim() || null,
        logoUrl,
        voice: { ...voice },
        context: { ...context },
        niche: engine.niche.trim() || null,
        audience: engine.audience.trim() || null,
        tone: engine.engineTone.trim() || null,
        goals: engine.goals,
        website: engine.website.trim() || null,
        appStoreUrl: engine.appStoreUrl.trim() || null,
        socialUrls,
      })

      setTimeout(() => setSuccess(false), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <ExtractionPanel onExtracted={handleExtracted} />

      {/* Basic Info */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Basic Info</h3>

        <LogoUploadField logoUrl={logoUrl} onChange={setLogoUrl} />

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Brand Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="Brand name"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
            placeholder="Brief description of the brand..."
          />
        </div>
      </div>

      {/* Brand Voice */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Brand Voice</h3>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Tone</label>
          <input
            value={voice.tone}
            onChange={(e) => setVoice({ ...voice, tone: e.target.value })}
            className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="e.g. professional, friendly, direct"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Personality</label>
          <input
            value={voice.personality}
            onChange={(e) => setVoice({ ...voice, personality: e.target.value })}
            className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="e.g. knowledgeable, approachable, concise"
          />
        </div>

        <TagInput
          label="Things to Avoid"
          tags={voice.avoid}
          onChange={(tags) => setVoice({ ...voice, avoid: tags })}
          placeholder="Add things to avoid..."
        />

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">CTA Hint (optional)</label>
          <input
            value={voice.cta ?? ''}
            onChange={(e) => setVoice({ ...voice, cta: e.target.value })}
            className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="e.g. Mention free trial when relevant"
          />
        </div>
      </div>

      {/* Brand Context */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Brand Context</h3>

        <TagInput
          label="Products / Services"
          tags={context.products}
          onChange={(tags) => setContext({ ...context, products: tags })}
          placeholder="Add product or service..."
        />

        <TagInput
          label="Target Audience"
          tags={context.targetAudience}
          onChange={(tags) => setContext({ ...context, targetAudience: tags })}
          placeholder="Add audience segment..."
        />

        <TagInput
          label="Key Messages"
          tags={context.keyMessages}
          onChange={(tags) => setContext({ ...context, keyMessages: tags })}
          placeholder="Add a key message..."
        />

        <FaqEditor
          faqs={context.faqs}
          onChange={(faqs) => setContext({ ...context, faqs })}
        />
      </div>

      <ContentEngineFields values={engine} onChange={setEngine} />

      <SocialLinksFields values={socialUrls} onChange={setSocialUrls} />

      {/* Actions */}
      {error && (
        <div className="flex items-start gap-2 bg-red-950 border border-red-800 rounded-md px-3 py-2">
          <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-red-300 text-xs">{error}</p>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 bg-green-950 border border-green-800 rounded-md px-3 py-2">
          <CheckCircle2 size={14} className="text-green-400" />
          <p className="text-green-300 text-xs">Brand saved successfully.</p>
        </div>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Manual smoke test**

Start the dev server, log in, go to `/brands`, expand an existing brand, click Edit. Confirm: logo upload widget appears with the missing-logo warning (if no logo set), Content Engine and Social Pages sections render below Brand Context, the AI-Assisted Fill panel appears at the top. Fill in a niche manually and Save — confirm it persists after collapsing/re-expanding the card.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/brands/page.tsx"
git commit -m "feat: wire logo upload, content engine, social links, and AI extraction into brand edit form"
```

---

### Task 20: Wire everything into `CreateBrandForm`

**Files:**
- Modify: `src/app/(dashboard)/brands/page.tsx`

**Interfaces:**
- Consumes: same as Task 19.

- [ ] **Step 1: Rewrite `CreateBrandForm` to include the new sections**

Replace the entire `CreateBrandForm` function with:

```tsx
function CreateBrandForm({ onCreated, onCancel }: CreateBrandFormProps) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [engine, setEngine] = useState<ContentEngineValues>({
    niche: '',
    audience: '',
    engineTone: '',
    goals: [],
    website: '',
    appStoreUrl: '',
  })
  const [socialUrls, setSocialUrls] = useState<Partial<Record<Platform, string>>>({})
  const [voice, setVoice] = useState<BrandVoice>(emptyVoice())
  const [context, setContext] = useState<BrandContext>(emptyContext())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function derivedSlug(n: string) {
    return n.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  }

  function handleExtracted(info: ExtractedBrandInfo) {
    setEngine((prev) => ({
      niche: info.niche ?? prev.niche,
      audience: info.audience ?? prev.audience,
      engineTone: info.tone ?? prev.engineTone,
      goals: info.goals ?? prev.goals,
      website: prev.website,
      appStoreUrl: prev.appStoreUrl,
    }))
    if (info.voiceTone || info.voicePersonality) {
      setVoice((prev) => ({
        ...prev,
        tone: info.voiceTone ?? prev.tone,
        personality: info.voicePersonality ?? prev.personality,
      }))
    }
    if (info.products || info.targetAudience || info.keyMessages) {
      setContext((prev) => ({
        ...prev,
        products: info.products ?? prev.products,
        targetAudience: info.targetAudience ?? prev.targetAudience,
        keyMessages: info.keyMessages ?? prev.keyMessages,
      }))
    }
    if (info.suggestedLogoUrl && !logoUrl) {
      setLogoUrl(info.suggestedLogoUrl)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim() || derivedSlug(name.trim()),
          description: description.trim() || undefined,
          logoUrl: logoUrl || undefined,
          voice,
          context,
          niche: engine.niche.trim() || undefined,
          audience: engine.audience.trim() || undefined,
          tone: engine.engineTone.trim() || undefined,
          goals: engine.goals,
          website: engine.website.trim() || undefined,
          appStoreUrl: engine.appStoreUrl.trim() || undefined,
          socialUrls,
        }),
      })

      const json = (await res.json()) as { success: boolean; data?: BrandListItem; error?: string }
      if (!json.success || !json.data) throw new Error(json.error ?? 'Create failed')

      onCreated(json.data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <h3 className="text-sm font-semibold text-white">New Brand</h3>

      <ExtractionPanel onExtracted={handleExtracted} />

      <LogoUploadField logoUrl={logoUrl} onChange={setLogoUrl} />

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Name *</label>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setSlug(derivedSlug(e.target.value))
          }}
          required
          className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
          placeholder="Brand name"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Slug *</label>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          required
          className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors font-mono"
          placeholder="brand-slug"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
          placeholder="Brief description..."
        />
      </div>

      <ContentEngineFields values={engine} onChange={setEngine} />

      <SocialLinksFields values={socialUrls} onChange={setSocialUrls} />

      {error && (
        <div className="flex items-start gap-2 bg-red-950 border border-red-800 rounded-md px-3 py-2">
          <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-red-300 text-xs">{error}</p>
        </div>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          {saving ? 'Creating...' : 'Create Brand'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Full manual end-to-end smoke test**

With the dev server running and logged in:
1. Go to `/brands`, click "New Brand".
2. In the AI-Assisted Fill panel, paste a real website URL (e.g. your own company site) and click Gather. Confirm fields populate (niche/audience/goals/voice) after a few seconds, and a suggested logo may appear.
3. Upload a real logo image manually via the Logo field; confirm the preview updates.
4. Fill in Name (slug auto-derives), add a Facebook URL in Social Pages, and click Create Brand.
5. Confirm the new brand appears in the list; expand it and Edit — confirm all the saved fields (logo, niche, audience, goals, website, social URL) are present.
6. Test folder-scan: point the folder input at a real local folder containing at least one `.txt` file, click Scan, confirm fields populate; if a `logo.png` is in that folder, confirm the logo preview updates.
7. Run `npm test` — confirm all existing + new tests pass.
8. Run `npx tsc --noEmit` — confirm no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/brands/page.tsx"
git commit -m "feat: wire logo upload, content engine, social links, and AI extraction into brand create form"
```

---

## Self-Review Notes

- **Spec coverage:** appStoreUrl/socialUrls schema (Task 1) ✓, logo upload local disk (Tasks 4-5, 15) ✓, form field expansion for unused Phase-1 columns (Tasks 3, 16, 19-20) ✓, URL-gather with provider-agnostic fetch+strip (Tasks 7-9, 12) ✓, folder-scan with txt/md/docx/pdf + logo filename detection, no recursion, caps (Tasks 10-11, 13) ✓, review-before-save UX (Tasks 18, 19-20 — `handleExtracted` only updates local state, save still requires the Save/Create button) ✓, local-only folder-scan UI copy (Task 18) ✓, out-of-scope items (vision extraction, recursion, cloud storage) correctly excluded ✓.
- **Deviation from spec's suggested file split:** the spec suggested merging `BrandEditForm`/`CreateBrandForm` into one `brand-form.tsx`. This plan keeps them as two separate components (lower regression risk on working code) but extracts the *new* shared pieces (`LogoUploadField`, `ContentEngineFields`, `SocialLinksFields`, `ExtractionPanel`, and the pre-existing `TagInput`/`FaqEditor` via Task 14) into their own files — achieves the same DRY goal without a risky merge.
- **Type consistency:** `ExtractedBrandInfo` (Task 6) is used identically in Tasks 9, 12, 13, 18, 19, 20. `ContentEngineValues` (Task 16) matches the state shape used in Tasks 19-20. `FolderScanResult` (Task 11) fields (`text`, `sourceNote`, `suggestedLogoPath`) match what Task 13's route destructures.
