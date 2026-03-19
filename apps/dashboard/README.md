# @heysalad/sally-dashboard

The Sally dashboard is the HeySalad web surface for device visibility, live streams, team roles, and audit history.

## What ships now

- live device status at a glance
- quick handoff into stream sessions
- clear team and permission management
- simple audit visibility for support and debugging

## Deployment model

- Next.js static export via `next build`
- Cloudflare Pages direct upload from `out/`
- Runtime data fetched from the deployed Sally Worker

## Commands

```bash
pnpm build
pnpm test
pnpm typecheck
wrangler pages deploy out --project-name heysalad-sally-dashboard
```

## Current notes

- The dashboard is designed around the live Worker URL and the current quick-tunnel device bridge.
- Team invites are create-first for now: choose a role when creating the user record.
- The audit view reads Worker session history plus current device state.
