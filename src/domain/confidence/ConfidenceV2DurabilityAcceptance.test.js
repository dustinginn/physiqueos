import { describe, expect, it } from "vitest";
import { createInterpretationV2Fixture } from "../../fixtures/interpretationV2Fixtures";
import { createBriefingForecastFinalizer } from "./BriefingForecastFinalizer";
import { createDurabilitySignalFromDescriptor } from
  "../interpretation/EvidenceDurabilityService";

const AT = "2026-08-09T12:00:00.000Z";

describe("Confidence V2 prospective durability acceptance", () => {
  it("holds emerging Midweek proxy support at 59", async () => {
    const result = await finalize({
      publisherType: "midweek_briefing", cadence: "midweek",
      currentPeriod: period(2, "preliminary"), priorPeriods: [], priorScore: 59,
    });
    expect(result.forecastAssessment.movement).toMatchObject({
      direction: "no_meaningful_change",
      reasonCode: "proxy_support_emerging_hold",
    });
    expect(result.numericConfidenceProjection).toMatchObject({
      currentPercentage: 59, delta: 0,
    });
  });

  it("moves repeated Weekly support from 59 to 60 at the proxy cap", async () => {
    const result = await finalize({
      currentPeriod: period(2), priorPeriods: [historicalPeriod(1)], priorScore: 59,
    });
    expect(result.structuredInterpretation.evidenceReconciliation.durability)
      .toMatchObject({ persistence: "repeated", independentPeriodCount: 2,
        transition: "repeated" });
    expect(result.forecastAssessment.movement).toMatchObject({
      direction: "increase", reasonCode: "proxy_support_repeated_increase",
    });
    expect(result.numericConfidenceProjection).toMatchObject({
      currentPercentage: 60, delta: 1,
      movementAudit: { proxyCap: 1, globalCadenceCap: 3 },
    });
  });

  it("recognizes sustained support once but remains bound by the target", async () => {
    const result = await finalize({
      currentPeriod: period(3),
      priorPeriods: [historicalPeriod(1), historicalPeriod(2)],
      priorScore: 60,
    });
    expect(result.forecastAssessment.movement).toMatchObject({
      direction: "increase", reasonCode: "proxy_support_sustained_increase",
    });
    expect(result.numericConfidenceProjection).toMatchObject({
      currentPercentage: 60, delta: 0,
      rationale: "bounded_target_prevented_increase",
    });
    expect(result.narrativeAssessment.confidenceExplanation).toMatchObject({
      movement: "no_meaningful_change",
      movementRationaleCode: "bounded_target_prevented_increase",
    });
  });

  it("does not move a revised or duplicated same-occurrence Weekly", async () => {
    const revised = await finalize({
      currentPeriod: period(2),
      priorPeriods: [historicalPeriod(1), historicalPeriod(2, "old-lineage")],
      currentLineage: "new-lineage", priorScore: 60,
    });
    expect(revised.forecastAssessment.movement).toMatchObject({
      direction: "no_meaningful_change",
      reasonCode: "same_period_revision_no_new_durability",
    });
    const duplicate = await finalize({
      currentPeriod: period(2),
      priorPeriods: [historicalPeriod(1), historicalPeriod(2, "same-lineage")],
      currentLineage: "same-lineage", priorScore: 60,
    });
    expect(duplicate.forecastAssessment.movement).toMatchObject({
      direction: "no_meaningful_change",
      reasonCode: "duplicate_evidence_no_change",
    });
  });

  it("fails closed when historical durability lineage is unavailable", async () => {
    const result = await finalize({ currentPeriod: period(2), priorPeriods: [],
      priorScore: 59 });
    expect(result.structuredInterpretation.evidenceReconciliation.durability)
      .toMatchObject({ persistence: "emerging", independentPeriodCount: 1 });
    expect(result.numericConfidenceProjection.currentPercentage).toBe(59);
  });
});

async function finalize({ publisherType = "weekly_briefing", cadence = "weekly",
  currentPeriod, priorPeriods, currentLineage = "current-lineage", priorScore }) {
  const fixture = createInterpretationV2Fixture();
  fixture.goalContract.timeline = {
    startDate: "2026-07-01", targetCompletionDate: "2026-12-31",
    currentPhase: { phaseId: "phase-one" },
  };
  fixture.evidenceDescriptors[0].measurements = fixture.evidenceDescriptors[0]
    .measurements.filter((item) => item.metric !== "lean_mass_change_lb");
  const training = fixture.evidenceDescriptors.find((item) =>
    item.capability === "training_execution");
  training.temporalIdentity = currentPeriod;
  training.sourceObservationIds = [currentLineage];
  const normalizedPriorPeriods = priorPeriods.map((periodValue) =>
    periodValue.id === currentPeriod.id && currentLineage === "same-lineage"
      ? { ...periodValue,
        signals: [createDurabilitySignalFromDescriptor(training)] }
      : periodValue);
  const evidenceWindow = { id: currentPeriod.id,
    start: `${currentPeriod.startDate}T00:00:00.000Z`,
    cutoff: `${currentPeriod.endDate}T23:59:59.999Z`, closed: true };
  return createBriefingForecastFinalizer({ now: () => new Date(AT) }).finalize({
    publisherType, userId: "user", occurrenceId: "briefing-current",
    artifactId: "briefing-current", cadenceOrEventType: cadence,
    goalContract: fixture.goalContract, phaseId: "phase-one",
    evidenceWindow, strategyContext: fixture.strategyHypothesis,
    executionContext: fixture.executionState,
    evidenceDescriptors: fixture.evidenceDescriptors,
    durabilityContext: { currentPeriod, priorPeriods: normalizedPriorPeriods,
      uncertaintyComparisonSafe: false },
    previousCanonicalAssessment: previous(priorScore),
    publicationCutoff: evidenceWindow.cutoff, finalizedAt: AT,
    idempotencyKey: `briefing-current|${currentLineage}`,
    expectedPriorAssessmentId: "prior",
    composeArtifact: () => ({ artifact: { id: "briefing-current",
      cadence, briefing: {} } }),
    elapsedTimeAdequacy: cadence === "midweek" ? "partial" : "adequate",
  });
}

function previous(currentPercentage) {
  return {
    id: "prior", goalId: "goal_build_muscle", phaseId: "phase-one",
    currentPercentage, forecastStatus: "forecast_uncertain",
    confidenceBand: "moderate", forecastDirection: "indeterminate",
    movement: "no_meaningful_change", semanticContinuityFingerprint: "prior",
    publicationTimestamp: "2026-08-01T23:59:59.999Z",
  };
}

function historicalPeriod(number, lineage = `lineage-${number}`) {
  return { ...period(number), signals: [{
    capability: "training_execution", direction: "supports",
    lineageDigest: `training_execution|${lineage}`,
    lineageAvailable: true,
  }] };
}

function period(number, state = "completed") {
  const dates = [
    ["2026-07-26", "2026-08-01"],
    ["2026-08-02", "2026-08-08"],
    ["2026-08-09", "2026-08-15"],
  ][number - 1];
  return {
    schemaVersion: "confidence_durability_period_v1",
    id: `confidence_week|${dates[0]}|${dates[1]}|America/Los_Angeles`,
    kind: "canonical_week", startDate: dates[0], endDate: dates[1],
    timeZone: "America/Los_Angeles", state,
    occurrenceId: `weekly-${number}`,
  };
}
