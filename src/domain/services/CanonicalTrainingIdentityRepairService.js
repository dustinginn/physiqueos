import { getCanonicalTrainingExerciseLabel } from "../models/trainingExerciseIdentity";

export const SEATED_CABLE_ROW_REPAIR_PACKAGE_ID = "repair_training_2026_07_12_seated_cable_row_v1";
export const SEATED_CABLE_ROW_REPAIR_SUFFIX = "repair|seated_cable_row_v1";

export async function repairSeatedCableRowCanonicalIdentity({
  repositories,
  userId,
  now = () => new Date(),
} = {}) {
  if (!repositories?.canonicalEvidence || !repositories?.evidencePackages || !userId) {
    throw new Error("Canonical training repair requires repositories and a user.");
  }

  const canonicalObjects = await repositories.canonicalEvidence.listCanonicalEvidenceObjects(userId);
  const existingRepair = canonicalObjects.find((object) =>
    object.canonicalId.endsWith(SEATED_CABLE_ROW_REPAIR_SUFFIX)
  );
  if (existingRepair?.quality?.status === "active") {
    return { applied: false, canonicalObject: existingRepair, correctionPackageId: SEATED_CABLE_ROW_REPAIR_PACKAGE_ID, idempotent: true };
  }

  const target = canonicalObjects.find(isMalformedJul12StrengthSession);
  if (!target) throw new Error("The active Jul 12 Seated Cable Row typo was not found.");
  const evidencePackages = await repositories.evidencePackages.listEvidencePackages(userId);
  const sourcePackageIds = target.provenance?.evidence_package_ids ?? [];
  const sourcePackages = evidencePackages.filter((item) => sourcePackageIds.includes(item.package_id));
  if (!sourcePackages.length) throw new Error("The Jul 12 source EvidencePackage is unavailable.");

  const correctedCanonicalId = `${target.canonicalId}|${SEATED_CABLE_ROW_REPAIR_SUFFIX}`;
  const correctedAt = now().toISOString();
  const correctionObject = createCorrectedTrainingObject({ correctedCanonicalId, target });
  const correctionPackage = {
    package_id: SEATED_CABLE_ROW_REPAIR_PACKAGE_ID,
    userId,
    captured_at: correctedAt,
    detected_evidence_type: "training",
    detected_source_application: "Canonical correction",
    detected_source_confidence: "high",
    evidence_objects: [correctionObject],
    provenance: {
      correction_reason: "Correct the Seater cable row spelling to the intended Seated Cable Row canonical identity.",
      original_package_ids: sourcePackageIds,
      source_artifacts: dedupeArtifacts(sourcePackages.flatMap((item) => item.provenance?.source_artifacts ?? [])),
    },
    correction: {
      intended_canonical_exercise_id: "seated_cable_row",
      intended_display_name: "Seated Cable Row",
      malformed_display_name: "Seater cable row",
      superseded_canonical_id: target.canonicalId,
      type: "canonical_exercise_identity_correction",
    },
    recovery: {
      original_package_id: sourcePackageIds[0],
      reprocessed_at: correctedAt,
      reprocessed_from_stored_artifacts: true,
      reason: "Immutable canonical exercise identity correction.",
    },
    quality: { status: "complete" },
  };

  await repositories.evidencePackages.saveEvidencePackage(correctionPackage);
  const reconciliation = await repositories.canonicalEvidence.reconcileConfirmedEvidencePackage(correctionPackage, userId);
  const repairedObjects = await repositories.canonicalEvidence.listCanonicalEvidenceObjects(userId);
  const active = repairedObjects.find((object) => object.canonicalId === correctedCanonicalId);
  const superseded = repairedObjects.find((object) => object.canonicalId === target.canonicalId);
  if (!active || active.quality?.status !== "active" || superseded?.quality?.supersededBy !== correctedCanonicalId) {
    throw new Error("The immutable Jul 12 canonical correction did not complete safely.");
  }

  return { applied: true, canonicalObject: active, correctionPackage, correctionPackageId: correctionPackage.package_id, idempotent: false, reconciliation, supersededObject: superseded };
}

function createCorrectedTrainingObject({ correctedCanonicalId, target }) {
  const exercises = (target.payload?.exercises ?? []).map((exercise) => {
    const canonicalName = getCanonicalTrainingExerciseLabel(exercise.name);
    if (canonicalName !== "Seated Cable Row") return structuredClone(exercise);
    return {
      ...structuredClone(exercise),
      canonicalExerciseId: "seated_cable_row",
      name: "Seated Cable Row",
      provenance: {
        ...(exercise.provenance ?? {}),
        source_labels: [...new Set([...(exercise.provenance?.source_labels ?? []), exercise.name])],
      },
    };
  });
  return {
    ...structuredClone(target.payload),
    id: `${target.payload.id}_seated_cable_row_correction_v1`,
    exercises,
    reconciliation: {
      canonical_id: correctedCanonicalId,
      supersedes_canonical_id: target.canonicalId,
    },
    correction: {
      intended_canonical_exercise_id: "seated_cable_row",
      intended_display_name: "Seated Cable Row",
      preserves_session_identity: target.payload.id,
      type: "canonical_exercise_identity_correction",
    },
  };
}

function isMalformedJul12StrengthSession(object = {}) {
  return object.evidence_type === "training" && object.quality?.status !== "superseded" &&
    String(object.payload?.observed_at).slice(0, 10) === "2026-07-12" &&
    /traditional strength/i.test(object.payload?.metadata?.activity_type ?? "") &&
    (object.payload?.exercises ?? []).some((exercise) => /^seater cable rows?$/i.test(exercise.name ?? ""));
}

function dedupeArtifacts(artifacts) {
  return [...new Map(artifacts.map((artifact) => [`${artifact.id ?? ""}|${artifact.storage_path ?? ""}|${artifact.file_name ?? ""}`, artifact])).values()];
}
