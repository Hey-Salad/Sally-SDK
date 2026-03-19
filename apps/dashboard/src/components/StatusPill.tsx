import type { DeviceStatus } from "../lib/types";

export function StatusPill({ status }: { status: DeviceStatus | string }) {
  return <span className={`status-pill status-pill--${status}`}>{status}</span>;
}
