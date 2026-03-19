import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { fileURLToPath } from "node:url";

export async function openExternal(url: string): Promise<void> {
  const { command, args } = getOpenCommand(url);
  await spawnAndWait(command, args, { stdio: "ignore" });
}

export function resolveAgentEntry(): string | null {
  const fromEnv = process.env.SALLY_AGENT_ENTRY;
  if (fromEnv) {
    return fromEnv;
  }

  const workspaceRoot = findWorkspaceRootSync();
  if (!workspaceRoot) {
    return null;
  }

  return path.join(workspaceRoot, "packages", "agent", "dist", "index.js");
}

export function resolveStreamWorkingDirectory(): string {
  return process.env.SALLY_STREAM_WORKDIR ?? findWorkspaceRootSync() ?? process.cwd();
}

export async function isProcessAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function ensurePathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

export function spawnDetached(
  command: string,
  args: string[],
  options: SpawnOptions
): ChildProcess {
  const child = spawn(command, args, {
    ...options,
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  return child;
}

function findWorkspaceRootSync(): string | null {
  const candidates = [
    process.cwd(),
    path.dirname(fileURLToPath(import.meta.url))
  ];

  for (const candidate of candidates) {
    const root = walkUp(candidate);
    if (root) {
      return root;
    }
  }

  return null;
}

function walkUp(startDirectory: string): string | null {
  let current = path.resolve(startDirectory);
  while (true) {
    const marker = path.join(current, "pnpm-workspace.yaml");
    if (existsSync(marker)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function getOpenCommand(url: string): { args: string[]; command: string } {
  if (process.platform === "darwin") {
    return { args: [url], command: "open" };
  }
  if (process.platform === "win32") {
    return { args: ["/c", "start", "", url], command: "cmd" };
  }
  return { args: [url], command: "xdg-open" };
}

function spawnAndWait(
  command: string,
  args: string[],
  options: SpawnOptions
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command ${command} exited with code ${code ?? "unknown"}`));
    });
  });
}
