import { cors } from "hono/cors";
import { Hono } from "hono";
import { ZodError } from "zod";

import { createAccessMiddleware, type AccessMiddlewareOptions } from "./auth/middleware.js";
import { createComputerAgentService } from "./computer/service.js";
import { createD1ComputerStore } from "./computer/store.js";
import type { ComputerAgentService } from "./computer/types.js";
import { createQueryService } from "./db/queries.js";
import { jsonError } from "./http.js";
import { chatRoutes } from "./routes/chat.js";
import { computersRoutes } from "./routes/computers.js";
import { devicesRoutes } from "./routes/devices.js";
import { polymarketRoutes } from "./routes/polymarket.js";
import { recipesRoutes } from "./routes/recipes.js";
import { runsRoutes } from "./routes/runs.js";
import { sessionRoutes } from "./routes/session.js";
import { sessionsRoutes } from "./routes/sessions.js";
import { shoppingRoutes } from "./routes/shopping.js";
import { teamsRoutes } from "./routes/teams.js";
import { usersRoutes } from "./routes/users.js";
import type { QueryService, WorkerEnv } from "./types.js";

export interface AppOptions extends AccessMiddlewareOptions {
  computers?: ComputerAgentService | undefined;
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
    const computers =
      options.computers ??
      createComputerAgentService({
        now: options.now,
        store: createD1ComputerStore(context.env.DB)
      });
    context.set("auth", null);
    context.set("computers", computers);
    context.set("queries", queries);
    await next();
  });

  app.use("*", accessMiddleware);
  app.get("/", (context) => context.json({ service: "sally-worker", status: "ok" }));
  app.get("/health", async (context) => {
    let dbStatus: "ok" | "error" = "ok";

    try {
      await context.env.DB.prepare("SELECT 1").first();
    } catch {
      dbStatus = "error";
    }

    return context.json({
      db: dbStatus,
      ok: true,
      service: "sally-worker",
      ts: new Date().toISOString(),
      version: "1.0.0"
    });
  });
  app.route("/computers", computersRoutes);
  app.route("/devices", devicesRoutes);
  app.route("/runs", runsRoutes);
  app.route("/session", sessionRoutes);
  app.route("/sessions", sessionsRoutes);
  app.route("/shopping", shoppingRoutes);
  app.route("/recipes", recipesRoutes);
  app.route("/polymarket", polymarketRoutes);
  app.route("/", chatRoutes);
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
