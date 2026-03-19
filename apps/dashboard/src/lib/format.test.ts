import { describe, expect, it, vi } from "vitest";

import { formatRelativeTime, mergeAuditEntries, summarizeDevices } from "./format";
import { makeSlug, toWebSocketUrl } from "./api";

describe("dashboard helpers", () => {
  it("builds websocket urls from tunnel urls", () => {
    expect(toWebSocketUrl("https://demo.trycloudflare.com")).toBe("wss://demo.trycloudflare.com/ws");
  });

  it("normalizes HeySalad-style slugs", () => {
    expect(makeSlug("HeySalad Device Team")).toBe("heysalad-device-team");
  });

  it("summarizes device states", () => {
    const summary = summarizeDevices([
      { id: "1", name: "A", platform: "ios", agentHost: null, lastSeen: null, model: null, osVersion: null, status: "online", teamId: null, tunnelUrl: null },
      { id: "2", name: "B", platform: "android", agentHost: null, lastSeen: null, model: null, osVersion: null, status: "offline", teamId: null, tunnelUrl: null }
    ]);

    expect(summary).toEqual({ busy: 0, connected: 1, offline: 1, total: 2 });
  });

  it("sorts audit entries newest first and formats recency", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T14:00:00Z"));

    const entries = mergeAuditEntries(
      [
        {
          agentHost: "host-1",
          id: "device-1",
          lastSeen: Date.parse("2026-03-19T13:55:00Z"),
          model: null,
          name: "Kitchen Phone",
          osVersion: null,
          platform: "ios",
          status: "online",
          teamId: null,
          tunnelUrl: null
        }
      ],
      [
        {
          deviceId: "device-1",
          endedAt: Date.parse("2026-03-19T13:58:00Z"),
          id: "session-1",
          ipAddress: null,
          startedAt: Date.parse("2026-03-19T13:50:00Z"),
          userId: "user-1"
        }
      ]
    );

    expect(entries[0]?.id).toBe("session-1");
    expect(formatRelativeTime(Date.parse("2026-03-19T13:58:00Z"))).toBe("2m ago");

    vi.useRealTimers();
  });
});
