"use client";

import { startTransition, useEffect, useState } from "react";

import { listDevices, listSessions } from "../lib/api";
import { formatRelativeTime, mergeAuditEntries } from "../lib/format";
import type { DeviceRecord, SessionRecord } from "../lib/types";

export function AuditLogView() {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const [nextDevices, nextSessions] = await Promise.all([listDevices(), listSessions()]);
        if (cancelled) {
          return;
        }
        startTransition(() => {
          setDevices(nextDevices);
          setSessions(nextSessions);
          setError(null);
        });
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Unable to load audit feed");
        }
      }
    }

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 8_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const entries = mergeAuditEntries(devices, sessions);

  return (
    <section className="panel-stack">
      <div className="hero-card hero-card--compact">
        <div>
          <p className="eyebrow">Audit trail</p>
          <h1>See the latest device motion and session churn.</h1>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="timeline">
        {entries.length === 0 ? (
          <div className="empty-card">No activity yet. The first session and device heartbeat will land here.</div>
        ) : (
          entries.map((entry) => (
            <article className="timeline-card" key={entry.id}>
              <div className="timeline-dot" />
              <div>
                <strong>{entry.title}</strong>
                <p>{entry.detail}</p>
              </div>
              <span>{formatRelativeTime(entry.moment)}</span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
