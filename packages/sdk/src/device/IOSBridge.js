import * as childProcess from "node:child_process";
import { once } from "node:events";
export class IOSBridge {
    child;
    ideviceIdCommand;
    environment;
    moduleArgs;
    preferredDeviceId;
    pythonCommand;
    pythonModule;
    workingDirectory;
    currentStatus = { state: "idle" };
    constructor(options = {}) {
        this.environment = options.environment;
        this.ideviceIdCommand = options.ideviceIdCommand ?? "idevice_id";
        this.moduleArgs = options.moduleArgs ?? [];
        this.preferredDeviceId = options.preferredDeviceId;
        this.pythonCommand = options.pythonCommand ?? "python3";
        this.pythonModule = options.pythonModule ?? "sally_stream";
        this.workingDirectory = options.workingDirectory;
    }
    async start() {
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
    async stop() {
        if (!this.child) {
            this.currentStatus = { ...this.currentStatus, state: "stopped" };
            return this.status();
        }
        const child = this.child;
        child.kill("SIGTERM");
        await once(child, "exit");
        return this.status();
    }
    async status() {
        return { ...this.currentStatus };
    }
    async detect() {
        const stdout = await execFileText(this.ideviceIdCommand, ["-l"]);
        const devices = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
        const match = this.preferredDeviceId ?? devices[0];
        if (!match || !devices.includes(match)) {
            throw new Error("No iOS device detected");
        }
        return match;
    }
    bindChild(child, deviceId) {
        this.child = child;
        this.currentStatus = { deviceId, pid: child.pid, state: "running" };
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
function execFileText(file, args) {
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
//# sourceMappingURL=IOSBridge.js.map