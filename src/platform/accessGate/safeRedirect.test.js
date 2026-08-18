import { describe, it, expect } from "vitest";
import { sanitizeNextPath } from "./safeRedirect.js";

describe("safeRedirect.sanitizeNextPath", () => {
  it("accepts a plain same-origin path", () => {
    expect(sanitizeNextPath("/goals")).toBe("/goals");
    expect(sanitizeNextPath("/progress/training/day/2026-01-01?x=1")).toBe("/progress/training/day/2026-01-01?x=1");
  });

  it("falls back to / for missing/empty/non-string values", () => {
    expect(sanitizeNextPath(undefined)).toBe("/");
    expect(sanitizeNextPath(null)).toBe("/");
    expect(sanitizeNextPath("")).toBe("/");
  });

  it("rejects protocol-relative URLs (open redirect via //evil.com)", () => {
    expect(sanitizeNextPath("//evil.com")).toBe("/");
    expect(sanitizeNextPath("////evil.com")).toBe("/");
  });

  it("rejects absolute URLs with a scheme", () => {
    for (const value of ["https://evil.com", "http://evil.com/x", "javascript:alert(1)", "data:text/html,x"]) {
      expect(sanitizeNextPath(value)).toBe("/");
    }
  });

  it("rejects backslash-based bypass attempts", () => {
    expect(sanitizeNextPath("/\\evil.com")).toBe("/");
  });

  it("rejects values that do not start with a single slash", () => {
    expect(sanitizeNextPath("evil.com")).toBe("/");
    expect(sanitizeNextPath("goals")).toBe("/");
  });
});
