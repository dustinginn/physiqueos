import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  createFounderStoreUnitOfWork,
  FounderStoreUnitOfWorkErrorCode,
} from "../../data/repositories/FounderStoreUnitOfWork";
import {
  createFounderRuntimeFileHash,
  createFounderRuntimeSemanticDigest,
} from "./FounderRuntimeSemanticDigest";
import { reconcileConfirmedEvidencePackage } from "./CanonicalEvidenceService";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import { produceTrainingPerformanceEvents } from "./TrainingPerformanceEventProducer";

export const JULY_27_STRENGTH_REPAIR_MODEL =
  "july_27_strength_typed_reference_canonical_repair_v1";
export const JULY_25_STRENGTH_RECONSTRUCTION_MODEL =
  "july_25_strength_record_reconstruction_v1";
export const JULY_27_STRENGTH_REPAIR_REASON =
  "Repair canonical Training history corrupted by package-local typed evidence identity reuse.";
export const JULY_27_MALFORMED_CANONICAL_ID =
  "training|authoritative|IMG_1688.png|typed_evidence_0";
export const JULY_27_CORRECTED_CANONICAL_ID =
  "training|authoritative|IMG_1688.png";
export const JULY_27_REPAIR_MARKER_ID = JULY_27_STRENGTH_REPAIR_MODEL;

export const JULY_27_STRENGTH_RESTORE_IDS = Object.freeze([
  "training|2026-07-04|traditional strength training|||||197",
  "training|2026-07-05|traditional strength training|||3909||454",
  "training|2026-07-06|traditional strength training|||3361||237",
  "training|2026-07-07|traditional strength training|||3623||284",
  "training|2026-07-08|traditional strength training|||||",
  "training|2026-07-09|traditional strength training|||3099||216",
  "training|2026-07-09|core training|||2615||272",
  "training|2026-07-10|traditional strength training|||3995||385",
  "training|2026-07-11|traditional strength training|||3871||363",
  "training|2026-07-12|traditional strength training|||4602||483|repair|seated_cable_row_v1",
  "training|2026-07-13|traditional strength training|||3276||234",
  "training|2026-07-14|traditional strength training|||3547||494",
  "training|2026-07-15|traditional strength training|||4512||337",
  "training|2026-07-16|traditional strength training|||4032||286",
  "training|2026-07-17|traditional strength training|||5533||500",
  "training|2026-07-18|traditional strength training|||4786||450",
  "training|2026-07-19|traditional strength training|||4738||404",
  "training|2026-07-21|traditional strength training|||3421||468",
  "training|2026-07-22|traditional strength training|||4846||343",
  "training|2026-07-23|traditional strength training|||4684||421",
  "training|2026-07-24|traditional strength training|||5392||383",
  "training|2026-07-25|traditional strength training|||6108||527",
]);

export const JULY_27_STRENGTH_REPAIR_BASELINE = Object.freeze({
  fileHash: "88F61D8564B0D491AC948C71F28EBD325D66993BAD125396FAD8CF28D7DF198C",
  semanticDigest: "B5E31CD23839A976640A38ECF45DD38D381DF175F75903FC8651F4A273C957E8",
  revision: 33,
  lastCommitId: "79a6019e-1a5a-4be0-8d67-90ea10caebcc",
  fileSize: 14915926,
  modifiedAt: "2026-07-27T16:49:55.8161855-07:00",
});

export const July27StrengthRepairState = Object.freeze({
  ELIGIBLE: "eligible_for_preparation",
  ALREADY_REPAIRED: "already_repaired",
  MALFORMED_MISSING: "malformed_aggregate_missing",
  MALFORMED_AMBIGUOUS: "malformed_aggregate_ambiguous",
  REVIEW_MISSING: "review_lineage_missing",
  RESTORE_MISMATCH: "historical_restore_set_mismatch",
  RECORD_22_UNVERIFIED: "record_22_reconstruction_unverified",
  CORRECTED_EXISTS: "corrected_session_already_exists",
  EVENT_CONFLICT: "performance_event_conflict",
  PROTECTED_DRIFT: "protected_state_drift",
  UNEXPECTED: "unexpected_state",
});

export function createJuly27StrengthTypedReferenceRepairInvariantService() {
  return {
    classify({ store, baseline, backupStore }) {
      return classifyRepairState({ store, baseline, backupStore });
    },
  };
}

export function createJuly27StrengthTypedReferenceCanonicalRepairService({
  runtimeStorePath,
  liveStore,
  backupStore,
  backupIdentity,
  readPersistedStore = () =>
    JSON.parse(fs.readFileSync(runtimeStorePath, "utf8")),
  readPersistedBytes = () => fs.readFileSync(runtimeStorePath),
  readPersistedStat = () => fs.statSync(runtimeStorePath),
  now = () => new Date(),
  createUnitOfWork = (options) => createFounderStoreUnitOfWork(options),
} = {}) {
  function captureBaseline(store = readPersistedStore()) {
    const bytes = readPersistedBytes();
    const stat = readPersistedStat();
    return {
      fileHash: createFounderRuntimeFileHash(bytes),
      semanticDigest: createFounderRuntimeSemanticDigest(store),
      revision: store.revision,
      lastCommitId: store.lastCommitId,
      fileSize: bytes.length,
      modifiedAt: stat.mtime.toISOString(),
    };
  }

  function audit() {
    const store = readPersistedStore();
    const baseline = captureBaseline(store);
    const classification = classifyRepairState({
      store,
      baseline,
      backupStore,
    });
    return { baseline, classification };
  }

  function prepare({ preparedAt = now().toISOString() } = {}) {
    const store = readPersistedStore();
    const baseline = captureBaseline(store);
    const classification = classifyRepairState({
      store,
      baseline,
      backupStore,
    });
    if (classification.state === July27StrengthRepairState.ALREADY_REPAIRED) {
      return {
        outcome: "already_repaired",
        classification,
        fingerprint: classification.marker?.fingerprint ?? null,
      };
    }
    assertState(
      classification.state === July27StrengthRepairState.ELIGIBLE,
      classification.state
    );

    const restoration = buildRestoration({
      store,
      backupStore,
      backupIdentity,
      malformedAggregate: classification.malformedAggregate,
    });
    const correctedSession = buildCorrectedSession({
      store,
      restorationRecords: restoration.records,
    });
    const candidateWithoutEvents = applyCanonicalRepair({
      store,
      restorationRecords: restoration.records,
      correctedSession,
    });
    const events = buildEvents({
      store: candidateWithoutEvents,
      correctedSession,
      review: classification.reuploadReview,
    });
    const existingEventsById = new Map(
      (store.trainingPerformanceEvents ?? []).map((event) => [event.id, event])
    );
    assertState(
      events.every((event) => !existingEventsById.has(event.id)),
      July27StrengthRepairState.EVENT_CONFLICT
    );
    const protectedStateDigest = digest(protectedState(store));
    const fingerprintInput = {
      migrationModel: JULY_27_STRENGTH_REPAIR_MODEL,
      reason: JULY_27_STRENGTH_REPAIR_REASON,
      baseline,
      malformedAggregateDigest: digest(classification.malformedAggregate),
      restoreIds: JULY_27_STRENGTH_RESTORE_IDS,
      backupProofs: restoration.backupProofs,
      record22ProofDigest: digest(restoration.record22Proof),
      correctedCanonicalDigest: digest(correctedSession),
      eventDigests: events.map(digest),
      protectedStateDigest,
    };
    const fingerprint = digest(fingerprintInput);
    const auditRecord = {
      id: JULY_27_REPAIR_MARKER_ID,
      schemaVersion: JULY_27_STRENGTH_REPAIR_MODEL,
      type: JULY_27_STRENGTH_REPAIR_MODEL,
      reason: JULY_27_STRENGTH_REPAIR_REASON,
      fingerprint,
      baselineRevision: baseline.revision,
      baselineSemanticDigest: baseline.semanticDigest,
      malformedAggregateId: JULY_27_MALFORMED_CANONICAL_ID,
      restoredCanonicalIds: [...JULY_27_STRENGTH_RESTORE_IDS],
      backupRestoration: {
        source: backupIdentity,
        canonicalIds: JULY_27_STRENGTH_RESTORE_IDS.slice(0, 21),
      },
      record22Reconstruction: restoration.record22Proof,
      correctedCanonicalId: JULY_27_CORRECTED_CANONICAL_ID,
      eventIds: events.map((event) => event.id),
      changedFieldAllowlist: [
        "canonicalEvidenceObjects",
        "trainingPerformanceEvents",
        "migrationMarkers",
        "revision",
        "lastCommitId",
        "updatedAt",
      ],
      protectedStateDigest,
      limitations: [
        "Record 22 has no independent pre-corruption backup.",
        "Record 22 updatedAt is preserved rather than reconstructed.",
      ],
      preparedAt,
      executedAt: null,
      executionCommitId: null,
      executionRevision: null,
    };
    const candidate = structuredClone(candidateWithoutEvents);
    candidate.trainingPerformanceEvents = [
      ...(candidate.trainingPerformanceEvents ?? []),
      ...structuredClone(events),
    ];
    candidate.migrationMarkers = [
      ...(candidate.migrationMarkers ?? []),
      structuredClone(auditRecord),
    ];
    validateCandidate({
      before: store,
      candidate,
      correctedSession,
      events,
      restoration,
    });

    return {
      outcome: "prepared",
      baseline,
      classification,
      restoration,
      correctedSession,
      events,
      eventIds: events.map((event) => event.id),
      fingerprint,
      fingerprintInput,
      auditRecord,
      candidate,
      plan: {
        removeMalformedAggregates: 1,
        restoreHistoricalRecords: 22,
        backupRestoredRecords: 21,
        semanticallyReconstructedRecords: 1,
        createCanonicalSessions: 1,
        createPerformanceEvents: 6,
        createRepairAudits: 1,
        correctedCanonicalId: correctedSession.canonicalId,
        correctedExerciseCount: correctedSession.payload.exercises.length,
        correctedSetCount: correctedSession.payload.exercises.reduce(
          (total, exercise) => total + exercise.sets.length,
          0
        ),
        eventIds: events.map((event) => event.id),
        postRepairCounts: getRepairCounts(candidate),
      },
    };
  }

  async function execute(command) {
    const prepared = prepare({ preparedAt: command?.preparedAt });
    if (prepared.outcome === "already_repaired") {
      return {
        outcome: "already_repaired",
        committed: false,
        fingerprint: prepared.fingerprint,
      };
    }
    validateExecutionCommand(command, prepared);
    const transaction = createUnitOfWork({
      filePath: runtimeStorePath,
      liveStore,
      stageFrom: readPersistedStore(),
      binding: {
        storeIdentity: "founder_runtime_store",
        storeKind: "production",
        isolated: false,
        productionAllowed: true,
      },
      now,
      validatePersistedBaseline(current) {
        return baselineMatches(
          captureBaselineFromStoreAndBytes(
            current,
            readPersistedBytes(),
            readPersistedStat()
          ),
          prepared.baseline
        );
      },
    }).begin();
    try {
      await transaction.mutate((staged) => {
        replaceArray(staged, "canonicalEvidenceObjects", prepared.candidate);
        replaceArray(staged, "trainingPerformanceEvents", prepared.candidate);
        replaceArray(staged, "migrationMarkers", prepared.candidate);
      });
      const committed = await transaction.commit({
        finalizeCandidate({ stagedState, candidateRevision, commitId }) {
          const marker = stagedState.migrationMarkers.find(
            (item) => item.id === JULY_27_REPAIR_MARKER_ID
          );
          marker.executedAt = now().toISOString();
          marker.executionCommitId = commitId;
          marker.executionRevision = candidateRevision;
        },
        validateFinalized(stagedState) {
          return (
            getRepairCounts(stagedState).july27Training === 4 &&
            getRepairCounts(stagedState).performanceEvents === 17 &&
            stagedState.migrationMarkers.filter(
              (item) => item.id === JULY_27_REPAIR_MARKER_ID
            ).length === 1
          );
        },
      });
      return {
        outcome: "repaired",
        committed: true,
        previousRevision: committed.expectedRevision,
        revision: committed.revision,
        commitId: committed.commitId,
        fingerprint: prepared.fingerprint,
      };
    } catch (error) {
      return {
        outcome:
          error?.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT
            ? "concurrency_conflict"
            : error?.committed
              ? "publication_failure"
              : "persistence_failure",
        committed: error?.committed === true,
        reason: error?.message,
        commitId: error?.commitId ?? null,
      };
    }
  }

  return { audit, captureBaseline, prepare, execute };
}

export function classifyRepairState({ store, baseline, backupStore }) {
  try {
    const markers = (store.migrationMarkers ?? []).filter(
      (item) => item.id === JULY_27_REPAIR_MARKER_ID
    );
    const corrected = (store.canonicalEvidenceObjects ?? []).filter(
      (item) => item.canonicalId === JULY_27_CORRECTED_CANONICAL_ID
    );
    const malformed = (store.canonicalEvidenceObjects ?? []).filter(
      (item) => item.canonicalId === JULY_27_MALFORMED_CANONICAL_ID
    );
    if (markers.length === 1 && corrected.length === 1 && malformed.length === 0) {
      return {
        state: July27StrengthRepairState.ALREADY_REPAIRED,
        marker: markers[0],
      };
    }
    if (!baselineMatches(baseline, JULY_27_STRENGTH_REPAIR_BASELINE)) {
      return { state: July27StrengthRepairState.PROTECTED_DRIFT };
    }
    if (malformed.length === 0) {
      return { state: July27StrengthRepairState.MALFORMED_MISSING };
    }
    if (malformed.length !== 1) {
      return { state: July27StrengthRepairState.MALFORMED_AMBIGUOUS };
    }
    if (corrected.length) {
      return { state: July27StrengthRepairState.CORRECTED_EXISTS };
    }
    validateMalformedAggregate(malformed[0]);
    const lineage = validateReviewLineage(store);
    const restoreRecords = JULY_27_STRENGTH_RESTORE_IDS.map((id) =>
      (store.canonicalEvidenceObjects ?? []).find(
        (item) => item.canonicalId === id
      )
    );
    if (
      restoreRecords.some((item) => !item) ||
      !sameStrings(
        lineage.originalReview.commitProgress.canonical_commit.result
          .supersededCanonicalIds,
        JULY_27_STRENGTH_RESTORE_IDS
      ) ||
      restoreRecords.some(
        (item) =>
          item.quality?.status !== "superseded" ||
          item.quality?.supersededBy !== JULY_27_MALFORMED_CANONICAL_ID
      )
    ) {
      return { state: July27StrengthRepairState.RESTORE_MISMATCH };
    }
    const backupRecords = JULY_27_STRENGTH_RESTORE_IDS.slice(0, 21).map(
      (id) =>
        (backupStore?.canonicalEvidenceObjects ?? []).find(
          (item) => item.canonicalId === id
        )
    );
    if (backupRecords.some((item) => !item)) {
      return { state: July27StrengthRepairState.RESTORE_MISMATCH };
    }
    const record22 = restoreRecords[21];
    if (
      !record22.createdAt ||
      record22.payload?.observed_at !== "2026-07-25" ||
      !(record22.provenance?.evidence_package_ids ?? []).includes(
        "evidence_submission_20260726021441961_images"
      )
    ) {
      return { state: July27StrengthRepairState.RECORD_22_UNVERIFIED };
    }
    validateCardio(store);
    return {
      state: July27StrengthRepairState.ELIGIBLE,
      malformedAggregate: malformed[0],
      restoreRecords,
      ...lineage,
    };
  } catch (error) {
    return {
      state: error.repairState ?? July27StrengthRepairState.UNEXPECTED,
      reason: error.message,
    };
  }
}

function buildRestoration({
  store,
  backupStore,
  backupIdentity,
  malformedAggregate,
}) {
  const currentById = new Map(
    store.canonicalEvidenceObjects.map((item) => [item.canonicalId, item])
  );
  const backupById = new Map(
    backupStore.canonicalEvidenceObjects.map((item) => [
      item.canonicalId,
      item,
    ])
  );
  const records = [];
  const backupProofs = [];
  for (const id of JULY_27_STRENGTH_RESTORE_IDS.slice(0, 21)) {
    const current = currentById.get(id);
    const backup = backupById.get(id);
    assertState(Boolean(current && backup), "historical_restore_set_mismatch");
    assertState(
      digest(current.payload) === digest(backup.payload) &&
        digest(current.provenance) === digest(backup.provenance) &&
        backup.quality?.status === "active",
      "historical_restore_set_mismatch"
    );
    records.push(structuredClone(backup));
    backupProofs.push({
      canonicalId: id,
      payloadDigest: digest(backup.payload),
      provenanceDigest: digest(backup.provenance),
      recordDigest: digest(backup),
      backupIdentity,
    });
  }
  const record22 = currentById.get(JULY_27_STRENGTH_RESTORE_IDS[21]);
  assertState(
    record22?.quality?.supersededBy === malformedAggregate.canonicalId &&
      record22?.payload?.observed_at === "2026-07-25",
    "record_22_reconstruction_unverified"
  );
  const reconstructed22 = {
    ...structuredClone(record22),
    quality: { status: "active" },
  };
  const record22Proof = {
    model: JULY_25_STRENGTH_RECONSTRUCTION_MODEL,
    classification: "audited_semantic_reconstruction",
    canonicalId: record22.canonicalId,
    payloadDigest: digest(record22.payload),
    provenanceDigest: digest(record22.provenance),
    createdAt: record22.createdAt,
    observedDate: record22.payload.observed_at,
    preservedUpdatedAt: record22.updatedAt,
    corruptedSupersededBy: record22.quality.supersededBy,
    changedFields: ["quality.status", "quality.reason", "quality.supersededBy", "quality.supersededAt"],
    rationale:
      "The canonical commit audit proves this record was active immediately before the faulty aggregate superseded it.",
    limitation:
      "No independent pre-corruption backup contains record 22; updatedAt is preserved without claiming byte restoration.",
  };
  records.push(reconstructed22);
  return { records, backupProofs, record22Proof };
}

function buildCorrectedSession({ store, restorationRecords }) {
  const packages = [
    "evidence_submission_20260727161048228_images",
    "evidence_submission_20260727234925525_images",
  ].map((id) =>
    store.evidencePackages.find((item) => item.package_id === id)
  );
  assertState(packages.every(Boolean), "review_lineage_missing");
  let objects = structuredClone(restorationRecords);
  for (const evidencePackage of packages) {
    const strengthObjects = evidencePackage.evidence_objects.filter((item) =>
      /traditional strength training/i.test(item.metadata?.activity_type ?? "")
    );
    const result = reconcileConfirmedEvidencePackage({
      evidencePackage: {
        ...evidencePackage,
        evidence_objects: strengthObjects,
      },
      existingCanonicalObjects: objects,
      userId: store.user.id,
      mutationReason: JULY_27_STRENGTH_REPAIR_MODEL,
    });
    const byId = new Map(objects.map((item) => [item.canonicalId, item]));
    result.changedObjects.forEach((item) => byId.set(item.canonicalId, item));
    objects = [...byId.values()];
  }
  const corrected = objects.find(
    (item) => item.canonicalId === JULY_27_CORRECTED_CANONICAL_ID
  );
  assertState(Boolean(corrected), "corrected_session_builder_failed");
  const createdAt =
    store.evidenceReviews.find(
      (item) => item.id === "evidence_review_20260727234945923"
    ).confirmation.confirmedAt;
  corrected.createdAt = createdAt;
  corrected.updatedAt = createdAt;
  validateCorrectedSession(corrected);
  return corrected;
}

function buildEvents({ store, correctedSession, review }) {
  const report = createTrainingPerformanceIntelligenceReport({
    canonicalObjects: store.canonicalEvidenceObjects,
    now: "2026-07-27T23:59:59.999Z",
    generatedAt: "2026-07-27T23:59:59.999Z",
  });
  const events = produceTrainingPerformanceEvents({
    canonicalTrainingSession: correctedSession,
    trainingAnalysis: {
      id: "analysis_training_evidence_submission_20260727234925525_images",
      metadata: { trainingPerformance: report },
    },
    sourceReviewId: review.id,
    sourceEvidencePackageId:
      "evidence_submission_20260727234925525_images",
    now: () => new Date(review.confirmation.confirmedAt),
  });
  const expected = [
    ["cable_machine_front_raise", "session_volume_pr", 6240, 5470, null],
    ["shoulder_press_machine", "reps_at_load_pr", 15, 10, 140],
    ["shoulder_press_machine", "reps_at_load_pr", 9, 8, 150],
    ["shoulder_press_machine", "reps_at_load_pr", 11, 10, 140],
    ["cable_machine_front_raise", "reps_at_load_pr", 12, 10, 130],
    ["shoulder_press_machine", "session_volume_pr", 6390, 5960, null],
  ];
  assertState(
    JSON.stringify(
      events.map((item) => [
        item.canonicalExerciseId,
        item.eventType,
        item.currentValue,
        item.previousBaselineValue,
        item.load,
      ])
    ) === JSON.stringify(expected),
    "performance_event_conflict"
  );
  return events;
}

function applyCanonicalRepair({
  store,
  restorationRecords,
  correctedSession,
}) {
  const candidate = structuredClone(store);
  const replacements = new Map(
    restorationRecords.map((item) => [item.canonicalId, item])
  );
  candidate.canonicalEvidenceObjects = candidate.canonicalEvidenceObjects
    .filter((item) => item.canonicalId !== JULY_27_MALFORMED_CANONICAL_ID)
    .map((item) =>
      replacements.has(item.canonicalId)
        ? structuredClone(replacements.get(item.canonicalId))
        : item
    );
  candidate.canonicalEvidenceObjects.push(structuredClone(correctedSession));
  return candidate;
}

function validateCandidate({
  before,
  candidate,
  correctedSession,
  events,
  restoration,
}) {
  const counts = getRepairCounts(candidate);
  assertState(
    counts.july27Training === 4 &&
      counts.july27Strength === 1 &&
      counts.july27Walks === 2 &&
      counts.july27StairStepper === 1 &&
      counts.performanceEvents === 17,
    "candidate_validation_failed"
  );
  assertState(
    candidate.canonicalEvidenceObjects.filter(
      (item) => item.canonicalId === JULY_27_MALFORMED_CANONICAL_ID
    ).length === 0 &&
      candidate.canonicalEvidenceObjects.filter(
        (item) => item.canonicalId === JULY_27_CORRECTED_CANONICAL_ID
      ).length === 1 &&
      restoration.records.every(
        (record) =>
          candidate.canonicalEvidenceObjects.find(
            (item) => item.canonicalId === record.canonicalId
          )?.quality?.status === "active"
      ) &&
      events.every(
        (event) =>
          event.sourceCanonicalTrainingId === correctedSession.canonicalId
      ),
    "candidate_validation_failed"
  );
  assertState(
    digest(protectedState(before)) === digest(protectedState(candidate)),
    "protected_state_drift"
  );
}

function validateMalformedAggregate(aggregate) {
  assertState(
    aggregate.payload?.observed_at === "2026-07-17" &&
      aggregate.provenance?.evidence_package_ids?.length === 53 &&
      aggregate.provenance?.contributing_evidence_object_ids?.length === 46 &&
      [
        "evidence_submission_20260727161048228_images",
        "evidence_submission_20260727234925525_images",
      ].every((id) =>
        aggregate.provenance.evidence_package_ids.includes(id)
      ) &&
      (aggregate.payload?.exercises ?? []).some(
        (item) => item.sets?.length > 4
      ),
    "malformed_aggregate_ambiguous"
  );
}

function validateReviewLineage(store) {
  const contracts = [
    {
      reviewId: "evidence_review_20260727161133407",
      packageId: "evidence_submission_20260727161048228_images",
      itemId: "training_2026-07-27_07-09_StrengthTraining",
    },
    {
      reviewId: "evidence_review_20260727234945923",
      packageId: "evidence_submission_20260727234925525_images",
      itemId: "training_2026-07-27_traditional_strength_training",
    },
  ];
  const reviews = contracts.map((contract) => {
    const review = store.evidenceReviews.find(
      (item) => item.id === contract.reviewId
    );
    const evidence = review?.interpretedEvidence?.evidence_objects?.find(
      (item) => item.id === contract.itemId
    );
    assertState(
      review?.status === "confirmed" &&
        review.interpretedEvidence?.package_id === contract.packageId &&
        evidence?.source?.source_artifact_refs?.includes("IMG_1688.png") &&
        evidence?.source?.source_artifact_refs?.includes("typed_evidence_0") &&
        ["canonical_commit", "training_performance_events", "home_refresh"].every(
          (key) => review.commitProgress?.[key]?.status === "completed"
        ),
      "review_lineage_missing"
    );
    return review;
  });
  return { originalReview: reviews[0], reuploadReview: reviews[1] };
}

function validateCardio(store) {
  const sessions = activeJuly27Training(store);
  assertState(
    sessions.filter(
      (item) => item.payload.metadata?.activity_type === "Outdoor Walk"
    ).length === 2 &&
      sessions.filter(
        (item) => item.payload.metadata?.activity_type === "Stair Stepper"
      ).length === 1,
    "protected_state_drift"
  );
}

function validateCorrectedSession(record) {
  const exercises = record.payload?.exercises ?? [];
  assertState(
    record.canonicalId === JULY_27_CORRECTED_CANONICAL_ID &&
      record.payload.observed_at === "2026-07-27" &&
      record.payload.metadata?.activity_type ===
        "Traditional Strength Training" &&
      record.payload.metadata?.duration_seconds === 3053 &&
      record.payload.metadata?.active_calories === 215 &&
      record.payload.metadata?.average_heart_rate === 93 &&
      record.payload.metadata?.start_time == null &&
      exercises.map((item) => item.canonicalExerciseId).join("|") ===
        "shoulder_press_machine|lateral_raise_machine|cable_machine_front_raise" &&
      exercises.map(volume).join("|") === "6390|3600|6240" &&
      exercises.every((item) => item.sets.length === 4),
    "corrected_session_builder_failed"
  );
}

function validateExecutionCommand(command, prepared) {
  const required = {
    expectedFileHash: prepared.baseline.fileHash,
    expectedSemanticDigest: prepared.baseline.semanticDigest,
    expectedRevision: prepared.baseline.revision,
    expectedLastCommitId: prepared.baseline.lastCommitId,
    malformedAggregateId: JULY_27_MALFORMED_CANONICAL_ID,
    correctedCanonicalId: JULY_27_CORRECTED_CANONICAL_ID,
    repairReason: JULY_27_STRENGTH_REPAIR_REASON,
    preparationFingerprint: prepared.fingerprint,
  };
  for (const [key, value] of Object.entries(required)) {
    assertState(command?.[key] === value, `execution_argument:${key}`);
  }
  assertState(
    sameStrings(command.restoreIds, JULY_27_STRENGTH_RESTORE_IDS) &&
      sameStrings(command.eventIds, prepared.eventIds) &&
      command.acceptRecord22Reconstruction === true &&
      command.acceptProductionMutation === true &&
      command.stopOnConflict === true,
    "execution_authorization_incomplete"
  );
}

function protectedState(store) {
  const keys = [
    "evidenceReviews",
    "protocols",
    "protocolVersions",
    "reminders",
    "goals",
    "dailyBriefings",
    "piEnergyConfidenceWorkItems",
    "piTrainingConfidenceWorkItems",
    "piTrainingFinalizationReceipts",
    "goalConfidenceSnapshots",
    "goalConfidenceHistory",
    "goalConfidenceContinuitySeeds",
    "executionItems",
  ];
  return Object.fromEntries(keys.map((key) => [key, store[key] ?? []]));
}

function getRepairCounts(store) {
  const july = activeJuly27Training(store);
  return {
    july27Training: july.length,
    july27Strength: july.filter((item) =>
      /strength/i.test(item.payload.metadata?.activity_type ?? "")
    ).length,
    july27Walks: july.filter(
      (item) => item.payload.metadata?.activity_type === "Outdoor Walk"
    ).length,
    july27StairStepper: july.filter(
      (item) => item.payload.metadata?.activity_type === "Stair Stepper"
    ).length,
    performanceEvents: (store.trainingPerformanceEvents ?? []).length,
  };
}

function activeJuly27Training(store) {
  return (store.canonicalEvidenceObjects ?? []).filter(
    (item) =>
      item.payload?.evidence_type === "training" &&
      item.quality?.status !== "superseded" &&
      item.payload?.observed_at === "2026-07-27"
  );
}

function replaceArray(target, key, source) {
  target[key] = structuredClone(source[key] ?? []);
}

function captureBaselineFromStoreAndBytes(store, bytes, stat) {
  return {
    fileHash: createFounderRuntimeFileHash(bytes),
    semanticDigest: createFounderRuntimeSemanticDigest(store),
    revision: store.revision,
    lastCommitId: store.lastCommitId,
    fileSize: bytes.length,
    modifiedAt: stat.mtime.toISOString(),
  };
}

function baselineMatches(actual, expected) {
  return (
    actual?.fileHash === expected.fileHash &&
    actual?.semanticDigest === expected.semanticDigest &&
    actual?.revision === expected.revision &&
    actual?.lastCommitId === expected.lastCommitId &&
    actual?.fileSize === expected.fileSize &&
    normalizeTimestamp(actual?.modifiedAt) ===
      normalizeTimestamp(expected.modifiedAt)
  );
}

function normalizeTimestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value;
}

function sameStrings(left = [], right = []) {
  return (
    JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
  );
}

function volume(exercise) {
  return exercise.sets.reduce(
    (sum, set) => sum + Number(set.volume ?? set.reps * set.weight),
    0
  );
}

function digest(value) {
  return createHash("sha256")
    .update(stableSerialize(value))
    .digest("hex")
    .toUpperCase();
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertState(condition, reason) {
  if (condition) return;
  const error = new Error(reason);
  error.repairState = Object.values(July27StrengthRepairState).includes(reason)
    ? reason
    : null;
  throw error;
}
