import { EventEmitter } from "node:events";
import { TunnelRegistry } from "./TunnelRegistry.js";
export type TunnelMode = "auto" | "named" | "quick";
export interface TunnelSession {
    id: string;
    name: string;
    targetUrl: string;
    url: string;
}
export interface OpenTunnelOptions {
    mode?: TunnelMode;
    name?: string;
    publicHostname?: string;
    targetUrl: string;
}
export interface CloudflareTunnelOptions {
    accountId?: string;
    apiToken?: string;
    cloudflaredCommand?: string;
    mode?: TunnelMode;
    lifecycle?: EventEmitter;
    registry?: TunnelRegistry;
    quickTunnelTimeoutMs?: number;
}
export declare class CloudflareTunnel {
    private readonly accountId?;
    private readonly apiToken?;
    private readonly cloudflaredCommand;
    private readonly lifecycle;
    private readonly mode;
    private readonly quickTunnelTimeoutMs;
    private registry?;
    private cleanupHandler?;
    private process?;
    private session?;
    private sessionMode?;
    constructor(options?: CloudflareTunnelOptions);
    open(options: OpenTunnelOptions): Promise<TunnelSession>;
    close(): Promise<void>;
    private openNamedTunnel;
    private openQuickTunnel;
    private bindCleanup;
    private unbindCleanup;
    private createTunnel;
    private register;
    private deregister;
    private getRegistry;
    private resolveMode;
    private requireAccountId;
    private requireApiToken;
    private toRegistration;
}
//# sourceMappingURL=CloudflareTunnel.d.ts.map