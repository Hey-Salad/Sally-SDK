import { spawn } from "node:child_process";

import { DeviceManager, type ConnectedDevice } from "@heysalad/sally-sdk";
import { Command } from "commander";

import type { RemoteDeviceRecord } from "../utils/api.js";
import { createApiClient } from "../utils/api.js";
import { readConfig, updateConfig } from "../utils/config.js";
import { createLogger } from "../utils/logger.js";
import {
  ensurePathExists,
  isProcessAlive,
  openExternal,
  resolveAgentEntry,
  resolveStreamWorkingDirectory,
  sleep,
  spawnDetached
} from "../utils/runtime.js";

interface DeviceView {
  connected: boolean;
  id: string;
  name: string;
  platform: "ios" | "android";
  status: string;
  tunnelUrl: string | null;
}

export function registerDeviceCommand(program: Command): void {
  const command = program.command("device").description("Manage device sessions");

  command
    .command("start")
    .description("Start the local Sally agent daemon")
    .option("--foreground", "Run the device agent in the foreground", false)
    .option("--mode <mode>", "Tunnel mode to use", "quick")
    .option("--worker-url <url>", "Sally worker URL")
    .action(async (options: { foreground?: boolean; mode?: "auto" | "named" | "quick"; workerUrl?: string }) => {
      await startDeviceDaemon(options);
    });

  command
    .command("list")
    .description("List locally connected devices, enriched with worker status when configured")
    .option("--json", "Print JSON output", false)
    .action(async (options: { json?: boolean }) => {
      await listDevices(options);
    });

  command
    .command("connect <id>")
    .description("Open the active stream URL for a device in the default browser")
    .option("--print-only", "Print the URL instead of opening it", false)
    .action(async (id: string, options: { printOnly?: boolean }) => {
      await connectToDevice(id, options);
    });

  command
    .command("stop")
    .description("Stop the locally managed Sally device agent")
    .action(async () => {
      await stopDeviceDaemon();
    });
}

export function mergeDeviceViews(
  localDevices: ConnectedDevice[],
  remoteDevices: RemoteDeviceRecord[]
): DeviceView[] {
  const merged = new Map<string, DeviceView>();

  for (const device of remoteDevices) {
    merged.set(device.id, {
      connected: false,
      id: device.id,
      name: device.name,
      platform: device.platform,
      status: device.status,
      tunnelUrl: device.tunnelUrl
    });
  }

  for (const device of localDevices) {
    const existing = merged.get(device.id);
    merged.set(device.id, {
      connected: true,
      id: device.id,
      name: device.name,
      platform: device.platform,
      status: existing?.status ?? "local",
      tunnelUrl: existing?.tunnelUrl ?? null
    });
  }

  return [...merged.values()].sort((left, right) => left.id.localeCompare(right.id));
}

async function startDeviceDaemon(options: {
  foreground?: boolean;
  mode?: "auto" | "named" | "quick";
  workerUrl?: string;
}): Promise<void> {
  const logger = createLogger();
  const config = await readConfig();
  if (config.activeDaemon && await isProcessAlive(config.activeDaemon.pid)) {
    logger.warn(`Sally agent is already running with pid ${config.activeDaemon.pid}`);
    return;
  }

  const agentEntry = resolveAgentEntry();
  if (!agentEntry || !await ensurePathExists(agentEntry)) {
    throw new Error("Unable to resolve the built sally-agent entrypoint. Build packages/agent first.");
  }

  const workerUrl = options.workerUrl ?? process.env.SALLY_API_BASE_URL ?? config.apiBaseUrl;
  const mode = options.mode ?? "quick";
  const spinner = logger.start("Starting Sally device agent");
  const environment = {
    ...process.env,
    SALLY_STREAM_WORKDIR: resolveStreamWorkingDirectory(),
    SALLY_TUNNEL_MODE: mode,
    SALLY_WORKER_URL: workerUrl
  };

  if (options.foreground) {
    spawn(process.execPath, [agentEntry], { env: environment, stdio: "inherit" });
    spinner.succeed("Started Sally device agent in the foreground");
    return;
  }

  const child = spawnDetached(process.execPath, [agentEntry], { env: environment });
  await updateConfig((current) => ({
    ...(current.authToken ? { authToken: current.authToken } : {}),
    activeDaemon: {
      mode,
      pid: child.pid ?? 0,
      startedAt: Date.now(),
      workerUrl
    },
    apiBaseUrl: workerUrl,
    ...(current.teamSlug ? { teamSlug: current.teamSlug } : {})
  }));
  await sleep(2_000);
  spinner.succeed(`Started Sally device agent in the background (pid ${child.pid ?? "unknown"})`);
}

async function listDevices(options: { json?: boolean }): Promise<void> {
  const logger = createLogger();
  const config = await readConfig();
  const deviceManager = new DeviceManager();
  const localDevices = await deviceManager.list();
  const remoteDevices = await tryListRemoteDevices(config.apiBaseUrl, config.authToken);
  const devices = mergeDeviceViews(localDevices, remoteDevices);

  if (options.json) {
    console.log(JSON.stringify(devices, null, 2));
    return;
  }

  if (devices.length === 0) {
    logger.warn("No devices found locally or via the configured Sally worker.");
    return;
  }

  for (const device of devices) {
    const tunnel = device.tunnelUrl ? ` ${device.tunnelUrl}` : "";
    const connected = device.connected ? "connected" : "remote";
    logger.info(`${device.id} ${device.platform} ${device.status} ${connected} ${device.name}${tunnel}`);
  }
}

async function connectToDevice(
  id: string,
  options: { printOnly?: boolean }
): Promise<void> {
  const logger = createLogger();
  const config = await readConfig();
  const remoteDevices = await tryListRemoteDevices(config.apiBaseUrl, config.authToken);
  const device = remoteDevices.find((candidate) => candidate.id === id);

  if (!device?.tunnelUrl) {
    throw new Error(`No active stream URL found for device ${id}. Run \`sally device start\` first.`);
  }

  if (options.printOnly) {
    console.log(device.tunnelUrl);
    return;
  }

  await openExternal(device.tunnelUrl);
  logger.success(`Opened ${device.tunnelUrl}`);
}

async function stopDeviceDaemon(): Promise<void> {
  const logger = createLogger();
  const config = await readConfig();
  const daemon = config.activeDaemon;

  if (!daemon) {
    logger.warn("No local Sally agent daemon is recorded in config.");
    return;
  }

  try {
    process.kill(daemon.pid, "SIGTERM");
  } catch {
    logger.warn(`Could not signal pid ${daemon.pid}; clearing local daemon metadata.`);
  }

  await updateConfig((current) => ({
    apiBaseUrl: current.apiBaseUrl,
    ...(current.authToken ? { authToken: current.authToken } : {}),
    ...(current.teamSlug ? { teamSlug: current.teamSlug } : {})
  }));
  logger.success(`Stopped Sally device agent pid ${daemon.pid}`);
}

async function tryListRemoteDevices(
  apiBaseUrl: string,
  authToken?: string
): Promise<RemoteDeviceRecord[]> {
  try {
    const api = createApiClient({
      baseUrl: apiBaseUrl,
      ...(authToken ? { accessToken: authToken } : {})
    });
    return await api.listDevices();
  } catch {
    return [];
  }
}
