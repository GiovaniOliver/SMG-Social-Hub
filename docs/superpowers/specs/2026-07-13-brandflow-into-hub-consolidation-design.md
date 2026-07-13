# Consolidating BrandFlow AI into SMG Social Hub — Design

**Date:** 2026-07-13
**Status:** Approved design (pre-implementation)
**Surviving app:** SMG Social Hub (`Desktop/2.DEVELOPMENT Work/SMG-Social-Hub`)
**Source app:** BrandFlow AI (`Desktop/1.SMG-BUSINESS/1b.)SMG-Side-Brands Dev/brandflow-ai_-30-day-content-engine`)

## Goal

Merge BrandFlow AI into SMG Social Hub. Remove features that already exist in the Hub;
port BrandFlow's unique content-generation capabilities into the Hub as a new top-level
**Content Engine** menu; wire generated content into the Hub's existing publishing pipeline.
Then archive and delete the BrandFlow folder.

## Context: the two apps

**SMG Social Hub** — Next.js (App Router) + Prisma/**SQLite**. A social publishing &
engagement platform:
- Data models: `Brand` (name, slug, voice JSON, context JSON), `PlatformConnection`,
  `ScheduledPost`, `CommentOpportunity`, `CommentDraft`
- Content Lab — generates single platform-specific **text** posts by content-type + topic
- Schedule / Queue — schedule & queue posts
- Comments — Comment Monitor (scan, AI reply, approve/post/skip)
- Connect — real OAuth publishing (Facebook, Google, LinkedIn, TikTok)
- AI: single hardcoded `@google/generative-ai` SDK, `GEMINI_API_KEY` env, model
  `gemini-2.0-flash-lite`; no settings UI

**BrandFlow AI** — Vite/React 19 + Express + Prisma/**Postgres** (remote). A content-
generation engine:
- Tabs: Setup, Campaigns, Research, Calendar, Library, Trends, Settings
- Data models: `Brand` (niche/audience/tone/goals/website/brandKit), `Campaign`,
  `ContentPiece`
- Generates text **+ images + voiceover + full video**
  (`/api/ai/generate|image|voiceover|video`)
- 30-day campaign engine (Campaign → up to 90 ContentPieces, resumable hydration)
- Research — competitor analysis + website brand-DNA extraction + trends
- Settings — 4-provider AI switcher (Gemini / Claude / OpenAI / Ollama) via newer
  `@google/genai` SDK, keys in server-side `.provider-keys.json`
- Live data: one SnapRegister brand + a 90-piece campaign (5 hydrated) in remote Postgres

## Feature classification (approved)

| Feature | In Hub? | In BrandFlow? | Verdict |
|---|---|---|---|
| Brand management | ✅ (voice/context) | ✅ (niche/audience/tone/goals/brandKit) | Overlap → keep Hub's, merge BrandFlow's richer fields |
| Auth / login | ✅ | ✅ | Overlap → keep Hub's |
| Single-post text gen | ✅ Content Lab | ✅ /api/ai/generate | Overlap → keep Hub's |
| 30-day campaign + calendar | ❌ | ✅ | **Unique → port** |
| Image / voiceover / video gen | ❌ | ✅ | **Unique → port** |
| Research (competitor + website DNA + trends) | ❌ | ✅ | **Unique → port** |
| Content Library / hydration | ❌ | ✅ | **Unique → port** |
| 4-provider AI settings UI | ❌ | ✅ | **Port (upgrade for Hub)** |
| OAuth publishing / Schedule / Queue / Comments | ✅ | ❌ | Hub-only, stays |

## Decisions (from brainstorming)

1. **Feature split:** remove overlap from BrandFlow, port only unique engine features.
2. **Integration depth:** fully integrated pipeline — generated content flows into the
   Hub's Schedule/Queue/Publish/Comments.
3. **Data:** migrate the SnapRegister brand + 90-piece campaign into the Hub.
4. **AI providers:** adopt BrandFlow's 4-provider system + settings UI + newer SDK;
   route the Hub's existing Content Lab & comment replies through it.
5. **BrandFlow fate:** archive untouched until the port is verified end-to-end, then delete.

## Architecture

The Hub (Next.js) is the surviving app. Because the two apps are different stacks
(Express SPA vs Next.js App Router), porting = **reimplementing** BrandFlow's Express
routes as Next.js API routes and its React tabs as Hub dashboard pages, reusing
BrandFlow's logic (prompts, generation flow, hydration) but not its Express server.

## Phase plan

Each phase is committed before the next; nothing in BrandFlow is deleted until Phase 5.

### Phase 1 — Data foundation
- Extend Hub `Brand` with BrandFlow fields: `niche`, `audience`, `tone`, `goals`,
  `website`, `websiteContent`, `brandKit`, `settings`. Map where semantically overlapping
  (Hub `voice.tone` ↔ BrandFlow `tone`; Hub `context.targetAudience` ↔ BrandFlow
  `audience`). Keep `voice`/`context` — Content Lab & comment replies depend on them.
- Add `Campaign` model: `brandId` FK, name, description, status, analysis, trends,
  metadata → `content[]`.
- Add `ContentPiece` model: campaignId/brandId, day, platform, format, title, hook, body,
  visualPrompt, status, mediaUrl, mediaType, audioUrl, scheduledAt, keywords,
  performanceScore, script, referenceImageUrl, metadata.
- Add optional `ContentPiece ↔ ScheduledPost` relation for Phase 4.
- One-time idempotent migration script: read Brand + Campaign + ContentPiece from
  BrandFlow's remote Postgres (its Prisma client) → write into Hub SQLite (Hub Prisma
  client), mapping fields. Skip-if-exists so re-runnable.
- **Verifiable:** Hub DB holds the SnapRegister campaign; existing Hub features still work.

### Phase 2 — AI provider layer
- Port BrandFlow's `loadKeys/saveKeys/getKey/getGeminiAI` + `/api/settings/keys` into a
  Hub lib (`src/lib/ai/providers.ts`) using `@google/genai`; keys in gitignored
  `.provider-keys.json`.
- Refactor Hub `content-generator.ts` and `reply-generator.ts` to call the unified layer
  instead of the hardcoded `gemini-2.0-flash-lite`.
- Add a Settings page in the Hub for the 4-provider switcher.
- **Verifiable:** Settings page saves keys; Hub content gen + comment replies run through
  the new layer.

### Phase 3 — Content Engine UI + API
- New top-level **Content Engine** nav group in `src/components/sidebar-nav.tsx` with
  sub-items: Brand Profile · Campaigns · Calendar · Library · Research · Trends.
- Reorganize existing items under a **Publishing** group: Content Lab · Schedule · Queue ·
  Comments · Connect · Brands · Settings.
- Port BrandFlow tabs to Hub dashboard routes under `(dashboard)/engine/*`.
- Port `/api/ai/generate|image|voiceover|video` and `/api/ai/research` as Next API routes.
- **Verifiable:** a 30-day campaign can be generated inside the Hub.

### Phase 4 — Pipeline integration
- "Send to Scheduler" action: create a `ScheduledPost` from a `ContentPiece` (populate via
  the new relation).
- Surface generated pieces in Queue/Schedule; allow publish via existing OAuth.
- **Verifiable:** a generated piece flows engine → schedule → publish.

### Phase 5 — Cleanup
- Full end-to-end verification of the merged app.
- Archive BrandFlow (rename to make inert), confirm nothing references it, then delete the
  folder.
- **Verifiable:** BrandFlow removed; Hub fully self-contained.

## Testing

- Phase 1: migration script unit-tested on field mapping; verify row counts + a spot-check
  piece post-migration; Hub existing features smoke-tested.
- Phase 2: provider layer unit tests (key load/save, provider selection); comment-reply and
  content-gen regression.
- Phase 3: generate a small campaign end-to-end against a working provider key.
- Phase 4: integration test piece → ScheduledPost → publish (mock OAuth).
- Phase 5: manual end-to-end pass before deletion.

## Risks / open items

- **Postgres → SQLite** engine crossover in the migration script (types, JSON-as-String
  fields). Handle mapping explicitly; SQLite stores JSON as text (matches BrandFlow's
  `String` JSON columns).
- **Hydration still needs a working AI key** — the SnapRegister campaign's 85 unhydrated
  pieces can't be filled until a valid Anthropic/OpenAI/Gemini key is supplied
  (independent of this migration).
- **The Hub is not a git repo yet.** Recommend `git init` before Phase 1 so the whole
  consolidation is version-controlled and each phase's commit is preserved.

## Out of scope

- Comment Monitor fixes (2022-post filtering, date display) — tracked separately; not part
  of this consolidation.
- New features beyond parity with BrandFlow's ported capabilities.
- Production DB choice (SQLite vs Postgres for the Hub in prod) — separate decision.
