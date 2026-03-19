import os from "node:os";
import { fileURLToPath } from "node:url";

export * from "./DeviceWatcher.js";
export * from "./TunnelManager.js";
export * from "./StreamProcess.js";
export * from "./WDALauncher.js";
export * from "./Heartbeat.js";
export * from "./WorkerClient.js";
export * from "./SallyAgentDaemon.js";
export * from "./types.js";

import { DeviceWatcher } from "./DeviceWatcher.js";
import { Heartbeat } from "./Heartbeat.js";
import { SallyAgentDaemon } from "./SallyAgentDaemon.js";
import { StreamProcess } from "./StreamProcess.js";
import { TunnelManager } from "./TunnelManager.js";
import { WorkerClient } from "./WorkerClient.js";

async function runFromEnv(): Promise<void> {
  const agentHost = process.env.SALLY_AGENT_HOST ?? os.hostname();
  const workerClient = new WorkerClient({
    baseUrl: readRequiredEnv("SALLY_WORKER_URL")
  });
  const daemon = new SallyAgentDaemon({
    agentHost,
    createHeartbeat: (deviceId, tunnelUrl) => new Heartbeat({
      intervalMs: readNumberEnv("SALLY_HEARTBEAT_INTERVAL_MS", 30_000),
      onBeat: () => workerClient.updateDevice(deviceId, {
        agentHost,
        lastSeen: Date.now(),
        status: "online",
        tunnelUrl
      })
    }),
    streamProcess: new StreamProcess({
      readyTimeoutMs: readNumberEnv("SALLY_STREAM_READY_TIMEOUT_MS", 20_000),
      workingDirectory: readRequiredEnv("SALLY_STREAM_WORKDIR")
    }),
    tunnelManager: new TunnelManager({
      ...(process.env.SALLY_TUNNEL_MODE
        ? { mode: process.env.SALLY_TUNNEL_MODE as "auto" | "named" | "quick" }
        : {}),
      ...(process.env.SALLY_TUNNEL_HOSTNAME_BASE
        ? { publicHostnameBase: process.env.SALLY_TUNNEL_HOSTNAME_BASE }
        : {})
    }),
    watcher: new DeviceWatcher({
      pollIntervalMs: readNumberEnv("SALLY_POLL_INTERVAL_MS", 2_000)
    }),
    workerClient
  });

  daemon.on("error", (error) => {
    console.error("[sally-agent]", error.message);
  });

  const stop = async () => {
    await daemon.stop();
    process.exit(0);
  };

  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());

  await daemon.start();
  console.log("[sally-agent] watching for device changes");
}

if (isMainModule(import.meta.url)) {
  void runFromEnv();
}

function isMainModule(moduleUrl: string): boolean {
  return fileURLToPath(moduleUrl) === process.argv[1];
}

function readNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  return value ? Number(value) : fallback;
}

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}
