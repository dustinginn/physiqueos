import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { createFounderStoreUnitOfWork } from "../../data/repositories/FounderStoreUnitOfWork";
import { createFounderStoreMutationLockService } from
  "../../data/repositories/FounderStoreMutationLock";
import { createPhaseStrategy } from "../models/phaseStrategy";
import { createPhaseExpectedTrajectory } from "../models/phaseExpectedTrajectory";
import { createPhaseReviewApplicationBoundary } from "./PhaseReviewApplicationBoundary";
import { authorizePhaseReviewRequest } from "./PhaseReviewAuthorizationService";
import { evaluatePhaseReviewEligibility } from "./PhaseReviewEligibilityService";
import { createCanonicalPhaseReviewMutationBaseline } from
  "./CanonicalPhaseReviewMutationBaselineService";
import { deriveGoalAwarePhaseReviewInputs, evaluateGoalAwarePhaseReview } from
  "./GoalAwarePhaseReviewRecommendationService";

const directories = [];
afterEach(() => directories.splice(0).forEach((directory) =>
  fs.rmSync(directory, { recursive: true, force: true })));

describe("server-only Phase Review application boundary", () => {
  it("reproduces legacy milestone_invalid and hydrates the same trusted state to eligibility", () => {
    const value = store();
    const action = request(value);
    expect(eligibility(value, value.goals[0].phases[0].reviewMilestone)).toMatchObject({
      eligible: false, reason: "milestone_invalid",
    });
    expect(() => authorizePhaseReviewRequest({ store: value, request: action,
      actor: { id: value.user.id }, now: () => new Date("2026-08-15T19:00:00.000Z") }))
      .toThrow(expect.objectContaining({ code: "PHASE_REVIEW_ARTIFACT_INELIGIBLE" }));

    const result = createCanonicalPhaseReviewMutationBaseline({ store: value, request: action });
    expect(result).toMatchObject({ hydrated: true, replay: false,
      milestone: { schemaVersion: "phase_review_milestone_v1",
        milestoneId: "milestone", goalId: "goal", phaseId: "p1",
        unresolvedReviewId: "review", revision: 0 } });
    expect(eligibility(result.store, result.milestone)).toMatchObject({
      eligible: true, reason: "milestone_eligible", authorizationAllowed: true,
    });
    expect(value.goals[0].phases[0].reviewMilestone).toEqual(legacyMilestone());
  });

  it("preserves an already-canonical milestone semantically", () => {
    const value = store();
    value.goals[0].phases[0].reviewMilestone = canonicalMilestone("goal", "p1");
    const before = structuredClone(value.goals[0].phases[0].reviewMilestone);
    const result = createCanonicalPhaseReviewMutationBaseline({
      store: value, request: request(value),
    });
    expect(result.hydrated).toBe(false);
    expect(result.milestone).toEqual(before);
    expect(result.store.goals[0].phases[0].reviewMilestone).toEqual(before);
  });

  it.each([
    ["malformed milestone", (value) => { value.goals[0].phases[0].reviewMilestone = {}; },
      "legacy_milestone_malformed"],
    ["Goal mismatch", (value) => { value.goals[0].phases[0].reviewMilestone.goalId = "other"; },
      "goal_binding_mismatch"],
    ["phase mismatch", (value) => { value.goals[0].phases[0].reviewMilestone.phaseId = "p2"; },
      "phase_binding_mismatch"],
    ["artifact mismatch", (value) => {
      value.goals[0].phases[0].reviewMilestone.designatedArtifactIdentity = "other";
    }, "artifact_binding_mismatch"],
    ["evidence mismatch", (value) => {
      value.goals[0].phases[0].reviewMilestone.designatedEvidenceIdentity = "other";
    }, "evidence_binding_mismatch"],
    ["date mismatch", (value) => {
      value.goals[0].phases[0].reviewMilestone.plannedAt = "2026-08-14";
    }, "milestone_date_mismatch"],
    ["unresolved review mismatch", (value) => {
      value.goals[0].phases[0].reviewMilestone.unresolvedReviewId = "other";
    }, "unresolved_review_mismatch"],
    ["authorization scope mismatch", (value) => {
      value.dailyBriefings[0].phaseReviewAuthorization.currentPhaseId = "p2";
    }, "phase_binding_mismatch"],
    ["invalid revision", (value) => {
      value.goals[0].phases[0].reviewMilestone.revision = -1;
    }, "milestone_revision_invalid"],
    ["malformed required evidence", (value) => {
      value.goals[0].phases[0].reviewMilestone.requiredEvidence = "dexa_event";
    }, "legacy_milestone_malformed"],
    ["contradictory consumed state", (value) => {
      value.goals[0].phases[0].reviewMilestone.consumed = true;
    }, "milestone_state_mismatch"],
    ["missing trusted binding", (value) => {
      delete value.dailyBriefings[0].phaseReviewEligibilityBinding;
    }, "trusted_context_missing"],
  ])("rejects contradictory or incomplete legacy state: %s", (_label, arrange, reason) => {
    const value = store();
    arrange(value);
    expect(() => createCanonicalPhaseReviewMutationBaseline({
      store: value, request: request(value),
    })).toThrow(expect.objectContaining({
      code: "PHASE_REVIEW_ARTIFACT_INELIGIBLE", reason,
    }));
  });
  it.each([
    ["wrong artifact", (fixture) => ({ ...fixture.request,
      originatingArtifactId: "wrong-artifact" })],
    ["wrong milestone", (fixture) => ({ ...fixture.request,
      milestoneId: "wrong-milestone" })],
    ["wrong evidence", (fixture) => { fixture.liveStore.goals[0].phases[0]
      .reviewMilestone.designatedEvidenceIdentity = "wrong-evidence";
      const persisted = read(fixture.file); persisted.goals[0].phases[0]
        .reviewMilestone.designatedEvidenceIdentity = "wrong-evidence";
      fs.writeFileSync(fixture.file, JSON.stringify(persisted)); return fixture.request; }],
    ["consumed review", (fixture) => { const persisted = read(fixture.file);
      persisted.dailyBriefings[0].phaseReviewAuthorization.consumed = true;
      fs.writeFileSync(fixture.file, JSON.stringify(persisted)); return fixture.request; }],
  ])("rejects %s milestone authorization", async (_label, arrange) => {
    const fixture = createFixture();
    expect(await fixture.boundary.execute(arrange(fixture))).toMatchObject({
      ok: false, committed: false, code: "PHASE_REVIEW_ARTIFACT_INELIGIBLE" });
  });
  it.each([
    ["missing approval", (fixture) => ({ ...fixture.request, approvalToken: "wrong" }),
      "PHASE_REVIEW_EXPLICIT_APPROVAL_REQUIRED"],
    ["wrong Goal", (fixture) => ({ ...fixture.request, goalId: "wrong" }),
      "PHASE_REVIEW_GOAL_OWNERSHIP_MISMATCH"],
    ["stale store revision", (fixture) => ({ ...fixture.request, expectedStoreRevision: 6 }),
      "PHASE_REVIEW_ACTION_EXPECTED_REVISION_MISMATCH"],
    ["stale phase revision", (fixture) => ({ ...fixture.request, expectedPhaseRevision: 1 }),
      "PHASE_REVIEW_ACTION_EXPECTED_REVISION_MISMATCH"],
    ["stale Goal-aware recommendation", (fixture) => ({ ...fixture.request,
      recommendationFingerprint: "sha256_stale" }), "PHASE_REVIEW_RECOMMENDATION_STALE"],
  ])("fails closed for %s", async (_name, arrange, code) => {
    const fixture = createFixture();
    const before = fs.readFileSync(fixture.file);
    expect(await fixture.boundary.execute(arrange(fixture))).toMatchObject({ ok: false, code });
    expect(fs.readFileSync(fixture.file)).toEqual(before);
    expect(fixture.lock.inspect().exists).toBe(false);
  });

  it("rejects actor spoof fields and resolves the actor server-side", async () => {
    const fixture = createFixture();
    expect(await fixture.boundary.execute({ ...fixture.request, actorId: "user_founder_001" }))
      .toMatchObject({ ok: false, code: "PHASE_REVIEW_ACTION_REQUEST_INVALID" });
    const wrongActor = createFixture({ actorId: "attacker" });
    expect(await wrongActor.boundary.execute(wrongActor.request)).toMatchObject({ ok: false,
      code: "PHASE_REVIEW_FOUNDER_ACTOR_REQUIRED" });
  });

  it.each([
    ["caloric target", (request) => ({ ...request, caloricIntakeTarget: null })],
    ["activity target", (request) => ({ ...request, activityExpenditureTarget: null })],
  ])("requires a confirmed %s before Begin", async (_name, arrange) => {
    const fixture = createFixture();
    expect(await fixture.boundary.dryRun(arrange(fixture.request))).toMatchObject({ ok: false,
      code: "PHASE_REVIEW_ESTABLISHMENT_REQUIRED" });
    expect(fixture.lock.inspect().exists).toBe(false);
  });

  it("runs Begin dry-run through the real participants without persistence", async () => {
    const fixture = createFixture();
    const before = fs.readFileSync(fixture.file);
    const result = await fixture.boundary.dryRun(fixture.request);
    expect(result).toMatchObject({ ok: true, dryRun: true, committed: false,
      startingRevision: 7, endingRevision: 7, candidateRevision: 8,
      plannedMutation: { selectedOutcome: "begin_next_phase",
        nextPhase: { status: "active", projectedOrActualStart: "2026-08-16" },
        startingForecastPlanned: true, protectedCollectionsChanged: false } });
    expect(fs.readFileSync(fixture.file)).toEqual(before);
    expect(fixture.liveStore).toEqual(JSON.parse(before.toString("utf8")));
    expect(fixture.lock.inspect().exists).toBe(false);
  });

  it("runs Extend dry-run without Strategy activation, Confidence, or persistence", async () => {
    const fixture = createFixture();
    const before = fs.readFileSync(fixture.file);
    const request = extendRequest(fixture.request);
    const result = await fixture.boundary.dryRun(request);
    expect(result).toMatchObject({ ok: true, dryRun: true,
      plannedMutation: { selectedOutcome: "extend_current_phase",
        currentPhase: { toStatus: "active", plannedReviewAt: "2026-08-22" },
        nextPhase: { status: "planned", projectedOrActualStart: "2026-08-22" },
        startingForecastPlanned: false } });
    expect(fs.readFileSync(fixture.file)).toEqual(before);
  });

  it("commits Begin once, verifies it, and resolves an exact replay idempotently", async () => {
    const fixture = createFixture();
    const first = await fixture.boundary.execute(fixture.request);
    expect(first).toMatchObject({ ok: true, committed: true, idempotent: false,
      startingRevision: 7, endingRevision: 8,
      verification: { verified: true } });
    const stored = read(fixture.file);
    expect(stored.goals[0].phases).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "p1", status: "completed" }),
      expect.objectContaining({ id: "p2", status: "active", startedAt: "2026-08-16" }),
    ]));
    expect(stored.phaseStrategies[0].status).toBe("accepted");
    expect(stored.phaseExpectedTrajectories[0].status).toBe("accepted");
    expect(fixture.lock.inspect().exists).toBe(false);
    const replay = await fixture.boundary.execute(fixture.request);
    expect(replay).toMatchObject({ ok: true, committed: true, idempotent: true,
      startingRevision: 8, endingRevision: 8 });
    expect(read(fixture.file).phaseReviewDecisions).toHaveLength(1);
  });

  it("commits Extend with its original milestone and no Starting Forecast", async () => {
    const fixture = createFixture();
    const result = await fixture.boundary.execute(extendRequest(fixture.request));
    expect(result).toMatchObject({ ok: true, committed: true,
      plannedMutation: { selectedOutcome: "extend_current_phase" } });
    const stored = read(fixture.file);
    expect(stored.goals[0].phases[0]).toMatchObject({ status: "active",
      plannedReviewAt: "2026-08-22", originalPlannedReviewAt: "2026-08-15",
      extensionCount: 1 });
    expect(stored.confidenceInitializationArtifacts).toEqual([]);
    expect(stored.goalConfidenceHistory).toEqual([]);
  });

  it("releases the lock after injected transaction failure", async () => {
    const fixture = createFixture({ createUnitOfWork: () => ({ begin() {
      return { status: "open", expectedRevision: 7, transactionId: "failure",
        abort() {}, async mutate() { const error = new Error("injected");
          error.code = "INJECTED_PHASE_REVIEW_FAILURE"; throw error; } };
    } }) });
    const before = fs.readFileSync(fixture.file);
    expect(await fixture.boundary.execute(fixture.request)).toMatchObject({ ok: false,
      code: "INJECTED_PHASE_REVIEW_FAILURE" });
    expect(fs.readFileSync(fixture.file)).toEqual(before);
    expect(fixture.lock.inspect().exists).toBe(false);
  });

  it("serializes concurrent Begin requests and permits at most one non-replay commit", async () => {
    const fixture = createFixture();
    const [one, two] = await Promise.all([
      fixture.boundary.execute(fixture.request), fixture.boundary.execute(fixture.request),
    ]);
    expect([one, two].filter((item) => item.ok && item.idempotent === false)).toHaveLength(1);
    expect([one, two].every((item) => item.ok || /LOCK/.test(item.code))).toBe(true);
    expect(read(fixture.file).phaseReviewDecisions).toHaveLength(1);
    expect(fixture.lock.inspect().exists).toBe(false);
  });

  it("serializes production-shaped Begin requests from independent Node processes", async () => {
    const fixture = createFixture();
    const requestPath = path.join(fixture.directory, "request.json");
    fs.writeFileSync(requestPath, JSON.stringify(fixture.request));
    const helper = path.resolve("src/domain/services/fixtures/runIsolatedPhaseReviewAction.mjs");
    const children = [1, 2].map(() => spawn(process.execPath,
      ["--import", "tsx", helper, fixture.file, requestPath],
      { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] }));
    const results = await Promise.all(children.map(childJson));
    expect(results.filter((item) => item.ok && item.idempotent === false)).toHaveLength(1);
    expect(results.every((item) => item.ok || /LOCK/.test(item.code))).toBe(true);
    expect(read(fixture.file).phaseReviewDecisions).toHaveLength(1);
  }, 30_000);

  it("makes concurrent Begin and Extend conflict at the whole-store lock", async () => {
    let releaseRead;
    const gate = new Promise((resolve) => { releaseRead = resolve; });
    let reads = 0;
    const fixture = createFixture({ readOverride: async (file) => {
      reads += 1;
      if (reads === 1) await gate;
      return read(file);
    } });
    const begin = fixture.boundary.execute(fixture.request);
    await new Promise((resolve) => setTimeout(resolve, 25));
    const extend = await fixture.boundary.execute(extendRequest({ ...fixture.request,
      decisionId: "extend-concurrent", idempotencyKey: "extend-concurrent" }));
    expect(extend).toMatchObject({ ok: false,
      code: expect.stringMatching(/FOUNDER_STORE_MUTATION_LOCK_(LIVE_OWNER|TIMEOUT)/) });
    releaseRead();
    expect((await begin).ok).toBe(true);
  });

  it("has exactly the authorized production DEXA server-action caller", () => {
    const root = path.resolve("src");
    const callers = allFiles(root).filter((file) => !file.endsWith("ProductionPhaseReviewCoordinatorFactory.js") &&
      !file.endsWith(path.join("server", "phase-review", "actions.js")) &&
      !file.endsWith(".test.js") &&
      !file.includes(`${path.sep}fixtures${path.sep}`))
      .filter((file) => /executeAuthorizedPhaseReview|dryRunAuthorizedPhaseReview|ProductionPhaseReviewCoordinatorFactory/
        .test(fs.readFileSync(file, "utf8")));
    expect(callers).toEqual([
      path.resolve("src/app/briefings/dexa/[scanId]/actions.js"),
    ]);
    expect(fs.readFileSync(path.resolve("src/server/phase-review/actions.js"), "utf8"))
      .toContain('import "server-only"');
  });
});

function createFixture({ arrange = () => {}, actorId = "user_founder_001",
  createUnitOfWork: unitOverride, readOverride } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "phase-review-action-"));
  directories.push(directory);
  const file = path.join(directory, "runtime-store.json");
  const value = store(); arrange(value);
  fs.writeFileSync(file, JSON.stringify(value));
  const liveStore = structuredClone(value);
  const lock = createFounderStoreMutationLockService({ storePath: file,
    defaultTimeoutMs: 100, retryIntervalMs: 10 });
  const readPersistedStore = () => readOverride ? readOverride(file) : read(file);
  const boundary = createPhaseReviewApplicationBoundary({ runtimeStorePath: file, liveStore,
    lockService: lock, readPersistedStore,
    createUnitOfWork: unitOverride ?? ((options) => createFounderStoreUnitOfWork({ ...options,
      createCommitId: () => "commit", createTransactionId: () => "transaction" })),
    actorResolver: async () => ({ id: actorId }),
    now: () => new Date("2026-08-15T19:00:00.000Z") });
  return { directory, file, liveStore, lock, boundary, request: request(value) };
}
function store() {
  const goalId = "goal";
  return { version: 1, revision: 7, updatedAt: "2026-08-15T18:00:00.000Z",
    user: { id: "user_founder_001" }, goals: [{ id: goalId, userId: "user_founder_001",
      type: "build_lean_mass", title: "Build Lean Mass", primary: true, status: "active",
      target: { type: "numeric_change", metric: "lean_mass", direction: "increase",
        amount: 10, unit: "lb", targetDate: "2026-10-31" }, guardrails: [],
      progressMeasurement: { outcomeMeasures: [], predictiveSignals: [], explanatorySignals: [] },
      currentPhaseId: "p1", projectedNextPhaseId: "p2",
      timeline: { startDate: "2026-07-19", targetDate: "2026-10-31",
        projectedNextPhaseStart: "2026-08-16" }, phases: [
        { id: "p1", goalId, name: "Establish Maintenance", purpose: "Calibrate.", order: 0,
          status: "active", startedAt: "2026-07-19", startDate: "2026-07-19",
          plannedReviewAt: "2026-08-15", timingMode: "completion_criteria",
          completionDecisionRequired: true, reviewState: "due", revision: 0, successCriteria: [],
          reviewMilestone: legacyMilestone() },
        { id: "p2", goalId, name: "Lean Mass Build", purpose: "Build.", order: 1,
          status: "planned", startedAt: null, startDate: null,
          projectedNextPhaseStart: "2026-08-16", plannedReviewAt: "2026-10-15",
          targetDate: "2026-10-31", timingMode: "target_date",
          completionDecisionRequired: true, reviewState: "scheduled", revision: 0,
          successCriteria: [] } ] }],
    phaseReviewDecisions: [], phaseReviewTransactions: [],
    phaseStrategies: [strategy(goalId)], phaseExpectedTrajectories: [trajectory(goalId)],
    phaseLifecycleReadModels: [], executionItems: [{ id: "execution-history", goalId }],
    protocols: [{ id: "protocol", userId: "user_founder_001", protocolType: "energy",
      category: "energy", status: "active", currentGoalIds: [goalId],
      currentVersionId: "protocol-version", effectiveStrategy: { mode: "Maintenance Calibration" } }],
    protocolVersions: [{ id: "protocol-version", protocolId: "protocol", versionNumber: 1,
      status: "active" }],
    goalConfidenceSnapshots: [{ id: "snapshot", goalId, phaseId: "p1",
      currentAssessmentId: "confidence-p1", currentScore: 50, scoreBand: "uncertain",
      schemaVersion: "goal_confidence_snapshot_v2", evidenceCutoff: "2026-08-15T18:00:00.000Z" }],
    goalConfidenceHistory: [], confidenceInitializationArtifacts: [],
    dailyBriefings: [{ id: "artifact", goalId, phaseId: "p1", generatedAt: "2026-08-15T18:00:00.000Z",
      trigger: { evidenceType: "dexa", evidenceId: "aug-15-dexa", occurredAt: "2026-08-15" },
      phaseReviewEligibilityBinding: { schemaVersion: "phase_review_eligibility_binding_v1",
        artifactType: "dexa_event", artifactIdentity: "artifact", eventIdentity: "artifact",
        evidenceIdentity: "aug-15-dexa", artifactTimestamp: "2026-08-15",
        publicationTimestamp: "2026-08-15T18:00:00.000Z" },
      phaseReviewAuthorization: { eligible: true, approvalId: "approval",
        approvalTokenHash: sha256("secret"), userDecisionExplicit: true,
        goalId, currentPhaseId: "p1", expectedPhaseRevision: 0, expectedStoreRevision: 7,
        allowedOutcomes: ["begin_next_phase", "extend_current_phase"],
        recommendedOutcome: "begin_next_phase", recommendedDuration: null,
        recommendedReviewAt: null, rationale: "Canonical artifact recommendation.",
        decisionSource: "dexa_phase_review", expiresAt: "2026-08-16T00:00:00.000Z",
        milestoneId: "milestone", unresolvedReviewId: "review",
        designatedArtifactType: "dexa_event", designatedArtifactIdentity: null,
        designatedEvidenceIdentity: null, reviewRequired: true, consumed: false } }],
    canonicalEvidenceObjects: [], evidencePackages: [], progressPhotos: [],
    dexaScans: [{ id: "july-18-dexa", measuredAt: "2026-07-18",
      bodyFatPercentage: 7.7, leanMass: { value: 147.5, unit: "lb" },
      fatMass: { value: 12.8, unit: "lb" } }], energyStrategyLinks: [] };
}
function strategy(goalId) {
  const domains = Object.fromEntries(["energy", "nutrition", "training", "activity", "recovery",
    "coaching", "peptides", "supplements", "guardrailResponse"].map((key) =>
    [key, { intent: `${key}_intent` }]));
  return createPhaseStrategy({ id: "strategy-p2", goalId, phaseId: "p2", revision: 2,
    status: "accepted", createdAt: "2026-08-15T18:00:00.000Z",
    acceptedAt: "2026-08-15T18:30:00.000Z", acceptedBy: "user_founder_001",
    acceptanceId: "acceptance-strategy", acceptanceIdempotencyKey: "accept-strategy",
    acceptedRevision: 2, sourceLineage: [lineage("strategy")],
    purpose: { supportLeanMassGain: true, protectBodyFatGuardrail: true,
      avoidUnnecessarilyAggressiveSurplus: true, preserveGoalRunway: true }, domains,
    strategyHypothesis: { hypothesisId: "hypothesis", statement: "strategy_supports_response",
      strategyRef: { strategyId: "strategy-p2", strategyVersion: "1" }, assumptions: [],
      expectedResponses: [{ responseId: "response" }], validationConditions: [],
      falsificationConditions: [], expectedValidationTimeline: { startDate: "2026-08-16",
        targetDate: "2026-10-31" }, requiredExecutionExposure: null } });
}
function trajectory(goalId) {
  const milestone = (type) => ({ milestoneId: `milestone-${type}`, type,
    expectedTiming: { mode: "derived" }, purpose: `${type}_purpose`,
    expectedEvidence: ["evidence"], uncertaintyReduced: ["uncertainty"],
    canTriggerStrategyReview: true, canSupportCompletion: type === "final_goal_assessment" });
  return createPhaseExpectedTrajectory({ id: "trajectory-p2", goalId, phaseId: "p2", revision: 2,
    status: "accepted", createdAt: "2026-08-15T18:00:00.000Z",
    acceptedAt: "2026-08-15T18:30:00.000Z", acceptedBy: "user_founder_001",
    acceptanceId: "acceptance-trajectory", acceptanceIdempotencyKey: "accept-trajectory",
    acceptedRevision: 2, sourceLineage: [lineage("trajectory")],
    timeline: { projectedStartRule: "authorized", goalTargetDate: "2026-10-31",
      preActivationEvidenceOwnership: "none" },
    objectiveTrajectory: { fullTargetIsPromise: false, partialProgressHasValue: true,
      repeatValidationRequired: true },
    guardrailTrajectory: { independentFromObjective: true, acceptedRange: { min: 8, max: 9 } },
    weightTrajectory: { direction: "up" }, trainingTrajectory: { expectation: "progress" },
    milestones: ["phase_starting_forecast", "first_phase_cadence_review",
      "first_post_transition_photo_event", "objective_comparison", "mid_phase_review",
      "final_goal_assessment"].map(milestone),
    expectedTrajectory: { segments: [{ segmentId: "segment", startBoundary: "2026-08-16",
      endBoundary: "2026-10-31", measurableChangeExpectation: "uncertain_expected_range",
      expectedObjectiveRanges: [{ expectationId: "range", objectiveRef: `objective|${goalId}|lean_mass`,
        min: 0, max: 10, unit: "lb" }] }] } });
}
function lineage(sourceId) { return { field: "record", sourceType: "test_fixture", sourceId,
  path: sourceId, classification: "isolated_test_fixture" }; }
function request(value = store()) { return { goalId: "goal", currentPhaseId: "p1", decisionId: "decision",
  selectedOutcome: "begin_next_phase", selectedDuration: null, selectedReviewAt: null,
  expectedPhaseRevision: 0, expectedStoreRevision: 7, idempotencyKey: "decision",
  originatingArtifactId: "artifact", approvalId: "approval", approvalToken: "secret",
  milestoneId: "milestone", unresolvedReviewId: "review",
  caloricIntakeTarget: { value: 2800, unit: "kcal/day" },
  activityExpenditureTarget: { value: 800, unit: "kcal/day" },
  recommendationFingerprint: recommendation(value).fingerprint }; }
function recommendation(value) {
  const goal = value.goals[0];
  const phase = goal.phases[0];
  const artifact = value.dailyBriefings[0];
  return evaluateGoalAwarePhaseReview(deriveGoalAwarePhaseReviewInputs({
    goal, phase, nextPhase: goal.phases[1], artifact, canonicalScan: null,
    extensionDays: 14, asOf: "2026-08-15",
  }));
}
function eligibility(value, reviewMilestone) {
  const goal = value.goals[0];
  const phase = goal.phases[0];
  const artifact = value.dailyBriefings[0];
  return evaluatePhaseReviewEligibility({
    activeGoal: goal, activePhase: phase, reviewMilestone,
    currentArtifact: { ...artifact, evidenceTypes: ["dexa_event"],
      evidenceIdentities: ["aug-15-dexa"] },
    artifactType: "dexa_event", evidenceIdentity: "aug-15-dexa",
    artifactTimestamp: "2026-08-15", publicationTimestamp: artifact.generatedAt,
    currentDate: "2026-08-15", reviewState: phase.reviewState,
    decisionHistory: value.phaseReviewDecisions,
  });
}
function legacyMilestone() { return { type: "dexa_phase_review",
  plannedAt: "2026-08-15", originatingMilestoneAt: "2026-08-15" }; }
function canonicalMilestone(goalId, phaseId) { return { schemaVersion: "phase_review_milestone_v1",
  milestoneId: "milestone", goalId, phaseId, milestoneType: "planned_phase_review",
  reviewType: "phase_completion_review", requiredEvidence: [], eligibleArtifactTypes: ["dexa_event"],
  designatedArtifactIdentity: null, designatedEvidenceIdentity: null,
  earliestEligibleDate: "2026-08-15", latestEligibleDate: null,
  earlyReviewPolicy: "prohibited", reviewRequired: true, unresolvedReviewId: "review",
  resolvedReviewId: null, decisionRequired: true, recommendationRequired: true,
  consumed: false, lineage: [{ type: "test", id: "milestone" }], revision: 0 }; }
function extendRequest(value) { return { ...value, selectedOutcome: "extend_current_phase",
  selectedDuration: "1_week", selectedReviewAt: null,
  caloricIntakeTarget: null, activityExpenditureTarget: null }; }
function read(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function allFiles(directory) { return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const target = path.join(directory, entry.name); return entry.isDirectory() ? allFiles(target) : [target];
}); }
function childJson(child) { return new Promise((resolve, reject) => {
  let stdout = ""; let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  child.once("error", reject);
  child.once("exit", (code) => {
    if (code !== 0) { reject(new Error(`Phase Review subprocess failed: ${stderr}`)); return; }
    try { resolve(JSON.parse(stdout.trim().split(/\r?\n/).at(-1))); }
    catch (error) { reject(new Error(`Invalid subprocess output: ${stdout}\n${stderr}`, { cause: error })); }
  });
}); }
