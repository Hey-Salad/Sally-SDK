import { createPublicKey, verify } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  generateMachineKeypair,
  readMachineIdentity,
  signConnectPayload,
  writeMachineIdentity
} from "./machineIdentity.js";

describe("machine identity", () => {
  let configHome: string;
  let previousConfigHome: string | undefined;

  beforeEach(async () => {
    previousConfigHome = process.env.SALLY_CONFIG_HOME;
    configHome = await mkdtemp(path.join(os.tmpdir(), "sally-machine-"));
    process.env.SALLY_CONFIG_HOME = configHome;
  });

  afterEach(async () => {
    if (previousConfigHome === undefined) {
      delete process.env.SALLY_CONFIG_HOME;
    } else {
      process.env.SALLY_CONFIG_HOME = previousConfigHome;
    }
    await rm(configHome, { force: true, recursive: true });
  });

  it("round-trips a stored machine identity", async () => {
    const keypair = generateMachineKeypair();
    await writeMachineIdentity({
      agentId: "agent-1",
      apiBaseUrl: "https://api-sally-sdk.heysalad.app",
      createdAt: 123,
      name: "macmini",
      privateKeyPem: keypair.privateKeyPem,
      publicKey: keypair.publicKey
    });

    const identity = await readMachineIdentity();
    expect(identity).toMatchObject({ agentId: "agent-1", name: "macmini" });
    expect(identity?.privateKeyPem).toContain("PRIVATE KEY");
  });

  it("returns null when no identity is stored", async () => {
    await expect(readMachineIdentity()).resolves.toBeNull();
  });

  it("produces connect signatures the stored public key can verify", () => {
    const keypair = generateMachineKeypair();
    const signature = signConnectPayload(keypair.privateKeyPem, "agent-1", 1_750_000_000_000);

    const publicKey = createPublicKey({
      format: "der",
      key: Buffer.from(keypair.publicKey, "base64"),
      type: "spki"
    });
    const valid = verify(
      null,
      Buffer.from("sally-connect:agent-1:1750000000000", "utf8"),
      publicKey,
      Buffer.from(signature, "base64")
    );
    expect(valid).toBe(true);
  });
});
