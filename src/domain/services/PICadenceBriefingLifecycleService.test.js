import { describe, expect, it, vi } from "vitest";
import { canonicalJson } from "../../contracts/v1/canonicalJson.js";
import { createBriefingForecastFinalizer } from
  "../confidence/BriefingForecastFinalizer";
import {
  adaptProductionGoalToCanonicalContract,
} from "../confidence/ProductionConfidenceContextAdapter";
import {
  createCadenceSourceLineage,
  createPICadenceBriefingLifecycleService,
} from "./PICadenceBriefingLifecycleService";

const AT = "2026-08-05T12:00:00.000Z";

describe("PI cadence Confidence lifecycle", () => {
  it("carries real Midweek shadow observations through final Confidence", async () => {
    const activeGoal = goal();
    const activePhase = activeGoal.phases[0];
    const goalContract = adaptProductionGoalToCanonicalContract(activeGoal, {
      activePhase,
    });
    const prior = await createPrior(goalContract, activePhase);
    const store = {
      goalConfidenceSnapshots: [{
        goalId: activeGoal.id, phaseId: activePhase.id,
        currentAssessmentId: prior.id,
        currentScore: prior.currentPercentage,
        scoreBand: prior.confidenceBand,
      }],
      goalConfidenceHistory: [{
        goalId: activeGoal.id, phaseId: activePhase.id,
        assessmentId: prior.id, assessment: prior,
      }],
      dailyBriefings: [], phaseReviewDecisions: [],
    };
    const publish = vi.fn(async ({ artifact, assessment }) => ({
      status: "published_successor", committed: true, artifact, assessment,
    }));
    const publicationService = {
      captureBaseline: () => ({ store, revision: 1, semanticDigest: "digest" }),
      publish,
    };
    const artifact = midweekArtifact();
    const result = await createPICadenceBriefingLifecycleService({
      publicationService, now: () => new Date(AT),
    }).publish({
      cadence: "midweek", operation: "create", artifact,
      activeGoal, activePhase, operatingState: "calibration",
      piEnvelope: { shadow: {
        observations: [trainingObservation()],
        coverage: { training: "available", energy: "partial" },
      }, selection: { primary: [], supporting: [], background: [] } },
      reason: "scheduled_midweek_cadence",
    });
    expect(result).toMatchObject({ status: "published_successor", committed: true });
    const assessment = publish.mock.calls[0][0].assessment;
    expect(assessment.evidenceDurability).toMatchObject({
      persistence: "emerging",
      independentPeriodCount: 0,
      currentPeriod: {
        id: "confidence_week|2026-08-02|2026-08-08|America/Los_Angeles",
        state: "preliminary",
      },
      signals: [expect.objectContaining({ capability: "training_progression" })],
    });
    expect(assessment.movement).toBe("no_meaningful_change");
    expect(assessment.narrativeExplanation.text).toMatch(/still preliminary/i);
  });

  it("normalizes an absent optional artifact version for strict provider JSON", () => {
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

async function createPrior(goalContract, activePhase) {
  const result = await createBriefingForecastFinalizer({
    now: () => new Date("2026-08-02T12:00:00.000Z"),
  }).finalize({
    publisherType: "goal_initialization", userId: "user-one",
    occurrenceId: "goal-init", artifactId: "goal-init",
    cadenceOrEventType: "goal_initialization", goalContract,
    phaseId: activePhase.id,
    evidenceWindow: { id: "goal-init", start: "2026-08-01T00:00:00.000Z",
      cutoff: "2026-08-01T23:59:59.999Z", closed: true },
    strategyContext: goalContract.strategyHypothesis,
    executionContext: { adequacy: "unknown", refs: [] },
    evidenceDescriptors: [], previousCanonicalAssessment: null,
    publicationCutoff: "2026-08-01T23:59:59.999Z",
    finalizedAt: "2026-08-02T12:00:00.000Z",
    idempotencyKey: "goal-init",
    composeArtifact: () => ({ artifact: { id: "goal-init", briefing: {} } }),
    startingForecastContext: { experience: "new_user" },
  });
  return result.confidenceAssessment;
}

function goal() {
  const phase = { id: "phase-one", status: "active", order: 0,
    name: "Calibration", purpose: "Establish response", startDate: "2026-08-01",
    successCriteria: [] };
  return {
    id: "goal-one", status: "active", type: "body_composition",
    purpose: "Build lean mass", updatedAt: "2026-08-01T00:00:00.000Z",
    target: { type: "numeric_change", metric: "lean_mass",
      direction: "increase", amount: 10, unit: "lb",
      description: "Build ten pounds of lean mass", targetDate: "2026-12-31" },
    timeline: { startDate: "2026-08-01", targetDate: "2026-12-31" },
    openingApproach: { value: "calibration", known: [], unknown: [] },
    phases: [phase], activePhaseId: phase.id, guardrails: [],
    progressMeasurement: {
      outcomeMeasures: [{ id: "dexa", evidenceType: "dexa_lean_mass",
        role: "outcome", accepted: true }],
      predictiveSignals: [{ id: "training", evidenceType: "training_trend",
        role: "predictive", accepted: true }],
      explanatorySignals: [],
    },
  };
}

function midweekArtifact() {
  return {
    id: "midweek-two", userId: "user-one", cadence: "midweek",
    generatedAt: AT, version: "midweek_v1",
    evidenceWindow: {
      id: "midweek:2026-08-02:2026-08-04:America/Los_Angeles",
      cadence: "midweek", startDate: "2026-08-02", endDate: "2026-08-04",
      timeZone: "America/Los_Angeles", closed: true,
    },
    briefing: { goalConfidence: null },
  };
}

function trainingObservation() {
  return {
    id: "performance|overall|resistance", domain: "training",
    kind: "training_performance", direction: "positive", status: "improving",
    confidence: { level: "moderate", limitations: [] },
    evidenceWindow: { startDate: "2026-08-02", endDate: "2026-08-04",
      comparisonStartDate: "2026-07-26", comparisonEndDate: "2026-08-01" },
    supportingEvidenceIds: ["training-one", "training-two"],
    provenance: { producer: "fixture" },
    explanationData: { summary: { cadenceWindow: {
      evidenceIds: ["training-one", "training-two"],
    } } },
  };
}
