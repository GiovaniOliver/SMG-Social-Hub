# Brand Profile Enrichment — URLs, Logo Upload, AI Gather, Folder Scan — Design

**Date:** 2026-07-15
**Status:** Approved design (pre-implementation)
**Relates to:** `docs/superpowers/specs/2026-07-13-brandflow-into-hub-consolidation-design.md` —
this pulls forward part of that spec's Phase 3 ("Research — competitor + website DNA
extraction") and combines it with two new asks (app store URL support, local folder scan)
that weren't in the original consolidation spec.

## Goal

The Brand model already has BrandFlow's Content Engine fields (`niche`, `audience`, `tone`,
`goals`, `website`, `websiteContent`, `brandKit`, `engineSettings`) from Phase 1, but nothing
in the UI reads or writes them — the create/edit form only touches `name`, `description`,
`voice`, and `context`. This work:

1. Extends the brand profile with fields the AI needs to produce better content: an app
   store URL, per-platform social page URLs, and the unused Content Engine fields above.
2. Adds real logo upload (the app currently has no file upload anywhere).
3. Adds an AI "gather from URL" action — paste a website or app store link, AI extracts a
   best-effort profile.
4. Adds an AI "scan folder" action — point at a local folder of brand docs/images, AI
   extracts a best-effort profile from their contents.

Both AI actions **pre-fill the create/edit form for review — nothing saves until the user
hits Save.** Extraction quality varies by source; this is scoped as a fast first draft, not
an authoritative import.

## Context: current state

- `Brand` model (see Phase 1 migration): `name`, `slug`, `description`, `logoUrl`, `voice`
  (JSON), `context` (JSON), plus unused `niche`/`audience`/`tone`/`goals`/`website`/
  `websiteContent`/`brandKit`/`engineSettings`.
- `src/app/(dashboard)/brands/page.tsx` — single 757-line file containing `BrandCard`,
  `BrandEditForm`, `CreateBrandForm`, `TagInput`, `FaqEditor`. The edit/create forms only
  expose `name`, `description`, `voice.*`, `context.*`.
- `src/app/api/brands/route.ts` (POST/GET) and `src/app/api/brands/[id]/route.ts`
  (GET/PATCH/DELETE) — Zod-validated, accept `logoUrl` as a plain URL string already, no
  file upload.
- `src/lib/ai/providers.ts` (Phase 2) — provider-agnostic `generateText(prompt, options)`
  across Gemini/Claude/OpenAI/Ollama. All new AI extraction routes through this; no new AI
  SDK dependency.
- No file upload, no HTML fetching/stripping, no local filesystem reading exists anywhere
  in the app today.

## Decisions

1. Ship as one combined spec/plan — profile fields are foundational for both AI features.
2. Logo: real file upload, saved to local disk (`public/uploads/logos/`); optional field,
   but the UI flags a brand card/form with a visible warning when missing (not blocking).
3. Social URLs: one optional field per existing `Platform` (Facebook, Instagram, Twitter/X,
   LinkedIn, TikTok, YouTube, Reddit) — matches the enum already used by
   `PlatformConnection`/`ScheduledPost`/Comments, stored as a JSON string on `Brand`.
4. URL fetching for AI extraction: plain server-side `fetch` + a small regex-based
   HTML-to-text stripper (no new dependency). Provider-agnostic — works with whichever of
   the 4 providers is active. Explicitly **not** using Gemini's `urlContext` tool (would
   require the newer `@google/genai` SDK and break provider-agnosticism from Phase 2).
   App store pages are JS-heavy; extraction there will be weaker (title/meta tags mostly) —
   accepted limitation, not engineered around.
5. Both "gather from URL" and "scan folder" are available at brand creation *and* as a
   re-run action on an existing brand ("Re-scan"), always populating the form for review —
   never writing directly to the database.
6. Folder scan handles `.txt`/`.md` (native), `.docx` (via `mammoth`), `.pdf` (via
   `pdf-parse`). Images: v1 only does logo *detection* (filename heuristic), not
   vision-based brand-kit extraction (colors/fonts from images) — flagged as a possible
   future follow-up, out of scope now.
7. Folder scan is explicitly a local-machine feature: the server process reads a filesystem
   path the user types in. It only works because the Hub currently runs locally. If the app
   is ever deployed to hosted infrastructure, this feature silently can't reach the user's
   folder — call this out in the UI copy, not just docs.

## Schema changes

```prisma
model Brand {
  // ...existing fields...
  appStoreUrl     String?  // new
  socialUrls      String?  // new — JSON: { FACEBOOK?, INSTAGRAM?, TWITTER?, LINKEDIN?, TIKTOK?, YOUTUBE?, REDDIT? }
  localFolderPath String?  // new — remembers last-scanned folder path, convenience only
}
```

No new models. `niche`/`audience`/`tone`/`goals`/`website`/`websiteContent`/`brandKit`
already exist from Phase 1 and just need UI + API wiring.

## Architecture

### Logo upload
- `POST /api/brands/upload-logo` — multipart form, one image file. Validates type/size,
  writes to `public/uploads/logos/<cuid>-<sanitized-filename>`, returns `{ url }`.
- Form calls this immediately on file selection (before the rest of the form is saved),
  shows a preview, stores the returned URL in local form state as `logoUrl` — actual brand
  save still goes through the existing PATCH/POST brand routes.

### Shared extraction shape
Both AI extraction routes return the same shape, consumed identically by the form:

```ts
interface ExtractedBrandInfo {
  niche?: string
  audience?: string
  tone?: string
  goals?: string[]
  products?: string[]
  targetAudience?: string[]
  keyMessages?: string[]
  voiceTone?: string
  voicePersonality?: string
  suggestedLogoUrl?: string   // og:image (URL gather) or detected local logo file (folder scan)
  sourceNote: string          // e.g. "Extracted from example.com" or "Extracted from 3 files in ~/Brands/Acme"
}
```

### URL-gather — `POST /api/brands/gather-from-url`
1. Validate input is a URL (zod).
2. `fetch` the page (timeout, size cap, follow redirects).
3. Strip `<script>`/`<style>`, strip remaining tags, collapse whitespace → plain text,
   capped to a fixed character budget (mirrors the `.slice(0, 2000)` pattern already used in
   `reply-generator.ts`).
4. Pull `og:image` (or `<link rel="icon">` fallback) via regex for `suggestedLogoUrl`.
5. Build a structured-JSON prompt, call `generateText(prompt, { jsonMode: true })`.
6. Parse and return `ExtractedBrandInfo`. Errors (fetch failure, empty page, bad JSON back)
   surface as a clear inline error — same `Promise`-reject-to-UI-message pattern as Content
   Lab.

### Folder-scan — `POST /api/brands/scan-folder`
1. Validate the path exists and is a directory the server process can read.
2. List top-level files (no recursion in v1 — keeps the cap simple and predictable).
3. For each recognized extension, extract text (native / `mammoth` / `pdf-parse`), capped
   per-file and in total (skip the rest once the budget is hit).
4. Separately: filename-match for a likely logo (`logo.(png|jpg|jpeg|svg|webp)`, case
   insensitive) → `suggestedLogoUrl` set to a local file reference the client can offer to
   upload via the logo endpoint on save (copies the file server-side; never exposes raw
   filesystem paths to the browser).
5. Concatenate extracted text, same structured-JSON prompt/parse as URL-gather.
6. Store the path in `Brand.localFolderPath` only on an actual brand save (not on scan) so
   "Re-scan" can default to last-used path.

### Form changes
- `BrandEditForm`/`CreateBrandForm` gain: Content Engine fields section (niche, audience,
  tone, goals, website, appStoreUrl), Social Links section (7 platform URL inputs, reusing
  the existing `Platform`/`PLATFORM_LABELS` constants), logo upload widget with missing-logo
  warning, and a "Gather from URL" / "Scan folder" pair of inputs+buttons that call the two
  new endpoints and merge the result into form state (visually marked as AI-suggested until
  saved).
- Given the file is already 757 lines and growing, split it during implementation:
  `brands/page.tsx` (list/page shell) + `brands/brand-form.tsx` (shared create/edit form) +
  `brands/logo-upload.tsx` + `brands/extraction-panel.tsx` (the URL/folder inputs, shared by
  both forms) — keeps each file focused per the project's file-size conventions.

## Testing

- Unit tests (Vitest, mocked `fetch`/`fs`, following `providers.test.ts` conventions):
  - HTML-to-text stripper: script/style removal, tag stripping, whitespace collapse,
    truncation.
  - `og:image` / favicon extraction regex.
  - Extraction prompt → `ExtractedBrandInfo` parser (valid JSON, JSON wrapped in prose,
    missing fields default sensibly).
  - Folder walker: recognized vs skipped extensions, per-file and total caps, logo filename
    detection.
  - Upload route: rejects non-image types, rejects oversized files, writes to the expected
    path.
- No new browser/E2E tests planned beyond a manual smoke pass (create a brand from a real
  URL, create one from a real local folder, upload a logo) before calling this done —
  matches how Phase 1/2 were verified.

## Risks / open items

- App store listing pages are heavily JS-rendered; plain `fetch` will often only see a
  shell. Accepted — the feature still fills in whatever's in the static HTML/meta tags, and
  the user reviews before saving either way.
- `mammoth`/`pdf-parse` are new dependencies — small, well-established, no native build step
  expected on Windows, but worth a quick `npm install` sanity check before relying on them.
- Local folder scan reads arbitrary paths the user provides — must not allow path traversal
  tricks to escape into a "read anything on disk" primitive beyond what's intended; validate
  the path is a real, accessible directory and nothing else (no symlink-following surprises).
- Vision-based image extraction (colors/fonts/brand kit from image files) is explicitly
  deferred — if it turns out logo-filename detection isn't good enough in practice, that's a
  follow-up spec, not a mid-implementation scope add.

## Out of scope

- Vision-based brand-kit extraction from images (colors, fonts, full brand kit) — logo
  detection only in v1.
- Recursive folder scanning (subfolders) — top-level files only in v1.
- Cloud storage for uploaded logos — local disk only (matches the app's current SQLite/local
  posture; revisit if/when the app moves to hosted infra).
- Automatic re-scan on a schedule — this is a manual, on-demand action only.
