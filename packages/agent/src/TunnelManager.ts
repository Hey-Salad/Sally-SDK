import { CloudflareTunnel, type CloudflareTunnelOptions, type TunnelMode } from "@heysalad/sally-sdk";

import type { DetectedDevice, ManagedTunnel } from "./types.js";

export interface TunnelManagerOptions {
  createTunnel?: () => CloudflareTunnelLike;
  mode?: TunnelMode;
  publicHostnameBase?: string;
  tunnelOptions?: CloudflareTunnelOptions;
}

interface CloudflareTunnelLike {
  close(): Promise<void>;
  open(options: {
    mode?: TunnelMode;
    name?: string;
    publicHostname?: string;
    targetUrl: string;
  }): Promise<{ url: string }>;
}

interface ActiveTunnel extends ManagedTunnel {
  tunnel: CloudflareTunnelLike;
}

export class TunnelManager {
  private readonly createTunnel: () => CloudflareTunnelLike;
  private readonly mode: TunnelMode | undefined;
  private readonly publicHostnameBase: string | undefined;
  private sessions = new Map<string, ActiveTunnel>();

  constructor(options: TunnelManagerOptions = {}) {
    this.createTunnel = options.createTunnel ?? (() => new CloudflareTunnel(options.tunnelOptions));
    this.mode = options.mode;
    this.publicHostnameBase = options.publicHostnameBase;
  }

  async open(device: DetectedDevice, targetUrl: string): Promise<ManagedTunnel> {
    const existing = this.sessions.get(device.id);
    if (existing) {
      return existing;
    }

    const tunnel = this.createTunnel();
    const name = buildTunnelName(device);
    const publicHostname = this.resolvePublicHostname(name);
    const session = await tunnel.open({
      ...(this.mode ? { mode: this.mode } : {}),
      ...(publicHostname ? { publicHostname } : {}),
      name,
      targetUrl
    });
    const managed: ActiveTunnel = {
      deviceId: device.id,
      targetUrl,
      tunnel,
      url: session.url
    };
    this.sessions.set(device.id, managed);
    return managed;
  }

  async close(deviceId: string): Promise<void> {
    const session = this.sessions.get(deviceId);
    if (!session) {
      return;
    }
    await session.tunnel.close();
    this.sessions.delete(deviceId);
  }

  private resolvePublicHostname(name: string): string | undefined {
    return this.publicHostnameBase ? `${name}.${this.publicHostnameBase}` : undefined;
  }
}

function buildTunnelName(device: DetectedDevice): string {
  return `sally-${device.platform}-${device.id.slice(-8).toLowerCase()}`;
}
