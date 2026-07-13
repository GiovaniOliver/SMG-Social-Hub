# SMG Social Hub

Multi-brand social media management: schedule posts + AI-assisted comment engagement.

## Setup

1. Copy `.env.example` to `.env.local` and fill in your credentials
2. `npm install`
3. `npx prisma db push`
4. `npx prisma generate`
5. `npm run dev`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | SQLite path, e.g. `file:./dev.db` |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for AI reply generation |
| `TOKEN_ENCRYPTION_KEY` | Yes | 32-char hex string for AES-256 token encryption |
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

## Seed initial data

```
POST http://localhost:3000/api/seed
```

## Pre-load SnapRegister comment opportunities

```
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

1. Navigate to Comments > click any opportunity
2. Click "Generate Reply" on the detail page
3. The system:
   - Loads the brand voice and context from the database
   - Sends the comment, post content, and brand context to Claude
   - Runs a risk assessment on keywords in the comment and draft
   - Saves the draft to the database
4. You review and edit the reply in the textarea
5. Click "Approve Reply"
6. For owned channels: click "Post Reply" to publish
7. For external channels: click "Copy to Clipboard", paste it manually

### Risk Levels

- **LOW**: Safe to post with standard review
- **MEDIUM**: Contains sensitive product/complaint language — review carefully
- **HIGH**: Contains legal threat, refund demand, or fraud accusation — always escalate to human, do not post AI draft as-is

## Comment Engagement Rules (SnapRegister)

- Start with the problem they're having
- Give a 2-4 step answer
- Never drop product link in first comment
- Only mention SnapRegister if asked about organization tools
- Flag and escalate any legal or refund-related comments

## Brand Voice & Context

Each brand has:
- **Voice**: tone, personality, list of things to avoid, optional CTA hint
- **Context**: products/services, target audience, key messages, FAQs

Edit these at `/brands` in the dashboard. The AI system prompt is built from this data at reply-generation time.

## Architecture

```
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
  components/
    platform-badge.tsx    # Colored platform pill
    copy-to-clipboard.tsx # Clipboard button with feedback
    risk-badge.tsx        # LOW/MEDIUM/HIGH risk indicator
```
