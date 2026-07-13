import {
  connectSignaturePayload,
  generatePairingCode,
  generateToken,
  normalizePairingCode,
  sha256Hex,
  verifyEd25519Signature
} from "./crypto.js";
import { DEFAULT_AGENT_CAPABILITIES, evaluateCommandPolicy } from "./policy.js";
import {
  ComputerAgentError,
  type AgentSessionInput,
  type ClaimComputerPairingSessionInput,
  type ClaimComputerPairingSessionResult,
  type CompleteComputerCommandInput,
  type ComputerAgentRecord,
  type ComputerAgentService,
  type ComputerAuditLogRecord,
  type ComputerCommandRecord,
  type ComputerStore,
  type ConnectComputerAgentInput,
  type ConnectComputerAgentResult,
  type CreateComputerPairingSessionInput,
  type CreateComputerPairingSessionResult,
  type RegisterComputerAgentInput,
  type SubmitComputerCommandInput
} from "./types.js";

export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
export const REGISTRATION_TOKEN_TTL_MS = 10 * 60 * 1000;
export const CONNECTION_TTL_MS = 60 * 60 * 1000;
export const CONNECT_SIGNATURE_SKEW_MS = 2 * 60 * 1000;

export interface ComputerAgentServiceOptions {
  store: ComputerStore;
  now?: (() => number) | undefined;
  idFactory?: (() => string) | undefined;
  codeFactory?: (() => string) | undefined;
  tokenFactory?: (() => string) | undefined;
  verifySignature?: typeof verifyEd25519Signature | undefined;
}

export function createComputerAgentService(
  options: ComputerAgentServiceOptions
): ComputerAgentService {
  const store = options.store;
  const now = options.now ?? (() => Date.now());
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const codeFactory = options.codeFactory ?? generatePairingCode;
  const tokenFactory = options.tokenFactory ?? generateToken;
  const verifySignature = options.verifySignature ?? verifyEd25519Signature;

  async function audit(
    event: string,
    agentId: string | null,
    userId: string | null,
    detail: Record<string, unknown> | null = null
  ): Promise<void> {
    const record: ComputerAuditLogRecord = {
      agentId,
      createdAt: now(),
      detail,
      event,
      id: idFactory(),
      userId
    };
    await store.appendAuditLog(record);
  }

  async function requireAgentSession(input: AgentSessionInput): Promise<ComputerAgentRecord> {
    const connection = await store.getConnectionByTokenHash(await sha256Hex(input.sessionToken));
    if (!connection || connection.agentId !== input.agentId) {
      throw new ComputerAgentError("invalid_signature", 401, "Invalid agent session token");
    }
    if (connection.closedAt !== null || connection.expiresAt <= now()) {
      throw new ComputerAgentError("expired", 401, "Agent session has expired");
    }
    const agent = await store.getAgent(input.agentId);
    if (!agent) {
      throw new ComputerAgentError("not_found", 404, "Computer agent not found");
    }
    if (agent.status !== "active") {
      throw new ComputerAgentError("forbidden", 403, "Computer agent has been revoked");
    }
    return agent;
  }

  async function requireOwnedAgent(agentId: string, userId: string): Promise<ComputerAgentRecord> {
    const agent = await store.getAgent(agentId);
    if (!agent) {
      throw new ComputerAgentError("not_found", 404, "Computer agent not found");
    }
    if (agent.userId !== userId) {
      throw new ComputerAgentError("forbidden", 403, "Computer agent belongs to another user");
    }
    return agent;
  }

  return {
    async createPairingSession(
      input: CreateComputerPairingSessionInput
    ): Promise<CreateComputerPairingSessionResult> {
      const code = codeFactory();
      const createdAt = now();
      const session = {
        agentId: null,
        claimedAt: null,
        codeHash: await sha256Hex(normalizePairingCode(code)),
        computerName: input.computerName ?? null,
        createdAt,
        expiresAt: createdAt + PAIRING_CODE_TTL_MS,
        id: idFactory(),
        registrationTokenExpiresAt: null,
        registrationTokenHash: null,
        status: "pending" as const,
        teamId: input.teamId ?? null,
        userId: input.userId
      };
      await store.createPairingSession(session);
      await audit("pairing.created", null, input.userId, { sessionId: session.id });
      return {
        code,
        installCommand: `npx @heysalad/sally pair ${code}`,
        session
      };
    },

    async claimPairingSession(
      input: ClaimComputerPairingSessionInput
    ): Promise<ClaimComputerPairingSessionResult> {
      const codeHash = await sha256Hex(normalizePairingCode(input.code));
      const session = await store.getPairingSessionByCodeHash(codeHash);
      if (!session) {
        throw new ComputerAgentError("not_found", 404, "Pairing code not found");
      }
      if (session.userId !== input.userId) {
        await audit("pairing.claim_denied", null, input.userId, {
          reason: "user_mismatch",
          sessionId: session.id
        });
        throw new ComputerAgentError("forbidden", 403, "Pairing code belongs to another user");
      }
      if (session.status !== "pending") {
        throw new ComputerAgentError("conflict", 409, "Pairing code has already been used");
      }
      if (session.expiresAt <= now()) {
        await store.markPairingSessionStatus(session.id, "expired");
        throw new ComputerAgentError("expired", 410, "Pairing code has expired");
      }

      const registrationToken = tokenFactory();
      const registrationTokenExpiresAt = now() + REGISTRATION_TOKEN_TTL_MS;
      await store.markPairingSessionClaimed(session.id, {
        claimedAt: now(),
        registrationTokenExpiresAt,
        registrationTokenHash: await sha256Hex(registrationToken)
      });
      await audit("pairing.claimed", null, input.userId, { sessionId: session.id });
      return { registrationToken, registrationTokenExpiresAt, sessionId: session.id };
    },

    async registerAgent(input: RegisterComputerAgentInput): Promise<ComputerAgentRecord> {
      const tokenHash = await sha256Hex(input.registrationToken);
      const session = await store.getPairingSessionByRegistrationTokenHash(tokenHash);
      if (!session) {
        throw new ComputerAgentError("not_found", 404, "Registration token not found");
      }
      if (session.userId !== input.userId) {
        throw new ComputerAgentError("forbidden", 403, "Registration token belongs to another user");
      }
      if (session.status !== "claimed") {
        throw new ComputerAgentError("conflict", 409, "Registration token has already been used");
      }
      if ((session.registrationTokenExpiresAt ?? 0) <= now()) {
        await store.markPairingSessionStatus(session.id, "expired");
        throw new ComputerAgentError("expired", 410, "Registration token has expired");
      }
      if (!input.publicKey.trim()) {
        throw new ComputerAgentError("invalid_input", 400, "A device public key is required");
      }

      const agent: ComputerAgentRecord = {
        capabilities: [...DEFAULT_AGENT_CAPABILITIES],
        createdAt: now(),
        hostname: input.hostname ?? null,
        id: idFactory(),
        lastSeen: null,
        name: input.name,
        platform: input.platform ?? null,
        publicKey: input.publicKey,
        revokedAt: null,
        status: "active",
        teamId: session.teamId,
        userId: session.userId
      };
      await store.createAgent(agent);
      await store.markPairingSessionCompleted(session.id, { agentId: agent.id });
      await audit("agent.registered", agent.id, session.userId, {
        name: agent.name,
        sessionId: session.id
      });
      return agent;
    },

    async connectAgent(input: ConnectComputerAgentInput): Promise<ConnectComputerAgentResult> {
      const agent = await store.getAgent(input.agentId);
      if (!agent) {
        throw new ComputerAgentError("not_found", 404, "Computer agent not found");
      }
      if (agent.status !== "active") {
        await audit("agent.connect_denied", agent.id, agent.userId, { reason: "revoked" });
        throw new ComputerAgentError("forbidden", 403, "Computer agent has been revoked");
      }
      if (Math.abs(now() - input.timestamp) > CONNECT_SIGNATURE_SKEW_MS) {
        await audit("agent.connect_denied", agent.id, agent.userId, { reason: "stale_timestamp" });
        throw new ComputerAgentError("invalid_signature", 401, "Connect timestamp is outside the allowed window");
      }
      const validSignature = await verifySignature(
        agent.publicKey,
        connectSignaturePayload(agent.id, input.timestamp),
        input.signature
      );
      if (!validSignature) {
        await audit("agent.connect_denied", agent.id, agent.userId, { reason: "bad_signature" });
        throw new ComputerAgentError("invalid_signature", 401, "Connect signature verification failed");
      }

      const sessionToken = tokenFactory();
      const connection = {
        agentId: agent.id,
        closedAt: null,
        createdAt: now(),
        expiresAt: now() + CONNECTION_TTL_MS,
        id: idFactory(),
        sessionTokenHash: await sha256Hex(sessionToken)
      };
      await store.createConnection(connection);
      await store.updateAgentLastSeen(agent.id, now());
      await audit("agent.connected", agent.id, agent.userId, { connectionId: connection.id });
      return { connection, sessionToken };
    },

    async submitCommand(input: SubmitComputerCommandInput): Promise<ComputerCommandRecord> {
      const agent = await requireOwnedAgent(input.agentId, input.userId);
      if (agent.status !== "active") {
        throw new ComputerAgentError("forbidden", 403, "Computer agent has been revoked");
      }

      const createdAt = now();
      const base = {
        agentId: agent.id,
        capability: input.capability,
        command: input.command,
        createdAt,
        id: idFactory(),
        result: null,
        updatedAt: createdAt,
        userId: input.userId
      };

      const policyDenial = evaluateCommandPolicy(input.command);
      if (policyDenial) {
        const command: ComputerCommandRecord = {
          ...base,
          denialReason: policyDenial.reason,
          status: "denied"
        };
        await store.createCommand(command);
        await audit("command.denied", agent.id, input.userId, {
          category: policyDenial.category,
          commandId: command.id,
          reason: policyDenial.reason
        });
        return command;
      }

      if (!agent.capabilities.includes(input.capability)) {
        const command: ComputerCommandRecord = {
          ...base,
          denialReason: `Agent does not have the "${input.capability}" capability`,
          status: "denied"
        };
        await store.createCommand(command);
        await audit("command.denied", agent.id, input.userId, {
          commandId: command.id,
          reason: "missing_capability"
        });
        return command;
      }

      const command: ComputerCommandRecord = { ...base, denialReason: null, status: "queued" };
      await store.createCommand(command);
      await audit("command.queued", agent.id, input.userId, {
        capability: input.capability,
        commandId: command.id
      });
      return command;
    },

    async pollCommands(input: AgentSessionInput): Promise<ComputerCommandRecord[]> {
      const agent = await requireAgentSession(input);
      await store.updateAgentLastSeen(agent.id, now());
      return store.listCommandsForAgent(agent.id, "queued");
    },

    async completeCommand(input: CompleteComputerCommandInput): Promise<ComputerCommandRecord> {
      const agent = await requireAgentSession(input);
      const command = await store.getCommand(input.commandId);
      if (!command || command.agentId !== agent.id) {
        throw new ComputerAgentError("not_found", 404, "Command not found");
      }
      if (command.status !== "queued") {
        throw new ComputerAgentError("conflict", 409, "Command is not awaiting a result");
      }
      await store.updateCommand(command.id, {
        result: input.result ?? null,
        status: input.status,
        updatedAt: now()
      });
      await audit(`command.${input.status}`, agent.id, command.userId, { commandId: command.id });
      const updated = await store.getCommand(command.id);
      if (!updated) {
        throw new ComputerAgentError("not_found", 404, "Command not found after update");
      }
      return updated;
    },

    async listAgents(userId: string): Promise<ComputerAgentRecord[]> {
      return store.listAgentsForUser(userId);
    },

    async revokeAgent(input: { agentId: string; userId: string }): Promise<ComputerAgentRecord> {
      const agent = await requireOwnedAgent(input.agentId, input.userId);
      if (agent.status !== "revoked") {
        await store.markAgentRevoked(agent.id, now());
        await audit("agent.revoked", agent.id, input.userId, null);
      }
      const updated = await store.getAgent(agent.id);
      if (!updated) {
        throw new ComputerAgentError("not_found", 404, "Computer agent not found after revoke");
      }
      return updated;
    },

    async listAuditLogs(input: {
      agentId: string;
      userId: string;
    }): Promise<ComputerAuditLogRecord[]> {
      await requireOwnedAgent(input.agentId, input.userId);
      return store.listAuditLogs(input.agentId);
    }
  };
}
