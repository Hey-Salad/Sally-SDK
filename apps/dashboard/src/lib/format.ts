import type { DeviceRecord, SessionRecord } from "./types";

export function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) {
    return "No activity yet";
  }

  const delta = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function summarizeDevices(devices: DeviceRecord[]) {
  return {
    busy: devices.filter((device) => device.status === "busy").length,
    connected: devices.filter((device) => device.status === "online").length,
    offline: devices.filter((device) => device.status === "offline").length,
    total: devices.length
  };
}

export function mergeAuditEntries(
  devices: DeviceRecord[],
  sessions: SessionRecord[]
): Array<{
  detail: string;
  id: string;
  moment: number;
  title: string;
}> {
  const sessionEntries = sessions.map((session) => ({
    detail: session.endedAt ? "Session closed cleanly" : "Session still active",
    id: session.id,
    moment: session.endedAt ?? session.startedAt,
    title: `Session ${session.id.slice(0, 8)} on ${session.deviceId.slice(-4)}`
  }));

  const deviceEntries = devices.map((device) => ({
    detail: device.agentHost ?? "No agent host reported",
    id: device.id,
    moment: device.lastSeen ?? 0,
    title: `${device.name} is ${device.status}`
  }));

  return [...sessionEntries, ...deviceEntries].sort((left, right) => right.moment - left.moment);
}
