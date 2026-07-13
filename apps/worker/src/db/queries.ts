import { z } from "zod";

import type {
  CompleteTestRunInput,
  CreateDeviceInput,
  CreateRecipeInput,
  CreateSessionInput,
  CreateSessionSyncInput,
  CreateShoppingListInput,
  CreateShoppingNotificationInput,
  CreateTeamInput,
  CreateUserInput,
  DeviceRecord,
  DeviceStatus,
  DevicePlatform,
  QueryService,
  RecipeRecord,
  SessionRecord,
  SessionSyncRecord,
  ShoppingListRecord,
  StartTestRunInput,
  ShoppingNotificationRecord,
  TeamRecord,
  TestRunCheckRecord,
  TestRunStatus,
  TestRunRecord,
  UpdateDeviceInput,
  UserRecord,
  ShoppingItem,
  SyncPlatform,
  WorkerBindings
} from "../types.js";

const roleSchema = z.enum(["owner", "admin", "developer", "viewer"]);
const platformSchema = z.enum(["ios", "android"]);
const syncPlatformSchema = z.enum(["macos", "ios", "android", "web"]);
const statusSchema = z.string();
const shoppingItemSchema = z.object({
  checked: z.boolean().optional(),
  name: z.string().min(1),
  qty: z.number().int().min(1),
  store: z.string().min(1)
});
const recipeContentSchema = z.object({
  calories: z.number().int().nullable(),
  ingredients: z.array(z.string().min(1)),
  steps: z.array(z.string().min(1)),
  time: z.string().min(1),
  title: z.string().min(1)
});
const jsonObjectSchema = z.record(z.unknown());
const shoppingNotificationStatusSchema = z.enum(["pending", "sent"]);
const testRunStatusSchema = z.enum(["running", "passed", "failed"]);
const testRunCheckStatusSchema = z.enum(["passed", "failed"]);
const testRunCheckSchema = z.object({
  detail: z.string().min(1),
  key: z.string().min(1),
  label: z.string().min(1),
  status: testRunCheckStatusSchema
});
const testRunRecordSchema = z.object({
  checks: z.array(testRunCheckSchema),
  createdAt: z.number().int(),
  deviceId: z.string(),
  durationMs: z.number().int().nullable(),
  finishedAt: z.number().int().nullable(),
  id: z.string(),
  platform: platformSchema,
  sessionId: z.string().nullable(),
  startedAt: z.number().int(),
  status: testRunStatusSchema,
  suite: z.string().min(1),
  summary: z.string().min(1),
  updatedAt: z.number().int(),
  userId: z.string()
});

const teamRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.number()
});

const userRecordSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  teamId: z.string().nullable(),
  role: roleSchema.nullable(),
  createdAt: z.number()
});

const deviceRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  platform: platformSchema,
  model: z.string().nullable(),
  osVersion: z.string().nullable(),
  teamId: z.string().nullable(),
  tunnelUrl: z.string().nullable(),
  status: statusSchema,
  lastSeen: z.number().nullable(),
  agentHost: z.string().nullable()
});

const sessionRecordSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  userId: z.string(),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
  ipAddress: z.string().nullable()
});

export interface QueryOptions {
  db: WorkerBindings["DB"];
  now?: (() => number) | undefined;
  idFactory?: (() => string) | undefined;
}

type SqlPrimitive = number | string | null;

export function createQueryService(options: QueryOptions): QueryService {
  const now = options.now ?? (() => Date.now());
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const db = options.db;

  return {
    listTeams() {
      return selectMany(db, teamsSql, [], teamRecordSchema);
    },
    async createTeam(input) {
      const team = makeTeamRecord(input, now, idFactory);
      await execute(db, insertTeamSql, [
        team.id,
        team.name,
        team.slug,
        team.createdAt
      ]);
      return team;
    },
    listUsers() {
      return selectMany(db, usersSql, [], userRecordSchema);
    },
    async createUser(input) {
      const user = makeUserRecord(input, now, idFactory);
      await execute(db, insertUserSql, [
        user.id,
        user.email,
        user.name,
        user.teamId,
        user.role,
        user.createdAt
      ]);
      return user;
    },
    async createRecipe(input) {
      const recipe = makeRecipeRecord(input, now, idFactory);
      await execute(db, insertRecipeSql, [
        recipe.id,
        recipe.userId,
        recipe.title,
        JSON.stringify(recipe.ingredients),
        JSON.stringify(recipe.steps),
        recipe.time,
        recipe.calories,
        recipe.sourceUrl,
        recipe.createdAt,
        recipe.updatedAt
      ]);
      return recipe;
    },
    async createShoppingList(input) {
      const shoppingList = makeShoppingListRecord(input, now, idFactory);
      await execute(db, insertShoppingListSql, [
        shoppingList.id,
        shoppingList.userId,
        JSON.stringify(shoppingList.items),
        shoppingList.createdAt,
        shoppingList.updatedAt
      ]);
      return shoppingList;
    },
    async createShoppingNotification(input) {
      const notification = makeShoppingNotificationRecord(input, now, idFactory);
      await execute(db, insertShoppingNotificationSql, [
        notification.id,
        notification.userId,
        JSON.stringify(notification.payload),
        notification.status,
        notification.createdAt
      ]);
      return notification;
    },
    async completeTestRun(id, input) {
      return completeTestRun(db, id, input, now);
    },
    listDevices(filters) {
      return listDevices(db, filters ?? {});
    },
    getLatestShoppingList(userId) {
      return selectFirstRaw(
        db,
        `${shoppingListsSql} WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC, id DESC LIMIT 1`,
        [userId],
        parseShoppingListRow
      );
    },
    listRecipes(userId) {
      return selectManyRaw(
        db,
        `${recipesSql} WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC, id DESC`,
        [userId],
        parseRecipeRow
      );
    },
    listSessions() {
      return selectMany(
        db,
        `${sessionsSql} ORDER BY started_at DESC, id DESC`,
        [],
        sessionRecordSchema
      );
    },
    listSessionsForUser(userId) {
      return selectManyRaw(
        db,
        `${sessionSyncSql} WHERE user_id = ? ORDER BY updated_at DESC, id DESC`,
        [userId],
        parseSessionSyncRow
      ).then(deduplicateSessions);
    },
    listTestRuns(filters) {
      return listTestRuns(db, filters ?? {});
    },
    getDevice(id) {
      return selectFirst(db, `${devicesSql} WHERE id = ?`, [id], deviceRecordSchema);
    },
    getTestRun(id) {
      return selectFirstRaw(db, `${testRunsSql} WHERE id = ?`, [id], parseTestRunRow);
    },
    async upsertDevice(input) {
      const record = await upsertDevice(db, input, now);
      return deviceRecordSchema.parse(record);
    },
    updateDevice(id, input) {
      return updateDevice(db, id, input);
    },
    async startSession(input) {
      const session = makeSessionRecord(input, now, idFactory);
      await execute(db, insertSessionSql, [
        session.id,
        session.deviceId,
        session.userId,
        session.startedAt,
        session.endedAt,
        session.ipAddress
      ]);
      return session;
    },
    async syncSession(input) {
      const session = makeSessionSyncRecord(input, now, idFactory);
      await execute(db, insertSessionSyncSql, [
        session.id,
        session.platform,
        session.userId,
        session.deviceId,
        JSON.stringify(session.context),
        session.updatedAt
      ]);
      return session;
    },
    async startTestRun(input) {
      const run = makeTestRunRecord(input, now, idFactory);
      await execute(db, insertTestRunSql, [
        run.id,
        run.userId,
        run.deviceId,
        run.sessionId,
        run.platform,
        run.suite,
        run.status,
        run.summary,
        JSON.stringify(run.checks),
        run.startedAt,
        run.finishedAt,
        run.durationMs,
        run.createdAt,
        run.updatedAt
      ]);
      return run;
    },
    stopSession(id, endedAt = now()) {
      return stopSession(db, id, endedAt);
    }
  };
}

async function listDevices(
  db: WorkerBindings["DB"],
  filters: {
    status?: DeviceStatus | string | undefined;
    teamId?: string | undefined;
  }
): Promise<DeviceRecord[]> {
  const { clauses, values } = buildDeviceFilter(filters);
  const whereClause = clauses.length === 0 ? "" : ` WHERE ${clauses.join(" AND ")}`;
  const sql = `${devicesSql}${whereClause} ORDER BY COALESCE(last_seen, 0) DESC, name ASC`;
  return selectMany(db, sql, values, deviceRecordSchema);
}

async function listTestRuns(
  db: WorkerBindings["DB"],
  filters: {
    deviceId?: string | undefined;
    limit?: number | undefined;
    suite?: string | undefined;
    userId?: string | undefined;
  }
): Promise<TestRunRecord[]> {
  const { clauses, values } = buildTestRunFilter(filters);
  const whereClause = clauses.length === 0 ? "" : ` WHERE ${clauses.join(" AND ")}`;
  const limitClause = filters.limit ? " LIMIT ?" : "";
  const sql = `${testRunsSql}${whereClause} ORDER BY started_at DESC, id DESC${limitClause}`;
  const queryValues = filters.limit ? [...values, filters.limit] : values;
  return selectManyRaw(db, sql, queryValues, parseTestRunRow);
}

function buildDeviceFilter(filters: {
  status?: DeviceStatus | string | undefined;
  teamId?: string | undefined;
}) {
  const clauses: string[] = [];
  const values: SqlPrimitive[] = [];

  if (filters.teamId) {
    clauses.push("team_id = ?");
    values.push(filters.teamId);
  }

  if (filters.status) {
    clauses.push("status = ?");
    values.push(filters.status);
  }

  return { clauses, values };
}

function buildTestRunFilter(filters: {
  deviceId?: string | undefined;
  suite?: string | undefined;
  userId?: string | undefined;
}) {
  const clauses: string[] = [];
  const values: SqlPrimitive[] = [];

  if (filters.userId) {
    clauses.push("user_id = ?");
    values.push(filters.userId);
  }

  if (filters.deviceId) {
    clauses.push("device_id = ?");
    values.push(filters.deviceId);
  }

  if (filters.suite) {
    clauses.push("suite = ?");
    values.push(filters.suite);
  }

  return { clauses, values };
}

function makeTeamRecord(
  input: CreateTeamInput,
  now: () => number,
  idFactory: () => string
): TeamRecord {
  return {
    id: input.id ?? idFactory(),
    name: input.name,
    slug: input.slug,
    createdAt: input.createdAt ?? now()
  };
}

function makeUserRecord(
  input: CreateUserInput,
  now: () => number,
  idFactory: () => string
): UserRecord {
  return {
    id: input.id ?? idFactory(),
    email: input.email,
    name: input.name ?? null,
    teamId: input.teamId ?? null,
    role: input.role ?? "viewer",
    createdAt: input.createdAt ?? now()
  };
}

function makeSessionRecord(
  input: CreateSessionInput,
  now: () => number,
  idFactory: () => string
): SessionRecord {
  return {
    id: input.id ?? idFactory(),
    deviceId: input.deviceId,
    userId: input.userId,
    startedAt: input.startedAt ?? now(),
    endedAt: input.endedAt ?? null,
    ipAddress: input.ipAddress ?? null
  };
}

function makeSessionSyncRecord(
  input: CreateSessionSyncInput,
  now: () => number,
  idFactory: () => string
): SessionSyncRecord {
  return {
    id: input.id ?? idFactory(),
    platform: input.platform,
    userId: input.userId,
    deviceId: input.deviceId,
    context: input.context,
    updatedAt: input.updatedAt ?? now()
  };
}

function makeTestRunRecord(
  input: StartTestRunInput,
  now: () => number,
  idFactory: () => string
): TestRunRecord {
  const startedAt = input.startedAt ?? now();
  const createdAt = input.createdAt ?? startedAt;

  return {
    checks: [],
    createdAt,
    deviceId: input.deviceId,
    durationMs: null,
    finishedAt: null,
    id: input.id ?? idFactory(),
    platform: input.platform,
    sessionId: input.sessionId ?? null,
    startedAt,
    status: input.status ?? "running",
    suite: input.suite ?? "smoke",
    summary: input.summary ?? "Smoke test started",
    updatedAt: input.updatedAt ?? createdAt,
    userId: input.userId
  };
}

function makeShoppingListRecord(
  input: CreateShoppingListInput,
  now: () => number,
  idFactory: () => string
): ShoppingListRecord {
  return {
    id: input.id ?? idFactory(),
    userId: input.userId,
    items: input.items,
    createdAt: input.createdAt ?? now(),
    updatedAt: input.updatedAt ?? input.createdAt ?? now()
  };
}

function makeRecipeRecord(
  input: CreateRecipeInput,
  now: () => number,
  idFactory: () => string
): RecipeRecord {
  return {
    id: input.id ?? idFactory(),
    userId: input.userId,
    title: input.title,
    ingredients: input.ingredients,
    steps: input.steps,
    time: input.time,
    calories: input.calories ?? null,
    sourceUrl: input.sourceUrl ?? null,
    createdAt: input.createdAt ?? now(),
    updatedAt: input.updatedAt ?? input.createdAt ?? now()
  };
}

function makeShoppingNotificationRecord(
  input: CreateShoppingNotificationInput,
  now: () => number,
  idFactory: () => string
): ShoppingNotificationRecord {
  return {
    id: input.id ?? idFactory(),
    userId: input.userId,
    payload: input.payload,
    status: input.status ?? "pending",
    createdAt: input.createdAt ?? now()
  };
}

async function upsertDevice(
  db: WorkerBindings["DB"],
  input: CreateDeviceInput,
  now: () => number
): Promise<DeviceRecord> {
  const existing = await selectFirst(db, `${devicesSql} WHERE id = ?`, [input.id], deviceRecordSchema);
  if (existing) {
    const updated = await updateDevice(db, input.id, input);
    if (!updated) {
      throw new Error(`Unable to update device ${input.id}`);
    }
    return updated;
  }

  const record = makeDeviceRecord(input, now);
  await execute(db, insertDeviceSql, [
    record.id,
    record.name,
    record.platform,
    record.model,
    record.osVersion,
    record.teamId,
    record.tunnelUrl,
    record.status,
    record.lastSeen,
    record.agentHost
  ]);
  return record;
}

async function updateDevice(
  db: WorkerBindings["DB"],
  id: string,
  input: UpdateDeviceInput
): Promise<DeviceRecord | null> {
  const updates = deviceUpdateEntries(input);
  if (updates.length === 0) {
    return selectFirst(db, `${devicesSql} WHERE id = ?`, [id], deviceRecordSchema);
  }

  const assignments = updates.map(([column]) => `${column} = ?`).join(", ");
  const values = updates.map(([, value]) => value);
  await execute(db, `UPDATE devices SET ${assignments} WHERE id = ?`, [...values, id]);
  return selectFirst(db, `${devicesSql} WHERE id = ?`, [id], deviceRecordSchema);
}

async function selectManyRaw<T>(
  db: WorkerBindings["DB"],
  sql: string,
  values: SqlPrimitive[],
  parser: (row: Record<string, unknown>) => T
): Promise<T[]> {
  const prepared = bindStatement(db.prepare(sql), values);
  const result = await prepared.all<Record<string, unknown>>();
  return (result.results ?? []).map(parser);
}

async function selectFirstRaw<T>(
  db: WorkerBindings["DB"],
  sql: string,
  values: SqlPrimitive[],
  parser: (row: Record<string, unknown>) => T
): Promise<T | null> {
  const prepared = bindStatement(db.prepare(sql), values);
  const result = await prepared.first<Record<string, unknown>>();
  return result ? parser(result) : null;
}

function deviceUpdateEntries(input: UpdateDeviceInput): Array<[string, SqlPrimitive]> {
  const entries: Array<[string, SqlPrimitive]> = [];

  pushUpdate(entries, "name", input.name);
  pushUpdate(entries, "model", input.model ?? undefined);
  pushUpdate(entries, "os_version", input.osVersion ?? undefined);
  pushUpdate(entries, "team_id", input.teamId ?? undefined);
  pushUpdate(entries, "tunnel_url", input.tunnelUrl ?? undefined);
  pushUpdate(entries, "status", input.status ?? undefined);
  pushUpdate(entries, "last_seen", input.lastSeen ?? undefined);
  pushUpdate(entries, "agent_host", input.agentHost ?? undefined);

  return entries;
}

function pushUpdate(
  entries: Array<[string, SqlPrimitive]>,
  key: string,
  value: number | string | null | undefined
): void {
  if (value !== undefined) {
    entries.push([key, value]);
  }
}

function makeDeviceRecord(input: CreateDeviceInput, now: () => number): DeviceRecord {
  return {
    id: input.id,
    name: input.name,
    platform: input.platform,
    model: input.model ?? null,
    osVersion: input.osVersion ?? null,
    teamId: input.teamId ?? null,
    tunnelUrl: input.tunnelUrl ?? null,
    status: input.status ?? "offline",
    lastSeen: input.lastSeen ?? now(),
    agentHost: input.agentHost ?? null
  };
}

async function stopSession(
  db: WorkerBindings["DB"],
  id: string,
  endedAt: number
): Promise<SessionRecord | null> {
  await execute(db, stopSessionSql, [endedAt, id]);
  return selectFirst(db, `${sessionsSql} WHERE id = ?`, [id], sessionRecordSchema);
}

async function completeTestRun(
  db: WorkerBindings["DB"],
  id: string,
  input: CompleteTestRunInput,
  now: () => number
): Promise<TestRunRecord | null> {
  const finishedAt = input.finishedAt ?? now();
  const updatedAt = input.updatedAt ?? finishedAt;

  await execute(db, completeTestRunSql, [
    input.status,
    input.summary,
    JSON.stringify(input.checks),
    finishedAt,
    input.durationMs ?? null,
    updatedAt,
    id
  ]);

  return selectFirstRaw(db, `${testRunsSql} WHERE id = ?`, [id], parseTestRunRow);
}

async function selectMany<T>(
  db: WorkerBindings["DB"],
  sql: string,
  values: SqlPrimitive[],
  schema: z.ZodType<T>
): Promise<T[]> {
  const prepared = bindStatement(db.prepare(sql), values);
  const result = await prepared.all<Record<string, unknown>>();
  return schema.array().parse(normalizeRows(result.results ?? []));
}

async function selectFirst<T>(
  db: WorkerBindings["DB"],
  sql: string,
  values: SqlPrimitive[],
  schema: z.ZodType<T>
): Promise<T | null> {
  const prepared = bindStatement(db.prepare(sql), values);
  const result = await prepared.first<Record<string, unknown>>();
  return result ? schema.parse(normalizeRow(result)) : null;
}

async function execute(
  db: WorkerBindings["DB"],
  sql: string,
  values: SqlPrimitive[]
): Promise<void> {
  const prepared = bindStatement(db.prepare(sql), values);
  await prepared.run();
}

function bindStatement(
  statement: D1PreparedStatement,
  values: SqlPrimitive[]
): D1PreparedStatement {
  return values.length === 0 ? statement : statement.bind(...values);
}

function normalizeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(normalizeRow);
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    agentHost: row.agent_host ?? row.agentHost ?? null,
    createdAt: row.created_at ?? row.createdAt,
    deviceId: row.device_id ?? row.deviceId,
    email: row.email,
    endedAt: row.ended_at ?? row.endedAt ?? null,
    id: row.id,
    ipAddress: row.ip_address ?? row.ipAddress ?? null,
    lastSeen: row.last_seen ?? row.lastSeen ?? null,
    model: row.model ?? null,
    name: row.name ?? null,
    osVersion: row.os_version ?? row.osVersion ?? null,
    platform: row.platform,
    role: row.role ?? null,
    slug: row.slug,
    startedAt: row.started_at ?? row.startedAt,
    status: row.status ?? "offline",
    teamId: row.team_id ?? row.teamId ?? null,
    tunnelUrl: row.tunnel_url ?? row.tunnelUrl ?? null,
    userId: row.user_id ?? row.userId
  };
}

function parseSessionSyncRow(row: Record<string, unknown>): SessionSyncRecord {
  return {
    id: stringValue(row.id),
    platform: syncPlatformSchema.parse(row.platform),
    userId: stringValue(row.user_id ?? row.userId),
    deviceId: stringValue(row.device_id ?? row.deviceId),
    context: parseJsonObject(row.context),
    updatedAt: numberValue(row.updated_at ?? row.updatedAt)
  };
}

function parseShoppingListRow(row: Record<string, unknown>): ShoppingListRecord {
  return {
    createdAt: numberValue(row.created_at ?? row.createdAt),
    id: stringValue(row.id),
    items: parseJsonArray(row.items, shoppingItemSchema),
    updatedAt: numberValue(row.updated_at ?? row.updatedAt),
    userId: stringValue(row.user_id ?? row.userId)
  };
}

function parseRecipeRow(row: Record<string, unknown>): RecipeRecord {
  return {
    calories: row.calories == null ? null : numberValue(row.calories),
    createdAt: numberValue(row.created_at ?? row.createdAt),
    id: stringValue(row.id),
    ingredients: parseJsonArray(row.ingredients, z.string().min(1)),
    sourceUrl: stringOrNull(row.source_url ?? row.sourceUrl),
    steps: parseJsonArray(row.steps, z.string().min(1)),
    time: stringValue(row.time),
    title: stringValue(row.title),
    updatedAt: numberValue(row.updated_at ?? row.updatedAt),
    userId: stringValue(row.user_id ?? row.userId)
  };
}

function parseShoppingNotificationRow(row: Record<string, unknown>): ShoppingNotificationRecord {
  return {
    createdAt: numberValue(row.created_at ?? row.createdAt),
    id: stringValue(row.id),
    payload: parseJsonObject(row.payload),
    status: shoppingNotificationStatusSchema.parse(row.status),
    userId: stringValue(row.user_id ?? row.userId)
  };
}

function parseTestRunRow(row: Record<string, unknown>): TestRunRecord {
  return testRunRecordSchema.parse({
    checks: parseJsonArray(row.checks, testRunCheckSchema),
    createdAt: numberValue(row.created_at ?? row.createdAt),
    deviceId: stringValue(row.device_id ?? row.deviceId),
    durationMs: numberOrNull(row.duration_ms ?? row.durationMs),
    finishedAt: numberOrNull(row.finished_at ?? row.finishedAt),
    id: stringValue(row.id),
    platform: platformSchema.parse(row.platform),
    sessionId: stringOrNull(row.session_id ?? row.sessionId),
    startedAt: numberValue(row.started_at ?? row.startedAt),
    status: testRunStatusSchema.parse(row.status),
    suite: stringValue(row.suite),
    summary: stringValue(row.summary),
    updatedAt: numberValue(row.updated_at ?? row.updatedAt),
    userId: stringValue(row.user_id ?? row.userId)
  });
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    return jsonObjectSchema.parse(JSON.parse(value));
  }
  return jsonObjectSchema.parse(value ?? {});
}

function parseJsonArray<T>(
  value: unknown,
  schema: z.ZodType<T>
): T[] {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return z.array(schema).parse(parsed ?? []);
}

function numberValue(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  throw new Error("Expected numeric value");
}

function numberOrNull(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  return numberValue(value);
}

function stringValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  throw new Error("Expected string value");
}

function stringOrNull(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  return stringValue(value);
}

function deduplicateSessions(sessions: SessionSyncRecord[]): SessionSyncRecord[] {
  const seen = new Set<SyncPlatform>();
  const latest: SessionSyncRecord[] = [];

  for (const session of sessions) {
    if (seen.has(session.platform)) {
      continue;
    }
    seen.add(session.platform);
    latest.push(session);
  }

  return latest;
}

const teamsSql = [
  "SELECT",
  "id, name, slug, created_at",
  "FROM teams"
].join(" ");

const usersSql = [
  "SELECT",
  "id, email, name, team_id, role, created_at",
  "FROM users"
].join(" ");

const devicesSql = [
  "SELECT",
  "id, name, platform, model, os_version, team_id, tunnel_url, status, last_seen, agent_host",
  "FROM devices"
].join(" ");

const sessionsSql = [
  "SELECT",
  "id, device_id, user_id, started_at, ended_at, ip_address",
  "FROM sessions"
].join(" ");

const sessionSyncSql = [
  "SELECT",
  "id, platform, user_id, device_id, context, updated_at",
  "FROM session_syncs"
].join(" ");

const shoppingListsSql = [
  "SELECT",
  "id, user_id, items, created_at, updated_at",
  "FROM shopping_lists"
].join(" ");

const testRunsSql = [
  "SELECT",
  "id, user_id, device_id, session_id, platform, suite, status, summary, checks, started_at, finished_at, duration_ms, created_at, updated_at",
  "FROM test_runs"
].join(" ");

const recipesSql = [
  "SELECT",
  "id, user_id, title, ingredients, steps, time, calories, source_url, created_at, updated_at",
  "FROM recipes"
].join(" ");

const insertTeamSql = [
  "INSERT INTO teams (id, name, slug, created_at)",
  "VALUES (?, ?, ?, ?)"
].join(" ");

const insertUserSql = [
  "INSERT INTO users (id, email, name, team_id, role, created_at)",
  "VALUES (?, ?, ?, ?, ?, ?)"
].join(" ");

const insertDeviceSql = [
  "INSERT INTO devices (id, name, platform, model, os_version, team_id, tunnel_url, status, last_seen, agent_host)",
  "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
].join(" ");

const insertSessionSql = [
  "INSERT INTO sessions (id, device_id, user_id, started_at, ended_at, ip_address)",
  "VALUES (?, ?, ?, ?, ?, ?)"
].join(" ");

const insertSessionSyncSql = [
  "INSERT INTO session_syncs (id, platform, user_id, device_id, context, updated_at)",
  "VALUES (?, ?, ?, ?, ?, ?)"
].join(" ");

const insertShoppingListSql = [
  "INSERT INTO shopping_lists (id, user_id, items, created_at, updated_at)",
  "VALUES (?, ?, ?, ?, ?)"
].join(" ");

const insertRecipeSql = [
  "INSERT INTO recipes (id, user_id, title, ingredients, steps, time, calories, source_url, created_at, updated_at)",
  "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
].join(" ");

const insertShoppingNotificationSql = [
  "INSERT INTO shopping_notifications (id, user_id, payload, status, created_at)",
  "VALUES (?, ?, ?, ?, ?)"
].join(" ");

const insertTestRunSql = [
  "INSERT INTO test_runs (id, user_id, device_id, session_id, platform, suite, status, summary, checks, started_at, finished_at, duration_ms, created_at, updated_at)",
  "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
].join(" ");

const stopSessionSql = [
  "UPDATE sessions",
  "SET ended_at = ?",
  "WHERE id = ?"
].join(" ");

const completeTestRunSql = [
  "UPDATE test_runs",
  "SET status = ?, summary = ?, checks = ?, finished_at = ?, duration_ms = ?, updated_at = ?",
  "WHERE id = ?"
].join(" ");
