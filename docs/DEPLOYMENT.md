# Deployment Notes

SMG Social Hub is deployed to Vercel and uses the shared SMG Supabase project through the server-side Supabase client.

## Production deployment source

Production deployments should come from the GitHub `main` branch. Avoid deploying from a dirty local working tree because local-only files can make the deployed runtime differ from the source-controlled state.

## Required database environment variables

Configure these in Vercel Project Settings → Environment Variables for Production:

```text
SUPABASE_URL=https://kicfnilhwenaditbgcxh.supabase.co
SUPABASE_SECRET_KEY=<server-only-secret>
```

`SUPABASE_SERVICE_ROLE_KEY` is accepted as a legacy fallback if the project still uses that key name. Do not use an anon/publishable key for server database access because the `social_hub_*` tables are restricted to server/service-role access.

`DATABASE_URL` and `DIRECT_URL` are not used by Social Hub after the Supabase-client migration.

## Production application URLs

```text
NEXT_PUBLIC_APP_URL=https://social.socialtizemg.com
NEXT_PUBLIC_BASE_URL=https://social.socialtizemg.com
FACEBOOK_REDIRECT_URI=https://social.socialtizemg.com/api/oauth/facebook/callback
LINKEDIN_REDIRECT_URI=https://social.socialtizemg.com/api/oauth/linkedin/callback
TIKTOK_REDIRECT_URI=https://social.socialtizemg.com/api/oauth/tiktok/callback
GOOGLE_REDIRECT_URI=https://social.socialtizemg.com/api/oauth/google/callback
```

## Verification after a production merge

1. Confirm Vercel created a deployment from the expected GitHub `main` commit.
2. Confirm `social.socialtizemg.com` points to the new production deployment.
3. Call `/api/health` and confirm the database status is `ok`.
4. Load the dashboard and verify database-backed pages render.
5. Verify Brands, Create, Library, Campaigns, Calendar, Schedule, Queue, Comments, and publishing workflows.
6. Review Vercel runtime logs for Supabase API/authentication errors.

## Security

Never commit `.env`, `.env.local`, Supabase server secrets, OAuth secrets, token-encryption secrets, or API keys. A Supabase server secret must never use a `NEXT_PUBLIC_` variable name.
