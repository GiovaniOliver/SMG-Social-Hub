# Deployment Notes

SMG Social Hub is deployed to Vercel and uses Supabase Postgres through Prisma.

## Production deployment source

Production deployments should come from the GitHub `main` branch. Avoid deploying from a dirty local working tree because local-only files can make the deployed runtime differ from the source-controlled state.

## Required database environment variables

Configure these in Vercel Project Settings → Environment Variables for the Production environment:

- `DATABASE_URL`: Supabase Supavisor transaction-pooler URL for runtime/serverless traffic.
- `DIRECT_URL`: direct Supabase Postgres URL for Prisma migrations and introspection.

Example shapes only — never commit real credentials:

```text
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
```

## Verification after a production merge

1. Confirm Vercel created a deployment from the expected GitHub commit.
2. Confirm `social.socialtizemg.com` points to the new production deployment.
3. Check runtime logs for Prisma connection/authentication errors.
4. Load the dashboard and verify database-backed pages render.
5. Verify Brands, Create, Library, Campaigns, Calendar, Schedule, Queue, Comments, and publishing workflows.

## Security

Do not commit `.env`, `.env.local`, database passwords, OAuth secrets, token-encryption secrets, or API keys. These files are ignored by `.gitignore` and should remain local or in Vercel environment settings.
