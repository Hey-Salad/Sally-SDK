import { describe, expect, it } from "vitest";

import type { ConnectedDevice } from "@heysalad/sally-sdk";

import type { RemoteDeviceRecord } from "../utils/api.js";
import { mergeDeviceViews } from "./device.js";

describe("mergeDeviceViews", () => {
  it("merges local devices with worker status and tunnel data", () => {
    const local: ConnectedDevice[] = [
      {
        id: "ios-1",
        name: "Kitchen iPhone",
        platform: "ios"
      }
    ];
    const remote: RemoteDeviceRecord[] = [
      {
        agentHost: "mac-mini",
        id: "ios-1",
        lastSeen: 1,
        model: "iPhone16,2",
        name: "Kitchen iPhone",
        osVersion: "18.1",
        platform: "ios",
        status: "online",
        teamId: null,
        tunnelUrl: "https://demo.trycloudflare.com"
      }
    ];

    expect(mergeDeviceViews(local, remote)).toEqual([
      expect.objectContaining({
        connected: true,
        id: "ios-1",
        status: "online",
        tunnelUrl: "https://demo.trycloudflare.com"
      })
    ]);
  });
});
