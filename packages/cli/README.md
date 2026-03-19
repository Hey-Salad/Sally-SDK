# @heysalad/sally

The Sally CLI gives HeySalad developers and open source users one entry point for device bridges, AI helpers, auth, tunnels, and logs.

## Available commands

- `sally device start|list|connect|stop`
- `sally auth login|logout|whoami`
- `sally tunnel list`
- `sally ai`
- `sally logs`

## Local usage

```bash
pnpm --dir packages/cli build
node packages/cli/dist/index.js device list
```

Before publish, use the built entrypoint directly. After publish, the same commands will be available through the `sally` bin exposed by `@heysalad/sally`.
