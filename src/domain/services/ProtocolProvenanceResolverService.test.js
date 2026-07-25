import { describe, expect, it } from "vitest";
import { createProtocolProvenance } from "../models/protocolProvenance";
import {
  resolveProtocolAtDate,
  resolveProtocolAcrossWindow,
} from "./ProtocolProvenanceResolverService";

describe("protocol provenance resolution", () => {
  it("resolves activation and update boundaries without current-state fallback", () => {
    const versions = [
      version("v1", "2026-07-19", "2026-07-23", 170),
      version("v2", "2026-07-23", null, 180, "v1"),
    ];
    expect(at("2026-07-18", versions).status).toBe("missing");
    expect(at("2026-07-19", versions).target.value).toBe(170);
    expect(at("2026-07-23", versions).target.value).toBe(180);
  });

  it("resolves reproducible body-weight targets and rejects invalid evidence", () => {
    const ratio = createProtocolProvenance({
      protocolId: "nutrition", protocolVersionId: "ratio", protocolCategory: "nutrition",
      goalId: "goal", effectiveFrom: "2026-07-19", state: "active",
      target: {
        mode: "grams_per_pound", configuredRatio: 0.8, translatedValue: 132,
        roundingRule: "nearest_integer",
        inputProvenance: {
          weightValue: 165, weightUnit: "lb", weightDate: "2026-07-19",
          weightEvidenceId: "weight", weightSelectionMethod: "explicit_activation_weight",
          effectiveFrom: "2026-07-19",
        },
      },
    });
    const input = { protocolVersions: [ratio], goalId: "goal", date: "2026-07-20", timezone: "America/Los_Angeles", category: "nutrition" };
    expect(resolveProtocolAtDate({ ...input, weightEvidence: [{ id: "weight", measuredAt: "2026-07-19", weight: { value: 165 } }] })).toMatchObject({ status: "resolved", target: { value: 132 } });
    expect(resolveProtocolAtDate({ ...input, weightEvidence: [{ id: "weight", measuredAt: "2026-07-20", weight: { value: 165 } }] }).status).toBe("partially_resolved");
  });

  it("segments activation inside the exact July 19-25 window without selecting 167 or 180", () => {
    const ambiguous = createProtocolProvenance({
      protocolId: "nutrition", protocolVersionId: "legacy-successor", protocolCategory: "nutrition",
      goalId: "goal", effectiveFrom: "2026-07-23", state: "active",
      target: {
        mode: "grams_per_pound", configuredRatio: 1, translatedValue: 167,
        status: "conflicted", sourceFacts: { proteinTarget: 167, fixedProtein: 180 },
        limitations: ["conflicting_body_weight_and_fixed_values"],
      },
    });
    const result = resolveProtocolAcrossWindow({
      protocolVersions: [ambiguous], goalId: "goal",
      startDate: "2026-07-19", endDate: "2026-07-25",
      timezone: "America/Los_Angeles", category: "nutrition",
    });
    expect(result).toMatchObject({ status: "conflicted", singleTargetApplies: false, target: null });
    expect(result.segments).toEqual([
      expect.objectContaining({ startDate: "2026-07-19", endDate: "2026-07-22", status: "missing" }),
      expect.objectContaining({ startDate: "2026-07-23", endDate: "2026-07-25", status: "conflicted", target: null }),
    ]);
  });

  it("resolves a later full window only with exact version and Weight provenance", () => {
    const unresolved = createProtocolProvenance({
      protocolId: "nutrition", protocolVersionId: "v1", protocolCategory: "nutrition",
      goalId: "goal", effectiveFrom: "2026-07-23", state: "active",
      target: { mode: "grams_per_pound", configuredRatio: 1, translatedValue: 167 },
    });
    expect(window([unresolved]).singleTargetApplies).toBe(false);
    expect(window([version("v2", "2026-07-23", null, 180)]))
      .toMatchObject({ status: "resolved", singleTargetApplies: true, target: { value: 180 } });
  });

  it("handles legacy, pause gaps, conflicts, evidence IDs, and immutability", () => {
    expect(resolveProtocolAtDate({
      legacyProtocols: [{ id: "legacy", protocolType: "nutrition", status: "active", relatedGoalIds: ["goal"] }],
      goalId: "goal", date: "2026-07-20", timezone: "America/Los_Angeles", category: "nutrition",
    }).status).toBe("legacy_unversioned");
    const paused = version("pause", "2026-07-19", null, 180);
    expect(at("2026-07-20", [{ ...paused, state: "paused" }]).status).toBe("missing");
    const input = { protocolVersions: [version("a", "2026-07-19", null, 170), version("b", "2026-07-19", null, 180)], goalId: "goal", date: "2026-07-20", timezone: "America/Los_Angeles", category: "nutrition" };
    const before = structuredClone(input);
    expect(resolveProtocolAtDate(input).status).toBe("conflicted");
    expect(input).toEqual(before);
  });
});

function version(id, effectiveFrom, effectiveTo, grams, previousProtocolVersionId = null) {
  return createProtocolProvenance({
    protocolId: "nutrition", protocolVersionId: id, protocolCategory: "nutrition",
    goalId: "goal", previousProtocolVersionId, effectiveFrom, effectiveTo,
    state: "active", target: { mode: "fixed_grams", configuredValue: grams },
  });
}
function at(date, protocolVersions) {
  return resolveProtocolAtDate({ protocolVersions, goalId: "goal", date, timezone: "America/Los_Angeles", category: "nutrition" });
}
function window(protocolVersions) {
  return resolveProtocolAcrossWindow({ protocolVersions, goalId: "goal", startDate: "2026-07-26", endDate: "2026-08-01", timezone: "America/Los_Angeles", category: "nutrition" });
}
