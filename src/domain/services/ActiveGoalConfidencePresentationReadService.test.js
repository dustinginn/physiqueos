import { describe, expect, it } from "vitest";
import { resolveActiveGoalConfidencePresentation } from "./ActiveGoalConfidencePresentationReadService";

const goal = {
  id: "goal", type: "build_lean_mass", status: "active",
  openingApproach: { value: "calibration" },
  phases: [{ id: "phase", status: "active" }],
};
const assessment = {
  id: "assessment", goalId: "goal", phaseId: "phase",
  operatingState: "calibration", modelVersion: "pi_goal_confidence_assessment_v1",
  piVersion: "pi_v3", evidenceCutoff: "2026-07-26T06:59:59.999Z",
  primaryReason: "Training remained constructive.",
  score: {
    current: 58, band: "moderate", prior: 44, delta: 14,
    movement: { direction: "increased", magnitude: "material" },
    priorScoreProvenance: { source: "controlled_reconciliation_seed" },
  },
  contributors: [
    { id: "support", direction: "supporting" },
    { id: "limit", direction: "limiting" },
  ],
  unresolvedUncertainty: ["Energy remains incomplete."],
  provenance: { generatedAt: "2026-07-26T17:22:00.000Z" },
};
const canonical = {
  goalConfidenceSnapshots: [{
    id: "snapshot", goalId: "goal", phaseId: "phase",
    operatingState: "calibration", currentAssessmentId: "assessment",
    currentScore: 58, scoreBand: "moderate", historyRecordId: "history",
  }],
  goalConfidenceHistory: [{
    id: "history", goalId: "goal", phaseId: "phase",
    assessmentId: "assessment", assessment,
  }],
  goalConfidenceContinuitySeeds: [],
};
const legacy = {
  value: 44, band: "moderate", label: "Moderate",
  explanation: "Legacy evidence presence.",
};

describe("active Goal confidence presentation", () => {
  it("prefers the canonical snapshot and exposes persisted movement", () => {
    const result = resolveActiveGoalConfidencePresentation({
      activeGoal: goal, store: canonical, legacyReadModel: legacy,
    });
    expect(result).toMatchObject({
      status: "canonical", source: "canonical_pi_snapshot",
      canonicalSeries: true, value: 58, percentageLabel: "58%",
      band: "moderate", assessmentId: "assessment", snapshotId: "snapshot",
      delta: 14, priorScore: 44, movementDirection: "increased",
      movementMagnitude: "material",
    });
    expect(result.supportingContributors).toHaveLength(1);
    expect(result.limitingContributors).toHaveLength(1);
  });

  it("uses an explicitly non-PI fallback for absent older collections", () => {
    expect(resolveActiveGoalConfidencePresentation({
      activeGoal: goal, store: {}, legacyReadModel: legacy,
    })).toMatchObject({
      status: "legacy_fallback", source: "legacy_overall_goal_confidence",
      canonicalSeries: false, value: 44,
      modelVersion: "overall_goal_confidence_v1",
      movement: null, delta: null,
    });
  });

  it.each([
    ["Goal mismatch", { snapshot: { goalId: "other" } }],
    ["phase mismatch", { snapshot: { phaseId: "other" } }],
    ["operating-state mismatch", { snapshot: { operatingState: "growth" } }],
    ["orphaned snapshot", { history: [] }],
    ["assessment mismatch", { history: [{
      ...canonical.goalConfidenceHistory[0], assessmentId: "other",
    }] }],
    ["score-band mismatch", { snapshot: { scoreBand: "high" } }],
  ])("rejects %s and safely falls back", (_label, change) => {
    const store = structuredClone(canonical);
    if (change.snapshot) Object.assign(store.goalConfidenceSnapshots[0], change.snapshot);
    if (change.history) store.goalConfidenceHistory = change.history;
    expect(resolveActiveGoalConfidencePresentation({
      activeGoal: goal, store, legacyReadModel: legacy,
    })).toMatchObject({
      status: "invalid_canonical",
      source: "legacy_overall_goal_confidence",
      value: 44,
    });
  });

  it("does not mutate canonical or legacy inputs", () => {
    const before = JSON.stringify({ canonical, legacy, goal });
    resolveActiveGoalConfidencePresentation({
      activeGoal: goal, store: canonical, legacyReadModel: legacy,
    });
    expect(JSON.stringify({ canonical, legacy, goal })).toBe(before);
  });
});
