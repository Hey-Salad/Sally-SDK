import { generateKeyPairSync, createPrivateKey, sign } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getConfigDirectory } from "./config.js";

export interface MachineIdentity {
  agentId: string;
  apiBaseUrl: string;
  createdAt: number;
  name: string;
  privateKeyPem: string;
  publicKey: string;
}

export interface MachineKeypair {
  privateKeyPem: string;
  publicKey: string;
}

export function generateMachineKeypair(): MachineKeypair {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64")
  };
}

export function signConnectPayload(privateKeyPem: string, agentId: string, timestamp: number): string {
  const key = createPrivateKey(privateKeyPem);
  return sign(null, Buffer.from(`sally-connect:${agentId}:${timestamp}`, "utf8"), key).toString("base64");
}

export function getMachineIdentityPath(): string {
  return path.join(getConfigDirectory(), "machine.json");
}

export async function readMachineIdentity(): Promise<MachineIdentity | null> {
  try {
    const raw = await readFile(getMachineIdentityPath(), "utf8");
    return JSON.parse(raw) as MachineIdentity;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeMachineIdentity(identity: MachineIdentity): Promise<void> {
  await mkdir(getConfigDirectory(), { recursive: true });
  // The file contains the device private key; keep it owner-readable only.
  await writeFile(getMachineIdentityPath(), `${JSON.stringify(identity, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
}
