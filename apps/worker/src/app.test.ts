import { describe, expect, it, vi } from "vitest";

import { createApp } from "./app.js";
import type { AccessClaims, QueryService, WorkerBindings } from "./types.js";

describe("worker routes", () => {
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
    createTeam: vi.fn(async () => {
      throw new Error("createTeam not mocked");
    }),
    createUser: vi.fn(async () => {
      throw new Error("createUser not mocked");
    }),
    getDevice: vi.fn(async () => null),
    listDevices: vi.fn(async () => []),
    listSessions: vi.fn(async () => []),
    listTeams: vi.fn(async () => []),
    listUsers: vi.fn(async () => []),
    startSession: vi.fn(async () => {
      throw new Error("startSession not mocked");
    }),
    stopSession: vi.fn(async () => null),
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

async function verify(): Promise<AccessClaims> {
  return {
    aud: ["audience-1"],
    email: "peter@heysalad.io",
    iss: "https://heysalad.cloudflareaccess.com",
    sub: "user-1"
  };
}
