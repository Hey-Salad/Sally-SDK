import { Hono } from "hono";
import { z } from "zod";

import { isManager, requireCaller, sameUser } from "../auth/actor.js";
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
  userId: z.string().min(1).optional()
});

const shoppingNotifySchema = z.object({
  items: z.array(shoppingItemSchema).optional(),
  payload: z.record(z.unknown()).optional(),
  userId: z.string().min(1).optional()
});

export const shoppingRoutes = new Hono<WorkerEnv>()
  .post("/list", async (context) => {
    const caller = await requireCaller(context);
    if (caller instanceof Response) {
      return caller;
    }

    try {
      const payload = await readJson(context, shoppingListSchema);
      const shoppingList = await context.get("queries").createShoppingList({
        ...payload,
        userId: caller.userId
      });
      return context.json(shoppingList, 201);
    } catch (error) {
      return jsonError(context, 400, "Invalid shopping list payload", toMessage(error));
    }
  })
  .get("/list/:userId", async (context) => {
    const caller = await requireCaller(context);
    if (caller instanceof Response) {
      return caller;
    }

    const requested = context.req.param("userId");
    if (!isManager(caller) && !sameUser(requested, caller.userId)) {
      return jsonError(context, 403, "Insufficient permissions");
    }

    const shoppingList = await context.get("queries").getLatestShoppingList(requested);
    if (!shoppingList) {
      return jsonError(context, 404, "Shopping list not found");
    }
    return context.json(shoppingList);
  })
  .post("/start", async (context) => {
    const caller = await requireCaller(context);
    if (caller instanceof Response) {
      return caller;
    }

    try {
      const payload = await readJson(context, shoppingNotifySchema);
      const notification = await context.get("queries").createShoppingNotification({
        payload: toNotificationPayload(payload),
        userId: caller.userId
      });
      return context.json(notification, 201);
    } catch (error) {
      return jsonError(context, 400, "Invalid shopping start payload", toMessage(error));
    }
  })
  .post("/notify", async (context) => {
    const caller = await requireCaller(context);
    if (caller instanceof Response) {
      return caller;
    }

    try {
      const payload = await readJson(context, shoppingNotifySchema);
      const notification = await context.get("queries").createShoppingNotification({
        payload: toNotificationPayload(payload),
        userId: caller.userId
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
