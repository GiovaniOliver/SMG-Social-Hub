# SMG Social Hub

> Current implementation status and next tasks: [`docs/DEVELOPMENT_STATUS.md`](./docs/DEVELOPMENT_STATUS.md)

Social media account management, content creation, scheduling, publishing, campaigns, and AI-assisted engagement for Socialtize Marketing Group.

## Account-first connection architecture

Social accounts are inventoried before they are assigned to brands or future creator/UGC profiles.

- `/accounts` is the primary social connection surface.
- Provider credentials live in `social_hub_platform_connections` and are encrypted at rest by the application.
- Individual publishing identities live in `social_hub_accounts`.
- A provider connection may expose multiple identities.
- Brand ownership is optional during account onboarding.
- Manual accounts can be registered for identities a provider API does not expose for automated publishing.
- Connection health distinguishes connected, reauthorization-needed, disconnected, and error states.
- Publishing capability distinguishes automatic, manual, read-only, and unsupported identities.

### Current provider discovery

- **Meta:** imports every Facebook Page returned by the authorized Meta account and linked Instagram professional accounts. The Facebook login identity is inventoried separately. Additional Facebook profiles can be registered manually when they are not exposed as supported publishing identities by the provider API.
- **YouTube / Google:** discovers the authorized YouTube channel and registers the Google identity if no channel is returned.
- **LinkedIn:** registers the authorized LinkedIn member identity.
- **TikTok:** registers the authorized TikTok profile.
- **X / Twitter:** connects through Arcade-managed OAuth, discovers the authorized identity with `X.WhoAmI`, and supports the implemented publishing path.
- **Reddit:** connects through Arcade-managed OAuth, discovers the authorized identity with `Reddit.GetMyUsername`, and supports the implemented publishing path.

The legacy `/connect` route redirects to `/accounts`.

## Database architecture

SMG Social Hub uses the same Supabase project as the main Socialtize Marketing Group website.

- **Database:** Supabase (`SMG Agency Website` project)
- **Application query layer:** `@supabase/supabase-js`, server-side only
- **Isolation boundary:** Social Hub owns only tables prefixed with `social_hub_`
- **RLS:** enabled on every `social_hub_*` table
- **Server access:** a Supabase server secret/service-role credential is required because `anon` and `authenticated` do not have direct table privileges

Current Social Hub tables include:

- `social_hub_accounts`
- `social_hub_brands`
- `social_hub_platform_connections`
- `social_hub_scheduled_posts`
- `social_hub_comment_opportunities`
- `social_hub_comment_drafts`
- `social_hub_campaigns`
- `social_hub_content_pieces`
- `social_hub_generated_content`

> Never reset or drop the entire Supabase project. Database changes for this app must remain scoped to `social_hub_*` tables because the project is shared with SocialtizeMG.com.

## Setup

1. Copy `.env.example` to `.env.local`.
2. Set `SUPABASE_URL` to the SMG Supabase project URL.
3. Set `SUPABASE_SECRET_KEY` to a server-only Supabase secret key. The legacy `SUPABASE_SERVICE_ROLE_KEY` name is also accepted as a fallback.
4. Add the authentication, token-encryption, AI, and provider OAuth variables needed for your environment.
5. Run `npm install`.
6. Run `npm run dev`.

> Never commit `.env`, `.env.local`, database credentials, OAuth secrets, access tokens, refresh tokens, or API keys. Vercel production secrets belong in Project Settings → Environment Variables.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Yes | Server-only Supabase secret key |
| `SUPABASE_SERVICE_ROLE_KEY` | Fallback | Legacy server/service-role key name |
| `TOKEN_ENCRYPTION_KEY` | Yes | 32-character secret used to encrypt provider tokens |
| `AUTH_SECRET` | Yes | Secret used for operator authentication and signed OAuth state |
| `APP_PASSWORD` | Yes | Shared operator login password |
| `CRON_SECRET` | Yes for cron | Secret required by the cron endpoint |
| `GEMINI_API_KEY` | AI fallback | Google Gemini API key; can also be stored through AI Integrations |
| `ANTHROPIC_API_KEY` | AI fallback | Anthropic API key; can also be stored through AI Integrations |
| `OPENAI_API_KEY` | AI fallback | OpenAI API key; can also be stored through AI Integrations |
| `RUNWARE_API_KEY` | Media fallback | Runware API key; can also be stored through AI Integrations |
| `OLLAMA_BASE_URL` | Optional | Local/self-hosted Ollama endpoint |
| `FACEBOOK_APP_ID` | Meta | Meta/Facebook application ID |
| `FACEBOOK_APP_SECRET` | Meta | Meta/Facebook application secret |
| `FACEBOOK_REDIRECT_URI` | Meta | Meta OAuth callback |
| `META_GRAPH_VERSION` | Optional | Meta Graph API version override; defaults to `v26.0` |
| `LINKEDIN_CLIENT_ID` | LinkedIn | LinkedIn client ID |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn | LinkedIn client secret |
| `LINKEDIN_REDIRECT_URI` | LinkedIn | LinkedIn OAuth callback |
| `TIKTOK_CLIENT_KEY` | TikTok | TikTok client key |
| `TIKTOK_CLIENT_SECRET` | TikTok | TikTok client secret |
| `TIKTOK_REDIRECT_URI` | TikTok | TikTok OAuth callback |
| `GOOGLE_CLIENT_ID` | YouTube | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | YouTube | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | YouTube | Google OAuth callback |
| `ARCADE_API_KEY` | X/Reddit | Arcade API key |
| `ARCADE_BASE_URL` | X/Reddit | Arcade API base URL |
| `NEXT_PUBLIC_APP_URL` | Production | Public application URL |
| `NEXT_PUBLIC_BASE_URL` | Production | Public base URL used by callbacks |

### Production Supabase format

```text
SUPABASE_URL=https://kicfnilhwenaditbgcxh.supabase.co
SUPABASE_SECRET_KEY=<server-only-secret>
```

Do not prefix the server secret with `NEXT_PUBLIC_`.

### Production callback URLs

```text
NEXT_PUBLIC_APP_URL=https://social.socialtizemg.com
NEXT_PUBLIC_BASE_URL=https://social.socialtizemg.com
FACEBOOK_REDIRECT_URI=https://social.socialtizemg.com/api/oauth/facebook/callback
LINKEDIN_REDIRECT_URI=https://social.socialtizemg.com/api/oauth/linkedin/callback
TIKTOK_REDIRECT_URI=https://social.socialtizemg.com/api/oauth/tiktok/callback
GOOGLE_REDIRECT_URI=https://social.socialtizemg.com/api/oauth/google/callback
```

OAuth state is HMAC-signed with `AUTH_SECRET`, provider-bound, and expires after ten minutes.

## Account registry API

```text
GET /api/accounts
POST /api/accounts
DELETE /api/accounts?id=<account-id>
```

Manual account registration stores identity metadata only; it does not store a social-media password.

## Existing content workflow

Social Hub also includes Content Lab, campaigns, calendar, library, scheduling, queue management, comment engagement, and platform publishing routes. Brand assignment remains available for existing content workflows, but new social-account onboarding no longer requires a brand.

## Seed initial data

```text
POST http://localhost:3000/api/seed
```

## Pre-load SnapRegister comment opportunities

```text
POST http://localhost:3000/api/comments/pre-load
Body: { "brandId": "<brand-id>" }
```

## AI integrations

AI providers are managed from `/ai-integrations`. Social Hub currently supports Gemini, Anthropic, OpenAI, Ollama, and Runware configuration. Provider credentials can be stored encrypted in Supabase, with Vercel environment variables retained as server-only fallbacks. A default text provider can be selected and each provider can be tested from the UI.

The default Gemini model is currently `gemini-3.5-flash-lite` using the Gemini Interactions API.

## AI reply generation

1. Navigate to Comments and open an opportunity.
2. Generate a reply.
3. Review/edit the draft and risk classification.
4. Approve the reply.
5. Post directly for supported owned channels, or copy it for manual posting where required.

## Architecture

```text
src/
  app/
    (dashboard)/
      accounts/           # Account inventory and provider connection entry points
      comments/
      brands/
      campaigns/
      schedule/
      queue/
    api/
      accounts/
      comments/
      brands/
      campaigns/
      health/
      oauth/
      publish/
      schedule/
  lib/
    ai/
    comments/
    social/
    social-accounts.ts    # Account registry + provider connection data layer
    db.ts                 # Supabase-backed server database adapter
supabase/
  migrations/             # Source-controlled Social Hub schema changes
```