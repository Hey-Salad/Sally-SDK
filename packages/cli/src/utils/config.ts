import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface ActiveDaemonConfig {
  mode: "auto" | "named" | "quick";
  pid: number;
  startedAt: number;
  workerUrl: string;
}

export interface SallyConfig {
  activeDaemon?: ActiveDaemonConfig;
  apiBaseUrl: string;
  authToken?: string;
  teamSlug?: string;
}

export function getDefaultConfig(): SallyConfig {
  return {
    apiBaseUrl: process.env.SALLY_API_BASE_URL ?? "http://localhost:8787"
  };
}

export async function readConfig(): Promise<SallyConfig> {
  try {
    const raw = await readFile(getConfigFilePath(), "utf8");
    return normalizeConfig(JSON.parse(raw));
  } catch (error) {
    if (isMissing(error)) {
      return getDefaultConfig();
    }
    throw error;
  }
}

export async function writeConfig(config: SallyConfig): Promise<SallyConfig> {
  const normalized = normalizeConfig(config);
  await mkdir(getConfigDirectory(), { recursive: true });
  await writeFile(getConfigFilePath(), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export async function updateConfig(
  update: (config: SallyConfig) => SallyConfig
): Promise<SallyConfig> {
  const current = await readConfig();
  return writeConfig(update(current));
}

export async function clearConfig(): Promise<void> {
  await rm(getConfigFilePath(), { force: true });
}

export function getConfigDirectory(): string {
  return process.env.SALLY_CONFIG_HOME ?? path.join(os.homedir(), ".sally");
}

export function getConfigFilePath(): string {
  return path.join(getConfigDirectory(), "config.json");
}

function normalizeConfig(config: Partial<SallyConfig>): SallyConfig {
  const defaults = getDefaultConfig();
  return {
    ...(config.activeDaemon ? { activeDaemon: config.activeDaemon } : {}),
    apiBaseUrl: config.apiBaseUrl ?? defaults.apiBaseUrl,
    ...(config.authToken ? { authToken: config.authToken } : {}),
    ...(config.teamSlug ? { teamSlug: config.teamSlug } : {})
  };
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
