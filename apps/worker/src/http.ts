import type { Context } from "hono";
import { z } from "zod";

import type { WorkerEnv } from "./types.js";

export function jsonError(
  context: Context<WorkerEnv>,
  status: 400 | 401 | 403 | 404 | 409 | 410 | 500,
  error: string,
  details?: unknown
) {
  return context.newResponse(
    JSON.stringify({ details, error }),
    status,
    { "content-type": "application/json" }
  );
}

export async function readJson<T>(
  context: Context<WorkerEnv>,
  schema: z.ZodType<T>
): Promise<T> {
  const payload = await context.req.json();
  return schema.parse(payload);
}

export function readQuery<T>(
  context: Context<WorkerEnv>,
  schema: z.ZodType<T>
): T {
  return schema.parse(context.req.query());
}
