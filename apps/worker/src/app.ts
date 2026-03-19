import { cors } from "hono/cors";
import { Hono } from "hono";
import { ZodError } from "zod";

import { createAccessMiddleware, type AccessMiddlewareOptions } from "./auth/middleware.js";
import { createQueryService } from "./db/queries.js";
import { jsonError } from "./http.js";
import { devicesRoutes } from "./routes/devices.js";
import { sessionsRoutes } from "./routes/sessions.js";
import { teamsRoutes } from "./routes/teams.js";
import { usersRoutes } from "./routes/users.js";
import type { QueryService, WorkerEnv } from "./types.js";

export interface AppOptions extends AccessMiddlewareOptions {
  now?: (() => number) | undefined;
  queries?: QueryService | undefined;
}

export function createApp(options: AppOptions = {}): Hono<WorkerEnv> {
  const app = new Hono<WorkerEnv>();
  const accessMiddleware = createAccessMiddleware(options);

  app.use(
    "*",
    cors({
      allowHeaders: ["Authorization", "Cf-Access-Jwt-Assertion", "Content-Type"],
      allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
      origin: "*"
    })
  );

  app.use("*", async (context, next) => {
    const queries = options.queries ?? createQueryService({ db: context.env.DB, now: options.now });
    context.set("auth", null);
    context.set("queries", queries);
    await next();
  });

  app.use("*", accessMiddleware);
  app.get("/", (context) => context.json({ service: "sally-worker", status: "ok" }));
  app.route("/devices", devicesRoutes);
  app.route("/sessions", sessionsRoutes);
  app.route("/users", usersRoutes);
  app.route("/teams", teamsRoutes);
  app.notFound((context) => jsonError(context, 404, "Route not found"));
  app.onError((error, context) => {
    if (error instanceof ZodError) {
      return jsonError(context, 400, "Request validation failed", error.flatten());
    }
    return jsonError(context, 500, "Unhandled worker error", error.message);
  });

  return app;
}
