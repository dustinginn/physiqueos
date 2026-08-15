import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFounderBuildLeanMassPhaseRepairPlan, isFounderBuildLeanMassGoal } from
  "./FounderPhaseCorrectionService";
import { createFounderPhase2ActivationPackageDrafts } from
  "./FounderPhase2ActivationPackageService";
import { createPhaseActivationPackageAcceptanceService } from
  "./PhaseActivationPackageAcceptanceService";
import { createIsolatedProductionShapedPhaseReviewCoordinatorFactory } from
  "./ProductionPhaseReviewCoordinatorFactory";
import { createFullFounderMemoryProbe } from "../../testSupport/fullFounderMemoryProbe";

const productionPath = path.resolve("private/founder/runtime-store.json");
const directories = [];
afterEach(() => directories.splice(0).forEach((directory) =>
  fs.rmSync(directory, { recursive: true, force: true })));

describe("production Phase Review boundary full-Founder simulation", () => {
  it("dry-runs and executes Begin and Extend on independent full temporary clones", async () => {
    const productionBefore = fs.readFileSync(productionPath);
    const memory = createFullFounderMemoryProbe({
      label: "PhaseReviewProductionBoundarySimulation",
      logicalStoreBytes: productionBefore.length,
      maxHeapUsedBytes: 2 * 1024 * 1024 * 1024,
      maxRssBytes: 2560 * 1024 * 1024,
    });
    const productionHash = sha256(productionBefore);
    const simulated = prepareSimulation(JSON.parse(productionBefore.toString("utf8")));
    const initialBytes = Buffer.from(JSON.stringify(simulated));
    memory.checkpoint("simulation_serialized");
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "phase-review-production-boundary-"));
    directories.push(directory);

    const beginPath = path.join(directory, "begin-runtime-store.json");
    fs.writeFileSync(beginPath, initialBytes);
    const beginLive = JSON.parse(initialBytes.toString("utf8"));
    const beginFactory = createIsolatedProductionShapedPhaseReviewCoordinatorFactory({
      runtimeStorePath: beginPath, liveStore: beginLive,
      now: () => new Date("2026-08-15T19:00:00.000Z") });
    expect(beginFactory.dependencyManifest).toMatchObject({ crossProcessLock: true,
      phaseReviewCoordinator: true, strategyAcceptance: true, trajectoryAcceptance: true,
      startingForecast: true, interpretationV2: true, forecastV2: true,
      narrativeV2: true, confidencePersistence: true, authorizationVerifier: true });
    const beginRequest = requestFor(simulated, "begin_next_phase");
    const beforeDryRun = fs.readFileSync(beginPath);
    const beginDryRun = await beginFactory.dryRun(beginRequest);
    memory.checkpoint("begin_dry_run_completed");
    expect(beginDryRun).toMatchObject({ ok: true, dryRun: true, committed: false,
      plannedMutation: { nextPhase: { status: "active",
        projectedOrActualStart: "2026-08-16" }, startingForecastPlanned: true } });
    expect(fs.readFileSync(beginPath).equals(beforeDryRun)).toBe(true);
    const protectedBefore = protectedFingerprints(simulated);
    const begin = await beginFactory.execute(beginRequest);
    memory.checkpoint("begin_commit_completed");
    expect(begin).toMatchObject({ ok: true, committed: true, idempotent: false,
      verification: { verified: true } });
    const begun = JSON.parse(fs.readFileSync(beginPath, "utf8"));
    const begunGoal = begun.goals.find((item) => item.id === beginRequest.goalId);
    expect(begunGoal.phases.find((item) => item.id === beginRequest.currentPhaseId).status)
      .toBe("completed");
    expect(begunGoal.phases.find((item) => item.id === begunGoal.currentPhaseId))
      .toMatchObject({ status: "active", startedAt: "2026-08-16" });
    expect(begun.confidenceInitializationArtifacts.some((item) =>
      item.occurrenceId === beginRequest.decisionId)).toBe(true);
    expect(protectedFingerprints(begun)).toEqual(protectedBefore);
    expect(begun.protocolVersions.slice(0, simulated.protocolVersions.length))
      .toEqual(simulated.protocolVersions);
    expect(begun.protocolVersions.at(-1)).toMatchObject({ phaseId: begunGoal.currentPhaseId,
      confirmation: { decisionId: beginRequest.decisionId },
      change: { reviewedChanges: { caloricIntakeTarget: { value: 2800, unit: "kcal/day" },
        activityExpenditureTarget: { value: 800, unit: "kcal/day" } } } });
    expect(await beginFactory.execute(beginRequest)).toMatchObject({ ok: true,
      committed: true, idempotent: true });
    expect(beginFactory.inspectLock().exists).toBe(false);
    memory.checkpoint("begin_idempotency_verified");

    const extendPath = path.join(directory, "extend-runtime-store.json");
    fs.writeFileSync(extendPath, initialBytes);
    const extendLive = JSON.parse(initialBytes.toString("utf8"));
    const extendFactory = createIsolatedProductionShapedPhaseReviewCoordinatorFactory({
      runtimeStorePath: extendPath, liveStore: extendLive,
      now: () => new Date("2026-08-15T19:00:00.000Z") });
    const extendRequest = requestFor(simulated, "extend_current_phase");
    const beforeExtendDryRun = fs.readFileSync(extendPath);
    expect(await extendFactory.dryRun(extendRequest)).toMatchObject({ ok: true,
      dryRun: true, committed: false,
      plannedMutation: { currentPhase: { plannedReviewAt: "2026-08-22" },
        nextPhase: { status: "planned", projectedOrActualStart: "2026-08-22" },
        startingForecastPlanned: false } });
    memory.checkpoint("extend_dry_run_completed");
    expect(fs.readFileSync(extendPath).equals(beforeExtendDryRun)).toBe(true);
    expect(await extendFactory.execute(extendRequest)).toMatchObject({ ok: true,
      committed: true, verification: { verified: true } });
    memory.checkpoint("extend_commit_completed");
    const extended = JSON.parse(fs.readFileSync(extendPath, "utf8"));
    const extendedGoal = extended.goals.find((item) => item.id === extendRequest.goalId);
    expect(extendedGoal.phases.find((item) => item.id === extendRequest.currentPhaseId))
      .toMatchObject({ status: "active", plannedReviewAt: "2026-08-22",
        originalPlannedReviewAt: "2026-08-15", extensionCount: 1 });
    expect(extended.confidenceInitializationArtifacts).toEqual(simulated.confidenceInitializationArtifacts);
    expect(extended.goalConfidenceHistory).toEqual(simulated.goalConfidenceHistory);
    expect(protectedFingerprints(extended)).toEqual(protectedBefore);
    expect(extended.protocols).toEqual(simulated.protocols);
    expect(extended.protocolVersions).toEqual(simulated.protocolVersions);
    expect(extendFactory.inspectLock().exists).toBe(false);

    expect(fs.readFileSync(productionPath).equals(productionBefore)).toBe(true);
    expect(sha256(fs.readFileSync(productionPath))).toBe(productionHash);
    memory.finish({ testOwnedFullStoreParses: 5, testOwnedFullStoreClones: 2,
      testOwnedFullStoreSerializations: 1, fullStoreDeepFreezes: 0,
      temporaryStoreInstances: 2, protectedCollectionSerializations: 30,
      exactByteComparisons: 3 });
  }, 600_000);
});

function prepareSimulation(store) {
  const sourceGoal = store.goals.find(isFounderBuildLeanMassGoal);
  const repair = createFounderBuildLeanMassPhaseRepairPlan(sourceGoal);
  store.goals.splice(store.goals.findIndex((item) => item.id === sourceGoal.id),
    1, structuredClone(repair.candidate));
  store.phaseReviewDecisions = [];
  store.phaseReviewTransactions = [];
  store.phaseStrategies = [];
  store.phaseExpectedTrajectories = [];
  store.phaseLifecycleReadModels = [];
  const goal = store.goals.find((item) => item.id === repair.goalId);
  const phase = goal.phases.find((item) => item.name === "Lean Mass Build");
  const drafts = createFounderPhase2ActivationPackageDrafts({ store, goal, phase,
    createdAt: "2026-08-02T12:00:00.000Z" });
  const acceptance = createPhaseActivationPackageAcceptanceService({
    now: () => new Date("2026-08-15T18:30:00.000Z") });
  store.phaseStrategies.push(accept(acceptance, "Strategy", drafts.strategy,
    "accept-founder-phase-2-strategy-v1"));
  store.phaseExpectedTrajectories.push(accept(acceptance, "Trajectory", drafts.trajectory,
    "accept-founder-phase-2-trajectory-v1"));
  const current = goal.phases.find((item) => item.name === "Establish Maintenance");
  const milestone = current.reviewMilestone;
  store.dailyBriefings ??= [];
  store.dailyBriefings.push({ id: "phase-review-production-boundary-simulation-artifact",
    userId: goal.userId, goalId: goal.id, phaseId: current.id,
    artifactType: "event", cadence: "event", generatedAt: "2026-08-15T18:45:00.000Z",
    trigger: { evidenceType: "dexa", evidenceId: "simulation-dexa-scan",
      occurredAt: "2026-08-15T18:00:00.000Z" },
    phaseReviewEligibilityBinding: { schemaVersion: "phase_review_eligibility_binding_v1",
      artifactType: "dexa_event",
      artifactIdentity: "phase-review-production-boundary-simulation-artifact",
      eventIdentity: "phase-review-production-boundary-simulation-artifact",
      evidenceIdentity: "simulation-dexa-scan",
      artifactTimestamp: "2026-08-15T18:00:00.000Z",
      publicationTimestamp: "2026-08-15T18:45:00.000Z" },
    phaseReviewAuthorization: { eligible: true,
      approvalId: "phase-review-production-boundary-simulation-approval",
      approvalTokenHash: sha256(Buffer.from("simulation-secret")),
      userDecisionExplicit: true, goalId: goal.id, currentPhaseId: current.id,
      expectedPhaseRevision: current.revision, expectedStoreRevision: Number(store.revision ?? 0),
      allowedOutcomes: ["begin_next_phase", "extend_current_phase"],
      milestoneId: milestone.milestoneId,
      unresolvedReviewId: milestone.unresolvedReviewId,
      designatedArtifactType: "dexa_event",
      designatedArtifactIdentity: milestone.designatedArtifactIdentity,
      designatedEvidenceIdentity: milestone.designatedEvidenceIdentity,
      reviewRequired: true, consumed: false,
      recommendedOutcome: "begin_next_phase", recommendedDuration: null,
      recommendedReviewAt: null, rationale: "Temporary-clone Phase Review authorization.",
      decisionSource: "production_boundary_simulation", expiresAt: "2026-08-16T00:00:00.000Z" } });
  return store;
}
function requestFor(store, outcome) {
  const goal = store.goals.find(isFounderBuildLeanMassGoal);
  const current = goal.phases.find((item) => item.name === "Establish Maintenance");
  const milestone = current.reviewMilestone;
  const suffix = outcome === "begin_next_phase" ? "begin" : "extend";
  return { goalId: goal.id, currentPhaseId: current.id,
    decisionId: `phase-review-production-boundary-${suffix}`,
    selectedOutcome: outcome,
    selectedDuration: outcome === "extend_current_phase" ? "1_week" : null,
    selectedReviewAt: null, expectedPhaseRevision: current.revision,
    expectedStoreRevision: Number(store.revision ?? 0),
    idempotencyKey: `phase-review-production-boundary-${suffix}`,
    originatingArtifactId: "phase-review-production-boundary-simulation-artifact",
    milestoneId: milestone.milestoneId,
    unresolvedReviewId: milestone.unresolvedReviewId,
    approvalId: "phase-review-production-boundary-simulation-approval",
    approvalToken: "simulation-secret",
    caloricIntakeTarget: outcome === "begin_next_phase" ? { value: 2800, unit: "kcal/day" } : null,
    activityExpenditureTarget: outcome === "begin_next_phase" ? { value: 800, unit: "kcal/day" } : null };
}
function accept(service, type, draft, idempotencyKey) {
  const ready = service[`submit${type}ForReview`](draft, { expectedRevision: 0 });
  return service[`accept${type}`](ready, { actorId: "user_founder_001", expectedRevision: 1,
    idempotencyKey, authorization: { authorized: true,
      scope: "phase_activation_package_acceptance", recordId: ready.id,
      actorId: "user_founder_001" } }).record;
}
function protectedFingerprints(store) { return Object.fromEntries([
  "executionItems", "dailyBriefings", "canonicalEvidenceObjects",
  "evidencePackages", "dexaScans", "progressPhotos", "goalTransitionDrafts",
  "goalProtocolTransitionDrafts",
].map((key) => [key, sha256(Buffer.from(JSON.stringify(store[key] ?? [])))])); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
