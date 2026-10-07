import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "./app.js";
import type { ComputerAgentService } from "./computer/types.js";
import { CHAT_MESSAGE_MAX_CHARS } from "./routes/chat.js";
import type { AccessClaims, QueryService, UserRecord, WorkerBindings } from "./types.js";

const DASHBOARD_ORIGIN = "https://heysalad-sally-dashboard.pages.dev";

describe("worker abuse paths", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("rejects anonymous access when auth settings are missing", async () => {
    const queries = createQueries();
    const computers = createComputers();
    const app = createApp({ computers, queries });
    const env = makeEnv();

    const users = await app.fetch(jsonRequest("https://sally.test/users", { email: "a@example.com", role: "owner" }), env);
    const chat = await app.fetch(jsonRequest("https://sally.test/chat", { message: "hi", userId: "user-1" }), env);
    const command = await app.fetch(
      jsonRequest("https://sally.test/computers/agents/agent-1/commands", { capability: "shell", command: "id" }),
      env
    );
    const extract = await app.fetch(
      jsonRequest("https://sally.test/recipes/extract", { url: "https://example.com/recipe", userId: "user-1" }),
      env
    );

    expect(users.status).toBe(401);
    expect(chat.status).toBe(401);
    expect(command.status).toBe(401);
    expect(extract.status).toBe(401);
    expect(queries.createUser).not.toHaveBeenCalled();
    expect(computers.submitCommand).not.toHaveBeenCalled();
  });

  it("still requires auth when the old fail-open setting is false", async () => {
    const app = createApp({ queries: createQueries() });
    const response = await app.fetch(
      new Request("https://sally.test/devices"),
      makeEnv({ REQUIRE_ACCESS_AUTH: "false", SALLY_ENV: "development" })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "Missing Cloudflare Access token" });
  });

  it("ignores the local dev flag in production", async () => {
    const app = createApp({ queries: createQueries() });
    const response = await app.fetch(
      new Request("https://sally.test/chat", {
        body: JSON.stringify({ message: "hi", userId: "user-1" }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      }),
      makeEnv({ ALLOW_INSECURE_LOCAL_DEV: "true", SALLY_ENV: "production" })
    );

    expect(response.status).toBe(401);
  });

  it("does not let the local dev flag open record routes, computer control, chat, or extraction", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const computers = createComputers();
    const queries = createQueries();
    const app = createApp({ computers, queries });
    const env = makeEnv({ ALLOW_INSECURE_LOCAL_DEV: "true", SALLY_ENV: "development" });

    const devices = await app.fetch(new Request("https://sally.test/devices"), env);
    const sessions = await app.fetch(new Request("https://sally.test/sessions"), env);
    const pairing = await app.fetch(jsonRequest("https://sally.test/computers/pairing-sessions", {}), env);
    const chat = await app.fetch(jsonRequest("https://sally.test/chat", { message: "hi", userId: "user-1" }), env);
    const extract = await app.fetch(
      jsonRequest("https://sally.test/recipes/extract", { url: "http://169.254.169.254/", userId: "user-1" }),
      env
    );

    expect(devices.status).toBe(401);
    expect(sessions.status).toBe(401);
    expect(pairing.status).toBe(401);
    expect(chat.status).toBe(401);
    expect(extract.status).toBe(401);
    expect(queries.listDevices).not.toHaveBeenCalled();
    expect(queries.listSessions).not.toHaveBeenCalled();
    expect(computers.createPairingSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("queues computer commands only for the verified caller", async () => {
    const computers = createComputers();
    const app = createApp({ computers, queries: createQueries(), verifier: verify });
    const response = await app.fetch(
      withBearer(
        jsonRequest("https://sally.test/computers/agents/agent-1/commands", {
          capability: "repo.status",
          command: "git status"
        })
      ),
      makeEnv()
    );

    expect(response.status).toBe(201);
    expect(computers.submitCommand).toHaveBeenCalledWith({
      agentId: "agent-1",
      capability: "repo.status",
      command: "git status",
      userId: "peter@heysalad.io"
    });
  });

  it("does not let an authenticated caller mint an owner", async () => {
    const queries = createQueries({
      listUsers: vi.fn(async () => [user({ email: "peter@heysalad.io", role: "admin" })])
    });
    const app = createApp({ queries, verifier: verify });
    const response = await app.fetch(
      withBearer(jsonRequest("https://sally.test/users", { email: "mallory@example.com", name: "Mallory", role: "owner" })),
      makeEnv()
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "owner and admin roles cannot be assigned through this API"
    });
    expect(queries.createUser).not.toHaveBeenCalled();
  });

  it("refuses user administration to a non-manager and creates viewers for a manager", async () => {
    const viewerQueries = createQueries({
      listUsers: vi.fn(async () => [user({ email: "peter@heysalad.io", role: "viewer" })])
    });
    const viewerApp = createApp({ queries: viewerQueries, verifier: verify });
    const denied = await viewerApp.fetch(withBearer(new Request("https://sally.test/users")), makeEnv());
    expect(denied.status).toBe(403);
    expect(viewerQueries.createUser).not.toHaveBeenCalled();

    const managerQueries = createQueries({
      createUser: vi.fn(async (input) => user({ ...input, id: "user-2", role: input.role ?? "viewer" })),
      listUsers: vi.fn(async () => [user({ email: "peter@heysalad.io", role: "owner" })])
    });
    const managerApp = createApp({ queries: managerQueries, verifier: verify });
    const created = await managerApp.fetch(
      withBearer(jsonRequest("https://sally.test/users", { email: "dev@example.com", name: "Dev", role: "developer" })),
      makeEnv()
    );

    expect(created.status).toBe(201);
    expect(managerQueries.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "dev@example.com", role: "developer" })
    );
  });

  it("requires a verified caller for chat and caps the prompt", async () => {
    const fetchMock = vi.fn(async () => new Response("data: [DONE]\n\n", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({ queries: createQueries(), verifier: verify });
    const env = makeEnv({ OPENAI_API_KEY: "sk-test" });

    const anonymous = await app.fetch(
      jsonRequest("https://sally.test/chat", { message: "hello", userId: "user-1" }),
      env
    );
    const huge = await app.fetch(
      withBearer(
        jsonRequest("https://sally.test/chat", {
          message: "a".repeat(CHAT_MESSAGE_MAX_CHARS + 1),
          userId: "user-1"
        })
      ),
      env
    );

    expect(anonymous.status).toBe(401);
    expect(huge.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fetch private or metadata URLs for recipe extraction", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({ queries: createQueries(), verifier: verify });
    const env = makeEnv({ OPENAI_API_KEY: "sk-test" });

    for (const url of [
      "https://169.254.169.254/latest/meta-data",
      "https://metadata.google.internal/computeMetadata/v1/",
      "http://example.com/recipe",
      "https://127.0.0.1/"
    ]) {
      const response = await app.fetch(
        withBearer(jsonRequest("https://sally.test/recipes/extract", { url, userId: "user-1" })),
        env
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: "URL is not allowed" });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reflects only configured origins", async () => {
    const app = createApp({ queries: createQueries(), verifier: verify });
    const allowed = await app.fetch(
      withBearer(new Request("https://sally.test/devices", { headers: { Origin: DASHBOARD_ORIGIN } })),
      makeEnv()
    );
    const denied = await app.fetch(
      withBearer(new Request("https://sally.test/devices", { headers: { Origin: "https://evil.example" } })),
      makeEnv({ ALLOWED_ORIGINS: `${DASHBOARD_ORIGIN}, *` })
    );
    const preflight = await app.fetch(
      new Request("https://sally.test/users", {
        headers: {
          "Access-Control-Request-Method": "POST",
          Origin: "https://evil.example"
        },
        method: "OPTIONS"
      }),
      makeEnv()
    );

    expect(allowed.headers.get("access-control-allow-origin")).toBe(DASHBOARD_ORIGIN);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("binds records to the verified caller and refuses another user's data", async () => {
    const queries = createQueries({
      createRecipe: vi.fn(async (input) => ({
        calories: null,
        createdAt: 1,
        id: "recipe-1",
        ingredients: input.ingredients,
        sourceUrl: null,
        steps: input.steps,
        time: input.time,
        title: input.title,
        updatedAt: 1,
        userId: input.userId
      })),
      createShoppingList: vi.fn(async (input) => ({
        createdAt: 1,
        id: "list-1",
        items: input.items,
        updatedAt: 1,
        userId: input.userId
      })),
      getTestRun: vi.fn(async () => ({
        checks: [],
        createdAt: 1,
        deviceId: "device-1",
        durationMs: null,
        finishedAt: null,
        id: "run-mallory",
        platform: "ios" as const,
        sessionId: null,
        startedAt: 1,
        status: "running" as const,
        suite: "smoke",
        summary: "other",
        updatedAt: 1,
        userId: "mallory"
      })),
      listSessions: vi.fn(async () => [
        {
          deviceId: "device-1",
          endedAt: null,
          id: "session-peter",
          ipAddress: "203.0.113.10",
          startedAt: 1,
          userId: "peter@heysalad.io"
        },
        {
          deviceId: "device-2",
          endedAt: null,
          id: "session-mallory",
          ipAddress: "198.51.100.10",
          startedAt: 1,
          userId: "mallory"
        }
      ]),
      listTeams: vi.fn(async () => [
        { createdAt: 1, id: "team-1", name: "HeySalad", slug: "heysalad" },
        { createdAt: 1, id: "team-2", name: "Other", slug: "other" }
      ]),
      startSession: vi.fn(async (input) => ({
        deviceId: input.deviceId,
        endedAt: null,
        id: "session-new",
        ipAddress: input.ipAddress ?? null,
        startedAt: 1,
        userId: input.userId
      })),
      syncSession: vi.fn(async (input) => ({
        context: input.context,
        deviceId: input.deviceId,
        id: "sync-1",
        platform: input.platform,
        updatedAt: 1,
        userId: input.userId
      }))
    });
    const app = createApp({ queries, verifier: verify });
    const env = makeEnv();

    const started = await app.fetch(
      withBearer(jsonRequest("https://sally.test/sessions/start", { deviceId: "device-1", userId: "mallory" })),
      env
    );
    expect(started.status).toBe(201);
    expect(queries.startSession).toHaveBeenCalledWith(expect.objectContaining({ userId: "peter@heysalad.io" }));

    const listed = await app.fetch(withBearer(new Request("https://sally.test/sessions")), env);
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toEqual({
      items: [expect.objectContaining({ id: "session-peter", userId: "peter@heysalad.io" })]
    });

    const stopped = await app.fetch(
      withBearer(jsonRequest("https://sally.test/sessions/stop", { id: "session-mallory" })),
      env
    );
    expect(stopped.status).toBe(404);
    expect(queries.stopSession).not.toHaveBeenCalled();

    const sync = await app.fetch(
      withBearer(
        jsonRequest("https://sally.test/session/sync", {
          context: { shop: "groceries" },
          deviceId: "device-1",
          platform: "macos",
          userId: "mallory"
        })
      ),
      env
    );
    expect(sync.status).toBe(201);
    expect(queries.syncSession).toHaveBeenCalledWith(expect.objectContaining({ userId: "peter@heysalad.io" }));

    expect((await app.fetch(withBearer(new Request("https://sally.test/session/mallory")), env)).status).toBe(403);
    expect((await app.fetch(withBearer(new Request("https://sally.test/shopping/list/mallory")), env)).status).toBe(403);

    const shopping = await app.fetch(
      withBearer(
        jsonRequest("https://sally.test/shopping/list", {
          items: [{ name: "Milk", qty: 1, store: "Tesco" }],
          userId: "mallory"
        })
      ),
      env
    );
    expect(shopping.status).toBe(201);
    expect(queries.createShoppingList).toHaveBeenCalledWith(expect.objectContaining({ userId: "peter@heysalad.io" }));

    const recipe = await app.fetch(
      withBearer(
        jsonRequest("https://sally.test/recipes", {
          ingredients: ["Tomatoes"],
          steps: ["Cook"],
          time: "10 minutes",
          title: "Pasta",
          userId: "mallory"
        })
      ),
      env
    );
    expect(recipe.status).toBe(201);
    expect(queries.createRecipe).toHaveBeenCalledWith(expect.objectContaining({ userId: "peter@heysalad.io" }));
    expect((await app.fetch(withBearer(new Request("https://sally.test/recipes/mallory")), env)).status).toBe(403);

    const runs = await app.fetch(withBearer(new Request("https://sally.test/runs?userId=mallory")), env);
    expect(runs.status).toBe(200);
    expect(queries.listTestRuns).toHaveBeenCalledWith({ userId: "peter@heysalad.io" });
    expect((await app.fetch(withBearer(new Request("https://sally.test/runs/run-mallory")), env)).status).toBe(404);

    const devices = await app.fetch(withBearer(new Request("https://sally.test/devices")), env);
    expect(devices.status).toBe(200);
    await expect(devices.json()).resolves.toEqual({ items: [] });
    expect(queries.listDevices).not.toHaveBeenCalled();

    const postedDevice = await app.fetch(
      withBearer(
        jsonRequest("https://sally.test/devices", {
          id: "device-9",
          name: "Phone",
          platform: "ios",
          tunnelUrl: "https://evil.example/tunnel"
        })
      ),
      env
    );
    expect(postedDevice.status).toBe(403);
    expect(queries.upsertDevice).not.toHaveBeenCalled();

    const teams = await app.fetch(withBearer(new Request("https://sally.test/teams")), env);
    expect(teams.status).toBe(200);
    await expect(teams.json()).resolves.toEqual({ items: [] });
    const createdTeam = await app.fetch(
      withBearer(jsonRequest("https://sally.test/teams", { name: "Other", slug: "other" })),
      env
    );
    expect(createdTeam.status).toBe(403);
    expect(queries.createTeam).not.toHaveBeenCalled();
  });

  it("lets an owner read another user's records and register a device", async () => {
    const queries = createQueries({
      listSessions: vi.fn(async () => [
        {
          deviceId: "device-2",
          endedAt: null,
          id: "session-mallory",
          ipAddress: "198.51.100.10",
          startedAt: 1,
          userId: "mallory"
        }
      ]),
      listUsers: vi.fn(async () => [user({ email: "peter@heysalad.io", role: "owner", teamId: "team-1" })]),
      upsertDevice: vi.fn(async (input) => ({
        agentHost: input.agentHost ?? null,
        id: input.id,
        lastSeen: input.lastSeen ?? null,
        model: input.model ?? null,
        name: input.name,
        osVersion: input.osVersion ?? null,
        platform: input.platform,
        status: input.status ?? "offline",
        teamId: input.teamId ?? null,
        tunnelUrl: input.tunnelUrl ?? null
      }))
    });
    const app = createApp({ queries, verifier: verify });
    const env = makeEnv();

    const sessions = await app.fetch(withBearer(new Request("https://sally.test/sessions")), env);
    expect(sessions.status).toBe(200);
    await expect(sessions.json()).resolves.toMatchObject({ items: [{ id: "session-mallory" }] });

    const device = await app.fetch(
      withBearer(
        jsonRequest("https://sally.test/devices", {
          agentHost: "mac-mini-01",
          id: "device-1",
          name: "Phone",
          platform: "ios",
          tunnelUrl: "https://device-1.example"
        })
      ),
      env
    );
    expect(device.status).toBe(201);
    expect(queries.upsertDevice).toHaveBeenCalled();
  });

  it("limits a developer to their own team when listing devices", async () => {
    const queries = createQueries({
      listUsers: vi.fn(async () => [user({ email: "peter@heysalad.io", role: "developer", teamId: "team-1" })])
    });
    const app = createApp({ queries, verifier: verify });

    const response = await app.fetch(
      withBearer(new Request("https://sally.test/devices?teamId=team-2")),
      makeEnv()
    );

    expect(response.status).toBe(200);
    expect(queries.listDevices).toHaveBeenCalledWith({ teamId: "team-1" });
  });

  it("sends the verified identity to chat instead of the body user id", async () => {
    let sent = "";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent = String(init?.body ?? "");
      return new Response("data: [DONE]\n\n", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({ queries: createQueries(), verifier: verify });

    const response = await app.fetch(
      withBearer(jsonRequest("https://sally.test/chat", { message: "hello", userId: "mallory" })),
      makeEnv({ OPENAI_API_KEY: "sk-test" })
    );

    expect(response.status).toBe(200);
    expect(sent).toContain("User ID: peter@heysalad.io");
    expect(sent).not.toContain("mallory");
  });

  it("keeps the anonymous computer identity out of the route source", () => {
    const source = readFileSync(new URL("./routes/computers.ts", import.meta.url), "utf8");
    expect(source).not.toContain("local-dev");
    const middleware = readFileSync(new URL("./auth/middleware.ts", import.meta.url), "utf8");
    expect(middleware).not.toContain('REQUIRE_ACCESS_AUTH === "true"');
  });
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
}

function withBearer(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.set("Authorization", "Bearer token");
  return new Request(request, { headers });
}

function makeEnv(overrides: Partial<WorkerBindings> = {}): WorkerBindings {
  return {
    ALLOWED_ORIGINS: DASHBOARD_ORIGIN,
    CF_ACCESS_AUD: "audience-1",
    CF_ACCESS_TEAM_DOMAIN: "heysalad.cloudflareaccess.com",
    DB: {} as D1Database,
    SALLY_ENV: "test",
    ...overrides
  };
}

function user(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    createdAt: 1,
    email: "person@example.com",
    id: "user-1",
    name: "Person",
    role: "viewer",
    teamId: null,
    ...overrides
  };
}

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

function createComputers(): ComputerAgentService {
  return {
    claimPairingSession: vi.fn(),
    completeCommand: vi.fn(),
    connectAgent: vi.fn(),
    createPairingSession: vi.fn(),
    listAgents: vi.fn(async () => []),
    listAuditLogs: vi.fn(async () => []),
    pollCommands: vi.fn(async () => []),
    registerAgent: vi.fn(),
    revokeAgent: vi.fn(),
    submitCommand: vi.fn(async () => ({
      agentId: "agent-1",
      capability: "repo.status",
      command: "git status",
      createdAt: 1,
      id: "command-1",
      result: null,
      status: "queued"
    }))
  } as unknown as ComputerAgentService;
}

async function verify(): Promise<AccessClaims> {
  return {
    aud: ["audience-1"],
    email: "peter@heysalad.io",
    iss: "https://heysalad.cloudflareaccess.com",
    sub: "user-1"
  };
}
