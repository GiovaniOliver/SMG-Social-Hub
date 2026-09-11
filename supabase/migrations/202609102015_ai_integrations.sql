create table if not exists public.social_hub_ai_integrations (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique,
  category text not null default 'llm',
  api_key_encrypted text,
  base_url text,
  default_model text,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.social_hub_ai_integrations enable row level security;

revoke all on table public.social_hub_ai_integrations from anon, authenticated;
