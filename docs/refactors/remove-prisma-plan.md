# Remove Prisma Refactor

Goal: remove Prisma from the Social Hub runtime and use Supabase directly while preserving the existing `social_hub_*` tables.

## Scope
- Replace `@prisma/client` runtime access with a server-only Supabase client.
- Remove Prisma schema/migrations and Prisma dependencies/scripts.
- Convert all Prisma reads/writes to Supabase queries.
- Keep existing table names and data intact.
- Update env documentation to use Supabase project URL + secret key instead of `DATABASE_URL`/`DIRECT_URL`.
- Verify production health endpoint and dashboard queries after deploy.
