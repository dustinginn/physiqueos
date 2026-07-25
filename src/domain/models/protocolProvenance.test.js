import { describe, expect, it } from "vitest";
import {
  createProtocolProvenance,
  validateProtocolProvenanceSet,
} from "./protocolProvenance";

describe("protocol provenance contract", () => {
  it("creates deterministic fixed and ratio target versions", () => {
    const fixed = version({ target: { mode: "fixed_grams", configuredValue: 180 } });
    expect(fixed.target).toMatchObject({ status: "resolved", configuredValue: 180 });
    const ratio = version({
      target: {
        mode: "grams_per_pound", configuredRatio: 0.8, translatedValue: 132,
        roundingRule: "nearest_integer", calculationVersion: "protein_v1",
        inputProvenance: {
          weightValue: 165, weightUnit: "lb", weightDate: "2026-07-19",
          weightEvidenceId: "weight", weightSelectionMethod: "explicit_activation_weight",
          effectiveFrom: "2026-07-19",
        },
      },
    });
    expect(ratio.target.inputProvenance.weightEvidenceId).toBe("weight");
  });

  it("flags translated values without Weight provenance and rejects invalid lineage", () => {
    expect(version({
      target: { mode: "grams_per_pound", configuredRatio: 1, translatedValue: 167 },
    }).target).toMatchObject({
      status: "partially_resolved",
      limitations: ["translated_target_input_provenance_missing"],
    });
    expect(() => version({ previousProtocolVersionId: "nutrition-v1" })).toThrow(/itself/);
  });

  it("rejects overlapping and circular version history", () => {
    const first = version({ effectiveTo: "2026-07-23" });
    const second = version({
      protocolVersionId: "nutrition-v2",
      previousProtocolVersionId: "nutrition-v1",
      effectiveFrom: "2026-07-23",
    });
    expect(validateProtocolProvenanceSet([first, second])).toBe(true);
    expect(() => validateProtocolProvenanceSet([
      { ...first, effectiveTo: null },
      second,
    ])).toThrow(/overlap/);
    expect(() => validateProtocolProvenanceSet([
      { ...first, previousProtocolVersionId: "nutrition-v2", effectiveTo: "2026-07-23" },
      second,
    ])).toThrow(/Circular/);
  });
});
function version(overrides = {}) {
  return createProtocolProvenance({
    protocolId: "nutrition",
    protocolVersionId: "nutrition-v1",
    protocolCategory: "nutrition",
    goalId: "goal",
    state: "active",
    effectiveFrom: "2026-07-19",
    timezone: "America/Los_Angeles",
    ...overrides,
  });
}
