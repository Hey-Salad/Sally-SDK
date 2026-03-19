# iOS Setup

Use this guide when you want Sally to discover a plugged-in iPhone, start the local stream server, and register a tunnel with the Worker.

## What Works Today

- iPhone discovery with `idevice_id`
- device metadata lookup with `ideviceinfo`
- Python stream server boot through `python3 -m sally_stream`
- quick tunnel fallback through `cloudflared`
- Worker registration and dashboard visibility

## What Is Still Optional

- WebDriverAgent

Without WebDriverAgent, streaming still works, but touch injection stays disabled.

## Prerequisites

- macOS
- Xcode Command Line Tools
- Python 3.11+
- Node.js 22+
- pnpm 10+
- `cloudflared`
- `idevice_id`
- `ideviceinfo`

## Install Host Tools

### Homebrew packages

```bash
brew install cloudflared libimobiledevice
```

### Python dependencies

```bash
cd /Users/chilumbam/heysalad-sally
python3 -m pip install --user -r python/sally_stream/requirements.txt
```

## Verify the iPhone Link

```bash
idevice_id -l
ideviceinfo -u <udid> -k DeviceName
ideviceinfo -u <udid> -k ProductVersion
```

If the phone does not appear:

1. unlock the device
2. trust the Mac on-device
3. reconnect the cable

## Build Sally Packages

```bash
cd /Users/chilumbam/heysalad-sally
pnpm --dir packages/sdk build
pnpm --dir packages/agent build
pnpm --dir packages/cli build
```

## Start the Stream Path

### Quick path through the CLI

```bash
node packages/cli/dist/index.js auth login \
  --api-base-url https://heysalad-sally-worker.heysalad-o.workers.dev

node packages/cli/dist/index.js device start \
  --worker-url https://heysalad-sally-worker.heysalad-o.workers.dev
```

### Direct daemon path

```bash
SALLY_WORKER_URL=https://heysalad-sally-worker.heysalad-o.workers.dev \
SALLY_STREAM_WORKDIR=/Users/chilumbam/heysalad-sally \
SALLY_TUNNEL_MODE=quick \
node packages/agent/dist/index.js
```

## Verify End To End

### Local device inventory

```bash
node packages/cli/dist/index.js device list
```

### Worker inventory

```bash
curl -s https://heysalad-sally-worker.heysalad-o.workers.dev/devices
```

Expected shape:

```json
{
  "items": [
    {
      "id": "00008030-000259E936BB802E",
      "platform": "ios",
      "status": "online",
      "tunnelUrl": "https://<name>.trycloudflare.com"
    }
  ]
}
```

### Browser handoff

```bash
node packages/cli/dist/index.js device connect <udid> --print-only
```

## Optional: WebDriverAgent

Use WebDriverAgent when you want taps, swipes, and key input over the stream.

```text
iPhone
  |
  +--> stream server works without WDA
  |
  +--> touch injection requires WDA on port 8100
```

Current repo state:

- WDA launcher scaffolding exists in `packages/agent`
- the Python stream server knows how to talk to WDA
- no turnkey WDA bootstrap script is shipped yet

## Optional: Named Tunnel Mode

Quick tunnels are fast. Named tunnels are stable.

Use named tunnels when you want a durable hostname:

```bash
export CF_ACCOUNT_ID=<cloudflare-account-id>
export CF_API_TOKEN=<cloudflare-api-token>
export SALLY_TUNNEL_MODE=named
export SALLY_TUNNEL_HOSTNAME_BASE=devices.example.heysalad.dev
```

Then start the daemon again. Sally will try to create:

```text
sally-ios-<device-suffix>.devices.example.heysalad.dev
```

## Troubleshooting

### `python3 -m sally_stream` fails on port `8765`

Another process may already be listening there. Use a different port:

```bash
SALLY_SERVER_PORT=8766 python3 -m sally_stream
```

### Stream starts but touch controls do nothing

That usually means WDA is unavailable. Streaming is still okay.

### Device record appears but stream is flaky

That is usually quick-tunnel volatility. Move to named tunnels for repeatable sessions.
