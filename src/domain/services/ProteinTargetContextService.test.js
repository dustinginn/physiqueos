import { describe, expect, it } from "vitest";
import { resolveProteinTargetContext } from "./ProteinTargetContextService";

describe("Protein target context", () => {
  it("resolves fixed grams with protocol and version provenance", () => {
    expect(resolve({ strategy: { proteinBasis: "fixed", fixedProtein: 180 } }))
      .toMatchObject({
        status: "resolved",
        gramsPerDay: 180,
        mode: "fixed_grams",
        protocolId: "nutrition",
        protocolVersion: "nutrition-v2",
      });
  });

  it("resolves a configured non-1 g/lb target with exact Weight provenance", () => {
    expect(resolve({
      strategy: {
        proteinBasis: "body_weight",
        proteinRatio: 0.8,
        proteinTarget: 132,
        bodyWeightEvidenceId: "weight",
      },
      weights: [{ id: "weight", measuredAt: "2026-07-20", weight: { value: 165 } }],
    })).toMatchObject({
      status: "resolved",
      gramsPerDay: 132,
      ratio: 0.8,
      bodyWeightEvidenceId: "weight",
      bodyWeightDate: "2026-07-20",
    });
  });

  it("does not infer missing body-weight provenance for a translated target", () => {
    const result = resolve({
      strategy: {
        proteinBasis: "body_weight",
        proteinRatio: 1,
        proteinTarget: 167,
        fixedProtein: 180,
      },
    });
    expect(result).toMatchObject({
      status: "partially_resolved",
      gramsPerDay: 167,
      historicalApplicability: "limited",
    });
    expect(result.limitations).toEqual(expect.arrayContaining([
      "protein_target_body_weight_provenance_unavailable",
      "alternative_fixed_protein_value_present",
    ]));
  });

  it.each([
    [{ status: "paused" }, "missing"],
    [{ activatedAt: "2026-07-26" }, "missing"],
  ])("rejects ineligible protocol state/window", (protocolOverride, status) => {
    expect(resolve({ protocolOverride }).status).toBe(status);
  });

  it("rejects future Weight and reports conflicting active targets", () => {
    const future = resolve({
      strategy: {
        proteinBasis: "body_weight", proteinRatio: 1,
        proteinTarget: 165, bodyWeightEvidenceId: "future",
      },
      weights: [{ id: "future", measuredAt: "2026-07-26", weight: { value: 165 } }],
    });
    expect(future.status).toBe("partially_resolved");
    expect(future.limitations).toContain("future_weight_not_eligible");
    const conflict = resolve({ extraProtocol: true });
    expect(conflict.status).toBe("conflicted");
  });

  it("is deterministic, immutable, repository-free, and clock-free", () => {
    const input = fixture({});
    const before = structuredClone(input);
    const result = resolveProteinTargetContext(input);
    expect(input).toEqual(before);
    expect(resolveProteinTargetContext(input)).toEqual(result);
    expect(result.provenance).toMatchObject({ repositoryReads: 0, runtimeClockReads: 0 });
  });
});

function resolve(options) {
  return resolveProteinTargetContext(fixture(options));
}
function fixture({
  strategy = { proteinBasis: "fixed", fixedProtein: 180 },
  weights = [],
  protocolOverride = {},
  extraProtocol = false,
}) {
  const protocol = {
    id: "nutrition",
    userId: "user",
    protocolType: "nutrition",
    status: "active",
    activatedAt: "2026-07-19",
    currentVersionId: "nutrition-v2",
    relatedGoalIds: ["goal"],
    effectiveStrategy: strategy,
    ...protocolOverride,
  };
  return {
    userId: "user",
    goal: { id: "goal" },
    protocols: [protocol, ...(extraProtocol ? [{ ...protocol, id: "other" }] : [])],
    protocolVersions: [{
      id: "nutrition-v2",
      protocolId: "nutrition",
      status: "active",
      versionNumber: 2,
      effectiveAt: "2026-07-19",
    }],
    weights,
    window: { startDate: "2026-07-19", endDate: "2026-07-25" },
  };
}
