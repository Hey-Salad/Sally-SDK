export interface RemoteDeviceRecord {
  agentHost: string | null;
  id: string;
  lastSeen: number | null;
  model: string | null;
  name: string;
  osVersion: string | null;
  platform: "ios" | "android";
  status: string;
  teamId: string | null;
  tunnelUrl: string | null;
}

export interface SallyApiClient {
  listDevices(): Promise<RemoteDeviceRecord[]>;
  ping(): Promise<string>;
}

export interface SallyApiClientOptions {
  accessToken?: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export function createApiClient(options: SallyApiClientOptions): SallyApiClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  return {
    async listDevices() {
      const response = await fetchImpl(`${baseUrl}/devices`, {
        headers: buildHeaders(options.accessToken)
      });
      const payload = await parseJson<{ items?: RemoteDeviceRecord[] }>(response);
      return payload.items ?? [];
    },
    async ping() {
      const response = await fetchImpl(`${baseUrl}/`, {
        headers: buildHeaders(options.accessToken)
      });
      const payload = await parseJson<{ service?: string }>(response);
      return payload.service ?? "unknown";
    }
  };
}

function buildHeaders(accessToken?: string): Record<string, string> {
  return accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : {};
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Sally API request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}
