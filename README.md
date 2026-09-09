# SMG Social Hub

Multi-brand social media management: schedule posts + AI-assisted comment engagement.

## Database architecture

SMG Social Hub does **not** have a separate database server. It uses the same Supabase/Postgres project as the main Socialtize Marketing Group website.

- **Database host:** Supabase Postgres (`SMG Agency Website` project)
- **ORM / query layer:** Prisma
- **Isolation boundary:** Social Hub owns only tables prefixed with `social_hub_`
- **Public Data API:** disabled at the table-permission level for Social Hub tables (`anon` and `authenticated` have no table privileges)
- **RLS:** enabled on every `social_hub_*` table as defense in depth

Prisma is the application ORM and schema definition layer; Supabase/Postgres is the actual database.

Current Social Hub tables:

- `social_hub_brands`
- `social_hub_platform_connections`
- `social_hub_scheduled_posts`
- `social_hub_comment_opportunities`
- `social_hub_comment_drafts`
- `social_hub_campaigns`
- `social_hub_content_pieces`
- `social_hub_generated_content`

The Social Hub database was reset to a clean baseline on September 9, 2026. The source baseline is `prisma/migrations/20260909_initial_social_hub/migration.sql`.

> Never reset or drop the entire Supabase project. Database resets for this app must be scoped only to `social_hub_*` tables because the project is shared with SocialtizeMG.com.

## Setup

1. Copy `.env.example` to `.env.local` and fill in your credentials.
2. Configure Supabase Postgres connection strings:
   - `DATABASE_URL`: Supavisor transaction-pooler URL for app/serverless runtime traffic.
   - `DIRECT_URL`: direct Postgres URL for Prisma migrations and introspection.
3. `npm install`
4. `npx prisma generate`
5. For local schema iteration, use `npm run db:push` only against the intended Social Hub database/project.
6. `npm run dev`

> Never commit `.env`, `.env.local`, database passwords, OAuth secrets, or API keys. Vercel production secrets belong in Project Settings → Environment Variables.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Supabase Postgres runtime connection. For Vercel/serverless use the Supavisor transaction pooler (typically port `6543`) with Prisma pooler parameters such as `pgbouncer=true&connection_limit=1`. |
| `DIRECT_URL` | Yes | Direct Supabase Postgres connection (typically `db.<project-ref>.supabase.co:5432`) used by Prisma for migrations/introspection. |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for AI reply generation |
| `TOKEN_ENCRYPTION_KEY` | Yes | Secret used for AES-256 token encryption |
| `AUTH_SECRET` | Yes | Random 32+ byte secret used to sign the operator session cookie |
| `APP_PASSWORD` | Yes | The single shared operator login password |
| `CRON_SECRET` | Yes | Shared secret required to call `POST /api/cron` (external scheduler) |
| `FACEBOOK_APP_ID` | Optional | Facebook OAuth App ID |
| `FACEBOOK_APP_SECRET` | Optional | Facebook OAuth App Secret |
| `INSTAGRAM_APP_ID` | Optional | Instagram Business App ID |
| `INSTAGRAM_APP_SECRET` | Optional | Instagram App Secret |
| `TWITTER_CLIENT_ID` | Optional | Twitter OAuth 2.0 Client ID |
| `TWITTER_CLIENT_SECRET` | Optional | Twitter OAuth 2.0 Client Secret |
| `LINKEDIN_CLIENT_ID` | Optional | LinkedIn App Client ID |
| `LINKEDIN_CLIENT_SECRET` | Optional | LinkedIn App Client Secret |
| `TIKTOK_CLIENT_KEY` | Optional | TikTok Content API Client Key |
| `TIKTOK_CLIENT_SECRET` | Optional | TikTok App Client Secret |
| `YOUTUBE_CLIENT_ID` | Optional | YouTube (Google) OAuth Client ID |
| `YOUTUBE_CLIENT_SECRET` | Optional | YouTube OAuth Client Secret |
| `REDDIT_CLIENT_ID` | Optional | Reddit App Client ID |
| `REDDIT_CLIENT_SECRET` | Optional | Reddit App Client Secret |
| `ARCADE_API_KEY` | Optional | Arcade API key for Twitter/Reddit posting |
| `ARCADE_USER_ID` | Optional | Arcade user ID |
| `NEXT_PUBLIC_BASE_URL` | Optional | Public base URL for OAuth callbacks |

### Supabase connection format

Use placeholders locally and retrieve the actual values from the Supabase project's **Connect** panel. Do not paste real credentials into source control.

```text
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
```

For production on Vercel, make sure both variables target **Production**. Preview values should be configured separately if preview deployments need database access.

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

Powered by `claude-haiku-4-5-20251001` (fast and cost-efficient).

### How it works

1. Navigate to Comments > click any opportunity.
2. Click **Generate Reply** on the detail page.
3. The system loads brand voice/context, sends the relevant discussion context to Claude, runs risk checks, and saves the draft.
4. Review and edit the reply.
5. Click **Approve Reply**.
6. For owned channels, click **Post Reply**.
7. For external channels, copy the approved reply and post manually.

### Risk Levels

- **LOW**: Safe to post with standard review
- **MEDIUM**: Contains sensitive product/complaint language — review carefully
- **HIGH**: Contains legal threat, refund demand, or fraud accusation — always escalate to human, do not post AI draft as-is

## Brand Voice & Context

Each brand has:

- **Voice**: tone, personality, list of things to avoid, optional CTA hint
- **Context**: products/services, target audience, key messages, FAQs

Edit these at `/brands` in the dashboard. The AI system prompt is built from this data at reply-generation time.

## Architecture

```text
src/
  app/
    (dashboard)/
      comments/           # Comment list + detail/approval pages
        [id]/page.tsx     # AI reply workflow (generate → review → approve → post)
      brands/             # Brand voice & context editor
    api/
      comments/
        route.ts          # List + create opportunities
        [id]/
          route.ts        # GET single (includes brand voice/context)
          generate-reply/ # POST → Claude AI → save draft
          approve/        # POST → mark approved
          post/           # POST → publish to platform
          skip/           # POST → mark skipped
      brands/
        route.ts          # List + create brands
        [id]/route.ts     # GET + PATCH + DELETE brand
  lib/
    ai/
      reply-generator.ts  # Anthropic SDK integration
      risk-filter.ts      # Keyword-based risk assessment
    brands.ts             # Brand parsing utilities
    db.ts                 # Prisma client singleton
```
