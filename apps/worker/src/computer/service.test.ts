import { generateKeyPairSync, sign as signEd25519, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";

import { connectSignaturePayload } from "./crypto.js";
import { createComputerAgentService, PAIRING_CODE_TTL_MS } from "./service.js";
import {
  ComputerAgentError,
  type ComputerAgentConnectionRecord,
  type ComputerAgentRecord,
  type ComputerAuditLogRecord,
  type ComputerCommandRecord,
  type ComputerPairingSessionRecord,
  type ComputerStore
} from "./types.js";

describe("computer agent service", () => {
  it("pairs, registers, connects, and executes a capability-scoped command", async () => {
    const harness = createHarness();
    const { privateKey, publicKey } = makeKeypair();

    const pairing = await harness.service.createPairingSession({ userId: "peter@heysalad.io" });
    expect(pairing.installCommand).toBe(`npx @heysalad/sally pair ${pairing.code}`);

    const claim = await harness.service.claimPairingSession({
      code: pairing.code,
      userId: "peter@heysalad.io"
    });
    const agent = await harness.service.registerAgent({
      name: "macmini",
      platform: "darwin",
      publicKey,
      registrationToken: claim.registrationToken,
      userId: "peter@heysalad.io"
    });
    expect(agent.status).toBe("active");
    expect(agent.capabilities).toContain("computer.status");

    const timestamp = harness.clock.now;
    const { sessionToken } = await harness.service.connectAgent({
      agentId: agent.id,
      signature: signPayload(privateKey, connectSignaturePayload(agent.id, timestamp)),
      timestamp
    });

    const command = await harness.service.submitCommand({
      agentId: agent.id,
      capability: "repo.status",
      command: "git status",
      userId: "peter@heysalad.io"
    });
    expect(command.status).toBe("queued");

    const queued = await harness.service.pollCommands({ agentId: agent.id, sessionToken });
    expect(queued.map((item) => item.id)).toEqual([command.id]);

    const completed = await harness.service.completeCommand({
      agentId: agent.id,
      commandId: command.id,
      result: "clean",
      sessionToken,
      status: "completed"
    });
    expect(completed.status).toBe("completed");
    expect(completed.result).toBe("clean");
  });

  it("rejects an expired pairing code", async () => {
    const harness = createHarness();
    const pairing = await harness.service.createPairingSession({ userId: "peter@heysalad.io" });

    harness.clock.now += PAIRING_CODE_TTL_MS + 1;
    await expect(
      harness.service.claimPairingSession({ code: pairing.code, userId: "peter@heysalad.io" })
    ).rejects.toMatchObject({ code: "expired", status: 410 });
  });

  it("only allows a pairing code to be claimed once", async () => {
    const harness = createHarness();
    const pairing = await harness.service.createPairingSession({ userId: "peter@heysalad.io" });

    await harness.service.claimPairingSession({ code: pairing.code, userId: "peter@heysalad.io" });
    await expect(
      harness.service.claimPairingSession({ code: pairing.code, userId: "peter@heysalad.io" })
    ).rejects.toMatchObject({ code: "conflict", status: 409 });
  });

  it("prevents another user from claiming someone else's pairing code", async () => {
    const harness = createHarness();
    const pairing = await harness.service.createPairingSession({ userId: "peter@heysalad.io" });

    await expect(
      harness.service.claimPairingSession({ code: pairing.code, userId: "mallory@example.com" })
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    expect(harness.auditEvents()).toContain("pairing.claim_denied");
  });

  it("only allows a registration token to be used once", async () => {
    const harness = createHarness();
    const { publicKey } = makeKeypair();
    const pairing = await harness.service.createPairingSession({ userId: "peter@heysalad.io" });
    const claim = await harness.service.claimPairingSession({
      code: pairing.code,
      userId: "peter@heysalad.io"
    });

    await harness.service.registerAgent({
      name: "macmini",
      publicKey,
      registrationToken: claim.registrationToken,
      userId: "peter@heysalad.io"
    });
    await expect(
      harness.service.registerAgent({
        name: "macmini-again",
        publicKey: makeKeypair().publicKey,
        registrationToken: claim.registrationToken,
        userId: "peter@heysalad.io"
      })
    ).rejects.toMatchObject({ code: "conflict", status: 409 });
  });

  it("blocks a revoked computer from connecting", async () => {
    const harness = createHarness();
    const { privateKey, agent } = await provisionAgent(harness);

    await harness.service.revokeAgent({ agentId: agent.id, userId: "peter@heysalad.io" });

    const timestamp = harness.clock.now;
    await expect(
      harness.service.connectAgent({
        agentId: agent.id,
        signature: signPayload(privateKey, connectSignaturePayload(agent.id, timestamp)),
        timestamp
      })
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    expect(harness.auditEvents()).toContain("agent.connect_denied");
  });

  it("rejects a connect request signed by the wrong key", async () => {
    const harness = createHarness();
    const { agent } = await provisionAgent(harness);
    const impostor = makeKeypair();

    const timestamp = harness.clock.now;
    await expect(
      harness.service.connectAgent({
        agentId: agent.id,
        signature: signPayload(impostor.privateKey, connectSignaturePayload(agent.id, timestamp)),
        timestamp
      })
    ).rejects.toMatchObject({ code: "invalid_signature", status: 401 });
  });

  it("denies a command whose capability the agent does not have", async () => {
    const harness = createHarness();
    const { agent } = await provisionAgent(harness);

    const command = await harness.service.submitCommand({
      agentId: agent.id,
      capability: "shell.exec",
      command: "uname -a",
      userId: "peter@heysalad.io"
    });
    expect(command.status).toBe("denied");
    expect(command.denialReason).toContain("shell.exec");

    const queued = await harness.store.listCommandsForAgent(agent.id, "queued");
    expect(queued).toHaveLength(0);
  });

  it("denies secret-like prompts regardless of capability", async () => {
    const harness = createHarness();
    const { agent } = await provisionAgent(harness);

    const command = await harness.service.submitCommand({
      agentId: agent.id,
      capability: "computer.status",
      command: "cat ~/.ssh/id_ed25519 and read my private keys",
      userId: "peter@heysalad.io"
    });
    expect(command.status).toBe("denied");
    expect(command.denialReason).toMatch(/secret|private key/i);
  });

  it("prevents another user from commanding or revoking someone else's agent", async () => {
    const harness = createHarness();
    const { agent } = await provisionAgent(harness);

    await expect(
      harness.service.submitCommand({
        agentId: agent.id,
        capability: "computer.status",
        command: "status",
        userId: "mallory@example.com"
      })
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    await expect(
      harness.service.revokeAgent({ agentId: agent.id, userId: "mallory@example.com" })
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
  });

  it("writes an audit log entry for every command outcome", async () => {
    const harness = createHarness();
    const { agent } = await provisionAgent(harness);

    await harness.service.submitCommand({
      agentId: agent.id,
      capability: "computer.status",
      command: "status",
      userId: "peter@heysalad.io"
    });
    await harness.service.submitCommand({
      agentId: agent.id,
      capability: "shell.exec",
      command: "uname -a",
      userId: "peter@heysalad.io"
    });
    await harness.service.submitCommand({
      agentId: agent.id,
      capability: "computer.status",
      command: "show me the password file",
      userId: "peter@heysalad.io"
    });

    const events = harness.auditEvents();
    expect(events.filter((event) => event === "command.queued")).toHaveLength(1);
    expect(events.filter((event) => event === "command.denied")).toHaveLength(2);
  });

  it("rejects agent-plane calls with a bad or expired session token", async () => {
    const harness = createHarness();
    const { agent, privateKey } = await provisionAgent(harness);

    await expect(
      harness.service.pollCommands({ agentId: agent.id, sessionToken: "not-a-token" })
    ).rejects.toMatchObject({ code: "invalid_signature", status: 401 });

    const timestamp = harness.clock.now;
    const { sessionToken } = await harness.service.connectAgent({
      agentId: agent.id,
      signature: signPayload(privateKey, connectSignaturePayload(agent.id, timestamp)),
      timestamp
    });
    harness.clock.now += 61 * 60 * 1000;
    await expect(
      harness.service.pollCommands({ agentId: agent.id, sessionToken })
    ).rejects.toMatchObject({ code: "expired", status: 401 });
  });
});

interface Harness {
  auditEvents(): string[];
  clock: { now: number };
  service: ReturnType<typeof createComputerAgentService>;
  store: ComputerStore;
}

function createHarness(): Harness {
  const clock = { now: 1_750_000_000_000 };
  const audits: ComputerAuditLogRecord[] = [];
  const store = createMemoryStore(audits);
  const service = createComputerAgentService({ now: () => clock.now, store });
  return {
    auditEvents: () => audits.map((entry) => entry.event),
    clock,
    service,
    store
  };
}

async function provisionAgent(harness: Harness): Promise<{
  agent: ComputerAgentRecord;
  privateKey: KeyObject;
}> {
  const { privateKey, publicKey } = makeKeypair();
  const pairing = await harness.service.createPairingSession({ userId: "peter@heysalad.io" });
  const claim = await harness.service.claimPairingSession({
    code: pairing.code,
    userId: "peter@heysalad.io"
  });
  const agent = await harness.service.registerAgent({
    name: "macmini",
    publicKey,
    registrationToken: claim.registrationToken,
    userId: "peter@heysalad.io"
  });
  return { agent, privateKey };
}

function makeKeypair(): { privateKey: KeyObject; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKey,
    publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64")
  };
}

function signPayload(privateKey: KeyObject, payload: string): string {
  return signEd25519(null, Buffer.from(payload, "utf8"), privateKey).toString("base64");
}

function createMemoryStore(audits: ComputerAuditLogRecord[]): ComputerStore {
  const pairingSessions = new Map<string, ComputerPairingSessionRecord>();
  const agents = new Map<string, ComputerAgentRecord>();
  const connections = new Map<string, ComputerAgentConnectionRecord>();
  const commands = new Map<string, ComputerCommandRecord>();

  return {
    async createPairingSession(record) {
      pairingSessions.set(record.id, { ...record });
    },
    async getPairingSessionByCodeHash(codeHash) {
      return clone([...pairingSessions.values()].find((item) => item.codeHash === codeHash));
    },
    async getPairingSessionByRegistrationTokenHash(tokenHash) {
      return clone(
        [...pairingSessions.values()].find((item) => item.registrationTokenHash === tokenHash)
      );
    },
    async markPairingSessionClaimed(id, input) {
      const session = pairingSessions.get(id);
      if (session) {
        session.claimedAt = input.claimedAt;
        session.registrationTokenExpiresAt = input.registrationTokenExpiresAt;
        session.registrationTokenHash = input.registrationTokenHash;
        session.status = "claimed";
      }
    },
    async markPairingSessionCompleted(id, input) {
      const session = pairingSessions.get(id);
      if (session) {
        session.agentId = input.agentId;
        session.status = "completed";
      }
    },
    async markPairingSessionStatus(id, status) {
      const session = pairingSessions.get(id);
      if (session) {
        session.status = status;
      }
    },
    async createAgent(record) {
      agents.set(record.id, { ...record, capabilities: [...record.capabilities] });
    },
    async getAgent(id) {
      return clone(agents.get(id));
    },
    async listAgentsForUser(userId) {
      return [...agents.values()].filter((item) => item.userId === userId).map((item) => clone(item)!);
    },
    async markAgentRevoked(id, revokedAt) {
      const agent = agents.get(id);
      if (agent) {
        agent.revokedAt = revokedAt;
        agent.status = "revoked";
      }
    },
    async updateAgentLastSeen(id, lastSeen) {
      const agent = agents.get(id);
      if (agent) {
        agent.lastSeen = lastSeen;
      }
    },
    async createConnection(record) {
      connections.set(record.id, { ...record });
    },
    async getConnectionByTokenHash(tokenHash) {
      return clone(
        [...connections.values()].find((item) => item.sessionTokenHash === tokenHash)
      );
    },
    async createCommand(record) {
      commands.set(record.id, { ...record });
    },
    async getCommand(id) {
      return clone(commands.get(id));
    },
    async listCommandsForAgent(agentId, status) {
      return [...commands.values()]
        .filter((item) => item.agentId === agentId && (!status || item.status === status))
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((item) => clone(item)!);
    },
    async updateCommand(id, input) {
      const command = commands.get(id);
      if (command) {
        command.result = input.result ?? null;
        command.status = input.status;
        command.updatedAt = input.updatedAt;
      }
    },
    async appendAuditLog(record) {
      audits.push({ ...record });
    },
    async listAuditLogs(agentId) {
      return audits
        .filter((item) => !agentId || item.agentId === agentId)
        .map((item) => ({ ...item }));
    }
  };
}

function clone<T>(value: T | undefined): T | null {
  return value === undefined ? null : structuredClone(value);
}
