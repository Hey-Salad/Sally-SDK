# Getting Started

Sally gives HeySalad developers one control surface for device bridges, Cloudflare-native routing, and a lightweight team dashboard.

This guide gets a fresh checkout running in under 10 minutes on macOS when you already have:

- Node.js 22+
- pnpm 10+
- Python 3.11+
- `cloudflared`
- `idevice_id` and `ideviceinfo` from `libimobiledevice`

If you are setting up Android, read [android-setup.md](./android-setup.md) before you continue.

## What Is Live Today

- Worker API: `https://heysalad-sally-worker.heysalad-o.workers.dev`
- Dashboard: `https://heysalad-sally-dashboard.pages.dev`
- Local CLI entrypoint before publish: `node packages/cli/dist/index.js`
- Tunnel mode in this repo today: quick tunnel fallback by default

## 10-Minute Path

### 1. Install workspace dependencies

```bash
cd /Users/chilumbam/heysalad-sally
pnpm install
python3 -m pip install --user -r python/sally_stream/requirements.txt
```

### 2. Build the packages you will use first

```bash
pnpm --dir packages/sdk build
pnpm --dir packages/agent build
pnpm --dir packages/cli build
```

### 3. Point the CLI at the live Worker

```bash
node packages/cli/dist/index.js auth login \
  --api-base-url https://heysalad-sally-worker.heysalad-o.workers.dev
```

This writes `~/.sally/config.json`.

Example:

```json
{
  "apiBaseUrl": "https://heysalad-sally-worker.heysalad-o.workers.dev"
}
```

### 4. Check that Sally can see your local device

```bash
node packages/cli/dist/index.js device list
```

Expected shape:

```text
00008030-000259E936BB802E ios local connected My iPhone
```

### 5. Start the local agent

```bash
node packages/cli/dist/index.js device start \
  --worker-url https://heysalad-sally-worker.heysalad-o.workers.dev
```

By default this starts the daemon in the background and uses quick tunnels.

### 6. Open the device stream URL

```bash
node packages/cli/dist/index.js device connect 00008030-000259E936BB802E
```

If you do not want to launch the browser while testing:

```bash
node packages/cli/dist/index.js device connect 00008030-000259E936BB802E --print-only
```

### 7. Check the dashboard

Open:

- `https://heysalad-sally-dashboard.pages.dev`

You should see the device inventory page and live team/audit views.

## System Layout

```text
USB device
   |
   v
sally-agent ---------------------> Sally Worker (Cloudflare Workers + D1)
   |                                         |
   |                                         +--> dashboard reads devices, users, teams, sessions
   |
   +--> Python stream server
   |
   +--> Cloudflare quick tunnel or named tunnel
             |
             v
        browser / dashboard
```

## Useful Commands

### Workspace checks

```bash
pnpm test
pnpm typecheck
pnpm build
```

### Worker checks

```bash
pnpm --dir apps/worker test
pnpm --dir apps/worker typecheck
pnpm --dir apps/worker build
pnpm --dir apps/worker db:migrate:local
```

### Dashboard checks

```bash
pnpm --dir apps/dashboard test
pnpm --dir apps/dashboard typecheck
pnpm --dir apps/dashboard build
```

## Required Environment Variables

You only need a subset depending on the flow.

### Common local agent

- `SALLY_WORKER_URL`
- `SALLY_STREAM_WORKDIR`
- `SALLY_TUNNEL_MODE`

### Optional local agent tuning

- `SALLY_AGENT_HOST`
- `SALLY_POLL_INTERVAL_MS`
- `SALLY_HEARTBEAT_INTERVAL_MS`
- `SALLY_STREAM_READY_TIMEOUT_MS`
- `SALLY_TUNNEL_HOSTNAME_BASE`

### Named tunnel mode

- `CF_ACCOUNT_ID`
- `CF_API_TOKEN`

## Known Limitations

- Pre-publish, use `node packages/cli/dist/index.js ...` instead of `npx @heysalad/sally ...`.
- Quick tunnels are useful for fast setup but are not stable enough for long-lived streaming. Named tunnels with a controlled domain are the production path.
- Android device discovery works when `adb` is installed, but Android stream startup is not implemented yet in this repo.
- Cloudflare Access verification exists in the Worker, but the live deployment currently runs with `REQUIRE_ACCESS_AUTH=false`.

## Troubleshooting

### `device list` shows nothing

Check the host tools:

```bash
idevice_id -l
ideviceinfo -u <udid> -k DeviceName
```

If those fail, start with [ios-setup.md](./ios-setup.md).

### `device connect` says no active stream URL

Start the daemon first:

```bash
node packages/cli/dist/index.js device start \
  --worker-url https://heysalad-sally-worker.heysalad-o.workers.dev
```

Then wait a few seconds and re-run `device connect`.

### Dashboard loads but stream does not stay connected

The UI is working. The unreliable part is usually the quick tunnel host. Move to a named tunnel setup for repeatable device streaming.
