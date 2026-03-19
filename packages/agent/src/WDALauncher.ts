import * as childProcess from "node:child_process";
import { once } from "node:events";

export interface WDALauncherOptions {
  args?: string[];
  command?: string;
  workingDirectory?: string;
}

export class WDALauncher {
  private readonly args: string[];
  private readonly command: string;
  private readonly workingDirectory: string | undefined;
  private child: childProcess.ChildProcess | undefined;

  constructor(options: WDALauncherOptions = {}) {
    this.args = options.args ?? [];
    this.command = options.command ?? "tidevice";
    this.workingDirectory = options.workingDirectory;
  }

  async launch(): Promise<number | undefined> {
    if (this.child?.pid) {
      return this.child.pid;
    }
    this.child = childProcess.spawn(this.command, this.args, {
      cwd: this.workingDirectory,
      stdio: "pipe"
    });
    return this.child.pid;
  }

  async stop(): Promise<void> {
    if (!this.child) {
      return;
    }
    const child = this.child;
    child.kill("SIGTERM");
    await once(child, "exit");
    this.child = undefined;
  }
}
