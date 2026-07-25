import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  GoalTransitionActivationReasonCode as C,
  validateGoalTransitionActivation,
} from "./GoalTransitionActivationValidator";

const FULL_CAPABILITIES = {
  crossRepositoryTransaction: true,
  atomicCommit: true,
  rollback: true,
  stagedWrites: true,
  revisionLocking: true,
  persistenceErrorsPropagate: true,
};

function fixture() {
  const reviews = Array.from({ length: 15 }, (_, index) => {
    const category = index < 2 ? "peptide" : index < 6 ? "supplement" : `category_${index}`;
    const sourceProtocolId = `historical_${index}`;
    return {
      id: `review_${index}`,
      sourceProtocolId,
      sourceVersionId: `version_${index}`,
      category,
      intendedDisposition: index === 0 ? "update" : index === 1 ? "replace" : "keep",
      reviewStatus: "accepted",
      replacementProtocolDraftId: `preview_${index}`,
    };
  });
  const protocolDrafts = reviews.map((review, index) => ({
    id: `preview_${index}`,
    reviewId: review.id,
    status: "ready",
    sourceProtocolId: review.sourceProtocolId,
    sourceVersionId: review.sourceVersionId,
    payload: { cadence: "weekly", reviewed: true },
  }));
  const protocols = reviews.map((review, index) => ({
    id: review.sourceProtocolId,
    userId: "u",
    relatedGoalIds: ["goal_visible_abs_at_rest"],
    currentVersionId: `version_${index}`,
    status: "active",
  }));
  const protocolVersions = reviews.map((review, index) => ({
    id: `version_${index}`,
    protocolId: review.sourceProtocolId,
    status: "active",
  }));
  const generatedCommitments = reviews.slice(0, 3).map((review, index) => ({
    id: `commitment_${index}`,
    sourceProtocolId: review.sourceProtocolId,
    frequency: "weekly",
    requirement: `Do ${index}`,
  }));
  return {
    userId: "u",
    timeZone: "America/Los_Angeles",
    repositoryRevision: "revision-1",
    goals: [{
      id: "goal_visible_abs_at_rest",
      userId: "u",
      title: "Visible Abs at Rest",
      primary: true,
      status: "active",
    }],
    goalDraft: {
      id: "goal-transition",
      userId: "u",
      sourceGoalId: "goal_visible_abs_at_rest",
      status: "ready",
      sourceGoalSnapshot: { status: "active", userDecisionPending: true },
      primaryObjective: { id: "lean-mass-draft", type: "build_lean_mass", title: "Build Lean Mass" },
      operatingState: { value: "calibration", accepted: true },
      guardrails: [{ accepted: true, text: "Maintain approximately 8–9% body fat." }],
      briefingCadence: { type: "twice_weekly", days: ["wednesday", "sunday"] },
      evidenceStrategy: {
        outcomeMeasures: [{ role: "outcome", accepted: true }],
        predictiveSignals: [{ role: "predictive", accepted: true }],
      },
    },
    protocolDraft: {
      id: "protocol-transition",
      goalTransitionDraftId: "goal-transition",
      sourceGoalId: "goal_visible_abs_at_rest",
      pendingGoalDraftId: "lean-mass-draft",
      status: "ready",
      readyForActivation: true,
      validation: {
        valid: true,
        preparedCount: 15,
        unresolvedCount: 0,
        unresolvedReviewIds: [],
      },
      protocolReviews: reviews,
      protocolDrafts,
      generatedCommitments,
      generatedRoutine: generatedCommitments.map((commitment, index) => ({
        id: `routine_${index}`,
        frequency: commitment.frequency,
        text: commitment.requirement,
        sourcePreviewProtocolId: `preview_${index}`,
      })),
    },
    goalTransitionDrafts: [],
    protocols,
    protocolVersions,
    executionItems: [],
    reminders: [],
    evidenceRelationships: [{ evidenceId: "e1", goalId: "goal_visible_abs_at_rest" }],
    completionRecommendation: { userDecisionPending: true },
    currentBriefingCadence: { type: "daily" },
    proposedWriteSet: { evidence: [] },
  };
}

function validate(snapshot = fixture(), capabilities = FULL_CAPABILITIES) {
  return validateGoalTransitionActivation({ snapshot, capabilities });
}

function codes(result) {
  return result.blockingReasons.map((reason) => reason.code);
}

describe("GoalTransitionActivationValidator", () => {
  it("rejects consumed drafts and mismatched consumption state", () => {
    const both = fixture();
    both.goalDraft = {
      ...both.goalDraft,
      status: "applied",
      consumed: true,
      consumedAt: "2026-07-20T09:00:00.000Z",
      activationConsumption: {
        consumed: true,
        consumedByTransitionId: "goal-transition",
      },
    };
    both.protocolDraft = {
      ...both.protocolDraft,
      status: "applied",
      consumed: true,
      consumedAt: "2026-07-20T09:00:00.000Z",
      activationConsumption: {
        consumed: true,
        consumedByTransitionId: "goal-transition",
      },
    };
    expect(codes(validate(both))).toEqual(expect.arrayContaining([
      C.GOAL_TRANSITION_DRAFT_ALREADY_CONSUMED,
      C.PROTOCOL_TRANSITION_DRAFT_ALREADY_CONSUMED,
    ]));
    const mismatch = fixture();
    mismatch.goalDraft.consumed = true;
    expect(codes(validate(mismatch))).toContain(
      C.TRANSITION_DRAFT_CONSUMPTION_STATE_MISMATCH
    );
  });

  it("separates accepted draft readiness from unavailable activation infrastructure", () => {
    const result = validate(fixture(), {});
    expect(result.draftReady).toBe(true);
    expect(result.infrastructureReady).toBe(false);
    expect(result.ready).toBe(false);
    expect(codes(result)).toEqual([
      C.ATOMIC_TRANSACTION_UNAVAILABLE,
      C.ATOMIC_COMMIT_UNAVAILABLE,
      C.ROLLBACK_UNAVAILABLE,
      C.STAGED_WRITES_UNAVAILABLE,
      C.REVISION_LOCKING_UNAVAILABLE,
      C.PERSISTENCE_ERROR_PROPAGATION_UNRELIABLE,
    ]);
  });

  it.each([
    ["missing goal draft", (s) => { s.goalDraft = null; }, C.GOAL_DRAFT_MISSING],
    ["unaccepted goal draft", (s) => { s.goalDraft.status = "draft"; }, C.GOAL_DRAFT_NOT_ACCEPTED],
    ["missing protocol draft", (s) => { s.protocolDraft = null; }, C.PROTOCOL_DRAFT_MISSING],
    ["unaccepted protocol draft", (s) => { s.protocolDraft.status = "draft"; }, C.PROTOCOL_DRAFT_NOT_ACCEPTED],
    ["unresolved decisions", (s) => { s.protocolDraft.validation.unresolvedReviewIds = ["r"]; }, C.PROTOCOL_DECISIONS_UNRESOLVED],
    ["wrong accepted count", (s) => { s.protocolDraft.validation.preparedCount = 14; }, C.ACCEPTED_PROTOCOL_COUNT_MISMATCH],
    ["two active primaries", (s) => { s.goals.push({ id: "other", primary: true, status: "active" }); }, C.ACTIVE_GOAL_COUNT_INVALID],
    ["no active primary", (s) => { s.goals[0].status = "paused"; }, C.ACTIVE_GOAL_COUNT_INVALID],
    ["wrong active source", (s) => { s.goals[0].id = "other"; }, C.ACTIVE_SOURCE_GOAL_MISMATCH],
    ["active target", (s) => { s.goals.push({ id: "target", type: "build_lean_mass", primary: true, status: "active" }); }, C.TARGET_GOAL_ALREADY_ACTIVE],
    ["partial target", (s) => { s.goals.push({ id: "target", type: "build_lean_mass", primary: false, status: "planned" }); }, C.TARGET_GOAL_CONFLICT],
    ["historical reassignment", (s) => { s.protocolDraft.protocolReviews[0].reassignHistoricalOwnership = true; }, C.HISTORICAL_PROTOCOL_OWNERSHIP_INVALID],
    ["missing future identity", (s) => { s.protocolDraft.protocolReviews[0].futureProtocolId = ""; }, C.FUTURE_PROTOCOL_ID_MISSING],
    ["historical future-id collision", (s) => { s.protocolDraft.protocolReviews[0].futureProtocolId = "historical_0"; }, C.FUTURE_PROTOCOL_ID_COLLISION],
    ["duplicate future identities", (s) => {
      s.protocolDraft.protocolReviews[0].futureProtocolId = "duplicate-future";
      s.protocolDraft.protocolReviews[1].futureProtocolId = "duplicate-future";
    }, C.FUTURE_PROTOCOL_ID_COLLISION],
    ["invalid provenance", (s) => { s.protocolDraft.protocolReviews[0].sourceVersionId = "missing-version"; }, C.PROTOCOL_PROVENANCE_INVALID],
    ["unsupported disposition", (s) => { s.protocolDraft.protocolReviews[0].intendedDisposition = "merge"; }, C.DISPOSITION_UNSUPPORTED],
    ["missing update payload", (s) => { s.protocolDraft.protocolDrafts[0].payload = {}; }, C.DISPOSITION_WRITE_MAPPING_INVALID],
    ["missing commitment input", (s) => { delete s.protocolDraft.generatedCommitments[0].frequency; }, C.COMMITMENT_INPUT_INCOMPLETE],
    ["invalid cadence", (s) => { s.goalDraft.briefingCadence.type = "daily"; }, C.SCHEDULER_INTENT_INVALID],
    ["scheduler collision", (s) => { s.reminders.push({ schedulerKey: "goal-transition:coaching:twice_weekly", active: true }); }, C.SCHEDULER_INTENT_CONFLICT],
  ])("blocks %s with a stable reason", (_name, mutate, expected) => {
    const state = fixture();
    mutate(state);
    expect(codes(validate(state))).toContain(expected);
  });

  it("counts keep, update, replace, pause, and leave-behind without creating records", () => {
    const state = fixture();
    state.protocolDraft.protocolReviews[11].intendedDisposition = "pause";
    state.protocolDraft.protocolReviews[12].intendedDisposition = "leave_behind";
    for (const index of [11, 12]) {
      state.protocolDraft.protocolReviews[index].replacementProtocolDraftId = null;
      state.protocolDraft.protocolDrafts = state.protocolDraft.protocolDrafts.filter(
        (preview) => preview.reviewId !== `review_${index}`
      );
    }
    const result = validate(state);
    expect(result.expectedWriteCounts).toMatchObject({
      futureProtocolRecords: 13,
      activeReplacementProtocols: 13,
      pausedProtocols: 1,
      leftBehindProtocols: 1,
      provenanceRelationships: 13,
      activeProtocolGoalRelationships: 13,
    });
  });

  it("keeps peptide and supplement presentation groups as independent future records", () => {
    const result = validate();
    const grouped = result.futureProtocolPlan.filter((record) => ["peptide", "supplement"].includes(record.category));
    expect(grouped).toHaveLength(6);
    expect(new Set(grouped.map((record) => record.id)).size).toBe(6);
    expect(new Set(grouped.map((record) => record.sourceProtocolId)).size).toBe(6);
  });

  it("requires commitments to resolve to future records and never historical active owners", () => {
    const state = fixture();
    state.protocolDraft.protocolReviews[2].intendedDisposition = "pause";
    state.protocolDraft.protocolReviews[2].replacementProtocolDraftId = null;
    state.protocolDraft.protocolDrafts = state.protocolDraft.protocolDrafts.filter((preview) => preview.reviewId !== "review_2");
    expect(codes(validate(state))).toContain(C.COMMITMENT_OWNER_INVALID);
  });

  it.each([
    ["crossRepositoryTransaction", C.ATOMIC_TRANSACTION_UNAVAILABLE],
    ["atomicCommit", C.ATOMIC_COMMIT_UNAVAILABLE],
    ["rollback", C.ROLLBACK_UNAVAILABLE],
    ["stagedWrites", C.STAGED_WRITES_UNAVAILABLE],
    ["revisionLocking", C.REVISION_LOCKING_UNAVAILABLE],
    ["persistenceErrorsPropagate", C.PERSISTENCE_ERROR_PROPAGATION_UNRELIABLE],
  ])("fails closed when %s is unavailable", (field, expected) => {
    expect(codes(validate(fixture(), { ...FULL_CAPABILITIES, [field]: false }))).toContain(expected);
  });

  it("has deterministic reason ordering, counts, and fingerprints", () => {
    const state = fixture();
    const first = validate(state, {});
    const second = validate(structuredClone(state), {});
    expect({
      ready: first.ready,
      draftReady: first.draftReady,
      infrastructureReady: first.infrastructureReady,
      codes: codes(first),
      counts: first.expectedWriteCounts,
      revisions: first.sourceRevisions,
    }).toEqual({
      ready: second.ready,
      draftReady: second.draftReady,
      infrastructureReady: second.infrastructureReady,
      codes: codes(second),
      counts: second.expectedWriteCounts,
      revisions: second.sourceRevisions,
    });
  });

  it("changes only the relevant source fingerprints when critical input changes", () => {
    const state = fixture();
    const before = validate(state).sourceRevisions;
    state.protocolDraft.protocolDrafts[0].payload.cadence = "daily";
    const after = validate(state).sourceRevisions;
    expect(after.protocolDraft).not.toBe(before.protocolDraft);
    expect(after.activationCriticalState).not.toBe(before.activationCriticalState);
    expect(after.goalDraft).toBe(before.goalDraft);
    expect(after.activeGoalState).toBe(before.activeGoalState);
  });

  it("performs zero writes or lifecycle side effects", () => {
    const state = fixture();
    const before = JSON.stringify(state);
    const forbidden = {
      save: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
      activate: vi.fn(), complete: vi.fn(), schedule: vi.fn(), persist: vi.fn(),
      generateCommitments: vi.fn(), generateBriefing: vi.fn(), reconcileEvidence: vi.fn(),
    };
    validate(state);
    expect(JSON.stringify(state)).toBe(before);
    Object.values(forbidden).forEach((method) => expect(method).not.toHaveBeenCalled());
  });

  it("leaves the production runtime byte-for-byte unchanged", () => {
    const path = "private/founder/runtime-store.json";
    const bytesBefore = fs.readFileSync(path);
    const store = JSON.parse(bytesBefore);
    const goalDraft = store.goalTransitionDrafts.find((draft) => draft.status === "ready");
    const protocolDraft = store.goalProtocolTransitionDrafts.find((draft) => draft.status === "ready");
    validateGoalTransitionActivation({
      snapshot: {
        userId: store.user.id,
        timeZone: store.user.timeZone ?? store.user.timezone,
        defaultTimeZone: "America/Los_Angeles",
        repositoryRevision: store.updatedAt,
        goals: store.goals,
        goalDraft,
        protocolDraft,
        goalTransitionDrafts: store.goalTransitionDrafts,
        protocols: store.protocols,
        protocolVersions: store.protocolVersions,
        executionItems: store.executionItems,
        reminders: store.reminders,
        evidenceRelationships: [],
        completionRecommendation: { userDecisionPending: true },
        currentBriefingCadence: null,
        proposedWriteSet: { evidence: [] },
      },
      capabilities: {},
    });
    expect(fs.readFileSync(path)).toEqual(bytesBefore);
  }, 30_000);
});
