export type ComputerPairingStatus = "pending" | "claimed" | "completed" | "expired" | "revoked";
export type ComputerAgentStatus = "active" | "revoked";
export type ComputerCommandStatus = "queued" | "denied" | "completed" | "failed";

export interface ComputerPairingSessionRecord {
  id: string;
  codeHash: string;
  userId: string;
  teamId: string | null;
  computerName: string | null;
  status: ComputerPairingStatus;
  registrationTokenHash: string | null;
  registrationTokenExpiresAt: number | null;
  claimedAt: number | null;
  agentId: string | null;
  createdAt: number;
  expiresAt: number;
}

export interface ComputerAgentRecord {
  id: string;
  userId: string;
  teamId: string | null;
  name: string;
  platform: string | null;
  hostname: string | null;
  publicKey: string;
  capabilities: string[];
  status: ComputerAgentStatus;
  createdAt: number;
  lastSeen: number | null;
  revokedAt: number | null;
}

export interface ComputerAgentConnectionRecord {
  id: string;
  agentId: string;
  sessionTokenHash: string;
  createdAt: number;
  expiresAt: number;
  closedAt: number | null;
}

export interface ComputerCommandRecord {
  id: string;
  agentId: string;
  userId: string;
  capability: string;
  command: string;
  status: ComputerCommandStatus;
  denialReason: string | null;
  result: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ComputerAuditLogRecord {
  id: string;
  agentId: string | null;
  userId: string | null;
  event: string;
  detail: Record<string, unknown> | null;
  createdAt: number;
}

export interface ComputerStore {
  createPairingSession(record: ComputerPairingSessionRecord): Promise<void>;
  getPairingSessionByCodeHash(codeHash: string): Promise<ComputerPairingSessionRecord | null>;
  getPairingSessionByRegistrationTokenHash(
    tokenHash: string
  ): Promise<ComputerPairingSessionRecord | null>;
  markPairingSessionClaimed(
    id: string,
    input: { claimedAt: number; registrationTokenHash: string; registrationTokenExpiresAt: number }
  ): Promise<void>;
  markPairingSessionCompleted(id: string, input: { agentId: string }): Promise<void>;
  markPairingSessionStatus(id: string, status: ComputerPairingStatus): Promise<void>;
  createAgent(record: ComputerAgentRecord): Promise<void>;
  getAgent(id: string): Promise<ComputerAgentRecord | null>;
  listAgentsForUser(userId: string): Promise<ComputerAgentRecord[]>;
  markAgentRevoked(id: string, revokedAt: number): Promise<void>;
  updateAgentLastSeen(id: string, lastSeen: number): Promise<void>;
  createConnection(record: ComputerAgentConnectionRecord): Promise<void>;
  getConnectionByTokenHash(tokenHash: string): Promise<ComputerAgentConnectionRecord | null>;
  createCommand(record: ComputerCommandRecord): Promise<void>;
  getCommand(id: string): Promise<ComputerCommandRecord | null>;
  listCommandsForAgent(
    agentId: string,
    status?: ComputerCommandStatus | undefined
  ): Promise<ComputerCommandRecord[]>;
  updateCommand(
    id: string,
    input: {
      status: ComputerCommandStatus;
      result?: string | null | undefined;
      updatedAt: number;
    }
  ): Promise<void>;
  appendAuditLog(record: ComputerAuditLogRecord): Promise<void>;
  listAuditLogs(agentId?: string | undefined): Promise<ComputerAuditLogRecord[]>;
}

export interface CreateComputerPairingSessionInput {
  userId: string;
  teamId?: string | null | undefined;
  computerName?: string | null | undefined;
}

export interface CreateComputerPairingSessionResult {
  session: ComputerPairingSessionRecord;
  code: string;
  installCommand: string;
}

export interface ClaimComputerPairingSessionInput {
  code: string;
  userId: string;
}

export interface ClaimComputerPairingSessionResult {
  sessionId: string;
  registrationToken: string;
  registrationTokenExpiresAt: number;
}

export interface RegisterComputerAgentInput {
  registrationToken: string;
  userId: string;
  name: string;
  platform?: string | null | undefined;
  hostname?: string | null | undefined;
  publicKey: string;
}

export interface ConnectComputerAgentInput {
  agentId: string;
  timestamp: number;
  signature: string;
}

export interface ConnectComputerAgentResult {
  connection: ComputerAgentConnectionRecord;
  sessionToken: string;
}

export interface SubmitComputerCommandInput {
  agentId: string;
  userId: string;
  capability: string;
  command: string;
}

export interface AgentSessionInput {
  agentId: string;
  sessionToken: string;
}

export interface CompleteComputerCommandInput extends AgentSessionInput {
  commandId: string;
  status: "completed" | "failed";
  result?: string | null | undefined;
}

export interface ComputerAgentService {
  createPairingSession(
    input: CreateComputerPairingSessionInput
  ): Promise<CreateComputerPairingSessionResult>;
  claimPairingSession(
    input: ClaimComputerPairingSessionInput
  ): Promise<ClaimComputerPairingSessionResult>;
  registerAgent(input: RegisterComputerAgentInput): Promise<ComputerAgentRecord>;
  connectAgent(input: ConnectComputerAgentInput): Promise<ConnectComputerAgentResult>;
  submitCommand(input: SubmitComputerCommandInput): Promise<ComputerCommandRecord>;
  pollCommands(input: AgentSessionInput): Promise<ComputerCommandRecord[]>;
  completeCommand(input: CompleteComputerCommandInput): Promise<ComputerCommandRecord>;
  listAgents(userId: string): Promise<ComputerAgentRecord[]>;
  revokeAgent(input: { agentId: string; userId: string }): Promise<ComputerAgentRecord>;
  listAuditLogs(input: { agentId: string; userId: string }): Promise<ComputerAuditLogRecord[]>;
}

export type ComputerAgentErrorCode =
  | "not_found"
  | "forbidden"
  | "expired"
  | "conflict"
  | "invalid_signature"
  | "invalid_input";

export class ComputerAgentError extends Error {
  readonly code: ComputerAgentErrorCode;
  readonly status: 400 | 401 | 403 | 404 | 409 | 410;

  constructor(
    code: ComputerAgentErrorCode,
    status: 400 | 401 | 403 | 404 | 409 | 410,
    message: string
  ) {
    super(message);
    this.name = "ComputerAgentError";
    this.code = code;
    this.status = status;
  }
}
