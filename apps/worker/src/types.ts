export type DevicePlatform = "ios" | "android";
export type DeviceStatus = "offline" | "online" | "busy" | "reserved";
export type TeamRole = "owner" | "admin" | "developer" | "viewer";

export interface AccessClaims {
  aud: string[];
  email?: string | undefined;
  iss: string;
  sub: string;
}

export interface TeamRecord {
  id: string;
  name: string;
  slug: string;
  createdAt: number;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  teamId: string | null;
  role: TeamRole | null;
  createdAt: number;
}

export interface DeviceRecord {
  id: string;
  name: string;
  platform: DevicePlatform;
  model: string | null;
  osVersion: string | null;
  teamId: string | null;
  tunnelUrl: string | null;
  status: string;
  lastSeen: number | null;
  agentHost: string | null;
}

export interface SessionRecord {
  id: string;
  deviceId: string;
  userId: string;
  startedAt: number;
  endedAt: number | null;
  ipAddress: string | null;
}

export interface CreateTeamInput {
  id?: string | undefined;
  name: string;
  slug: string;
  createdAt?: number | undefined;
}

export interface CreateUserInput {
  id?: string | undefined;
  email: string;
  name?: string | null | undefined;
  teamId?: string | null | undefined;
  role?: TeamRole | undefined;
  createdAt?: number | undefined;
}

export interface CreateDeviceInput {
  id: string;
  name: string;
  platform: DevicePlatform;
  model?: string | null | undefined;
  osVersion?: string | null | undefined;
  teamId?: string | null | undefined;
  tunnelUrl?: string | null | undefined;
  status?: DeviceStatus | string | undefined;
  lastSeen?: number | null | undefined;
  agentHost?: string | null | undefined;
}

export interface UpdateDeviceInput {
  name?: string | undefined;
  model?: string | null | undefined;
  osVersion?: string | null | undefined;
  teamId?: string | null | undefined;
  tunnelUrl?: string | null | undefined;
  status?: DeviceStatus | string | undefined;
  lastSeen?: number | null | undefined;
  agentHost?: string | null | undefined;
}

export interface CreateSessionInput {
  id?: string | undefined;
  deviceId: string;
  userId: string;
  startedAt?: number | undefined;
  endedAt?: number | null | undefined;
  ipAddress?: string | null | undefined;
}

export interface QueryService {
  createTeam(input: CreateTeamInput): Promise<TeamRecord>;
  createUser(input: CreateUserInput): Promise<UserRecord>;
  getDevice(id: string): Promise<DeviceRecord | null>;
  listDevices(filters?: {
    status?: DeviceStatus | string | undefined;
    teamId?: string | undefined;
  }): Promise<DeviceRecord[]>;
  listSessions(): Promise<SessionRecord[]>;
  listTeams(): Promise<TeamRecord[]>;
  listUsers(): Promise<UserRecord[]>;
  startSession(input: CreateSessionInput): Promise<SessionRecord>;
  stopSession(id: string, endedAt?: number | undefined): Promise<SessionRecord | null>;
  updateDevice(id: string, input: UpdateDeviceInput): Promise<DeviceRecord | null>;
  upsertDevice(input: CreateDeviceInput): Promise<DeviceRecord>;
}

export interface WorkerBindings {
  CF_ACCESS_AUD?: string | undefined;
  CF_ACCESS_TEAM_DOMAIN?: string | undefined;
  DB: D1Database;
  REQUIRE_ACCESS_AUTH?: string | undefined;
  SALLY_ENV?: string | undefined;
}

export interface WorkerVariables {
  auth: AccessClaims | null;
  queries: QueryService;
}

export type WorkerEnv = {
  Bindings: WorkerBindings;
  Variables: WorkerVariables;
};
