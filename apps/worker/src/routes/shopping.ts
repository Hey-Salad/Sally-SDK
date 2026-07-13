import { Hono } from "hono";
import { z } from "zod";

import { jsonError, readJson } from "../http.js";
import type { WorkerEnv } from "../types.js";

const shoppingItemSchema = z.object({
  checked: z.boolean().optional(),
  name: z.string().min(1),
  qty: z.number().int().positive(),
  store: z.string().min(1)
});

const shoppingListSchema = z.object({
  createdAt: z.number().int().optional(),
  id: z.string().min(1).optional(),
  items: z.array(shoppingItemSchema).min(1),
  updatedAt: z.number().int().optional(),
  userId: z.string().min(1)
});

const shoppingNotifySchema = z.object({
  items: z.array(shoppingItemSchema).optional(),
  payload: z.record(z.unknown()).optional(),
  userId: z.string().min(1)
});

export const shoppingRoutes = new Hono<WorkerEnv>()
  .post("/list", async (context) => {
    try {
      const payload = await readJson(context, shoppingListSchema);
      const shoppingList = await context.get("queries").createShoppingList(payload);
      return context.json(shoppingList, 201);
    } catch (error) {
      return jsonError(context, 400, "Invalid shopping list payload", toMessage(error));
    }
  })
  .get("/list/:userId", async (context) => {
    const shoppingList = await context.get("queries").getLatestShoppingList(context.req.param("userId"));
    if (!shoppingList) {
      return jsonError(context, 404, "Shopping list not found");
    }
    return context.json(shoppingList);
  })
  .post("/start", async (context) => {
    try {
      const payload = await readJson(context, shoppingNotifySchema);
      const notification = await context.get("queries").createShoppingNotification({
        payload: toNotificationPayload(payload),
        userId: payload.userId
      });
      return context.json(notification, 201);
    } catch (error) {
      return jsonError(context, 400, "Invalid shopping start payload", toMessage(error));
    }
  })
  .post("/notify", async (context) => {
    try {
      const payload = await readJson(context, shoppingNotifySchema);
      const notification = await context.get("queries").createShoppingNotification({
        payload: toNotificationPayload(payload),
        userId: payload.userId
      });
      return context.json(notification, 201);
    } catch (error) {
      return jsonError(context, 400, "Invalid shopping notification payload", toMessage(error));
    }
  });

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown shopping error";
}

function toNotificationPayload(
  payload: z.infer<typeof shoppingNotifySchema>
): Record<string, unknown> {
  if (payload.payload) {
    return payload.payload;
  }

  return {
    items: payload.items ?? []
  };
}
