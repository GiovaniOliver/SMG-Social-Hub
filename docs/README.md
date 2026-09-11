# SMG Social Hub Documentation

Use this directory as the source of truth for implementation planning, current status, production setup, and specialized integration notes.

## Start here

### [DEVELOPMENT_STATUS.md](./DEVELOPMENT_STATUS.md)

The living project tracker. It contains:

- current development phase,
- completed milestones,
- production-hardening status,
- social-provider matrix,
- AI integration status,
- mobile/responsive status,
- immediate task sequence,
- deferred UGC / AI-influencer roadmap.

Update this document whenever meaningful implementation state changes.

## Production and architecture

### [DEPLOYMENT.md](./DEPLOYMENT.md)

Production deployment, Vercel, environment, and operational notes.

### [SOCIAL_HUB_GAP_MAP.md](./SOCIAL_HUB_GAP_MAP.md)

Broader feature-gap map and implementation planning reference.

## Social account system

### [account-registry-plan.md](./account-registry-plan.md)

Account-first social identity architecture and registry design.

### [arcade-account-connections.md](./arcade-account-connections.md)

X and Reddit account authorization/publishing implementation through Arcade.

### [arcade-current-api-note.md](./arcade-current-api-note.md)

Arcade API migration/current API notes.

### [arcade-testing-checklist.md](./arcade-testing-checklist.md)

Focused X/Reddit verification checklist.

## Historical / focused work

### `refactors/`

Focused refactor documentation.

### `superpowers/`

Older implementation/planning artifacts. Treat **DEVELOPMENT_STATUS.md** as the current status source when there is a conflict.

## Documentation convention

- **README.md at repository root:** high-level product/architecture onboarding.
- **DEVELOPMENT_STATUS.md:** current state and next-task source of truth.
- **Specialized docs:** detailed implementation notes for one subsystem.
- **Supabase migrations:** schema history and deployable database changes.

Avoid creating duplicate progress trackers. Update the living tracker instead.
