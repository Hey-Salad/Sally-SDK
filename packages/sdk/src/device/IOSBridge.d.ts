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
export declare class IOSBridge {
    private child?;
    private readonly ideviceIdCommand;
    private readonly environment?;
    private readonly moduleArgs;
    private readonly preferredDeviceId?;
    private readonly pythonCommand;
    private readonly pythonModule;
    private readonly workingDirectory?;
    private currentStatus;
    constructor(options?: IOSBridgeOptions);
    start(): Promise<BridgeStatus>;
    stop(): Promise<BridgeStatus>;
    status(): Promise<BridgeStatus>;
    private detect;
    private bindChild;
}
//# sourceMappingURL=IOSBridge.d.ts.map