import type { Context } from "hono";

import { jsonError } from "../http.js";
import type { AccessClaims, TeamRole, UserRecord, WorkerEnv } from "../types.js";

export interface Caller {
  role: TeamRole | null;
  teamId: string | null;
  userId: string;
}

export function canonicalUserId(claims: Pick<AccessClaims, "email" | "sub">): string | null {
  const email = claims.email?.trim().toLowerCase();
  if (email) {
    return email;
  }
  const sub = claims.sub.trim();
  return sub.length > 0 ? sub : null;
}

export function isManager(caller: Caller): boolean {
  return caller.role === "owner" || caller.role === "admin";
}

export function sameUser(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export async function requireCaller(context: Context<WorkerEnv>): Promise<Response | Caller> {
  const resolved = await resolveActor(context);
  if (resolved instanceof Response) {
    return resolved;
  }
  return resolved.caller;
}

export async function requireTeamRole(
  context: Context<WorkerEnv>,
  allowed: readonly TeamRole[]
): Promise<Response | UserRecord> {
  const resolved = await resolveActor(context);
  if (resolved instanceof Response) {
    return resolved;
  }
  if (!resolved.record?.role || !allowed.includes(resolved.record.role)) {
    return jsonError(context, 403, "Insufficient permissions");
  }
  return resolved.record;
}

async function resolveActor(
  context: Context<WorkerEnv>
): Promise<Response | { caller: Caller; record: UserRecord | null }> {
  const claims = context.get("auth");
  if (!claims?.sub) {
    return jsonError(context, 401, "Authentication required");
  }

  const userId = canonicalUserId(claims);
  if (!userId) {
    return jsonError(context, 401, "Authentication required");
  }

  const email = claims.email?.trim().toLowerCase();
  if (!email) {
    return { caller: { role: null, teamId: null, userId }, record: null };
  }

  const users = await context.get("queries").listUsers();
  const record = users.find((user) => user.email.toLowerCase() === email) ?? null;
  return {
    caller: {
      role: record?.role ?? null,
      teamId: record?.teamId ?? null,
      userId
    },
    record
  };
}
