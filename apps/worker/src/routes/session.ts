import { Hono } from "hono";
import { z } from "zod";

import { jsonError, readJson } from "../http.js";
import type { WorkerEnv } from "../types.js";

const sessionSyncSchema = z.object({
  context: z.record(z.unknown()),
  deviceId: z.string().min(1),
  id: z.string().min(1).optional(),
  platform: z.enum(["macos", "ios", "android", "web"]),
  updatedAt: z.number().int().optional(),
  userId: z.string().min(1)
});

export const sessionRoutes = new Hono<WorkerEnv>()
  .post("/sync", async (context) => {
    try {
      const payload = await readJson(context, sessionSyncSchema);
      const session = await context.get("queries").syncSession(payload);
      return context.json(session, 201);
    } catch (error) {
      return jsonError(context, 400, "Invalid session sync payload", toMessage(error));
    }
  })
  .get("/:userId", async (context) => {
    const sessions = await context.get("queries").listSessionsForUser(context.req.param("userId"));
    return context.json(sessions);
  });

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown session sync error";
}
