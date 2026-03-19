import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "./api.js";

describe("api client", () => {
  it("lists devices from the worker payload", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      items: [
        {
          id: "device-1",
          name: "Kitchen iPhone",
          platform: "ios",
          status: "online",
          tunnelUrl: "https://example.trycloudflare.com"
        }
      ]
    }), { status: 200 }));
    const api = createApiClient({
      baseUrl: "https://sally.test",
      fetchImpl
    });

    await expect(api.listDevices()).resolves.toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith("https://sally.test/devices", {
      headers: {}
    });
  });
});
