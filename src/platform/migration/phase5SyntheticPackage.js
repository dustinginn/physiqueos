import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { FOUNDATION_SOURCE_COLLECTIONS } from "./foundationSourceCollections.js";
import { exportCanonicalPackage, PHASE4_PACKAGE_VERSION } from "./phase4CanonicalExport.js";
import {
  createFixedBuildIdentityProvider,
  deriveTrustedMigrationSourceIdentity,
} from "./MigrationSourceIdentity.js";

export const PHASE5_SYNTHETIC_OWNER_ID = "phase5-synthetic-user";
export const PHASE5_SYNTHETIC_REVISION = 5001;

export function createPhase5SyntheticRuntime({ recordsPerCollection = 3 } = {}) {
  if (!Number.isInteger(recordsPerCollection) || recordsPerCollection < 1 || recordsPerCollection > 100) {
    throw new Error("Phase 5 synthetic scale must be between 1 and 100 records per collection.");
  }
  const userId = PHASE5_SYNTHETIC_OWNER_ID;
  const timestamp = "2026-08-11T20:00:00.000Z";
  const record = (collection, index = 0, extra = {}) => ({
    id: `phase5-${collection}-${String(index + 1).padStart(3, "0")}`,
    userId,
    version: index + 1,
    status: index === 0 ? "active" : "historical",
    createdAt: new Date(Date.parse(timestamp) - index * 86_400_000).toISOString(),
    updatedAt: timestamp,
    provenance: { source: "phase5-synthetic-provider-fixture", fixtureVersion: "1" },
    ...extra,
  });
  const many = (collection, first = {}, factory = () => ({})) => Array.from({ length: recordsPerCollection }, (_, index) =>
    record(collection, index, { ...(index === 0 ? first : {}), ...factory(index) }));

  const runtime = {
    version: "phase5-synthetic-runtime-v1",
    revision: PHASE5_SYNTHETIC_REVISION,
    lastCommitId: "phase5-synthetic-only",
    updatedAt: timestamp,
    importedAt: timestamp,
    user: {
      id: userId,
      userId,
      version: 1,
      name: "Synthetic Founder",
      firstName: "Synthetic",
      timeZone: "America/Los_Angeles",
      timezone: "America/Los_Angeles",
      locale: "en-US",
      units: { weight: "lb", distance: "mi" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: timestamp,
    },
    goals: many("goals", {
      title: "Synthetic strength and composition goal",
      type: "build_lean_mass",
      primary: true,
      status: "active",
      lifecycleState: "active",
      targetDate: "2026-12-31",
      phases: [{ id: "phase5-goal-phase-active", goalId: "phase5-goals-001", name: "Build", purpose: "Synthetic provider validation phase.", order: 0, status: "active", startDate: "2026-08-01", startedAt: "2026-08-01", plannedReviewAt: "2026-09-01", timingMode: "fixed_duration", duration: { value: 4, unit: "weeks" }, transitionPolicy: "evidence_review", successCriteria: [], guardrails: [] }],
    }, (index) => index > 0 ? { title: `Synthetic completed goal ${index}`, status: "completed", lifecycleState: "completed" } : {}),
    goalTransitionDrafts: many("goalTransitionDrafts", { goalId: "phase5-goals-001", transitionId: "phase5-transition-001", state: "ready" }),
    goalProtocolTransitionDrafts: many("goalProtocolTransitionDrafts", { goalId: "phase5-goals-001", protocolId: "phase5-protocols-001", state: "ready" }),
    weightEntries: many("weightEntries", { localDate: "2026-08-11", date: "2026-08-11", measuredAt: "2026-08-11T14:00:00.000Z", weight: { value: 180, unit: "lb" } }, (index) => ({ localDate: `2026-08-${String(11 - index).padStart(2, "0")}`, date: `2026-08-${String(11 - index).padStart(2, "0")}`, measuredAt: `2026-08-${String(11 - index).padStart(2, "0")}T14:00:00.000Z`, weight: { value: 180 + index * 0.5, unit: "lb" } })),
    dexaScans: many("dexaScans", { observedAt: "2026-08-10T17:00:00.000Z", scanDate: "2026-08-10", bodyFatPercentage: 15.2, artifactPath: "synthetic-dexa.pdf" }),
    protocols: many("protocols", { name: "Synthetic recovery protocol", category: "recovery", active: true, schedule: { cadence: "daily" } }),
    protocolVersions: many("protocolVersions", { protocolId: "phase5-protocols-001", effectiveAt: "2026-08-01T00:00:00.000Z", immutable: true }),
    energyStrategyLinks: many("energyStrategyLinks", { goalId: "phase5-goals-001", protocolId: "phase5-protocols-001", relationship: "supports" }),
    executionItems: many("executionItems", { title: "Synthetic foam roll", localDate: "2026-08-11", occurrenceDate: "2026-08-11", completionAuthority: "manual", completionHistory: [] }),
    reminders: many("reminders", { title: "Synthetic reminder", localDate: "2026-08-11", occurrenceDate: "2026-08-11", dueAt: "2026-08-11T15:00:00.000Z" }),
    nutritionContext: { id: "phase5-nutrition-context", userId, version: 1, activeProtocolId: "phase5-protocols-001", estimatedDailyCaloricIntake: { min: 2200, max: 2400, unit: "kcal" }, updatedAt: timestamp },
    operatingPlan: { id: "phase5-operating-plan", userId, version: 1, status: "active", title: "Synthetic Operating Plan", goalId: "phase5-goals-001", updatedAt: timestamp },
    progressPhotos: many("progressPhotos", { observedAt: "2026-08-10T18:00:00.000Z", localDate: "2026-08-10", view: "front", filePath: "synthetic-photo.jpg", photoSessionId: "phase5-photo-session-001" }),
    dailyCheckIns: many("dailyCheckIns", { localDate: "2026-08-11", energy: 4, recovery: 4, sleepQuality: 4 }, (index) => ({ localDate: `2026-08-${String(11 - index).padStart(2, "0")}` })),
    dailyBriefings: many("dailyBriefings", { type: "weekly", cadence: "weekly", title: "Synthetic weekly briefing", publishedAt: "2026-08-10T12:00:00.000Z", status: "published", content: { summary: "Synthetic provider validation briefing." } }),
    briefingReconciliationWorkItems: many("briefingReconciliationWorkItems", { briefingId: "phase5-dailyBriefings-001", state: "completed" }),
    confidenceInitializationArtifacts: many("confidenceInitializationArtifacts", { goalId: "phase5-goals-001", value: 70, band: "medium" }),
    analyses: many("analyses", { analysisType: "progress", observedAt: "2026-08-11T18:00:00.000Z", result: { direction: "on_track" } }),
    evidencePackages: many("evidencePackages", { package_id: "phase5-evidence-package-001", sourceIdentity: "phase5-evidence-source-001", observed_at: "2026-08-11T17:00:00.000Z", artifactPath: "synthetic-note.txt", evidence_objects: [{ evidence_type: "nutrition", observed_at: "2026-08-11", calories: 2300 }] }),
    evidenceReviews: many("evidenceReviews", { review_id: "phase5-evidence-review-001", packageId: "phase5-evidence-package-001", status: "pending", interpretedEvidence: { observed_at: "2026-08-11", evidence_objects: [{ evidence_type: "nutrition", observed_at: "2026-08-11", calories: 2300 }] }, itemDecisions: [] }),
    canonicalEvidenceObjects: [
      record("canonicalEvidenceObjects", 0, { canonicalId: "phase5-training-session-001", payload: { evidence_type: "training", observed_at: "2026-08-10T17:00:00.000Z", metadata: { activity_type: "Resistance Training" }, exercises: [{ canonicalExerciseId: "phase5_exercise_curl", canonicalExerciseName: "Synthetic Curl", name: "Synthetic Curl", sets: [{ reps: 10, load: 30 }] }] } }),
      record("canonicalEvidenceObjects", 1, { canonicalId: "phase5-nutrition-day-001", payload: { evidence_type: "nutrition", observed_at: "2026-08-11", calories: 2300, protein: 180 } }),
      record("canonicalEvidenceObjects", 2, { canonicalId: "phase5-activity-day-001", payload: { evidence_type: "activity", observed_at: "2026-08-11", steps: 9000, active_minutes: 45 } }),
      record("canonicalEvidenceObjects", 3, { canonicalId: "phase5-photo-evidence-001", payload: { evidence_type: "photo", observed_at: "2026-08-10", file: "synthetic-photo.jpg", photoSessionId: "phase5-photo-session-001" } }),
      record("canonicalEvidenceObjects", 4, { canonicalId: "phase5-dexa-evidence-001", payload: { evidence_type: "dexa", observed_at: "2026-08-10", file: "synthetic-dexa.pdf" } }),
    ],
    trainingPerformanceEvents: many("trainingPerformanceEvents", { exerciseId: "phase5_exercise_curl", sessionId: "phase5-training-session-001", eventType: "volume", value: 300 }),
    trainingPerformanceEventBatches: many("trainingPerformanceEventBatches", { sessionId: "phase5-training-session-001", eventIds: ["phase5-trainingPerformanceEvents-001"], state: "processed" }),
    canonicalExerciseLibrary: many("canonicalExerciseLibrary", { canonicalExerciseId: "phase5_exercise_curl", name: "Synthetic Curl", bodyRegion: "Arms", movementPattern: "Elbow Flexion", category: "Arms", aliases: ["Fixture Curl"] }),
    piEnergyConfidenceWorkItems: many("piEnergyConfidenceWorkItems", { goalId: "phase5-goals-001", state: "completed" }),
    piEnergyFinalizationReceipts: many("piEnergyFinalizationReceipts", { goalId: "phase5-goals-001", state: "committed" }),
    piTrainingConfidenceWorkItems: many("piTrainingConfidenceWorkItems", { goalId: "phase5-goals-001", sessionId: "phase5-training-session-001", state: "completed" }),
    piTrainingFinalizationReceipts: many("piTrainingFinalizationReceipts", { goalId: "phase5-goals-001", state: "committed" }),
    piLowerLevelConfidenceWorkerRuns: many("piLowerLevelConfidenceWorkerRuns", { goalId: "phase5-goals-001", state: "succeeded" }),
    migrationMarkers: many("migrationMarkers", { marker: "phase5-synthetic", state: "accepted" }),
    goalConfidenceSnapshots: many("goalConfidenceSnapshots", { goalId: "phase5-goals-001", value: 74, band: "medium", explanation: "Synthetic provider-scale confidence fixture.", calculatedAt: "2026-08-11T19:00:00.000Z" }),
    goalConfidenceHistory: many("goalConfidenceHistory", { goalId: "phase5-goals-001", value: 72, band: "medium", observedAt: "2026-08-10T19:00:00.000Z" }),
    goalConfidenceContinuitySeeds: many("goalConfidenceContinuitySeeds", { goalId: "phase5-goals-001", value: 70, source: "synthetic" }),
    phaseReviewDecisions: many("phaseReviewDecisions", { goalId: "phase5-goals-001", phaseId: "phase5-goal-phase-active", decision: "continue" }),
    phaseReviewTransactions: many("phaseReviewTransactions", { goalId: "phase5-goals-001", phaseId: "phase5-goal-phase-active", state: "committed" }),
    phaseStrategies: many("phaseStrategies", { goalId: "phase5-goals-001", phaseId: "phase5-goal-phase-active", strategy: "progressive_load" }),
    phaseExpectedTrajectories: many("phaseExpectedTrajectories", { goalId: "phase5-goals-001", phaseId: "phase5-goal-phase-active", forecast: [{ localDate: "2026-09-01", value: 182 }] }),
    phaseLifecycleReadModels: many("phaseLifecycleReadModels", { goalId: "phase5-goals-001", phaseId: "phase5-goal-phase-active", currentState: "active" }),
  };
  assertComplete(runtime);
  return Object.freeze(runtime);
}

export async function writePhase5SyntheticPackage({ outputRoot, repositoryRevision, recordsPerCollection = 3 } = {}) {
  const root = path.resolve(outputRoot);
  const sourceRoot = path.join(root, "source");
  const mediaRoot = path.join(sourceRoot, "media");
  const packageRoot = path.join(root, "package");
  await fs.mkdir(mediaRoot, { recursive: true });
  const runtime = createPhase5SyntheticRuntime({ recordsPerCollection });
  const runtimePath = path.join(sourceRoot, "runtime-store.json");
  const media = Object.freeze([
    { name: "synthetic-photo.jpg", bytes: Buffer.from("phase5-synthetic-jpeg-fixture-v1") },
    { name: "synthetic-dexa.pdf", bytes: Buffer.from("%PDF-1.4\n% phase5 synthetic provider fixture\n") },
    { name: "synthetic-note.txt", bytes: Buffer.from("phase5 synthetic evidence fixture\n") },
  ]);
  await fs.writeFile(runtimePath, `${JSON.stringify(runtime)}\n`, { flag: "wx" });
  for (const item of media) await fs.writeFile(path.join(mediaRoot, item.name), item.bytes, { flag: "wx" });
  const commit = String(repositoryRevision ?? "622ba8dd8684c36107dc6c6c49bc39080eb53a4f");
  const sourceIdentity = await deriveTrustedMigrationSourceIdentity({
    runtimePath,
    packageVersion: PHASE4_PACKAGE_VERSION,
    sourceSchemaVersion: "000003",
    buildIdentityProvider: createFixedBuildIdentityProvider({
      repositoryCommit: commit,
      applicationBuildId: `phase5-synthetic-${commit.slice(0, 7)}`,
      applicationSourceCommit: commit,
      migrationScriptCommit: commit,
    }),
  });
  const exported = await exportCanonicalPackage({ runtimePath, mediaRoot, outputRoot: packageRoot, sourceIdentity });
  return Object.freeze({ ...exported, packageRoot, mediaRoot, runtime, media: media.map((item) => ({ name: item.name, byteLength: item.bytes.length, sha256: createHash("sha256").update(item.bytes).digest("hex") })) });
}

function assertComplete(runtime) {
  const missing = FOUNDATION_SOURCE_COLLECTIONS.filter((name) => runtime[name] == null || (Array.isArray(runtime[name]) && runtime[name].length === 0));
  const extra = Object.keys(runtime).filter((name) => !FOUNDATION_SOURCE_COLLECTIONS.includes(name) && !["version", "revision", "lastCommitId", "updatedAt", "importedAt"].includes(name));
  if (missing.length || extra.length) throw new Error(`Phase 5 synthetic runtime is incomplete (missing=${missing.join(",")}; extra=${extra.join(",")}).`);
}
