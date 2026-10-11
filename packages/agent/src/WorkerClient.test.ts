import { describe, expect, it, vi } from "vitest";

import { WorkerClient } from "./WorkerClient.js";

describe("WorkerClient", () => {
  it("sends the Access token on device writes", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const client = new WorkerClient({
      accessToken: "access-jwt",
      baseUrl: "https://api-sally-sdk.heysalad.app",
      fetchImpl
    });

    await client.upsertDevice({
      agentHost: "mac-mini",
      id: "device-1",
      lastSeen: 1,
      model: null,
      name: "iPhone",
      osVersion: null,
      platform: "ios",
      status: "online",
      tunnelUrl: null
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api-sally-sdk.heysalad.app/devices",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer access-jwt" }),
        method: "POST"
      })
    );
  });
});
