import { Hono } from "hono";
import { z } from "zod";

import { isManager, requireCaller, sameUser } from "../auth/actor.js";
import { jsonError, readJson } from "../http.js";
import { UnsafeUrlError } from "../security/public-url.js";
import { fetchRecipeExtraction } from "../services/openai.js";
import type { WorkerEnv } from "../types.js";

const recipeSchema = z.object({
  calories: z.number().int().nullable().optional(),
  ingredients: z.array(z.string().min(1)).min(1),
  steps: z.array(z.string().min(1)).min(1),
  time: z.string().min(1),
  title: z.string().min(1)
});

const extractSchema = z.object({
  url: z.string().url().max(2048),
  userId: z.string().min(1).max(320).optional()
});

const flattenedSaveRecipeSchema = z.object({
  calories: z.number().int().nullable().optional(),
  ingredients: z.array(z.string().min(1)).min(1),
  steps: z.array(z.string().min(1)).min(1),
  sourceUrl: z.string().url().nullable().optional(),
  time: z.string().min(1),
  title: z.string().min(1),
  userId: z.string().min(1).optional()
});

const nestedSaveRecipeSchema = z.object({
  recipe: recipeSchema,
  userId: z.string().min(1).optional()
});

const saveRecipeSchema = z.union([flattenedSaveRecipeSchema, nestedSaveRecipeSchema]);

export const recipesRoutes = new Hono<WorkerEnv>()
  .post("/extract", async (context) => {
    const caller = await requireCaller(context);
    if (caller instanceof Response) {
      return caller;
    }

    try {
      const payload = await readJson(context, extractSchema);
      const extracted = await fetchRecipeExtraction(context.env, payload.url, caller.userId);
      return context.json(extracted);
    } catch (error) {
      if (error instanceof UnsafeUrlError) {
        return jsonError(context, 400, error.message);
      }
      return jsonError(context, 400, "Invalid recipe extraction payload", toMessage(error));
    }
  })
  .post("/", async (context) => {
    const caller = await requireCaller(context);
    if (caller instanceof Response) {
      return caller;
    }

    try {
      const payload = await readJson(context, saveRecipeSchema);
      const recipe = await context.get("queries").createRecipe(normalizeRecipePayload(payload, caller.userId));
      return context.json(recipe, 201);
    } catch (error) {
      return jsonError(context, 400, "Invalid recipe payload", toMessage(error));
    }
  })
  .get("/:userId", async (context) => {
    const caller = await requireCaller(context);
    if (caller instanceof Response) {
      return caller;
    }

    const requested = context.req.param("userId");
    if (!isManager(caller) && !sameUser(requested, caller.userId)) {
      return jsonError(context, 403, "Insufficient permissions");
    }

    const recipes = await context.get("queries").listRecipes(requested);
    return context.json(recipes);
  });

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown recipe error";
}

function normalizeRecipePayload(
  payload: z.infer<typeof saveRecipeSchema>,
  userId: string
): {
  calories?: number | null | undefined;
  ingredients: string[];
  sourceUrl?: string | null | undefined;
  steps: string[];
  time: string;
  title: string;
  userId: string;
} {
  if ("recipe" in payload) {
    return {
      ...payload.recipe,
      userId
    };
  }

  return {
    ...payload,
    userId
  };
}
