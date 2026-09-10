# Account-First Social Connection Plan

Status: implementation in progress

## Goal

Connect and inventory existing social media identities before assigning them to brands, creators, or UGC personas.

## Phase 1

- Decouple provider/OAuth connections from required brand ownership.
- Add a central `social_hub_accounts` registry for discovered or manually managed social identities.
- Preserve encrypted provider credentials in `social_hub_platform_connections`.
- Add `/accounts` as the primary account-management surface.
- Track connection health and publishing capability independently from brand assignment.
- Keep provider identities that cannot be published to through an API manageable as manual accounts.

## Data model

### Provider connection

`social_hub_platform_connections`

Stores encrypted OAuth/provider credentials and provider-level connection metadata. `brandId` becomes optional during the account-first transition.

### Social account

`social_hub_accounts`

Stores an individual publishing identity discovered from or associated with a provider connection.

Fields:
- `id`
- `providerConnectionId` (optional)
- `platform`
- `accountType`
- `externalAccountId` (optional for manually managed identities)
- `displayName`
- `handle`
- `profileUrl`
- `avatarUrl`
- `publishingCapability`
- `connectionStatus`
- `metadata`
- `isActive`
- `lastVerifiedAt`
- `createdAt`
- `updatedAt`

## Publishing capability values

- `AUTOMATIC` — platform API can publish from Social Hub.
- `MANUAL` — identity is managed in Social Hub but posting must be completed manually.
- `READ_ONLY` — API visibility exists but publishing is not available.
- `UNSUPPORTED` — identity is recorded but provider/API publishing support is unavailable.

## Rollout

1. Database foundation and `/accounts` inventory UI.
2. Meta: import every accessible Page and linked Instagram professional account instead of keeping only the first Page.
3. Google/YouTube, LinkedIn, and TikTok: connect without a brand and register the returned identity.
4. X/Reddit: registry support first; provider automation remains separate until their current integration is audited.
5. Brand/creator assignments come later, after the account inventory is connected and verified.
