import { Hono } from "hono";
import { z } from "zod";

import { jsonError, readJson } from "../http.js";
import type { WorkerEnv } from "../types.js";

const teamSchema = z.object({
  createdAt: z.number().int().optional(),
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  slug: z.string().min(1)
});

export const teamsRoutes = new Hono<WorkerEnv>()
  .get("/", async (context) => {
    const items = await context.get("queries").listTeams();
    return context.json({ items });
  })
  .post("/", async (context) => {
    try {
      const payload = await readJson(context, teamSchema);
      const team = await context.get("queries").createTeam(payload);
      return context.json({ item: team }, 201);
    } catch (error) {
      return jsonError(context, 400, "Invalid team payload", toMessage(error));
    }
  });

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown team error";
}
