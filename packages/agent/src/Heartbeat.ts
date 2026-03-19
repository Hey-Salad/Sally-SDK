export interface HeartbeatOptions {
  intervalMs?: number;
  onBeat: () => Promise<void>;
}

export class Heartbeat {
  private readonly intervalMs: number;
  private readonly onBeat: () => Promise<void>;
  private timer: NodeJS.Timeout | undefined;

  constructor(options: HeartbeatOptions) {
    this.intervalMs = options.intervalMs ?? 30_000;
    this.onBeat = options.onBeat;
  }

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.ping();
    }, this.intervalMs);
  }

  stop(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async ping(): Promise<void> {
    await this.onBeat();
  }
}
