import * as childProcess from "node:child_process";
import { once } from "node:events";

export type BridgeState = "idle" | "running" | "stopped";

export interface BridgeStatus {
  deviceId?: string;
  pid?: number;
  state: BridgeState;
}

export interface IOSBridgeOptions {
  environment?: NodeJS.ProcessEnv;
  ideviceIdCommand?: string;
  moduleArgs?: string[];
  preferredDeviceId?: string;
  pythonCommand?: string;
  pythonModule?: string;
  workingDirectory?: string;
}

export class IOSBridge {
  private child: childProcess.ChildProcess | undefined;
  private readonly ideviceIdCommand: string;
  private readonly environment: NodeJS.ProcessEnv | undefined;
  private readonly moduleArgs: string[];
  private readonly preferredDeviceId: string | undefined;
  private readonly pythonCommand: string;
  private readonly pythonModule: string;
  private readonly workingDirectory: string | undefined;
  private currentStatus: BridgeStatus = { state: "idle" };

  constructor(options: IOSBridgeOptions = {}) {
    this.environment = options.environment;
    this.ideviceIdCommand = options.ideviceIdCommand ?? "idevice_id";
    this.moduleArgs = options.moduleArgs ?? [];
    this.preferredDeviceId = options.preferredDeviceId;
    this.pythonCommand = options.pythonCommand ?? "python3";
    this.pythonModule = options.pythonModule ?? "sally_stream";
    this.workingDirectory = options.workingDirectory;
  }

  async start(): Promise<BridgeStatus> {
    if (this.child && this.currentStatus.state === "running") {
      return this.status();
    }
    const deviceId = await this.detect();
    const child = childProcess.spawn(this.pythonCommand, ["-m", this.pythonModule, ...this.moduleArgs], {
      cwd: this.workingDirectory,
      env: {
        ...process.env,
        ...this.environment
      },
      stdio: "pipe"
    });
    this.bindChild(child, deviceId);
    return this.status();
  }

  async stop(): Promise<BridgeStatus> {
    if (!this.child) {
      this.currentStatus = { ...this.currentStatus, state: "stopped" };
      return this.status();
    }
    const child = this.child;
    child.kill("SIGTERM");
    await once(child, "exit");
    return this.status();
  }

  async status(): Promise<BridgeStatus> {
    return { ...this.currentStatus };
  }

  private async detect(): Promise<string> {
    const stdout = await execFileText(this.ideviceIdCommand, ["-l"]);
    const devices = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
    const match = this.preferredDeviceId ?? devices[0];
    if (!match || !devices.includes(match)) {
      throw new Error("No iOS device detected");
    }
    return match;
  }

  private bindChild(child: childProcess.ChildProcess, deviceId: string): void {
    this.child = child;
    this.currentStatus = child.pid
      ? { deviceId, pid: child.pid, state: "running" }
      : { deviceId, state: "running" };
    child.once("exit", () => {
      this.child = undefined;
      this.currentStatus = { deviceId, state: "stopped" };
    });
    child.once("error", () => {
      this.child = undefined;
      this.currentStatus = { deviceId, state: "stopped" };
    });
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
