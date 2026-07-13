import { createTrainingSessionEvidenceFromText } from "../models/trainingSessionEvidence";

const EVIDENCE_SCHEMA_VERSION = "physiqueos-evidence-v1";
const INTAKE_ENGINE_NAME = "PhysiqueOS Evidence Intake Engine";
const TYPED_EVIDENCE_REF = "typed_evidence_0";

export function createTrainingSessionCorrectionEvidencePackage({
  author = "founder",
  capturedAt = new Date().toISOString(),
  correctionText,
  targetCanonicalObject,
  userId,
} = {}) {
  const text = normalizeCorrectionText(correctionText);
  const targetPayload = targetCanonicalObject?.payload ?? targetCanonicalObject;
  const targetCanonicalId =
    targetCanonicalObject?.canonicalId ?? targetPayload?.canonicalId ?? null;

  if (!targetPayload || targetPayload.evidence_type !== "training") {
    throw new Error("A target TrainingSession is required for this correction.");
  }

  if (!text) {
    throw new Error("Workout details are required before a correction can be saved.");
  }

  const observedAt = targetPayload.observed_at ?? capturedAt.slice(0, 10);
  const packageId = createCorrectionPackageId({
    capturedAt,
    targetCanonicalId,
    targetId: targetPayload.id,
  });
  const targetSourceRefs = uniqueStrings([
    ...(targetPayload.provenance?.source_artifact_refs ?? []),
    ...(targetPayload.source?.source_artifact_refs ?? []),
  ]);
  const parsedTrainingSession = createTrainingSessionEvidenceFromText({
    activityType:
      targetPayload.metadata?.activity_type ?? "Traditional Strength Training",
    capturedAt,
    id: `${packageId}_training_correction`,
    observedAt,
    provenanceRef: TYPED_EVIDENCE_REF,
    sourceArtifactRefs: [TYPED_EVIDENCE_REF],
    sourceModality: "manual_correction",
    text,
  });

  if (!parsedTrainingSession) {
    throw new Error("No structured workout details were found in the correction.");
  }

  const sourceRefs = uniqueStrings([...targetSourceRefs, TYPED_EVIDENCE_REF]);
  const evidenceObject = {
    ...targetPayload,
    id: `${packageId}_training_correction`,
    captured_at: capturedAt,
    source: {
      ...(targetPayload.source ?? {}),
      modality: "manual_correction",
      application: targetPayload.source?.application ?? "Manual Correction",
      source_artifact_refs: sourceRefs,
    },
    metadata: {
      ...(targetPayload.metadata ?? {}),
      activity_type:
        targetPayload.metadata?.activity_type ?? "Traditional Strength Training",
    },
    exercises: parsedTrainingSession.exercises,
    values: [],
    confidence: {
      extraction: "moderate",
      interpretation: "moderate",
    },
    quality: {
      status: "partial",
      limitations: [
        "Additional workout details were supplied after the original evidence was saved.",
      ],
    },
    provenance: {
      ...(targetPayload.provenance ?? {}),
      source_artifact_refs: sourceRefs,
    },
    reconciliation: {
      match_confidence: "high",
      matched_sources: sourceRefs,
      reason:
        "Manual correction was attached to an existing TrainingSession by the user.",
      target_canonical_id: targetCanonicalId,
      target_evidence_object_id: targetPayload.id,
    },
  };

  return {
    package_id: packageId,
    schema_version: EVIDENCE_SCHEMA_VERSION,
    source_modality: "manual_correction",
    userId,
    detected_source_application: "Manual Correction",
    detected_source_confidence: "high",
    detected_evidence_type: "training",
    detected_evidence_objects: [
      {
        evidence_type: "training",
        canonical_name: "TrainingSession",
        count: 1,
      },
    ],
    detected_evidence_type_confidence: "high",
    captured_at: capturedAt,
    correction: {
      author,
      correction_type: "training_session_details",
      linked_training_session_id: targetPayload.id,
      target_canonical_id: targetCanonicalId,
      target_evidence_object_id: targetPayload.id,
      timestamp: capturedAt,
    },
    interpreter: {
      name: INTAKE_ENGINE_NAME,
      version: "manual-correction-v1",
      provider: "internal",
      model: null,
    },
    quality: {
      extraction_confidence: "moderate",
      interpreter_confidence: "moderate",
      status: "partial",
      limitations: [],
    },
    evidence_objects: [evidenceObject],
    provenance: {
      submission_id: packageId,
      source_artifacts: [
        {
          id: TYPED_EVIDENCE_REF,
          kind: "typed_evidence",
          file_name: "workout-correction.txt",
          mime_type: "text/plain",
          text,
          uploaded_at: capturedAt,
        },
      ],
    },
    diagnostics: {
      stages: [
        {
          id: `${packageId}_manual_correction`,
          label: "Manual correction",
          evidenceObjectCount: 1,
          interpreterSelected: INTAKE_ENGINE_NAME,
          provider: "internal",
          reason:
            "Typed workout details were attached to an existing TrainingSession and reconciled into canonical history.",
          sourceArtifactRefs: [TYPED_EVIDENCE_REF],
          canonicalObjectCounts: {
            activity_day: 0,
            training: 1,
            nutrition: 0,
            dexa_scan: 0,
            lab_panel: 0,
            recovery_day: 0,
            photo_session: 0,
          },
        },
      ],
      warnings: [],
    },
  };
}

function createCorrectionPackageId({ capturedAt, targetCanonicalId, targetId }) {
  const timestamp = String(capturedAt).replace(/\D/g, "").slice(0, 17);
  const target = slugify(targetCanonicalId ?? targetId ?? "training_session");

  return `evidence_correction_${timestamp}_${target}`;
}

function normalizeCorrectionText(value) {
  return String(value ?? "").trim();
}

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}
