# SMG Social Hub

Multi-brand social media management: schedule posts + AI-assisted comment engagement.

## Database architecture

SMG Social Hub uses the same Supabase project as the main Socialtize Marketing Group website.

- **Database:** Supabase (`SMG Agency Website` project)
- **Application query layer:** `@supabase/supabase-js`, server-side only
- **Isolation boundary:** Social Hub owns only tables prefixed with `social_hub_`
- **RLS:** enabled on every `social_hub_*` table
- **Server access:** a Supabase server secret/service-role credential is required because `anon` and `authenticated` do not have direct table privileges

Current Social Hub tables:

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
4. Add the remaining authentication, encryption, AI, and OAuth variables you need.
5. Run `npm install`.
6. Run `npm run dev`.

> Never commit `.env`, `.env.local`, database credentials, OAuth secrets, or API keys. Vercel production secrets belong in Project Settings → Environment Variables.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL, e.g. `https://PROJECT_REF.supabase.co` |
| `SUPABASE_SECRET_KEY` | Yes | Server-only Supabase secret key used for Social Hub database access |
| `SUPABASE_SERVICE_ROLE_KEY` | Fallback | Legacy server/service-role key name supported when `SUPABASE_SECRET_KEY` is not set |
| `ANTHROPIC_API_KEY` | Yes for AI | Anthropic API key for AI generation/reply workflows |
| `TOKEN_ENCRYPTION_KEY` | Yes | 32-character secret used for token encryption |
| `AUTH_SECRET` | Yes | Random secret used to sign the operator session cookie |
| `APP_PASSWORD` | Yes | Shared operator login password |
| `CRON_SECRET` | Yes | Secret required by the cron endpoint |
| `FACEBOOK_APP_ID` | Optional | Facebook OAuth App ID |
| `FACEBOOK_APP_SECRET` | Optional | Facebook OAuth App Secret |
| `FACEBOOK_REDIRECT_URI` | Optional | Production Facebook OAuth callback |
| `ARCADE_API_KEY` | Optional | Arcade API key for supported social integrations |
| `ARCADE_BASE_URL` | Optional | Arcade API base URL |
| `LINKEDIN_CLIENT_ID` | Optional | LinkedIn client ID |
| `LINKEDIN_CLIENT_SECRET` | Optional | LinkedIn client secret |
| `LINKEDIN_REDIRECT_URI` | Optional | LinkedIn OAuth callback |
| `TIKTOK_CLIENT_KEY` | Optional | TikTok client key |
| `TIKTOK_CLIENT_SECRET` | Optional | TikTok client secret |
| `TIKTOK_REDIRECT_URI` | Optional | TikTok OAuth callback |
| `GOOGLE_CLIENT_ID` | Optional | Google/YouTube OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Optional | Google/YouTube OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Optional | Google OAuth callback |
| `NEXT_PUBLIC_APP_URL` | Yes in production | Public application URL |
| `NEXT_PUBLIC_BASE_URL` | Yes in production | Public base URL used by callbacks |

### Production Supabase format

```text
SUPABASE_URL=https://kicfnilhwenaditbgcxh.supabase.co
SUPABASE_SECRET_KEY=<server-only-secret>
```

Do not prefix the server secret with `NEXT_PUBLIC_` and do not expose it to browser code.

### Production URLs

```text
NEXT_PUBLIC_APP_URL=https://social.socialtizemg.com
NEXT_PUBLIC_BASE_URL=https://social.socialtizemg.com
FACEBOOK_REDIRECT_URI=https://social.socialtizemg.com/api/oauth/facebook/callback
LINKEDIN_REDIRECT_URI=https://social.socialtizemg.com/api/oauth/linkedin/callback
TIKTOK_REDIRECT_URI=https://social.socialtizemg.com/api/oauth/tiktok/callback
GOOGLE_REDIRECT_URI=https://social.socialtizemg.com/api/oauth/google/callback
```

## Seed initial data

```text
POST http://localhost:3000/api/seed
```

## Pre-load SnapRegister comment opportunities

```text
POST http://localhost:3000/api/comments/pre-load
Body: { "brandId": "<brand-id>" }
```

## Platforms

| Platform | Post | Read Comments | Reply |
|----------|------|---------------|-------|
| Facebook Pages | Yes — Graph API | Yes | Yes — Owned pages |
| Instagram Business | Yes — Graph API | Yes | Yes — Owned |
| Twitter/X | Yes — Arcade | Yes — Arcade | Yes — Arcade |
| LinkedIn | Yes — Direct API | Yes | Yes |
| TikTok | Yes — Content API | Yes — Research API | Limited |
| YouTube | File upload only | Yes — Data API | Yes |
| Reddit | Yes — Arcade | Yes — Public API | Yes — Arcade |

## AI Reply Generation

Powered by `claude-haiku-4-5-20251001`.

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
      comments/
      brands/
      campaigns/
      schedule/
      queue/
    api/
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
    db.ts                 # Supabase-backed server database adapter
```
