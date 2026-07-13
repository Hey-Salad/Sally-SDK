import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";

import { ComputerAgentError } from "../computer/types.js";
import { jsonError, readJson } from "../http.js";
import type { WorkerEnv } from "../types.js";

const createPairingSessionSchema = z.object({
  computerName: z.string().min(1).max(120).optional(),
  teamId: z.string().min(1).optional()
});

const claimPairingSessionSchema = z.object({
  code: z.string().min(4).max(64)
});

const registerAgentSchema = z.object({
  hostname: z.string().min(1).max(255).optional(),
  name: z.string().min(1).max(120),
  platform: z.string().min(1).max(32).optional(),
  publicKey: z.string().min(16).max(4096),
  registrationToken: z.string().min(16).max(512)
});

const connectAgentSchema = z.object({
  agentId: z.string().min(1),
  signature: z.string().min(16).max(4096),
  timestamp: z.number().int()
});

const submitCommandSchema = z.object({
  capability: z.string().min(1).max(120),
  command: z.string().min(1).max(4000)
});

const commandResultSchema = z.object({
  result: z.string().max(64_000).nullable().optional(),
  status: z.enum(["completed", "failed"])
});

export const computersRoutes = new Hono<WorkerEnv>()
  .post("/pairing-sessions", async (context) => {
    const userId = requireUserId(context);
    if (!userId) {
      return jsonError(context, 401, "Authentication required");
    }
    try {
      const payload = await readJson(context, createPairingSessionSchema);
      const result = await context.get("computers").createPairingSession({
        computerName: payload.computerName ?? null,
        teamId: payload.teamId ?? null,
        userId
      });
      return context.json(
        {
          code: result.code,
          expiresAt: result.session.expiresAt,
          installCommand: result.installCommand,
          sessionId: result.session.id
        },
        201
      );
    } catch (error) {
      return handleComputerError(context, error);
    }
  })
  .post("/pairing-sessions/claim", async (context) => {
    const userId = requireUserId(context);
    if (!userId) {
      return jsonError(context, 401, "Authentication required");
    }
    try {
      const payload = await readJson(context, claimPairingSessionSchema);
      const result = await context.get("computers").claimPairingSession({
        code: payload.code,
        userId
      });
      return context.json(result);
    } catch (error) {
      return handleComputerError(context, error);
    }
  })
  .post("/agents", async (context) => {
    const userId = requireUserId(context);
    if (!userId) {
      return jsonError(context, 401, "Authentication required");
    }
    try {
      const payload = await readJson(context, registerAgentSchema);
      const agent = await context.get("computers").registerAgent({
        hostname: payload.hostname ?? null,
        name: payload.name,
        platform: payload.platform ?? null,
        publicKey: payload.publicKey,
        registrationToken: payload.registrationToken,
        userId
      });
      return context.json({ item: agent }, 201);
    } catch (error) {
      return handleComputerError(context, error);
    }
  })
  .get("/agents", async (context) => {
    const userId = requireUserId(context);
    if (!userId) {
      return jsonError(context, 401, "Authentication required");
    }
    const items = await context.get("computers").listAgents(userId);
    return context.json({ items });
  })
  .post("/agents/:id/commands", async (context) => {
    const userId = requireUserId(context);
    if (!userId) {
      return jsonError(context, 401, "Authentication required");
    }
    try {
      const payload = await readJson(context, submitCommandSchema);
      const command = await context.get("computers").submitCommand({
        agentId: context.req.param("id"),
        capability: payload.capability,
        command: payload.command,
        userId
      });
      if (command.status === "denied") {
        return context.json({ item: command }, 403);
      }
      return context.json({ item: command }, 201);
    } catch (error) {
      return handleComputerError(context, error);
    }
  })
  .post("/agents/:id/revoke", async (context) => {
    const userId = requireUserId(context);
    if (!userId) {
      return jsonError(context, 401, "Authentication required");
    }
    try {
      const agent = await context.get("computers").revokeAgent({
        agentId: context.req.param("id"),
        userId
      });
      return context.json({ item: agent });
    } catch (error) {
      return handleComputerError(context, error);
    }
  })
  .get("/agents/:id/audit-logs", async (context) => {
    const userId = requireUserId(context);
    if (!userId) {
      return jsonError(context, 401, "Authentication required");
    }
    try {
      const items = await context.get("computers").listAuditLogs({
        agentId: context.req.param("id"),
        userId
      });
      return context.json({ items });
    } catch (error) {
      return handleComputerError(context, error);
    }
  })
  // Agent plane: authenticated by device signature / agent session token, not Access.
  .post("/link/connect", async (context) => {
    try {
      const payload = await readJson(context, connectAgentSchema);
      const result = await context.get("computers").connectAgent(payload);
      return context.json({
        connectionId: result.connection.id,
        expiresAt: result.connection.expiresAt,
        sessionToken: result.sessionToken
      });
    } catch (error) {
      return handleComputerError(context, error);
    }
  })
  .get("/link/commands", async (context) => {
    const session = readAgentSession(context);
    if (!session) {
      return jsonError(context, 401, "Missing agent session headers");
    }
    try {
      const items = await context.get("computers").pollCommands(session);
      return context.json({ items });
    } catch (error) {
      return handleComputerError(context, error);
    }
  })
  .post("/link/commands/:commandId/result", async (context) => {
    const session = readAgentSession(context);
    if (!session) {
      return jsonError(context, 401, "Missing agent session headers");
    }
    try {
      const payload = await readJson(context, commandResultSchema);
      const command = await context.get("computers").completeCommand({
        ...session,
        commandId: context.req.param("commandId"),
        result: payload.result ?? null,
        status: payload.status
      });
      return context.json({ item: command });
    } catch (error) {
      return handleComputerError(context, error);
    }
  });

function requireUserId(context: Context<WorkerEnv>): string | null {
  const claims = context.get("auth");
  if (claims) {
    return claims.email ?? claims.sub;
  }
  // Auth is enforced by the Access middleware when REQUIRE_ACCESS_AUTH=true; the
  // local-dev identity only exists so the flow is testable with auth disabled.
  if (context.env.REQUIRE_ACCESS_AUTH !== "true" && context.env.SALLY_ENV === "development") {
    return "local-dev";
  }
  return null;
}

function readAgentSession(
  context: Context<WorkerEnv>
): { agentId: string; sessionToken: string } | null {
  const agentId = context.req.header("X-Sally-Agent-Id");
  const sessionToken = context.req.header("X-Sally-Agent-Session");
  if (!agentId || !sessionToken) {
    return null;
  }
  return { agentId, sessionToken };
}

function handleComputerError(context: Context<WorkerEnv>, error: unknown) {
  if (error instanceof ComputerAgentError) {
    return jsonError(context, error.status, error.message, { code: error.code });
  }
  if (error instanceof z.ZodError) {
    return jsonError(context, 400, "Request validation failed", error.flatten());
  }
  return jsonError(context, 400, "Invalid computer-agent request", toMessage(error));
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown computer-agent error";
}
