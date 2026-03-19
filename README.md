# @heysalad/sally

Sally is HeySalad's open source command line toolkit for device access, AI workflows, team auth, and Cloudflare-native operations.

## Workspace

- `packages/cli`: the published `@heysalad/sally` CLI
- `packages/sdk`: the reusable `@heysalad/sally-sdk` library
- `packages/agent`: the host daemon for plugged-in devices
- `apps/worker`: the Cloudflare Worker control plane
- `apps/dashboard`: the Cloudflare Pages dashboard
- `python/sally_stream`: the Python screen streaming service

## Principles

- TypeScript-first across the Node and Cloudflare stack
- Native execution on macOS and Ubuntu
- Cloudflare Workers, D1, Access, Pages, and Tunnels
- Python isolated to the streaming server
- Secrets from environment variables only

## Status

Sally is now running end to end:

- Worker: `https://heysalad-sally-worker.heysalad-o.workers.dev`
- Dashboard: `https://heysalad-sally-dashboard.pages.dev`
- Local CLI before publish: `node packages/cli/dist/index.js`

Start here:

- [docs/getting-started.md](docs/getting-started.md)
- [docs/ios-setup.md](docs/ios-setup.md)
- [docs/android-setup.md](docs/android-setup.md)
- [docs/team-setup.md](docs/team-setup.md)
- [docs/api-reference.md](docs/api-reference.md)

Current platform note:

- iOS discovery, streaming, tunnel handoff, Worker registration, and dashboard visibility are working
- Android discovery works when `adb` is installed, but Android stream startup is not implemented yet
