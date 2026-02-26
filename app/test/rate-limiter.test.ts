import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimit } from "../utils/rate-limiter.server";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first request", () => {
    const result = checkRateLimit("test-key-1", { limit: 5, windowMs: 10_000 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("decrements remaining on each request", () => {
    const opts = { limit: 3, windowMs: 10_000 };
    const r1 = checkRateLimit("test-key-2", opts);
    const r2 = checkRateLimit("test-key-2", opts);
    const r3 = checkRateLimit("test-key-2", opts);
    expect(r1.remaining).toBe(2);
    expect(r2.remaining).toBe(1);
    expect(r3.remaining).toBe(0);
    expect(r3.allowed).toBe(true);
  });

  it("blocks requests exceeding the limit", () => {
    const opts = { limit: 2, windowMs: 10_000 };
    checkRateLimit("test-key-3", opts);
    checkRateLimit("test-key-3", opts);
    const r3 = checkRateLimit("test-key-3", opts);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it("resets after the window expires", () => {
    const opts = { limit: 1, windowMs: 5_000 };
    checkRateLimit("test-key-4", opts);
    const blocked = checkRateLimit("test-key-4", opts);
    expect(blocked.allowed).toBe(false);

    vi.advanceTimersByTime(5_001);

    const afterReset = checkRateLimit("test-key-4", opts);
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.remaining).toBe(0);
  });

  it("tracks different keys independently", () => {
    const opts = { limit: 1, windowMs: 10_000 };
    checkRateLimit("key-a", opts);
    const blockedA = checkRateLimit("key-a", opts);
    const allowedB = checkRateLimit("key-b", opts);
    expect(blockedA.allowed).toBe(false);
    expect(allowedB.allowed).toBe(true);
  });

  it("returns a resetAt timestamp in the future", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const result = checkRateLimit("test-key-5", { limit: 10, windowMs: 60_000 });
    expect(result.resetAt).toBe(Date.now() + 60_000);
  });
});
