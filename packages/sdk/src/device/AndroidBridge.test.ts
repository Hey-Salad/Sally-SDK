import { beforeEach, describe, expect, it, vi } from "vitest";

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn()
}));

vi.mock("node:child_process", () => ({
  execFile: execFileMock
}));

import { AndroidBridge } from "./AndroidBridge.js";

describe("AndroidBridge", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("detects the first connected android device", async () => {
    execFileMock.mockImplementation((_file, _args, callback) => {
      callback(null, "List of devices attached\nemulator-5554\tdevice\n\n", "");
    });

    const bridge = new AndroidBridge();
    const status = await bridge.start();

    expect(execFileMock).toHaveBeenCalledWith("adb", ["devices"], expect.any(Function));
    expect(status).toEqual({ deviceId: "emulator-5554", state: "running" });
  });

  it("prefers the requested device when present", async () => {
    execFileMock.mockImplementation((_file, _args, callback) => {
      callback(null, "List of devices attached\nserial-1\tdevice\nserial-2\tdevice\n", "");
    });

    const bridge = new AndroidBridge({ preferredDeviceId: "serial-2" });
    const status = await bridge.start();

    expect(status).toEqual({ deviceId: "serial-2", state: "running" });
  });

  it("throws when no android devices are connected", async () => {
    execFileMock.mockImplementation((_file, _args, callback) => {
      callback(null, "List of devices attached\n\n", "");
    });

    const bridge = new AndroidBridge();

    await expect(bridge.start()).rejects.toThrow("No Android device detected");
  });
});
