# Content Lab: Image/Video Generation (Runware) + Generation History — Design

**Date:** 2026-07-17
**Status:** Approved design (pre-implementation) — user explicitly waived the interactive
brainstorming/approval loop for this round ("just go ahead... you don't have to ask me
for approval"). Decisions below are still made deliberately and documented with
rationale, so they can be revisited later; they were not run past the user turn-by-turn.

## Goal

Two gaps reported directly by the user while using Content Lab:

1. **No image/video generation.** Content Lab only generates text. The user wants to
   add image and video generation using **Runware AI**, a provider they already use
   outside this app.
2. **Generated content isn't saved.** Content Lab's results live only in React state.
   Refreshing or navigating away loses everything — even content the user didn't
   schedule but wanted to come back to later ("I might want to use those things later").

## Decisions

1. **Runware is a media-only provider**, added alongside — not folded into — the
   existing 4-provider text switcher (`gemini`/`anthropic`/`openai`/`ollama` in
   `src/lib/ai/providers.ts`). It has no "default provider" concept since it's the only
   media provider; it's simply on or off based on whether a key is configured. Its key
   lives in the same `.provider-keys.json` store as the other four, extended with a
   `runware` field.
2. **One shared image/video per generation request, not one per platform.** When the
   user checks "Generate image" or "Generate video" in Content Lab and generates for N
   platforms, exactly one image/video is generated (not N) and attached to every
   platform's result card. Rationale: the common case is cross-posting the same visual
   across platforms; generating N near-identical renders would multiply cost for no
   benefit. If the user wants platform-specific visuals later, that's a follow-up, not
   part of this fix.
3. **Two-step generation: an LLM writes the visual prompt, Runware renders it.** Image
   and video models don't reason about brand voice or topic — they need a concrete
   visual description. `generateText()` (the existing text provider layer) is called
   once with an "Art Director" or "Video Producer" style meta-prompt (mirroring the
   `visualPrompt` step already built for the Campaigns feature) to produce that
   description, which is then passed as Runware's `positivePrompt`. This mirrors
   BrandFlow's own `enhanceImagePrompt`/`enhanceVideoPrompt` → `generateImage`/
   `generateVideo` split.
4. **Runware's hosted URLs are stored directly — no local download/proxy.** Runware
   returns a permanent `imageURL`/`videoURL` on its own CDN. `ScheduledPost.mediaUrls`
   already stores plain external URLs (not local files) for the same reason logos and
   scheduled-post media do — no change to that convention.
5. **Every successful Content Lab generation is persisted**, regardless of whether the
   user schedules it. A new `GeneratedContent` Prisma model stores one row per
   successful per-platform result (text always; `imageUrl`/`videoUrl` when requested).
   Failed per-platform generations are not persisted — there's nothing reusable in a
   failure.
6. **A new `/library` page** lists a brand's persisted `GeneratedContent`, most recent
   first, with the content, any media thumbnail, and "Copy" / "Schedule this" actions.
   This is deliberately the minimal slice of BrandFlow's originally-deferred "Library"
   tab — a flat history list, not a management UI (no bulk actions, no filtering by
   content type, no editing in place). It exists specifically to satisfy "I might want
   to use those things later," nothing more.
7. **The Schedule-handoff bug found in the same session gets extended, not just fixed.**
   `handleSchedule` in Content Lab already needed a fix to carry `brandId` through to
   the Schedule page (separate, already-applied fix). While touching that path, it's
   extended to also carry `imageUrl`/`videoUrl` into the Schedule page's Media URLs
   field, so generated media isn't a dead end when scheduling.

## Architecture

### Schema change (new — unlike Campaigns/Calendar, this needs one)

```prisma
model GeneratedContent {
  id          String   @id @default(cuid())
  brandId     String
  brand       Brand    @relation(fields: [brandId], references: [id], onDelete: Cascade)
  platform    String
  contentType String
  topic       String?
  content     String
  hook        String
  tip         String?
  imageUrl    String?
  videoUrl    String?
  visualPrompt String?
  createdAt   DateTime @default(now())
}
```

Added via `Brand.generatedContent GeneratedContent[]` back-relation. This repo has no
`prisma/migrations` directory — schema changes are applied with `npx prisma db push`
(see `package.json`'s `db:push` script), matching how Phase 1 added `Campaign`/
`ContentPiece`.

### Runware client (new)

`src/lib/ai/media-providers.ts`:
- `generateImage(prompt: string, options?): Promise<{ url: string; cost: number }>` —
  single synchronous POST to `https://api.runware.ai/v1` (`Authorization: Bearer <key>`,
  body `[{ taskType: 'imageInference', taskUUID, positivePrompt: prompt, model, width,
  height, numberResults: 1 }]`). Default model `runware:100@1` (FLUX.1 [schnell] — fast,
  cheap). Response is synchronous per Runware's own docs (`data[0].imageURL`).
- `generateVideo(prompt: string, options?): Promise<{ url: string; cost: number }>` —
  POST with `taskType: 'videoInference'`, `deliveryMethod: 'async'`, default model
  `bytedance:seedance@2.0`, `duration: 5` (seconds — short clips only, keeps cost/latency
  bounded). Returns a `taskUUID`; the client polls `POST /v1` with
  `{ taskType: 'getResponse', taskUUID }` every 3s up to a 2-minute timeout, reading
  `status` (`processing` → keep polling, `success` → return `videoURL`, `error` → throw).
- Both throw a clear error if no Runware key is configured, matching the existing
  provider functions' `"<Provider> API key not configured. Go to Settings → API Keys."`
  pattern in `src/lib/ai/providers.ts`.
- Key storage: extend `ProviderKeys`/`ProviderKeyStatus` in `src/lib/ai/providers.ts`
  with an optional `runware` field, reusing the existing `loadKeys`/`saveKeys`/`getKey`
  machinery (`getKey` already takes a provider-name string keyed against
  `ENV_VAR`/stored keys — `runware` slots in the same way, with `RUNWARE_API_KEY` as its
  env fallback).

### Visual-prompt generation (new)

`src/lib/ai/visual-prompt.ts`:
- `buildVisualPrompt(params): Promise<string>` — one `generateText()` call using an
  Art-Director/Video-Producer meta-prompt (reusing the same two system-prompt strings
  already written for the Campaigns feature's `Image`/`Video` formats in
  `src/lib/campaigns/prompts.ts`) combined with the brand voice/context and the
  generated post's `content`/`hook`, returning a plain-text visual description (not
  JSON — this is fed straight into Runware's `positivePrompt`, no parsing needed).

### API changes

- `POST /api/content/generate` (existing route) gains two optional request fields:
  `generateImage: boolean`, `generateVideo: boolean` (both default `false`). When
  either is true, after the existing per-platform text generation completes, the route
  builds one visual prompt from the first successful result and calls
  `generateImage`/`generateVideo` once; the resulting URL is attached to every
  successful `GeneratedPost` in the response as `imageUrl`/`videoUrl`. A media
  generation failure is reported as a warning on each post (`mediaWarning: string`) —
  it does not fail the text generation, matching the app's existing per-piece
  failure-isolation convention.
- The same route persists every successful `GeneratedPost` (text present, no error) to
  `GeneratedContent` after generation, associated with the request's `brandId`.
- `GET /api/content/history?brandId=` (new) — lists a brand's `GeneratedContent`, most
  recent first, for the Library page.

### Settings page

Add a "Media Generation" section (separate from the existing 4-provider grid) with a
single Runware API key field, following the same masked-input + "configured" badge
pattern already used for the other providers in `src/app/(dashboard)/settings/page.tsx`.

### Content Lab UI

Two new checkboxes in the existing controls panel ("Generate image", "Generate video",
mutually exclusive — generating both per request would double cost for one shared
visual and isn't needed for v1). Each result card gains a media preview (`<img>` for
image, `<video controls>` for video) when present, and a `mediaWarning` banner if
generation was requested but failed. "Schedule this post" now also passes the media URL
through to the Schedule page.

### Library page (new)

`/library` — brand selector (same pattern as `/campaigns`) + a reverse-chronological
list of `GeneratedContent` rows, each showing platform, content type, a content
preview, media thumbnail if present, created date, and "Copy" / "Schedule this" actions
(the latter reusing the same sessionStorage prefill mechanism as Content Lab).

### Nav

One more new top-level sidebar item, "Library", alongside the already-planned
"Campaigns" and "Calendar" from the other in-flight plan.

## Testing

- Unit tests for `media-providers.ts` (mocking `fetch`) — image happy path, video
  polling happy path (processing → success), video timeout, missing-key errors for
  both.
- Unit test for `visual-prompt.ts` (mocking `generateText`).
- API routes and `.tsx` pages: live/manual verification only, per this repo's
  established convention (same as every other route/page in the app).

## Risks / open items

- **No rate limiting** on the new media-generation code path — same already-accepted,
  app-wide gap as every other AI-calling route.
- **Video generation cost/latency** is real and user-borne (their own Runware key/
  billing) — the 5-second-duration default and 2-minute poll timeout bound worst-case
  latency but not cost; no in-app spend cap this round.
- **Runware account/key is the user's own** — same pattern as the other 4 providers,
  entered via Settings, never handled by the assistant.

## Out of scope

- Per-platform (as opposed to shared) image/video generation.
- Editing or deleting `GeneratedContent` history rows from the Library page (view +
  reuse only).
- Any Library-side bulk actions, filtering, or search.
- Refine/variation actions on generated media (regenerate-the-whole-thing, by
  unchecking and re-generating, covers it for v1).
