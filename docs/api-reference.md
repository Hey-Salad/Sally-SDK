# API Reference

This reference documents the live Worker routes, the local CLI contract, and the key environment variables that matter when you are wiring Sally into a host machine.

## Base URLs

- Worker: `https://heysalad-sally-worker.heysalad-o.workers.dev`
- Dashboard: `https://heysalad-sally-dashboard.pages.dev`

## Worker API

### `GET /`

Health-style check.

Response:

```json
{
  "service": "sally-worker",
  "status": "ok"
}
```

### `GET /devices`

List devices. Optional query params:

- `status`
- `teamId`

Example:

```bash
curl 'https://heysalad-sally-worker.heysalad-o.workers.dev/devices?status=online'
```

Response:

```json
{
  "items": [
    {
      "id": "00008030-000259E936BB802E",
      "name": "My iPhone",
      "platform": "ios",
      "model": "iPhone12,3",
      "osVersion": "18.7.1",
      "teamId": null,
      "tunnelUrl": "https://example.trycloudflare.com",
      "status": "online",
      "lastSeen": 1773930667490,
      "agentHost": "Chilumbas-MacBook-Pro-2.local"
    }
  ]
}
```

### `POST /devices`

Create or upsert a device record.

Example payload:

```json
{
  "id": "00008030-000259E936BB802E",
  "name": "My iPhone",
  "platform": "ios",
  "model": "iPhone12,3",
  "osVersion": "18.7.1",
  "status": "online",
  "tunnelUrl": "https://example.trycloudflare.com",
  "lastSeen": 1773930667490,
  "agentHost": "Chilumbas-MacBook-Pro-2.local"
}
```

### `PATCH /devices/:id`

Patch mutable device fields.

Example payload:

```json
{
  "status": "offline",
  "tunnelUrl": null,
  "lastSeen": 1773930999000
}
```

### `GET /sessions`

List session records.

### `POST /sessions/start`

Start a session.

Payload:

```json
{
  "deviceId": "00008030-000259E936BB802E",
  "userId": "user-1",
  "ipAddress": "127.0.0.1"
}
```

### `POST /sessions/stop`

Stop a session.

Payload:

```json
{
  "id": "session-1",
  "endedAt": 1773931999000
}
```

### `GET /teams`

List team records.

### `POST /teams`

Create a team.

Payload:

```json
{
  "name": "HeySalad",
  "slug": "heysalad"
}
```

### `GET /users`

List users.

### `POST /users`

Create a user.

Payload:

```json
{
  "email": "peter@heysalad.io",
  "name": "Peter",
  "role": "owner",
  "teamId": null
}
```

## CORS

The live Worker currently returns browser-safe CORS headers for:

- `GET`
- `POST`
- `PATCH`
- `OPTIONS`

That is what allows the Pages dashboard to fetch live Worker data at runtime.

## CLI Reference

Pre-publish invocation:

```bash
node packages/cli/dist/index.js <command>
```

### Device commands

```bash
sally device start [--foreground] [--mode auto|named|quick] [--worker-url <url>]
sally device list [--json]
sally device connect <id> [--print-only]
sally device stop
```

### Auth commands

```bash
sally auth login [--api-base-url <url>] [--team-slug <slug>] [--token <jwt>]
sally auth logout
sally auth whoami
```

### Tunnel commands

```bash
sally tunnel list
sally tunnel open
sally tunnel close
```

Current note:

- `tunnel open` and `tunnel close` are aliases that point users back to `device start` and `device stop`.

## Local Config File

Location:

- default: `~/.sally/config.json`
- override: `SALLY_CONFIG_HOME=/custom/path`

Shape:

```json
{
  "apiBaseUrl": "https://heysalad-sally-worker.heysalad-o.workers.dev",
  "teamSlug": "heysalad",
  "authToken": "<optional-jwt>",
  "activeDaemon": {
    "pid": 69985,
    "mode": "quick",
    "workerUrl": "https://heysalad-sally-worker.heysalad-o.workers.dev",
    "startedAt": 1773930660000
  }
}
```

## Agent Environment Variables

Required for direct daemon execution:

- `SALLY_WORKER_URL`
- `SALLY_STREAM_WORKDIR`

Optional:

- `SALLY_AGENT_HOST`
- `SALLY_HEARTBEAT_INTERVAL_MS`
- `SALLY_POLL_INTERVAL_MS`
- `SALLY_STREAM_READY_TIMEOUT_MS`
- `SALLY_TUNNEL_MODE`
- `SALLY_TUNNEL_HOSTNAME_BASE`
- `CF_ACCOUNT_ID`
- `CF_API_TOKEN`

### Example quick-tunnel run

```bash
SALLY_WORKER_URL=https://heysalad-sally-worker.heysalad-o.workers.dev \
SALLY_STREAM_WORKDIR=/Users/chilumbam/heysalad-sally \
SALLY_TUNNEL_MODE=quick \
node packages/agent/dist/index.js
```

### Example named-tunnel run

```bash
CF_ACCOUNT_ID=<cloudflare-account-id> \
CF_API_TOKEN=<cloudflare-api-token> \
SALLY_WORKER_URL=https://heysalad-sally-worker.heysalad-o.workers.dev \
SALLY_STREAM_WORKDIR=/Users/chilumbam/heysalad-sally \
SALLY_TUNNEL_MODE=named \
SALLY_TUNNEL_HOSTNAME_BASE=devices.example.heysalad.dev \
node packages/agent/dist/index.js
```

## SDK Surfaces In Active Use

The most active SDK surfaces in the repo today are:

- `DeviceManager`
- `IOSBridge`
- `CloudflareTunnel`

Current behavior summary:

```text
DeviceManager     -> lists local iOS and Android devices
IOSBridge         -> boots python3 -m sally_stream for iOS
CloudflareTunnel  -> named tunnel when configured, quick tunnel fallback otherwise
```

## Known Gaps

- Android stream startup is not implemented yet.
- Quick tunnels are volatile and can break long-lived browser streaming sessions.
- Full Cloudflare Access login is not built into the CLI yet; `auth login` is config-driven.
