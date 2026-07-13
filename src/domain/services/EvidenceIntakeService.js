import fs from "node:fs/promises";
import path from "node:path";
import { interpretPdfEvidence } from "../interpreters/PdfInterpreter";
import { interpretScreenshotsWithVision } from "../interpreters/ScreenshotInterpreterService";
import { interpretTextEvidence } from "../interpreters/TextInterpreter";
import {
  CanonicalProgressPhotoCategories,
  normalizeProgressPhotoPose,
  normalizeProgressPhotoView,
} from "../models/progressPhotoPoseVocabulary";

const EVIDENCE_SCHEMA_VERSION = "physiqueos-evidence-v1";
const INTAKE_ENGINE_NAME = "PhysiqueOS Evidence Intake Engine";
const PHOTO_INTERPRETER_NAME = "PhysiqueOS Photo Interpreter";
const PHOTO_INTERPRETER_UPLOAD_ANYTHING_FLAG =
  "PHYSIQUEOS_UPLOAD_ANYTHING_PHOTO_INTERPRETER";
const CANONICAL_PROGRESS_PHOTO_CATEGORIES = CanonicalProgressPhotoCategories;
const DEFAULT_TIME_ZONE = "America/Los_Angeles";

export async function processEvidenceIntakeSubmission({
  evidenceDate = null,
  expectedEvidenceType = null,
  files = [],
  typedEvidence = null,
  userId = "founder",
} = {}) {
  const capturedAt = new Date().toISOString();
  const observedDate = normalizeDateKey(evidenceDate) ?? getLocalDateKey(capturedAt);
  const submissionId = `evidence_submission_${capturedAt.replace(/\D/g, "")}`;
  const uploadFiles = files.filter(
    (file) => typeof file?.arrayBuffer === "function" && file.size > 0
  );
  const storedArtifacts = await Promise.all(
    uploadFiles.map((file, index) =>
      storeEvidenceArtifact({
        capturedAt,
        observedDate,
        file,
        index,
        submissionId,
      })
    )
  );

  try {
    const evidencePackage = await createEvidencePackageFromStoredArtifacts({
      capturedAt,
      evidenceDate: observedDate,
      expectedEvidenceType,
      storedArtifacts,
      submissionId,
      typedEvidence,
      userId,
    });

    return {
      evidencePackage,
      provider: getPackageProvider(evidencePackage),
      storedArtifacts,
    };
  } catch (error) {
    const evidencePackage = createFailedIngestionEvidencePackage({
      capturedAt,
      error,
      evidenceDate: observedDate,
      storedArtifacts,
      submissionId,
      userId,
    });

    return {
      evidencePackage,
      provider: getPackageProvider(evidencePackage),
      storedArtifacts,
    };
  }
}

export async function recoverEvidenceIntakeSubmissionFromArtifacts({
  artifactPaths = [],
  evidenceDate = null,
  expectedEvidenceType = "auto",
  submissionId,
  typedEvidence = null,
  userId = "founder",
} = {}) {
  const capturedAt = parseCapturedAtFromSubmissionId(submissionId) ?? new Date().toISOString();
  const observedDate = normalizeDateKey(evidenceDate) ?? getLocalDateKey(capturedAt);
  const storedArtifacts = await Promise.all(
    artifactPaths.map((artifactPath, index) =>
      createStoredArtifactFromExistingUpload({
        artifactPath,
        capturedAt,
        index,
        observedDate,
        submissionId,
      })
    )
  );

  try {
    const evidencePackage = await createEvidencePackageFromStoredArtifacts({
      capturedAt,
      evidenceDate: observedDate,
      expectedEvidenceType,
      storedArtifacts,
      submissionId,
      typedEvidence,
      userId,
    });

    return {
      evidencePackage: {
        ...evidencePackage,
        diagnostics: {
          ...(evidencePackage.diagnostics ?? {}),
          stages: [
            createRecoveryDiagnostic({
              evidenceObjectCount: evidencePackage.evidence_objects?.length ?? 0,
              sourceArtifactRefs: storedArtifacts.map((artifact) => artifact.id),
              submissionId,
            }),
            ...(evidencePackage.diagnostics?.stages ?? []),
          ],
        },
      },
      provider: getPackageProvider(evidencePackage),
      storedArtifacts,
    };
  } catch (error) {
    const evidencePackage = createFailedIngestionEvidencePackage({
      capturedAt,
      error,
      evidenceDate: observedDate,
      storedArtifacts,
      submissionId,
      userId,
    });

    return {
      evidencePackage,
      provider: getPackageProvider(evidencePackage),
      storedArtifacts,
    };
  }
}

async function createEvidencePackageFromStoredArtifacts({
  capturedAt,
  evidenceDate,
  expectedEvidenceType,
  storedArtifacts,
  submissionId,
  typedEvidence,
  userId,
}) {
  const imageArtifacts = storedArtifacts.filter((artifact) => isImageArtifact(artifact));
  const pdfArtifacts = storedArtifacts.filter((artifact) => isPdfArtifact(artifact));
  const classifiedImages = classifyImageArtifacts(imageArtifacts);
  const packages = [];

  if (classifiedImages.screenshots.length > 0) {
    packages.push(
      await createImageEvidencePackage({
        artifacts: classifiedImages.screenshots,
        evidenceDate,
        expectedEvidenceType,
        submissionId,
        typedEvidence,
      })
    );
  }

  if (classifiedImages.progressPhotos.length > 0) {
    packages.push(
      createProgressPhotoEvidencePackage({
        artifacts: classifiedImages.progressPhotos,
        evidenceDate,
        submissionId,
      })
    );
  }

  if (pdfArtifacts.length > 0) {
    packages.push(
      createPdfEvidencePackage({
        artifacts: pdfArtifacts,
        capturedAt,
        submissionId,
        userId,
      })
    );
  }

  if (packages.length === 0 && normalizeText(typedEvidence)) {
    packages.push(
      createTypedEvidencePackage({
        capturedAt,
        evidenceDate,
        expectedEvidenceType,
        submissionId,
        typedEvidence,
      })
    );
  }

  if (packages.length === 0 && storedArtifacts.length > 0) {
    return createFailedIngestionEvidencePackage({
      capturedAt,
      error: new Error("No supported canonical evidence route was available."),
      evidenceDate,
      storedArtifacts,
      submissionId,
      userId,
    });
  }

  const evidencePackage =
    packages.length === 1
      ? normalizeStoredEvidencePackage(packages[0], {
          capturedAt,
          evidenceDate,
          storedArtifacts,
          submissionId,
          typedEvidence,
          userId,
        })
      : mergeEvidencePackages({
          capturedAt,
          evidenceDate,
          packages,
          storedArtifacts,
          submissionId,
          typedEvidence,
          userId,
        });

  return evidencePackage;
}

async function createImageEvidencePackage({
  artifacts,
  evidenceDate,
  expectedEvidenceType,
  submissionId,
  typedEvidence,
}) {
  const result = await interpretScreenshotsWithVision({
    expectedEvidenceType,
    screenshots: artifacts.map((artifact) => ({
      dataUrl: artifact.dataUrl,
      fileName: artifact.fileName,
      evidenceDate,
      mimeType: artifact.mimeType,
      uploadedAt: artifact.uploadedAt,
    })),
    submissionId: `${submissionId}_images`,
    typedEvidence: normalizeText(typedEvidence),
  });

  return addProviderSelectionDiagnostics(result.evidencePackage, {
    fallbackReason: result.fallbackReason,
    provider: result.provider,
    warning: result.warning,
  });
}

function createProgressPhotoEvidencePackage({
  artifacts,
  evidenceDate,
  submissionId,
}) {
  const photoSetId = `${submissionId}_progress_photos`;
  const routing = getProgressPhotoInterpreterRouting();
  const requiresManualConfirmation = !routing.automaticInvocationEnabled;
  const evidenceObject = {
    id: photoSetId,
    evidence_type: "photo_session",
    observed_at: evidenceDate,
    source: {
      modality: "photo",
      application: "Upload Anything",
      source_artifact_refs: artifacts.map((artifact) => artifact.id),
    },
    metadata: {
      attached_interpreter: PHOTO_INTERPRETER_NAME,
      canonical_pose_categories: CANONICAL_PROGRESS_PHOTO_CATEGORIES,
      interpreter_route: routing.route,
      manual_confirmation_required: requiresManualConfirmation,
      photo_count: artifacts.length,
      views_detected: uniqueStrings(
        artifacts.map((artifact, index) =>
          inferProgressPhotoView(artifact.fileName, index)
        )
      ),
    },
    photos: artifacts.map((artifact, index) => {
      const view = inferProgressPhotoView(artifact.fileName, index);

      return {
        id: `${photoSetId}_${index + 1}`,
        captured_at: evidenceDate,
        file_name: artifact.fileName,
        mime_type: artifact.mimeType,
        pose: inferProgressPhotoPose(artifact.fileName, view),
        source_artifact_ref: artifact.id,
        storage_path: artifact.relativePath,
        view,
      };
    }),
    structured_observations: [],
    interpreter_routing: routing,
    confirmation: requiresManualConfirmation
      ? {
          reason: routing.reason,
          required: true,
          options: CANONICAL_PROGRESS_PHOTO_CATEGORIES,
        }
      : {
          required: false,
          options: CANONICAL_PROGRESS_PHOTO_CATEGORIES,
        },
    confidence: {
      extraction: "limited",
      interpretation: "unavailable",
    },
    quality: {
      status: "limited",
      limitations: [
        routing.reason,
      ],
    },
    provenance: {
      source_artifact_refs: artifacts.map((artifact) => artifact.id),
    },
  };
  const evidenceObjects = [evidenceObject];

  return addProviderSelectionDiagnostics(
    {
      package_id: photoSetId,
      schema_version: EVIDENCE_SCHEMA_VERSION,
      source_modality: "photo",
      detected_source_application: "Upload Anything",
      detected_source_confidence: "moderate",
      detected_evidence_type: "photo_session",
      detected_evidence_objects: getDetectedEvidenceObjectCounts(evidenceObjects),
      detected_evidence_type_confidence: "high",
      captured_at: artifacts[0]?.uploadedAt ?? new Date().toISOString(),
      interpreter: {
        name: PHOTO_INTERPRETER_NAME,
        version: "progress-photo-routing-v1",
        provider: "internal",
        model: null,
      },
      quality: {
        extraction_confidence: "limited",
        interpreter_confidence: "unavailable",
        status: "limited",
        limitations: evidenceObject.quality.limitations,
      },
      evidence_objects: evidenceObjects,
      provenance: {
        submission_id: submissionId,
        source_artifacts: artifacts.map(toPersistedSourceArtifact),
      },
      diagnostics: {
        stages: [
          {
            id: `${photoSetId}_classification`,
            label: "Image classification",
            evidenceObjectCount: 1,
            reason:
              "Image artifacts were classified as progress photos and attached to the Photo Interpreter route.",
            interpreterAttached: PHOTO_INTERPRETER_NAME,
            interpreterRoute: routing.route,
            manualConfirmationRequired: requiresManualConfirmation,
            sourceArtifactRefs: artifacts.map((artifact) => artifact.id),
            canonicalObjectCounts: createCanonicalObjectCounts(evidenceObjects),
          },
          {
            id: `${photoSetId}_photo_interpreter_routing`,
            label: "Photo interpreter routing",
            evidenceObjectCount: 1,
            interpreterAttached: PHOTO_INTERPRETER_NAME,
            interpreterSelected: routing.automaticInvocationEnabled
              ? PHOTO_INTERPRETER_NAME
              : "Manual confirmation",
            manualConfirmationRequired: requiresManualConfirmation,
            provider: routing.provider,
            reason: routing.reason,
            sourceArtifactRefs: artifacts.map((artifact) => artifact.id),
            canonicalObjectCounts: createCanonicalObjectCounts(evidenceObjects),
          },
        ],
        warnings: [],
      },
    },
    { provider: "internal" }
  );
}

function getProgressPhotoInterpreterRouting() {
  const flagValue = String(
    process.env[PHOTO_INTERPRETER_UPLOAD_ANYTHING_FLAG] ?? ""
  ).trim().toLowerCase();
  const approvalEnabled = ["1", "true", "enabled", "approved"].includes(flagValue);

  if (approvalEnabled) {
    return {
      automaticInvocationEnabled: false,
      featureFlag: PHOTO_INTERPRETER_UPLOAD_ANYTHING_FLAG,
      provider: "internal",
      reason:
        "Photo Interpreter automation is flagged for approval, but automatic visual interpretation is not enabled for Upload Anything in this environment. Use canonical manual confirmation.",
      route: "photo_interpreter_pending_approval",
    };
  }

  return {
    automaticInvocationEnabled: false,
    featureFlag: PHOTO_INTERPRETER_UPLOAD_ANYTHING_FLAG,
    provider: "internal",
    reason:
      "Photo Interpreter automation is disabled for Upload Anything. Progress photos were classified, preserved, and queued for canonical manual confirmation.",
    route: "manual_confirmation",
  };
}

function createPdfEvidencePackage({ artifacts, capturedAt, submissionId, userId }) {
  const pdfInterpretation = interpretPdfEvidence({
    capturedAt,
    files: artifacts.map((artifact, index) => ({
      capturedAt,
      fileName: artifact.fileName,
      id: `${submissionId}_pdf_${index + 1}`,
      text: artifact.text,
      userId,
    })),
    id: `${submissionId}_pdf`,
    userId,
  });

  return addProviderSelectionDiagnostics(pdfInterpretation.evidencePackage, {
    provider: "internal",
  });
}

function createTypedEvidencePackage({
  capturedAt,
  evidenceDate,
  expectedEvidenceType,
  submissionId,
  typedEvidence,
}) {
  const textInterpretation = interpretTextEvidence({
    capturedAt,
    expectedEvidenceType,
    id: submissionId,
    observedAt: evidenceDate ?? capturedAt.slice(0, 10),
    provenanceRef: "typed_evidence_0",
    sourceArtifactRefs: ["typed_evidence_0"],
    text: typedEvidence,
  });
  const evidenceObjects = textInterpretation.evidenceObjects ?? [];

  return {
    package_id: `${submissionId}_typed`,
    schema_version: EVIDENCE_SCHEMA_VERSION,
    source_modality: "manual",
    detected_source_application: "Manual Entry",
    detected_source_confidence: "high",
    detected_evidence_type:
      evidenceObjects.length > 1
        ? "mixed"
        : evidenceObjects[0]?.evidence_type ?? expectedEvidenceType ?? "general_note",
    detected_evidence_objects: getDetectedEvidenceObjectCounts(evidenceObjects),
    detected_evidence_type_confidence: evidenceObjects.length > 0 ? "moderate" : "low",
    captured_at: capturedAt,
    interpreter: {
      name: INTAKE_ENGINE_NAME,
      version: "manual-evidence-v1",
      provider: "internal",
      model: null,
    },
    quality: {
      extraction_confidence: textInterpretation.confidence ?? "moderate",
      interpreter_confidence: textInterpretation.confidence ?? "moderate",
      status: evidenceObjects.length > 0 ? "partial" : "limited",
      limitations:
        evidenceObjects.length > 0
          ? []
          : ["Typed evidence was preserved but no canonical object was inferred."],
    },
    evidence_objects: evidenceObjects,
    provenance: {
      submission_id: submissionId,
      source_artifacts: [
        {
          id: "typed_evidence_0",
          kind: "typed_evidence",
          file_name: "additional-evidence.txt",
          mime_type: "text/plain",
          uploaded_at: capturedAt,
        },
      ],
    },
    diagnostics: {
      stages: [
        {
          id: `${submissionId}_typed_selection`,
          label: "Interpreter selection",
          evidenceObjectCount: evidenceObjects.length,
          interpreterSelected: INTAKE_ENGINE_NAME,
          provider: "internal",
          reason: "Manual typed evidence was routed through the canonical text interpreter.",
          sourceArtifactRefs: ["typed_evidence_0"],
          canonicalObjectCounts: createCanonicalObjectCounts(evidenceObjects),
        },
      ],
      warnings: [],
    },
  };
}

function mergeEvidencePackages({
  capturedAt,
  evidenceDate,
  packages,
  storedArtifacts,
  submissionId,
  typedEvidence,
  userId,
}) {
  const typedArtifact = createTypedEvidenceSourceArtifact({
    capturedAt,
    typedEvidence,
  });
  const evidenceObjects = packages.flatMap(
    (evidencePackage) => evidencePackage.evidence_objects ?? []
  );
  const sourceArtifacts = [
    ...packages.flatMap(
      (evidencePackage) => evidencePackage.provenance?.source_artifacts ?? []
    ),
    ...storedArtifacts.map(toPersistedSourceArtifact),
    ...(typedArtifact ? [typedArtifact] : []),
  ];
  const detectedEvidenceObjects = getDetectedEvidenceObjectCounts(evidenceObjects);
  const limitations = packages.flatMap(
    (evidencePackage) => evidencePackage.quality?.limitations ?? []
  );

  return {
    package_id: submissionId,
    schema_version: EVIDENCE_SCHEMA_VERSION,
    source_modality: getSourceModality(storedArtifacts),
    userId,
    detected_source_application: getDetectedSourceApplication(evidenceObjects),
    detected_source_confidence: evidenceObjects.length > 0 ? "high" : "low",
    detected_evidence_type:
      detectedEvidenceObjects.length > 1
        ? "mixed"
        : detectedEvidenceObjects[0]?.evidence_type ?? "unknown",
    detected_evidence_objects: detectedEvidenceObjects,
    detected_evidence_type_confidence:
      detectedEvidenceObjects.length > 0 ? "high" : "low",
    captured_at: capturedAt,
    interpreter: {
      name: INTAKE_ENGINE_NAME,
      version: "production-intake-v1",
      provider: getMergedProvider(packages),
      model: null,
    },
    quality: {
      extraction_confidence: packages.some(
        (evidencePackage) => evidencePackage.interpreter?.provider === "fallback"
      )
        ? "low"
        : "high",
      interpreter_confidence: packages.some(
        (evidencePackage) => evidencePackage.interpreter?.provider === "fallback"
      )
        ? "low"
        : "high",
      status: limitations.length > 0 ? "partial" : "complete",
      limitations,
    },
    evidence_objects: evidenceObjects,
    observed_date: evidenceDate,
    provenance: {
      evidence_date: evidenceDate,
      submission_id: submissionId,
      source_artifacts: dedupeSourceArtifacts(sourceArtifacts),
    },
    diagnostics: mergeEvidenceDiagnostics({
      evidenceObjects,
      packages,
      sourceArtifactRefs: storedArtifacts.map((artifact) => artifact.id),
      submissionId,
    }),
  };
}

function normalizeStoredEvidencePackage(
  evidencePackage,
  { capturedAt, evidenceDate, storedArtifacts, submissionId, typedEvidence, userId }
) {
  const typedArtifact = createTypedEvidenceSourceArtifact({
    capturedAt,
    typedEvidence,
  });
  const sourceArtifacts = dedupeSourceArtifacts([
    ...(evidencePackage.provenance?.source_artifacts ?? []),
    ...storedArtifacts.map(toPersistedSourceArtifact),
    ...(typedArtifact ? [typedArtifact] : []),
  ]);

  return {
    ...evidencePackage,
    userId,
    captured_at: evidencePackage.captured_at ?? capturedAt,
    observed_date: evidencePackage.observed_date ?? evidenceDate ?? null,
    provenance: {
      ...(evidencePackage.provenance ?? {}),
      evidence_date: evidencePackage.provenance?.evidence_date ?? evidenceDate ?? null,
      submission_id: evidencePackage.provenance?.submission_id ?? submissionId,
      source_artifacts: sourceArtifacts,
    },
  };
}

function addProviderSelectionDiagnostics(
  evidencePackage,
  { fallbackReason = null, provider, warning = null } = {}
) {
  const diagnostic = {
    id: `${evidencePackage.package_id ?? "evidence_package"}_provider_selection`,
    label: "Interpreter selection",
    evidenceObjectCount: evidencePackage.evidence_objects?.length ?? 0,
    interpreterSelected:
      provider === "fallback" ? "Fallback" : evidencePackage.interpreter?.name ?? INTAKE_ENGINE_NAME,
    provider,
    reason:
      provider === "fallback"
        ? fallbackReason ?? warning ?? "Fallback reason was not reported."
        : `${INTAKE_ENGINE_NAME} selected for this evidence artifact.`,
    sourceArtifactRefs:
      evidencePackage.provenance?.source_artifacts?.map((artifact) => artifact.id) ?? [],
    canonicalObjectCounts: createCanonicalObjectCounts(
      evidencePackage.evidence_objects ?? []
    ),
  };

  return {
    ...evidencePackage,
    diagnostics: {
      stages: [diagnostic, ...(evidencePackage.diagnostics?.stages ?? [])],
      warnings: evidencePackage.diagnostics?.warnings ?? [],
    },
  };
}

function mergeEvidenceDiagnostics({
  evidenceObjects,
  packages,
  sourceArtifactRefs,
  submissionId,
}) {
  return {
    stages: [
      ...packages.flatMap((evidencePackage) => evidencePackage.diagnostics?.stages ?? []),
      {
        id: `${submissionId}_final_canonical_evidence`,
        label: "Final canonical evidence",
        evidenceObjectCount: evidenceObjects.length,
        canonicalObjectCounts: createCanonicalObjectCounts(evidenceObjects),
        sourceArtifactRefs,
      },
    ],
    warnings: packages.flatMap(
      (evidencePackage) => evidencePackage.diagnostics?.warnings ?? []
    ),
  };
}

async function storeEvidenceArtifact({
  capturedAt,
  observedDate,
  file,
  index,
  submissionId,
}) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const extension =
    path.extname(file.name || "") || inferExtensionFromMimeType(file.type) || ".bin";
  const safeName = `${sanitizeFileName(submissionId)}-${index + 1}-${sanitizeFileName(
    path.basename(file.name || `upload${extension}`, extension)
  )}${extension}`;
  const uploadDirectory = path.join(
    process.cwd(),
    "private",
    "founder",
    "evidence",
    "uploads"
  );
  const absolutePath = path.join(uploadDirectory, safeName);
  const relativePath = path
    .join("private", "founder", "evidence", "uploads", safeName)
    .replaceAll("\\", "/");
  const mimeType = file.type || inferMimeTypeFromName(file.name);

  await fs.mkdir(uploadDirectory, { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  return {
    buffer,
    dataUrl: isImageMimeType(mimeType)
      ? `data:${mimeType || "image/png"};base64,${buffer.toString("base64")}`
      : null,
    fileName: file.name || safeName,
    id: `artifact_${submissionId}_${index + 1}`,
    mimeType,
    observedDate,
    relativePath,
    text: buffer.toString("utf8").slice(0, 20000),
    uploadedAt: capturedAt,
  };
}

async function createStoredArtifactFromExistingUpload({
  artifactPath,
  capturedAt,
  index,
  observedDate,
  submissionId,
}) {
  const normalizedPath = path.normalize(artifactPath);
  const absolutePath = path.isAbsolute(normalizedPath)
    ? normalizedPath
    : path.join(process.cwd(), normalizedPath);
  const buffer = await fs.readFile(absolutePath);
  const fileName = path.basename(normalizedPath).replace(
    /^evidence_submission_\d+-\d+-/,
    ""
  );
  const mimeType = inferMimeTypeFromName(fileName);
  const relativePath = path
    .relative(process.cwd(), absolutePath)
    .replaceAll("\\", "/");

  return {
    buffer,
    dataUrl: isImageMimeType(mimeType)
      ? `data:${mimeType || "image/png"};base64,${buffer.toString("base64")}`
      : null,
    fileName,
    id: `artifact_${submissionId}_${index + 1}`,
    mimeType,
    observedDate,
    relativePath,
    text: buffer.toString("utf8").slice(0, 20000),
    uploadedAt: capturedAt,
  };
}

function createFailedIngestionEvidencePackage({
  capturedAt,
  error,
  evidenceDate,
  storedArtifacts = [],
  submissionId,
  userId,
}) {
  const reason =
    error?.message ?? "Evidence intake could not complete for this submission.";

  return {
    package_id: `${submissionId}_failed`,
    schema_version: EVIDENCE_SCHEMA_VERSION,
    source_modality: getSourceModality(storedArtifacts),
    userId,
    detected_source_application: null,
    detected_source_confidence: "low",
    detected_evidence_type: "failed_ingestion",
    detected_evidence_objects: [],
    detected_evidence_type_confidence: "low",
    captured_at: capturedAt,
    interpreter: {
      name: INTAKE_ENGINE_NAME,
      version: "failed-ingestion-v1",
      provider: "internal",
      model: null,
    },
    quality: {
      extraction_confidence: "unavailable",
      interpreter_confidence: "unavailable",
      status: "failed",
      limitations: [reason],
    },
    evidence_objects: [],
    provenance: {
      submission_id: submissionId,
      source_artifacts: storedArtifacts.map(toPersistedSourceArtifact),
    },
    recovery: {
      recoverable: storedArtifacts.length > 0,
      reason,
      suggested_action:
        storedArtifacts.length > 0
          ? "Retry interpretation using the preserved evidence artifacts."
          : "Collect or upload the evidence again.",
      observed_date: evidenceDate,
    },
    diagnostics: {
      stages: [
        {
          id: `${submissionId}_failed_ingestion`,
          label: "Evidence intake recovery",
          evidenceObjectCount: 0,
          reason,
          recoverableArtifactCount: storedArtifacts.length,
          sourceArtifactRefs: storedArtifacts.map((artifact) => artifact.id),
          canonicalObjectCounts: createCanonicalObjectCounts([]),
        },
      ],
      warnings: [reason],
    },
  };
}

function createRecoveryDiagnostic({
  evidenceObjectCount,
  sourceArtifactRefs,
  submissionId,
}) {
  return {
    id: `${submissionId}_orphaned_artifact_recovery`,
    label: "Orphaned upload recovery",
    evidenceObjectCount,
    reason:
      "Previously stored Upload Anything artifacts were reattached to a recoverable EvidencePackage and sent through the normal intake pipeline.",
    sourceArtifactRefs,
    canonicalObjectCounts: createCanonicalObjectCounts([]),
  };
}

function toPersistedSourceArtifact(artifact) {
  return {
    id: artifact.id,
    kind: isPdfArtifact(artifact)
      ? "pdf"
      : isImageArtifact(artifact)
        ? isLikelyProgressPhotoArtifact(artifact)
          ? "progress_photo"
          : "screenshot"
        : "upload",
    file_name: artifact.fileName,
    mime_type: artifact.mimeType,
    observed_date: normalizeDateKey(artifact.observedDate),
    storage_path: artifact.relativePath,
    uploaded_at: artifact.uploadedAt,
  };
}

function createTypedEvidenceSourceArtifact({ capturedAt, typedEvidence }) {
  const text = normalizeText(typedEvidence);
  if (!text) return null;

  return {
    id: "typed_evidence_0",
    kind: "typed_evidence",
    file_name: "additional-evidence.txt",
    mime_type: "text/plain",
    text,
    uploaded_at: capturedAt,
  };
}

function parseCapturedAtFromSubmissionId(submissionId = "") {
  const match = String(submissionId).match(/^evidence_submission_(\d{17})$/);
  if (!match) return null;

  const value = match[1];
  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  const hour = value.slice(8, 10);
  const minute = value.slice(10, 12);
  const second = value.slice(12, 14);
  const millisecond = value.slice(14, 17);

  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${millisecond}Z`;
}

function getLocalDateKey(value = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

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

function getDetectedEvidenceObjectCounts(evidenceObjects = []) {
  const counts = createCanonicalObjectCounts(evidenceObjects);
  const labels = {
    activity_day: "ActivityDay",
    training: "TrainingSession",
    nutrition: "NutritionDay",
    dexa_scan: "DEXAScan",
    lab_panel: "LabPanel",
    recovery_day: "RecoveryDay",
    photo_session: "PhotoSession",
  };

  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([evidenceType, count]) => ({
      evidence_type: evidenceType,
      canonical_name: labels[evidenceType] ?? formatEvidenceLabel(evidenceType),
      count,
    }));
}

function createCanonicalObjectCounts(evidenceObjects = []) {
  return evidenceObjects.reduce(
    (counts, object) => {
      const type = object.evidence_type;

      if (type === "activity_day") counts.activity_day += 1;
      else if (type === "training" || type === "activity") counts.training += 1;
      else if (type === "nutrition") counts.nutrition += 1;
      else if (["dexa_scan", "dexa", "body_composition"].includes(type)) {
        counts.dexa_scan += 1;
      } else if (type === "lab_panel" || type === "labs") counts.lab_panel += 1;
      else if (type === "recovery_day" || type === "recovery") counts.recovery_day += 1;
      else if (type === "photo_session" || type === "progress_photo") {
        counts.photo_session += 1;
      }

      return counts;
    },
    {
      activity_day: 0,
      training: 0,
      nutrition: 0,
      dexa_scan: 0,
      lab_panel: 0,
      recovery_day: 0,
      photo_session: 0,
    }
  );
}

function dedupeSourceArtifacts(sourceArtifacts = []) {
  return [
    ...new Map(sourceArtifacts.map((artifact) => [artifact.id, artifact])).values(),
  ];
}

function getDetectedSourceApplication(evidenceObjects = []) {
  const applications = [
    ...new Set(
      evidenceObjects
        .map((object) => object.source?.application ?? object.provider)
        .filter(Boolean)
    ),
  ];

  if (applications.length === 0) return null;
  if (applications.length === 1) return applications[0];

  return "Mixed";
}

function getMergedProvider(packages = []) {
  if (packages.some((evidencePackage) => evidencePackage.interpreter?.provider === "fallback")) {
    return "fallback";
  }

  if (packages.some((evidencePackage) => evidencePackage.interpreter?.provider === "openai")) {
    return "openai";
  }

  return "internal";
}

function getPackageProvider(evidencePackage) {
  return evidencePackage?.interpreter?.provider ?? "internal";
}

function getSourceModality(artifacts = []) {
  const hasProgressPhoto = artifacts.some(
    (artifact) => isImageArtifact(artifact) && isLikelyProgressPhotoArtifact(artifact)
  );
  const hasScreenshot = artifacts.some(
    (artifact) => isImageArtifact(artifact) && !isLikelyProgressPhotoArtifact(artifact)
  );
  const hasPdf = artifacts.some(isPdfArtifact);

  if ([hasProgressPhoto, hasScreenshot, hasPdf].filter(Boolean).length > 1) {
    return "mixed";
  }
  if (hasProgressPhoto) return "photo";
  if (hasScreenshot) return "screenshot";
  if (hasPdf) return "pdf";

  return "manual";
}

function classifyImageArtifacts(artifacts = []) {
  return artifacts.reduce(
    (groups, artifact) => {
      if (isLikelyProgressPhotoArtifact(artifact)) {
        groups.progressPhotos.push(artifact);
      } else {
        groups.screenshots.push(artifact);
      }

      return groups;
    },
    { progressPhotos: [], screenshots: [] }
  );
}

function isLikelyProgressPhotoArtifact(artifact = {}) {
  const fileName = String(artifact.fileName ?? "");
  const mimeType = String(artifact.mimeType ?? "").toLowerCase();
  const byteLength = artifact.buffer?.length ?? 0;

  if (/progress|physique|front|rear|back|side|pose|check[-_ ]?in/i.test(fileName)) {
    return true;
  }

  if (/\.(heic|heif)$/i.test(fileName)) return true;
  if (mimeType === "image/heic" || mimeType === "image/heif") return true;

  return (
    (mimeType === "image/jpeg" || /\.jpe?g$/i.test(fileName)) &&
    byteLength >= 1_000_000
  );
}

function inferProgressPhotoView(fileName = "") {
  const text = String(fileName).toLowerCase();

  if (/\b(front|abs)\b/.test(text)) return normalizeProgressPhotoView("front");
  if (/\b(rear|back)\b/.test(text)) return normalizeProgressPhotoView("back");

  return "unknown";
}

function inferProgressPhotoPose(fileName = "", view = "unknown") {
  const text = String(fileName).toLowerCase();

  if (/\b(flex|flexed|double[-_ ]?biceps)\b/.test(text)) {
    return normalizeProgressPhotoPose("flexed", view);
  }

  return normalizeProgressPhotoPose("relaxed", view);
}

function isImageArtifact(artifact) {
  return isImageMimeType(artifact.mimeType) || /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(artifact.fileName);
}

function isPdfArtifact(artifact) {
  return artifact.mimeType === "application/pdf" || /\.pdf$/i.test(artifact.fileName);
}

function isImageMimeType(mimeType = "") {
  return String(mimeType).toLowerCase().startsWith("image/");
}

function inferMimeTypeFromName(fileName = "") {
  if (/\.pdf$/i.test(fileName)) return "application/pdf";
  if (/\.jpe?g$/i.test(fileName)) return "image/jpeg";
  if (/\.png$/i.test(fileName)) return "image/png";
  if (/\.webp$/i.test(fileName)) return "image/webp";

  return "application/octet-stream";
}

function inferExtensionFromMimeType(mimeType = "") {
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";

  return null;
}

function normalizeText(value) {
  const text = String(value ?? "").trim();

  return text.length > 0 ? text : null;
}

function normalizeDateKey(value) {
  const text = String(value ?? "").trim();

  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function sanitizeFileName(value) {
  return String(value || "upload")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function formatEvidenceLabel(value) {
  return String(value ?? "Evidence")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}
