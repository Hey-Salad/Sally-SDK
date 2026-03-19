export type DeviceStatus = "offline" | "online" | "busy" | "reserved";
export type TeamRole = "owner" | "admin" | "developer" | "viewer";

export interface DeviceRecord {
  agentHost: string | null;
  id: string;
  lastSeen: number | null;
  model: string | null;
  name: string;
  osVersion: string | null;
  platform: "ios" | "android";
  status: DeviceStatus | string;
  teamId: string | null;
  tunnelUrl: string | null;
}

export interface SessionRecord {
  deviceId: string;
  endedAt: number | null;
  id: string;
  ipAddress: string | null;
  startedAt: number;
  userId: string;
}

export interface TeamRecord {
  createdAt: number;
  id: string;
  name: string;
  slug: string;
}

export interface UserRecord {
  createdAt: number;
  email: string;
  id: string;
  name: string | null;
  role: TeamRole | null;
  teamId: string | null;
}

export interface ApiListResponse<T> {
  items: T[];
}
