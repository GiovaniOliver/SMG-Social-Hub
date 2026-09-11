# SMG Social Hub — Development Status

_Last updated: September 11, 2026 (America/Chicago)_

This document is the living implementation tracker for SMG Social Hub. Update it whenever a production feature, integration, architecture decision, blocker, or deployment phase changes.

## Current phase

**Phase: Production hardening + real account onboarding**

The app foundation is working and the focus has shifted from basic architecture to:

1. mobile/responsive usability,
2. production provider configuration,
3. connecting existing social-media accounts,
4. verifying real publishing capabilities,
5. hardening AI/provider integrations,
6. preparing the later UGC / AI-influencer management workflow.

The UGC/persona builder is intentionally deferred until the existing social accounts are connected and inventoried.

## Production application

- App: **SMG Social Hub**
- Production domain: **https://social.socialtizemg.com**
- Hosting: Vercel
- Deployment flow: merge to GitHub `main` → Vercel deploys automatically
- Repository: `GiovaniOliver/SMG-Social-Hub`
- Framework: Next.js 15
- Database/query layer: `@supabase/supabase-js`
- Database: shared **SMG Agency Website** Supabase project
- Database ownership boundary: tables prefixed with `social_hub_`
- Prisma: **removed / not used**

## Architecture decisions

### Account-first social architecture

Social identities are connected before they are assigned to a brand, UGC creator, or AI influencer.

Core tables:

- `social_hub_accounts`
- `social_hub_platform_connections`
- `social_hub_brands`
- `social_hub_scheduled_posts`
- `social_hub_comment_opportunities`
- `social_hub_comment_drafts`
- `social_hub_campaigns`
- `social_hub_content_pieces`
- `social_hub_generated_content`
- `social_hub_ai_integrations`

A provider authorization may discover multiple publishing identities. Brand ownership is optional during onboarding.

### Secrets and credentials

- Social OAuth tokens are stored server-side and encrypted at rest.
- AI-provider keys saved through Social Hub are encrypted before storage in Supabase.
- Vercel environment variables remain supported as server-only fallbacks.
- Secret values are never returned to browser UI.
- Browser roles do not receive direct access to the AI integration table.

## Completed milestones

### Database modernization

- [x] Removed Prisma runtime dependency from Social Hub.
- [x] Replaced Prisma data access with Supabase server-side access.
- [x] Added source-controlled Supabase migrations.
- [x] Added account registry schema.
- [x] Added AI integration settings schema.
- [x] Kept all database changes scoped to `social_hub_*` tables.
- [x] Removed the legacy `prisma` compatibility alias from runtime code.
- [x] Removed Prisma-specific `P2002` handling in favor of database unique-constraint detection.
- [x] Removed obsolete one-time BrandFlow migration scripts that still imported `@prisma/client`.

### Social account registry

- [x] Added `/accounts` as the primary account onboarding surface.
- [x] Added automatic account discovery where provider APIs support it.
- [x] Added manual account inventory for identities without supported API publishing.
- [x] Added connection states: connected, needs reauthorization, disconnected, error.
- [x] Added publishing capabilities: automatic, manual, read-only, unsupported.
- [x] Added provider-readiness checks before OAuth begins.
- [x] Added callback URL validation against the production app URL.
- [x] Added safe display of missing environment-variable names without exposing secrets.

### Social providers

| Provider | Connection path | Discovery/publishing status |
| --- | --- | --- |
| Meta / Facebook | Direct Meta OAuth | Facebook login identity + Pages discovered; supported Pages can auto-publish |
| Instagram | Through Meta OAuth | Linked Instagram professional accounts discovered from Facebook Pages |
| YouTube | Google OAuth | Authorized YouTube channel discovered; upload scope determines auto-publishing |
| LinkedIn | LinkedIn OAuth | Authorized member identity discovered; `w_member_social` controls publishing |
| TikTok | TikTok OAuth | Authorized profile discovered; publish scope controls automatic publishing |
| X / Twitter | Arcade-managed OAuth | Existing X identity discovered through `X.WhoAmI`; posting path implemented |
| Reddit | Arcade-managed OAuth | Existing Reddit identity discovered through `Reddit.GetMyUsername`; posting path implemented |

### Facebook additional profiles

Facebook's consumer **additional profiles** are not assumed to be equivalent to Facebook Pages in Meta's publishing APIs.

Current handling:

- supported Page identities returned by Meta are imported automatically,
- linked Instagram professional accounts are imported automatically,
- the Facebook login identity is inventoried separately,
- any additional profile that Meta does not expose as a supported publishing identity can still be inventoried manually,
- do not store Facebook passwords in Social Hub.

This must be verified against each real account during onboarding before automatic publishing is promised for an additional profile.

### AI integration management

- [x] Added dedicated **AI Integrations** dashboard page.
- [x] Gemini configuration.
- [x] Anthropic configuration.
- [x] OpenAI configuration.
- [x] Ollama configuration.
- [x] Runware media-provider configuration.
- [x] Added per-provider model settings.
- [x] Added a persistent default text provider.
- [x] Added **Test Connection** actions.
- [x] Runware test uses an account/auth check rather than generating media.
- [x] Vercel env values remain fallback configuration.

### Gemini repair

The retired `gemini-2.0-flash-lite` path was removed from the active generation workflow.

Current default:

- model: `gemini-3.5-flash-lite`
- API style: Google Gemini Interactions API
- structured JSON output supported
- maximum output tokens sent through `generation_config`

Brand URL extraction should now route through the current Gemini integration rather than the retired `generateContent` model endpoint.

### Responsive/mobile UI

- [x] Replaced the permanently visible mobile sidebar with a responsive drawer.
- [x] Added mobile top navigation bar.
- [x] Added hamburger menu trigger.
- [x] Added explicit close button.
- [x] Added tap-outside/backdrop close.
- [x] Added Escape-key close.
- [x] Drawer closes automatically after navigation.
- [x] Prevented background scroll while the drawer is open.
- [x] Added mobile viewport overflow protection.
- [x] Reduced mobile page gutters.
- [x] Set mobile form controls to 16px to avoid iOS input zoom.
- [x] Increased navigation touch targets.
- [x] Added iOS safe-area handling to the mobile top bar.

## Current real-data state

At the start of the account-onboarding phase, `social_hub_accounts` contained **zero active account identities**.

That is expected: the registry architecture is implemented, but the real SMG / creator / UGC accounts still need to be authorized and imported.

## Immediate workflow

### 1. Mobile QA

After the responsive release is deployed, verify on a phone:

- [ ] hamburger menu opens the drawer,
- [ ] backdrop closes it,
- [ ] X/close button closes it,
- [ ] selecting a navigation destination closes it,
- [ ] page content does not sit underneath the drawer,
- [ ] Accounts is usable without horizontal overflow,
- [ ] AI Integrations is usable without horizontal overflow,
- [ ] form inputs do not trigger unwanted iOS zoom.

Any page-specific mobile layout issue found after this shell pass should be fixed as a focused follow-up.

### 2. AI verification

From **AI Integrations**:

- [ ] confirm Gemini shows configured,
- [ ] run Gemini **Test Connection**,
- [ ] confirm `gemini-3.5-flash-lite` or the desired replacement is selected,
- [ ] retry Brand URL import,
- [ ] test any other configured LLM before relying on it for production content.

### 3. Real social account onboarding

Recommended order:

1. **Meta** — import Facebook Pages and linked Instagram professional accounts.
2. **YouTube / Google**.
3. **LinkedIn**.
4. **TikTok**.
5. **X** through Arcade.
6. **Reddit** through Arcade.

For every authorization:

- [ ] provider reports **Ready** before Connect is enabled,
- [ ] OAuth completes successfully,
- [ ] returned account identity is written to `social_hub_accounts`,
- [ ] provider connection is written to `social_hub_platform_connections`,
- [ ] handle/display name/avatar/profile URL are correct,
- [ ] publishing capability is correct,
- [ ] `lastVerifiedAt` is populated,
- [ ] repeat authorization when another account under the same provider must be added.

### 4. Account verification after import

After each provider is connected:

- [ ] inspect imported identities,
- [ ] identify duplicates,
- [ ] identify unsupported/manual-only identities,
- [ ] verify token/credential ownership,
- [ ] perform a safe publishing test on a designated test identity,
- [ ] verify the published post ID/URL is persisted,
- [ ] verify failures are surfaced clearly,
- [ ] verify reauthorization behavior for expired/revoked access.

### 5. Production cleanup

After account connection paths are verified:

- [x] remove remaining lint warnings,
- [x] replace remaining avoidable raw `<img>` usage with Next Image where appropriate,
- [ ] review token refresh paths,
- [ ] review retry/idempotency behavior for publishing,
- [ ] add connection-health refresh jobs,
- [ ] add stronger operator-facing error diagnostics,
- [ ] run full mobile QA across all dashboard pages,
- [ ] run final security review of OAuth state, token encryption, and server-only secrets.

## Deferred UGC / AI influencer phase

Do **not** build the full persona generator yet.

Planned direction after account onboarding:

- account manager for existing AI-influencer / UGC identities,
- map existing social identities to a creator/profile record,
- rename/rebrand identities after they are inventoried,
- UGC workflow starting from a first generated scene/image,
- media-generation provider routing,
- longer-form video workflow,
- reusable creator assets/reference media,
- publishing/scheduling through the already-connected account registry.

The social account registry is intentionally the dependency for this later phase.

## Recent implementation history

- PR #13 — AI Integrations manager + Gemini migration
- PR #14 — Gemini Interactions request cleanup
- PR #15 — social-provider readiness checks
- PR #16 — AI provider tests + persistent default LLM
- PR #17 — responsive dashboard shell + documentation consolidation
- Production cleanup — warning cleanup, current Gemini test coverage, legacy SDK removal, and complete Prisma-reference cleanup

## Documentation rules

When future work changes the implementation:

1. update this file,
2. update the specialized design/implementation doc when one exists,
3. keep README high-level,
4. keep migrations in `supabase/migrations`,
5. do not create multiple status documents for the same phase unless there is a clear specialized purpose.

