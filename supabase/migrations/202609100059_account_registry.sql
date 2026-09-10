alter table public.social_hub_platform_connections
  alter column "brandId" drop not null;

create unique index if not exists social_hub_platform_connections_unassigned_identity_key
  on public.social_hub_platform_connections(platform, "accountId")
  where "brandId" is null;

create table if not exists public.social_hub_accounts (
  id text primary key,
  "providerConnectionId" text null,
  platform text not null,
  "accountType" text not null default 'PROFILE',
  "externalAccountId" text null,
  "displayName" text not null,
  handle text null,
  "profileUrl" text null,
  "avatarUrl" text null,
  "publishingCapability" text not null default 'MANUAL',
  "connectionStatus" text not null default 'CONNECTED',
  metadata jsonb not null default '{}'::jsonb,
  "isActive" boolean not null default true,
  "lastVerifiedAt" timestamptz null,
  "createdAt" timestamptz not null default current_timestamp,
  "updatedAt" timestamptz not null default current_timestamp,
  constraint social_hub_accounts_provider_connection_fkey
    foreign key ("providerConnectionId")
    references public.social_hub_platform_connections(id)
    on update cascade
    on delete set null,
  constraint social_hub_accounts_publishing_capability_check
    check ("publishingCapability" in ('AUTOMATIC','MANUAL','READ_ONLY','UNSUPPORTED')),
  constraint social_hub_accounts_connection_status_check
    check ("connectionStatus" in ('CONNECTED','NEEDS_REAUTH','DISCONNECTED','ERROR'))
);

create unique index if not exists social_hub_accounts_platform_external_id_key
  on public.social_hub_accounts(platform, "externalAccountId")
  where "externalAccountId" is not null;

create index if not exists social_hub_accounts_provider_connection_idx
  on public.social_hub_accounts("providerConnectionId");

create index if not exists social_hub_accounts_platform_idx
  on public.social_hub_accounts(platform);

alter table public.social_hub_accounts enable row level security;

revoke all on table public.social_hub_accounts from anon, authenticated;
grant select, insert, update, delete on table public.social_hub_accounts to service_role;
