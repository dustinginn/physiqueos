import fs from "node:fs/promises";
import path from "node:path";
import { createTrainingSessionEvidenceFromText } from "../models/trainingSessionEvidence";
import { recoverEvidenceIntakeSubmissionFromArtifacts } from "./EvidenceIntakeService";
import { reconcileEvidencePackageIntoCanonicalHistory } from "./CanonicalEvidenceService";

const UPLOAD_ROOT = path.join(
  process.cwd(),
  "private",
  "founder",
  "evidence",
  "uploads"
);
const UPLOAD_FILE_PATTERN = /^(evidence_submission_\d{17})-(\d+)-(.+)$/;
const DEFAULT_TIME_ZONE = "America/Los_Angeles";

export async function recoverOrphanedEvidenceUploads({
  repositories,
  userId,
} = {}) {
  if (!repositories?.evidencePackages || !userId) {
    return createRecoverySummary();
  }

  const existingPackages = await repositories.evidencePackages.listEvidencePackages(userId);
  const orphanedGroups = await getOrphanedUploadGroups(existingPackages);
  const recoveredPackages = [];

  for (const group of orphanedGroups) {
    const result = await recoverEvidenceIntakeSubmissionFromArtifacts({
      artifactPaths: group.files.map((file) => file.relativePath),
      expectedEvidenceType: "auto",
      submissionId: group.submissionId,
      userId,
    });
    const evidencePackage = result.evidencePackage;

    await repositories.evidencePackages.saveEvidencePackage(evidencePackage);
    await reconcileCanonicalEvidencePackage({
      evidencePackage,
      repositories,
      userId,
    });
    recoveredPackages.push(evidencePackage);
  }

  return createRecoverySummary({ recoveredPackages });
}

export async function reprocessEvidencePackagesFromStoredArtifacts({
  evidenceDate = null,
  force = false,
  packageId = null,
  reason = "Stored evidence was reprocessed with the current Evidence Intake Engine.",
  typedEvidenceOnly = false,
  recoverEvidenceIntakeSubmissionFromArtifactsFn =
    recoverEvidenceIntakeSubmissionFromArtifacts,
  repositories,
  userId,
} = {}) {
  if (!repositories?.evidencePackages || !userId) {
    return createReprocessSummary();
  }

  const existingPackages = await repositories.evidencePackages.listEvidencePackages(
    userId
  );
  const reprocessedOriginalPackageIds = getReprocessedOriginalPackageIds(
    existingPackages
  );
  const targetPackages = existingPackages.filter((evidencePackage) =>
    shouldReprocessEvidencePackage({
      evidenceDate,
      evidencePackage,
      force,
      packageId,
      reprocessedOriginalPackageIds,
      typedEvidenceOnly,
    })
  );
  const reprocessedPackages = [];

  for (const evidencePackage of targetPackages) {
    const sourceArtifacts = getRecoverableSourceArtifacts(evidencePackage);
    const typedEvidence = getTypedEvidenceText(evidencePackage);
    if (sourceArtifacts.length === 0 && !(typedEvidenceOnly && typedEvidence)) {
      continue;
    }

    const reprocessSubmissionId = createReprocessSubmissionId();
    const reprocessEvidenceDate =
      normalizeDateKey(evidenceDate) ?? getEvidencePackageObservedDate(evidencePackage);
    const result =
      typedEvidenceOnly && typedEvidence
        ? {
            evidencePackage: createTypedTrainingReprocessEvidencePackage({
              evidenceDate: reprocessEvidenceDate,
              originalPackage: evidencePackage,
              submissionId: reprocessSubmissionId,
              typedEvidence,
            }),
          }
        : await recoverEvidenceIntakeSubmissionFromArtifactsFn({
            artifactPaths: sourceArtifacts.map((artifact) => artifact.storage_path),
            evidenceDate: reprocessEvidenceDate,
            expectedEvidenceType: "auto",
            submissionId: reprocessSubmissionId,
            typedEvidence,
            userId,
          });
    const reprocessedPackage = createReprocessedEvidencePackage({
      evidencePackage: result.evidencePackage,
      originalPackage: evidencePackage,
      reason,
      reprocessSubmissionId,
      sourceArtifacts,
    });

    await repositories.evidencePackages.saveEvidencePackage(reprocessedPackage);
    await reconcileCanonicalEvidencePackage({
      evidencePackage: reprocessedPackage,
      repositories,
      userId,
    });
    reprocessedPackages.push(reprocessedPackage);
  }

  return createReprocessSummary({ reprocessedPackages, targetPackages });
}

async function reconcileCanonicalEvidencePackage({
  evidencePackage,
  repositories,
  userId,
}) {
  if (!repositories?.canonicalEvidence) return;

  const existingCanonicalObjects =
    await repositories.canonicalEvidence.listCanonicalEvidenceObjects(userId);
  const reconciledObjects = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage,
    existingCanonicalObjects,
    userId,
  });

  await repositories.canonicalEvidence.upsertCanonicalEvidenceObjects(reconciledObjects);
}

async function getOrphanedUploadGroups(existingPackages = []) {
  const files = await listUploadFiles();
  const referencedPaths = getReferencedUploadPaths(existingPackages);
  const existingPackageIds = new Set(
    existingPackages
      .filter((evidencePackage) => !isRetryableFailedIngestionPackage(evidencePackage))
      .map((evidencePackage) => evidencePackage.package_id)
  );
  const retryableFailedSubmissionIds = new Set(
    existingPackages
      .filter(isRetryableFailedIngestionPackage)
      .map((evidencePackage) =>
        String(evidencePackage.package_id ?? "").replace(/_failed$/, "")
      )
      .filter(Boolean)
  );
  const groups = new Map();

  files.forEach((file) => {
    if (referencedPaths.has(file.relativePath)) return;
    if (existingPackageIds.has(file.submissionId)) return;
    if (existingPackageIds.has(`${file.submissionId}_images`)) return;
    if (
      existingPackageIds.has(`${file.submissionId}_failed`) &&
      !retryableFailedSubmissionIds.has(file.submissionId)
    ) {
      return;
    }

    const group = groups.get(file.submissionId) ?? {
      files: [],
      submissionId: file.submissionId,
    };

    group.files.push(file);
    groups.set(file.submissionId, group);
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      files: group.files.sort((a, b) => a.index - b.index),
    }))
    .sort((a, b) => a.submissionId.localeCompare(b.submissionId));
}

async function listUploadFiles() {
  try {
    const entries = await fs.readdir(UPLOAD_ROOT, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const match = entry.name.match(UPLOAD_FILE_PATTERN);
      if (!match) continue;

      files.push({
        fileName: entry.name,
        index: Number(match[2]),
        relativePath: path
          .join("private", "founder", "evidence", "uploads", entry.name)
          .replaceAll("\\", "/"),
        submissionId: match[1],
      });
    }

    return files;
  } catch {
    return [];
  }
}

function getReferencedUploadPaths(existingPackages = []) {
  return new Set(
    existingPackages.flatMap((evidencePackage) =>
      (isRetryableFailedIngestionPackage(evidencePackage)
        ? []
        : evidencePackage.provenance?.source_artifacts ?? []
      )
        .map((artifact) => normalizeUploadPath(artifact.storage_path))
        .filter(Boolean)
    )
  );
}

function isRetryableFailedIngestionPackage(evidencePackage) {
  if (evidencePackage?.quality?.status !== "failed") return false;

  const reason = String(evidencePackage?.recovery?.reason ?? "");

  return reason === "observedDate is not defined";
}

function normalizeUploadPath(value) {
  if (!value) return null;

  return String(value).replaceAll("\\", "/");
}

function createRecoverySummary({ recoveredPackages = [] } = {}) {
  return {
    canonicalObjectCounts: recoveredPackages.reduce(
      (counts, evidencePackage) => {
        (evidencePackage.evidence_objects ?? []).forEach((object) => {
          const type = object.evidence_type;

          counts[type] = (counts[type] ?? 0) + 1;
        });

        return counts;
      },
      {}
    ),
    recoveredPackageCount: recoveredPackages.length,
    recoveredPackages,
  };
}

function shouldReprocessEvidencePackage({
  evidenceDate,
  evidencePackage,
  force = false,
  packageId,
  reprocessedOriginalPackageIds = new Set(),
  typedEvidenceOnly = false,
}) {
  if (!evidencePackage || evidencePackage.quality?.status === "failed") {
    return false;
  }
  if (evidencePackage.recovery?.reprocessed_from_stored_artifacts) return false;
  if (!force && reprocessedOriginalPackageIds.has(evidencePackage.package_id)) return false;

  if (packageId && evidencePackage.package_id !== packageId) return false;

  const normalizedDate = normalizeDateKey(evidenceDate);
  if (normalizedDate && getEvidencePackageObservedDate(evidencePackage) !== normalizedDate) {
    return false;
  }

  return (
    getRecoverableSourceArtifacts(evidencePackage).length > 0 ||
    (typedEvidenceOnly && Boolean(getTypedEvidenceText(evidencePackage)))
  );
}

function createTypedTrainingReprocessEvidencePackage({
  evidenceDate,
  originalPackage,
  submissionId,
  typedEvidence,
}) {
  const originalTrainingObject = getPrimaryTrainingObject(originalPackage);
  const activityType =
    originalTrainingObject?.metadata?.activity_type ?? "Traditional Strength Training";
  const capturedAt = originalPackage.captured_at ?? new Date().toISOString();
  const observedAt =
    originalTrainingObject?.observed_at ??
    evidenceDate ??
    getEvidencePackageObservedDate(originalPackage);
  const sourceArtifactRefs = uniqueStrings([
    "typed_evidence_0",
    ...(originalTrainingObject?.provenance?.source_artifact_refs ?? []),
    ...(originalTrainingObject?.source?.source_artifact_refs ?? []),
  ]);
  const parsedTrainingObject = createTrainingSessionEvidenceFromText({
    activityType,
    capturedAt,
    id: `${originalTrainingObject?.id ?? submissionId}_typed_reprocess`,
    observedAt,
    provenanceRef: "typed_evidence_0",
    sourceArtifactRefs,
    sourceModality:
      originalTrainingObject?.source?.modality ??
      originalPackage.source_modality ??
      "manual",
    text: typedEvidence,
  });

  return {
    ...originalPackage,
    package_id: `${submissionId}_typed_reprocess`,
    captured_at: capturedAt,
    detected_evidence_type: "training",
    detected_source_application:
      originalPackage.detected_source_application ?? "Manual Entry",
    detected_source_confidence: originalPackage.detected_source_confidence ?? "high",
    evidence_objects: parsedTrainingObject
      ? [
          {
            ...(originalTrainingObject ?? {}),
            ...parsedTrainingObject,
            id: originalTrainingObject?.id ?? parsedTrainingObject.id,
            metadata: {
              ...(parsedTrainingObject.metadata ?? {}),
              ...(originalTrainingObject?.metadata ?? {}),
              activity_type: activityType,
            },
            observed_at: observedAt,
            source: {
              ...(originalTrainingObject?.source ?? {}),
              ...(parsedTrainingObject.source ?? {}),
              source_artifact_refs: sourceArtifactRefs,
            },
            provenance: {
              ...(originalTrainingObject?.provenance ?? {}),
              ...(parsedTrainingObject.provenance ?? {}),
              source_artifact_refs: sourceArtifactRefs,
            },
          },
        ]
      : [],
    provenance: {
      ...(originalPackage.provenance ?? {}),
      evidence_date: evidenceDate ?? originalPackage.provenance?.evidence_date,
      submission_id: submissionId,
      source_artifacts: dedupeSourceArtifacts([
        ...(originalPackage.provenance?.source_artifacts ?? []),
        {
          id: "typed_evidence_0",
          kind: "typed_evidence",
          text: typedEvidence,
        },
      ]),
    },
    quality: {
      ...(originalPackage.quality ?? {}),
      status: parsedTrainingObject ? "complete" : "limited",
    },
  };
}

function getPrimaryTrainingObject(evidencePackage = {}) {
  return (evidencePackage.evidence_objects ?? []).find(
    (object) =>
      object?.evidence_type === "training" &&
      /traditional strength|strength|resistance|core training/i.test(
        object.metadata?.activity_type ?? ""
      )
  );
}

function getReprocessedOriginalPackageIds(evidencePackages = []) {
  return new Set(
    evidencePackages
      .filter((evidencePackage) => evidencePackage.recovery?.reprocessed_from_stored_artifacts)
      .filter((evidencePackage) => !isStaleTypedTrainingReprocessPackage(evidencePackage))
      .map(
        (evidencePackage) =>
          evidencePackage.recovery?.original_package_id ??
          evidencePackage.provenance?.original_package_id
      )
      .filter(Boolean)
  );
}

function isStaleTypedTrainingReprocessPackage(evidencePackage = {}) {
  const hasTypedEvidence = (evidencePackage.provenance?.source_artifacts ?? []).some(
    (artifact) => artifact?.kind === "typed_evidence" && artifact?.text
  );
  if (!hasTypedEvidence) return false;

  return (evidencePackage.evidence_objects ?? []).some((object) => {
    if (object?.evidence_type !== "training") return false;
    if ((object.exercises ?? []).length === 0) return false;

    const metadata = object.metadata ?? {};
    const hasWorkoutIdentity = [
      metadata.active_calories,
      metadata.distance,
      metadata.duration_seconds,
      metadata.start_time ?? metadata.started_at ?? metadata.start,
      metadata.end_time ?? metadata.ended_at ?? metadata.end,
    ].some((value) => value !== null && value !== undefined && value !== "");

    return !hasWorkoutIdentity;
  });
}

function createReprocessedEvidencePackage({
  evidencePackage,
  originalPackage,
  reason,
  reprocessSubmissionId,
  sourceArtifacts,
}) {
  const originalPackageId = originalPackage.package_id ?? originalPackage.id;
  const packageId = `${originalPackageId}_reprocess_${reprocessSubmissionId.replace(
    "evidence_submission_",
    ""
  )}`;
  const originalSourceArtifacts = sourceArtifacts.map((artifact) => ({
    ...artifact,
    reprocessed_from_package_id: originalPackageId,
  }));

  return {
    ...evidencePackage,
    package_id: packageId,
    provenance: {
      ...(evidencePackage.provenance ?? {}),
      original_package_id: originalPackageId,
      reprocess_submission_id: reprocessSubmissionId,
      source_artifacts: dedupeSourceArtifacts([
        ...(evidencePackage.provenance?.source_artifacts ?? []),
        ...originalSourceArtifacts,
      ]),
    },
    recovery: {
      ...(evidencePackage.recovery ?? {}),
      original_package_id: originalPackageId,
      reprocessed_at: new Date().toISOString(),
      reprocessed_from_stored_artifacts: true,
      reason,
    },
    diagnostics: {
      stages: [
        {
          id: `${packageId}_stored_artifact_reprocess`,
          label: "Stored evidence reprocess",
          evidenceObjectCount: evidencePackage.evidence_objects?.length ?? 0,
          reason,
          originalPackageId,
          sourceArtifactRefs: sourceArtifacts.map((artifact) => artifact.id),
        },
        ...(evidencePackage.diagnostics?.stages ?? []),
      ],
      warnings: evidencePackage.diagnostics?.warnings ?? [],
    },
  };
}

function getRecoverableSourceArtifacts(evidencePackage = {}) {
  return (evidencePackage.provenance?.source_artifacts ?? []).filter(
    (artifact) =>
      artifact?.storage_path &&
      ["screenshot", "progress_photo", "pdf", "upload"].includes(
        String(artifact.kind ?? "").toLowerCase()
      )
  );
}

function getEvidencePackageObservedDate(evidencePackage = {}) {
  const packageDate =
    normalizeDateKey(evidencePackage.observed_date) ??
    normalizeDateKey(evidencePackage.provenance?.evidence_date) ??
    normalizeDateKey(evidencePackage.provenance?.observed_date);
  if (packageDate) return packageDate;

  const artifactDate = (evidencePackage.provenance?.source_artifacts ?? [])
    .map(
      (artifact) =>
        normalizeDateKey(artifact.observed_date) ??
        normalizeDateKey(artifact.evidence_date) ??
        normalizeDateKey(artifact.evidenceDate)
    )
    .find(Boolean);
  if (artifactDate) return artifactDate;

  const recoveryDate = normalizeDateKey(evidencePackage.recovery?.observed_date);
  if (recoveryDate) return recoveryDate;

  const evidenceObjectDate = (evidencePackage.evidence_objects ?? [])
    .map((object) => normalizeDateKey(object.observed_at))
    .find(Boolean);
  if (evidenceObjectDate) return evidenceObjectDate;

  return getLocalDateKey(evidencePackage.captured_at);
}

function getTypedEvidenceText(evidencePackage = {}) {
  return (
    (evidencePackage.provenance?.source_artifacts ?? []).find(
      (artifact) => artifact.kind === "typed_evidence" && artifact.text
    )?.text ?? null
  );
}

function createReprocessSubmissionId() {
  return `evidence_submission_${new Date().toISOString().replace(/\D/g, "")}`;
}

function getLocalDateKey(value, timeZone = DEFAULT_TIME_ZONE) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return normalizeDateKey(value);

  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day
    ? `${year}-${month}-${day}`
    : date.toISOString().slice(0, 10);
}

function createReprocessSummary({
  reprocessedPackages = [],
  targetPackages = [],
} = {}) {
  return {
    canonicalObjectCounts: reprocessedPackages.reduce(
      (counts, evidencePackage) => {
        (evidencePackage.evidence_objects ?? []).forEach((object) => {
          const type = object.evidence_type;

          counts[type] = (counts[type] ?? 0) + 1;
        });

        return counts;
      },
      {}
    ),
    reprocessedPackageCount: reprocessedPackages.length,
    reprocessedPackages,
    targetPackageCount: targetPackages.length,
  };
}

function dedupeSourceArtifacts(sourceArtifacts = []) {
  return [
    ...new Map(
      sourceArtifacts.map((artifact) => [
        `${artifact.id ?? ""}|${artifact.storage_path ?? ""}`,
        artifact,
      ])
    ).values(),
  ];
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function normalizeDateKey(value) {
  const text = String(value ?? "").trim().slice(0, 10);

  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}
