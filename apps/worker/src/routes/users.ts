import { Hono } from "hono";
import { z } from "zod";

import { requireTeamRole } from "../auth/actor.js";
import { jsonError, readJson } from "../http.js";
import type { TeamRole, WorkerEnv } from "../types.js";

const userSchema = z.object({
  createdAt: z.number().int().optional(),
  email: z.string().email(),
  id: z.string().min(1).optional(),
  name: z.string().nullable().optional(),
  role: z.enum(["owner", "admin", "developer", "viewer"]).optional(),
  teamId: z.string().nullable().optional()
});

const managerRoles = ["owner", "admin"] as const satisfies readonly TeamRole[];

export const usersRoutes = new Hono<WorkerEnv>()
  .get("/", async (context) => {
    const actor = await requireTeamRole(context, managerRoles);
    if (actor instanceof Response) {
      return actor;
    }

    const items = await context.get("queries").listUsers();
    return context.json({ items });
  })
  .post("/", async (context) => {
    const actor = await requireTeamRole(context, managerRoles);
    if (actor instanceof Response) {
      return actor;
    }

    try {
      const payload = await readJson(context, userSchema);
      const role = assignableRole(payload.role);
      if (!role) {
        return jsonError(context, 403, "owner and admin roles cannot be assigned through this API");
      }

      const user = await context.get("queries").createUser({
        ...payload,
        role
      });
      return context.json({ item: user }, 201);
    } catch (error) {
      return jsonError(context, 400, "Invalid user payload", toMessage(error));
    }
  });

function assignableRole(role: "admin" | "developer" | "owner" | "viewer" | undefined): "developer" | "viewer" | null {
  if (role === undefined) {
    return "viewer";
  }
  if (role === "developer" || role === "viewer") {
    return role;
  }
  return null;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown user error";
}
