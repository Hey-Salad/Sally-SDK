"use client";

import { useMemo, useState } from "react";

export function TouchOverlay({
  streamSize,
  tunnelUrl
}: {
  streamSize: { height: number; width: number } | null;
  tunnelUrl: string;
}) {
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [message, setMessage] = useState("Tap or drag across the stream to send touch controls.");
  const [keys, setKeys] = useState("");

  const endpoints = useMemo(() => ({
    button: new URL("/button", tunnelUrl).toString(),
    keys: new URL("/keys", tunnelUrl).toString(),
    touch: new URL("/touch", tunnelUrl).toString()
  }), [tunnelUrl]);

  async function sendTouch(payload: Record<string, number | string>) {
    const response = await fetch(endpoints.touch, {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      throw new Error("Touch command failed");
    }
  }

  async function sendButton(name: string) {
    const response = await fetch(endpoints.button, {
      body: JSON.stringify({ name }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      throw new Error("Button command failed");
    }
  }

  async function sendKeys() {
    if (!keys.trim()) {
      return;
    }

    const response = await fetch(endpoints.keys, {
      body: JSON.stringify({ text: keys }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      throw new Error("Text input failed");
    }

    setKeys("");
    setMessage("Text sent to device");
  }

  function pointFromEvent(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = streamSize?.width ?? rect.width;
    const height = streamSize?.height ?? rect.height;

    return {
      x: ((event.clientX - rect.left) / rect.width) * width,
      y: ((event.clientY - rect.top) / rect.height) * height
    };
  }

  return (
    <div className="touch-layer">
      <div
        className="touch-surface"
        onPointerDown={(event) => {
          setDragStart(pointFromEvent(event));
        }}
        onPointerUp={async (event) => {
          const end = pointFromEvent(event);

          try {
            if (dragStart) {
              const delta = Math.hypot(end.x - dragStart.x, end.y - dragStart.y);
              if (delta > 24) {
                await sendTouch({
                  duration: 350,
                  type: "swipe",
                  x: Math.round(dragStart.x),
                  x2: Math.round(end.x),
                  y: Math.round(dragStart.y),
                  y2: Math.round(end.y)
                });
                setMessage("Swipe sent");
              } else {
                await sendTouch({
                  type: "tap",
                  x: Math.round(end.x),
                  y: Math.round(end.y)
                });
                setMessage("Tap sent");
              }
            }
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Touch action failed");
          } finally {
            setDragStart(null);
          }
        }}
      />

      <div className="touch-controls">
        <div className="touch-controls__row">
          <button
            className="hs-btn-secondary"
            onClick={async () => {
              try {
                await sendButton("home");
                setMessage("Home button sent");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Button action failed");
              }
            }}
            type="button"
          >
            Home
          </button>
          <button
            className="hs-btn-secondary"
            onClick={async () => {
              try {
                await sendButton("lock");
                setMessage("Lock button sent");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Button action failed");
              }
            }}
            type="button"
          >
            Lock
          </button>
        </div>

        <div className="touch-controls__composer">
          <input
            onChange={(event) => {
              setKeys(event.target.value);
            }}
            placeholder="Send quick text"
            value={keys}
          />
          <button className="hs-btn-primary" onClick={() => void sendKeys()} type="button">
            Send
          </button>
        </div>

        <p className="touch-feedback">{message}</p>
      </div>
    </div>
  );
}
