export type RateLimitRequest = {
  key: string;
  bucket: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export type RateLimiter = {
  consume(input: RateLimitRequest): Promise<RateLimitResult>;
};

type Window = { count: number; resetsAt: number };

export class InMemoryRateLimiter implements RateLimiter {
  readonly #windows = new Map<string, Window>();

  constructor(private readonly now: () => number = Date.now) {}

  async consume(input: RateLimitRequest): Promise<RateLimitResult> {
    const now = this.now();
    const key = `${input.bucket}\u001f${input.key}`;
    const existing = this.#windows.get(key);
    const window =
      !existing || existing.resetsAt <= now
        ? { count: 0, resetsAt: now + input.windowMs }
        : existing;
    if (window.count >= input.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((window.resetsAt - now) / 1_000))
      };
    }
    window.count += 1;
    this.#windows.set(key, window);
    return { allowed: true };
  }
}
