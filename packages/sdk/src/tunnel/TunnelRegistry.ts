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

export class TunnelRegistry {
  private readonly apiToken: string;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: TunnelRegistryOptions) {
    this.apiToken = options.apiToken;
    this.endpoint = options.endpoint ?? "https://registry.example.heysalad.dev/tunnels";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async register(registration: TunnelRegistration): Promise<TunnelRegistration> {
    await this.send("POST", registration.tunnelId, registration);
    return registration;
  }

  async deregister(tunnelId: string): Promise<void> {
    await this.send("DELETE", tunnelId);
  }

  private async send(method: "POST" | "DELETE", tunnelId: string, body?: TunnelRegistration): Promise<void> {
    const response = await this.fetchImpl(`${this.endpoint}/${tunnelId}`, {
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json"
      },
      method,
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!response.ok) {
      throw new Error(`Tunnel registry request failed with status ${response.status}`);
    }
  }
}
