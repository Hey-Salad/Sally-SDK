export interface TunnelRegistration {
    accountId: string;
    publicUrl: string;
    targetUrl: string;
    tunnelId: string;
    tunnelName: string;
}
export interface TunnelRegistryOptions {
    apiToken: string;
    endpoint?: string;
    fetchImpl?: typeof fetch;
}
export declare class TunnelRegistry {
    private readonly apiToken;
    private readonly endpoint;
    private readonly fetchImpl;
    constructor(options: TunnelRegistryOptions);
    register(registration: TunnelRegistration): Promise<TunnelRegistration>;
    deregister(tunnelId: string): Promise<void>;
    private send;
}
//# sourceMappingURL=TunnelRegistry.d.ts.map