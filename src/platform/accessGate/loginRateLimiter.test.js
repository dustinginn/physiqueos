import { describe, it, expect, beforeEach } from "vitest";
import { checkLoginRateLimit, resetLoginRateLimitForTests } from "./loginRateLimiter.js";

describe("loginRateLimiter.checkLoginRateLimit", () => {
  beforeEach(() => resetLoginRateLimitForTests());

  it("allows the first several attempts from one key", () => {
    for (let i = 0; i < 10; i += 1) {
      expect(checkLoginRateLimit("1.2.3.4").allowed).toBe(true);
    }
  });

  it("blocks after exceeding the per-window attempt cap", () => {
    for (let i = 0; i < 10; i += 1) checkLoginRateLimit("1.2.3.4");
    const result = checkLoginRateLimit("1.2.3.4");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks separate keys independently", () => {
    for (let i = 0; i < 10; i += 1) checkLoginRateLimit("1.2.3.4");
    expect(checkLoginRateLimit("1.2.3.4").allowed).toBe(false);
    expect(checkLoginRateLimit("5.6.7.8").allowed).toBe(true);
  });

  it("resets the window after it elapses", () => {
    const now = Date.now();
    for (let i = 0; i < 10; i += 1) checkLoginRateLimit("1.2.3.4", now);
    expect(checkLoginRateLimit("1.2.3.4", now).allowed).toBe(false);
    expect(checkLoginRateLimit("1.2.3.4", now + 5 * 60 * 1000 + 1).allowed).toBe(true);
  });
});
