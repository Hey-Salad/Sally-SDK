declare module "@heysalad/sally-sdk" {
  export interface BridgeStatus {
    deviceId?: string;
    pid?: number;
    state: "idle" | "running" | "stopped";
  }

  export interface IOSBridgeOptions {
    environment?: NodeJS.ProcessEnv;
    preferredDeviceId?: string;
    workingDirectory?: string;
  }

  export class IOSBridge {
    constructor(options?: IOSBridgeOptions);
    start(): Promise<BridgeStatus>;
    stop(): Promise<BridgeStatus>;
  }

  export type TunnelMode = "auto" | "named" | "quick";

  export interface CloudflareTunnelOptions {
    mode?: TunnelMode;
  }

  export class CloudflareTunnel {
    constructor(options?: CloudflareTunnelOptions);
    open(options: {
      mode?: TunnelMode;
      name?: string;
      publicHostname?: string;
      targetUrl: string;
    }): Promise<{ url: string }>;
    close(): Promise<void>;
  }
}
