import { describe, expect, it } from "vitest";
import {
  createCanonicalDexaScanRecord,
  createDexaSemanticFingerprint,
  getStableDexaCanonicalId,
  selectActiveCanonicalDexaScans,
} from "./CanonicalDexaScanService";

const scan = (overrides = {}) => ({
  id: "submission-one",
  userId: "owner",
  evidence_type: "dexa_scan",
  measuredAt: "2026-08-15",
  observed_at: "2026-08-15",
  totalMass: { value: 172, unit: "lb" },
  bodyFatPercentage: 10,
  fatMass: { value: 17.2, unit: "lb" },
  leanMass: { value: 148, unit: "lb" },
  boneMineralContent: { value: 6.8, unit: "lb" },
  restingMetabolicRate: { value: 1800, unit: "kcal/day" },
  sourceFileId: "first.pdf",
  provenance: { extraction_engine: "pdfjs-dist", fixture: false },
  ...overrides,
});

describe("canonical DEXA scan identity", () => {
  it("uses owner and intended scan date rather than upload identity", () => {
    expect(getStableDexaCanonicalId(scan(), "owner"))
      .toBe("dexa_scan|owner|2026-08-15");
    expect(getStableDexaCanonicalId(scan({ id: "retry" }), "owner"))
      .toBe("dexa_scan|owner|2026-08-15");
  });

  it("keeps semantic fingerprints independent of source and field ordering", () => {
    const reordered = Object.fromEntries(Object.entries(scan({
      id: "retry",
      sourceFileId: "retry.pdf",
    })).reverse());
    expect(createDexaSemanticFingerprint(reordered))
      .toBe(createDexaSemanticFingerprint(scan()));
  });

  it("reuses lineage for an equivalent reparse and advances one revision for a correction", () => {
    const canonicalId = getStableDexaCanonicalId(scan(), "owner");
    const first = createCanonicalDexaScanRecord({
      canonicalId,
      canonicalProvenance: { evidence_package_ids: ["package-1"] },
      evidenceObject: scan(),
      evidencePackage: { package_id: "package-1" },
      goalPhaseAttribution: { goalId: "goal", phaseId: "phase", source: "legacy_effective_date_fallback" },
      now: "2026-08-15T12:00:00.000Z",
      userId: "owner",
    });
    const replay = createCanonicalDexaScanRecord({
      canonicalId,
      canonicalProvenance: { evidence_package_ids: ["package-1", "package-2"] },
      evidenceObject: scan({ id: "submission-two", sourceFileId: "second.pdf" }),
      evidencePackage: { package_id: "package-2" },
      existingObject: first,
      now: "2026-08-16T12:00:00.000Z",
      userId: "owner",
    });
    expect(replay.dexaRevision.revision).toBe(1);
    expect(replay.payload.id).toBe("submission-one");
    expect(replay.updatedAt).toBe(first.updatedAt);

    const corrected = createCanonicalDexaScanRecord({
      canonicalId,
      canonicalProvenance: { evidence_package_ids: ["package-1", "package-3"] },
      evidenceObject: scan({
        totalMass: { value: 173, unit: "lb" },
        leanMass: { value: 149, unit: "lb" },
      }),
      evidencePackage: { package_id: "package-3" },
      existingObject: replay,
      now: "2026-08-17T12:00:00.000Z",
      userId: "owner",
    });
    expect(corrected).toMatchObject({
      canonicalId,
      goalId: "goal",
      phaseId: "phase",
      dexaRevision: { revision: 2 },
    });
    expect(corrected.dexaRevisionHistory).toHaveLength(1);
  });

  it("reports competing active same-date lineages instead of hiding them", () => {
    const first = { canonicalId: "a", userId: "owner", evidence_type: "dexa_scan", payload: scan(), quality: { status: "active" } };
    const second = { ...first, canonicalId: "b", payload: scan({ id: "other" }) };
    const result = selectActiveCanonicalDexaScans([first, second], { userId: "owner" });
    expect(result.records).toHaveLength(1);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "DEXA_ACTIVE_SCAN_DUPLICATE", canonicalIds: ["a", "b"] }),
    ]);
  });
});
