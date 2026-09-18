import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCanonicalConfidenceAssessment } from "../confidence/CanonicalConfidenceAssessmentModel";
import { createCanonicalBriefingConfidencePublicationService } from "../services/CanonicalBriefingConfidencePublicationService";
import { createStrategicActivationService } from "./StrategicActivationService";
import { createPairedCalibrationFixtures } from
  "../../fixtures/confidenceNarrativeV3CalibrationFixtures";

const directories = [];
afterEach(() => {
  directories.splice(0).forEach((directory) => fs.rmSync(directory, { recursive: true, force: true }));
});

const CALIBRATION = createPairedCalibrationFixtures().dexa;
const GOAL_ID = CALIBRATION.goalContract.goalId;
const PHASE_ID = CALIBRATION.goalContract.phase.phaseId;

function priorV2Assessment() {
  return createCanonicalConfidenceAssessment({
    goalId: GOAL_ID,
    phaseId: PHASE_ID,
    goalContractId: "contract-1",
    goalContractVersion: "1",
    publisherType: "weekly_briefing",
    originatingBriefingId: "occ-prior",
    briefingArtifactId: "artifact-prior",
    evidenceWindowId: "window-prior",
    priorAssessmentId: null,
    projection: {
      schemaVersion: "numeric_confidence_projection_v2_durability_v1",
      id: "proj-prior",
      movement: "no_meaningful_change",
      priorPercentage: null,
      currentPercentage: 62,
      movementMagnitude: "none",
    },
    structuredInterpretation: { id: "interp-prior", provenance: { inputFingerprint: "fp-interp-prior", engineVersion: "v2" } },
    forecastAssessment: {
      id: "forecast-prior",
      confidenceBand: "moderate",
      goalForecastStatus: "on_forecast",
      forecastDirection: "steady",
      forecastExplanation: { text: "steady" },
      remainingUncertainty: { status: "none", items: [] },
      nextDecisiveEvidence: null,
      forecastMetadata: {
        interpretationSemanticFingerprint: "fp-semantic-prior",
        goalContractFingerprint: "fp-goal-contract",
        inputFingerprint: "fp-forecast-prior",
        engineVersion: "v2",
      },
    },
    narrativeAssessment: {
      id: "narrative-prior",
      confidenceExplanation: { text: "Confidence held at 62%." },
      provenance: { inputFingerprint: "fp-narrative-prior", engineVersion: "v2" },
    },
    publicationTimestamp: "2026-09-01T00:00:00.000Z",
    sourceCutoff: "2026-09-01T00:00:00.000Z",
    idempotencyKey: "prior-key",
  });
}

function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "confidence-v3-activation-"));
  directories.push(directory);
  const filePath = path.join(directory, "store.json");
  const prior = priorV2Assessment();
  const store = {
    revision: 1,
    updatedAt: "2026-09-01T00:00:00.000Z",
    lastCommitId: "prior-commit",
    dailyBriefings: [],
    confidenceInitializationArtifacts: [],
    confidenceActivationArtifacts: [],
    goalConfidenceHistory: [{
      id: `goal_confidence_history_v2|${prior.id}`,
      assessmentId: prior.id, goalId: prior.goalId, phaseId: prior.phaseId,
      predecessorAssessmentId: null, originatingArtifactId: prior.briefingArtifactId,
      publisherType: prior.publisherType, persistedAt: prior.publicationTimestamp,
      commitId: "prior-commit", assessment: prior,
    }],
    goalConfidenceSnapshots: [{
      id: `goal_confidence_snapshot_v2|${prior.goalId}|${prior.phaseId}`,
      goalId: prior.goalId, phaseId: prior.phaseId,
      goalContractId: prior.goalContract.id, goalContractVersion: prior.goalContract.version,
      currentAssessmentId: prior.id, currentScore: prior.currentPercentage, scoreBand: prior.confidenceBand,
      previousCanonicalAssessmentId: null, historyRecordId: `goal_confidence_history_v2|${prior.id}`,
      originatingArtifactId: prior.briefingArtifactId, publisherType: prior.publisherType,
      evidenceCutoff: prior.sourceCutoff, createdAt: prior.publicationTimestamp, updatedAt: prior.publicationTimestamp,
      commitId: "prior-commit",
    }],
    goalConfidenceContinuitySeeds: [],
  };
  fs.writeFileSync(filePath, `${JSON.stringify(store)}\n`);
  const publicationService = createCanonicalBriefingConfidencePublicationService({ filePath });
  const activationService = createStrategicActivationService({
    publicationService,
    now: () => new Date("2026-09-17T12:00:00.000Z"),
    buildInterpretationInput: async () => ({
      goalContract: CALIBRATION.goalContract,
      observations: CALIBRATION.observations,
    }),
  });
  return { filePath, activationService, prior, store };
}

describe("StrategicActivationService", () => {
  it("refuses activation when the Goal has no prior user-facing assessment", async () => {
    const { activationService } = setup();
    const result = await activationService.activate({
      goal: { id: "goal_no_history", title: "New Goal" },
      phase: { id: "phase_x" },
      store: { goalConfidenceHistory: [], goalConfidenceSnapshots: [] },
      evidenceCutoff: "2026-09-17T00:00:00.000Z",
    });
    expect(result.status).toBe("refused_no_prior_assessment");
  });

  it("publishes a v3 activation baseline that carries forward the last V2 percentage as its continuity anchor", async () => {
    const { filePath, activationService } = setup();
    const store = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const result = await activationService.activate({
      goal: { id: GOAL_ID, title: "Build Lean Mass" },
      phase: { id: PHASE_ID },
      store,
      evidenceCutoff: "2026-09-17T00:00:00.000Z",
    });
    expect(result.committed).toBe(true);
    expect(result.previousPercentage).toBe(62);
    expect(result.currentPercentage).toBe(79);
    const persisted = JSON.parse(fs.readFileSync(filePath, "utf8"));
    expect(persisted.goalConfidenceHistory).toHaveLength(2);
    expect(persisted.confidenceActivationArtifacts).toHaveLength(1);
    expect(persisted.dailyBriefings).toHaveLength(0);
    expect(persisted.goalConfidenceSnapshots[0].currentAssessmentId).toBe(result.assessmentId);
  });

  it("is idempotent: a second identical activation call matches without duplicating history", async () => {
    const { filePath, activationService } = setup();
    const store1 = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const first = await activationService.activate({
      goal: { id: GOAL_ID, title: "Build Lean Mass" }, phase: { id: PHASE_ID },
      store: store1, evidenceCutoff: "2026-09-17T00:00:00.000Z",
    });
    expect(first.committed).toBe(true);
    const store2 = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const second = await activationService.activate({
      goal: { id: GOAL_ID, title: "Build Lean Mass" }, phase: { id: PHASE_ID },
      store: store2, evidenceCutoff: "2026-09-17T00:00:00.000Z",
    });
    expect(second.status).toBe("matched");
    expect(second.committed).toBe(false);
    expect(second.assessmentId).toBe(first.assessmentId);
    const persisted = JSON.parse(fs.readFileSync(filePath, "utf8"));
    expect(persisted.goalConfidenceHistory).toHaveLength(2);
    expect(persisted.confidenceActivationArtifacts).toHaveLength(1);
  });

  it("never mutates the pre-existing historical V2 assessment record", async () => {
    const { filePath, activationService, prior } = setup();
    const store = JSON.parse(fs.readFileSync(filePath, "utf8"));
    await activationService.activate({
      goal: { id: GOAL_ID, title: "Build Lean Mass" }, phase: { id: PHASE_ID },
      store, evidenceCutoff: "2026-09-17T00:00:00.000Z",
    });
    const persisted = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const historicalRecord = persisted.goalConfidenceHistory.find((item) => item.assessmentId === prior.id);
    expect(historicalRecord.assessment).toEqual(JSON.parse(JSON.stringify(prior)));
  });
});
