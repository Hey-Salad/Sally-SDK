import { Hono } from "hono";
import { z } from "zod";

import { jsonError, readQuery } from "../http.js";
import {
  fetchPolymarketIntelligence,
  fetchPolymarketMarkets
} from "../services/polymarket.js";
import type { WorkerEnv } from "../types.js";

const marketQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(40).optional(),
  q: z.string().max(160).optional()
});

const intelligenceQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).optional(),
  q: z.string().max(160).default("trending prediction markets")
});

export const polymarketRoutes = new Hono<WorkerEnv>()
  .get("/markets", async (context) => {
    try {
      const query = readQuery(context, marketQuerySchema);
      const items = await fetchPolymarketMarkets({ limit: query.limit, query: query.q });
      return context.json({ items });
    } catch (error) {
      return jsonError(context, 500, "Unable to fetch Polymarket markets", toMessage(error));
    }
  })
  .get("/intelligence", async (context) => {
    try {
      const query = readQuery(context, intelligenceQuerySchema);
      const item = await fetchPolymarketIntelligence({
        limit: query.limit,
        query: query.q ?? "trending prediction markets"
      });
      return context.json({ item });
    } catch (error) {
      return jsonError(context, 500, "Unable to build Polymarket intelligence", toMessage(error));
    }
  });

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Polymarket error";
}
