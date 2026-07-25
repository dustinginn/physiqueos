import { describe, expect, it } from "vitest";
import { createClientDraftId } from "./clientDraftId";

describe("createClientDraftId", () => {
  it("uses randomUUID when available", () => {
    const id = createClientDraftId("photo", { cryptoSource: { randomUUID: () => "uuid-value" } });
    expect(id).toBe("photo_uuid-value");
  });

  it("uses getRandomValues when randomUUID is unavailable", () => {
    const cryptoSource = {
      getRandomValues(values) {
        values.set([1, 2, 3, 4]);
        return values;
      },
    };
    expect(() => createClientDraftId("photo", { cryptoSource })).not.toThrow();
    expect(createClientDraftId("photo", { cryptoSource })).toMatch(/^photo_[a-z0-9]+$/);
  });

  it("uses the bounded timestamp-counter fallback without Web Crypto", () => {
    const first = createClientDraftId("photo", { cryptoSource: null, now: () => 1234, random: () => 0.25 });
    const second = createClientDraftId("photo", { cryptoSource: null, now: () => 1234, random: () => 0.25 });
    expect(first).toMatch(/^photo_[a-z0-9]+_[a-z0-9]+_[a-z0-9]+$/);
    expect(second).not.toBe(first);
  });

  it("preserves a safe optional prefix and always returns distinct non-empty strings", () => {
    const cryptoSource = { getRandomValues(values) { values.fill(Math.floor(Math.random() * 0xffffffff)); return values; } };
    const values = Array.from({ length: 20 }, () => createClientDraftId("Photo Draft", { cryptoSource }));
    expect(values.every((value) => typeof value === "string" && value.startsWith("photo_draft_"))).toBe(true);
    expect(new Set(values).size).toBe(values.length);
  });
});
