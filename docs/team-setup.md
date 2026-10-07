# Team Setup

Use this guide when you want to provision the Sally control plane for a team, wire the dashboard, and prepare Cloudflare Access for stricter auth later.

## Live Team Surfaces

- Worker API: `https://heysalad-sally-worker.heysalad-o.workers.dev`
- Dashboard: `https://heysalad-sally-dashboard.pages.dev`

## Team Model

Sally stores:

- teams
- users
- devices
- sessions
- permissions

Current role set:

- `owner`
- `admin`
- `developer`
- `viewer`

## Control Plane Diagram

```text
Cloudflare Pages dashboard
          |
          v
Cloudflare Worker API
          |
          v
        D1
   +------+------+------+------+
   | teams | users | devices | sessions |
   +------+------+------+------+
```

## Create a Team

```bash
curl -X POST https://heysalad-sally-worker.heysalad-o.workers.dev/teams \
  -H 'content-type: application/json' \
  -d '{
    "name": "HeySalad",
    "slug": "heysalad"
  }'
```

## Create a User

```bash
curl -X POST https://heysalad-sally-worker.heysalad-o.workers.dev/users \
  -H 'content-type: application/json' \
  -d '{
    "email": "peter@heysalad.io",
    "name": "Peter",
    "role": "owner"
  }'
```

If you already know the team id, include it:

```json
{
  "email": "peter@heysalad.io",
  "name": "Peter",
  "role": "owner",
  "teamId": "<team-id>"
}
```

## Use the Dashboard

Open:

- `https://heysalad-sally-dashboard.pages.dev`

Current team-management behavior:

- create-first user workflow
- role selection at creation time
- no full invite email workflow yet

## Configure CLI Identity

For local CLI use, store the Worker URL and optional token:

```bash
node packages/cli/dist/index.js auth login \
  --api-base-url https://heysalad-sally-worker.heysalad-o.workers.dev \
  --team-slug heysalad
```

If you have a Cloudflare Access JWT:

```bash
node packages/cli/dist/index.js auth login \
  --api-base-url https://heysalad-sally-worker.heysalad-o.workers.dev \
  --team-slug heysalad \
  --token <jwt>
```

Check the current identity:

```bash
node packages/cli/dist/index.js auth whoami
```

## Cloudflare Access

The Worker requires a Cloudflare Access JWT. `REQUIRE_ACCESS_AUTH` is ignored. The deployed config sets `SALLY_ENV=production`, which cannot be turned off by a local dev flag.

See [worker-auth.md](./worker-auth.md) for the secrets, the D1 owner bootstrap, allowed browser origins, and the Sally Mac client change.

Local `wrangler dev` can opt out for ordinary device routes by copying `apps/worker/.dev.vars.example` to `.dev.vars`. That file is not deployed. Chat, recipe extraction, user administration, and computer control still require a JWT.

## Recommended Team Rollout

```text
1. create the owner in D1 (POST /users cannot mint owner or admin)
2. create the team record
3. start one agent machine and validate a live device
4. share the dashboard URL internally
```

## Known Limitations

- User invites are not email-driven yet.
- Permissions exist in the database schema, but the current Worker routes do not expose a permission management API yet.
- Dashboard auth is expected to be enforced at the Cloudflare layer when Access is turned on, not through an in-app login screen.
