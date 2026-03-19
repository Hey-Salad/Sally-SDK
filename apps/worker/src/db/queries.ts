import { z } from "zod";

import type {
  CreateDeviceInput,
  CreateSessionInput,
  CreateTeamInput,
  CreateUserInput,
  DeviceRecord,
  DeviceStatus,
  QueryService,
  SessionRecord,
  TeamRecord,
  UpdateDeviceInput,
  UserRecord,
  WorkerBindings
} from "../types.js";

const roleSchema = z.enum(["owner", "admin", "developer", "viewer"]);
const platformSchema = z.enum(["ios", "android"]);
const statusSchema = z.string();

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
  const now = options.now ?? Date.now;
  const idFactory = options.idFactory ?? crypto.randomUUID;
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
    listDevices(filters) {
      return listDevices(db, filters ?? {});
    },
    listSessions() {
      return selectMany(
        db,
        `${sessionsSql} ORDER BY started_at DESC, id DESC`,
        [],
        sessionRecordSchema
      );
    },
    getDevice(id) {
      return selectFirst(db, `${devicesSql} WHERE id = ?`, [id], deviceRecordSchema);
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

const stopSessionSql = [
  "UPDATE sessions",
  "SET ended_at = ?",
  "WHERE id = ?"
].join(" ");
