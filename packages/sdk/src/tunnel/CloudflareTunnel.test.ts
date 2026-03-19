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

import { CloudflareTunnel } from "./CloudflareTunnel.js";
import { TunnelRegistry } from "./TunnelRegistry.js";

describe("CloudflareTunnel", () => {
  beforeEach(() => {
    execFileMock.mockReset();
    spawnMock.mockReset();
    process.env.CF_ACCOUNT_ID = "acct-123";
    process.env.CF_API_TOKEN = "token-123";
  });

  it("opens a named tunnel, registers it, and returns the public url", async () => {
    execFileMock
      .mockImplementationOnce((_file, _args, callback) => {
        callback(null, "Created tunnel 11111111-1111-1111-1111-111111111111", "");
      })
      .mockImplementationOnce((_file, _args, callback) => {
        callback(null, "Routed", "");
      });
    const child = createChildProcess();
    spawnMock.mockReturnValue(child);
    const registry = new TunnelRegistry({
      apiToken: "token-123",
      endpoint: "https://registry.test",
      fetchImpl: okFetch
    });
    const lifecycle = new EventEmitter();

    const tunnel = new CloudflareTunnel({ lifecycle, registry });
    const session = await tunnel.open({
      name: "sally-ios-1",
      publicHostname: "ios-1.example.com",
      targetUrl: "http://127.0.0.1:8765"
    });

    expect(execFileMock).toHaveBeenCalledWith("cloudflared", ["tunnel", "create", "sally-ios-1"], expect.any(Function));
    expect(execFileMock).toHaveBeenCalledWith(
      "cloudflared",
      ["tunnel", "route", "dns", "sally-ios-1", "ios-1.example.com"],
      expect.any(Function)
    );
    expect(spawnMock).toHaveBeenCalledWith(
      "cloudflared",
      ["tunnel", "run", "sally-ios-1"],
      expect.objectContaining({
        env: expect.objectContaining({
          CF_ACCOUNT_ID: "acct-123",
          CF_API_TOKEN: "token-123"
        }),
        stdio: "pipe"
      })
    );
    expect(session).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      name: "sally-ios-1",
      targetUrl: "http://127.0.0.1:8765",
      url: "https://ios-1.example.com"
    });
  });

  it("closes the running tunnel and deregisters it", async () => {
    execFileMock
      .mockImplementationOnce((_file, _args, callback) => {
        callback(null, "Created tunnel 22222222-2222-2222-2222-222222222222", "");
      })
      .mockImplementationOnce((_file, _args, callback) => {
        callback(null, "Routed", "");
      })
      .mockImplementationOnce((_file, _args, callback) => {
        callback(null, "Deleted", "");
      });
    const child = createChildProcess();
    spawnMock.mockReturnValue(child);
    const registry = new TunnelRegistry({
      apiToken: "token-123",
      endpoint: "https://registry.test",
      fetchImpl: okFetch
    });

    const tunnel = new CloudflareTunnel({ lifecycle: new EventEmitter(), registry });
    await tunnel.open({
      name: "sally-ios-2",
      publicHostname: "ios-2.example.com",
      targetUrl: "http://127.0.0.1:9000"
    });
    const closePromise = tunnel.close();
    child.emit("exit", 0);
    await closePromise;

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(execFileMock).toHaveBeenLastCalledWith(
      "cloudflared",
      ["tunnel", "delete", "sally-ios-2"],
      expect.any(Function)
    );
  });

  it("cleans up the tunnel when the lifecycle bus emits SIGTERM", async () => {
    execFileMock
      .mockImplementationOnce((_file, _args, callback) => {
        callback(null, "Created tunnel 33333333-3333-3333-3333-333333333333", "");
      })
      .mockImplementationOnce((_file, _args, callback) => {
        callback(null, "Routed", "");
      })
      .mockImplementationOnce((_file, _args, callback) => {
        callback(null, "Deleted", "");
      });
    const child = createChildProcess();
    spawnMock.mockReturnValue(child);
    const lifecycle = new EventEmitter();
    const registry = new TunnelRegistry({
      apiToken: "token-123",
      endpoint: "https://registry.test",
      fetchImpl: okFetch
    });

    const tunnel = new CloudflareTunnel({ lifecycle, registry });
    await tunnel.open({
      name: "sally-ios-3",
      publicHostname: "ios-3.example.com",
      targetUrl: "http://127.0.0.1:7000"
    });
    lifecycle.emit("SIGTERM");
    child.emit("exit", 0);
    await new Promise((resolve) => setImmediate(resolve));

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("falls back to a quick tunnel and parses the emitted url", async () => {
    const child = createChildProcess();
    child.stderr = new EventEmitter() as NodeJS.ReadableStream;
    spawnMock.mockReturnValue(child);

    const tunnel = new CloudflareTunnel({
      lifecycle: new EventEmitter(),
      mode: "quick",
      quickTunnelTimeoutMs: 100
    });
    const openPromise = tunnel.open({
      targetUrl: "http://127.0.0.1:8765"
    });

    child.stderr.emit("data", "https://bright-sky.trycloudflare.com");
    const session = await openPromise;

    expect(execFileMock).not.toHaveBeenCalled();
    expect(session.url).toBe("https://bright-sky.trycloudflare.com");
    expect(spawnMock).toHaveBeenCalledWith(
      "cloudflared",
      ["tunnel", "--url", "http://127.0.0.1:8765"],
      expect.objectContaining({ stdio: "pipe" })
    );
  });
});

function createChildProcess() {
  const emitter = new EventEmitter() as EventEmitter & {
    kill: ReturnType<typeof vi.fn>;
    pid: number;
    stderr?: EventEmitter;
    stdout?: EventEmitter;
  };
  emitter.kill = vi.fn(() => true);
  emitter.pid = 2468;
  emitter.stdout = new EventEmitter();
  emitter.stderr = new EventEmitter();
  return emitter;
}

async function okFetch() {
  return new Response(null, { status: 200 });
}
