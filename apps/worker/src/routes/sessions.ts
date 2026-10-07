import { Hono } from "hono";
import { z } from "zod";

import { isManager, requireCaller, sameUser } from "../auth/actor.js";
import { jsonError, readJson } from "../http.js";
import type { WorkerEnv } from "../types.js";

const startSessionSchema = z.object({
  deviceId: z.string().min(1),
  id: z.string().min(1).optional(),
  ipAddress: z.string().ip().nullable().optional(),
  startedAt: z.number().int().optional(),
  userId: z.string().min(1).optional()
});

const stopSessionSchema = z.object({
  endedAt: z.number().int().optional(),
  id: z.string().min(1)
});

export const sessionsRoutes = new Hono<WorkerEnv>()
  .get("/", async (context) => {
    const caller = await requireCaller(context);
    if (caller instanceof Response) {
      return caller;
    }

    const items = await context.get("queries").listSessions();
    const visible = isManager(caller) ? items : items.filter((item) => sameUser(item.userId, caller.userId));
    return context.json({ items: visible });
  })
  .post("/start", async (context) => {
    const caller = await requireCaller(context);
    if (caller instanceof Response) {
      return caller;
    }

    try {
      const payload = await readJson(context, startSessionSchema);
      const session = await context.get("queries").startSession({
        ...payload,
        userId: caller.userId
      });
      return context.json({ item: session }, 201);
    } catch (error) {
      return jsonError(context, 400, "Invalid session start payload", toMessage(error));
    }
  })
  .post("/stop", async (context) => {
    const caller = await requireCaller(context);
    if (caller instanceof Response) {
      return caller;
    }

    try {
      const payload = await readJson(context, stopSessionSchema);
      const sessions = await context.get("queries").listSessions();
      const existing = sessions.find((item) => item.id === payload.id);
      if (!existing || (!isManager(caller) && !sameUser(existing.userId, caller.userId))) {
        return jsonError(context, 404, "Session not found");
      }

      const session = await context.get("queries").stopSession(payload.id, payload.endedAt);
      if (!session) {
        return jsonError(context, 404, "Session not found");
      }
      return context.json({ item: session });
    } catch (error) {
      return jsonError(context, 400, "Invalid session stop payload", toMessage(error));
    }
  });

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown session error";
}
