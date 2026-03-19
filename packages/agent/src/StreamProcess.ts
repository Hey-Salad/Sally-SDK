import { createServer } from "node:net";

import { IOSBridge, type BridgeStatus } from "@heysalad/sally-sdk";

import type { DetectedDevice, ManagedStream } from "./types.js";

export interface StreamProcessOptions {
  createIOSBridge?: (deviceId: string, port: number) => IOSBridgeLike;
  fetchImpl?: typeof fetch;
  readyTimeoutMs?: number;
  workingDirectory: string;
}

interface IOSBridgeLike {
  start(): Promise<BridgeStatus>;
  stop(): Promise<BridgeStatus>;
}

interface ActiveStream extends ManagedStream {
  bridge: IOSBridgeLike;
}

export class StreamProcess {
  private readonly createIOSBridge: (deviceId: string, port: number) => IOSBridgeLike;
  private readonly fetchImpl: typeof fetch;
  private readonly readyTimeoutMs: number;
  private readonly workingDirectory: string;
  private sessions = new Map<string, ActiveStream>();

  constructor(options: StreamProcessOptions) {
    this.createIOSBridge = options.createIOSBridge ?? ((deviceId, port) => new IOSBridge({
      environment: { SALLY_SERVER_PORT: String(port) },
      preferredDeviceId: deviceId,
      workingDirectory: options.workingDirectory
    }));
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.readyTimeoutMs = options.readyTimeoutMs ?? 20_000;
    this.workingDirectory = options.workingDirectory;
  }

  async start(device: DetectedDevice): Promise<ManagedStream> {
    const existing = this.sessions.get(device.id);
    if (existing) {
      return existing;
    }
    if (device.platform !== "ios") {
      throw new Error("Android stream startup is not implemented yet");
    }

    const port = await allocatePort();
    const bridge = this.createIOSBridge(device.id, port);
    await bridge.start();
    const targetUrl = `http://127.0.0.1:${port}`;

    try {
      await waitForStreamReady(this.fetchImpl, targetUrl, this.readyTimeoutMs);
    } catch (error) {
      await bridge.stop();
      throw error;
    }

    const session: ActiveStream = { bridge, deviceId: device.id, port, targetUrl };
    this.sessions.set(device.id, session);
    return session;
  }

  async stop(deviceId: string): Promise<void> {
    const session = this.sessions.get(deviceId);
    if (!session) {
      return;
    }
    await session.bridge.stop();
    this.sessions.delete(deviceId);
  }

  getWorkingDirectory(): string {
    return this.workingDirectory;
  }
}

async function allocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to allocate stream port"));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function waitForStreamReady(
  fetchImpl: typeof fetch,
  targetUrl: string,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(`${targetUrl}/status`);
      if (response.ok) {
        return;
      }
    } catch {}
    await sleep(250);
  }

  throw new Error(`Timed out waiting for stream server at ${targetUrl}`);
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
