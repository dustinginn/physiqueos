import { describe, expect, it } from "vitest";
import { createInterpretationV2Fixture } from "../../fixtures/interpretationV2Fixtures";
import { createBriefingForecastFinalizer } from "./BriefingForecastFinalizer";

const SCENARIOS = [
  "strong progress with Guardrails clear",
  "strong progress with Guardrail watch",
  "Objective ahead with Guardrail violated",
  "excellent execution but uncertain response",
  "poor execution and inconclusive response",
  "too little elapsed time",
  "conflicting evidence",
  "meaningful Photo Event improvement",
  "Photo Event with no meaningful change",
  "Weekly reaffirmation",
  "Monthly strategic increase",
  "Monthly decrease due to timeline risk",
  "DEXA material increase",
  "DEXA mixed result",
  "Starting Forecast for a new user",
  "Starting Forecast for an experienced user",
];

describe("Confidence V2 scenario acceptance", () => {
  it.each(SCENARIOS)("finalizes deterministically: %s", async (name) => {
    const first = await run(name);
    const second = await run(name);
    expect(second.confidenceAssessment.id).toBe(first.confidenceAssessment.id);
    expect(second.numericConfidenceProjection)
      .toEqual(first.numericConfidenceProjection);
    expect(first.structuredInterpretation.goalRef.goalId)
      .toBe(first.forecastAssessment.goalRef.goalId);
    expect(first.narrativeAssessment.forecastRef)
      .toBe(first.forecastAssessment.id);
    expect(first.briefingArtifact.confidencePublication.assessmentId)
      .toBe(first.confidenceAssessment.id);
  });

  it("keeps semantically identical repeated finalization stable", async () => {
    const first = await run("Weekly reaffirmation");
    const repeated = await run("Weekly reaffirmation", first.confidenceAssessment,
      "repeat-artifact");
    expect(repeated.numericConfidenceProjection.currentPercentage)
      .toBe(first.numericConfidenceProjection.currentPercentage);
    expect(repeated.numericConfidenceProjection.movement)
      .toBe("no_meaningful_change");
  });

  it("uses deterministic publication identity for concurrent duplicates", async () => {
    const [left, right] = await Promise.all([
      run("Weekly reaffirmation"), run("Weekly reaffirmation"),
    ]);
    expect(left.confidenceAssessment.id).toBe(right.confidenceAssessment.id);
    expect(left.briefingArtifact.id).toBe(right.briefingArtifact.id);
  });

  it("preserves explicit artifact replacement lineage", async () => {
    const result = await run("DEXA mixed result", null, "replacement-artifact", {
      expectedPriorArtifactId: "prior-artifact",
      replacesArtifactId: "old-artifact",
      replacesAssessmentId: "old-assessment",
      replacementAuthorized: true,
    });
    expect(result.confidenceAssessment.replacementLineage).toEqual({
      expectedPriorArtifactId: "prior-artifact",
      replacesArtifactId: "old-artifact",
      replacesAssessmentId: "old-assessment",
    });
  });

  it("rejects an unauthorized publisher without composing an artifact", async () => {
    const composeArtifact = () => { throw new Error("must not compose"); };
    await expect(finalizer().finalize({ ...base("unauthorized", null, "bad"),
      publisherType: "evidence_review", cadenceOrEventType: "evidence_review",
      composeArtifact })).rejects.toMatchObject({ code: "unauthorized_publisher" });
  });
});

async function run(name, priorOverride, artifactId = "scenario-artifact", extra = {}) {
  const starting = name.startsWith("Starting Forecast");
  const photo = name.startsWith("Photo Event") || name.startsWith("meaningful Photo");
  const monthly = name.startsWith("Monthly");
  const dexa = name.startsWith("DEXA") || name.startsWith("Objective ahead");
  const publisherType = starting ? "goal_initialization" : photo
    ? "photo_event_briefing" : monthly ? "monthly_briefing" : dexa
      ? "dexa_event_briefing" : "weekly_briefing";
  const cadenceOrEventType = starting ? "goal_initialization" : photo ? "photo" :
    monthly ? "monthly" : dexa ? "dexa" : "weekly";
  const prior = starting ? null : priorOverride === undefined ? previous(name) :
    priorOverride ?? previous(name);
  const request = base(name, prior, artifactId);
  request.publisherType = publisherType;
  request.cadenceOrEventType = cadenceOrEventType;
  request.qualifyingPhotoEvent = photo;
  arrange(request, name);
  Object.assign(request, extra);
  return finalizer().finalize(request);
}

function base(name, prior, artifactId) {
  const input = createInterpretationV2Fixture();
  input.goalContract.timeline = { startDate: "2026-07-01",
    targetCompletionDate: name.includes("timeline risk") ? "2026-07-15" :
      "2026-12-31", currentPhase: { phaseId: "phase-one" } };
  return {
    publisherType: "weekly_briefing", userId: "user-one",
    occurrenceId: artifactId, artifactId, cadenceOrEventType: "weekly",
    goalContract: input.goalContract, phaseId: "phase-one",
    evidenceWindow: { id: `window|${artifactId}`,
      start: "2026-07-01T00:00:00.000Z",
      cutoff: "2026-07-31T23:59:59.999Z", closed: true },
    strategyContext: input.strategyHypothesis,
    executionContext: input.executionState,
    evidenceDescriptors: input.evidenceDescriptors,
    previousCanonicalAssessment: prior,
    publicationCutoff: "2026-07-31T23:59:59.999Z",
    finalizedAt: "2026-08-01T12:00:00.000Z",
    idempotencyKey: `scenario|${name}|${artifactId}`,
    expectedPriorAssessmentId: prior?.id ?? null,
    trajectorySegmentId: "trajectory_july",
    elapsedTimeAdequacy: "adequate",
    startingForecastContext: { experience: name.includes("experienced")
      ? "experienced_user" : "new_user", goalAmbition: "high",
    timelineFeasibility: "reasonable", baselineQuality: "known",
    priorGoalHistory: name.includes("experienced") ? "strong" : "unavailable",
    historicalExecution: "adequate", strategyQuality: "strong",
    missingInformation: ["response_history"] },
    composeArtifact: () => ({ artifact: { id: artifactId, briefing: {} } }),
  };
}

function arrange(request, name) {
  const dexa = request.evidenceDescriptors[0];
  const lean = dexa.measurements.find((item) => item.metric === "lean_mass_change_lb");
  const bodyFat = dexa.measurements.find((item) => item.metric === "body_fat_pct");
  if (name.includes("Guardrail watch")) bodyFat.value = 10.5;
  if (name.includes("Guardrail violated")) bodyFat.value = 13;
  if (name.includes("uncertain response") || name.includes("inconclusive") ||
      name.includes("too little")) dexa.measurements = [];
  if (name.includes("poor execution")) request.executionContext.adequacy = "inadequate";
  if (name.includes("too little")) {
    request.elapsedTimeAdequacy = "insufficient";
    request.executionContext.elapsedTimeAdequacy = "insufficient";
  }
  if (name.includes("conflicting") || name.includes("mixed")) {
    request.evidenceDescriptors.push({ ...structuredClone(dexa),
      id: `${dexa.id}|conflict`, independenceGroup: "independent_conflict",
      agreement: "contradicts" });
  }
  if (name.includes("decrease") || name.includes("mixed")) lean.value = -2;
}

function previous(name) {
  const strongPrior = name.includes("decrease") || name.includes("violated");
  return { id: `prior|${name}`, goalId: "goal_build_muscle", phaseId: "phase-one",
    currentPercentage: strongPrior ? 75 : 55,
    forecastStatus: strongPrior ? "on_forecast" : "forecast_uncertain",
    confidenceBand: strongPrior ? "high" : "developing",
    forecastDirection: strongPrior ? "stable" : "indeterminate",
    movement: "no_meaningful_change", semanticContinuityFingerprint: "prior",
    publicationTimestamp: "2026-06-30T23:59:59.999Z" };
}
function finalizer() {
  return createBriefingForecastFinalizer({
    now: () => new Date("2026-08-01T12:00:00.000Z"),
  });
}
