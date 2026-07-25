import { describe, expect, it } from "vitest";
import { validateDexaScan } from "./DEXAContract";
import { selectValidDexaScans, toDexaReadModel } from "./DEXAReadModelAdapter";

function validScan(overrides = {}) {
  return {
    id: "dexa_2026_07_18",
    measuredAt: "2026-07-18",
    totalMass: { value: 167.4, unit: "lb" },
    bodyFatPercentage: 7.7,
    fatMass: { value: 12.8, unit: "lb" },
    leanMass: { value: 147.5, unit: "lb" },
    boneMineralContent: { value: 7.1, unit: "lb" },
    restingMetabolicRate: { value: 1794, unit: "kcal/day" },
    sourceFileId: "report.pdf",
    provenance: { extraction_engine: "pdfjs-dist", fixture: false, source_artifact_refs: ["report.pdf"] },
    ...overrides,
  };
}

describe("DEXA contract and read model", () => {
  it("accepts a complete internally coherent scan", () => {
    expect(validateDexaScan(validScan())).toEqual({ valid: true, issues: [] });
  });

  it("rejects null required fields and mass inconsistency", () => {
    expect(validateDexaScan(validScan({ leanMass: { value: null, unit: "lb" } })).valid).toBe(false);
    expect(validateDexaScan(validScan({ fatMass: { value: 40, unit: "lb" } })).issues.some((issue) => issue.field === "massConsistency")).toBe(true);
  });

  it("maps top-level canonical fields without metadata guessing", () => {
    const supplemental = {
      visceralAdiposeTissue: { mass: { value: 0.15, unit: "lb" }, volume: { value: 4.51, unit: "in3" } },
      androidFatPercentage: 5.4,
      gynoidFatPercentage: 7.4,
      androidGynoidRatio: 0.73,
      boneDensity: { totalBMD: 1.238, totalBMDUnit: "g/cm2", tScore: 0.4, zScore: 0.4 },
    };
    expect(toDexaReadModel(validScan(supplemental), { canonicalId: "canonical_dexa", userId: "founder" })).toMatchObject({
      canonicalId: "canonical_dexa",
      measuredAt: "2026-07-18",
      bodyFatPercentage: 7.7,
      leanMass: { value: 147.5 },
      ...supplemental,
      canonicalLifecycleStatus: "current",
    });
  });

  it("rejects invalid optional values without requiring absent optional values", () => {
    expect(validateDexaScan(validScan()).valid).toBe(true);
    expect(validateDexaScan(validScan({ visceralAdiposeTissue: { mass: { value: -1, unit: "lb" } } })).valid).toBe(false);
    expect(validateDexaScan(validScan({ boneDensity: { totalBMD: 0 } })).valid).toBe(false);
  });

  it("returns one authoritative point per date and excludes superseded scans", () => {
    const older = validScan({ id: "older", updatedAt: "2026-07-18T10:00:00.000Z" });
    const current = validScan({ id: "current", updatedAt: "2026-07-18T11:00:00.000Z" });
    const superseded = validScan({ id: "bad", measuredAt: "2026-06-20", canonicalLifecycleStatus: "superseded" });
    expect(selectValidDexaScans([older, superseded, current]).map((scan) => scan.id)).toEqual(["current"]);
  });
});
