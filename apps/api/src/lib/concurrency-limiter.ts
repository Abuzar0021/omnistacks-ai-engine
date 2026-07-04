/**
 * Caps how many async tasks run at once within this process (used by
 * modules whose work is heavy per-unit — Playwright browser launches,
 * LLM calls). This is intentionally a small in-process gate, not a durable
 * job queue — a real queue (with cross-restart persistence and
 * multi-instance coordination) is a separate, not-yet-built milestone (see
 * docs/ROADMAP.md). Overflow tasks simply wait their turn in memory.
 */
export class ConcurrencyLimiter {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.active -= 1;
    const next = this.queue.shift();
    if (next) next();
  }
}
