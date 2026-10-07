import type { Context } from "hono";

import { jsonError } from "../http.js";
import type { TeamRole, UserRecord, WorkerEnv } from "../types.js";

export function requireVerifiedUser(context: Context<WorkerEnv>): Response | { email?: string | undefined; sub: string } {
  const claims = context.get("auth");
  if (!claims?.sub) {
    return jsonError(context, 401, "Authentication required");
  }

  return claims;
}

export async function requireTeamRole(
  context: Context<WorkerEnv>,
  allowed: readonly TeamRole[]
): Promise<Response | UserRecord> {
  const actor = requireVerifiedUser(context);
  if (actor instanceof Response) {
    return actor;
  }

  const email = actor.email?.trim().toLowerCase();
  if (!email) {
    return jsonError(context, 403, "Authenticated email is required");
  }

  const users = await context.get("queries").listUsers();
  const record = users.find((user) => user.email.toLowerCase() === email);
  if (!record?.role || !allowed.includes(record.role)) {
    return jsonError(context, 403, "Insufficient permissions");
  }

  return record;
}
