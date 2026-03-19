"""
iPhone Remote Control Server
  /             -> Web UI
  /ws           -> WebSocket JPEG frame stream
  POST /touch   -> {type, x, y, [x2, y2, duration]}
  POST /button  -> {name}
  POST /keys    -> {text}
  GET  /status  -> JSON status
"""
import asyncio
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .capture import make_capture
from .config import SERVER_PORT
from .wda_client import wda

STATIC_DIR = Path(__file__).with_name("static")

capture = None
connections: set[WebSocket] = set()
frame_count = 0
start_time = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    del app
    global capture
    print("[server] starting capture...")
    capture = await make_capture()

    print("[server] connecting to WDA (optional)...")
    wda_ok = await wda.connect()
    if not wda_ok:
        print("[server] WDA not available - touch injection disabled")
        print("         To enable: build WebDriverAgent in Xcode and deploy to iPhone")

    asyncio.create_task(broadcast_loop())
    print(f"[server] ready on http://0.0.0.0:{SERVER_PORT}")
    yield
    await capture.stop()


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


async def broadcast_loop():
    global frame_count
    while True:
        if not capture:
            await asyncio.sleep(0.05)
            continue
        frame = await capture.next_frame()
        frame_count += 1
        dead = set()
        for websocket in list(connections):
            try:
                await websocket.send_bytes(frame)
            except Exception:
                dead.add(websocket)
        connections.difference_update(dead)


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.websocket("/ws")
async def ws_stream(websocket: WebSocket):
    await websocket.accept()
    connections.add(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        connections.discard(websocket)


class TouchEvent(BaseModel):
    type: str
    x: float
    y: float
    x2: Optional[float] = None
    y2: Optional[float] = None
    duration: Optional[int] = 300


class ButtonEvent(BaseModel):
    name: str


class KeysEvent(BaseModel):
    text: str


@app.post("/touch")
async def touch(ev: TouchEvent):
    if not wda.available:
        return JSONResponse({"ok": False, "reason": "WDA not connected"}, status_code=503)
    if ev.type == "tap":
        await wda.tap(ev.x, ev.y)
    elif ev.type == "swipe" and ev.x2 is not None and ev.y2 is not None:
        await wda.swipe(ev.x, ev.y, ev.x2, ev.y2, ev.duration or 300)
    return {"ok": True}


@app.post("/button")
async def button(ev: ButtonEvent):
    if not wda.available:
        return JSONResponse({"ok": False, "reason": "WDA not connected"}, status_code=503)
    await wda.press_button(ev.name)
    return {"ok": True}


@app.post("/keys")
async def keys(ev: KeysEvent):
    if not wda.available:
        return JSONResponse({"ok": False, "reason": "WDA not connected"}, status_code=503)
    await wda.send_keys(ev.text)
    return {"ok": True}


@app.get("/status")
async def status():
    elapsed = time.time() - start_time
    return {
        "fps": round(frame_count / elapsed, 1) if elapsed > 0 else 0,
        "frames": frame_count,
        "clients": len(connections),
        "wda": wda.available,
        "capture": type(capture).__name__ if capture else None,
    }


def main() -> None:
    uvicorn.run("python.sally_stream.server:app", host="0.0.0.0", port=SERVER_PORT, log_level="warning")
