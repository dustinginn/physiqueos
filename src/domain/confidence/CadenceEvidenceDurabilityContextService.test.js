import { describe, expect, it } from "vitest";
import { createCadenceEvidenceDurabilityContext } from
  "./CadenceEvidenceDurabilityContextService";

describe("cadence durability bootstrap", () => {
  it("uses at most three canonical Goal/Strategy-compatible Weekly periods", () => {
    const artifacts = [1, 2, 3, 4].map(weekly);
    const context = createCadenceEvidenceDurabilityContext({
      store: store(artifacts, artifacts.map((item) => history(item.id))),
      artifact: weekly(5), cadence: "weekly", goalContract: contract(),
    });
    expect(context.priorPeriods).toHaveLength(3);
    expect(context.priorPeriods.map((item) => item.endDate)).toEqual([
      "2026-08-15", "2026-08-22", "2026-08-29",
    ]);
    expect(context.priorPeriods.every((item) =>
      item.signals[0].capability === "training_progression")).toBe(true);
  });

  it("fails closed across Goal and material Strategy contract boundaries", () => {
    const artifact = weekly(1);
    const wrongGoal = history(artifact.id, { goalId: "other-goal" });
    const wrongStrategy = history(artifact.id, { contractId: "other-contract" });
    const context = createCadenceEvidenceDurabilityContext({
      store: store([artifact], [wrongGoal, wrongStrategy]),
      artifact: weekly(2), cadence: "weekly", goalContract: contract(),
    });
    expect(context.priorPeriods).toEqual([]);
  });

  it("includes a prior publication of the same period for revision deduplication", () => {
    const existing = weekly(2);
    const context = createCadenceEvidenceDurabilityContext({
      store: store([weekly(1), existing], [history(weekly(1).id),
        history(existing.id)]),
      artifact: { ...existing, generatedAt: "2026-08-10T12:00:00.000Z" },
      cadence: "weekly", goalContract: contract(),
    });
    expect(context.priorPeriods.map((item) => item.id))
      .toContain(context.currentPeriod.id);
  });

  it("does not infer named uncertainty reduction from historical assessments", () => {
    const context = createCadenceEvidenceDurabilityContext({
      store: store([], []), artifact: weekly(1), cadence: "weekly",
      goalContract: contract(),
      previousCanonicalAssessment: {
        remainingUncertainty: { items: [{ key: "energy_uncertain" }] },
      },
    });
    expect(context.uncertaintyComparisonSafe).toBe(false);
    expect(context.previousUncertaintyKeys).toEqual([]);
  });
});

function contract() {
  return {
    contractId: "goal-contract-v1",
    goal: { goalId: "goal-one" },
    strategyHypothesis: { strategyRef: { strategyVersion: "strategy-v1" } },
    relevantEvidence: { entries: [{ evidenceCapability: "training_progression",
      role: "supporting" }] },
  };
}

function store(dailyBriefings, goalConfidenceHistory) {
  return { dailyBriefings, goalConfidenceHistory };
}

function history(originatingArtifactId, {
  goalId = "goal-one", contractId = "goal-contract-v1",
} = {}) {
  return { goalId, originatingArtifactId,
    assessment: { goalContract: { id: contractId } } };
}

function weekly(number) {
  const dates = [
    ["2026-08-02", "2026-08-08"],
    ["2026-08-09", "2026-08-15"],
    ["2026-08-16", "2026-08-22"],
    ["2026-08-23", "2026-08-29"],
    ["2026-08-30", "2026-09-05"],
  ][number - 1];
  const [startDate, endDate] = dates;
  return {
    id: `weekly-${number}`, cadence: "weekly",
    evidenceWindow: { id: `weekly:${startDate}:${endDate}:America/Los_Angeles`,
      cadence: "weekly", startDate, endDate,
      timeZone: "America/Los_Angeles", closed: true },
    briefing: { weeklyNarrative: { context: { pi: { observations: [{
      id: "performance|overall|resistance", domain: "training",
      kind: "training_performance", direction: "positive", status: "improving",
      confidence: { level: "moderate", limitations: [] },
      evidenceWindow: { startDate, endDate,
        comparisonStartDate: startDate, comparisonEndDate: endDate },
      supportingEvidenceIds: [`training-${number}`],
      provenance: { producer: "fixture" },
    }] } } } },
  };
}
