"""
Touch injection via WebDriverAgent (WDA).
Falls back to a 'no WDA' stub so the server still runs without it.
"""


class WdaClient:
    """Thin async wrapper around the WDA HTTP API via usbmux port forward."""

    def __init__(self, host="127.0.0.1", port=8100):
        self._base = f"http://{host}:{port}"
        self._session_id = None
        self._available = False

    async def connect(self):
        """Start a WDA session. Returns True if WDA is reachable."""
        import aiohttp

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self._base}/status", timeout=aiohttp.ClientTimeout(total=3)) as response:
                    if response.status != 200:
                        return False
                payload = {"capabilities": {"alwaysMatch": {}}}
                async with session.post(
                    f"{self._base}/session",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as response:
                    data = await response.json()
                    self._session_id = data["sessionId"]
                    self._available = True
                    print(f"[wda] session started: {self._session_id}")
                    return True
        except Exception as exc:
            print(f"[wda] not available: {exc}")
            self._available = False
            return False

    async def _post(self, path: str, payload: dict):
        import aiohttp

        url = f"{self._base}{path}"
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=5),
            ) as response:
                return await response.json()

    async def tap(self, x: float, y: float):
        if not self._available:
            return
        payload = {
            "actions": [
                {
                    "type": "pointer",
                    "id": "finger1",
                    "pointerType": "touch",
                    "actions": [
                        {"type": "pointerMove", "duration": 0, "x": int(x), "y": int(y)},
                        {"type": "pointerDown", "duration": 0, "button": 0},
                        {"type": "pause", "duration": 80},
                        {"type": "pointerUp", "duration": 0, "button": 0},
                    ],
                }
            ]
        }
        await self._post(f"/session/{self._session_id}/actions", payload)

    async def swipe(self, x1: float, y1: float, x2: float, y2: float, duration_ms: int = 300):
        if not self._available:
            return
        payload = {
            "actions": [
                {
                    "type": "pointer",
                    "id": "finger1",
                    "pointerType": "touch",
                    "actions": [
                        {"type": "pointerMove", "duration": 0, "x": int(x1), "y": int(y1)},
                        {"type": "pointerDown", "duration": 0, "button": 0},
                        {"type": "pointerMove", "duration": duration_ms, "x": int(x2), "y": int(y2)},
                        {"type": "pointerUp", "duration": 0, "button": 0},
                    ],
                }
            ]
        }
        await self._post(f"/session/{self._session_id}/actions", payload)

    async def press_button(self, name: str):
        if not self._available:
            return
        await self._post(f"/session/{self._session_id}/wda/pressButton", {"name": name})

    async def send_keys(self, text: str):
        if not self._available:
            return
        await self._post(f"/session/{self._session_id}/wda/keys", {"value": list(text)})

    @property
    def available(self):
        return self._available


wda = WdaClient(host="127.0.0.1", port=8100)
