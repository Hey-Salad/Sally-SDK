import type {
  ApiListResponse,
  DeviceRecord,
  SessionRecord,
  TeamRecord,
  TeamRole,
  UserRecord
} from "./types";

export const SALLY_WORKER_URL =
  process.env.NEXT_PUBLIC_SALLY_WORKER_URL ??
  "https://heysalad-sally-worker.heysalad-o.workers.dev";

export function getWorkerUrl(path: string): string {
  return new URL(path, ensureTrailingSlash(SALLY_WORKER_URL)).toString();
}

export function toWebSocketUrl(tunnelUrl: string): string {
  const url = new URL("/ws", ensureTrailingSlash(tunnelUrl));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export async function listDevices(): Promise<DeviceRecord[]> {
  const response = await fetch(getWorkerUrl("/devices"), {
    cache: "no-store"
  });
  return readList<DeviceRecord>(response);
}

export async function listSessions(): Promise<SessionRecord[]> {
  const response = await fetch(getWorkerUrl("/sessions"), {
    cache: "no-store"
  });
  return readList<SessionRecord>(response);
}

export async function listTeams(): Promise<TeamRecord[]> {
  const response = await fetch(getWorkerUrl("/teams"), {
    cache: "no-store"
  });
  return readList<TeamRecord>(response);
}

export async function createTeam(input: {
  name: string;
  slug: string;
}): Promise<TeamRecord> {
  const response = await fetch(getWorkerUrl("/teams"), {
    body: JSON.stringify(input),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  return readItem<TeamRecord>(response);
}

export async function listUsers(): Promise<UserRecord[]> {
  const response = await fetch(getWorkerUrl("/users"), {
    cache: "no-store"
  });
  return readList<UserRecord>(response);
}

export async function createUser(input: {
  email: string;
  name: string;
  role: TeamRole;
  teamId: string | null;
}): Promise<UserRecord> {
  const response = await fetch(getWorkerUrl("/users"), {
    body: JSON.stringify(input),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  return readItem<UserRecord>(response);
}

export function makeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function readList<T>(response: Response): Promise<T[]> {
  const payload = (await readJson(response)) as ApiListResponse<T>;
  return payload.items;
}

async function readItem<T>(response: Response): Promise<T> {
  const payload = (await readJson(response)) as { item: T };
  return payload.item;
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    const fallback = await response.text();
    throw new Error(fallback || `Worker request failed with status ${response.status}`);
  }
  return response.json();
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
