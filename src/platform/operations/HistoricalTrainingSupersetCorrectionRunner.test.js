import { describe, expect, it } from "vitest";
import {
  HISTORICAL_TRAINING_SUPERSET_OWNER,
  runHistoricalTrainingSupersetCorrection,
} from "./HistoricalTrainingSupersetCorrectionRunner.js";
import { buildHistoricalTrainingSupersetCorrectionPayload } from "../../../scripts/operations/buildHistoricalTrainingSupersetCorrectionPayload.mjs";

const SHA = "a".repeat(40);
const OWNER = HISTORICAL_TRAINING_SUPERSET_OWNER;
const deployment = { expectedSha: SHA, runtimeSha: SHA };
const authorization = { ownerUserId: OWNER, authorizationReference: "founder-separate-super-set-apply-test" };

describe("historical Training Super Set correction", () => {
  it("previews exactly three guarded relationship corrections and writes nothing", async () => {
    const store = fixtureStore();
    const before = store.snapshot();
    const result = await runHistoricalTrainingSupersetCorrection({ store, authorization, deployment });

    expect(result.outcome).toBe("preview");
    expect(result.previewDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(result.facts).toMatchObject({
      targetSessionCount: 3,
      affectedOccurrenceCount: 6,
      affectedSetCount: 22,
      relationshipGroupCount: 3,
      forbiddenSupersetDefinitionCount: 0,
      affectedTargetPerformanceEventCount: 0,
      targetExercisePerformanceEventCount: 1,
      targetSessionPerformanceEventCount: 1,
    });
    expect(result.facts.impact.currentOccurrenceContexts.some((item) => item.context.includes("variant:super_set"))).toBe(true);
    expect(result.facts.impact.proposedOccurrenceContexts.some((item) => item.context.includes("variant:super_set"))).toBe(false);
    expect(result.facts.impact.proposedOccurrenceContexts.filter((item) => item.context.includes("relationship:superset")))
      .toHaveLength(4);
    expect(result.predictedMutations).toHaveLength(3);
    expect(result.targets.map((target) => target.members.map((member) => member.canonicalExerciseId).join("+")).sort()).toEqual([
      "leg_extension+sissy_squat",
      "leg_extension+sissy_squat",
      "seated_hip_adductions+seated_hip_abductions",
    ]);
    expect(store.getMutationCount()).toBe(0);
    expect(store.snapshot()).toEqual(before);
  });

  it("executes only with the intact preview, preserves sets/unrelated fields, and replays with zero writes", async () => {
    const store = fixtureStore();
    const before = store.snapshot();
    const preview = await runHistoricalTrainingSupersetCorrection({ store, authorization, deployment });
    const result = await runHistoricalTrainingSupersetCorrection({
      store, authorization, deployment, apply: true, expected: preview,
    });

    expect(result).toMatchObject({ outcome: "applied", writes: 3, postconditionsVerified: true });
    expect(store.getMutationCount()).toBe(3);
    const after = store.snapshot();
    for (const target of preview.targets) {
      const prior = before.candidates.find((row) => row.recordId === target.recordId);
      const current = after.candidates.find((row) => row.recordId === target.recordId);
      expect(current.version).toBe(prior.version + 1);
      expect(current.payload.payload.note).toBe(prior.payload.payload.note);
      expect(current.payload.payload.exercises.map((exercise) => exercise.sets))
        .toEqual(prior.payload.payload.exercises.map((exercise) => exercise.sets));
      const members = new Set(target.memberExerciseIds);
      expect(current.payload.payload.exercises.filter((exercise) => members.has(exercise.id))
        .every((exercise) => exercise.executionVariant === undefined)).toBe(true);
      expect(current.payload.payload.exerciseRelationshipGroups).toEqual([
        expect.objectContaining({
          id: target.relationshipGroupId,
          relationshipType: "superset",
          memberExerciseIds: target.memberExerciseIds,
        }),
      ]);
    }
    expect(after.performanceEvents).toEqual(before.performanceEvents);

    const replay = await runHistoricalTrainingSupersetCorrection({
      store, authorization, deployment, apply: true, expected: preview,
    });
    expect(replay).toMatchObject({ outcome: "already_corrected", writes: 0, postconditionsVerified: true });
    expect(store.getMutationCount()).toBe(3);
  });

  it("refuses apply on preview drift without writes", async () => {
    const store = fixtureStore();
    const preview = await runHistoricalTrainingSupersetCorrection({ store, authorization, deployment });
    store.driftTargetVersion("row-leg-a");
    const result = await runHistoricalTrainingSupersetCorrection({
      store, authorization, deployment, apply: true, expected: preview,
    });
    expect(result.outcome).toBe("drifted");
    expect(result.drift).toContain("preview_digest_changed");
    expect(store.getMutationCount()).toBe(0);
  });

  it("refuses ambiguous structure, unconfirmed ordering, or a target performance event", async () => {
    const structure = fixtureStore();
    structure.addExistingRelationship("row-leg-a");
    expect((await runHistoricalTrainingSupersetCorrection({ store: structure, authorization, deployment }))).toMatchObject({
      outcome: "refused", reasons: expect.arrayContaining(["target_relationship_group_already_present"]),
    });

    const lineage = fixtureStore();
    lineage.reverseLineageOrder("review-leg-a");
    expect((await runHistoricalTrainingSupersetCorrection({ store: lineage, authorization, deployment }))).toMatchObject({
      outcome: "refused", reasons: expect.arrayContaining(["confirmed_lineage_does_not_prove_pair_order"]),
    });

    const events = fixtureStore();
    events.addAffectedTargetPerformanceEvent();
    expect((await runHistoricalTrainingSupersetCorrection({ store: events, authorization, deployment }))).toMatchObject({
      outcome: "refused", reasons: expect.arrayContaining(["affected_target_performance_events_present"]),
    });
  });

  it("requires the exact owner/runtime and a separate execute authorization", async () => {
    const store = fixtureStore();
    await expect(runHistoricalTrainingSupersetCorrection({
      store, authorization: { ownerUserId: "other" }, deployment,
    })).rejects.toMatchObject({ code: "OWNER_MISMATCH" });
    await expect(runHistoricalTrainingSupersetCorrection({
      store, authorization, deployment: { expectedSha: SHA, runtimeSha: "b".repeat(40) },
    })).rejects.toMatchObject({ code: "RUNTIME_SHA_MISMATCH" });
    const preview = await runHistoricalTrainingSupersetCorrection({ store, authorization, deployment });
    await expect(runHistoricalTrainingSupersetCorrection({
      store, authorization: { ownerUserId: OWNER, authorizationReference: " " }, deployment, apply: true, expected: preview,
    })).rejects.toMatchObject({ code: "AUTHORIZATION_REFERENCE_REQUIRED" });
    expect(store.getMutationCount()).toBe(0);
  });

  it("builds a read-only preview payload and refuses an unsealed execute payload", async () => {
    const preview = await buildHistoricalTrainingSupersetCorrectionPayload({ sha: SHA, mode: "preview" });
    expect(preview.code).toContain("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(preview.code).toContain("SHOW transaction_read_only");
    await expect(buildHistoricalTrainingSupersetCorrectionPayload({ sha: SHA, mode: "apply" }))
      .rejects.toThrow(/authorization-ref and --expected/);
    const apply = await buildHistoricalTrainingSupersetCorrectionPayload({
      sha: SHA,
      mode: "apply",
      authorizationReference: "future-separate-authorization",
      expected: JSON.stringify({ previewDigest: "f".repeat(64), targets: [], facts: {} }),
    });
    expect(apply.code).toContain("BEGIN ISOLATION LEVEL SERIALIZABLE");
    expect(apply.code).toContain("pg_advisory_xact_lock");
  });
});

function fixtureStore() {
  const candidates = [
    targetRow("row-leg-a", "canonical-leg-a", "session-leg-a", 10, [
      exercise("leg-a", "leg_extension", 4), exercise("sissy-a", "sissy_squat", 4), exercise("other-a", "hack_squat", 2, null),
    ], "review-leg-a"),
    targetRow("row-leg-b", "canonical-leg-b", "session-leg-b", 20, [
      exercise("leg-b", "leg_extension", 4), exercise("sissy-b", "sissy_squat", 4), exercise("other-b", "hip_thrusts", 2, null),
    ], "review-leg-b"),
    targetRow("row-hip", "canonical-hip", "session-hip", 30, [
      exercise("adduction", "seated_hip_adductions", 3), exercise("abduction", "seated_hip_abductions", 3),
    ], "review-hip"),
  ];
  const lineage = [
    lineageRow("review-leg-a", "Leg Extensions (super set)\nSissy Squat (super set)"),
    lineageRow("review-leg-b", "Leg Extensions (super set)\nSissy Squat (super set)"),
    lineageRow("review-hip", "Seated Hip Adductions (super set)\nSeated Hip Abductions (super set)"),
  ];
  const impactSessions = [...candidates, ordinaryImpactRow()];
  const performanceEvents = [
    eventRow("event-target-ordinary", "leg_extension", "other-canonical", "other-session"),
    eventRow("event-unrelated-on-target", "hack_squat", "canonical-leg-a", "session-leg-a"),
  ];
  const variantDefinitions = [
    { recordId: "tev_static_1", version: 1, payload: { id: "tev_static_1", key: "static_hold", legacyKeys: ["static_hold"] } },
    { recordId: "tev_static_2", version: 1, payload: { id: "tev_static_2", key: "static_hold", legacyKeys: ["static_hold"] } },
  ];
  let mutations = 0;

  const api = {
    getMutationCount: () => mutations,
    async listLegacyCandidates() {
      return clone(candidates.filter((row) => row.payload.payload.exercises.some((item) => item.executionVariant?.key === "super_set")));
    },
    async listLineage({ recordIds }) { return clone(lineage.filter((row) => recordIds.includes(row.recordId))); },
    async listImpactTrainingSessions() { return clone(impactSessions); },
    async listPerformanceEvents() { return clone(performanceEvents); },
    async listEvidenceMetadata() {
      return clone([...candidates.map((row) => ({ recordId: row.recordId, version: row.version })), { recordId: "unrelated", version: 7 }]);
    },
    async listVariantDefinitions() { return clone(variantDefinitions); },
    async getTrainingSessions({ recordIds }) { return clone(candidates.filter((row) => recordIds.includes(row.recordId))); },
    async updateTrainingSession({ recordId, expectedVersion, payload }) {
      const row = candidates.find((item) => item.recordId === recordId);
      if (!row || row.version !== expectedVersion) throw Object.assign(new Error("version"), { code: "EXPECTED_VERSION_CONFLICT" });
      row.version += 1;
      row.payload = { ...clone(payload), version: row.version };
      mutations += 1;
      const impactIndex = impactSessions.findIndex((item) => item.recordId === recordId);
      if (impactIndex >= 0) impactSessions[impactIndex] = row;
      return clone(row);
    },
    snapshot: () => clone({ candidates, lineage, impactSessions, performanceEvents, variantDefinitions }),
    driftTargetVersion(recordId) {
      const row = candidates.find((item) => item.recordId === recordId);
      row.version += 1;
    },
    addExistingRelationship(recordId) {
      const row = candidates.find((item) => item.recordId === recordId);
      row.payload.payload.exerciseRelationshipGroups = [{ id: "existing", relationshipType: "superset", memberExerciseIds: ["leg-a", "sissy-a"] }];
    },
    reverseLineageOrder(recordId) {
      const row = lineage.find((item) => item.recordId === recordId);
      row.payload.details.text = "Sissy Squat (super set)\nLeg Extensions (super set)";
    },
    addAffectedTargetPerformanceEvent() {
      performanceEvents.push(eventRow("event-affected", "leg_extension", "canonical-leg-a", "session-leg-a"));
    },
  };
  return api;
}

function targetRow(recordId, canonicalId, sessionId, version, exercises, reviewId) {
  return {
    recordId,
    version,
    payload: {
      canonicalId,
      quality: { status: "active" },
      provenance: { evidence_review_ids: [reviewId], evidence_package_ids: [`package-${recordId}`] },
      payload: {
        id: sessionId,
        evidence_type: "training",
        note: `unchanged-${recordId}`,
        exercises,
        exerciseRelationshipGroups: [],
        structuralReviewIssues: [],
        provenance: { source_artifact_refs: [`source-${recordId}`] },
      },
    },
  };
}

function exercise(id, canonicalExerciseId, setCount, variant = { key: "super_set", label: "Super Set", rawLabel: "super set" }) {
  return {
    id,
    canonicalExerciseId,
    name: canonicalExerciseId,
    ...(variant ? { executionVariant: variant } : {}),
    sets: Array.from({ length: setCount }, (_, index) => ({
      set_number: index + 1,
      reps: 10 + index,
      weight: 50 + index * 5,
      measurement_type: "weighted_reps",
      duration_seconds: null,
    })),
  };
}

function lineageRow(recordId, text) {
  return { recordId, version: 1, payload: { status: "confirmed", details: { text } } };
}

function ordinaryImpactRow() {
  return {
    recordId: "impact-ordinary",
    version: 1,
    payload: {
      canonicalId: "impact-ordinary-canonical",
      quality: { status: "active" },
      payload: { id: "impact-ordinary-session", evidence_type: "training", exercises: [exercise("ordinary-leg", "leg_extension", 3, null)] },
    },
  };
}

function eventRow(recordId, canonicalExerciseId, sourceCanonicalTrainingId, sourceSessionId) {
  return {
    recordId,
    version: 1,
    payload: { id: recordId, canonicalExerciseId, sourceCanonicalTrainingId, sourceSessionId },
  };
}

function clone(value) { return structuredClone(value); }
