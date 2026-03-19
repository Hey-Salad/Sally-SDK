import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";

import type { DetectedDevice } from "./types.js";

export interface DeviceWatcherOptions {
  adbCommand?: string;
  execFile?: ExecFile;
  ideviceIdCommand?: string;
  pollIntervalMs?: number;
}

type ExecFile = (file: string, args: string[]) => Promise<string>;

export class DeviceWatcher extends EventEmitter {
  private readonly adbCommand: string;
  private readonly execFile: ExecFile;
  private readonly ideviceIdCommand: string;
  private readonly pollIntervalMs: number;
  private devices = new Map<string, DetectedDevice>();
  private timer: NodeJS.Timeout | undefined;

  constructor(options: DeviceWatcherOptions = {}) {
    super();
    this.adbCommand = options.adbCommand ?? "adb";
    this.execFile = options.execFile ?? execFileText;
    this.ideviceIdCommand = options.ideviceIdCommand ?? "idevice_id";
    this.pollIntervalMs = options.pollIntervalMs ?? 2_000;
  }

  async start(): Promise<void> {
    if (this.timer) {
      return;
    }
    await this.poll();
    this.timer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async list(): Promise<DetectedDevice[]> {
    const [iosDevices, androidDevices] = await Promise.all([
      this.listIosDevices(),
      this.listAndroidDevices()
    ]);
    return [...iosDevices, ...androidDevices];
  }

  private async poll(): Promise<void> {
    try {
      this.updateDevices(await this.list());
    } catch (error) {
      this.emit("error", toError(error));
    }
  }

  private updateDevices(nextDevices: DetectedDevice[]): void {
    const nextMap = new Map(nextDevices.map((device) => [deviceKey(device), device]));

    for (const [key, device] of nextMap) {
      if (!this.devices.has(key)) {
        this.emit("connected", device);
      }
    }

    for (const [key, device] of this.devices) {
      if (!nextMap.has(key)) {
        this.emit("disconnected", device);
      }
    }

    this.devices = nextMap;
  }

  private async listAndroidDevices(): Promise<DetectedDevice[]> {
    try {
      const output = await this.execFile(this.adbCommand, ["devices"]);
      return output
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.endsWith("\tdevice"))
        .map((line) => ({ id: line.split("\t")[0] ?? "", platform: "android" as const }));
    } catch (error) {
      if (isMissingCommand(error)) {
        return [];
      }
      throw error;
    }
  }

  private async listIosDevices(): Promise<DetectedDevice[]> {
    const output = await this.execFile(this.ideviceIdCommand, ["-l"]);
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((id) => ({ id, platform: "ios" as const }));
  }
}

function deviceKey(device: DetectedDevice): string {
  return `${device.platform}:${device.id}`;
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

function isMissingCommand(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
