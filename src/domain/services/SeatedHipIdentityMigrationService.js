import { createHash } from "node:crypto";
import { createAnalysis } from "../models/analysis";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";

export const SEATED_HIP_IDENTITY_MIGRATION_ID =
  "training_exercise_identity_seated_hip_adductions_v1";
const JULY_7_CANONICAL_ID =
  "training|2026-07-07|traditional strength training|||3623||284";
const JULY_7_PACKAGE_ID =
  "evidence_submission_20260707162436210_images_reprocess_20260707233840354";

export async function executeSeatedHipIdentityMigration({
  repositories,
  runtimeStore,
  persistRuntimeStore,
  now = () => new Date(),
} = {}) {
  const existingMarker = (runtimeStore.migrationMarkers ?? []).find(
    (marker) => marker.id === SEATED_HIP_IDENTITY_MIGRATION_ID
  );
  if (existingMarker?.status === "complete") {
    return { changed: false, idempotent: true, marker: existingMarker };
  }

  const canonical = await repositories.canonicalEvidence.listCanonicalEvidenceObjects();
  const target = canonical.find((item) => item.canonicalId === JULY_7_CANONICAL_ID);
  const today = canonical.find((item) =>
    item.payload?.exercises?.some(
      (exercise) =>
        exercise.id === "seated_hip_abductions" &&
        exercise.sets?.length === 3 &&
        exercise.sets?.reduce((sum, set) => sum + set.reps * set.weight, 0) === 6000
    )
  );
  assertTarget(target);
  if (!today) throw new Error("TODAY_ABDUCTION_SESSION_NOT_FOUND");

  const targetBefore = fingerprint(target);
  const todayBefore = fingerprint(today);
  const migratedTarget = structuredClone(target);
  const targetExercise = migratedTarget.payload.exercises[0];
  Object.assign(targetExercise, {
    id: "seated_hip_adductions",
    name: "Seated Hip Adductions",
    equipment: "hip_adduction_machine",
    body_region: "Glutes",
    primary_muscle_groups: ["Glutes", "Adductors"],
    secondary_muscle_groups: [],
    movement_pattern: "Hip Adduction",
    muscle_groups: ["Glutes", "Adductors"],
  });

  const sourcePackage = await repositories.evidencePackages.getEvidencePackageById(
    JULY_7_PACKAGE_ID
  );
  if (!sourcePackage) throw new Error("JULY_7_SOURCE_PACKAGE_NOT_FOUND");
  const migratedPackage = structuredClone(sourcePackage);
  const packageExercise = migratedPackage.evidence_objects
    .flatMap((item) => item.exercises ?? [])
    .find((exercise) => exercise.id === "seated_abductions");
  if (!packageExercise) throw new Error("JULY_7_LEGACY_PACKAGE_EXERCISE_NOT_FOUND");
  Object.assign(packageExercise, {
    id: "seated_hip_adductions",
    name: "Seated Hip Adductions",
    equipment: "hip_adduction_machine",
    body_region: "Glutes",
    primary_muscle_groups: ["Glutes", "Adductors"],
    secondary_muscle_groups: [],
    movement_pattern: "Hip Adduction",
    muscle_groups: ["Glutes", "Adductors"],
  });

  await repositories.evidencePackages.saveEvidencePackage(migratedPackage);
  await repositories.canonicalEvidence.upsertCanonicalEvidenceObjects([migratedTarget]);

  const reconciledCanonical =
    await repositories.canonicalEvidence.listCanonicalEvidenceObjects();
  const generatedAt = now().toISOString();
  const report = createTrainingPerformanceIntelligenceReport({
    canonicalObjects: reconciledCanonical,
    generatedAt,
    now: generatedAt,
  });
  await repositories.analyses.createAnalysis(
    createAnalysis({
      id: `analysis_${SEATED_HIP_IDENTITY_MIGRATION_ID}`,
      createdAt: generatedAt,
      title: "Training Performance Reconciled",
      summary: report.summary,
      evidenceIds: reconciledCanonical
        .filter((item) => item.evidence_type === "training")
        .map((item) => item.canonicalId),
      evidenceTypes: ["training"],
      metadata: {
        migrationId: SEATED_HIP_IDENTITY_MIGRATION_ID,
        trainingPerformance: report,
      },
    })
  );

  const rereadCanonical =
    await repositories.canonicalEvidence.listCanonicalEvidenceObjects();
  const rereadTarget = rereadCanonical.find(
    (item) => item.canonicalId === JULY_7_CANONICAL_ID
  );
  const rereadToday = rereadCanonical.find(
    (item) => item.canonicalId === today.canonicalId
  );
  assertMigratedTarget(rereadTarget);
  if (fingerprint(rereadToday) !== todayBefore) {
    throw new Error("TODAY_ABDUCTION_SESSION_CHANGED");
  }

  const marker = {
    id: SEATED_HIP_IDENTITY_MIGRATION_ID,
    status: "complete",
    completedAt: generatedAt,
    deprecatedId: "seated_abductions",
    canonicalIds: ["seated_hip_abductions", "seated_hip_adductions"],
    migratedCanonicalIds: [JULY_7_CANONICAL_ID],
    targetBefore,
    targetAfter: fingerprint(rereadTarget),
    todayFingerprint: todayBefore,
    validation: {
      derivedReconciliationCompleted: true,
      deprecatedIdRetired: true,
      historicalRecordsMigrated: 1,
      todayPreserved: true,
    },
  };
  runtimeStore.migrationMarkers = [
    ...(runtimeStore.migrationMarkers ?? []).filter(
      (item) => item.id !== SEATED_HIP_IDENTITY_MIGRATION_ID
    ),
    marker,
  ];
  persistRuntimeStore(runtimeStore, {
    mutatedCollection: "migrationMarkers",
    reason: SEATED_HIP_IDENTITY_MIGRATION_ID,
    throwOnError: true,
  });

  return { changed: true, idempotent: false, marker };
}

function assertTarget(target) {
  const exercise = target?.payload?.exercises?.[0];
  const sets = exercise?.sets ?? [];
  if (
    !target ||
    target.payload?.observed_at !== "2026-07-07" ||
    exercise?.id !== "seated_abductions" ||
    sets.length !== 4 ||
    sets.reduce((sum, set) => sum + set.reps * set.weight, 0) !== 5820 ||
    !sets.some((set) => set.reps === 12 && set.weight === 110)
  ) {
    throw new Error("JULY_7_MIGRATION_PREFLIGHT_MISMATCH");
  }
}

function assertMigratedTarget(target) {
  const exercise = target?.payload?.exercises?.[0];
  if (
    exercise?.id !== "seated_hip_adductions" ||
    exercise?.name !== "Seated Hip Adductions" ||
    exercise?.body_region !== "Glutes" ||
    exercise?.sets?.length !== 4 ||
    exercise.sets.reduce((sum, set) => sum + set.reps * set.weight, 0) !== 5820
  ) {
    throw new Error("JULY_7_MIGRATION_POSTWRITE_MISMATCH");
  }
}

function fingerprint(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
