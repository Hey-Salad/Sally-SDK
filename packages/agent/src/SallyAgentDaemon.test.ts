import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { Heartbeat } from "./Heartbeat.js";
import { SallyAgentDaemon } from "./SallyAgentDaemon.js";
import type { DeviceRecordPayload, DetectedDevice } from "./types.js";

class FakeWatcher extends EventEmitter {
  async start(): Promise<void> {}
  stop(): void {}
}

describe("SallyAgentDaemon", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("registers connected devices and marks them offline on disconnect", async () => {
    const watcher = new FakeWatcher();
    const workerClient = {
      updateDevice: vi.fn(async () => undefined),
      upsertDevice: vi.fn(async () => undefined)
    };
    const streamProcess = {
      start: vi.fn(async () => ({ deviceId: "ios-1", port: 9000, targetUrl: "http://127.0.0.1:9000" })),
      stop: vi.fn(async () => undefined)
    };
    const tunnelManager = {
      close: vi.fn(async () => undefined),
      open: vi.fn(async () => ({ deviceId: "ios-1", targetUrl: "http://127.0.0.1:9000", url: "https://demo.trycloudflare.com" }))
    };
    const daemon = new SallyAgentDaemon({
      agentHost: "mac-mini-01",
      createHeartbeat: () => new Heartbeat({ intervalMs: 100, onBeat: async () => undefined }),
      resolveDeviceRecord: async () => ({
        agentHost: "mac-mini-01",
        id: "ios-1",
        lastSeen: 1,
        model: "iPhone17,1",
        name: "Test iPhone",
        osVersion: "18.3",
        platform: "ios",
        status: "offline",
        tunnelUrl: null
      }),
      streamProcess: streamProcess as never,
      tunnelManager: tunnelManager as never,
      watcher,
      workerClient: workerClient as never
    });

    await daemon.start();
    watcher.emit("connected", { id: "ios-1", platform: "ios" } satisfies DetectedDevice);
    await vi.waitFor(() => {
      expect(streamProcess.start).toHaveBeenCalledWith({ id: "ios-1", platform: "ios" });
    });

    expect(workerClient.upsertDevice).toHaveBeenCalledWith(expect.objectContaining({
      id: "ios-1",
      status: "online",
      tunnelUrl: "https://demo.trycloudflare.com"
    } satisfies Partial<DeviceRecordPayload>));

    watcher.emit("disconnected", { id: "ios-1", platform: "ios" } satisfies DetectedDevice);
    await vi.waitFor(() => {
      expect(workerClient.updateDevice).toHaveBeenCalledWith("ios-1", expect.objectContaining({
        status: "offline",
        tunnelUrl: null
      }));
    });

    expect(tunnelManager.close).toHaveBeenCalledWith("ios-1");
    expect(streamProcess.stop).toHaveBeenCalledWith("ios-1");
  });
});
