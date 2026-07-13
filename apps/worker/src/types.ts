export type DevicePlatform = "ios" | "android";
export type DeviceStatus = "offline" | "online" | "busy" | "reserved";
export type TeamRole = "owner" | "admin" | "developer" | "viewer";
export type SyncPlatform = "macos" | "ios" | "android" | "web";
export type ShoppingNotificationStatus = "pending" | "sent";
export type TestRunStatus = "running" | "passed" | "failed";
export type TestRunCheckStatus = "passed" | "failed";

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

export interface SessionContextRecord {
  [key: string]: unknown;
}

export interface SessionSyncRecord {
  id: string;
  platform: SyncPlatform;
  userId: string;
  deviceId: string;
  context: SessionContextRecord;
  updatedAt: number;
}

export interface TestRunCheckRecord {
  detail: string;
  key: string;
  label: string;
  status: TestRunCheckStatus;
}

export interface TestRunRecord {
  checks: TestRunCheckRecord[];
  createdAt: number;
  deviceId: string;
  durationMs: number | null;
  finishedAt: number | null;
  id: string;
  platform: DevicePlatform;
  sessionId: string | null;
  startedAt: number;
  status: TestRunStatus;
  suite: string;
  summary: string;
  updatedAt: number;
  userId: string;
}

export interface ShoppingItem {
  name: string;
  qty: number;
  store: string;
  checked?: boolean | undefined;
}

export interface ShoppingListRecord {
  id: string;
  userId: string;
  items: ShoppingItem[];
  createdAt: number;
  updatedAt: number;
}

export interface RecipeRecord {
  id: string;
  userId: string;
  title: string;
  ingredients: string[];
  steps: string[];
  time: string;
  calories: number | null;
  sourceUrl: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ShoppingNotificationRecord {
  id: string;
  userId: string;
  payload: Record<string, unknown>;
  status: ShoppingNotificationStatus;
  createdAt: number;
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

export interface CreateSessionSyncInput {
  id?: string | undefined;
  platform: SyncPlatform;
  userId: string;
  deviceId: string;
  context: SessionContextRecord;
  updatedAt?: number | undefined;
}

export interface CreateShoppingListInput {
  id?: string | undefined;
  userId: string;
  items: ShoppingItem[];
  createdAt?: number | undefined;
  updatedAt?: number | undefined;
}

export interface CreateRecipeInput {
  id?: string | undefined;
  userId: string;
  title: string;
  ingredients: string[];
  steps: string[];
  time: string;
  calories?: number | null | undefined;
  sourceUrl?: string | null | undefined;
  createdAt?: number | undefined;
  updatedAt?: number | undefined;
}

export interface CreateShoppingNotificationInput {
  id?: string | undefined;
  userId: string;
  payload: Record<string, unknown>;
  status?: ShoppingNotificationStatus | undefined;
  createdAt?: number | undefined;
}

export interface StartTestRunInput {
  createdAt?: number | undefined;
  deviceId: string;
  id?: string | undefined;
  platform: DevicePlatform;
  sessionId?: string | null | undefined;
  startedAt?: number | undefined;
  status?: TestRunStatus | undefined;
  suite?: string | undefined;
  summary?: string | undefined;
  updatedAt?: number | undefined;
  userId: string;
}

export interface CompleteTestRunInput {
  checks: TestRunCheckRecord[];
  durationMs?: number | null | undefined;
  finishedAt?: number | null | undefined;
  status: Exclude<TestRunStatus, "running">;
  summary: string;
  updatedAt?: number | undefined;
}

export interface QueryService {
  completeTestRun(id: string, input: CompleteTestRunInput): Promise<TestRunRecord | null>;
  createTeam(input: CreateTeamInput): Promise<TeamRecord>;
  createUser(input: CreateUserInput): Promise<UserRecord>;
  createRecipe(input: CreateRecipeInput): Promise<RecipeRecord>;
  createShoppingList(input: CreateShoppingListInput): Promise<ShoppingListRecord>;
  createShoppingNotification(
    input: CreateShoppingNotificationInput
  ): Promise<ShoppingNotificationRecord>;
  getDevice(id: string): Promise<DeviceRecord | null>;
  getLatestShoppingList(userId: string): Promise<ShoppingListRecord | null>;
  getTestRun(id: string): Promise<TestRunRecord | null>;
  listDevices(filters?: {
    status?: DeviceStatus | string | undefined;
    teamId?: string | undefined;
  }): Promise<DeviceRecord[]>;
  listRecipes(userId: string): Promise<RecipeRecord[]>;
  listSessions(): Promise<SessionRecord[]>;
  listSessionsForUser(userId: string): Promise<SessionSyncRecord[]>;
  listTestRuns(filters?: {
    deviceId?: string | undefined;
    limit?: number | undefined;
    suite?: string | undefined;
    userId?: string | undefined;
  }): Promise<TestRunRecord[]>;
  listTeams(): Promise<TeamRecord[]>;
  listUsers(): Promise<UserRecord[]>;
  startTestRun(input: StartTestRunInput): Promise<TestRunRecord>;
  startSession(input: CreateSessionInput): Promise<SessionRecord>;
  syncSession(input: CreateSessionSyncInput): Promise<SessionSyncRecord>;
  stopSession(id: string, endedAt?: number | undefined): Promise<SessionRecord | null>;
  updateDevice(id: string, input: UpdateDeviceInput): Promise<DeviceRecord | null>;
  upsertDevice(input: CreateDeviceInput): Promise<DeviceRecord>;
}

export interface WorkerBindings {
  CF_ACCESS_AUD?: string | undefined;
  CF_ACCESS_TEAM_DOMAIN?: string | undefined;
  DB: D1Database;
  OPENAI_API_KEY?: string | undefined;
  OPENAI_BASE_URL?: string | undefined;
  OPENAI_MODEL?: string | undefined;
  REQUIRE_ACCESS_AUTH?: string | undefined;
  SALLY_ENV?: string | undefined;
}

export interface WorkerVariables {
  auth: AccessClaims | null;
  computers: import("./computer/types.js").ComputerAgentService;
  queries: QueryService;
}

export type WorkerEnv = {
  Bindings: WorkerBindings;
  Variables: WorkerVariables;
};
