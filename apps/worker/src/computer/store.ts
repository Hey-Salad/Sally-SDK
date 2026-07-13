import type {
  ComputerAgentConnectionRecord,
  ComputerAgentRecord,
  ComputerAgentStatus,
  ComputerAuditLogRecord,
  ComputerCommandRecord,
  ComputerCommandStatus,
  ComputerPairingSessionRecord,
  ComputerPairingStatus,
  ComputerStore
} from "./types.js";

type SqlPrimitive = number | string | null;

interface PairingSessionRow {
  id: string;
  code_hash: string;
  user_id: string;
  team_id: string | null;
  computer_name: string | null;
  status: string;
  registration_token_hash: string | null;
  registration_token_expires_at: number | null;
  claimed_at: number | null;
  agent_id: string | null;
  created_at: number;
  expires_at: number;
}

interface AgentRow {
  id: string;
  user_id: string;
  team_id: string | null;
  name: string;
  platform: string | null;
  hostname: string | null;
  public_key: string;
  capabilities: string;
  status: string;
  created_at: number;
  last_seen: number | null;
  revoked_at: number | null;
}

interface ConnectionRow {
  id: string;
  agent_id: string;
  session_token_hash: string;
  created_at: number;
  expires_at: number;
  closed_at: number | null;
}

interface CommandRow {
  id: string;
  agent_id: string;
  user_id: string;
  capability: string;
  command: string;
  status: string;
  denial_reason: string | null;
  result: string | null;
  created_at: number;
  updated_at: number;
}

interface AuditLogRow {
  id: string;
  agent_id: string | null;
  user_id: string | null;
  event: string;
  detail: string | null;
  created_at: number;
}

export function createD1ComputerStore(db: D1Database): ComputerStore {
  return {
    async createPairingSession(record) {
      await run(
        db,
        `INSERT INTO computer_pairing_sessions
           (id, code_hash, user_id, team_id, computer_name, status, registration_token_hash,
            registration_token_expires_at, claimed_at, agent_id, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.codeHash,
          record.userId,
          record.teamId,
          record.computerName,
          record.status,
          record.registrationTokenHash,
          record.registrationTokenExpiresAt,
          record.claimedAt,
          record.agentId,
          record.createdAt,
          record.expiresAt
        ]
      );
    },
    async getPairingSessionByCodeHash(codeHash) {
      const row = await first<PairingSessionRow>(
        db,
        "SELECT * FROM computer_pairing_sessions WHERE code_hash = ?",
        [codeHash]
      );
      return row ? toPairingSession(row) : null;
    },
    async getPairingSessionByRegistrationTokenHash(tokenHash) {
      const row = await first<PairingSessionRow>(
        db,
        "SELECT * FROM computer_pairing_sessions WHERE registration_token_hash = ?",
        [tokenHash]
      );
      return row ? toPairingSession(row) : null;
    },
    async markPairingSessionClaimed(id, input) {
      await run(
        db,
        `UPDATE computer_pairing_sessions
           SET status = 'claimed', claimed_at = ?, registration_token_hash = ?,
               registration_token_expires_at = ?
         WHERE id = ?`,
        [input.claimedAt, input.registrationTokenHash, input.registrationTokenExpiresAt, id]
      );
    },
    async markPairingSessionCompleted(id, input) {
      await run(
        db,
        "UPDATE computer_pairing_sessions SET status = 'completed', agent_id = ? WHERE id = ?",
        [input.agentId, id]
      );
    },
    async markPairingSessionStatus(id, status) {
      await run(db, "UPDATE computer_pairing_sessions SET status = ? WHERE id = ?", [status, id]);
    },
    async createAgent(record) {
      await run(
        db,
        `INSERT INTO computer_agents
           (id, user_id, team_id, name, platform, hostname, public_key, capabilities, status,
            created_at, last_seen, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.userId,
          record.teamId,
          record.name,
          record.platform,
          record.hostname,
          record.publicKey,
          JSON.stringify(record.capabilities),
          record.status,
          record.createdAt,
          record.lastSeen,
          record.revokedAt
        ]
      );
    },
    async getAgent(id) {
      const row = await first<AgentRow>(db, "SELECT * FROM computer_agents WHERE id = ?", [id]);
      return row ? toAgent(row) : null;
    },
    async listAgentsForUser(userId) {
      const rows = await all<AgentRow>(
        db,
        "SELECT * FROM computer_agents WHERE user_id = ? ORDER BY created_at DESC",
        [userId]
      );
      return rows.map(toAgent);
    },
    async markAgentRevoked(id, revokedAt) {
      await run(
        db,
        "UPDATE computer_agents SET status = 'revoked', revoked_at = ? WHERE id = ?",
        [revokedAt, id]
      );
    },
    async updateAgentLastSeen(id, lastSeen) {
      await run(db, "UPDATE computer_agents SET last_seen = ? WHERE id = ?", [lastSeen, id]);
    },
    async createConnection(record) {
      await run(
        db,
        `INSERT INTO computer_agent_connections
           (id, agent_id, session_token_hash, created_at, expires_at, closed_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.agentId,
          record.sessionTokenHash,
          record.createdAt,
          record.expiresAt,
          record.closedAt
        ]
      );
    },
    async getConnectionByTokenHash(tokenHash) {
      const row = await first<ConnectionRow>(
        db,
        "SELECT * FROM computer_agent_connections WHERE session_token_hash = ?",
        [tokenHash]
      );
      return row ? toConnection(row) : null;
    },
    async createCommand(record) {
      await run(
        db,
        `INSERT INTO computer_agent_commands
           (id, agent_id, user_id, capability, command, status, denial_reason, result,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.agentId,
          record.userId,
          record.capability,
          record.command,
          record.status,
          record.denialReason,
          record.result,
          record.createdAt,
          record.updatedAt
        ]
      );
    },
    async getCommand(id) {
      const row = await first<CommandRow>(
        db,
        "SELECT * FROM computer_agent_commands WHERE id = ?",
        [id]
      );
      return row ? toCommand(row) : null;
    },
    async listCommandsForAgent(agentId, status) {
      const rows = status
        ? await all<CommandRow>(
            db,
            "SELECT * FROM computer_agent_commands WHERE agent_id = ? AND status = ? ORDER BY created_at ASC",
            [agentId, status]
          )
        : await all<CommandRow>(
            db,
            "SELECT * FROM computer_agent_commands WHERE agent_id = ? ORDER BY created_at ASC",
            [agentId]
          );
      return rows.map(toCommand);
    },
    async updateCommand(id, input) {
      await run(
        db,
        "UPDATE computer_agent_commands SET status = ?, result = ?, updated_at = ? WHERE id = ?",
        [input.status, input.result ?? null, input.updatedAt, id]
      );
    },
    async appendAuditLog(record) {
      await run(
        db,
        `INSERT INTO computer_agent_audit_logs (id, agent_id, user_id, event, detail, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.agentId,
          record.userId,
          record.event,
          record.detail ? JSON.stringify(record.detail) : null,
          record.createdAt
        ]
      );
    },
    async listAuditLogs(agentId) {
      const rows = agentId
        ? await all<AuditLogRow>(
            db,
            "SELECT * FROM computer_agent_audit_logs WHERE agent_id = ? ORDER BY created_at DESC",
            [agentId]
          )
        : await all<AuditLogRow>(
            db,
            "SELECT * FROM computer_agent_audit_logs ORDER BY created_at DESC",
            []
          );
      return rows.map(toAuditLog);
    }
  };
}

async function run(db: D1Database, sql: string, params: SqlPrimitive[]): Promise<void> {
  await db.prepare(sql).bind(...params).run();
}

async function first<T>(db: D1Database, sql: string, params: SqlPrimitive[]): Promise<T | null> {
  return db.prepare(sql).bind(...params).first<T>();
}

async function all<T>(db: D1Database, sql: string, params: SqlPrimitive[]): Promise<T[]> {
  const result = await db.prepare(sql).bind(...params).all<T>();
  return result.results ?? [];
}

function toPairingSession(row: PairingSessionRow): ComputerPairingSessionRecord {
  return {
    agentId: row.agent_id,
    claimedAt: row.claimed_at,
    codeHash: row.code_hash,
    computerName: row.computer_name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    id: row.id,
    registrationTokenExpiresAt: row.registration_token_expires_at,
    registrationTokenHash: row.registration_token_hash,
    status: row.status as ComputerPairingStatus,
    teamId: row.team_id,
    userId: row.user_id
  };
}

function toAgent(row: AgentRow): ComputerAgentRecord {
  return {
    capabilities: parseCapabilities(row.capabilities),
    createdAt: row.created_at,
    hostname: row.hostname,
    id: row.id,
    lastSeen: row.last_seen,
    name: row.name,
    platform: row.platform,
    publicKey: row.public_key,
    revokedAt: row.revoked_at,
    status: row.status as ComputerAgentStatus,
    teamId: row.team_id,
    userId: row.user_id
  };
}

function toConnection(row: ConnectionRow): ComputerAgentConnectionRecord {
  return {
    agentId: row.agent_id,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    id: row.id,
    sessionTokenHash: row.session_token_hash
  };
}

function toCommand(row: CommandRow): ComputerCommandRecord {
  return {
    agentId: row.agent_id,
    capability: row.capability,
    command: row.command,
    createdAt: row.created_at,
    denialReason: row.denial_reason,
    id: row.id,
    result: row.result,
    status: row.status as ComputerCommandStatus,
    updatedAt: row.updated_at,
    userId: row.user_id
  };
}

function toAuditLog(row: AuditLogRow): ComputerAuditLogRecord {
  return {
    agentId: row.agent_id,
    createdAt: row.created_at,
    detail: row.detail ? (JSON.parse(row.detail) as Record<string, unknown>) : null,
    event: row.event,
    id: row.id,
    userId: row.user_id
  };
}

function parseCapabilities(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
