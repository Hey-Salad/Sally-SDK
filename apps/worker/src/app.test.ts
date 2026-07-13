import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "./app.js";
import type { AccessClaims, QueryService, WorkerBindings } from "./types.js";

describe("worker routes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns a direct health response", async () => {
    const app = createApp({ queries: createQueries() });
    const response = await app.fetch(new Request("https://sally.test/health"), makeEnv({ DB: createHealthDb() }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      db: "ok",
      ok: true,
      service: "sally-worker",
      version: "1.0.0"
    });
  });

  it("rejects protected routes when Access auth is required", async () => {
    const app = createApp({ queries: createQueries() });
    const response = await app.fetch(new Request("https://sally.test/devices"), makeEnv({ REQUIRE_ACCESS_AUTH: "true" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "Missing Cloudflare Access token" });
  });

  it("returns device data after Access verification", async () => {
    const queries = createQueries({
      listDevices: vi.fn().mockResolvedValue([
        {
          agentHost: "mac-mini-01",
          id: "device-1",
          lastSeen: 1742395000000,
          model: "iPhone 16 Pro",
          name: "HeySalad iPhone",
          osVersion: "18.1",
          platform: "ios",
          status: "online",
          teamId: "team-1",
          tunnelUrl: "https://device-1.heysalad.dev"
        }
      ])
    });
    const app = createApp({ queries, verifier: verify });
    const response = await app.fetch(withBearer("https://sally.test/devices"), makeEnv({ REQUIRE_ACCESS_AUTH: "true" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [
        {
          id: "device-1",
          status: "online"
        }
      ]
    });
    expect(queries.listDevices).toHaveBeenCalledWith({});
  });

  it("creates a team with a validated payload", async () => {
    const queries = createQueries({
      createTeam: vi.fn().mockResolvedValue({
        createdAt: 1742395000000,
        id: "team-1",
        name: "HeySalad",
        slug: "heysalad"
      })
    });
    const app = createApp({ queries, verifier: verify });
    const request = withBearer("https://sally.test/teams", {
      body: JSON.stringify({ name: "HeySalad", slug: "heysalad" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const response = await app.fetch(request, makeEnv({ REQUIRE_ACCESS_AUTH: "true" }));

    expect(response.status).toBe(201);
    expect(queries.createTeam).toHaveBeenCalledWith({ name: "HeySalad", slug: "heysalad" });
  });

  it("starts and stops sessions", async () => {
    const queries = createQueries({
      startSession: vi.fn().mockResolvedValue({
        deviceId: "device-1",
        endedAt: null,
        id: "session-1",
        ipAddress: "127.0.0.1",
        startedAt: 1742395000000,
        userId: "user-1"
      }),
      stopSession: vi.fn().mockResolvedValue({
        deviceId: "device-1",
        endedAt: 1742395600000,
        id: "session-1",
        ipAddress: "127.0.0.1",
        startedAt: 1742395000000,
        userId: "user-1"
      })
    });
    const app = createApp({ queries, verifier: verify });
    const startRequest = withBearer("https://sally.test/sessions/start", {
      body: JSON.stringify({
        deviceId: "device-1",
        ipAddress: "127.0.0.1",
        userId: "user-1"
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const stopRequest = withBearer("https://sally.test/sessions/stop", {
      body: JSON.stringify({ endedAt: 1742395600000, id: "session-1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    const startResponse = await app.fetch(startRequest, makeEnv({ REQUIRE_ACCESS_AUTH: "true" }));
    const stopResponse = await app.fetch(stopRequest, makeEnv({ REQUIRE_ACCESS_AUTH: "true" }));

    expect(startResponse.status).toBe(201);
    expect(stopResponse.status).toBe(200);
    expect(queries.startSession).toHaveBeenCalledWith({
      deviceId: "device-1",
      ipAddress: "127.0.0.1",
      userId: "user-1"
    });
    expect(queries.stopSession).toHaveBeenCalledWith("session-1", 1742395600000);
  });

  it("syncs sessions and returns the resource directly", async () => {
    const queries = createQueries({
      syncSession: vi.fn().mockResolvedValue({
        context: { shop: "groceries" },
        deviceId: "device-1",
        id: "sync-1",
        platform: "macos",
        updatedAt: 1742395000000,
        userId: "user-1"
      })
    });
    const app = createApp({ queries, verifier: verify });
    const response = await app.fetch(
      withBearer("https://sally.test/session/sync", {
        body: JSON.stringify({
          context: { shop: "groceries" },
          deviceId: "device-1",
          platform: "macos",
          userId: "user-1"
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      }),
      makeEnv({ REQUIRE_ACCESS_AUTH: "true" })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      deviceId: "device-1",
      id: "sync-1",
      platform: "macos",
      userId: "user-1"
    });
  });

  it("returns the latest session sync records as a direct array", async () => {
    const queries = createQueries({
      listSessionsForUser: vi.fn().mockResolvedValue([
        {
          context: { shop: "groceries" },
          deviceId: "device-1",
          id: "sync-1",
          platform: "macos",
          updatedAt: 1742395000000,
          userId: "user-1"
        }
      ])
    });
    const app = createApp({ queries, verifier: verify });
    const response = await app.fetch(withBearer("https://sally.test/session/user-1"), makeEnv({ REQUIRE_ACCESS_AUTH: "true" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        context: { shop: "groceries" },
        deviceId: "device-1",
        id: "sync-1",
        platform: "macos",
        updatedAt: 1742395000000,
        userId: "user-1"
      }
    ]);
  });

  it("starts a smoke run and returns the completed record", async () => {
    const queries = createQueries({
      completeTestRun: vi.fn().mockResolvedValue({
        checks: [
          {
            detail: "HeySalad iPhone is online and ready.",
            key: "device-online",
            label: "Device online",
            status: "passed"
          }
        ],
        createdAt: 1742395000000,
        deviceId: "device-1",
        durationMs: 1000,
        finishedAt: 1742395001000,
        id: "run-1",
        platform: "ios",
        sessionId: "session-1",
        startedAt: 1742395000000,
        status: "passed",
        suite: "smoke",
        summary: "Smoke run passed. 3/3 checks green.",
        updatedAt: 1742395001000,
        userId: "user-1"
      }),
      getDevice: vi.fn().mockResolvedValue({
        agentHost: "mac-mini-01",
        id: "device-1",
        lastSeen: 1742394999000,
        model: "iPhone 11 Pro",
        name: "HeySalad iPhone",
        osVersion: "18.7.1",
        platform: "ios",
        status: "online",
        teamId: "team-1",
        tunnelUrl: "https://device-1.heysalad.dev"
      }),
      startTestRun: vi.fn().mockResolvedValue({
        checks: [],
        createdAt: 1742395000000,
        deviceId: "device-1",
        durationMs: null,
        finishedAt: null,
        id: "run-1",
        platform: "ios",
        sessionId: "session-1",
        startedAt: 1742395000000,
        status: "running",
        suite: "smoke",
        summary: "Smoke test started for HeySalad iPhone",
        updatedAt: 1742395000000,
        userId: "user-1"
      })
    });
    const app = createApp({ queries, verifier: verify });
    const response = await app.fetch(
      withBearer("https://sally.test/runs/start", {
        body: JSON.stringify({
          deviceId: "device-1",
          sessionId: "session-1",
          userId: "user-1"
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      }),
      makeEnv({ REQUIRE_ACCESS_AUTH: "true" })
    );

    expect(response.status).toBe(201);
    expect(queries.startTestRun).toHaveBeenCalledWith({
      deviceId: "device-1",
      platform: "ios",
      sessionId: "session-1",
      suite: "smoke",
      summary: "Smoke test started for HeySalad iPhone",
      userId: "user-1"
    });
    expect(queries.completeTestRun).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({
        status: "passed",
        summary: "Smoke run passed. 3/3 checks green."
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      item: {
        id: "run-1",
        status: "passed",
        suite: "smoke"
      }
    });
  });

  it("lists test runs with CORS headers", async () => {
    const queries = createQueries({
      listTestRuns: vi.fn().mockResolvedValue([
        {
          checks: [],
          createdAt: 1742395000000,
          deviceId: "device-1",
          durationMs: 1800,
          finishedAt: 1742395001800,
          id: "run-1",
          platform: "ios",
          sessionId: "session-1",
          startedAt: 1742395000000,
          status: "passed",
          suite: "smoke",
          summary: "Smoke run passed. 3/3 checks green.",
          updatedAt: 1742395001800,
          userId: "user-1"
        }
      ])
    });
    const app = createApp({ queries, verifier: verify });
    const response = await app.fetch(
      withBearer("https://sally.test/runs?userId=user-1&limit=5", {
        headers: {
          Origin: "https://heysalad-sally-dashboard.pages.dev"
        }
      }),
      makeEnv({ REQUIRE_ACCESS_AUTH: "true" })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(queries.listTestRuns).toHaveBeenCalledWith({ limit: 5, userId: "user-1" });
    await expect(response.json()).resolves.toMatchObject({
      items: [{ id: "run-1", status: "passed" }]
    });
  });

  it("returns individual run status as a direct resource", async () => {
    const queries = createQueries({
      getTestRun: vi.fn().mockResolvedValue({
        checks: [],
        createdAt: 1742395000000,
        deviceId: "device-1",
        durationMs: 1800,
        finishedAt: 1742395001800,
        id: "run-1",
        platform: "ios",
        sessionId: "session-1",
        startedAt: 1742395000000,
        status: "failed",
        suite: "smoke",
        summary: "Smoke run failed. 2/3 checks green.",
        updatedAt: 1742395001800,
        userId: "user-1"
      })
    });
    const app = createApp({ queries, verifier: verify });
    const response = await app.fetch(
      withBearer("https://sally.test/runs/run-1/status"),
      makeEnv({ REQUIRE_ACCESS_AUTH: "true" })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      item: {
        id: "run-1",
        status: "failed"
      }
    });
  });

  it("returns the latest shopping list as a direct resource", async () => {
    const queries = createQueries({
      getLatestShoppingList: vi.fn().mockResolvedValue({
        createdAt: 1742395000000,
        id: "list-1",
        items: [{ name: "Milk", qty: 2, store: "Tesco" }],
        updatedAt: 1742395600000,
        userId: "user-1"
      })
    });
    const app = createApp({ queries, verifier: verify });
    const response = await app.fetch(withBearer("https://sally.test/shopping/list/user-1"), makeEnv({ REQUIRE_ACCESS_AUTH: "true" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "list-1",
      items: [{ name: "Milk", qty: 2, store: "Tesco" }],
      userId: "user-1"
    });
  });

  it("supports /shopping/start as the trigger endpoint", async () => {
    const queries = createQueries({
      createShoppingNotification: vi.fn().mockResolvedValue({
        createdAt: 1742395000000,
        id: "notif-1",
        payload: { items: [{ name: "Milk", qty: 2, store: "Tesco" }] },
        status: "pending",
        userId: "user-1"
      })
    });
    const app = createApp({ queries, verifier: verify });
    const response = await app.fetch(
      withBearer("https://sally.test/shopping/start", {
        body: JSON.stringify({
          items: [{ name: "Milk", qty: 2, store: "Tesco" }],
          userId: "user-1"
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      }),
      makeEnv({ REQUIRE_ACCESS_AUTH: "true" })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: "notif-1",
      status: "pending",
      userId: "user-1"
    });
  });

  it("extracts recipes into a direct resource", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("<html><body>Tomato pasta recipe</body></html>", { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    calories: 420,
                    ingredients: ["Tomatoes", "Pasta"],
                    steps: ["Boil pasta", "Mix sauce"],
                    time: "25 minutes",
                    title: "Tomato Pasta"
                  })
                }
              }
            ]
          }),
          { headers: { "Content-Type": "application/json" }, status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const app = createApp({ queries: createQueries(), verifier: verify });
    const response = await app.fetch(
      withBearer("https://sally.test/recipes/extract", {
        body: JSON.stringify({ url: "https://example.com/recipe", userId: "user-1" }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      }),
      makeEnv({ OPENAI_API_KEY: "sk-test", REQUIRE_ACCESS_AUTH: "true" })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      calories: 420,
      title: "Tomato Pasta"
    });
  });

  it("streams chat responses through SSE", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("data: {\"id\":\"1\",\"choices\":[{\"delta\":{\"content\":\"Hello\"},\"index\":0}]}\n\ndata: [DONE]\n\n", {
        headers: { "Content-Type": "text/event-stream" },
        status: 200
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const app = createApp({ queries: createQueries(), verifier: verify });
    const response = await app.fetch(
      withBearer("https://sally.test/chat", {
        body: JSON.stringify({ message: "Hello", userId: "user-1" }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      }),
      makeEnv({ OPENAI_API_KEY: "sk-test", REQUIRE_ACCESS_AUTH: "true" })
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain('"delta":"Hello"');
  });

  it("lists sessions with CORS headers", async () => {
    const queries = createQueries({
      listSessions: vi.fn().mockResolvedValue([
        {
          deviceId: "device-1",
          endedAt: 1742395600000,
          id: "session-1",
          ipAddress: "127.0.0.1",
          startedAt: 1742395000000,
          userId: "user-1"
        }
      ])
    });
    const app = createApp({ queries, verifier: verify });
    const response = await app.fetch(
      withBearer("https://sally.test/sessions", {
        headers: {
          Origin: "https://heysalad-sally-dashboard.pages.dev"
        }
      }),
      makeEnv({ REQUIRE_ACCESS_AUTH: "true" })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    await expect(response.json()).resolves.toMatchObject({
      items: [
        {
          id: "session-1"
        }
      ]
    });
  });
});

function createQueries(overrides: Partial<QueryService> = {}): QueryService {
  return {
    completeTestRun: vi.fn(async () => null),
    createRecipe: vi.fn(async () => {
      throw new Error("createRecipe not mocked");
    }),
    createShoppingList: vi.fn(async () => {
      throw new Error("createShoppingList not mocked");
    }),
    createShoppingNotification: vi.fn(async () => {
      throw new Error("createShoppingNotification not mocked");
    }),
    createTeam: vi.fn(async () => {
      throw new Error("createTeam not mocked");
    }),
    createUser: vi.fn(async () => {
      throw new Error("createUser not mocked");
    }),
    getDevice: vi.fn(async () => null),
    getLatestShoppingList: vi.fn(async () => null),
    getTestRun: vi.fn(async () => null),
    listDevices: vi.fn(async () => []),
    listRecipes: vi.fn(async () => []),
    listSessions: vi.fn(async () => []),
    listSessionsForUser: vi.fn(async () => []),
    listTestRuns: vi.fn(async () => []),
    listTeams: vi.fn(async () => []),
    listUsers: vi.fn(async () => []),
    startTestRun: vi.fn(async () => {
      throw new Error("startTestRun not mocked");
    }),
    startSession: vi.fn(async () => {
      throw new Error("startSession not mocked");
    }),
    stopSession: vi.fn(async () => null),
    syncSession: vi.fn(async () => {
      throw new Error("syncSession not mocked");
    }),
    updateDevice: vi.fn(async () => null),
    upsertDevice: vi.fn(async () => {
      throw new Error("upsertDevice not mocked");
    }),
    ...overrides
  };
}

function withBearer(input: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", "Bearer token");
  return new Request(input, { ...init, headers });
}

function makeEnv(overrides: Partial<WorkerBindings> = {}): WorkerBindings {
  return {
    CF_ACCESS_AUD: "audience-1",
    CF_ACCESS_TEAM_DOMAIN: "heysalad.cloudflareaccess.com",
    DB: {} as D1Database,
    REQUIRE_ACCESS_AUTH: "false",
    SALLY_ENV: "test",
    ...overrides
  };
}

function createHealthDb(): D1Database {
  return {
    prepare() {
      return {
        first() {
          return Promise.resolve({ ok: 1 });
        }
      } as D1PreparedStatement;
    }
  } as unknown as D1Database;
}

async function verify(): Promise<AccessClaims> {
  return {
    aud: ["audience-1"],
    email: "peter@heysalad.io",
    iss: "https://heysalad.cloudflareaccess.com",
    sub: "user-1"
  };
}
