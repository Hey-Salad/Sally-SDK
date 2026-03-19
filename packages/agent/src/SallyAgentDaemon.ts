import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";

import { DeviceWatcher } from "./DeviceWatcher.js";
import { Heartbeat } from "./Heartbeat.js";
import { StreamProcess } from "./StreamProcess.js";
import { TunnelManager } from "./TunnelManager.js";
import { WorkerClient } from "./WorkerClient.js";
import type { DetectedDevice, DeviceRecordPayload, ManagedStream, ManagedTunnel } from "./types.js";

export interface SallyAgentDaemonOptions {
  agentHost: string;
  createHeartbeat?: (deviceId: string, tunnelUrl: string) => Heartbeat;
  resolveDeviceRecord?: (device: DetectedDevice, agentHost: string) => Promise<DeviceRecordPayload>;
  streamProcess: StreamProcess;
  tunnelManager: TunnelManager;
  watcher: DeviceWatcherLike;
  workerClient: WorkerClient;
}

interface DeviceWatcherLike {
  on(event: "connected", listener: (device: DetectedDevice) => void): this;
  on(event: "disconnected", listener: (device: DetectedDevice) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  start(): Promise<void>;
  stop(): void;
}

interface ActiveDevice {
  heartbeat: Heartbeat;
  stream: ManagedStream;
  tunnel: ManagedTunnel;
}

export class SallyAgentDaemon extends EventEmitter {
  private readonly agentHost: string;
  private readonly createHeartbeat: (deviceId: string, tunnelUrl: string) => Heartbeat;
  private readonly resolveDeviceRecord: (device: DetectedDevice, agentHost: string) => Promise<DeviceRecordPayload>;
  private readonly streamProcess: StreamProcess;
  private readonly tunnelManager: TunnelManager;
  private readonly watcher: DeviceWatcherLike;
  private readonly workerClient: WorkerClient;
  private readonly activeDevices = new Map<string, ActiveDevice>();
  private readonly pending = new Map<string, Promise<void>>();

  constructor(options: SallyAgentDaemonOptions) {
    super();
    this.agentHost = options.agentHost;
    this.createHeartbeat = options.createHeartbeat ?? ((deviceId, tunnelUrl) => new Heartbeat({
      onBeat: () => this.workerClient.updateDevice(deviceId, {
        agentHost: this.agentHost,
        lastSeen: Date.now(),
        status: "online",
        tunnelUrl
      })
    }));
    this.resolveDeviceRecord = options.resolveDeviceRecord ?? resolveDeviceRecord;
    this.streamProcess = options.streamProcess;
    this.tunnelManager = options.tunnelManager;
    this.watcher = options.watcher;
    this.workerClient = options.workerClient;
  }

  async start(): Promise<void> {
    this.watcher.on("connected", (device) => {
      void this.schedule(device.id, () => this.handleConnect(device));
    });
    this.watcher.on("disconnected", (device) => {
      void this.schedule(device.id, () => this.handleDisconnect(device));
    });
    this.watcher.on("error", (error) => {
      this.emit("error", error);
    });
    await this.watcher.start();
  }

  async stop(): Promise<void> {
    this.watcher.stop();
    for (const deviceId of [...this.activeDevices.keys()]) {
      await this.handleDisconnect({ id: deviceId, platform: "ios" });
    }
  }

  private async handleConnect(device: DetectedDevice): Promise<void> {
    if (this.activeDevices.has(device.id)) {
      return;
    }

    const deviceRecord = await this.resolveDeviceRecord(device, this.agentHost);
    const stream = await this.streamProcess.start(device);
    const tunnel = await this.tunnelManager.open(device, stream.targetUrl);

    try {
      await this.workerClient.upsertDevice({
        ...deviceRecord,
        lastSeen: Date.now(),
        status: "online",
        tunnelUrl: tunnel.url
      });
    } catch (error) {
      await this.tunnelManager.close(device.id);
      await this.streamProcess.stop(device.id);
      throw error;
    }

    const heartbeat = this.createHeartbeat(device.id, tunnel.url);
    heartbeat.start();
    this.activeDevices.set(device.id, { heartbeat, stream, tunnel });
  }

  private async handleDisconnect(device: DetectedDevice): Promise<void> {
    const active = this.activeDevices.get(device.id);
    if (!active) {
      return;
    }
    active.heartbeat.stop();
    await this.workerClient.updateDevice(device.id, {
      agentHost: this.agentHost,
      lastSeen: Date.now(),
      status: "offline",
      tunnelUrl: null
    });
    await this.tunnelManager.close(device.id);
    await this.streamProcess.stop(device.id);
    this.activeDevices.delete(device.id);
  }

  private async schedule(deviceId: string, work: () => Promise<void>): Promise<void> {
    const previous = this.pending.get(deviceId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(work)
      .catch((error) => {
        this.emit("error", toError(error));
      });
    this.pending.set(deviceId, next);
    await next;
    if (this.pending.get(deviceId) === next) {
      this.pending.delete(deviceId);
    }
  }
}

export async function resolveDeviceRecord(
  device: DetectedDevice,
  agentHost: string
): Promise<DeviceRecordPayload> {
  if (device.platform === "ios") {
    return {
      agentHost,
      id: device.id,
      lastSeen: Date.now(),
      model: await readIdeviceInfo(device.id, "ProductType"),
      name: (await readIdeviceInfo(device.id, "DeviceName")) ?? `iPhone ${device.id.slice(-4)}`,
      osVersion: await readIdeviceInfo(device.id, "ProductVersion"),
      platform: "ios",
      status: "offline",
      tunnelUrl: null
    };
  }

  return {
    agentHost,
    id: device.id,
    lastSeen: Date.now(),
    model: null,
    name: `Android ${device.id.slice(-4)}`,
    osVersion: null,
    platform: "android",
    status: "offline",
    tunnelUrl: null
  };
}

async function readIdeviceInfo(deviceId: string, key: string): Promise<string | null> {
  try {
    const output = await execFileText("ideviceinfo", ["-u", deviceId, "-k", key]);
    const value = output.trim();
    return value || null;
  } catch {
    return null;
  }
}

function execFileText(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    childProcess.execFile(file, args, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(String(stdout));
    });
  });
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
