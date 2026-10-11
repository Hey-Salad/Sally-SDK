# Worker authentication

The Sally Worker fails closed. A request is authenticated only when it carries a Cloudflare Access JWT that this Worker can verify. There is no anonymous user, and the old `REQUIRE_ACCESS_AUTH=false` setting does nothing.

## What Peter must set before deploying

Set these with Wrangler. Do not commit them.

```bash
pnpm --dir apps/worker exec wrangler secret put OPENAI_API_KEY
pnpm --dir apps/worker exec wrangler secret put CF_ACCESS_TEAM_DOMAIN
pnpm --dir apps/worker exec wrangler secret put CF_ACCESS_AUD
```

`CF_ACCESS_TEAM_DOMAIN` is the Access team host, for example `heysalad.cloudflareaccess.com`, with no `https://`. `CF_ACCESS_AUD` is the Access application audience tag (AUD).

In the Cloudflare dashboard, confirm the deployed Worker vars are:

- `SALLY_ENV` = `production`
- `ALLOWED_ORIGINS` = the browser origins that may call the API, comma-separated, no wildcard. The committed default is `https://heysalad-sally-dashboard.pages.dev`. Add any other dashboard origin before relying on it.
- `ALLOW_INSECURE_LOCAL_DEV` is unset

`SALLY_ENV=production` forces authentication even if `ALLOW_INSECURE_LOCAL_DEV=true` is also present. Do not change `SALLY_ENV` to `development` on the deployed Worker.

Create a Cloudflare Access application in front of `api-sally-sdk.heysalad.app`. The Worker checks the JWT itself, so the same secrets are required for the `workers.dev` hostname. Add a rate limiting rule for `POST /chat` and `POST /recipes/extract`.

The first owner cannot be created through `POST /users`. Insert that row in D1, using the person's Access email:

```sql
INSERT INTO users (id, email, name, team_id, role, created_at)
VALUES ('user_owner', 'peter@heysalad.io', 'Peter', NULL, 'owner', 0);
```

Further owner and admin rows are also assigned in D1. `POST /users` can create `developer` and `viewer` users, and only for an existing owner or admin.

`OPENAI_BASE_URL` and `OPENAI_MODEL` stay optional. The key must be a secret.

## Sally Mac app

The native app is not subject to CORS. It must send a Cloudflare Access JWT on every user-plane request. `SallyClient` already does this when it is constructed with the token:

```ts
const sally = new SallyClient("https://api-sally-sdk.heysalad.app", accessJwt);
```

If the app currently constructs the client with only the base URL, chat, recipe extraction, and computer control will return 401 until the JWT is passed in. Store that JWT the same way `sally auth login --token <jwt>` does. Obtain it from the Access login for this application (`cloudflared access token --app https://api-sally-sdk.heysalad.app` once the Access app exists).

These routes require that user JWT:

- `POST /chat`
- `POST /recipes/extract` and saved-recipe reads and writes
- sessions, shopping lists, test runs, devices, and teams
- `POST /computers/pairing-sessions` and `POST /computers/pairing-sessions/claim`
- `POST /computers/agents`, `GET /computers/agents`, command submit, revoke, and audit logs

`SallyClient` can keep sending `userId`. The Worker ignores it and stores the Access email (lowercased), or the JWT `sub` when the token has no email. A read for a different user returns 403 unless that email is an owner or admin in D1. Device registration and team creation require that owner or admin row: the host agent JWT has to belong to one of those people, because a device record includes `tunnelUrl` and `agentHost`. Owners and admins can list every session, run, and team. A developer or viewer only sees their own records, and devices only for their own team.

The paired agent on the Mac does not use that JWT for its own channel. These routes stay on the device signature and the agent session headers (`X-Sally-Agent-Id`, `X-Sally-Agent-Session`):

- `POST /computers/link/connect`
- `GET /computers/link/commands`
- `POST /computers/link/commands/:commandId/result`

There is no shared anonymous computer user. Pairing and command submission run as the lowercased email on the Access JWT (or the JWT `sub` when email is absent).

`GET /` and `GET /health` stay open for probes.

## CLI and host agent in this repo

- `sally pair` refuses to run without a saved Access JWT.
- `sally device start` forwards that JWT to the host agent as `SALLY_ACCESS_TOKEN`. The agent sends it as `Authorization: Bearer` on device registration. That email has to be an owner or admin in D1, or `POST /devices` returns 403. Set the same variable when the agent is launched some other way.
- `sally auth login --token <jwt>` is still how a person stores the token. The CLI does not perform an interactive Access login.

## Dashboard

Browser calls send `credentials: "include"`, and the Worker reflects only origins listed in `ALLOWED_ORIGINS`. The invite form can create developers and viewers. It cannot create owners or admins.

The Pages dashboard and the API are on different sites. After Access is enabled, a person has to pass the Access login for `api-sally-sdk.heysalad.app` before those credentialed browser calls succeed. Static generation of the device page already ignores Worker errors at build time.

## Local development

Copy `apps/worker/.dev.vars.example` to `apps/worker/.dev.vars`. That file is gitignored and is not uploaded by `wrangler deploy`. It sets `SALLY_ENV=development` and `ALLOW_INSECURE_LOCAL_DEV=true`, which skips the Access JWT check in middleware. Record routes, chat, recipe extraction, user administration, and computer control still require a verified JWT on the request. The local flag does not open devices, sessions, shopping, recipes, runs, or teams.

Recipe extraction allows only global addresses. IPv4 documentation, benchmarking, private, loopback, link-local, and CGNAT ranges are refused. IPv6 is allowed only inside `2000::/3`, and Teredo, 6to4, documentation, benchmarking, and ORCHID prefixes inside that block are refused too. That covers IPv4-compatible addresses such as `[::a9fe:a9fe]`, local NAT64 `64:ff9b:1::/48`, and site-local `fec0::/10` without unwrapping them. Hostnames on `heysalad.app` and `workers.dev` are refused before any fetch. Other hostnames are checked with DNS-over-HTTPS at `https://cloudflare-dns.com/dns-query`. That lookup is not the address the Worker later connects to: Workers will not let us pin the socket to the answer, so a name can still rebind to a private address between the check and the connection. `compatibility_flags` includes `global_fetch_strictly_public`, which stops a same-zone name from being routed straight at the zone origin. Redirects are not followed. The page body is capped at 256 KiB and the fetch times out after 8 seconds.
