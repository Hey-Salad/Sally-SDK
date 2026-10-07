import { Hono } from "hono";
import { z } from "zod";

import { requireVerifiedUser } from "../auth/actor.js";
import { jsonError, readJson } from "../http.js";
import { createChatCompletionResponse, type OpenAIChatMessage } from "../services/openai.js";
import type { WorkerEnv } from "../types.js";

export const CHAT_MESSAGE_MAX_CHARS = 8_000;

const chatSchema = z.object({
  message: z.string().min(1).max(CHAT_MESSAGE_MAX_CHARS),
  sessionId: z.string().min(1).optional(),
  userId: z.string().min(1).max(320)
});

export const chatRoutes = new Hono<WorkerEnv>().post("/chat", async (context) => {
  const actor = requireVerifiedUser(context);
  if (actor instanceof Response) {
    return actor;
  }

  try {
    const payload = await readJson(context, chatSchema);
    const messages = buildMessages(payload.userId, payload.sessionId, payload.message);
    return await createChatCompletionResponse(context.env, messages);
  } catch (error) {
    return jsonError(context, 400, "Invalid chat payload", toMessage(error));
  }
});

function buildMessages(userId: string, sessionId: string | undefined, message: string): OpenAIChatMessage[] {
  const details = [`User ID: ${userId}`, sessionId ? `Session ID: ${sessionId}` : null, message].filter(
    Boolean
  );

  return [
    {
      content:
        "You are Sally Lab, a developer operations assistant for HeySalad. Be concise, technical, and action-oriented. Help with device control, testing, debugging, runtime state, and engineering workflows.",
      role: "system"
    },
    {
      content: details.join("\n"),
      role: "user"
    }
  ];
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown chat error";
}
