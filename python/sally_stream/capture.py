"""
Screen capture via DVT Screenshot service (iOS 17+ via tunneld).
Polls screenshots at ~14fps and pushes PNG bytes into an asyncio.Queue.
"""
import asyncio
import sys


class DvtScreenshotCapture:
    def __init__(self):
        self._queue = asyncio.Queue(maxsize=3)
        self._task = None
        self._rsd = None

    async def start(self):
        from pymobiledevice3.tunneld.api import get_tunneld_devices

        devices = await get_tunneld_devices()
        if not devices:
            raise RuntimeError(
                "No tunneld devices.\n"
                "Run in a separate terminal: sudo /tmp/iosenv/bin/pymobiledevice3 remote tunneld"
            )
        self._rsd = devices[0]
        print(f"[capture] DVT device: {self._rsd.product_type} iOS {self._rsd.product_version}")
        self._task = asyncio.create_task(self._loop())

    async def _loop(self):
        from pymobiledevice3.dtx_service_provider import DtxServiceProvider
        from pymobiledevice3.services.dvt.instruments.screenshot import Screenshot

        class DvtProvider(DtxServiceProvider):
            SERVICE_NAME = "com.apple.instruments.remoteserver.DVTSecureSocketProxy"
            RSD_SERVICE_NAME = "com.apple.instruments.dtservicehub"
            OLD_SERVICE_NAME = "com.apple.instruments.remoteserver"

        while True:
            try:
                async with DvtProvider(self._rsd) as provider:
                    async with Screenshot(provider) as svc:
                        while True:
                            try:
                                frame = await svc.get_screenshot()
                                if self._queue.full():
                                    try:
                                        self._queue.get_nowait()
                                    except asyncio.QueueEmpty:
                                        pass
                                await self._queue.put(frame)
                                await asyncio.sleep(0.07)
                            except Exception as exc:
                                print(f"[capture] frame error: {exc}", file=sys.stderr)
                                await asyncio.sleep(0.2)
                                break
            except Exception as exc:
                print(f"[capture] provider error: {exc}", file=sys.stderr)
                await asyncio.sleep(1.0)

    async def next_frame(self) -> bytes:
        return await self._queue.get()

    async def stop(self):
        if self._task:
            self._task.cancel()

    def alive(self) -> bool:
        return self._task is not None and not self._task.done()


async def make_capture() -> DvtScreenshotCapture:
    cap = DvtScreenshotCapture()
    await cap.start()
    await asyncio.sleep(1.5)
    if not cap.alive():
        raise RuntimeError("Capture task died on startup")
    print("[capture] streaming at ~14fps")
    return cap
