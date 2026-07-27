import { describe, expect, it } from "vitest";
import {
  mapPIGoalConfidenceContributors,
  PIGoalConfidenceContributorMappingError,
} from "./PIGoalConfidenceContributorMapper";

const context = {
  goalContext: { goalId: "goal_build", semanticGoalType: "build_lean_mass" },
  phaseContext: { phaseId: "phase_maintenance", semanticPhaseType: "establish_maintenance" },
  operatingState: "calibration",
};

function map(domainStates, evidenceCompleteness = { overall: "partial" }) {
  return mapPIGoalConfidenceContributors({
    ...context, domainStates, evidenceCompleteness,
  });
}

describe("PIGoalConfidenceContributorMapper", () => {
  it("recognizes the Calibration phase and returns deterministic contributors", () => {
    const input = { energy: {
      status: "near_maintenance",
      sourceObservationIds: ["energy_1"],
      canonicalEvidenceReferences: [{ id: "energy_week_1", type: "energy_window" }],
    } };
    expect(map(input)).toEqual(map(input));
    expect(map(input).status).toBe("mapped");
    expect(map(input).contributors.find((x) => x.domain === "energy")).toMatchObject({
      direction: "supporting", strength: "high", phaseRole: "calibration_signal",
    });
  });

  it("returns typed unsupported behavior outside the supported Goal/phase/state", () => {
    expect(mapPIGoalConfidenceContributors({
      ...context,
      phaseContext: { phaseId: "phase_growth", semanticPhaseType: "lean_mass_growth" },
    })).toMatchObject({ status: "unsupported", reason: "unsupported_goal_phase_operating_state" });
  });

  it.each([
    ["persistent_deficit", "conflicting"],
    ["large_surplus", "conflicting"],
    ["incomplete", "limiting"],
  ])("maps Energy %s as %s", (status, direction) => {
    expect(map({ energy: { status } }).contributors
      .find((x) => x.domain === "energy").direction).toBe(direction);
  });

  it("suppresses the obsolete cut-era active-calorie target", () => {
    const result = map({ energy: {
      status: "near_maintenance",
      targetCalories: 7000,
      targetKind: "obsolete_cut_active_calories",
      sourceObservationIds: ["old_target"],
    } });
    expect(result.contributors.some((x) => x.domain === "energy")).toBe(false);
    expect(result.trace.suppressed).toContainEqual({
      domain: "energy", reason: "obsolete_cut_target", sourceObservationIds: ["old_target"],
    });
  });

  it("does not reinterpret active calories as expenditure", () => {
    expect(() => map({ energy: { status: "active_calories" } }))
      .toThrowError(PIGoalConfidenceContributorMappingError);
  });

  it("maps broad Training more strongly than an isolated PR", () => {
    const broad = map({ training: { status: "broad_constructive" } }).contributors[1];
    const isolated = map({ training: { status: "isolated_pr", isolated: true } }).contributors[1];
    expect(broad.strength).toBe("high");
    expect(isolated).toMatchObject({ strength: "low", isolated: true });
  });

  it("keeps one poor session neutral", () => {
    expect(map({ training: { status: "poor_session" } }).contributors
      .find((x) => x.domain === "training")).toMatchObject({
      direction: "neutral", influencesScore: false,
    });
  });

  it.each([
    ["stable", "supporting"],
    ["falling", "conflicting"],
    ["rising_with_softening", "conflicting"],
    ["one_day", "neutral"],
  ])("maps Weight %s as %s", (status, direction) => {
    expect(map({ weight: { status } }).contributors
      .find((x) => x.domain === "weight").direction).toBe(direction);
  });

  it.each([
    ["stable", "supporting"],
    ["inconclusive", "limiting"],
    ["missing", "neutral"],
  ])("maps Photos %s as %s", (status, direction) => {
    expect(map({ photos: { status } }).contributors
      .find((x) => x.domain === "photos").direction).toBe(direction);
  });

  it("maps a new confirming or contradicting DEXA as authoritative", () => {
    for (const [status, direction] of [["confirming", "supporting"], ["contradicting", "conflicting"]]) {
      expect(map({ dexa: { status } }).contributors
        .find((x) => x.domain === "dexa")).toMatchObject({
        direction, strength: "authoritative", authoritative: true,
      });
    }
  });

  it("does not repeatedly reward historical DEXA", () => {
    expect(map({ dexa: { status: "historical_baseline" } }).contributors
      .find((x) => x.domain === "dexa")).toMatchObject({
      direction: "neutral", influencesScore: false,
    });
  });

  it("does not reward protocol presence alone", () => {
    expect(map({ protocol: { status: "present" } }).contributors
      .find((x) => x.domain === "protocol")).toMatchObject({
      direction: "neutral", influencesScore: false,
    });
  });

  it("maps completeness as certainty rather than proof of progress", () => {
    const complete = map({}, { overall: "complete" }).contributors[0];
    expect(complete).toMatchObject({
      domain: "evidence_completeness", phaseRole: "certainty",
      direction: "supporting",
    });
    expect(complete.reason).toContain("complete");
  });

  it("normalizes duplicate lineage inside a contributor", () => {
    const result = map({ training: {
      status: "isolated_pr",
      sourceObservationIds: ["pr_1", "pr_1"],
      sourceClaimIds: ["claim_1", "claim_1"],
      canonicalEvidenceReferences: [
        { id: "workout_1", type: "workout" },
        { id: "workout_1", type: "workout" },
      ],
    } });
    const contributor = result.contributors.find((x) => x.domain === "training");
    expect(contributor.sourceObservationIds).toEqual(["pr_1"]);
    expect(contributor.sourceClaimIds).toEqual(["claim_1"]);
    expect(contributor.canonicalEvidenceReferences).toHaveLength(1);
  });

  it("merges observation and claim representations of the same evidence", () => {
    const result = map({ training: [
      {
        status: "isolated_pr",
        sourceObservationIds: ["pr_observation"],
        canonicalEvidenceReferences: [{ id: "workout_1", type: "workout" }],
      },
      {
        status: "constructive",
        sourceClaimIds: ["pr_claim"],
        canonicalEvidenceReferences: [{ id: "workout_1", type: "workout" }],
      },
    ] });
    const training = result.contributors.filter((x) => x.domain === "training");
    expect(training).toHaveLength(1);
    expect(training[0]).toMatchObject({
      strength: "moderate",
      sourceObservationIds: ["pr_observation"],
      sourceClaimIds: ["pr_claim"],
    });
    expect(result.trace.merged).toHaveLength(1);
  });

  it("has no repository or raw-evidence dependency", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./PIGoalConfidenceContributorMapper.js", import.meta.url), "utf8"));
    expect(source).not.toMatch(/Repository|runtime-store|canonicalEvidenceObjects|readFileSync/);
  });
});
