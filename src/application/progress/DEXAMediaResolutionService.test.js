import { describe, expect, it } from "vitest";
import { createDEXAMediaLookup, resolveProviderDEXAScanMedia } from "./DEXAMediaResolutionService.js";

const completeScan = (overrides = {}) => ({
  id: "dexa_2026_07_18",
  measuredAt: "2026-07-18",
  totalMass: { value: 167.4, unit: "lb" },
  bodyFatPercentage: 7.7,
  fatMass: { value: 12.8, unit: "lb" },
  leanMass: { value: 147.5, unit: "lb" },
  boneMineralContent: { value: 7.1, unit: "lb" },
  restingMetabolicRate: { value: 1794, unit: "kcal/day" },
  sourceFileId: "7-18-26-DEXA.pdf",
  ...overrides,
});

const media = (overrides = {}) => ({
  id: "media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e57",
  evidence_record_id: "evidence_package",
  original_filename: "evidence_submission-1-7-18-26-DEXA.pdf",
  provenance: { sourceRelativePath: "evidence/uploads/evidence_submission-1-7-18-26-DEXA.pdf" },
  sha256: "a".repeat(64),
  state: "verified",
  ...overrides,
});

describe("DEXA provider media projection", () => {
  it("builds an owner-scoped bounded lookup from canonical scans only", () => {
    const lookup = createDEXAMediaLookup([
      completeScan(),
      completeScan({ id: "partial", measuredAt: "2026-06-20", canonicalLifecycleStatus: "superseded", sourceFileId: "partial.pdf" }),
    ]);
    expect(lookup.references).toEqual(["7-18-26-dexa.pdf"]);
    expect(lookup.sourceIds).toEqual(["dexa_2026_07_18"]);
    expect(lookup.normalizedPaths).toEqual(["7-18-26-dexa.pdf"]);
  });

  it("orders by measured date, removes revisions, and emits only opaque provider references", () => {
    const august = completeScan({
      id: "dexa_2026_08_15",
      measuredAt: "2026-08-15",
      sourceFileId: "august.pdf",
      updatedAt: "2026-08-15T10:00:00.000Z",
    });
    const july = completeScan({ updatedAt: "2026-09-01T10:00:00.000Z" });
    const resolved = resolveProviderDEXAScanMedia({
      scans: [august, july],
      mediaObjects: [
        media(),
        media({
          id: "media-2fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e58",
          evidence_record_id: august.id,
          original_filename: "august.pdf",
          provenance: { sourceRelativePath: "dexa/uploads/august.pdf" },
          sha256: "b".repeat(64),
        }),
      ],
    });
    expect(resolved.map((scan) => scan.measuredAt)).toEqual(["2026-07-18", "2026-08-15"]);
    expect(resolved.map((scan) => scan.sourceFileId)).toEqual([
      "media://media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e57",
      "media://media-2fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e58",
    ]);
  });

  it("fails closed instead of emitting a legacy provider URL when media is unresolved", () => {
    expect(resolveProviderDEXAScanMedia({ scans: [completeScan()], mediaObjects: [] })[0])
      .toMatchObject({ sourceFileId: null, rawReportPath: null });
  });
});
