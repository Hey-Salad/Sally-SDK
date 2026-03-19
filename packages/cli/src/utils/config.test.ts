import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readConfig, updateConfig, writeConfig } from "./config.js";

describe("config utils", () => {
  afterEach(() => {
    delete process.env.SALLY_CONFIG_HOME;
  });

  it("returns defaults when no config file exists", async () => {
    process.env.SALLY_CONFIG_HOME = await mkdtemp(path.join(os.tmpdir(), "sally-config-"));

    await expect(readConfig()).resolves.toMatchObject({
      apiBaseUrl: "http://localhost:8787"
    });
  });

  it("writes and updates persisted config", async () => {
    process.env.SALLY_CONFIG_HOME = await mkdtemp(path.join(os.tmpdir(), "sally-config-"));

    await writeConfig({ apiBaseUrl: "https://example.com", authToken: "token-1" });
    const updated = await updateConfig((current) => ({
      ...current,
      teamSlug: "heysalad"
    }));

    expect(updated).toMatchObject({
      apiBaseUrl: "https://example.com",
      authToken: "token-1",
      teamSlug: "heysalad"
    });
  });
});
