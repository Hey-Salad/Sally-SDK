import { describe, expect, it } from "vitest";

import { DeviceManager } from "./DeviceManager.js";

describe("DeviceManager", () => {
  it("lists connected iOS devices with friendly names", async () => {
    const manager = new DeviceManager({
      execFile: async (file, args) => {
        if (file === "idevice_id" && args[0] === "-l") {
          return "ios-1\n";
        }
        if (file === "ideviceinfo") {
          return "Kitchen iPhone\n";
        }
        return "";
      }
    });

    await expect(manager.list()).resolves.toEqual([
      {
        id: "ios-1",
        name: "Kitchen iPhone",
        platform: "ios"
      }
    ]);
  });

  it("includes Android devices when adb is available", async () => {
    const manager = new DeviceManager({
      execFile: async (file, args) => {
        if (file === "idevice_id" && args[0] === "-l") {
          return "";
        }
        if (file === "adb") {
          return "List of devices attached\nandroid-1\tdevice\n";
        }
        return "";
      }
    });

    await expect(manager.list()).resolves.toEqual([
      {
        id: "android-1",
        name: "Android id-1",
        platform: "android"
      }
    ]);
  });

  it("ignores missing adb installations", async () => {
    const missingAdb = Object.assign(new Error("missing adb"), { code: "ENOENT" });
    const manager = new DeviceManager({
      execFile: async (file, args) => {
        if (file === "idevice_id" && args[0] === "-l") {
          return "";
        }
        if (file === "adb") {
          throw missingAdb;
        }
        return "";
      }
    });

    await expect(manager.list()).resolves.toEqual([]);
  });
});
