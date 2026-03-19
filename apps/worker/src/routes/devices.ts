import { Hono } from "hono";
import { z } from "zod";

import { jsonError, readJson, readQuery } from "../http.js";
import type { WorkerEnv } from "../types.js";

const deviceFilterSchema = z.object({
  status: z.string().optional(),
  teamId: z.string().optional()
});

const deviceSchema = z.object({
  agentHost: z.string().nullable().optional(),
  id: z.string().min(1),
  lastSeen: z.number().int().nullable().optional(),
  model: z.string().nullable().optional(),
  name: z.string().min(1),
  osVersion: z.string().nullable().optional(),
  platform: z.enum(["ios", "android"]),
  status: z.string().optional(),
  teamId: z.string().nullable().optional(),
  tunnelUrl: z.string().url().nullable().optional()
});

const devicePatchSchema = deviceSchema.partial().omit({ id: true, platform: true });

export const devicesRoutes = new Hono<WorkerEnv>()
  .get("/", async (context) => {
    try {
      const filters = readQuery(context, deviceFilterSchema);
      const items = await context.get("queries").listDevices(filters);
      return context.json({ items });
    } catch (error) {
      return jsonError(context, 400, "Invalid device query", toMessage(error));
    }
  })
  .post("/", async (context) => {
    try {
      const payload = await readJson(context, deviceSchema);
      const device = await context.get("queries").upsertDevice(payload);
      return context.json({ item: device }, 201);
    } catch (error) {
      return jsonError(context, 400, "Invalid device payload", toMessage(error));
    }
  })
  .patch("/:id", async (context) => {
    try {
      const payload = await readJson(context, devicePatchSchema);
      const device = await context.get("queries").updateDevice(context.req.param("id"), payload);
      if (!device) {
        return jsonError(context, 404, "Device not found");
      }
      return context.json({ item: device });
    } catch (error) {
      return jsonError(context, 400, "Invalid device update", toMessage(error));
    }
  });

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown device error";
}
