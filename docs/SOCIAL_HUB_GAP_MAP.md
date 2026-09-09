# SMG Social Hub — Gap Map & Implementation Tracker

**Last updated:** 2026-09-09  
**Source of truth:** `GiovaniOliver/SMG-Social-Hub` `main` + live SMG Supabase schema + current Vercel production behavior  
**Purpose:** Keep one durable checklist for the work required to take SMG Social Hub from a mostly-built internal tool to a reliable production social-content, publishing, and engagement system.

## Status legend

- ✅ **DONE** — implemented and verified or intentionally completed.
- 🟡 **PARTIAL** — meaningful implementation exists, but the workflow is not production-complete.
- 🔴 **BLOCKED** — cannot complete until an external/configuration dependency is resolved.
- ⬜ **TODO** — not yet implemented.
- 🧪 **VERIFY** — code exists but needs a live end-to-end verification pass.

## Priority legend

- **P0** — blocks a core production workflow or causes a currently advertised feature to fail.
- **P1** — required for reliable production operation.
- **P2** — important UX, scale, maintainability, or quality improvement.
- **P3** — later expansion / BrandFlow parity / optimization.

---

# Current architecture snapshot

SMG Social Hub is a standalone Next.js 15 application deployed on Vercel from this GitHub repository. It uses the **same Supabase/Postgres project as SocialtizeMG.com**, while keeping its data isolated in eight `social_hub_*` tables. **Prisma is the ORM; Supabase/Postgres is the database.**

Core implemented surfaces:

- Overview dashboard
- Brands / brand enrichment
- Content Lab (multi-provider text + Runware image/video generation)
- Generated-content Library
- Campaign generation and Day-N Calendar
- Schedule / Queue
- Social account connections
- Multi-platform publishing adapters
- Comment monitoring / AI reply workflow
- API-key/provider Settings
- Auth, OAuth state signing, cron endpoint, and database health endpoint

The largest remaining gaps are **integration wiring, production persistence/configuration, scheduler resilience, and completing partially implemented platform adapters**, not missing basic UI pages.

---

# Milestone 0 — Production foundation & configuration

| ID | Pri | Status | Gap / task | Definition of done |
|---|---|---|---|---|
| ENV-001 | P0 | 🔴 BLOCKED | Fix Vercel Production `DATABASE_URL` authentication for the shared SMG Supabase project. | `/api/health` returns `{status:"ok",database:"ok"}` in production. |
| ENV-002 | P1 | ⬜ TODO | Verify `DIRECT_URL` is current and assigned to the correct environments. | Prisma migration/introspection connection is documented and tested without exposing credentials. |
| ENV-003 | P0 | ⬜ TODO | Replace Vercel-incompatible `.provider-keys.json` persistence. Settings currently write API keys to `process.cwd()` using `fs.writeFileSync`, which is not durable across Vercel serverless instances/deployments. | Provider keys and default-provider setting persist reliably across deployments/instances using an approved secret/config strategy. |
| ENV-004 | P1 | ⬜ TODO | Complete environment-variable inventory. `.env.example` omits variables used by code, including Gemini/OpenAI/Runware and Supabase Storage settings. | `.env.example`, README, and deployment docs list every required/optional variable with consistent names. |
| ENV-005 | P1 | ⬜ TODO | Align default AI provider with actual configured production provider. Code defaults to Gemini even when only another provider is configured. | App selects a configured provider or clearly blocks with actionable configuration state. |
| ENV-006 | P1 | ⬜ TODO | Decide Preview environment strategy. Current previews may not have DB credentials. | Preview deploys either use an isolated Supabase branch/dev DB or intentionally run in a documented limited mode. |
| STOR-001 | P1 | ⬜ TODO | Provision/document Supabase Storage `social-hub-logos` bucket and required server-only credentials. | Logo upload works in production and bucket setup is reproducible. |
| STOR-002 | P2 | ⬜ TODO | Add storage lifecycle cleanup for replaced/deleted logos and, if adopted, generated media. | Orphaned files are cleaned up safely. |
| DEP-001 | P1 | ✅ DONE | GitHub → Vercel production deployment source. | Production builds from GitHub `main`; dirty local desktop deploys are no longer the source of truth. |
| DB-001 | P1 | ✅ DONE | Reset Social Hub DB namespace and create a complete baseline migration. | Eight `social_hub_*` tables rebuilt from source-controlled baseline. |
| DB-002 | P1 | ✅ DONE | Lock down Social Hub tables from direct `anon` / `authenticated` Data API access. | RLS enabled and broad table privileges revoked. |
| DB-003 | P2 | ⬜ TODO | Add migration workflow/CI validation against disposable Postgres. | Every schema change is tested from an empty database before merge. |

---

# Milestone 1 — Connections & publishing reliability

| ID | Pri | Status | Gap / task | Definition of done |
|---|---|---|---|---|
| OAUTH-001 | P0 | ⬜ TODO | Finish Instagram connection flow. Instagram uses Facebook OAuth, but the Facebook callback currently persists only a `FACEBOOK` connection and does not discover/store the linked Instagram Business account. | Instagram Connect creates/updates a real `INSTAGRAM` `PlatformConnection` with IG user ID and usable token. |
| OAUTH-002 | P1 | ⬜ TODO | Refactor all OAuth callbacks to call `verifyOAuthState()` themselves and use the verified payload instead of separately decoding state. Middleware can remain defense-in-depth. | Facebook, Google, LinkedIn, and TikTok callbacks derive `brandId` only from verified signed state. |
| OAUTH-003 | P1 | ⬜ TODO | Implement OAuth token refresh lifecycle for providers with refresh tokens. | Expiring Google/LinkedIn/TikTok tokens refresh automatically when possible and DB tokens are updated atomically. |
| OAUTH-004 | P2 | ⬜ TODO | Add Facebook page/account selector instead of always taking the first page returned by `/me/accounts`. | User can select the correct page/linked IG account for each brand. |
| OAUTH-005 | P2 | ⬜ TODO | Add connection health/re-auth diagnostics. | Connect page distinguishes active, expiring, expired, permission-missing, and reauthorization-required states. |
| PUB-001 | P0 | ⬜ TODO | Make Twitter/X publishing usable end-to-end with Arcade. Current UI has no Social Hub connection-creation flow and scheduler does not pass the required Arcade `userId`. | Connected Twitter account can publish immediately and through Schedule/Queue. |
| PUB-002 | P0 | ⬜ TODO | Make Reddit publishing usable end-to-end with Arcade. Current scheduler does not preserve structured subreddit/title/user identity required by the publisher. | Reddit post can be scheduled with structured subreddit/title and published by cron. |
| PUB-003 | P1 | 🟡 PARTIAL | Complete TikTok publish-state tracking. Current adapter treats receipt of `publish_id` as final success without polling final publish status. | TikTok task is polled to terminal success/failure and final external ID/URL/error is stored. |
| PUB-004 | P1 | 🟡 PARTIAL | Implement direct YouTube upload or explicitly downgrade product support. Current adapter always returns a manual YouTube Studio instruction. | Either binary/resumable upload works from Social Hub or UI clearly labels YouTube as manual/reference-only. |
| PUB-005 | P1 | ⬜ TODO | Add per-platform retry/backoff and transient-error classification. | Rate limits/network/5xx errors retry safely without blindly repeating permanent failures. |
| PUB-006 | P1 | ⬜ TODO | Add external publish idempotency protection. A platform can accept a post and the function can die before DB commit, making stale recovery vulnerable to duplicate publishing. | Repeat execution can prove whether a platform post already succeeded before reposting. |
| PUB-007 | P1 | ⬜ TODO | Model partial multi-platform success explicitly. Current logic maps partial success to `PUBLISHED`. | Post status/result model differentiates full success, partial success, retryable failures, and terminal failures. |
| PUB-008 | P2 | ⬜ TODO | Centralize platform capability/constraint metadata. Character limits and capabilities currently differ between Content Lab, Schedule, and adapters. | One shared source drives char limits, required media, title/subreddit requirements, supported media types, and publishing availability. |
| PUB-009 | P2 | ⬜ TODO | Review/align API versions and platform-specific formats. Facebook publishing uses a different Graph API version than OAuth. | Versions are intentionally pinned and documented; unsupported/legacy endpoints replaced. |
| PUB-010 | P3 | ⬜ TODO | Add multi-image/carousel and richer platform media formats where useful. | Capability matrix supports platform-specific media variants rather than first-media-only behavior. |

---

# Milestone 2 — Scheduler, queue, and campaign-to-publish pipeline

| ID | Pri | Status | Gap / task | Definition of done |
|---|---|---|---|---|
| SCH-001 | P0 | ⬜ TODO | Configure and verify a real scheduler trigger for `/api/cron`. Route exists, but the repo does not currently define a Vercel Cron schedule. | Production scheduler runs on documented cadence and a test post publishes without manual API invocation. |
| SCH-002 | P1 | ⬜ TODO | Remove `?secret=` cron authentication fallback and use Authorization header only. | Cron secret cannot leak through query-string logs/history. |
| SCH-003 | P1 | ⬜ TODO | Batch due-post processing and cap work per invocation. Current cron processes all due posts sequentially. | Each invocation processes a bounded batch and safely continues remaining work next run. |
| SCH-004 | P1 | ⬜ TODO | Add attempt count, `nextRetryAt`, error class, and dead-letter/terminal state. | Failed publishing has deterministic retry policy and operator visibility. |
| SCH-005 | P1 | ⬜ TODO | Fix Retry action so retrying one failed item does not run the scheduler across every other due post. | Retry endpoint processes or requeues only the requested post. |
| SCH-006 | P1 | ⬜ TODO | Build missing `/schedule/edit/[id]` page. Queue currently links to a route that does not exist. | Pending posts can be edited from Queue without 404. |
| SCH-007 | P1 | ⬜ TODO | Enforce platform constraints server-side when scheduling, not only as UI warnings. | Invalid/disconnected/over-limit posts are rejected before entering Queue. |
| SCH-008 | P1 | ⬜ TODO | Store structured publishing fields (e.g. Reddit title/subreddit) instead of encoding them into `notes`. | Scheduled post preserves all publisher-required data as typed fields/metadata. |
| PIPE-001 | P0 | ⬜ TODO | Implement Campaign `ContentPiece` → `ScheduledPost` handoff using existing `scheduledPostId` relation. | A campaign piece can be scheduled with one action and later shows its queue/publish state. |
| PIPE-002 | P1 | ⬜ TODO | Add “Schedule this piece” to Campaign detail cards. | Brand, platform, content, media and piece relation flow into scheduler. |
| PIPE-003 | P2 | ⬜ TODO | Add bulk campaign scheduling and date assignment. | User can assign campaign start date/cadence and schedule multiple pieces safely. |
| CAL-001 | P2 | 🟡 PARTIAL | Upgrade Calendar from relative Day-N list to actual schedule-aware calendar when dates exist. | Calendar can show draft + scheduled + published state on real dates, while retaining Day-N planning where useful. |
| CAL-002 | P3 | ⬜ TODO | Add drag/drop/reschedule interaction after core pipeline is stable. | Pending scheduled content can be moved with server-side validation. |

---

# Milestone 3 — Content engine, media, library, and research

| ID | Pri | Status | Gap / task | Definition of done |
|---|---|---|---|---|
| AI-001 | P1 | ⬜ TODO | Make provider settings production-durable (shared with ENV-003) and add provider connection tests. | Settings survive deployments and “Test” verifies credentials/model access before selection. |
| AI-002 | P1 | ⬜ TODO | Add app-wide AI/media rate limiting and abuse/cost controls. | Expensive endpoints have per-operator/brand limits and clear 429/cost behavior. |
| AI-003 | P1 | ⬜ TODO | Move large campaign generation to a durable job/progress model. A 60×5 campaign can create hundreds of synchronous AI calls in one request. | Campaign generation is resumable, cancellable, progress-visible, and survives request/function timeout. |
| AI-004 | P2 | ⬜ TODO | Persist campaign generation health/status beyond simple `completed`, including partial failures. | Campaign stores generating/completed-with-errors/failed state and failed piece count. |
| AI-005 | P2 | ⬜ TODO | Add retry/backoff/provider fallback for transient AI provider errors. | Temporary provider failures do not fail large generation jobs immediately. |
| AI-006 | P2 | ⬜ TODO | Centralize AI model configuration and remove stale/hard-coded defaults where appropriate. | Provider/model choice is explicit, tested, and visible in diagnostics. |
| MEDIA-001 | P1 | ⬜ TODO | Move long Runware video generation out of a single synchronous request/poll loop. | Video jobs persist task ID/status and UI can poll/stream progress without holding a serverless request for up to ~2 minutes. |
| MEDIA-002 | P2 | ⬜ TODO | Persist media generation cost and provider metadata. | Generated media records provider/model/task/cost for audit and budget tracking. |
| MEDIA-003 | P2 | ⬜ TODO | Decide media ownership policy: keep external Runware URLs vs copy final assets into SMG Supabase Storage. | Retention/lifecycle is documented and generated media remains reliably available. |
| MEDIA-004 | P2 | ⬜ TODO | Add campaign-piece media generation from each piece’s `visualPrompt`. | A campaign piece can generate image/video and store `mediaUrl`/`mediaType`. |
| MEDIA-005 | P3 | ⬜ TODO | Restore/port voiceover/full-video composition if still desired from BrandFlow scope. | `audioUrl`/script/full-video fields are backed by real workflow or removed from active scope. |
| LIB-001 | P2 | 🟡 PARTIAL | Add Library pagination/search/filter/sort. Current API/page effectively caps history at latest 100. | Library supports growing history without hidden truncation. |
| LIB-002 | P2 | ⬜ TODO | Add edit/archive/delete/favorite/tag actions to generated content. | Library is a reusable content workspace instead of view/copy-only history. |
| LIB-003 | P2 | ⬜ TODO | Replace sessionStorage-only Schedule handoff with a durable/deep-linkable workflow. | Scheduling can resume/reload without losing source content/media context. |
| LIB-004 | P2 | ⬜ TODO | Relate `GeneratedContent` to scheduled/published posts. | Library item shows whether/where it was scheduled/published. |
| RESEARCH-001 | P2 | ⬜ TODO | Port/create Research & Trends capability from original BrandFlow consolidation scope. | Brand/campaign workflow can gather competitor/trend inputs and persist research used in generation. |
| RESEARCH-002 | P2 | 🟡 PARTIAL | Expand brand URL enrichment beyond one-page profile extraction where useful. | Website DNA/research can intentionally crawl a bounded site rather than only a single URL. |
| CONTENT-001 | P2 | ⬜ TODO | Add inline editing/refine/variation actions for Content Lab results before scheduling. | User can correct generated copy without leaving the result flow. |
| CONTENT-002 | P2 | ⬜ TODO | Improve over-limit handling. Current generator may hard-slice copy mid-sentence. | Content is regenerated/rewritten to limit, with semantic completion preserved. |

---

# Milestone 4 — Brands, comments, engagement, and operator UX

| ID | Pri | Status | Gap / task | Definition of done |
|---|---|---|---|---|
| BRAND-001 | P1 | 🟡 PARTIAL | Replace/hide local `scan-folder` workflow in hosted Vercel. It can only scan server filesystem, not the operator’s laptop. | Production UI uses browser uploads/folder upload/connected source, or clearly disables local-only scan. |
| BRAND-002 | P2 | ⬜ TODO | Prefer archive/deactivate over destructive brand delete. Current DELETE cascades Social Hub data. | UI defaults to deactivate/archive with separate explicit destructive-delete flow. |
| BRAND-003 | P2 | ⬜ TODO | Add logo replacement/deletion cleanup and consider rejecting/sanitizing SVG uploads. | Brand media lifecycle is safe and storage does not accumulate stale assets. |
| COM-001 | P1 | ⬜ TODO | Add recurring comment scanning/monitoring cadence rather than manual scans only. | Connected platforms are scanned on documented schedule with bounded work. |
| COM-002 | P1 | ⬜ TODO | Persist scan cursor/history/status/error metadata. Current scans can repeatedly fetch the same recent data and depend on dedupe. | Each platform/brand tracks last successful scan/cursor and operator-visible failures. |
| COM-003 | P2 | 🟡 PARTIAL | Improve LinkedIn/TikTok discovery beyond pasted post IDs where APIs permit. | Limitations are explicit; supported automatic discovery has real implementation. |
| COM-004 | P2 | ⬜ TODO | Add prioritization/relevance/sentiment scoring for comment opportunities. | Queue can rank high-value/urgent opportunities instead of treating all pending items equally. |
| COM-005 | P2 | ⬜ TODO | Add brand/platform reply policy settings and escalation rules. | Risky/high-value conversations follow explicit human-review rules. |
| COM-006 | P3 | ⬜ TODO | Connect relevant comment opportunities into SMG lead/outreach workflows if desired. | Qualified external conversations can be promoted to lead records with source context. |
| UX-001 | P2 | ⬜ TODO | Reorganize sidebar into logical Content Engine / Publishing / Engagement / Admin groups. | Navigation remains usable as Research/Trends and future modules are added. |
| UX-002 | P2 | ⬜ TODO | Improve dashboard operational visibility. | Overview surfaces failed publishes, upcoming posts, connection health, generation failures, and high-priority comments. |

---

# Milestone 5 — Security, observability, testing, and maintainability

| ID | Pri | Status | Gap / task | Definition of done |
|---|---|---|---|---|
| AUTH-001 | P1 | ⬜ TODO | Add login rate limiting / brute-force protection. | Repeated failed logins are throttled without locking legitimate operator out permanently. |
| AUTH-002 | P2 | ⬜ TODO | Add session revocation/rotation strategy; current stateless session lasts up to 30 days. | Operator can invalidate existing sessions when password/secret changes or on demand. |
| AUTH-003 | P3 | ⬜ TODO | Decide whether single shared password remains acceptable or move to named users/MFA/roles. | Authentication model matches actual number of operators and audit requirements. |
| SEC-001 | P1 | ⬜ TODO | Add mutation Origin/CSRF defense-in-depth for cookie-authenticated APIs. | State-changing routes reject unexpected origins and retain SameSite cookie protection. |
| SEC-002 | P2 | ⬜ TODO | Add explicit application security headers/CSP and narrow broad image remote-host allowance where practical. | Security headers are tested and only required external media hosts are allowed. |
| SEC-003 | P2 | ⬜ TODO | Sanitize operational/provider errors returned to UI so internal adapter details are not unnecessarily exposed. | User sees actionable error code/message while sensitive/internal details stay in logs. |
| OBS-001 | P1 | ⬜ TODO | Add structured logging and request/job correlation IDs. | Publish/generation/scan flow can be traced across route → provider → DB update. |
| OBS-002 | P1 | ⬜ TODO | Add error monitoring/alerts for failed cron runs, publish spikes, OAuth failures, and DB health. | Operator receives actionable alerts rather than discovering failures manually. |
| OBS-003 | P2 | ⬜ TODO | Add diagnostics/readiness surface for environment/configuration dependencies. | One internal diagnostics page shows DB, provider keys, storage, OAuth config, cron recency, and platform connection health without exposing secrets. |
| TEST-001 | P1 | ⬜ TODO | Add GitHub Actions CI. Tests exist, but no repository workflow currently runs them automatically. | PR gate runs install, unit tests, type/build checks and migration validation. |
| TEST-002 | P1 | ⬜ TODO | Add end-to-end browser smoke tests for critical workflows. | Automated suite covers login → brand → generation → library/campaign → schedule → queue and comment approval paths with safe mocks/test DB. |
| TEST-003 | P1 | ⬜ TODO | Add publisher integration tests with mocked external APIs, including partial failure, retries, expiry, and idempotency. | Platform adapters and scheduler state transitions are regression-tested. |
| TEST-004 | P2 | ⬜ TODO | Add database migration-from-zero test. | Fresh Postgres can apply the complete baseline and future migrations consistently. |
| DATA-001 | P2 | ⬜ TODO | Consider migrating JSON-as-text columns to Postgres `jsonb` where querying/partial updates are useful. | Decision documented; high-value fields use typed JSON with validation/indexing if beneficial. |
| DATA-002 | P2 | ⬜ TODO | Replace free-text status fields with validated enums/check constraints where stable. | Invalid status strings cannot silently enter the DB. |
| DATA-003 | P2 | ⬜ TODO | Add missing lifecycle timestamps/metadata to `ContentPiece`, Campaign, jobs and publish attempts. | Operational history can answer when/why content changed, generated, scheduled, retried, and published. |

---

# Known implemented work / closed gaps

These items were verified or completed during the 2026-09-09 stabilization pass and should stay visible so they are not re-audited as missing work:

- ✅ Exact standalone GitHub repo recovered and connected to Vercel.
- ✅ Production deployment source moved to GitHub `main`.
- ✅ Shared Supabase/Postgres architecture documented; Prisma is the ORM.
- ✅ Social Hub data namespace reset and rebuilt from a complete migration baseline.
- ✅ RLS enabled and broad Supabase Data API table privileges removed for Social Hub tables.
- ✅ Database schema relational smoke tests passed directly in Supabase.
- ✅ `/api/health` added with sanitized database status/failure classification.
- ✅ Comment reply publishing now requires approved stored reply rather than arbitrary request text.
- ✅ OAuth state is signed and expires.
- ✅ Scheduler uses atomic `PENDING → PUBLISHING` claim and stale-claim recovery.
- ✅ Comment-opportunity dedupe is protected by a database unique key.
- ✅ Content Lab text generation is provider-agnostic and persists successful generated content.
- ✅ Runware image/video generation and Library persistence are implemented.
- ✅ Campaign generation, campaign CRUD, piece edit/regenerate/delete, and Day-N Calendar are implemented.
- ✅ SSRF-safe website enrichment validates every redirect hop.
- ✅ Platform token encryption uses AES-256-GCM server-side.

---

# Recommended implementation order

## M0 — Make production executable
1. ENV-001 — Vercel DB auth (operator updates secret when available).
2. ENV-003 / ENV-004 / ENV-005 — durable provider settings + complete environment inventory.
3. STOR-001 — verify logo bucket/config.
4. TEST-001 — CI gate before larger code changes.

## M1 — Make Connect → Schedule → Publish real
1. OAUTH-001 — Instagram connection persistence.
2. OAUTH-002 / OAUTH-003 — verified callback payload + token refresh.
3. PUB-001 / PUB-002 — Twitter & Reddit end-to-end Arcade wiring.
4. SCH-001 — real cron trigger.
5. SCH-006 / SCH-007 / SCH-008 — edit page + server validation + structured publisher fields.
6. PUB-003 / PUB-004 — TikTok completion tracking and YouTube scope decision.
7. PUB-005 / PUB-006 / PUB-007 — retries, idempotency, partial-state model.

## M2 — Complete content-to-publishing pipeline
1. PIPE-001 / PIPE-002 — Campaign piece → ScheduledPost.
2. AI-003 / AI-004 — durable campaign jobs/progress.
3. MEDIA-001 / MEDIA-004 — async video jobs + campaign media generation.
4. LIB-001 / LIB-003 / LIB-004 — production-grade history/reuse/schedule linkage.
5. CAL-001 — real schedule-aware calendar.

## M3 — Engagement automation
1. COM-001 / COM-002 — recurring scans + cursors/history.
2. COM-004 / COM-005 — prioritization and reply policies.
3. OBS-001 / OBS-002 — monitoring/alerts around scans and publishing.

## M4 — Expansion / BrandFlow parity
1. RESEARCH-001 / RESEARCH-002 — research/trends/website DNA.
2. MEDIA-005 — voiceover/full-video only if still strategically useful.
3. Library/content polish, analytics, richer dashboard, navigation, JSONB/schema cleanup.

---

# Working rule for future sessions

When an item is implemented:

1. Change its status in this file (`⬜ TODO` → `🟡 PARTIAL` → `✅ DONE`).
2. Add the PR number / short implementation note directly to the task row or a dated progress note below.
3. Do not create a replacement roadmap unless product scope materially changes; update this document instead.
4. Verify the feature in a Preview/test environment where possible, then production after merge.
5. For external integrations, “code exists” is not considered DONE until a real or provider-safe end-to-end verification succeeds.
