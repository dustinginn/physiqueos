import fs from "node:fs";
import { createHash } from "node:crypto";
import { createFounderStoreUnitOfWork } from "../../data/repositories/FounderStoreUnitOfWork.js";

export const AUGUST_10_FALSE_TRAINING_CANONICAL_ID =
  "training|evidence|evidence_submission_20260810185111239_training_session";
export const AUGUST_10_FALSE_TRAINING_PAYLOAD_ID =
  "evidence_submission_20260810185111239_training_session";
export const AUGUST_10_FALSE_TRAINING_REVIEW_ID =
  "evidence_review_20260810185111699";
export const AUGUST_10_FALSE_TRAINING_PACKAGE_ID =
  "evidence_submission_20260810185111239_typed";
export const AUGUST_10_LEGITIMATE_STRENGTH_ID =
  "training_20260810_0721_traditional_strength_training";

const EXPECTED_EXERCISES = Object.freeze([
  "Spider Curls",
  "Cable Rope Pushdowns",
  "Bicep Curl Machine",
]);
const EXPECTED_RELATIONSHIP_MEMBERS = Object.freeze([
  "exercise_occurrence_61bbe8e6",
  "exercise_occurrence_de4a3149",
]);

export function createAugust10FalseTrainingRetractionService({
  runtimeStorePath,
  liveStore,
  now = () => new Date(),
  createUnitOfWork = createFounderStoreUnitOfWork,
} = {}) {
  if (!runtimeStorePath || !liveStore) {
    throw new Error("August 10 Training retraction requires a bound Founder store.");
  }

  return Object.freeze({
    audit() {
      return classify(capture(runtimeStorePath).store);
    },

    prepare({ retractedAt = now().toISOString() } = {}) {
      const baseline = capture(runtimeStorePath);
      const classification = classify(baseline.store);
      if (classification.state === "already_retracted") {
        return { outcome: "already_retracted", baseline: publicBaseline(baseline), classification };
      }
      assert(classification.state === "eligible", classification.reason);
      const plan = {
        canonicalId: AUGUST_10_FALSE_TRAINING_CANONICAL_ID,
        disposition: "retracted_false_proving_evidence",
        retractedAt: new Date(retractedAt).toISOString(),
        retainedCanonicalIds: classification.retainedSessions.map((session) => session.canonicalId),
      };
      return {
        outcome: "prepared",
        baseline: publicBaseline(baseline),
        classification,
        plan,
        fingerprint: digest({ baseline: publicBaseline(baseline), plan }),
      };
    },

    async execute(command = {}) {
      const prepared = this.prepare({ retractedAt: command.retractedAt });
      if (prepared.outcome === "already_retracted") return prepared;
      validateCommand(command, prepared);
      const baseline = capture(runtimeStorePath);
      assertBaseline(baseline, prepared.baseline);
      const transaction = createUnitOfWork({
        filePath: runtimeStorePath,
        liveStore,
        stageFrom: baseline.store,
        now: () => new Date(command.retractedAt),
        validatePersistedBaseline: (current) => ({
          valid: Number(current.revision ?? 0) === baseline.revision &&
            digest(current) === baseline.semanticDigest,
        }),
        lockContext: { operation: "august_10_false_training_retraction" },
      }).begin();

      await transaction.mutate((candidate) => retract(candidate, command.retractedAt));
      const commit = await transaction.commit({
        validate: (candidate) => validateCandidate(baseline.store, candidate),
      });
      const after = capture(runtimeStorePath);
      const afterClassification = classify(after.store);
      assert(afterClassification.state === "already_retracted", "post_commit_verification_failed");
      return {
        outcome: "retracted",
        committed: true,
        revision: commit.revision,
        commitId: commit.commitId,
        before: publicBaseline(baseline),
        after: publicBaseline(after),
        classification: afterClassification,
      };
    },
  });
}

export function classifyAugust10FalseTrainingRetraction(store = {}) {
  return classify(store);
}

function classify(store) {
  const target = (store.canonicalEvidenceObjects ?? []).find(
    (record) => record.canonicalId === AUGUST_10_FALSE_TRAINING_CANONICAL_ID
  );
  assert(target, "false_training_target_missing");
  const payload = target.payload ?? target;
  assert(payload.id === AUGUST_10_FALSE_TRAINING_PAYLOAD_ID, "false_training_payload_identity_changed");
  assert(String(payload.observed_at).slice(0, 10) === "2026-08-10", "false_training_date_changed");
  assert(same((payload.exercises ?? []).map((exercise) => exercise.name), EXPECTED_EXERCISES),
    "false_training_exercises_changed");
  assert((payload.exercises ?? [])[0]?.executionVariant?.label === "Static Hold",
    "false_training_variant_changed");
  const superset = (payload.exerciseRelationshipGroups ?? []).find(
    (group) => group.relationshipType === "superset"
  );
  assert(superset && same(superset.memberExerciseIds, EXPECTED_RELATIONSHIP_MEMBERS),
    "false_training_superset_changed");
  const setCount = payload.exercises.flatMap((exercise) => exercise.sets ?? []).length;
  const volume = payload.exercises.flatMap((exercise) => exercise.sets ?? [])
    .reduce((total, set) => total + Number(set.volume ?? 0), 0);
  assert(setCount === 11 && volume === 5580, "false_training_totals_changed");
  assert(target.provenance?.evidence_review_ids?.includes(AUGUST_10_FALSE_TRAINING_REVIEW_ID),
    "false_training_review_provenance_changed");
  assert(target.provenance?.evidence_package_ids?.includes(AUGUST_10_FALSE_TRAINING_PACKAGE_ID),
    "false_training_package_provenance_changed");

  const retainedSessions = (store.canonicalEvidenceObjects ?? [])
    .filter((record) => record.canonicalId !== target.canonicalId)
    .filter((record) => record.evidence_type === "training")
    .filter((record) => String(record.payload?.observed_at ?? record.lastObservedAt).slice(0, 10) === "2026-08-10")
    .filter((record) => record.quality?.status !== "superseded")
    .map(sessionAudit);
  const legitimate = retainedSessions.find(
    (session) => session.payloadId === AUGUST_10_LEGITIMATE_STRENGTH_ID
  );
  assert(legitimate, "legitimate_august_10_strength_session_missing");
  assert(same(legitimate.exercises, [
    "Seated Hip Abductions", "Hack Squats", "Leg Press (Sumo Stance)", "Single-Leg Leg Press",
  ]), "legitimate_august_10_strength_session_changed");

  const alreadyRetracted = target.quality?.status === "superseded" &&
    target.quality?.disposition === "retracted_false_proving_evidence";
  return Object.freeze({
    state: alreadyRetracted ? "already_retracted" : target.quality?.status === "active" ? "eligible" : "conflict",
    reason: alreadyRetracted ? null : target.quality?.status === "active" ? null : "false_training_status_changed",
    target: sessionAudit(target),
    relationship: { id: superset.id, type: superset.relationshipType, memberExerciseIds: [...superset.memberExerciseIds] },
    retainedSessions,
  });
}

function retract(store, retractedAt) {
  const index = store.canonicalEvidenceObjects.findIndex(
    (record) => record.canonicalId === AUGUST_10_FALSE_TRAINING_CANONICAL_ID
  );
  assert(index >= 0, "false_training_target_missing");
  const target = store.canonicalEvidenceObjects[index];
  store.canonicalEvidenceObjects[index] = {
    ...target,
    quality: {
      ...target.quality,
      status: "superseded",
      disposition: "retracted_false_proving_evidence",
      retractedAt: new Date(retractedAt).toISOString(),
      retractionReason: "Superset V1 production proving session; no represented movement occurred.",
      retractionSourceReviewId: AUGUST_10_FALSE_TRAINING_REVIEW_ID,
    },
    updatedAt: new Date(retractedAt).toISOString(),
  };
}

function validateCandidate(before, candidate) {
  const result = classify(candidate);
  assert(result.state === "already_retracted", "candidate_not_retracted");
  for (const key of Object.keys(before)) {
    if (["revision", "lastCommitId", "updatedAt"].includes(key)) continue;
    if (key === "canonicalEvidenceObjects") {
      const withoutTarget = (records) => records.filter(
        (record) => record.canonicalId !== AUGUST_10_FALSE_TRAINING_CANONICAL_ID
      );
      assert(digest(withoutTarget(before[key])) === digest(withoutTarget(candidate[key])),
        "unrelated_canonical_record_changed");
      continue;
    }
    assert(digest(before[key]) === digest(candidate[key]), `protected_state_changed:${key}`);
  }
  return { valid: true };
}

function sessionAudit(record) {
  const payload = record.payload ?? record;
  return {
    canonicalId: record.canonicalId,
    payloadId: payload.id,
    activityType: payload.metadata?.activity_type ?? "Workout",
    observedAt: payload.observed_at,
    capturedAt: payload.captured_at ?? null,
    status: record.quality?.status ?? null,
    exercises: (payload.exercises ?? []).map((exercise) => exercise.name),
    setCount: (payload.exercises ?? []).flatMap((exercise) => exercise.sets ?? []).length,
    volume: (payload.exercises ?? []).flatMap((exercise) => exercise.sets ?? [])
      .reduce((total, set) => total + Number(set.volume ?? 0), 0),
    evidencePackageIds: [...(record.provenance?.evidence_package_ids ?? [])],
    evidenceReviewIds: [...(record.provenance?.evidence_review_ids ?? [])],
  };
}

function validateCommand(command, prepared) {
  assert(command.acceptProductionMutation === true, "production_mutation_not_authorized");
  assert(command.stopOnConflict === true, "stop_on_conflict_required");
  assert(command.expectedFileHash === prepared.baseline.fileHash, "file_hash_mismatch");
  assert(Number(command.expectedRevision) === prepared.baseline.revision, "revision_mismatch");
  assert(command.expectedLastCommitId === prepared.baseline.lastCommitId, "last_commit_mismatch");
  assert(command.preparationFingerprint === prepared.fingerprint, "preparation_fingerprint_mismatch");
}

function capture(filePath) {
  const bytes = fs.readFileSync(filePath);
  const store = JSON.parse(bytes);
  return {
    store,
    fileHash: `sha256_${createHash("sha256").update(bytes).digest("hex")}`,
    semanticDigest: digest(store),
    revision: Number(store.revision ?? 0),
    lastCommitId: store.lastCommitId ?? null,
    bytes: bytes.length,
  };
}

function publicBaseline(value) {
  return { fileHash: value.fileHash, semanticDigest: value.semanticDigest, revision: value.revision,
    lastCommitId: value.lastCommitId, bytes: value.bytes };
}
function assertBaseline(actual, expected) {
  for (const key of ["fileHash", "semanticDigest", "revision", "lastCommitId", "bytes"]) {
    assert(actual[key] === expected[key], `baseline_changed:${key}`);
  }
}
function digest(value) { return createHash("sha256").update(stable(value)).digest("hex"); }
function same(left, right) { return stable(left) === stable(right); }
function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
function assert(condition, reason) { if (!condition) throw new Error(reason); }
