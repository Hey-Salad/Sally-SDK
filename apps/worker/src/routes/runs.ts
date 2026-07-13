import { Hono } from "hono";
import { z } from "zod";

import { jsonError, readJson, readQuery } from "../http.js";
import type { DeviceRecord, TestRunCheckRecord, TestRunStatus, WorkerEnv } from "../types.js";

const listRunsSchema = z.object({
  deviceId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
  suite: z.string().min(1).optional(),
  userId: z.string().min(1).optional()
});

const startRunSchema = z.object({
  deviceId: z.string().min(1),
  sessionId: z.string().min(1).nullable().optional(),
  suite: z.string().min(1).optional(),
  userId: z.string().min(1)
});

export const runsRoutes = new Hono<WorkerEnv>()
  .get("/", async (context) => {
    try {
      const filters = readQuery(context, listRunsSchema);
      const items = await context.get("queries").listTestRuns(filters);
      return context.json({ items });
    } catch (error) {
      return jsonError(context, 400, "Invalid run query", toMessage(error));
    }
  })
  .get("/:id/status", async (context) => {
    const run = await context.get("queries").getTestRun(context.req.param("id"));
    if (!run) {
      return jsonError(context, 404, "Run not found");
    }
    return context.json({ item: run });
  })
  .get("/:id", async (context) => {
    const run = await context.get("queries").getTestRun(context.req.param("id"));
    if (!run) {
      return jsonError(context, 404, "Run not found");
    }
    return context.json({ item: run });
  })
  .post("/start", async (context) => {
    try {
      const payload = await readJson(context, startRunSchema);
      const queries = context.get("queries");
      const device = await queries.getDevice(payload.deviceId);
      if (!device) {
        return jsonError(context, 404, "Device not found");
      }

      const run = await queries.startTestRun({
        deviceId: device.id,
        platform: device.platform,
        sessionId: payload.sessionId ?? null,
        suite: payload.suite ?? "smoke",
        summary: `Smoke test started for ${device.name}`,
        userId: payload.userId
      });

      const finishedAt = Math.max(Date.now(), run.startedAt + 1);
      const completed = await queries.completeTestRun(run.id, {
        ...evaluateSmokeRun(device),
        durationMs: finishedAt - run.startedAt,
        finishedAt
      });

      if (!completed) {
        return jsonError(context, 500, "Unable to finalize run");
      }

      return context.json({ item: completed }, 201);
    } catch (error) {
      return jsonError(context, 400, "Invalid run payload", toMessage(error));
    }
  });

function evaluateSmokeRun(device: DeviceRecord): {
  checks: TestRunCheckRecord[];
  status: Exclude<TestRunStatus, "running">;
  summary: string;
} {
  const checks = [
    makeCheck(
      "device-online",
      "Device online",
      device.status === "online",
      device.status === "online"
        ? `${device.name} is online and ready.`
        : `${device.name} reported ${device.status}.`
    ),
    makeCheck(
      "agent-host",
      "Agent bridge",
      Boolean(device.agentHost),
      device.agentHost
        ? `Agent host ${device.agentHost} reported to Sally.`
        : "No agent host reported from the bridge."
    ),
    makeCheck(
      "stream-handoff",
      "Stream handoff",
      Boolean(device.tunnelUrl),
      device.tunnelUrl
        ? "Tunnel URL is ready for operator handoff."
        : "Tunnel URL is missing."
    )
  ];

  const passedCount = checks.filter((check) => check.status === "passed").length;
  const status = passedCount === checks.length ? "passed" : "failed";
  const summary =
    status === "passed"
      ? `Smoke run passed. ${passedCount}/${checks.length} checks green.`
      : `Smoke run failed. ${passedCount}/${checks.length} checks green.`;

  return { checks, status, summary };
}

function makeCheck(
  key: string,
  label: string,
  passed: boolean,
  detail: string
): TestRunCheckRecord {
  return {
    detail,
    key,
    label,
    status: passed ? "passed" : "failed"
  };
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown run error";
}
