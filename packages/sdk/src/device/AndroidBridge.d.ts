import type { BridgeStatus } from "./IOSBridge.js";
export interface AndroidBridgeOptions {
    adbCommand?: string;
    preferredDeviceId?: string;
}
export declare class AndroidBridge {
    private readonly adbCommand;
    private readonly preferredDeviceId?;
    private currentStatus;
    constructor(options?: AndroidBridgeOptions);
    start(): Promise<BridgeStatus>;
    stop(): Promise<BridgeStatus>;
    status(): Promise<BridgeStatus>;
    private detect;
    private makeStatus;
}
//# sourceMappingURL=AndroidBridge.d.ts.map