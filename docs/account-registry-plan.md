# Account-First Social Connection Plan

Status: account registry foundation complete; provider connection rollout in progress

## Goal

Connect and inventory existing social media identities before assigning them to brands, creators, or UGC personas.

## Phase 1 — account registry foundation

- Decouple provider/OAuth connections from required brand ownership.
- Add a central `social_hub_accounts` registry for discovered or manually managed social identities.
- Preserve encrypted provider credentials in `social_hub_platform_connections`.
- Add `/accounts` as the primary account-management surface.
- Track connection health and publishing capability independently from brand assignment.
- Keep provider identities that cannot be published to through an API manageable as manual accounts.

## Data model

### Provider connection

`social_hub_platform_connections`

Stores encrypted OAuth/provider credentials and provider-level connection metadata. `brandId` is optional during the account-first transition.

For X and Reddit, provider OAuth tokens are managed by Arcade rather than copied into Social Hub. The Social Hub provider connection stores an encrypted `ARCADE_MANAGED` marker plus the Arcade user identity used to address that authorization.

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

## Provider rollout

1. **Meta — complete:** import every accessible Page and linked Instagram professional account instead of keeping only the first Page.
2. **Google/YouTube — complete:** connect without a brand and register the returned channel identity.
3. **LinkedIn — complete:** connect a member publishing identity without requiring a brand.
4. **TikTok — complete:** connect and register the returned identity without requiring a brand.
5. **X / Twitter — implementation complete, authorization verification pending:** Arcade OAuth 2.0 authorization, `X.WhoAmI` identity discovery, account registry persistence, and `X.PostTweet` publishing adapter.
6. **Reddit — implementation complete, authorization verification pending:** Arcade OAuth authorization, `Reddit.GetMyUsername` identity discovery, account registry persistence, and `Reddit.SubmitTextPost` publishing adapter.
7. **Brand/creator assignments — deferred:** accounts are inventoried and verified first; assignment and multi-account publishing selection are a later phase.

## X / Reddit authorization model

Each time an operator selects **Connect X** or **Connect Reddit**, Social Hub creates a unique Arcade user identity for that account connection. The Arcade identity is bound into the HMAC-signed OAuth state. After provider authorization:

1. Arcade redirects back to the matching Social Hub callback.
2. Social Hub verifies the signed state and bound Arcade identity.
3. Social Hub calls the provider identity tool (`X.WhoAmI` or `Reddit.GetMyUsername`).
4. The discovered account is upserted into `social_hub_accounts`.
5. Social Hub stores the Arcade user ID as the provider connection `accountId`.
6. Future Arcade tool calls use that stored ID so publishing targets the same authorized account.

This design supports connecting multiple X and Reddit accounts without Social Hub storing the providers' raw OAuth access or refresh tokens.
