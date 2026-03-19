export class TunnelRegistry {
    apiToken;
    endpoint;
    fetchImpl;
    constructor(options) {
        this.apiToken = options.apiToken;
        this.endpoint = options.endpoint ?? "https://registry.example.heysalad.dev/tunnels";
        this.fetchImpl = options.fetchImpl ?? fetch;
    }
    async register(registration) {
        await this.send("POST", registration.tunnelId, registration);
        return registration;
    }
    async deregister(tunnelId) {
        await this.send("DELETE", tunnelId);
    }
    async send(method, tunnelId, body) {
        const response = await this.fetchImpl(`${this.endpoint}/${tunnelId}`, {
            body: body ? JSON.stringify(body) : undefined,
            headers: {
                Authorization: `Bearer ${this.apiToken}`,
                "Content-Type": "application/json"
            },
            method
        });
        if (!response.ok) {
            throw new Error(`Tunnel registry request failed with status ${response.status}`);
        }
    }
}
//# sourceMappingURL=TunnelRegistry.js.map