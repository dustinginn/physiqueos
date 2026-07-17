import { describe, expect, it } from "vitest";
import {
  EVIDENCE_HUB_CANONICAL_ORDER,
  EVIDENCE_HUB_USAGE_KEY,
  orderEvidenceStreams,
  parseEvidenceHubUsage,
  readEvidenceHubUsage,
  rankRecentlyUsedEvidence,
  recordEvidenceHubVisit,
  writeEvidenceHubUsage,
} from "./EvidenceHubUsageService";

const NOW = new Date("2026-07-17T12:00:00.000Z");
const usage = (categories) => ({ version: 1, categories });
const category = (...recentOpens) => ({ lastOpenedAt: recentOpens.at(-1), recentOpens });

describe("Evidence Hub local usage ranking", () => {
  it("uses one versioned, namespaced storage key", () => {
    expect(EVIDENCE_HUB_USAGE_KEY).toBe("physiqueos:evidence-hub-usage:v1");
  });

  it("has a cold start with no invented personalization", () => {
    expect(rankRecentlyUsedEvidence(null, NOW)).toEqual([]);
  });

  it("records stable evidence identifiers without mutating its input", () => {
    const initial = usage({});
    const next = recordEvidenceHubVisit(initial, "training", NOW);
    expect(initial).toEqual(usage({}));
    expect(next.categories.training).toEqual({
      lastOpenedAt: NOW.toISOString(),
      recentOpens: [NOW.toISOString()],
    });
  });

  it("shows one recorded category and caps larger histories at three", () => {
    const one = recordEvidenceHubVisit(null, "training", NOW);
    expect(rankRecentlyUsedEvidence(one, NOW)).toEqual(["training"]);
    const many = usage(Object.fromEntries(EVIDENCE_HUB_CANONICAL_ORDER.slice(0, 5).map((id, index) => [
      id,
      category(new Date(NOW.getTime() - index * 60_000).toISOString()),
    ])));
    expect(rankRecentlyUsedEvidence(many, NOW)).toHaveLength(3);
  });

  it("weights newer opens more heavily", () => {
    const result = rankRecentlyUsedEvidence(usage({
      training: category("2026-07-01T12:00:00.000Z"),
      nutrition: category("2026-07-17T11:00:00.000Z"),
    }), NOW);
    expect(result.slice(0, 2)).toEqual(["nutrition", "training"]);
  });

  it("accounts for frequency as the sum of weighted recent opens", () => {
    const result = rankRecentlyUsedEvidence(usage({
      training: category("2026-07-16T10:00:00.000Z", "2026-07-16T11:00:00.000Z"),
      nutrition: category("2026-07-17T11:00:00.000Z"),
    }), NOW);
    expect(result[0]).toBe("training");
  });

  it("breaks score ties by last opened time and then canonical order", () => {
    const byLastOpened = rankRecentlyUsedEvidence(usage({
      training: category("2026-07-17T09:00:00.000Z"),
      nutrition: category("2026-07-17T10:00:00.000Z"),
    }), NOW);
    expect(byLastOpened.slice(0, 2)).toEqual(["nutrition", "training"]);

    const sameTime = "2026-07-17T10:00:00.000Z";
    const byCanonicalOrder = rankRecentlyUsedEvidence(usage({
      nutrition: category(sameTime),
      training: category(sameTime),
    }), NOW);
    expect(byCanonicalOrder.slice(0, 2)).toEqual(["training", "nutrition"]);
  });

  it("falls back safely for malformed or incompatible storage", () => {
    for (const malformed of ["{", "null", "[]", '{"version":2,"categories":{}}']) {
      expect(parseEvidenceHubUsage(malformed)).toEqual({ version: 1, categories: {} });
    }
  });

  it("survives unavailable or throwing local storage", () => {
    const unavailable = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(readEvidenceHubUsage(undefined)).toEqual({ version: 1, categories: {} });
    expect(readEvidenceHubUsage(unavailable)).toEqual({ version: 1, categories: {} });
    expect(writeEvidenceHubUsage(undefined, usage({}))).toBe(false);
    expect(writeEvidenceHubUsage(unavailable, usage({}))).toBe(false);
  });

  it("keeps All Evidence in canonical order and complete", () => {
    const reversed = [...EVIDENCE_HUB_CANONICAL_ORDER].reverse().map((id) => ({ id }));
    expect(orderEvidenceStreams(reversed).map((item) => item.id)).toEqual(EVIDENCE_HUB_CANONICAL_ORDER);
  });
});
