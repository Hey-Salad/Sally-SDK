import * as childProcess from "node:child_process";

export interface ConnectedDevice {
  id: string;
  name: string;
  platform: "ios" | "android";
}

export interface DeviceManagerOptions {
  adbCommand?: string;
  execFile?: ExecFile;
  ideviceIdCommand?: string;
  ideviceInfoCommand?: string;
}

type ExecFile = (file: string, args: string[]) => Promise<string>;

export class DeviceManager {
  private readonly adbCommand: string;
  private readonly execFile: ExecFile;
  private readonly ideviceIdCommand: string;
  private readonly ideviceInfoCommand: string;

  constructor(options: DeviceManagerOptions = {}) {
    this.adbCommand = options.adbCommand ?? "adb";
    this.execFile = options.execFile ?? execFileText;
    this.ideviceIdCommand = options.ideviceIdCommand ?? "idevice_id";
    this.ideviceInfoCommand = options.ideviceInfoCommand ?? "ideviceinfo";
  }

  async list(): Promise<ConnectedDevice[]> {
    const [ios, android] = await Promise.all([
      this.listIosDevices(),
      this.listAndroidDevices()
    ]);
    return [...ios, ...android];
  }

  private async listAndroidDevices(): Promise<ConnectedDevice[]> {
    try {
      const output = await this.execFile(this.adbCommand, ["devices"]);
      return output
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.endsWith("\tdevice"))
        .map((line) => {
          const id = line.split("\t")[0] ?? "";
          return {
            id,
            name: `Android ${id.slice(-4)}`,
            platform: "android" as const
          };
        });
    } catch (error) {
      if (isMissingCommand(error)) {
        return [];
      }
      throw error;
    }
  }

  private async listIosDevices(): Promise<ConnectedDevice[]> {
    const output = await this.execFile(this.ideviceIdCommand, ["-l"]);
    const ids = output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    return Promise.all(ids.map(async (id) => ({
      id,
      name: await this.readIosName(id),
      platform: "ios" as const
    })));
  }

  private async readIosName(deviceId: string): Promise<string> {
    try {
      const output = await this.execFile(this.ideviceInfoCommand, ["-u", deviceId, "-k", "DeviceName"]);
      const name = output.trim();
      return name || `iPhone ${deviceId.slice(-4)}`;
    } catch {
      return `iPhone ${deviceId.slice(-4)}`;
    }
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

function isMissingCommand(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
