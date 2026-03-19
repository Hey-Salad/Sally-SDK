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

The Worker already includes JWT verification middleware using:

- `CF_ACCESS_TEAM_DOMAIN`
- `CF_ACCESS_AUD`
- `REQUIRE_ACCESS_AUTH`

Current live state:

- `REQUIRE_ACCESS_AUTH=false`

That keeps local development and the current dashboard simple.

When you are ready to lock the API down:

1. create a Cloudflare Access application for the Worker
2. set `CF_ACCESS_TEAM_DOMAIN`
3. set `CF_ACCESS_AUD`
4. set `REQUIRE_ACCESS_AUTH=true`
5. update CLI users to save a valid Access token

## Recommended Team Rollout

```text
1. create the team record
2. create owner and admin users
3. start one agent machine and validate a live device
4. share the dashboard URL internally
5. enable Access once the team is comfortable with the flow
```

## Known Limitations

- User invites are not email-driven yet.
- Permissions exist in the database schema, but the current Worker routes do not expose a permission management API yet.
- Dashboard auth is expected to be enforced at the Cloudflare layer when Access is turned on, not through an in-app login screen.
