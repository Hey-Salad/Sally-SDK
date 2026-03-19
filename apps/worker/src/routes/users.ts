import { Hono } from "hono";
import { z } from "zod";

import { jsonError, readJson } from "../http.js";
import type { WorkerEnv } from "../types.js";

const userSchema = z.object({
  createdAt: z.number().int().optional(),
  email: z.string().email(),
  id: z.string().min(1).optional(),
  name: z.string().nullable().optional(),
  role: z.enum(["owner", "admin", "developer", "viewer"]).optional(),
  teamId: z.string().nullable().optional()
});

export const usersRoutes = new Hono<WorkerEnv>()
  .get("/", async (context) => {
    const items = await context.get("queries").listUsers();
    return context.json({ items });
  })
  .post("/", async (context) => {
    try {
      const payload = await readJson(context, userSchema);
      const user = await context.get("queries").createUser(payload);
      return context.json({ item: user }, 201);
    } catch (error) {
      return jsonError(context, 400, "Invalid user payload", toMessage(error));
    }
  });

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown user error";
}
