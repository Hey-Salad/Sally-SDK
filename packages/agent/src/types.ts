export type AgentPlatform = "ios" | "android";

export interface DetectedDevice {
  id: string;
  platform: AgentPlatform;
}

export interface DeviceRecordPayload {
  agentHost: string;
  id: string;
  lastSeen: number;
  model: string | null;
  name: string;
  osVersion: string | null;
  platform: AgentPlatform;
  status: "offline" | "online";
  tunnelUrl: string | null;
}

export interface ManagedTunnel {
  deviceId: string;
  targetUrl: string;
  url: string;
}

export interface ManagedStream {
  deviceId: string;
  port: number;
  targetUrl: string;
}
