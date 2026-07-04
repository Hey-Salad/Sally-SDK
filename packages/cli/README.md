# @heysalad/sally

The Sally CLI gives HeySalad developers and open source users one entry point for device bridges, AI helpers, auth, tunnels, and logs.

## Available commands

- `sally device start|list|connect|stop`
- `sally auth login|logout|whoami`
- `sally tunnel list`
- `sally ai`
- `sally logs`
- `sally kiosk menu|orders|order|status|update-status`
- `sally mcp`

## Sally kiosk quickstart

Point the CLI at any Sally kiosk API that exposes `/api/menu` and `/api/orders`:

```bash
export SALLY_KIOSK_BASE_URL=http://localhost:3000
sally kiosk menu --json
sally kiosk order --table 7 --item 12:2 --item 18 --notes "Hackathon demo"
sally kiosk status 1 --json
```

You can pass `--api-base-url <url>` on any kiosk command instead of using the environment variable.

## MCP server

Run Sally as a stdio MCP server:

```bash
sally mcp
```

Example client config:

```json
{
  "mcpServers": {
    "sally": {
      "command": "npx",
      "args": ["-y", "@heysalad/sally", "mcp"],
      "env": {
        "SALLY_KIOSK_BASE_URL": "https://YOUR_KIOSK_API_BASE_URL"
      }
    }
  }
}
```

Tools exposed:

- `sally_menu_list`
- `sally_order_create`
- `sally_order_get`
- `sally_order_update_status`

## Local usage

```bash
pnpm --dir packages/sdk build
pnpm --dir packages/cli build
node packages/cli/dist/index.js device list
```

Before publish, use the built entrypoint directly. After publish, the same commands will be available through the `sally` bin exposed by `@heysalad/sally`.
