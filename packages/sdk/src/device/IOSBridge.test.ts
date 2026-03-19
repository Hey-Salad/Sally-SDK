import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { execFileMock, spawnMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  spawnMock: vi.fn()
}));

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
  spawn: spawnMock
}));

import { IOSBridge } from "./IOSBridge.js";

describe("IOSBridge", () => {
  beforeEach(() => {
    execFileMock.mockReset();
    spawnMock.mockReset();
  });

  it("detects the first connected device and starts the python stream", async () => {
    execFileMock.mockImplementation((_file, _args, callback) => {
      callback(null, "ios-udid-1\n", "");
    });
    const child = createChildProcess(4321);
    spawnMock.mockReturnValue(child);

    const bridge = new IOSBridge({
      environment: { SALLY_SERVER_PORT: "9123" },
      moduleArgs: ["--flag"],
      workingDirectory: "/tmp/sally"
    });
    const status = await bridge.start();

    expect(execFileMock).toHaveBeenCalledWith("idevice_id", ["-l"], expect.any(Function));
    expect(spawnMock).toHaveBeenCalledWith("python3", ["-m", "sally_stream", "--flag"], {
      cwd: "/tmp/sally",
      env: expect.objectContaining({
        SALLY_SERVER_PORT: "9123"
      }),
      stdio: "pipe"
    });
    expect(status).toEqual({ deviceId: "ios-udid-1", pid: 4321, state: "running" });
  });

  it("stops the running subprocess and updates state", async () => {
    execFileMock.mockImplementation((_file, _args, callback) => {
      callback(null, "ios-udid-2\n", "");
    });
    const child = createChildProcess(9876);
    spawnMock.mockReturnValue(child);

    const bridge = new IOSBridge();
    await bridge.start();
    const stopPromise = bridge.stop();
    child.emit("exit", 0);
    const status = await stopPromise;

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(status).toEqual({ deviceId: "ios-udid-2", state: "stopped" });
  });

  it("throws when no iOS devices are connected", async () => {
    execFileMock.mockImplementation((_file, _args, callback) => {
      callback(null, "", "");
    });

    const bridge = new IOSBridge();

    await expect(bridge.start()).rejects.toThrow("No iOS device detected");
  });
});

function createChildProcess(pid: number) {
  const emitter = new EventEmitter() as EventEmitter & {
    kill: ReturnType<typeof vi.fn>;
    pid: number;
  };
  emitter.pid = pid;
  emitter.kill = vi.fn(() => true);
  return emitter;
}
