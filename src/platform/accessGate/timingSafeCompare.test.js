import { describe, it, expect } from "vitest";
import { timingSafeStringEqual } from "./timingSafeCompare.js";

describe("timingSafeCompare.timingSafeStringEqual", () => {
  it("returns true for identical non-empty strings", async () => {
    expect(await timingSafeStringEqual("correct-secret-value", "correct-secret-value")).toBe(true);
  });

  it("returns false for different strings of the same length", async () => {
    expect(await timingSafeStringEqual("aaaaaaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaaaaaab")).toBe(false);
  });

  it("returns false for different-length strings", async () => {
    expect(await timingSafeStringEqual("short", "a-much-longer-value")).toBe(false);
  });

  it("returns false when both are empty (never authenticate on an empty secret)", async () => {
    expect(await timingSafeStringEqual("", "")).toBe(false);
  });

  it("returns false for null/undefined inputs without throwing", async () => {
    expect(await timingSafeStringEqual(null, "x")).toBe(false);
    expect(await timingSafeStringEqual(undefined, undefined)).toBe(false);
  });
});
