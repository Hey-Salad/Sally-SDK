import { beforeEach, describe, expect, it, vi } from "vitest";

import { SallyClient } from "./client.js";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn()
}));

describe("SallyClient", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("fetches the health endpoint with auth headers", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          service: "sally-worker",
          ts: "2026-03-21T12:00:00.000Z",
          db: "ok",
          version: "1.0.0"
        }),
        {
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    const client = new SallyClient("https://api.example.com", "secret");
    const health = await client.health();
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [
      URL,
      RequestInit & { body?: unknown }
    ];

    expect(requestUrl.toString()).toBe("https://api.example.com/health");
    expect(requestInit.body).toBeUndefined();
    expect((requestInit.headers as Headers).get("Authorization")).toBe("Bearer secret");
    expect((requestInit.headers as Headers).get("Accept")).toBe(
      "application/json, text/event-stream"
    );
    expect(health.ok).toBe(true);
    expect(health.service).toBe("sally-worker");
  });

  it("streams chat tokens from SSE data lines", async () => {
    fetchMock.mockResolvedValue(
      new Response("data: hello\n\ndata: world\n\ndata: [DONE]\n\n", {
        headers: { "Content-Type": "text/event-stream" }
      })
    );

    const client = new SallyClient("https://api.example.com");
    const chunks = [] as string[];

    for await (const chunk of client.chat("hi", "user-1", "session-1")) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["hello", "world"]);
  });

  it("posts shopping items as JSON", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" }
      })
    );

    const client = new SallyClient("https://api.example.com");
    await client.addShoppingItems("user-1", [
      { name: "Milk", qty: 1, store: "Tesco" }
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("shopping/list", "https://api.example.com/"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          userId: "user-1",
          items: [{ name: "Milk", qty: 1, store: "Tesco" }]
        })
      })
    );
  });
});
