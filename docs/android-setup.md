# Android Setup

Sally already understands Android device discovery when `adb` is available. The missing piece in this repo today is Android stream startup.

That means this guide is for preparing the host correctly, validating discovery, and understanding the current gap.

## Current Android Status

```text
adb installed     -> supported
device discovery  -> supported
CLI device list   -> supported
stream startup    -> not implemented yet
tunnel handoff    -> depends on stream startup, so not available yet
```

## Prerequisites

- Ubuntu or macOS
- Node.js 22+
- pnpm 10+
- Android platform tools with `adb`

## Install `adb`

### macOS

```bash
brew install android-platform-tools
```

### Ubuntu

```bash
sudo apt-get update
sudo apt-get install -y android-sdk-platform-tools
```

## Verify the Device

On the phone:

1. enable Developer Options
2. enable USB debugging
3. trust the host when prompted

On the host:

```bash
adb devices
```

Expected shape:

```text
List of devices attached
emulator-5554	device
```

## Build Sally Packages

```bash
cd /Users/chilumbam/heysalad-sally
pnpm --dir packages/sdk build
pnpm --dir packages/cli build
```

## Verify Discovery Through Sally

```bash
node packages/cli/dist/index.js device list
```

If `adb` is installed and a device is connected, Sally can include the Android device in local inventory output.

## What Is Not Implemented Yet

The current `packages/agent/src/StreamProcess.ts` explicitly throws:

```text
Android stream startup is not implemented yet
```

So these flows are not ready yet:

- `sally device start` for Android stream sessions
- dashboard live Android stream view
- Android tunnel-backed browser connection

## Recommended Next Step For Android Support

To finish Android in this repo, the next implementation slice should add:

1. Android stream process startup
2. tunnel registration for Android sessions
3. dashboard connection flow for Android devices

Until then, use Sally for Android discovery and environment validation only.

## Troubleshooting

### `adb: command not found`

Install Android platform tools and restart the shell.

### Device is not listed

Check:

- USB debugging is enabled
- the cable supports data
- the host is trusted on-device
- `adb kill-server && adb start-server`

### Sally still only shows iOS

Run `adb devices` directly first. If that command does not work, Sally will not be able to see Android hardware either.
