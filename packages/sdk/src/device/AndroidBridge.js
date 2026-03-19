import * as childProcess from "node:child_process";
export class AndroidBridge {
    adbCommand;
    preferredDeviceId;
    currentStatus = { state: "idle" };
    constructor(options = {}) {
        this.adbCommand = options.adbCommand ?? "adb";
        this.preferredDeviceId = options.preferredDeviceId;
    }
    async start() {
        const deviceId = await this.detect();
        this.currentStatus = this.makeStatus("running", deviceId);
        return this.status();
    }
    async stop() {
        this.currentStatus = this.makeStatus("stopped", this.currentStatus.deviceId);
        return this.status();
    }
    async status() {
        return { ...this.currentStatus };
    }
    async detect() {
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
    makeStatus(state, deviceId) {
        return deviceId ? { deviceId, state } : { state };
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
//# sourceMappingURL=AndroidBridge.js.map