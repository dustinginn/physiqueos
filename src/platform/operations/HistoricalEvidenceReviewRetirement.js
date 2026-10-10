import { createHash } from "node:crypto";
import { canonicalJson } from "../../contracts/v1/canonicalJson.js";
import { produceTrainingPerformanceEvents } from "../../domain/services/TrainingPerformanceEventProducer.js";
import { haveSameTrainingPerformanceEventAchievementSemantics } from "../../domain/models/trainingPerformanceEvent.js";

const REVIEW_COLLECTION = "evidenceReviews";
const CONTINUATION_TOPIC = "evidence.review.continue";

export function planHistoricalEvidenceReviewRetirement({ facts, authorization, retiredAt } = {}) {
  const refuse = (code, detail) => Object.freeze({ outcome: "refused", code, detail });
  const row = facts?.reviewRow;
  const review = row?.payload;
  if (!row || !review) return refuse("REVIEW_MISSING", "The sealed review does not exist.");
  if (row.reviewSeal !== authorization.targetReviewMd5) return refuse("REVIEW_SEAL_MISMATCH", "Review identity changed.");
  if (review.userId !== authorization.ownerUserId) return refuse("REVIEW_OWNER_MISMATCH", "Review owner changed.");
  if (Number(row.version) !== authorization.expectedVersion || Number(review.version) !== authorization.expectedVersion) {
    return refuse("REVIEW_VERSION_MISMATCH", "Review version changed.");
  }
  if (iso(row.updatedAt) !== iso(authorization.expectedUpdatedAt) ||
      iso(review.updatedAt) !== iso(authorization.expectedPayloadUpdatedAt ?? authorization.expectedUpdatedAt)) {
    return refuse("REVIEW_UPDATED_AT_MISMATCH", "Review update fence changed.");
  }
  if (facts.reviewPayloadSha256 !== authorization.expectedPayloadSha256) return refuse("REVIEW_PAYLOAD_MISMATCH", "Review payload seal changed.");
  if (row.status !== "committing" || review.status !== "committing" || review.commitClaim?.status !== "available") {
    return refuse("REVIEW_STATE_MISMATCH", "Review is no longer the sealed stranded confirmation.");
  }
  const completedSteps = completed(review.commitProgress);
  if (JSON.stringify(completedSteps) !== JSON.stringify(authorization.expectedCompletedSteps)) {
    return refuse("REVIEW_PROGRESS_MISMATCH", "Completed checkpoints changed.");
  }
  if (facts.liveContinuationCount !== 0) return refuse("LIVE_CONTINUATION_PRESENT", "A live continuation exists.");
  if (facts.deadContinuationCount !== 1) return refuse("DEAD_CONTINUATION_MISMATCH", "The retained dead continuation audit row changed.");
  if (!facts.preservation?.canonicalSingleton || !facts.preservation?.semanticMatch || !facts.preservation?.detailsComplete) {
    return refuse("CANONICAL_WORKOUT_NOT_PRESERVED", "Canonical workout preservation proof failed.");
  }
  if (facts.preservation.canonicalWorkoutSha256 !== authorization.expectedCanonicalWorkoutSha256) {
    return refuse("CANONICAL_WORKOUT_SEAL_MISMATCH", "Canonical workout seal changed.");
  }
  if (facts.preservation.exerciseCount !== authorization.expectedExerciseCount || facts.preservation.setCount !== authorization.expectedSetCount) {
    return refuse("CANONICAL_WORKOUT_COUNT_MISMATCH", "Exercise or set count changed.");
  }
  if (!facts.preservation.performanceSemanticsMatch || facts.preservation.performanceEventCount !== authorization.expectedPerformanceEventCount) {
    return refuse("PERFORMANCE_EVENT_PROOF_FAILED", "Durable PR-event semantics are incomplete.");
  }
  if (JSON.stringify([...facts.preservation.performanceEventPayloadSha256].sort()) !==
      JSON.stringify([...authorization.expectedPerformanceEventPayloadSha256].sort())) {
    return refuse("PERFORMANCE_EVENT_SEAL_MISMATCH", "Durable PR-event seals changed.");
  }
  if (!facts.preservation.sessionHistoryContainsTarget ||
      facts.preservation.sessionHistorySha256 !== authorization.expectedSessionHistorySha256) {
    return refuse("SESSION_HISTORY_PROOF_FAILED", "Canonical session-history proof changed.");
  }
  if (!sameAggregateSeals(facts.aggregateSeals, authorization.expectedAggregateSeals)) {
    return refuse("PROTECTED_AGGREGATE_SEAL_MISMATCH", "Training, Goal, or Briefing aggregate changed before retirement.");
  }
  const at = iso(retiredAt);
  if (!at) return refuse("RETIREMENT_TIME_INVALID", "A valid retirement time is required.");
  const rollback = Object.freeze({
    priorVersion: Number(row.version),
    priorPayloadSha256: facts.reviewPayloadSha256,
    priorUpdatedAt: iso(row.updatedAt),
    priorPayloadUpdatedAt: iso(review.updatedAt),
    priorStatus: review.status,
    priorCommitError: review.commitError ?? null,
    priorCommitClaim: structuredClone(review.commitClaim ?? null),
    priorProcessingReliability: structuredClone(review.processingReliability ?? null),
  });
  const payload = {
    ...structuredClone(review),
    version: Number(row.version) + 1,
    status: "retired",
    commitError: "Historical continuation retired after canonical Training and performance preservation proof; no checkpoint replayed.",
    commitClaim: {
      ...(review.commitClaim ?? {}),
      status: "failed",
      failedAt: at,
      leaseExpiresAt: at,
      retirementReason: "historical_confirmation_safely_retired",
    },
    processingReliability: {
      ...(review.processingReliability ?? {}),
      state: "operator_retired",
      retiredAt: at,
      retirementReason: "historical_confirmation_safely_retired",
      authorizationReference: authorization.authorizationReference,
      rollbackAnchor: rollback,
      preservation: {
        canonicalWorkoutSha256: facts.preservation.canonicalWorkoutSha256,
        exerciseCount: facts.preservation.exerciseCount,
        setCount: facts.preservation.setCount,
        performanceEventCount: facts.preservation.performanceEventCount,
        performanceEventPayloadSha256: [...facts.preservation.performanceEventPayloadSha256].sort(),
        sessionHistorySha256: facts.preservation.sessionHistorySha256,
      },
    },
    updatedAt: at,
  };
  return Object.freeze({
    outcome: "retire",
    before: Object.freeze({ version: Number(row.version), status: row.status, updatedAt: iso(row.updatedAt), payloadSha256: facts.reviewPayloadSha256 }),
    after: Object.freeze({ version: payload.version, status: payload.status, updatedAt: at, payloadSha256: sha256(payload) }),
    payload: Object.freeze(payload),
    rollbackAnchor: rollback,
    protectedAggregateSeals: facts.aggregateSeals,
  });
}

export async function runHistoricalEvidenceReviewRetirement({
  query,
  authorization,
  apply = false,
  now = () => new Date(),
  loadFacts = loadHistoricalEvidenceReviewRetirementFacts,
} = {}) {
  const facts = await loadFacts({ query, authorization, lockReview: apply });
  const plan = planHistoricalEvidenceReviewRetirement({ facts, authorization, retiredAt: now() });
  if (plan.outcome !== "retire") return Object.freeze({ mode: apply ? "apply" : "dry-run", ...plan });
  if (!apply) return sanitizeResult({ mode: "dry-run", outcome: "ready", plan, facts });
  const updated = await query(
    `UPDATE physiqueos.canonical_evidence_records SET
       version=$4,status='retired',payload=$5::jsonb,updated_at=$6::timestamptz
     WHERE owner_user_id=$1 AND collection_name=$2 AND md5(record_id)=$3
       AND version=$7
       AND updated_at >= $8::timestamptz
       AND updated_at < ($8::timestamptz + interval '1 millisecond')
       AND status='committing'
       AND payload=$9::jsonb
     RETURNING version,status,updated_at,payload`,
    [authorization.ownerUserId, REVIEW_COLLECTION, authorization.targetReviewMd5,
      plan.after.version, JSON.stringify(plan.payload), plan.after.updatedAt,
      plan.before.version, plan.before.updatedAt, JSON.stringify(facts.reviewRow.payload)],
  );
  if (updated.rowCount !== 1) throw coded("REVIEW_CHANGED_AFTER_SEAL");
  return sanitizeResult({ mode: "apply", outcome: "applied", plan, facts, updated: updated.rows[0] });
}

export async function loadHistoricalEvidenceReviewRetirementFacts({ query, authorization, lockReview = false } = {}) {
  const reviewResult = await query(
    `SELECT record_id,version,status,created_at,updated_at,payload,md5(record_id) AS review_seal
       FROM physiqueos.canonical_evidence_records
      WHERE owner_user_id=$1 AND collection_name=$2 AND md5(record_id)=$3
      ${lockReview ? "FOR UPDATE" : ""}`,
    [authorization.ownerUserId, REVIEW_COLLECTION, authorization.targetReviewMd5],
  );
  if (reviewResult.rowCount !== 1) return { reviewRow: null };
  const raw = reviewResult.rows[0];
  const reviewRow = {
    ...raw,
    reviewSeal: raw.review_seal,
    updatedAt: raw.updated_at,
  };
  const review = reviewRow.payload;
  const trainingItems = (review?.interpretedEvidence?.evidence_objects ?? [])
    .filter((item) => item.evidence_type === "training" && item.removed !== true);
  const trainingItem = trainingItems[0] ?? null;
  const packageId = String(review?.interpretedEvidence?.package_id ?? review?.interpretedEvidence?.id ?? "");
  const canonicalResult = trainingItem && packageId ? await query(
    `SELECT record_id,version,status,occurrence_date,observed_at,created_at,updated_at,payload
       FROM physiqueos.canonical_evidence_records
      WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
        AND payload->>'evidence_type'='training'
        AND ((payload#>'{provenance,evidence_package_ids}') ? $2
          OR (payload#>'{provenance,contributing_evidence_object_ids}') ? $3)
      ORDER BY updated_at LIMIT 8`,
    [authorization.ownerUserId, packageId, String(trainingItem.id ?? "")],
  ) : { rows: [] };
  const activeCanonical = canonicalResult.rows.filter((row) => row.payload?.quality?.status === "active");
  const canonicalRow = activeCanonical[0] ?? null;
  const canonicalSession = canonicalRow?.payload?.payload ?? canonicalRow?.payload ?? null;
  const canonicalSemantics = sessionSemantics(canonicalSession);
  const reviewSemantics = sessionSemantics(trainingItem);
  const completeness = workoutCompleteness(canonicalSession);
  const canonicalId = String(canonicalRow?.payload?.canonicalId ?? canonicalRow?.record_id ?? "");
  const targetSessionId = String(canonicalSession?.id ?? canonicalRow?.record_id ?? "");

  const analysisResult = canonicalRow ? await query(
    `SELECT record_id,version,status,created_at,updated_at,payload
       FROM physiqueos.canonical_confidence_records
      WHERE owner_user_id=$1 AND collection_name='analyses'
        AND ((created_at>='2026-09-14T00:00:00Z'::timestamptz
          AND created_at<'2026-09-15T00:00:00Z'::timestamptz
          AND payload#>'{metadata,trainingPerformance}' IS NOT NULL)
          OR (payload->'evidenceIds') ? $2)
      ORDER BY record_id LIMIT 32`,
    [authorization.ownerUserId, canonicalId],
  ) : { rows: [] };
  const performanceResult = canonicalRow ? await query(
    `SELECT record_id,version,status,created_at,updated_at,payload
       FROM physiqueos.canonical_training_records
      WHERE owner_user_id=$1 AND collection_name='trainingPerformanceEvents'
        AND (payload->>'sourceCanonicalTrainingId'=$2 OR payload->>'sourceSessionId'=$3
          OR payload->>'sourceReviewId'=$4 OR payload->>'sourceEvidencePackageId'=$5)
      ORDER BY record_id LIMIT 64`,
    [authorization.ownerUserId, canonicalId, targetSessionId, reviewRow.record_id, packageId],
  ) : { rows: [] };
  const performanceEvents = performanceResult.rows.map((row) => row.payload);
  const analysisMatch = findSemanticPerformanceAnalysis({
    analyses: analysisResult.rows.map((row) => row.payload),
    canonicalSession: canonicalRow?.payload,
    performanceEvents,
    reviewId: reviewRow.record_id,
    packageId,
  });

  const historyResult = canonicalRow ? await query(
    `SELECT record_id,COALESCE(occurrence_date,
              NULLIF(left(payload#>>'{payload,observed_at}',10),'')::date,
              NULLIF(left(payload->>'observed_at',10),'')::date) AS occurrence_date,payload
       FROM physiqueos.canonical_evidence_records
      WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
        AND payload->>'evidence_type'='training'
        AND COALESCE(payload#>>'{quality,status}','active')='active'
        AND COALESCE(occurrence_date,
              NULLIF(left(payload#>>'{payload,observed_at}',10),'')::date,
              NULLIF(left(payload->>'observed_at',10),'')::date)<=$2::date
      ORDER BY occurrence_date DESC,record_id LIMIT 64`,
    [authorization.ownerUserId, canonicalSemantics.observedDate],
  ) : { rows: [] };
  const targetExercises = new Set(canonicalSemantics.exercises.map((item) => item.identity));
  const relevantHistory = historyResult.rows.filter((row) =>
    sessionSemantics(row.payload?.payload ?? row.payload).exercises.some((item) => targetExercises.has(item.identity))
  );
  const outbox = await query(
    `SELECT id,status,attempt_count,created_at,updated_at
       FROM physiqueos.outbox_messages
      WHERE user_id=$1 AND topic=$2 AND payload->>'reviewId'=$3
      ORDER BY created_at ${lockReview ? "FOR UPDATE" : ""}`,
    [authorization.ownerUserId, CONTINUATION_TOPIC, reviewRow.record_id],
  );
  const aggregateSeals = {
    goals: await aggregateSeal(query, "canonical_goal_records", authorization.ownerUserId),
    briefings: await aggregateSeal(query, "canonical_briefing_records", authorization.ownerUserId),
    training: await aggregateSeal(query, "canonical_training_records", authorization.ownerUserId),
  };
  return {
    reviewRow,
    reviewPayloadSha256: sha256(review),
    liveContinuationCount: outbox.rows.filter((row) => ["pending", "processing"].includes(row.status)).length,
    deadContinuationCount: outbox.rows.filter((row) => row.status === "dead").length,
    aggregateSeals,
    preservation: {
      canonicalSingleton: activeCanonical.length === 1 && canonicalResult.rows.length === 1,
      semanticMatch: canonicalJson(reviewSemantics) === canonicalJson(canonicalSemantics),
      detailsComplete: completeness.exerciseCount > 0 && completeness.setCount > 0 &&
        completeness.exercisesWithIdentity === completeness.exerciseCount &&
        completeness.setsWithReps === completeness.setCount &&
        completeness.setsWithLoad === completeness.setCount &&
        completeness.setsWithLoadUnit === completeness.setCount,
      canonicalWorkoutSha256: canonicalRow ? sha256(canonicalRow.payload) : null,
      exerciseCount: completeness.exerciseCount,
      setCount: completeness.setCount,
      performanceSemanticsMatch: analysisMatch.matched,
      performanceAnalysisSha256: analysisMatch.analysis ? sha256(analysisMatch.analysis) : null,
      performanceEventCount: performanceEvents.length,
      performanceEventPayloadSha256: performanceEvents.map(sha256).sort(),
      sessionHistoryContainsTarget: relevantHistory.some((row) => row.record_id === canonicalRow?.record_id),
      sessionHistoryCount: relevantHistory.length,
      sessionHistorySha256: sha256(relevantHistory.map((row) => ({
        id: row.record_id,
        // The original sealed read normalized PostgreSQL Date objects as an
        // empty JSON object. The actual workout date remains present in the
        // normalized session semantics below, so the seal still covers it.
        date: {},
        semantics: sessionSemantics(row.payload?.payload ?? row.payload),
      }))),
    },
  };
}

function findSemanticPerformanceAnalysis({ analyses, canonicalSession, performanceEvents, reviewId, packageId }) {
  for (const analysis of analyses) {
    try {
      const expected = produceTrainingPerformanceEvents({
        canonicalTrainingSession: canonicalSession,
        trainingAnalysis: analysis,
        sourceReviewId: reviewId,
        sourceEvidencePackageId: packageId,
        now: () => new Date(analysis.createdAt),
      });
      if (expected.length !== performanceEvents.length) continue;
      const byId = new Map(performanceEvents.map((event) => [event.id, event]));
      if (expected.every((event) => {
        const persisted = byId.get(event.id);
        return persisted && haveSameTrainingPerformanceEventAchievementSemantics(persisted, event);
      })) return { matched: true, analysis, expected };
    } catch { /* This analysis is not a complete source for the target session. */ }
  }
  return { matched: false, analysis: null, expected: [] };
}

async function aggregateSeal(query, table, ownerUserId) {
  const result = await query(
    `SELECT count(*)::int AS count,
            md5(COALESCE(string_agg(collection_name||'|'||record_id||'|'||version::text||'|'||payload::text,
              '|' ORDER BY collection_name,record_id),'')) AS digest
       FROM physiqueos.${table} WHERE owner_user_id=$1`,
    [ownerUserId],
  );
  return { count: Number(result.rows[0]?.count ?? 0), digest: result.rows[0]?.digest ?? null };
}

function sanitizeResult({ mode, outcome, plan, facts, updated = null }) {
  return Object.freeze({
    mode,
    outcome,
    rowsChanged: updated ? 1 : 0,
    reviewReference: facts.reviewRow.reviewSeal.slice(0, 12),
    before: plan.before,
    after: plan.after,
    rollbackAnchor: {
      priorVersion: plan.rollbackAnchor.priorVersion,
      priorPayloadSha256: plan.rollbackAnchor.priorPayloadSha256,
      priorUpdatedAt: plan.rollbackAnchor.priorUpdatedAt,
      priorStatus: plan.rollbackAnchor.priorStatus,
      priorClaimStatus: plan.rollbackAnchor.priorCommitClaim?.status ?? null,
    },
    preservation: {
      canonicalWorkoutSha256: facts.preservation.canonicalWorkoutSha256,
      exerciseCount: facts.preservation.exerciseCount,
      setCount: facts.preservation.setCount,
      performanceEventCount: facts.preservation.performanceEventCount,
      performanceSemanticsMatch: facts.preservation.performanceSemanticsMatch,
      sessionHistoryContainsTarget: facts.preservation.sessionHistoryContainsTarget,
      sessionHistoryCount: facts.preservation.sessionHistoryCount,
      sessionHistorySha256: facts.preservation.sessionHistorySha256,
    },
    protectedAggregateSeals: plan.protectedAggregateSeals,
    deadContinuationRetainedForAudit: facts.deadContinuationCount,
  });
}

function sessionSemantics(session = {}) {
  return {
    observedDate: String(session?.observed_at ?? session?.observedAt ?? session?.date ?? "").slice(0, 10),
    startedAt: session?.started_at ?? session?.startedAt ?? null,
    endedAt: session?.ended_at ?? session?.endedAt ?? null,
    exercises: (session?.exercises ?? []).map((exercise) => ({
      identity: exerciseIdentity(exercise),
      sets: (exercise.sets ?? []).map((set) => ({
        reps: finite(set.reps ?? set.repetitions),
        load: finite(set.load?.value ?? set.load ?? set.weight?.value ?? set.weight ?? set.weight_value),
        loadUnit: String(set.load?.unit ?? set.loadUnit ?? set.load_unit ?? set.weight?.unit ?? set.weight_unit ?? set.unit ?? "").toLowerCase() || null,
        durationSeconds: finite(set.duration_seconds ?? set.durationSeconds),
        distance: finite(set.distance?.value ?? set.distance),
      })),
    })),
  };
}

function workoutCompleteness(session = {}) {
  const exercises = session?.exercises ?? [];
  const sets = exercises.flatMap((exercise) => exercise.sets ?? []);
  return {
    exerciseCount: exercises.length,
    setCount: sets.length,
    exercisesWithIdentity: exercises.filter((exercise) => Boolean(exerciseIdentity(exercise))).length,
    setsWithReps: sets.filter((set) => finite(set.reps ?? set.repetitions) !== null).length,
    setsWithLoad: sets.filter((set) => finite(set.load?.value ?? set.load ?? set.weight?.value ?? set.weight ?? set.weight_value) !== null).length,
    setsWithLoadUnit: sets.filter((set) => Boolean(String(set.load?.unit ?? set.loadUnit ?? set.load_unit ?? set.weight?.unit ?? set.weight_unit ?? set.unit ?? "").trim())).length,
  };
}

function exerciseIdentity(exercise = {}) {
  return String(exercise.canonicalExerciseId ?? exercise.canonical_exercise_id ?? exercise.exercise_id ?? exercise.id ?? "").trim() ||
    String(exercise.canonicalExerciseName ?? exercise.name ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function finite(value) { return Number.isFinite(Number(value)) ? Number(value) : null; }
function completed(progress = {}) { return Object.entries(progress).filter(([, value]) => value?.status === "completed").map(([key]) => key).sort(); }
function sha256(value) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
function iso(value) { const time = new Date(value).getTime(); return Number.isFinite(time) ? new Date(time).toISOString() : null; }
function sameAggregateSeals(actual = {}, expected = {}) { return ["goals", "briefings", "training"].every((key) => Number(actual[key]?.count) === Number(expected[key]?.count) && actual[key]?.digest === expected[key]?.digest); }
function coded(code) { return Object.assign(new Error(code), { code }); }
