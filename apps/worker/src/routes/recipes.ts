import { Hono } from "hono";
import { z } from "zod";

import { jsonError, readJson } from "../http.js";
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
  url: z.string().url(),
  userId: z.string().min(1)
});

const flattenedSaveRecipeSchema = z.object({
  calories: z.number().int().nullable().optional(),
  ingredients: z.array(z.string().min(1)).min(1),
  steps: z.array(z.string().min(1)).min(1),
  sourceUrl: z.string().url().nullable().optional(),
  time: z.string().min(1),
  title: z.string().min(1),
  userId: z.string().min(1)
});

const nestedSaveRecipeSchema = z.object({
  recipe: recipeSchema,
  userId: z.string().min(1)
});

const saveRecipeSchema = z.union([flattenedSaveRecipeSchema, nestedSaveRecipeSchema]);

export const recipesRoutes = new Hono<WorkerEnv>()
  .post("/extract", async (context) => {
    try {
      const payload = await readJson(context, extractSchema);
      const extracted = await fetchRecipeExtraction(context.env, payload.url, payload.userId);
      return context.json(extracted);
    } catch (error) {
      return jsonError(context, 400, "Invalid recipe extraction payload", toMessage(error));
    }
  })
  .post("/", async (context) => {
    try {
      const payload = await readJson(context, saveRecipeSchema);
      const recipe = await context.get("queries").createRecipe(normalizeRecipePayload(payload));
      return context.json(recipe, 201);
    } catch (error) {
      return jsonError(context, 400, "Invalid recipe payload", toMessage(error));
    }
  })
  .get("/:userId", async (context) => {
    const recipes = await context.get("queries").listRecipes(context.req.param("userId"));
    return context.json(recipes);
  });

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown recipe error";
}

function normalizeRecipePayload(
  payload: z.infer<typeof saveRecipeSchema>
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
      userId: payload.userId
    };
  }

  return payload;
}
