"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";

import { listDevices, toWebSocketUrl } from "../lib/api";
import { formatRelativeTime } from "../lib/format";
import type { DeviceRecord } from "../lib/types";
import { StatusPill } from "./StatusPill";
import { TouchOverlay } from "./TouchOverlay";

export function DeviceStream({ deviceId }: { deviceId: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [device, setDevice] = useState<DeviceRecord | null>(null);
  const [connectionState, setConnectionState] = useState("Waiting for live tunnel");
  const [streamSize, setStreamSize] = useState<{ height: number; width: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const devices = await listDevices();
        const nextDevice = devices.find((item) => item.id === deviceId) ?? null;
        if (cancelled) {
          return;
        }
        startTransition(() => {
          setDevice(nextDevice);
          setError(null);
        });
      } catch (nextError) {
        if (cancelled) {
          return;
        }
        setError(nextError instanceof Error ? nextError.message : "Unable to refresh device state");
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
  }, [deviceId]);

  const websocketUrl = useMemo(() => {
    return device?.tunnelUrl ? toWebSocketUrl(device.tunnelUrl) : null;
  }, [device?.tunnelUrl]);

  useEffect(() => {
    if (!websocketUrl || device?.status !== "online") {
      setConnectionState("Waiting for live tunnel");
      return;
    }

    const socket = new WebSocket(websocketUrl);
    socket.binaryType = "arraybuffer";
    let disposed = false;

    socket.addEventListener("open", () => {
      if (!disposed) {
        setConnectionState("Live stream connected");
      }
      socket.send("ready");
    });

    socket.addEventListener("message", async (event) => {
      if (!canvasRef.current) {
        return;
      }

      const blob = event.data instanceof Blob ? event.data : new Blob([event.data], { type: "image/jpeg" });
      const bitmap = await createImageBitmap(blob);
      const canvas = canvasRef.current;
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      context?.drawImage(bitmap, 0, 0);
      setStreamSize({ height: bitmap.height, width: bitmap.width });
      bitmap.close();
      socket.send("ready");
    });

    socket.addEventListener("close", () => {
      if (!disposed) {
        setConnectionState("Stream disconnected");
      }
    });

    socket.addEventListener("error", () => {
      if (!disposed) {
        setConnectionState("Stream unavailable");
      }
    });

    return () => {
      disposed = true;
      socket.close();
    };
  }, [device?.status, websocketUrl]);

  if (!device) {
    return (
      <section className="stream-layout">
        <div className="empty-card">This device is not in the Sally registry yet.</div>
      </section>
    );
  }

  return (
    <section className="stream-layout">
      <div className="stream-hero">
        <div>
          <p className="eyebrow">Live device room</p>
          <h1>{device.name}</h1>
          <p className="hero-copy">
            Stay close to the session, send simple touch controls, and jump back to the fleet if the stream drops.
          </p>
        </div>
        <div className="stream-hero__meta">
          <StatusPill status={device.status} />
          <span>{formatRelativeTime(device.lastSeen)}</span>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="stream-shell">
        <div className="stream-stage">
          <div className="stream-stage__header">
            <div>
              <strong>{connectionState}</strong>
              <p>{device.tunnelUrl ?? "No tunnel URL yet"}</p>
            </div>
            <Link className="ghost-link" href="/">
              Back to devices
            </Link>
          </div>
          <div className="stream-stage__canvas">
            <canvas ref={canvasRef} />
            {device.tunnelUrl ? <TouchOverlay streamSize={streamSize} tunnelUrl={device.tunnelUrl} /> : null}
          </div>
        </div>

        <aside className="stream-sidebar">
          <div className="detail-card">
            <h2>Session details</h2>
            <dl className="detail-list">
              <div>
                <dt>Device ID</dt>
                <dd>{device.id}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{device.model ?? "Unknown"}</dd>
              </div>
              <div>
                <dt>OS</dt>
                <dd>{device.osVersion ?? "Unknown"}</dd>
              </div>
              <div>
                <dt>Agent host</dt>
                <dd>{device.agentHost ?? "Not reported"}</dd>
              </div>
            </dl>
          </div>
          <div className="detail-card detail-card--accent">
            <h2>What to do if this drops</h2>
            <p>
              Start the Sally agent again from the CLI, then refresh this page. Quick tunnels rotate, so the stream URL can change between sessions.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
