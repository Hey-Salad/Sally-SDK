"use client";

import Link from "next/link";
import { startTransition, useEffect, useState } from "react";

import { listDevices } from "../lib/api";
import { formatRelativeTime, summarizeDevices } from "../lib/format";
import type { DeviceRecord } from "../lib/types";
import { StatusPill } from "./StatusPill";

export function DeviceList() {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const nextDevices = await listDevices();
        if (cancelled) {
          return;
        }
        startTransition(() => {
          setDevices(nextDevices);
          setError(null);
          setLoading(false);
        });
      } catch (nextError) {
        if (cancelled) {
          return;
        }
        startTransition(() => {
          setError(nextError instanceof Error ? nextError.message : "Unable to load devices");
          setLoading(false);
        });
      }
    }

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 4_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const summary = summarizeDevices(devices);

  return (
    <section className="panel-stack">
      <div className="hero-card">
        <div>
          <p className="eyebrow">Control room</p>
          <h1>Watch every Sally bridge at a glance.</h1>
          <p className="hero-copy">
            Live tunnels, stream health, and the next device that needs attention.
          </p>
        </div>
        <div className="summary-grid">
          <SummaryCard label="Connected" value={summary.connected} />
          <SummaryCard label="Offline" value={summary.offline} />
          <SummaryCard label="Busy" value={summary.busy} />
          <SummaryCard label="Tracked" value={summary.total} />
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="device-grid">
        {loading ? (
          <div className="empty-card">Loading Sally device activity...</div>
        ) : devices.length === 0 ? (
          <div className="empty-card">No devices have checked in yet. Start the agent and they will appear here.</div>
        ) : (
          devices.map((device) => (
            <Link className="device-card" href={`/devices/${encodeURIComponent(device.id)}`} key={device.id}>
              <div className="device-card__header">
                <div>
                  <p className="device-kicker">{device.platform}</p>
                  <h2>{device.name}</h2>
                </div>
                <StatusPill status={device.status} />
              </div>
              <p className="device-meta">{device.model ?? "Unknown model"} · iOS {device.osVersion ?? "n/a"}</p>
              <dl className="device-stats">
                <div>
                  <dt>Device ID</dt>
                  <dd>{device.id}</dd>
                </div>
                <div>
                  <dt>Agent</dt>
                  <dd>{device.agentHost ?? "Not assigned"}</dd>
                </div>
                <div>
                  <dt>Last seen</dt>
                  <dd>{formatRelativeTime(device.lastSeen)}</dd>
                </div>
                <div>
                  <dt>Tunnel</dt>
                  <dd>{device.tunnelUrl ? "Ready to open" : "Waiting for agent"}</dd>
                </div>
              </dl>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
