import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../contracts/v1/canonicalJson.js";
import { createCadenceSourceLineage } from
  "./PICadenceBriefingLifecycleService";

describe("PI cadence briefing lifecycle provider JSON safety", () => {
  it("normalizes an absent optional artifact version without changing lineage", () => {
    const lineage = createCadenceSourceLineage({
      reason: "scheduled_weekly_cadence",
      artifact: {
        evidenceWindow: { id: "weekly:2026-08-23:2026-08-29" },
        dependencyManifest: { fingerprint: "sha256_manifest" },
      },
    });

    expect(lineage).toEqual({
      reason: "scheduled_weekly_cadence",
      artifactVersion: null,
      evidenceWindowId: "weekly:2026-08-23:2026-08-29",
      dependencyManifestFingerprint: "sha256_manifest",
    });
    expect(() => canonicalJson(lineage)).not.toThrow();
  });

  it("preserves an explicit artifact version", () => {
    expect(createCadenceSourceLineage({
      reason: "scheduled_weekly_cadence",
      artifact: { version: "weekly_narrative_v5_2", evidenceWindow: {} },
    }).artifactVersion).toBe("weekly_narrative_v5_2");
  });
});
