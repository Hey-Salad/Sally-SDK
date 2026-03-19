import * as childProcess from "node:child_process";

import type { BridgeStatus, BridgeState } from "./IOSBridge.js";

export interface AndroidBridgeOptions {
  adbCommand?: string;
  preferredDeviceId?: string;
}

export class AndroidBridge {
  private readonly adbCommand: string;
  private readonly preferredDeviceId: string | undefined;
  private currentStatus: BridgeStatus = { state: "idle" };

  constructor(options: AndroidBridgeOptions = {}) {
    this.adbCommand = options.adbCommand ?? "adb";
    this.preferredDeviceId = options.preferredDeviceId;
  }

  async start(): Promise<BridgeStatus> {
    const deviceId = await this.detect();
    this.currentStatus = this.makeStatus("running", deviceId);
    return this.status();
  }

  async stop(): Promise<BridgeStatus> {
    this.currentStatus = this.makeStatus("stopped", this.currentStatus.deviceId);
    return this.status();
  }

  async status(): Promise<BridgeStatus> {
    return { ...this.currentStatus };
  }

  private async detect(): Promise<string> {
    const stdout = await execFileText(this.adbCommand, ["devices"]);
    const devices = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.endsWith("\tdevice"))
      .map((line) => line.split("\t")[0]);
    const match = this.preferredDeviceId ?? devices[0];
    if (!match || !devices.includes(match)) {
      throw new Error("No Android device detected");
    }
    return match;
  }

  private makeStatus(state: BridgeState, deviceId?: string): BridgeStatus {
    return deviceId ? { deviceId, state } : { state };
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
