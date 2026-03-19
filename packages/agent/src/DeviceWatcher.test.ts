import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeviceWatcher } from "./DeviceWatcher.js";
import type { DetectedDevice } from "./types.js";

describe("DeviceWatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("emits connect and disconnect events from polling diffs", async () => {
    const outputs = [
      {
        "adb devices": "List of devices attached\n\n",
        "idevice_id -l": "ios-1\n"
      },
      {
        "adb devices": "List of devices attached\n\n",
        "idevice_id -l": ""
      }
    ];
    let pollIndex = 0;
    const execFile = vi.fn(async (file: string, args: string[]) => {
      const key = `${file} ${args.join(" ")}`;
      const output = outputs[Math.min(pollIndex, outputs.length - 1)]!;
      return output[key as keyof typeof output] ?? "";
    });
    const watcher = new DeviceWatcher({ execFile, pollIntervalMs: 100 });
    const connected: DetectedDevice[] = [];
    const disconnected: DetectedDevice[] = [];

    watcher.on("connected", (device) => connected.push(device));
    watcher.on("disconnected", (device) => disconnected.push(device));

    await watcher.start();
    pollIndex = 1;
    await vi.advanceTimersByTimeAsync(100);

    expect(connected).toEqual([{ id: "ios-1", platform: "ios" }]);
    expect(disconnected).toEqual([{ id: "ios-1", platform: "ios" }]);
  });

  it("ignores adb when the command is unavailable", async () => {
    const error = new Error("missing") as Error & { code?: string };
    error.code = "ENOENT";
    const execFile = vi.fn(async (file: string) => {
      if (file === "adb") {
        throw error;
      }
      return "";
    });
    const watcher = new DeviceWatcher({ execFile });

    await expect(watcher.list()).resolves.toEqual([]);
  });
});
