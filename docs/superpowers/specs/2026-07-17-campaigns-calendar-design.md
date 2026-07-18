# Campaigns & Calendar (Phase 3, scoped) — Design

**Date:** 2026-07-17
**Status:** Approved design (pre-implementation)

## Goal

Make the `Campaign`/`ContentPiece` data model — added in Phase 1 of the BrandFlow-into-Hub
consolidation but never wired to any UI or API — actually usable. Users can create a
campaign for a brand, have AI generate its full day-by-day content in one flow, view/edit
the generated pieces, and see them on a calendar.

This is a deliberately narrowed slice of the original consolidation design's "Phase 3 —
Content Engine UI + API," which bundled Campaign engine + Calendar + Library + Research/
Trends + image/voiceover/video generation into one phase. Library, Research/Trends, and
media generation are deferred to later phases. See
`docs/superpowers/specs/2026-07-13-brandflow-into-hub-consolidation-design.md` for the
full original scope.

## Context

An audit of the merged codebase (2026-07-17) found `Campaign` and `ContentPiece`
(`prisma/schema.prisma:108-146`) referenced nowhere in `src/` — no route, no page, no lib
helper — despite being added specifically to support this feature. **No schema changes
are needed for this phase**; both models already exist with the fields this design uses.

BrandFlow's original implementation (`brandflow-ai_-30-day-content-engine/src/App.tsx`,
`src/services/aiService.ts`, `server.ts`) is the reference for prompt structure and API
shape, adapted to the Hub's Next.js App Router + the Phase 2 provider-agnostic AI layer
(`src/lib/ai/providers.ts`) instead of BrandFlow's client-side `aiService.ts` + Express
server.

## Decisions (from brainstorming)

1. **Nav placement:** two new top-level sidebar items, "Campaigns" and "Calendar" —
   not a full nav restructure into "Content Engine"/"Publishing" groups (that's deferred
   until Library/Research/Trends exist and the group split is worth doing).
2. **Generation depth:** one "Generate Campaign" action produces the full skeleton AND
   hydrates every piece (hook/body/visualPrompt) in the same flow — no separate manual
   hydration step. This diverges from BrandFlow, which only auto-hydrated Week 1 because
   each hydration was an expensive image/video-capable call; here every call is text-only
   through the existing provider layer, so hydrating everything up front is cheap and
   removes a whole class of "half-generated campaign" UI states.
3. **Campaign sizing:** duration (days) and pieces/day are configurable on the creation
   form, defaulting to 7 days × 2/day = 14 pieces (not BrandFlow's 30×3=90), since each
   piece is now a synchronous real AI call rather than a lazily-triggered one.
4. **Calendar UI:** grouped-by-day list, not a month-grid calendar. Pieces use relative
   "Day N" (relative to campaign start) until actually scheduled — the Hub has no
   existing calendar-grid component to match, and BrandFlow's own campaigns aren't
   date-based until sent to a scheduler (out of scope here — see below).

## Architecture

### Data model (existing, unchanged)

```
Campaign { id, brandId, name, description?, status (draft|generating|completed),
           analysis, trends?, metadata?, createdAt, content: ContentPiece[] }

ContentPiece { id, campaignId, brandId, day, platform, format, title, hook, body,
               visualPrompt, status, mediaUrl?, mediaType?, audioUrl?, scheduledAt?,
               keywords?, performanceScore?, script?, referenceImageUrl?, metadata?,
               scheduledPostId? (unique, FK to ScheduledPost — unused this phase) }
```

`ContentPiece.status` values used this phase: `draft` (generated, editable) and
`generating` (regenerate-in-flight). `ready`/`scheduled`/`posted` (BrandFlow's fuller
status set, tied to media generation and scheduler hand-off) are not used until those
features exist.

### Generation flow

Server-side, inside `POST /api/campaigns/generate`, sequentially:

1. **Roadmap** — one `generateText()` call producing `{ weeks: [{ week, theme, goals[] }] }`
   for the campaign's duration (weeks = `ceil(durationDays / 7)`). Adapted from
   BrandFlow's `generateCampaignRoadmap` prompt, using `Brand.niche`/`Brand.name` and
   the brand's `goals` (parsed via `parseGoals`) in place of BrandFlow's `trends` input
   (Trends is out of scope this phase, so the roadmap prompt omits it).
2. **Skeleton** — one `generateText()` call per day-batch (batch size 15, matching
   BrandFlow) producing `[{ day, platform, format, title }]` for `piecesPerDay` pieces
   per day, aligned to the roadmap's weekly themes. Adapted from
   `generateCampaignSkeleton`.
3. **Hydration** — every skeleton piece is hydrated in parallel via
   `Promise.allSettled`, one `generateText()` call each, producing
   `{ hook, body, visualPrompt }`. Adapted from `hydrateContentPiece`, including
   BrandFlow's per-format system-prompt table (`Video`/`Short`/`Image`/`Article`/
   `Thread`) to keep prompt quality parity. A piece whose hydration call fails gets
   `body: '[Generation failed: <reason>]'` and `status: 'draft'` rather than aborting
   the whole campaign — matching the failure-isolation pattern already used in
   `content-generator.ts`'s `generateContent()`.
4. Campaign and all pieces are persisted in a single Prisma transaction once every
   hydration settles; campaign status is set to `completed`.

No partial/incremental persistence during generation — the request is synchronous and
returns the finished campaign. For the default 14-piece campaign this is roughly
1 (roadmap) + 1 (skeleton, single batch under 15 days) + 14 (hydration, parallel) = 16
AI calls, with the hydration calls running concurrently rather than serially.

### API routes (new)

| Route | Method | Purpose |
|---|---|---|
| `/api/campaigns/generate` | POST | Run the full generation flow, persist, return campaign |
| `/api/campaigns` | GET | List campaigns for `?brandId=` |
| `/api/campaigns/[id]` | GET | Campaign detail with nested `content` pieces |
| `/api/campaigns/[id]` | PATCH | Update `name`/`description` |
| `/api/campaigns/[id]` | DELETE | Delete campaign (pieces cascade via existing FK) |
| `/api/content-pieces/[id]` | PATCH | Edit a piece's editable fields |
| `/api/content-pieces/[id]` | DELETE | Delete a single piece |
| `/api/content-pieces/[id]/regenerate` | POST | Re-run hydration for just this piece |
| `/api/campaigns/calendar` | GET | All pieces across a brand's campaigns, for `?brandId=` |

Route naming avoids collision with the existing `/api/content` and `/api/content/generate`
routes (Content Lab's single-post generator, unrelated to `ContentPiece`) by using
`/api/content-pieces/*` for the new per-piece endpoints.

### Pages (new)

- **`/campaigns`** — brand selector (`?brandId=` query param, falls back to first
  active brand — same pattern as `src/app/(dashboard)/connect/page.tsx`) + a "New
  Campaign" form (name, description, duration days, pieces/day, defaults 7×2) + list of
  existing campaigns (name, status badge, piece count, created date, delete).
- **`/campaigns/[id]`** — campaign detail: editable name/description, pieces grouped by
  day, each showing platform/format/title/hook/body/visualPrompt with inline edit,
  per-piece regenerate and delete actions.
- **`/calendar`** — brand selector + every piece across that brand's campaigns, grouped
  by day, each entry linking back to its campaign detail page.

### Nav

Two new items in `src/components/sidebar-nav.tsx`'s `NAV_ITEMS`: "Campaigns" and
"Calendar", alongside the existing flat list (no group restructuring this phase).

## Testing

- Unit tests for the prompt-building and response-parsing functions (roadmap/skeleton/
  hydration), mocking `generateText()` — same pattern as
  `src/lib/ai/content-generator.ts`'s and `reply-generator.ts`'s existing test suites.
- Unit tests for the failure-isolation behavior (one piece's hydration failing doesn't
  fail the campaign).
- Live browser verification of the full flow: create campaign → generate → view in
  campaign detail → edit a piece → regenerate a piece → delete a piece → view on
  Calendar → delete campaign. API routes and `.tsx` pages are not unit-tested in this
  repo's existing convention — manual/live verification is the norm here, same as every
  prior phase.

## Risks / open items

- **Generation latency:** a 14-piece campaign is ~16 sequential-then-parallel AI calls;
  slower providers (or a rate-limited free-tier key) could make this a long synchronous
  request. No progress streaming this phase — the UI shows a loading state with an
  approximate "this may take a minute" message, matching BrandFlow's own approach
  (status text updates) minus the live phase-by-phase detail, since the whole flow is
  now one server round-trip instead of many client-orchestrated calls.
- **No rate limiting** on `/api/campaigns/generate` (same known, already-accepted gap as
  the other AI-calling routes in this app).

## Out of scope

- Image, voiceover, and video generation (BrandFlow's `/api/ai/image|voiceover|video`).
- Research/Trends/competitor analysis (BrandFlow's `/api/ai/research`, website-DNA
  scraping — note this is distinct from the already-shipped brand-profile
  "gather from URL" feature, which extracts brand *profile* fields, not campaign
  research).
- Library tab.
- "Send to Scheduler" pipeline integration (`ContentPiece.scheduledPostId` stays unused
  this phase) — tracked as the original design's Phase 4.
- Per-piece refine/variation/keyword-suggestion actions (BrandFlow had
  `handleRefineCopy`/`handleGenerateVariation`/`handleGenerateKeywords` as separate
  actions beyond regenerate) — regenerate-the-whole-piece covers the same need more
  simply for this phase.
- Full nav restructuring into "Content Engine"/"Publishing" groups.
