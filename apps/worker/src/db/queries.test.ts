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
