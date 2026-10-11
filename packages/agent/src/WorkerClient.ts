import type { DeviceRecordPayload } from "./types.js";

export interface WorkerClientOptions {
  accessToken?: string | undefined;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export class WorkerClient {
  private readonly accessToken: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: WorkerClientOptions) {
    this.accessToken = options.accessToken?.trim() || undefined;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async upsertDevice(payload: DeviceRecordPayload): Promise<void> {
    await this.request("/devices", "POST", payload);
  }

  async updateDevice(deviceId: string, payload: Partial<DeviceRecordPayload>): Promise<void> {
    await this.request(`/devices/${deviceId}`, "PATCH", payload);
  }

  private async request(path: string, method: "PATCH" | "POST", body: object): Promise<void> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      body: JSON.stringify(body),
      headers,
      method
    });
    if (!response.ok) {
      throw new Error(`Worker request failed with status ${response.status}`);
    }
  }
}
