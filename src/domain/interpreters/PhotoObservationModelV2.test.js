import { describe, expect, it } from "vitest";
import {
  normalizePhotoModelSemantics,
  normalizeStructuredPhotoSemantics,
  PHOTO_INTERPRETATION_SCHEMA_VERSION,
} from "./PhotoObservationModel";

const base = {
  region: "Midsection",
  metric: "leanness",
  direction: "increased",
  magnitude: "subtle",
  change: "The comparison supports a modest visual change.",
  confidence: "moderate",
  limitations: ["Lighting differs slightly."],
};

describe("photo_interpretation_v2", () => {
  it.each([
    ["leanness", "increased"],
    ["leanness", "decreased"],
    ["abdominal_definition", "increased"],
    ["abdominal_definition", "decreased"],
    ["whole_body_softness", "increased"],
    ["whole_body_softness", "decreased"],
    ["muscularity", "increased"],
    ["muscularity", "decreased"],
    ["visual_stability", "stable"],
    ["leanness", "mixed"],
    ["unknown", "insufficient"],
    ["unknown", "unknown"],
  ])("normalizes %s %s without reading display copy", (metric, direction) => {
    const value = normalizeStructuredPhotoSemantics([
      {
        ...base,
        metric,
        direction,
        magnitude: direction === "stable" ? "none" : ["insufficient", "unknown"].includes(direction) ? "unknown" : "subtle",
        limitations: direction === "insufficient" ? ["Direction unavailable."] : [],
      },
    ])[0];
    expect(value).toMatchObject({
      schemaVersion: PHOTO_INTERPRETATION_SCHEMA_VERSION,
      metric,
      direction,
      change: base.change,
    });
  });

  it("preserves exact semantic provenance and context", () => {
    const value = normalizeStructuredPhotoSemantics([base], {
      comparisonSessionId: "prior-session",
      pose: "relaxed",
      bodyView: "front",
      contractionState: "relaxed",
      sourceEvidenceIds: ["photo-b", "photo-a"],
      provenance: { interpreter: "PhotoInterpreter", interpreterVersion: "v2" },
    })[0];
    expect(value).toMatchObject({
      comparisonSessionId: "prior-session",
      pose: "relaxed",
      bodyView: "front",
      contractionState: "relaxed",
      sourceEvidenceIds: ["photo-a", "photo-b"],
      provenance: {
        interpreter: "PhotoInterpreter",
        interpreterVersion: "v2",
        schemaVersion: PHOTO_INTERPRETATION_SCHEMA_VERSION,
      },
    });
  });

  it("does not infer semantics from change", () => {
    const value = normalizeStructuredPhotoSemantics([
      {
        ...base,
        metric: "unknown",
        direction: "unknown",
        magnitude: "unknown",
        change: "Waist looks tighter and body fat appears lower.",
      },
    ])[0];
    expect(value).toMatchObject({ metric: "unknown", direction: "unknown" });
  });

  it.each(["positive", "negative", "better", "worse"])(
    "rejects invalid direction %s",
    (direction) => {
      expect(() =>
        normalizeStructuredPhotoSemantics([{ ...base, direction }])
      ).toThrow(/direction/);
    }
  );

  it("rejects unsupported and measured body-composition fields", () => {
    expect(() =>
      normalizeStructuredPhotoSemantics([{ ...base, metric: "body_fat_percentage" }])
    ).toThrow(/metric/);
    expect(() =>
      normalizeStructuredPhotoSemantics([{ ...base, bodyFatPercentage: 9 }])
    ).toThrow(/numeric body-composition/);
  });

  it("requires limitations for insufficient results", () => {
    expect(() =>
      normalizeStructuredPhotoSemantics([
        { ...base, metric: "unknown", direction: "insufficient", magnitude: "unknown", limitations: [] },
      ])
    ).toThrow(/limitation/);
  });

  it("enforces magnitude before direction", () => {
    expect(normalizeStructuredPhotoSemantics([{
      ...base, metric: "visual_stability", direction: "stable", magnitude: "none",
      change: "No meaningful visible difference is apparent.",
    }])[0]).toMatchObject({ direction: "stable", magnitude: "none" });
    expect(() => normalizeStructuredPhotoSemantics([{
      ...base, direction: "increased", magnitude: "none",
    }])).toThrow(/magnitude/);
    expect(() => normalizeStructuredPhotoSemantics([{
      ...base, direction: "stable", magnitude: "pronounced", metric: "visual_stability",
    }])).toThrow(/magnitude/);
    expect(() => normalizeStructuredPhotoSemantics([{
      ...base, direction: "mixed", magnitude: "none",
    }])).toThrow(/magnitude/);
  });

  it("normalizes contradictory provider enums without inventing direction", () => {
    expect(normalizePhotoModelSemantics([{
      ...base, metric: "leanness", direction: "insufficient", magnitude: "subtle",
    }])[0]).toMatchObject({ direction: "insufficient", magnitude: "unknown" });
    expect(normalizePhotoModelSemantics([{
      ...base, metric: "leanness", direction: "increased", magnitude: "none",
    }])[0]).toMatchObject({ metric: "unknown", direction: "unknown", magnitude: "unknown", confidence: "low" });
    expect(normalizePhotoModelSemantics([{
      ...base, metric: "visual_stability", direction: "increased", magnitude: "subtle",
    }])[0]).toMatchObject({ metric: "unknown", direction: "unknown", magnitude: "unknown", confidence: "low" });
    expect(normalizePhotoModelSemantics([{
      ...base, metric: "unknown", direction: "stable", magnitude: "none",
    }])[0]).toMatchObject({ metric: "unknown", direction: "unknown", magnitude: "unknown", confidence: "low" });
    expect(normalizePhotoModelSemantics([{
      ...base, metric: "unknown", direction: "insufficient", magnitude: "subtle", limitations: [],
    }])[0]).toMatchObject({ direction: "insufficient", magnitude: "unknown", limitations: [expect.any(String)] });
  });

  it("rejects precise body-composition conclusions in display copy", () => {
    expect(() => normalizeStructuredPhotoSemantics([{
      ...base, change: "The photos show body fat at 8.4%.",
    }])).toThrow(/precise body-composition/);
    expect(() => normalizeStructuredPhotoSemantics([{
      ...base, change: "An estimated 12% body fat is visible.",
    }])).toThrow(/precise body-composition/);
  });

  it("is deterministic, JSON-safe, immutable, clock-free, and repository-free", () => {
    const input = [structuredClone(base)];
    const before = structuredClone(input);
    const first = normalizeStructuredPhotoSemantics(input);
    expect(first).toEqual(normalizeStructuredPhotoSemantics(input));
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(input).toEqual(before);
  });
});
