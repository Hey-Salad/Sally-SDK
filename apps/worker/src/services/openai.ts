import type { WorkerBindings } from "../types.js";

export interface OpenAIChatMessage {
  content: string;
  role: "system" | "user" | "assistant";
}

export interface RecipeExtractionResult {
  calories: number | null;
  ingredients: string[];
  steps: string[];
  time: string;
  title: string;
}

export function openAIConfig(bindings: WorkerBindings) {
  const apiKey = bindings.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  return {
    apiKey,
    baseUrl: bindings.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1",
    model: bindings.OPENAI_MODEL?.trim() || "gpt-4.1-mini"
  };
}

export async function fetchRecipeExtraction(
  bindings: WorkerBindings,
  url: string,
  userId: string
): Promise<RecipeExtractionResult> {
  const pageText = await fetchPageText(url);
  const config = openAIConfig(bindings);
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    body: JSON.stringify({
      messages: [
        {
          content:
            "You extract a cooking recipe from messy web content. Return strict JSON with title, ingredients, steps, time, and calories.",
          role: "system"
        },
        {
          content: [
            `User ID: ${userId}`,
            `Source URL: ${url}`,
            "Page content:",
            pageText
          ].join("\n\n"),
          role: "user"
        }
      ],
      model: config.model,
      response_format: { type: "json_object" },
      temperature: 0.2
    }),
    headers: openAIHeaders(config.apiKey),
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`OpenAI recipe extraction failed with status ${response.status}`);
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI recipe extraction returned no content");
  }

  const parsed = JSON.parse(content) as RecipeExtractionResult;
  validateRecipeExtraction(parsed);
  return parsed;
}

export async function createChatCompletionResponse(
  bindings: WorkerBindings,
  messages: OpenAIChatMessage[]
): Promise<Response> {
  const config = openAIConfig(bindings);
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    body: JSON.stringify({
      messages,
      model: config.model,
      stream: true,
      temperature: 0.7
    }),
    headers: openAIHeaders(config.apiKey),
    method: "POST"
  });

  if (!response.ok || !response.body) {
    throw new Error(`OpenAI chat request failed with status ${response.status}`);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          buffer = await flushChatChunks(buffer, controller, encoder);
        }
        buffer += decoder.decode();
        await flushChatChunks(buffer, controller, encoder, true);
      } catch (error) {
        controller.error(error);
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8"
    }
  });
}

async function fetchPageText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Sally Recipe Extractor"
    }
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch recipe URL: ${response.status}`);
  }

  const html = await response.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

async function flushChatChunks(
  buffer: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  final = false
): Promise<string> {
  let remainder = buffer;
  let separatorIndex = remainder.indexOf("\n\n");

  while (separatorIndex >= 0) {
    const chunk = remainder.slice(0, separatorIndex).trim();
    remainder = remainder.slice(separatorIndex + 2);
    emitChatChunk(chunk, controller, encoder);
    separatorIndex = remainder.indexOf("\n\n");
  }

  if (final && remainder.trim()) {
    emitChatChunk(remainder.trim(), controller, encoder);
    remainder = "";
  }

  return remainder;
}

function emitChatChunk(
  chunk: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder
): void {
  for (const line of chunk.split("\n")) {
    if (!line.startsWith("data: ")) {
      continue;
    }

    const payload = line.slice("data: ".length).trim();
    if (payload === "[DONE]") {
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      return;
    }

    try {
      const json = JSON.parse(payload) as {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.delta?.content;
      if (content) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: content })}\n\n`));
      }
    } catch {
      continue;
    }
  }
}

function openAIHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

function validateRecipeExtraction(value: RecipeExtractionResult): void {
  if (!value.title || !Array.isArray(value.ingredients) || !Array.isArray(value.steps)) {
    throw new Error("Invalid recipe extraction payload");
  }
}
