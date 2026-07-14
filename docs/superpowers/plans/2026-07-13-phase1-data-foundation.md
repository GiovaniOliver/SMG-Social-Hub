# Phase 1 — Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the SMG Social Hub database with BrandFlow's Brand/Campaign/ContentPiece models and migrate the live SnapRegister 90-piece campaign into the Hub without creating a duplicate brand.

**Architecture:** Add nullable BrandFlow fields to the Hub's existing `Brand` model, add new `Campaign` and `ContentPiece` models, and add an optional one-to-one `ContentPiece ↔ ScheduledPost` relation for the later pipeline integration. Migrate data in two steps: an export script (BrandFlow / Postgres → JSON) and an idempotent import script (JSON → Hub / SQLite) that attaches the campaign to the pre-existing Hub SnapRegister brand.

**Tech Stack:** Next.js (App Router), Prisma, SQLite (Hub) / PostgreSQL (BrandFlow source), Vitest, Node ESM scripts.

## Global Constraints

- Hub DB provider is **SQLite**; `DATABASE_URL` in the Hub's `.env`. BrandFlow source is **PostgreSQL** (its own `.env` — do not read it; scripts use its Prisma client which loads it at runtime).
- Hub uses **`prisma db push`** (no migration files) — confirmed by `logs/db-push.log`.
- All new `Brand` columns MUST be **nullable / optional** so existing Hub rows and features (Content Lab, Comments, Schedule) keep working.
- **Do NOT overwrite the Hub brand's existing `voice`/`context`** — only backfill the new engine columns.
- Hub `Brand` has a required unique `slug`; BrandFlow brands have none — the importer must not create a second SnapRegister brand.
- Known entities: Hub brand `Snap Registers` = id `cmo813wzx0000argsfe8u9cp9`, slug `snap-registers`. BrandFlow brand `SnapRegister` = id `cmnqbb99d0001s6gv671c4jqk`. These are the same brand.
- Reuse BrandFlow cuid ids as primary keys in the Hub for `Campaign`/`ContentPiece` so re-running the import upserts (idempotent) instead of duplicating.
- Paths contain spaces — always quote them in shell commands.
- Migration export file path (both scripts): `MIGRATION_FILE` env var, default `<Hub>/scripts/.migration-data/brandflow-export.json` (gitignored).

Path shorthands used below:
- `<Hub>` = `C:/Users/OliverProductions/Desktop/2.DEVELOPMENT Work/SMG-Social-Hub`
- `<BF>` = `C:/Users/OliverProductions/Desktop/1.SMG-BUSINESS/1b.)SMG-Side-Brands Dev/brandflow-ai_-30-day-content-engine`

---

### Task 1: Extend the Prisma schema and push it

**Files:**
- Modify: `<Hub>/prisma/schema.prisma`
- Modify: `<Hub>/.gitignore`

**Interfaces:**
- Produces: Prisma models `Campaign`, `ContentPiece`; new optional `Brand` fields (`niche`, `audience`, `tone`, `goals`, `website`, `websiteContent`, `brandKit`, `engineSettings`, `campaigns`); one-to-one `ContentPiece.scheduledPost` ↔ `ScheduledPost.contentPiece`. Consumed by Tasks 2, 4, 5.

- [ ] **Step 1: Add the new Brand fields.** In `<Hub>/prisma/schema.prisma`, inside `model Brand`, add these lines immediately after the existing `context` field:

```prisma
  // --- Content Engine fields (ported from BrandFlow) ---
  niche          String?
  audience       String?
  tone           String?
  goals          String?  // JSON string array
  website        String?
  websiteContent String?
  brandKit       String?  // JSON string
  engineSettings String?  // JSON string (BrandFlow per-brand settings)
```

And add this relation line inside `model Brand` alongside the other relation fields (after `commentOpportunities ...`):

```prisma
  campaigns            Campaign[]
```

- [ ] **Step 2: Add the Campaign and ContentPiece models.** Append to the end of `<Hub>/prisma/schema.prisma`:

```prisma
model Campaign {
  id          String         @id @default(cuid())
  brandId     String
  brand       Brand          @relation(fields: [brandId], references: [id], onDelete: Cascade)
  name        String
  description String?
  status      String         @default("draft") // draft | generating | completed
  analysis    String
  trends      String?        // JSON string
  metadata    String?        // JSON string
  createdAt   DateTime       @default(now())
  content     ContentPiece[]
}

model ContentPiece {
  id                String         @id @default(cuid())
  campaignId        String
  campaign          Campaign       @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  brandId           String
  day               Int
  platform          String
  format            String
  title             String
  hook              String
  body              String
  visualPrompt      String
  status            String
  mediaUrl          String?
  mediaType         String?
  audioUrl          String?
  scheduledAt       String?
  keywords          String?        // JSON string
  performanceScore  Int?
  script            String?
  referenceImageUrl String?
  metadata          String?        // JSON string
  scheduledPostId   String?        @unique
  scheduledPost     ScheduledPost? @relation(fields: [scheduledPostId], references: [id])
}
```

- [ ] **Step 3: Add the back-relation on ScheduledPost.** In `model ScheduledPost`, add this line after the `notes` field:

```prisma
  contentPiece ContentPiece?
```

- [ ] **Step 4: Ignore the migration data dir.** In `<Hub>/.gitignore`, under the `# AI provider keys` block, add:

```
# Migration scratch data
scripts/.migration-data/
```

- [ ] **Step 5: Validate the schema.**

Run (from `<Hub>`): `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 6: Push schema to the SQLite DB and regenerate the client.**

Run (from `<Hub>`): `npx prisma db push`
Expected: ends with `Your database is now in sync with your Prisma schema.` and `Generated Prisma Client`.

- [ ] **Step 7: Verify existing data survived and new models are queryable.**

Run (from `<Hub>`):
```bash
node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{console.log('brands',await p.brand.count());console.log('campaigns',await p.campaign.count());console.log('pieces',await p.contentPiece.count());await p.\$disconnect()})()"
```
Expected: `brands 1`, `campaigns 0`, `pieces 0` (no error — proves the client has the new models and the existing brand is intact).

- [ ] **Step 8: Run the existing test suite to confirm nothing broke.**

Run (from `<Hub>`): `npx vitest run`
Expected: all existing tests pass (same count as before the change).

- [ ] **Step 9: Commit.**

```bash
cd "<Hub>" && git add prisma/schema.prisma .gitignore && git commit -m "feat(db): add Campaign/ContentPiece models and Brand engine fields"
```

---

### Task 2: Brand-mapping utility (pure, TDD)

**Files:**
- Create: `<Hub>/src/lib/migration/map-brand.ts`
- Test: `<Hub>/src/lib/migration/map-brand.test.ts`

**Interfaces:**
- Produces:
  - `slugify(name: string): string`
  - `normalizeBrandKey(name: string): string`
  - `mapBrandEngineFields(bf: BrandFlowBrand): BrandEngineFields`
  - types `BrandFlowBrand` (fields: `id, name, niche, audience, tone, goals, website?, websiteContent?, brandKit?, settings?`) and `BrandEngineFields` (fields: `niche, audience, tone, goals, website, websiteContent, brandKit, engineSettings`)
- Consumed by Task 4 (import script).

- [ ] **Step 1: Write the failing test.** Create `<Hub>/src/lib/migration/map-brand.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { slugify, normalizeBrandKey, mapBrandEngineFields } from './map-brand'

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('Snap Registers')).toBe('snap-registers')
  })
  it('collapses non-alphanumeric runs and trims hyphens', () => {
    expect(slugify('  Quiet   Wealth!! ')).toBe('quiet-wealth')
  })
  it('handles single-word names', () => {
    expect(slugify('SnapRegister')).toBe('snapregister')
  })
})

describe('normalizeBrandKey', () => {
  it('strips all non-alphanumeric and lowercases', () => {
    expect(normalizeBrandKey('Snap Registers')).toBe('snapregisters')
    expect(normalizeBrandKey('SnapRegister')).toBe('snapregister')
  })
})

describe('mapBrandEngineFields', () => {
  it('passes through engine fields and renames settings -> engineSettings', () => {
    const bf = {
      id: 'x', name: 'SnapRegister', niche: 'n', audience: 'a', tone: 't',
      goals: '["g"]', website: 'https://w', websiteContent: 'wc',
      brandKit: '{"colors":[]}', settings: '{"provider":"gemini"}',
    }
    expect(mapBrandEngineFields(bf)).toEqual({
      niche: 'n', audience: 'a', tone: 't', goals: '["g"]',
      website: 'https://w', websiteContent: 'wc',
      brandKit: '{"colors":[]}', engineSettings: '{"provider":"gemini"}',
    })
  })
  it('defaults missing optional fields to null', () => {
    const bf = { id: 'x', name: 'N', niche: 'n', audience: 'a', tone: 't', goals: '[]' }
    const out = mapBrandEngineFields(bf)
    expect(out.website).toBeNull()
    expect(out.brandKit).toBeNull()
    expect(out.engineSettings).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails.**

Run (from `<Hub>`): `npx vitest run src/lib/migration/map-brand.test.ts`
Expected: FAIL — `Cannot find module './map-brand'`.

- [ ] **Step 3: Write the implementation.** Create `<Hub>/src/lib/migration/map-brand.ts`:

```ts
export interface BrandFlowBrand {
  id: string
  name: string
  niche: string
  audience: string
  tone: string
  goals: string
  website?: string | null
  websiteContent?: string | null
  brandKit?: string | null
  settings?: string | null
}

export interface BrandEngineFields {
  niche: string
  audience: string
  tone: string
  goals: string
  website: string | null
  websiteContent: string | null
  brandKit: string | null
  engineSettings: string | null
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizeBrandKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function mapBrandEngineFields(bf: BrandFlowBrand): BrandEngineFields {
  return {
    niche: bf.niche,
    audience: bf.audience,
    tone: bf.tone,
    goals: bf.goals,
    website: bf.website ?? null,
    websiteContent: bf.websiteContent ?? null,
    brandKit: bf.brandKit ?? null,
    engineSettings: bf.settings ?? null,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes.**

Run (from `<Hub>`): `npx vitest run src/lib/migration/map-brand.test.ts`
Expected: PASS (3 describe blocks, all green).

- [ ] **Step 5: Commit.**

```bash
cd "<Hub>" && git add src/lib/migration/map-brand.ts src/lib/migration/map-brand.test.ts && git commit -m "feat(migration): add brand field mapper and slug utilities"
```

---

### Task 3: BrandFlow export script (Postgres → JSON)

**Files:**
- Create: `<BF>/scripts/export-for-hub.mjs`

**Interfaces:**
- Produces: a JSON file at `MIGRATION_FILE` with shape `{ exportedFrom, brands: [{ ...brandFields, campaigns: [{ ...campaignFields, content: [{ ...pieceFields }] }] }] }`. Consumed by Task 4.

- [ ] **Step 1: Write the export script.** Create `<BF>/scripts/export-for-hub.mjs`:

```js
import { PrismaClient } from '@prisma/client'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const OUT = process.env.MIGRATION_FILE
  || 'C:/Users/OliverProductions/Desktop/2.DEVELOPMENT Work/SMG-Social-Hub/scripts/.migration-data/brandflow-export.json'

const prisma = new PrismaClient()

async function main() {
  const brands = await prisma.brand.findMany({
    include: { campaigns: { include: { content: true } } },
  })
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify({ exportedFrom: 'brandflow', brands }, null, 2))
  const campaigns = brands.reduce((n, b) => n + b.campaigns.length, 0)
  const pieces = brands.reduce((n, b) => n + b.campaigns.reduce((m, c) => m + c.content.length, 0), 0)
  console.log(`Exported ${brands.length} brand(s), ${campaigns} campaign(s), ${pieces} piece(s) -> ${OUT}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Run the export against live BrandFlow Postgres.**

Run (from `<BF>`): `node scripts/export-for-hub.mjs`
Expected: `Exported 1 brand(s), 1 campaign(s), 90 piece(s) -> .../brandflow-export.json` (piece count may differ if data changed; 90 expected).

- [ ] **Step 3: Sanity-check the JSON.**

Run: `node -e "const d=require('C:/Users/OliverProductions/Desktop/2.DEVELOPMENT Work/SMG-Social-Hub/scripts/.migration-data/brandflow-export.json');const b=d.brands[0];console.log('brand',b.name,b.id);console.log('campaign',b.campaigns[0].name,'pieces',b.campaigns[0].content.length);console.log('sample piece keys',Object.keys(b.campaigns[0].content[0]).join(','))"`
Expected: prints `brand SnapRegister cmnqbb…`, campaign name + piece count, and the piece field keys.

- [ ] **Step 4: Commit (script only — the JSON is gitignored).**

```bash
cd "<BF>" && git add scripts/export-for-hub.mjs && git commit -m "feat(migration): add BrandFlow export-for-hub script"
```

---

### Task 4: Hub import script (JSON → SQLite, idempotent)

**Files:**
- Create: `<Hub>/scripts/import-from-brandflow.mjs`

**Interfaces:**
- Consumes: `mapBrandEngineFields`, `normalizeBrandKey` from Task 2 (imported from the compiled TS via a small inline re-implementation — see Step 1 note); the JSON from Task 3.
- Produces: rows in Hub `Brand` (backfilled), `Campaign`, `ContentPiece`.

- [ ] **Step 1: Write the import script.** Create `<Hub>/scripts/import-from-brandflow.mjs`. It intentionally re-implements the two tiny pure helpers inline (ESM script cannot import the TS module without a build step):

```js
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'

const IN = process.env.MIGRATION_FILE
  || 'C:/Users/OliverProductions/Desktop/2.DEVELOPMENT Work/SMG-Social-Hub/scripts/.migration-data/brandflow-export.json'

// Explicit BrandFlow brand id -> existing Hub brand id (same real brand, different ids).
const BRAND_ID_MAP = {
  cmnqbb99d0001s6gv671c4jqk: 'cmo813wzx0000argsfe8u9cp9', // SnapRegister -> Snap Registers
}

const normalizeBrandKey = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
const mapBrandEngineFields = (bf) => ({
  niche: bf.niche, audience: bf.audience, tone: bf.tone, goals: bf.goals,
  website: bf.website ?? null, websiteContent: bf.websiteContent ?? null,
  brandKit: bf.brandKit ?? null, engineSettings: bf.settings ?? null,
})

const prisma = new PrismaClient()

async function resolveHubBrandId(bf, hubBrands) {
  if (BRAND_ID_MAP[bf.id]) return BRAND_ID_MAP[bf.id]
  const key = normalizeBrandKey(bf.name)
  const match = hubBrands.find((h) => normalizeBrandKey(h.name) === key)
  return match ? match.id : null
}

async function main() {
  const data = JSON.parse(readFileSync(IN, 'utf8'))
  const hubBrands = await prisma.brand.findMany({ select: { id: true, name: true } })
  let campaignsUp = 0, piecesUp = 0

  for (const bf of data.brands) {
    let hubBrandId = await resolveHubBrandId(bf, hubBrands)
    const engine = mapBrandEngineFields(bf)

    if (hubBrandId) {
      // Backfill engine fields onto the existing Hub brand (do NOT touch voice/context).
      await prisma.brand.update({ where: { id: hubBrandId }, data: engine })
    } else {
      // No existing match — create a new brand (reuse BF id, generate a unique slug).
      const base = bf.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      let slug = base, n = 1
      while (await prisma.brand.findUnique({ where: { slug } })) slug = `${base}-${++n}`
      const created = await prisma.brand.create({ data: { id: bf.id, name: bf.name, slug, ...engine } })
      hubBrandId = created.id
    }

    for (const c of bf.campaigns) {
      await prisma.campaign.upsert({
        where: { id: c.id },
        update: { name: c.name, description: c.description, status: c.status, analysis: c.analysis, trends: c.trends, metadata: c.metadata, brandId: hubBrandId },
        create: { id: c.id, brandId: hubBrandId, name: c.name, description: c.description, status: c.status, analysis: c.analysis, trends: c.trends, metadata: c.metadata, createdAt: new Date(c.createdAt) },
      })
      campaignsUp++
      for (const p of c.content) {
        const piece = {
          campaignId: c.id, brandId: hubBrandId, day: p.day, platform: p.platform, format: p.format,
          title: p.title, hook: p.hook, body: p.body, visualPrompt: p.visualPrompt, status: p.status,
          mediaUrl: p.mediaUrl, mediaType: p.mediaType, audioUrl: p.audioUrl, scheduledAt: p.scheduledAt,
          keywords: p.keywords, performanceScore: p.performanceScore, script: p.script,
          referenceImageUrl: p.referenceImageUrl, metadata: p.metadata,
        }
        await prisma.contentPiece.upsert({ where: { id: p.id }, update: piece, create: { id: p.id, ...piece } })
        piecesUp++
      }
    }
  }
  console.log(`Imported/updated ${campaignsUp} campaign(s), ${piecesUp} piece(s).`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Commit the script.**

```bash
cd "<Hub>" && git add scripts/import-from-brandflow.mjs && git commit -m "feat(migration): add idempotent BrandFlow import script"
```

---

### Task 5: Execute migration end-to-end and verify

**Files:** none (execution + verification)

- [ ] **Step 1: Ensure the export JSON exists** (from Task 3). If not, re-run `node scripts/export-for-hub.mjs` in `<BF>`.

- [ ] **Step 2: Run the import.**

Run (from `<Hub>`): `node scripts/import-from-brandflow.mjs`
Expected: `Imported/updated 1 campaign(s), 90 piece(s).`

- [ ] **Step 3: Verify no duplicate brand and correct attachment.**

Run (from `<Hub>`):
```bash
node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{const b=await p.brand.findMany({select:{id:true,name:true,slug:true,niche:true,_count:{select:{campaigns:true}}}});console.log(JSON.stringify(b,null,2));console.log('pieces',await p.contentPiece.count());await p.\$disconnect()})()"
```
Expected: exactly **1 brand** (`Snap Registers`, slug `snap-registers`) with `niche` now populated and `_count.campaigns: 1`; `pieces 90`.

- [ ] **Step 4: Verify idempotency — run the import a second time.**

Run (from `<Hub>`): `node scripts/import-from-brandflow.mjs`
Then re-run the Step 3 verification.
Expected: identical output — still 1 brand, 1 campaign, 90 pieces (no duplicates).

- [ ] **Step 5: Confirm existing Hub features are intact.**

Run (from `<Hub>`): `npx vitest run`
Expected: all tests pass, same count as Task 1 Step 8.

- [ ] **Step 6: Confirm hydration state carried over** (5 hydrated pieces).

Run (from `<Hub>`):
```bash
node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{const hydrated=await p.contentPiece.count({where:{NOT:{body:''}}});console.log('non-empty-body pieces',hydrated);await p.\$disconnect()})()"
```
Expected: a small number (~5) of pieces with non-empty body — matching BrandFlow's hydration state.

- [ ] **Step 7: Commit a Phase 1 completion marker** (updates the plan checkboxes only if you are tracking them in-repo; otherwise no-op).

Phase 1 is complete when Steps 2–6 pass. The remaining 85 unhydrated pieces are filled in a later phase once a working AI provider key is supplied (out of scope for Phase 1).

---

## Self-Review

**Spec coverage (Phase 1 section of the design):**
- Extend Brand with BrandFlow fields → Task 1 Step 1. ✓
- Add Campaign + ContentPiece → Task 1 Steps 2–3. ✓
- Optional ContentPiece ↔ ScheduledPost relation → Task 1 Steps 2–3. ✓
- Idempotent Postgres→SQLite migration, skip-if-exists → Tasks 3–5 (upsert by reused cuid ids; Task 5 Step 4 proves idempotency). ✓
- Field mapping (voice.tone/context.targetAudience overlap; keep voice/context) → mapper backfills only new columns, leaves voice/context untouched (Task 4 Step 1 update path). ✓
- No-duplicate-brand reconciliation → BRAND_ID_MAP + normalized-name fallback (Task 4). ✓
- "Existing Hub features still work" verifiable outcome → Task 1 Step 8, Task 5 Step 5. ✓

**Placeholder scan:** No TBD/TODO; every code and command step is complete. ✓

**Type consistency:** `mapBrandEngineFields`/`normalizeBrandKey` signatures match between Task 2 (TS) and their inline re-implementation in Task 4 (JS). Field names (`engineSettings`, `visualPrompt`, `performanceScore`, `referenceImageUrl`) match the schema in Task 1. Reused cuid ids are consistent across export (Task 3) and import (Task 4). ✓

**Note on the inline re-implementation:** Task 4's `.mjs` re-declares the two pure helpers rather than importing the TS module (no build step for standalone scripts). They are byte-for-byte equivalent to Task 2's, which remains the unit-tested source of truth. This is a deliberate, documented DRY exception for script portability.
