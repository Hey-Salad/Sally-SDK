import { beforeEach, describe, expect, it, vi } from "vitest";

import { createQueryService } from "./queries.js";

describe("createQueryService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists devices with typed filters", async () => {
    const db = createDb({
      all(sql, values) {
        expect(sql).toContain("FROM devices WHERE team_id = ? AND status = ?");
        expect(values).toEqual(["team-1", "online"]);
        return [
          {
            agent_host: "mac-mini-01",
            id: "device-1",
            last_seen: 1742395000000,
            model: "Pixel 9",
            name: "Android Lab",
            os_version: "15",
            platform: "android",
            status: "online",
            team_id: "team-1",
            tunnel_url: "https://android.heysalad.dev"
          }
        ];
      }
    });
    const queries = createQueryService({ db });

    const devices = await queries.listDevices({ status: "online", teamId: "team-1" });

    expect(devices).toEqual([
      {
        agentHost: "mac-mini-01",
        id: "device-1",
        lastSeen: 1742395000000,
        model: "Pixel 9",
        name: "Android Lab",
        osVersion: "15",
        platform: "android",
        status: "online",
        teamId: "team-1",
        tunnelUrl: "https://android.heysalad.dev"
      }
    ]);
  });

  it("creates a team with generated ids and timestamps", async () => {
    const db = createDb({
      run(sql, values) {
        expect(sql).toContain("INSERT INTO teams");
        expect(values).toEqual(["team-generated", "HeySalad", "heysalad", 1742395000000]);
      }
    });
    const queries = createQueryService({
      db,
      idFactory: () => "team-generated",
      now: () => 1742395000000
    });

    const team = await queries.createTeam({ name: "HeySalad", slug: "heysalad" });

    expect(team).toEqual({
      createdAt: 1742395000000,
      id: "team-generated",
      name: "HeySalad",
      slug: "heysalad"
    });
  });

  it("updates existing devices instead of inserting duplicates", async () => {
    const db = createDb({
      first(sql, values) {
        if (sql.includes("FROM devices WHERE id = ?") && values[0] === "device-1") {
          return {
            agent_host: null,
            id: "device-1",
            last_seen: 1742395000000,
            model: "iPhone 16",
            name: "Device 1",
            os_version: "18.0",
            platform: "ios",
            status: "offline",
            team_id: "team-1",
            tunnel_url: null
          };
        }
        return null;
      },
      run(sql, values) {
        expect(sql).toContain("UPDATE devices SET");
        expect(values).toEqual(["online", 1742395600000, "device-1"]);
      }
    });
    const queries = createQueryService({ db });

    const device = await queries.updateDevice("device-1", {
      lastSeen: 1742395600000,
      status: "online"
    });

    expect(device).toMatchObject({
      id: "device-1",
      status: "offline"
    });
  });

  it("stops sessions and returns the updated record", async () => {
    const db = createDb({
      first(sql, values) {
        expect(sql).toContain("FROM sessions WHERE id = ?");
        expect(values).toEqual(["session-1"]);
        return {
          device_id: "device-1",
          ended_at: 1742395600000,
          id: "session-1",
          ip_address: "127.0.0.1",
          started_at: 1742395000000,
          user_id: "user-1"
        };
      },
      run(sql, values) {
        expect(sql).toContain("UPDATE sessions");
        expect(values).toEqual([1742395600000, "session-1"]);
      }
    });
    const queries = createQueryService({ db });

    const session = await queries.stopSession("session-1", 1742395600000);

    expect(session).toEqual({
      deviceId: "device-1",
      endedAt: 1742395600000,
      id: "session-1",
      ipAddress: "127.0.0.1",
      startedAt: 1742395000000,
      userId: "user-1"
    });
  });

  it("syncs sessions and returns the latest record per platform", async () => {
    const db = createDb({
      all(sql, values) {
        expect(sql).toContain("FROM session_syncs WHERE user_id = ?");
        expect(values).toEqual(["user-1"]);
        return [
          {
            context: JSON.stringify({ cart: "weekly" }),
            device_id: "device-1",
            id: "sync-2",
            platform: "macos",
            updated_at: 1742395600000,
            user_id: "user-1"
          },
          {
            context: JSON.stringify({ cart: "weekly-old" }),
            device_id: "device-1",
            id: "sync-1",
            platform: "macos",
            updated_at: 1742395000000,
            user_id: "user-1"
          },
          {
            context: JSON.stringify({ cart: "on-the-go" }),
            device_id: "device-2",
            id: "sync-3",
            platform: "ios",
            updated_at: 1742395900000,
            user_id: "user-1"
          }
        ];
      },
      run(sql, values) {
        expect(sql).toContain("INSERT INTO session_syncs (id, platform, user_id, device_id, context, updated_at)");
        expect(values).toEqual([
          "sync-generated",
          "web",
          "user-1",
          "device-2",
          JSON.stringify({ screen: "shopping" }),
          1742396000000
        ]);
      }
    });
    const queries = createQueryService({
      db,
      idFactory: () => "sync-generated",
      now: () => 1742396000000
    });

    const created = await queries.syncSession({
      context: { screen: "shopping" },
      deviceId: "device-2",
      platform: "web",
      userId: "user-1"
    });
    const sessions = await queries.listSessionsForUser("user-1");

    expect(created).toEqual({
      context: { screen: "shopping" },
      deviceId: "device-2",
      id: "sync-generated",
      platform: "web",
      updatedAt: 1742396000000,
      userId: "user-1"
    });
    expect(sessions).toEqual([
      {
        context: { cart: "weekly" },
        deviceId: "device-1",
        id: "sync-2",
        platform: "macos",
        updatedAt: 1742395600000,
        userId: "user-1"
      },
      {
        context: { cart: "on-the-go" },
        deviceId: "device-2",
        id: "sync-3",
        platform: "ios",
        updatedAt: 1742395900000,
        userId: "user-1"
      }
    ]);
  });

  it("starts test runs with generated ids and persisted defaults", async () => {
    const db = createDb({
      run(sql, values) {
        expect(sql).toContain("INSERT INTO test_runs");
        expect(values).toEqual([
          "run-generated",
          "user-1",
          "device-1",
          "session-1",
          "ios",
          "smoke",
          "running",
          "Smoke test started for HeySalad iPhone",
          JSON.stringify([]),
          1742396000000,
          null,
          null,
          1742396000000,
          1742396000000
        ]);
      }
    });
    const queries = createQueryService({
      db,
      idFactory: () => "run-generated",
      now: () => 1742396000000
    });

    const run = await queries.startTestRun({
      deviceId: "device-1",
      platform: "ios",
      sessionId: "session-1",
      summary: "Smoke test started for HeySalad iPhone",
      userId: "user-1"
    });

    expect(run).toEqual({
      checks: [],
      createdAt: 1742396000000,
      deviceId: "device-1",
      durationMs: null,
      finishedAt: null,
      id: "run-generated",
      platform: "ios",
      sessionId: "session-1",
      startedAt: 1742396000000,
      status: "running",
      suite: "smoke",
      summary: "Smoke test started for HeySalad iPhone",
      updatedAt: 1742396000000,
      userId: "user-1"
    });
  });

  it("completes and reads persisted test runs", async () => {
    const db = createDb({
      first(sql, values) {
        expect(sql).toContain("FROM test_runs WHERE id = ?");
        expect(values).toEqual(["run-1"]);
        return {
          checks: JSON.stringify([
            {
              detail: "Tunnel URL is missing.",
              key: "stream-handoff",
              label: "Stream handoff",
              status: "failed"
            }
          ]),
          created_at: 1742395000000,
          device_id: "device-1",
          duration_ms: 1800,
          finished_at: 1742395001800,
          id: "run-1",
          platform: "ios",
          session_id: "session-1",
          started_at: 1742395000000,
          status: "failed",
          suite: "smoke",
          summary: "Smoke run failed. 2/3 checks green.",
          updated_at: 1742395001800,
          user_id: "user-1"
        };
      },
      run(sql, values) {
        expect(sql).toContain("UPDATE test_runs");
        expect(values).toEqual([
          "failed",
          "Smoke run failed. 2/3 checks green.",
          JSON.stringify([
            {
              detail: "Tunnel URL is missing.",
              key: "stream-handoff",
              label: "Stream handoff",
              status: "failed"
            }
          ]),
          1742395001800,
          1800,
          1742395001800,
          "run-1"
        ]);
      }
    });
    const queries = createQueryService({ db });

    const run = await queries.completeTestRun("run-1", {
      checks: [
        {
          detail: "Tunnel URL is missing.",
          key: "stream-handoff",
          label: "Stream handoff",
          status: "failed"
        }
      ],
      durationMs: 1800,
      finishedAt: 1742395001800,
      status: "failed",
      summary: "Smoke run failed. 2/3 checks green."
    });

    expect(run).toEqual({
      checks: [
        {
          detail: "Tunnel URL is missing.",
          key: "stream-handoff",
          label: "Stream handoff",
          status: "failed"
        }
      ],
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
    });
  });

  it("lists test runs with typed filters", async () => {
    const db = createDb({
      all(sql, values) {
        expect(sql).toContain("FROM test_runs WHERE user_id = ? AND device_id = ? AND suite = ? ORDER BY started_at DESC, id DESC LIMIT ?");
        expect(values).toEqual(["user-1", "device-1", "smoke", 5]);
        return [
          {
            checks: JSON.stringify([]),
            created_at: 1742395000000,
            device_id: "device-1",
            duration_ms: 1200,
            finished_at: 1742395001200,
            id: "run-1",
            platform: "ios",
            session_id: "session-1",
            started_at: 1742395000000,
            status: "passed",
            suite: "smoke",
            summary: "Smoke run passed. 3/3 checks green.",
            updated_at: 1742395001200,
            user_id: "user-1"
          }
        ];
      }
    });
    const queries = createQueryService({ db });

    const runs = await queries.listTestRuns({
      deviceId: "device-1",
      limit: 5,
      suite: "smoke",
      userId: "user-1"
    });

    expect(runs).toEqual([
      {
        checks: [],
        createdAt: 1742395000000,
        deviceId: "device-1",
        durationMs: 1200,
        finishedAt: 1742395001200,
        id: "run-1",
        platform: "ios",
        sessionId: "session-1",
        startedAt: 1742395000000,
        status: "passed",
        suite: "smoke",
        summary: "Smoke run passed. 3/3 checks green.",
        updatedAt: 1742395001200,
        userId: "user-1"
      }
    ]);
  });

  it("creates and reads shopping lists directly", async () => {
    const db = createDb({
      first(sql, values) {
        expect(sql).toContain("FROM shopping_lists WHERE user_id = ?");
        expect(values).toEqual(["user-1"]);
        return {
          created_at: 1742395000000,
          id: "list-1",
          items: JSON.stringify([{ name: "Milk", qty: 2, store: "Tesco" }]),
          updated_at: 1742395600000,
          user_id: "user-1"
        };
      },
      run(sql, values) {
        expect(sql).toContain("INSERT INTO shopping_lists");
        expect(values).toEqual([
          "list-generated",
          "user-1",
          JSON.stringify([{ name: "Milk", qty: 2, store: "Tesco" }]),
          1742396000000,
          1742396000000
        ]);
      }
    });
    const queries = createQueryService({
      db,
      idFactory: () => "list-generated",
      now: () => 1742396000000
    });

    const created = await queries.createShoppingList({
      items: [{ name: "Milk", qty: 2, store: "Tesco" }],
      userId: "user-1"
    });
    const latest = await queries.getLatestShoppingList("user-1");

    expect(created).toEqual({
      createdAt: 1742396000000,
      id: "list-generated",
      items: [{ name: "Milk", qty: 2, store: "Tesco" }],
      updatedAt: 1742396000000,
      userId: "user-1"
    });
    expect(latest).toEqual({
      createdAt: 1742395000000,
      id: "list-1",
      items: [{ name: "Milk", qty: 2, store: "Tesco" }],
      updatedAt: 1742395600000,
      userId: "user-1"
    });
  });

  it("creates and reads recipes directly", async () => {
    const db = createDb({
      all(sql, values) {
        expect(sql).toContain("FROM recipes WHERE user_id = ?");
        expect(values).toEqual(["user-1"]);
        return [
          {
            calories: 420,
            created_at: 1742395000000,
            id: "recipe-1",
            ingredients: JSON.stringify(["Tomatoes", "Pasta"]),
            source_url: "https://example.com/recipe",
            steps: JSON.stringify(["Boil pasta", "Mix sauce"]),
            time: "25 minutes",
            title: "Tomato Pasta",
            updated_at: 1742395600000,
            user_id: "user-1"
          }
        ];
      },
      run(sql, values) {
        expect(sql).toContain("INSERT INTO recipes");
        expect(values).toEqual([
          "recipe-generated",
          "user-1",
          "Tomato Pasta",
          JSON.stringify(["Tomatoes", "Pasta"]),
          JSON.stringify(["Boil pasta", "Mix sauce"]),
          "25 minutes",
          420,
          "https://example.com/recipe",
          1742396000000,
          1742396000000
        ]);
      }
    });
    const queries = createQueryService({
      db,
      idFactory: () => "recipe-generated",
      now: () => 1742396000000
    });

    const created = await queries.createRecipe({
      calories: 420,
      ingredients: ["Tomatoes", "Pasta"],
      sourceUrl: "https://example.com/recipe",
      steps: ["Boil pasta", "Mix sauce"],
      time: "25 minutes",
      title: "Tomato Pasta",
      userId: "user-1"
    });
    const recipes = await queries.listRecipes("user-1");

    expect(created).toEqual({
      calories: 420,
      createdAt: 1742396000000,
      id: "recipe-generated",
      ingredients: ["Tomatoes", "Pasta"],
      sourceUrl: "https://example.com/recipe",
      steps: ["Boil pasta", "Mix sauce"],
      time: "25 minutes",
      title: "Tomato Pasta",
      updatedAt: 1742396000000,
      userId: "user-1"
    });
    expect(recipes).toEqual([
      {
        calories: 420,
        createdAt: 1742395000000,
        id: "recipe-1",
        ingredients: ["Tomatoes", "Pasta"],
        sourceUrl: "https://example.com/recipe",
        steps: ["Boil pasta", "Mix sauce"],
        time: "25 minutes",
        title: "Tomato Pasta",
        updatedAt: 1742395600000,
        userId: "user-1"
      }
    ]);
  });
});

type HandlerArgs = {
  sql: string;
  values: unknown[];
};

type DbHandlers = {
  all?: (sql: string, values: unknown[]) => Record<string, unknown>[];
  first?: (sql: string, values: unknown[]) => Record<string, unknown> | null;
  run?: (sql: string, values: unknown[]) => void;
};

function createDb(handlers: DbHandlers): D1Database {
  return {
    prepare(sql: string) {
      return statement(sql, []);
    }
  } as D1Database;

  function statement(sql: string, values: unknown[]): D1PreparedStatement {
    return {
      all() {
        return Promise.resolve({ results: handlers.all?.(sql, values) ?? [] });
      },
      bind(...boundValues: unknown[]) {
        return statement(sql, boundValues);
      },
      first() {
        return Promise.resolve(handlers.first?.(sql, values) ?? null);
      },
      run() {
        handlers.run?.(sql, values);
        return Promise.resolve({ success: true });
      }
    } as D1PreparedStatement;
  }
}
