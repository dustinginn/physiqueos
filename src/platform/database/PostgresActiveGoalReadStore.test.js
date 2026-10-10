import { describe, expect, it, vi } from "vitest";
import {
  createPostgresActiveGoalReadStore,
  projectActiveGoalBriefingArtifact,
} from "./PostgresActiveGoalReadStore.js";
import { projectLatestBriefingCoachTake } from "../../domain/services/ActiveGoalCurrentStateService.js";

describe("PostgresActiveGoalReadStore", () => {
  it("loads only screen inputs without compatibility-runtime reconstruction", async () => {
    const complete = vi.fn();
    const query = vi.fn(async (sql) => ({ rows: sql.includes("collection_name=$2") ? [] : [] }));
    const store = createPostgresActiveGoalReadStore({
      pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 },
      ownerUserId: "owner",
      onComplete: complete,
    });
    const result = await store.load();
    expect(result).toMatchObject({ goal: null, protocols: [], canonicalEvidence: [] });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls.some(([sql, values]) =>
      sql.includes("UNION ALL")
      && values.some((value) => Array.isArray(value) && value.includes("goalConfidenceHistory"))
    )).toBe(true);
    const confidenceQuery = query.mock.calls.find(([sql]) =>
      sql.includes("collection_name='goalConfidenceHistory'"));
    expect(confidenceQuery[0]).toContain("canonical_confidence_assessment_v3");
    for (const field of ["strategicInterpretation", "coachingState", "confidenceProjection",
      "narrativePlan", "evidenceEligibility"]) expect(confidenceQuery[0]).toContain(`'${field}'`);
    expect(confidenceQuery[1]).toEqual([
      "owner", ["goals", "phaseStrategies"], ["user"], ["dexaScans"], ["protocols"],
      ["weightEntries"], ["goalConfidenceSnapshots", "goalConfidenceHistory"],
    ]);
    expect(query.mock.calls.some(([sql]) => sql.includes("canonicalEvidenceObjects") && sql.includes("evidence_type"))).toBe(true);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      readModel: "goals.active.build-lean-mass",
      queryCount: 3,
      compatibilityRuntimeLoadCount: 0,
    }));
  });

  it("reads the latest published V3 briefing: bounded metadata candidates, then one full artifact", async () => {
    const meta = (id, cadence, generatedAt, generationStatus) => ({ record_id: id, id, cadence, generatedAt,
      lifecycle: { generationStatus }, confidencePublication: { schemaVersion: "briefing_confidence_binding_v3" } });
    const published = { id: "midweek_published", cadence: "midweek", generatedAt: "2026-09-23T10:01:29.328Z",
      confidencePublication: { schemaVersion: "briefing_confidence_binding_v3" }, lifecycle: { generationStatus: "completed" },
      briefing: { narrativeV3: {} } };
    const query = vi.fn(async (sql, values) => {
      if (sql.includes("record_id=$2")) return { rows: values[1] === "midweek_published" ? [projectedRow(published)] : [] };
      if (sql.includes("canonical_briefing_records")) return { rows: [
        meta("weekly_failed", "weekly", "2026-09-27T10:00:00.000Z", "failed"),
        meta("midweek_published", "midweek", "2026-09-23T10:01:29.328Z", "completed")] };
      return { rows: [] };
    });
    const store = createPostgresActiveGoalReadStore({ pool: { query }, ownerUserId: "owner" });
    const result = await store.load();
    const candidates = query.mock.calls.find(([sql]) => sql.includes("canonical_briefing_records") && sql.includes("LIMIT 8"));
    expect(candidates[1]).toEqual(["owner"]);
    expect(candidates[0]).toMatch(/owner_user_id=\$1/);
    expect(candidates[0]).toMatch(/briefing_confidence_binding_v3/);
    expect(candidates[0]).not.toMatch(/SELECT payload,version/);
    const artifactQuery = query.mock.calls.find(([sql]) => sql.includes("record_id=$2"));
    expect(artifactQuery[1]).toEqual(["owner", "midweek_published"]);
    expect(artifactQuery[0]).not.toMatch(/SELECT payload,version/);
    expect(artifactQuery[0]).toContain("briefing,narrativeV3");
    expect(artifactQuery[0]).toContain("briefing,goalConfidence");
    expect(artifactQuery[0]).toContain("hasDexaEventNarrative");
    expect(result.latestBriefing.id).toBe("midweek_published");
  });

  it("preserves exact Coach's Take semantics across every V3 briefing family", () => {
    const families = [
      ["weekly", {}, "Weekly Briefing", "scheduled"],
      ["monthly", {}, "Monthly Briefing", "scheduled"],
      ["event", { dexaEventNarrative: { intentionallyLarge: "discarded" } }, "DEXA Briefing", "dexa_event"],
      ["event", { photoEventNarrative: { intentionallyLarge: "discarded" } }, "Photo Briefing", "photo_event"],
    ];
    for (const [cadence, eventNarrative, label, artifactType] of families) {
      const artifact = standardArtifact({ cadence, eventNarrative });
      const full = projectLatestBriefingCoachTake({ artifact, timeZone: "America/Los_Angeles" });
      const bounded = projectLatestBriefingCoachTake({
        artifact: projectActiveGoalBriefingArtifact(artifact), timeZone: "America/Los_Angeles",
      });
      expect(bounded).toEqual(full);
      expect(bounded).toMatchObject({ briefingLabel: label, artifactType });
    }
  });

  it("preserves Midweek V3 lineage and section suppression inputs", () => {
    const { artifact, assessment } = midweekArtifact();
    const full = projectLatestBriefingCoachTake({ artifact, assessment, timeZone: "America/Los_Angeles" });
    const bounded = projectLatestBriefingCoachTake({
      artifact: projectActiveGoalBriefingArtifact(artifact), assessment, timeZone: "America/Los_Angeles",
    });
    expect(bounded).toEqual(full);
    expect(bounded.sections.map((item) => item.kind)).toEqual(["coachTake", "action", "watch"]);
    expect(JSON.stringify(projectActiveGoalBriefingArtifact(artifact))).not.toContain("unrelatedEnvelope");
  });
});

function projectedRow(artifact) {
  return {
    id: artifact.id, cadence: artifact.cadence, artifactType: artifact.artifactType,
    preview: artifact.preview, deliveryDate: artifact.deliveryDate, generatedAt: artifact.generatedAt,
    createdAt: artifact.createdAt, lifecycle: artifact.lifecycle,
    confidencePublication: artifact.confidencePublication, status: artifact.status,
    evidenceWindow: artifact.evidenceWindow, goalContext: artifact.goalContext, trigger: artifact.trigger,
    briefingNarrativeV3: artifact.briefing?.narrativeV3,
    briefingGoalConfidence: artifact.briefing?.goalConfidence,
    briefingActiveGoal: artifact.briefing?.activeGoal,
    briefingActivePhase: artifact.briefing?.activePhase,
    briefingEnergyBalance: artifact.briefing?.energyBalance,
    briefingWeightContext: artifact.briefing?.weightContext,
    briefingBodyComposition: artifact.briefing?.bodyComposition,
    briefingTraining: artifact.briefing?.training,
    hasDexaEventNarrative: Boolean(artifact.briefing?.dexaEventNarrative),
    hasPhotoEventNarrative: Boolean(artifact.briefing?.photoEventNarrative),
    version: 1,
  };
}

function narrative() {
  return { summary: "Canonical result.", coachTake: "Canonical coach take.", strategicInterpretationId: "interpretation-v3",
    sections: { result: "Result.", meaning: "Meaning.", action: "Act.", watch: "Watch.", confidence: "Confidence." } };
}

function standardArtifact({ cadence, eventNarrative = {} }) {
  return { id: `${cadence}-${Object.keys(eventNarrative)[0] ?? "scheduled"}`, cadence,
    generatedAt: "2026-10-10T18:00:00.000Z", evidenceWindow: { startDate: "2026-10-01", endDate: "2026-10-10" },
    confidencePublication: { schemaVersion: "briefing_confidence_binding_v3", assessmentId: "assessment" },
    trigger: cadence === "event" ? { evidenceType: Object.hasOwn(eventNarrative, "dexaEventNarrative") ? "dexa" : "photo" } : null,
    briefing: { narrativeV3: narrative(), ...eventNarrative }, unrelatedEnvelope: "x".repeat(10_000), version: 4 };
}

function midweekArtifact() {
  const id = "midweek-v3";
  const assessmentId = `${id}-assessment`;
  const artifact = { ...standardArtifact({ cadence: "midweek" }), id,
    evidenceWindow: { id: `${id}-window`, startDate: "2026-10-08", endDate: "2026-10-10" },
    goalContext: { goalId: "goal-build", phaseId: "phase-build" },
    confidencePublication: { schemaVersion: "briefing_confidence_binding_v3", assessmentId },
    briefing: { narrativeV3: narrative(), goalConfidence: { modelVersion: "canonical_confidence_assessment_v3", piVersion: "confidence_v3" },
      activeGoal: { id: "goal-build", name: "Build" }, activePhase: { id: "phase-build", name: "Build phase" },
      energyBalance: { chartPoints: [] }, weightContext: { observations: 0 }, bodyComposition: {}, training: {} },
    unrelatedEnvelope: "x".repeat(10_000) };
  const assessment = { id: assessmentId, assessmentId, schemaVersion: "canonical_confidence_assessment_v3",
    briefingArtifactId: id, evidenceWindowId: `${id}-window`, goalId: "goal-build", phaseId: "phase-build",
    currentPercentage: 79, confidenceBand: "moderate", movement: "no_meaningful_change",
    narrativeExplanation: { text: "Canonical confidence." }, structuredInterpretationId: "interpretation-v3",
    narrativeAssessmentId: "plan-v3", strategicInterpretation: { id: "interpretation-v3", coachingObservationSelection: { selected: [] } },
    narrativePlan: { id: "plan-v3", strategicInterpretationId: "interpretation-v3", uncertaintyTypes: [],
      composition: { sectionAllocations: { result: {}, meaning: {}, action: {}, watch: {}, confidence: {}, coachTake: {} } } } };
  return { artifact, assessment };
}
