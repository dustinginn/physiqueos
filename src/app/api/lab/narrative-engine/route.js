import { NextResponse } from "next/server";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { createWeightEntry } from "../../../../domain/models/weightEntry";
import { interpretPdfEvidence } from "../../../../domain/interpreters/PdfInterpreter";
import { interpretPhotoSetWithVision } from "../../../../domain/interpreters/PhotoInterpreterService";
import { interpretScreenshotsWithVision } from "../../../../domain/interpreters/ScreenshotInterpreterService";
import { interpretTextEvidence } from "../../../../domain/interpreters/TextInterpreter";
import { interpretVoiceEvidence } from "../../../../domain/interpreters/VoiceInterpreter";
import { createAnalysisFromEvidence } from "../../../../domain/services/AnalysisService";
import { createDailyBriefingService } from "../../../../domain/services/DailyBriefingService";
import { getVoiceClarificationPlan } from "../../../../domain/services/VoiceClarificationService";
import { attachVoiceEvidenceToActiveWorkout } from "../../../../domain/services/WorkoutContextAttachmentService";
import { createNarrativeLabRun } from "../../../../domain/lab/narrativeEngine";

export const runtime = "nodejs";

const BODY_FAT_GOAL_ID = "goal_maintain_8_9_body_fat";
const LEAN_MASS_GOAL_ID = "goal_preserve_lean_mass";
const VISIBLE_ABS_GOAL_ID = "goal_visible_abs_at_rest";

export async function POST(request) {
  const startedAt = Date.now();
  const formData = await request.formData();
  const evidenceType = normalizeString(formData.get("evidenceType")) ?? "photos";
  const user = await FounderRepositories.users.getCurrentUser();
  const baseBriefing = await createDailyBriefingService({
    repositories: FounderRepositories,
  }).getLatestPersistedDailyBriefing(user?.id);

  try {
    const packet = await createEvidencePacket({
      evidenceType,
      formData,
      user,
    });
    const run = createNarrativeLabRun({
      baseBriefing,
      evidenceType,
      interpreterOutput: packet.interpreterOutput,
      loggedEvidence: packet.loggedEvidence,
    });
    const pipelinePreview = createPipelinePreview({
      baseBriefing,
      packet,
      run,
    });

    return NextResponse.json({
      ...run,
      lab: {
        latencyMs: Date.now() - startedAt,
        persisted: false,
        sandbox: true,
      },
      pipelinePreview,
      richEvidenceObject: packet.richEvidenceObject,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error.message,
        lab: {
          latencyMs: Date.now() - startedAt,
          persisted: false,
          sandbox: true,
        },
      },
      { status: 400 }
    );
  }
}

async function createEvidencePacket({ evidenceType, formData, user }) {
  const inputMethod = normalizeString(formData.get("inputMethod"));
  const voiceTranscript = normalizeString(formData.get("evidenceNote"));

  if (inputMethod === "voice" && voiceTranscript) {
    return createVoiceEvidencePacket({ evidenceType, formData });
  }

  if (evidenceType === "auto") {
    return createAutoEvidencePacket({ formData, user });
  }

  if (evidenceType === "photos") {
    const photoPacket = await createPhotoEvidencePacket({ formData });
    const sameMorningWeight = normalizeOptionalNumber(formData.get("sameMorningWeight"));

    if (sameMorningWeight != null) {
      const weightPacket = await createWeightEvidencePacket({
        formData,
        user,
        weightFieldName: "sameMorningWeight",
        measuredAtFieldName: "sameMorningWeightDate",
      });

      return createReconciledMorningPacket({
        primaryPacket: photoPacket,
        supportingPackets: [weightPacket],
      });
    }

    return photoPacket;
  }
  if (evidenceType === "weight") {
    const screenshotFiles = getUploadedFiles(formData, "evidenceUpload");
    const weightValue = normalizeOptionalNumber(formData.get("weight"));

    if (screenshotFiles.length > 0 && weightValue == null) {
      return createScreenshotEvidencePacket({
        evidenceType,
        files: screenshotFiles,
        formData,
      });
    }

    return createWeightEvidencePacket({ formData, user });
  }
  if (evidenceType === "dexa") {
    return createDexaEvidencePacket({ formData, user });
  }

  const screenshotFiles = getUploadedFiles(formData, "evidenceUpload");

  if (screenshotFiles.length > 0) {
    return createScreenshotEvidencePacket({
      evidenceType,
      files: screenshotFiles,
      formData,
    });
  }

  return createGenericEvidencePacket({ evidenceType, formData });
}

async function createAutoEvidencePacket({ formData, user }) {
  const files = formData
    .getAll("anythingUpload")
    .filter((file) => typeof file.arrayBuffer === "function" && file.size > 0);
  const imageFiles = files.filter((file) => isImageFile(file));
  const pdfFiles = files.filter((file) => isPdfFile(file));
  const firstFile = files[0];

  if (imageFiles.length > 0 && pdfFiles.length > 0) {
    return createMixedEvidencePacket({
      formData,
      imageFiles,
      pdfFiles,
      user,
    });
  }

  if (imageFiles.length > 0 && looksLikeProgressPhoto(imageFiles)) {
    const proxyFormData = new FormData();

    for (const file of imageFiles) proxyFormData.append("photos", file);
    proxyFormData.set("captureDate", normalizeString(formData.get("measuredAt")) ?? "");

    return createPhotoEvidencePacket({ formData: proxyFormData });
  }

  if (imageFiles.length > 0) {
    return createScreenshotEvidencePacket({
      evidenceType: "auto",
      files: imageFiles,
      formData,
    });
  }

  if (pdfFiles.length > 0) {
    const proxyFormData = new FormData();
    for (const file of pdfFiles) proxyFormData.append("dexaPdf", file);
    proxyFormData.set("measuredAt", normalizeString(formData.get("measuredAt")) ?? "");

    return createDexaEvidencePacket({ formData: proxyFormData, user });
  }

  return createGenericEvidencePacket({
    evidenceType: "auto",
    formData,
    inferredType: firstFile ? "unknown_upload" : "unstructured_note",
  });
}

async function createMixedEvidencePacket({ formData, imageFiles, pdfFiles, user }) {
  const screenshotPacket =
    imageFiles.length > 0
      ? await createScreenshotEvidencePacket({
          evidenceType: "auto",
          files: imageFiles,
          formData,
        })
      : null;
  const dexaPacket =
    pdfFiles.length > 0
      ? await createDexaEvidencePacket({
          formData: createDexaProxyFormData({
            formData,
            pdfFiles,
          }),
          user,
        })
      : null;
  const packets = [screenshotPacket, dexaPacket].filter(Boolean);
  const evidencePackage = mergeEvidencePackages({
    packets,
    submissionId: `lab_mixed_evidence_${Date.now()}`,
  });
  const provider = getMixedProvider(packets);
  const fallbackWarnings = packets
    .map((packet) => packet.richEvidenceObject?.warning)
    .filter(Boolean);
  const summary = createEvidencePackageSummary(evidencePackage, {
    label: "Mixed",
  });

  return {
    interpreterOutput: {
      briefingSummary: {
        biggestChanges: getEvidencePackageValueSummaries(evidencePackage),
        goalImpact:
          "A mixed Evidence package is ready for downstream reconciliation across body composition, nutrition, activity, and training.",
        nextStep:
          "Pass the complete mixed package to the Evidence Engine; do not evaluate each artifact as a separate story.",
        summary,
        whyTheyMatter:
          "Upload Anything can produce multiple canonical evidence object types from one submission while preserving object-level provenance.",
      },
      detailedInterpretation: JSON.stringify(evidencePackage, null, 2),
      source: "PhysiqueOS Evidence Intake Engine",
      structuredObservations: createScreenshotStructuredObservations(evidencePackage),
    },
    loggedEvidence: {
      capturedAt: new Date().toISOString(),
      currentBodyFat: "From current Founder state",
      currentWeight: "From current Founder state",
      id: evidencePackage.package_id,
      label: "Evidence Intake: Mixed",
      summary,
      type: "mixed",
    },
    richEvidenceObject: {
      evidencePackage,
      evidenceType: "mixed",
      provider,
      warning: fallbackWarnings.join(" ") || null,
    },
  };
}

function createDexaProxyFormData({ formData, pdfFiles }) {
  const proxyFormData = new FormData();

  for (const file of pdfFiles) proxyFormData.append("dexaPdf", file);
  proxyFormData.set("measuredAt", normalizeString(formData.get("measuredAt")) ?? "");

  return proxyFormData;
}

function mergeEvidencePackages({ packets, submissionId }) {
  const packages = packets
    .map((packet) => packet.richEvidenceObject?.evidencePackage)
    .filter(Boolean);
  const evidenceObjects = packages.flatMap((evidencePackage) =>
    evidencePackage.evidence_objects ?? []
  );
  const sourceArtifacts = packages.flatMap(
    (evidencePackage) => evidencePackage.provenance?.source_artifacts ?? []
  );
  const detectedEvidenceObjects = getDetectedEvidenceObjectCounts(evidenceObjects);
  const providerDiagnostics = packets.map(createProviderSelectionDiagnostic);
  const limitations = packages.flatMap(
    (evidencePackage) => evidencePackage.quality?.limitations ?? []
  );

  return {
    package_id: submissionId,
    schema_version: "physiqueos-evidence-v1",
    source_modality: "mixed",
    detected_source_application: getMixedDetectedSourceApplication(evidenceObjects),
    detected_source_confidence: "high",
    detected_evidence_type: detectedEvidenceObjects.length > 1
      ? "mixed"
      : detectedEvidenceObjects[0]?.evidence_type ?? "unknown",
    detected_evidence_objects: detectedEvidenceObjects,
    detected_evidence_type_confidence:
      detectedEvidenceObjects.length > 0 ? "high" : "low",
    captured_at: packages[0]?.captured_at ?? new Date().toISOString(),
    interpreter: {
      name: "PhysiqueOS Evidence Intake Engine",
      version: "mixed-evidence-v1",
      provider: getMixedProvider(packets),
      model: null,
    },
    quality: {
      extraction_confidence: packets.some(
        (packet) => packet.richEvidenceObject?.provider === "fallback"
      )
        ? "low"
        : "high",
      interpreter_confidence: packets.some(
        (packet) => packet.richEvidenceObject?.provider === "fallback"
      )
        ? "low"
        : "high",
      status: limitations.length > 0 ? "partial" : "complete",
      limitations,
    },
    evidence_objects: evidenceObjects,
    provenance: {
      submission_id: submissionId,
      source_artifacts: dedupeSourceArtifacts(sourceArtifacts),
    },
    diagnostics: mergeEvidenceDiagnostics({
      packages,
      providerDiagnostics,
      evidenceObjects,
    }),
  };
}

function createProviderSelectionDiagnostic(packet) {
  const evidencePackage = packet.richEvidenceObject?.evidencePackage ?? {};
  const provider = packet.richEvidenceObject?.provider ?? evidencePackage.interpreter?.provider;
  const fallbackReason =
    packet.richEvidenceObject?.fallbackReason ??
    packet.richEvidenceObject?.warning ??
    (provider === "fallback" ? "Fallback reason was not reported." : null);

  return {
    label: "Interpreter selection",
    evidenceObjectCount: evidencePackage.evidence_objects?.length ?? 0,
    interpreterSelected:
      provider === "fallback" ? "Fallback" : evidencePackage.interpreter?.name ?? "Interpreter",
    provider,
    reason:
      provider === "fallback"
        ? fallbackReason
        : "PhysiqueOS Evidence Intake Engine or canonical PDF interpreter selected.",
    sourceArtifactRefs:
      evidencePackage.provenance?.source_artifacts?.map((artifact) => artifact.id) ?? [],
    canonicalObjectCounts: createCanonicalObjectCounts(
      evidencePackage.evidence_objects ?? []
    ),
  };
}

function addProviderSelectionDiagnostics(evidencePackage, {
  fallbackReason = null,
  provider,
  warning = null,
} = {}) {
  const diagnostic = {
    label: "Interpreter selection",
    evidenceObjectCount: evidencePackage.evidence_objects?.length ?? 0,
    interpreterSelected: provider === "fallback" ? "Fallback" : "PhysiqueOS Evidence Intake Engine",
    provider,
    reason:
      provider === "fallback"
        ? fallbackReason ?? warning ?? "Fallback reason was not reported."
        : "PhysiqueOS Evidence Intake Engine selected because visual evidence was available.",
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

function mergeEvidenceDiagnostics({ packages, providerDiagnostics, evidenceObjects }) {
  const childStages = packages.flatMap((evidencePackage) =>
    (evidencePackage.diagnostics?.stages ?? []).filter(
      (stage) => stage.label !== "Interpreter selection"
    )
  );

  return {
    stages: [
      ...providerDiagnostics,
      ...childStages,
      {
        label: "Final mixed canonical evidence",
        evidenceObjectCount: evidenceObjects.length,
        canonicalObjectCounts: createCanonicalObjectCounts(evidenceObjects),
        sourceArtifactRefs: [
          ...new Set(
            evidenceObjects.flatMap(
              (object) => object.provenance?.source_artifact_refs ?? []
            )
          ),
        ],
      },
    ],
    warnings: packages.flatMap((evidencePackage) => evidencePackage.diagnostics?.warnings ?? []),
  };
}

function getDetectedEvidenceObjectCounts(evidenceObjects = []) {
  const counts = createCanonicalObjectCounts(evidenceObjects);
  const labels = {
    activity_day: "ActivityDay",
    training: "TrainingSession",
    nutrition: "NutritionDay",
    morning_weight: "MorningWeight",
    dexa_scan: "DEXAScan",
    lab_panel: "LabPanel",
    recovery_day: "RecoveryDay",
    photo_session: "PhotoSession",
    protocol: "ProtocolEvidence",
    health_symptom: "HealthSymptom",
    goal: "GoalEvidence",
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
      else if (type === "morning_weight" || type === "weight") {
        counts.morning_weight += 1;
      } else if (["dexa_scan", "dexa", "body_composition"].includes(type)) {
        counts.dexa_scan += 1;
      } else if (type === "lab_panel" || type === "labs") counts.lab_panel += 1;
      else if (type === "recovery_day" || type === "recovery") counts.recovery_day += 1;
      else if (type === "photo_session" || type === "progress_photo") {
        counts.photo_session += 1;
      } else if (type === "protocol") {
        counts.protocol += 1;
      } else if (type === "health_symptom") {
        counts.health_symptom += 1;
      } else if (type === "goal") {
        counts.goal += 1;
      }

      return counts;
    },
    {
      activity_day: 0,
      training: 0,
      nutrition: 0,
      morning_weight: 0,
      dexa_scan: 0,
      lab_panel: 0,
      recovery_day: 0,
      photo_session: 0,
      protocol: 0,
      health_symptom: 0,
      goal: 0,
    }
  );
}

function dedupeSourceArtifacts(sourceArtifacts = []) {
  return [
    ...new Map(sourceArtifacts.map((artifact) => [artifact.id, artifact])).values(),
  ];
}

function getMixedProvider(packets = []) {
  if (packets.some((packet) => packet.richEvidenceObject?.provider === "fallback")) {
    return "fallback";
  }

  if (packets.some((packet) => packet.richEvidenceObject?.provider === "openai")) {
    return "openai";
  }

  return "internal";
}

function getMixedDetectedSourceApplication(evidenceObjects = []) {
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

async function createScreenshotEvidencePacket({ evidenceType, files, formData }) {
  const submissionId = `lab_screenshot_${Date.now()}`;
  const expectedEvidenceType = evidenceType === "auto" ? null : evidenceType;
  const screenshots = await Promise.all(files.map(fileToScreenshotInput));
  const typedEvidence = normalizeString(formData.get("evidenceNote"));
  const result = await interpretScreenshotsWithVision({
    expectedEvidenceType,
    screenshots,
    submissionId,
    typedEvidence,
  });
  const evidencePackage = addProviderSelectionDiagnostics(result.evidencePackage, {
    fallbackReason: result.fallbackReason,
    provider: result.provider,
    warning: result.warning,
  });
  const detectedType = evidencePackage.detected_evidence_type ?? evidenceType;
  const evidenceConfig = getLabEvidenceConfig(
    evidenceType === "auto" ? detectedType : evidenceType
  );
  const summary = createEvidencePackageSummary(evidencePackage, evidenceConfig);

  return {
    interpreterOutput: {
      briefingSummary: {
        biggestChanges: getEvidencePackageValueSummaries(evidencePackage),
        goalImpact:
          "A standardized Evidence package is ready for downstream engines.",
        nextStep:
          "Pass this Evidence object to the Evidence Engine for meaning and prioritization.",
        summary,
        whyTheyMatter:
          "The interpreter extracted machine-readable Evidence and preserved provenance.",
      },
      detailedInterpretation: JSON.stringify(
        evidencePackage,
        null,
        2
      ),
      source: "PhysiqueOS Evidence Intake Engine",
      structuredObservations: createScreenshotStructuredObservations(evidencePackage),
    },
    loggedEvidence: {
      capturedAt: new Date().toISOString(),
      currentBodyFat: "From current Founder state",
      currentWeight: "From current Founder state",
      id: submissionId,
      label:
        evidenceType === "auto"
          ? `Evidence Intake: ${formatEvidenceLabel(detectedType)}`
          : `${evidenceConfig.label} Screenshot Evidence`,
      summary,
      type: evidenceType === "auto" ? detectedType : evidenceType,
    },
    richEvidenceObject: {
      evidencePackage,
      evidenceType: evidencePackage.detected_evidence_type,
      expectedEvidenceType,
      fallbackReason: result.fallbackReason,
      provider: result.provider,
      warning: result.warning,
    },
  };
}

function createReconciledMorningPacket({ primaryPacket, supportingPackets }) {
  const weightPacket = supportingPackets.find(
    (packet) => packet.richEvidenceObject?.evidenceType === "weight"
  );
  const photoSummary = primaryPacket.interpreterOutput.briefingSummary;
  const weightSummary = weightPacket?.interpreterOutput.briefingSummary;
  const weightChange = weightSummary?.biggestChanges?.[0];
  const weightIsUp = /scale was up|\+\d/i.test(weightChange ?? "");
  const supportingContext = weightChange
    ? weightIsUp
      ? `This morning's weigh-in adds context, not concern: ${weightChange}`
      : `This morning's weigh-in adds useful support: ${weightChange}`
    : "This morning's weigh-in adds quantitative context to the visual read.";

  return {
    interpreterOutput: {
      briefingSummary: {
        biggestChanges: [
          ...(photoSummary.biggestChanges ?? []),
          ...(weightChange ? [weightChange] : []),
        ],
        goalImpact:
          "Today's visual evidence is the clearest read on visible-abs progress, and the same-morning weight helps confirm whether the cut is moving in the same direction.",
        nextStep:
          photoSummary.nextStep ??
          "Stay the course unless upcoming evidence challenges this combined read.",
        summary: `${photoSummary.summary} ${supportingContext}`,
        supportingContext,
        whyTheyMatter:
          "Photos show the outcome the goal depends on. Weight helps confirm whether the visual trend is supported by the broader fat-loss trajectory.",
      },
      detailedInterpretation: [
        primaryPacket.interpreterOutput.detailedInterpretation,
        weightPacket?.interpreterOutput.detailedInterpretation,
      ]
        .filter(Boolean)
        .join("\n\n"),
      reconciliation: {
        corroboratingEvidence: supportingPackets.map((packet) => ({
          label: packet.loggedEvidence.label,
          summary: packet.interpreterOutput.briefingSummary.summary,
          type: packet.loggedEvidence.type,
        })),
        leadEvidence: primaryPacket.loggedEvidence.label,
        mode: "photo_led_with_weight_support",
      },
      structuredObservations: [
        ...(primaryPacket.interpreterOutput.structuredObservations ?? []),
        ...(weightPacket
          ? [
              {
                change: weightChange ?? weightPacket.interpreterOutput.briefingSummary.summary,
                confidence: "high",
                importance: "supporting",
                limitations: [],
                region: "Weight trend",
                supportsGoal: true,
                type: "corroborating_evidence",
              },
            ]
          : []),
      ],
      source: "Evidence reconciliation",
    },
    loggedEvidence: {
      ...primaryPacket.loggedEvidence,
      currentWeight:
        weightPacket?.loggedEvidence.currentWeight ??
        primaryPacket.loggedEvidence.currentWeight,
      label: "Today's Progress Photos + Morning Weight",
      summary: `${primaryPacket.loggedEvidence.summary} ${supportingContext}`,
      supportingEvidence: supportingPackets.map((packet) => ({
        label: packet.loggedEvidence.label,
        reason:
          packet.interpreterOutput.briefingSummary.goalImpact ??
          packet.interpreterOutput.briefingSummary.summary,
        type: packet.loggedEvidence.type,
      })),
      type: "photos",
    },
    richEvidenceObject: {
      evidenceType: "reconciled_morning",
      primary: primaryPacket.richEvidenceObject,
      supporting: supportingPackets.map((packet) => packet.richEvidenceObject),
    },
  };
}

function createPipelinePreview({ baseBriefing, packet, run }) {
  const evidencePackage = normalizePipelineEvidencePackage(
    normalizePacketToEvidencePackage(packet)
  );
  const evidenceObjects = evidencePackage.evidence_objects ?? [];
  const values = evidenceObjects.flatMap((object) => object.values ?? []);
  const provenance = evidencePackage.provenance ?? {};
  const goalPreview = createGoalEnginePreview({
    baseBriefing,
    evidencePackage,
    values,
  });
  const briefingPreview = createBriefingPreview({
    evidencePackage,
    goalPreview,
    run,
    values,
  });
  const coachingPreview = createCoachingPreview({
    briefingPreview,
    evidencePackage,
    goalPreview,
  });

  return {
    interpreter: {
      rawExtraction: packet.interpreterOutput?.detailedInterpretation ?? null,
      structuredEvidenceJson: evidencePackage,
      detectedEvidenceType: evidencePackage.detected_evidence_type,
      detectedSourceApplication: evidencePackage.detected_source_application,
      extractionConfidence: evidencePackage.quality?.extraction_confidence ?? "low",
      interpreterConfidence: evidencePackage.quality?.interpreter_confidence ?? "low",
      diagnostics: evidencePackage.diagnostics ?? null,
      provenance,
    },
    evidenceEngine: createEvidenceEnginePreview({
      evidenceObjects,
      evidencePackage,
      values,
    }),
    goalEngine: goalPreview,
    briefing: briefingPreview,
    coaching: coachingPreview,
  };
}

function normalizePacketToEvidencePackage(packet) {
  const existing = packet.richEvidenceObject?.evidencePackage;
  if (existing) return existing;

  const evidenceType =
    packet.richEvidenceObject?.evidenceType ?? packet.loggedEvidence?.type ?? "unknown";
  const packageId = packet.loggedEvidence?.id ?? `lab_evidence_${Date.now()}`;
  const values = createValuesFromPacket(packet);
  const sourceArtifactRefs = getPacketSourceArtifactRefs(packet);

  return {
    package_id: packageId,
    schema_version: "physiqueos-evidence-v1",
    source_modality: getPacketSourceModality(packet),
    detected_source_application: null,
    detected_source_confidence: "low",
    detected_evidence_type: evidenceType,
    detected_evidence_type_confidence: "high",
    captured_at: packet.loggedEvidence?.capturedAt ?? null,
    interpreter: {
      name: packet.interpreterOutput?.source ?? "Interpreter",
      version: "lab-adapter-v1",
      provider: packet.richEvidenceObject?.provider ?? "internal",
      model: null,
    },
    quality: {
      extraction_confidence: inferPackageConfidence(packet),
      interpreter_confidence: inferPackageConfidence(packet),
      status: values.length > 0 ? "partial" : "limited",
      limitations: getPacketLimitations(packet),
    },
    evidence_objects: [
      {
        id: `${packageId}_object_1`,
        evidence_type: evidenceType,
        observed_at:
          packet.richEvidenceObject?.weightEntry?.measuredAt ??
          packet.richEvidenceObject?.scan?.measuredAt ??
          packet.loggedEvidence?.capturedAt ??
          null,
        captured_at: packet.loggedEvidence?.capturedAt ?? null,
        source: {
          modality: getPacketSourceModality(packet),
          application: null,
          integration: null,
          source_artifact_refs: sourceArtifactRefs,
        },
        values,
        confidence: {
          extraction: inferPackageConfidence(packet),
          interpretation: inferPackageConfidence(packet),
        },
        quality: {
          status: values.length > 0 ? "partial" : "limited",
          limitations: getPacketLimitations(packet),
        },
        provenance: {
          source_artifact_refs: sourceArtifactRefs,
        },
      },
    ],
    provenance: {
      submission_id: packageId,
      source_artifacts: sourceArtifactRefs.map((id) => ({
        id,
        kind: getPacketSourceModality(packet),
        file_name: id,
        mime_type: "unknown",
        uploaded_at: packet.loggedEvidence?.capturedAt ?? new Date().toISOString(),
      })),
    },
  };
}

function normalizePipelineEvidencePackage(evidencePackage) {
  const evidenceObjects = evidencePackage.evidence_objects ?? [];
  const seenIds = new Map();

  return {
    ...evidencePackage,
    evidence_objects: evidenceObjects.map((object, index) => {
      const originalId =
        normalizeString(object.id) ??
        `${evidencePackage.package_id ?? "evidence_package"}_object`;
      const seenCount = seenIds.get(originalId) ?? 0;
      seenIds.set(originalId, seenCount + 1);

      if (seenCount === 0) return object;

      return {
        ...object,
        id: `${originalId}_${index + 1}`,
      };
    }),
  };
}

function createValuesFromPacket(packet) {
  const values = [];
  const weight = packet.richEvidenceObject?.weightEntry;
  const scan = packet.richEvidenceObject?.scan;
  const photoCount = packet.richEvidenceObject?.photos?.length ?? 0;

  if (weight?.weight?.value != null) {
    values.push(createEvidenceValue({
      name: "weight",
      label: "Weight",
      value: weight.weight.value,
      unit: weight.weight.unit ?? "lb",
      valueType: "number",
    }));
  }

  if (scan?.bodyFatPercentage != null) {
    values.push(createEvidenceValue({
      name: "body_fat_percentage",
      label: "Body fat percentage",
      value: scan.bodyFatPercentage,
      unit: "%",
      valueType: "number",
    }));
  }
  for (const [name, field] of [
    ["total_mass", scan?.totalMass],
    ["lean_mass", scan?.leanMass],
    ["fat_mass", scan?.fatMass],
  ]) {
    if (field?.value != null) {
      values.push(createEvidenceValue({
        name,
        label: name.replaceAll("_", " "),
        value: field.value,
        unit: field.unit ?? "lb",
        valueType: "number",
      }));
    }
  }

  if (photoCount > 0) {
    values.push(createEvidenceValue({
      name: "photo_count",
      label: "Photo count",
      value: photoCount,
      unit: null,
      valueType: "number",
    }));
  }

  if (packet.richEvidenceObject?.extractedFields) {
    for (const [name, value] of Object.entries(packet.richEvidenceObject.extractedFields)) {
      if (value == null) continue;
      values.push(createEvidenceValue({
        name,
        label: name.replaceAll("_", " "),
        value,
        unit: null,
        valueType: typeof value === "number" ? "number" : "text",
      }));
    }
  }

  return values;
}

function createEvidenceValue({
  caveats = [],
  confidence = "high",
  label,
  name,
  provenanceRef = "lab_submission",
  unit,
  value,
  valueType,
}) {
  return {
    name,
    label,
    value,
    unit,
    value_type: valueType,
    confidence,
    provenance_ref: provenanceRef,
    caveats,
  };
}

function getPacketSourceModality(packet) {
  if (packet.richEvidenceObject?.evidencePackage?.source_modality) {
    return packet.richEvidenceObject.evidencePackage.source_modality;
  }
  if (packet.richEvidenceObject?.evidenceType === "progress_photo") return "photo";
  if (packet.richEvidenceObject?.evidenceType === "dexa") return "pdf";
  if (packet.loggedEvidence?.type === "weight") return "manual";

  return "manual";
}

function getPacketSourceArtifactRefs(packet) {
  if (packet.richEvidenceObject?.photos?.length > 0) {
    return packet.richEvidenceObject.photos.map((photo, index) => photo.fileName ?? `photo_${index}`);
  }
  if (packet.richEvidenceObject?.evidencePackage?.provenance?.source_artifacts) {
    return packet.richEvidenceObject.evidencePackage.provenance.source_artifacts.map(
      (artifact) => artifact.id
    );
  }

  return ["lab_submission"];
}

function inferPackageConfidence(packet) {
  if (packet.richEvidenceObject?.warning) return "low";
  if (packet.richEvidenceObject?.provider === "openai") return "moderate";
  if (packet.richEvidenceObject?.evidenceType === "weight") return "high";
  if (packet.richEvidenceObject?.evidenceType === "dexa") return "moderate";

  return "moderate";
}

function getPacketLimitations(packet) {
  return [packet.richEvidenceObject?.warning].filter(Boolean);
}

function createEvidenceEnginePreview({ evidenceObjects, evidencePackage, values }) {
  return {
    timelineEntries: evidenceObjects.map((object) => ({
      id: `${object.id}_timeline`,
      occurredAt: object.observed_at ?? object.captured_at ?? evidencePackage.captured_at,
      title: `${formatEvidenceLabel(object.evidence_type)} evidence`,
      evidenceObjectId: object.id,
      provenanceRefs: object.provenance?.source_artifact_refs ?? [],
      values: (object.values ?? []).map((value) => value.name),
    })),
    evidenceObjects,
    reconciliationResults: createReconciliationResults(evidenceObjects),
    storageDecisions: createStorageDecisions(evidencePackage, evidenceObjects),
    historicalTrackingPreview: createHistoricalTrackingPreview(evidenceObjects),
    analyticsMetadata: {
      evidenceObjectCount: evidenceObjects.length,
      activityDayCount: evidenceObjects.filter(
        (object) => object.evidence_type === "activity_day"
      ).length,
      trainingSessionCount: evidenceObjects.filter((object) =>
        ["training", "activity"].includes(object.evidence_type)
      ).length,
      dexaScanCount: evidenceObjects.filter((object) =>
        ["dexa", "dexa_scan", "body_composition"].includes(object.evidence_type)
      ).length,
      timelineEntryCount: evidenceObjects.length,
      reconciliationResultCount: evidenceObjects.length,
      historicalRecordCount: evidenceObjects.length,
      valueCount: values.length,
      sourceModality: evidencePackage.source_modality,
      detectedSourceApplication: evidencePackage.detected_source_application,
      extractionConfidence: evidencePackage.quality?.extraction_confidence,
      diagnostics: evidencePackage.diagnostics ?? null,
      provenanceRefs:
        evidencePackage.provenance?.source_artifacts?.map((artifact) => artifact.id) ?? [],
    },
  };
}

function createReconciliationResults(evidenceObjects) {
  if (evidenceObjects.length === 0) {
    return [];
  }

  if (evidenceObjects.length === 1) {
    return evidenceObjects.map((object) => ({
      decision: "store_new",
      evidenceObjectId: object.id,
      reason:
        object.evidence_type === "activity_day"
          ? "Stored as the day's activity summary. No new workouts are created from daily rings."
          : "No duplicate evidence objects detected in this simulation.",
    }));
  }

  return evidenceObjects.map((object) => ({
    decision: "store_new",
    evidenceObjectId: object.id,
    reason:
      object.evidence_type === "activity_day"
        ? "Stored as the day's activity summary and linked to same-day TrainingSessions without creating duplicate workouts."
        : "Multiple evidence objects were preserved separately because they represent distinct structured records.",
  }));
}

function createStorageDecisions(evidencePackage, evidenceObjects) {
  return evidenceObjects.map((object) => ({
    evidenceObjectId: object.id,
    merge: false,
    replace: false,
    duplicate: false,
    storeInTimeline: true,
    storeInHistory:
      [
        "training",
        "nutrition",
        "recovery",
        "sleep",
        "weight",
        "labs",
        "activity",
        "activity_day",
        "dexa",
        "dexa_scan",
        "body_composition",
      ].includes(object.evidence_type),
    provenanceRequired: true,
    reason: `${formatEvidenceLabel(object.evidence_type)} evidence from ${evidencePackage.source_modality} should be stored with source provenance before downstream interpretation.`,
  }));
}

function createHistoricalTrackingPreview(evidenceObjects) {
  return evidenceObjects.map((object) => ({
    evidenceObjectId: object.id,
    stream: getHistoryStream(object.evidence_type),
    recordKey: object.observed_at
      ? `${object.evidence_type}:${String(object.observed_at).slice(0, 10)}:${object.id}`
      : `${object.evidence_type}:undated:${object.id}`,
    trendFields: (object.values ?? []).map((value) => ({
      name: value.name,
      unit: value.unit,
      valueType: value.value_type,
    })),
  }));
}

function getHistoryStream(evidenceType) {
  if (["training", "activity"].includes(evidenceType)) return "training_history";
  if (evidenceType === "activity_day") return "activity_history";
  if (["nutrition", "hydration"].includes(evidenceType)) return "nutrition_history";
  if (["recovery", "sleep"].includes(evidenceType)) return "recovery_history";
  if (["labs"].includes(evidenceType)) return "lab_history";
  if (["weight"].includes(evidenceType)) return "weight_history";
  if (["body_composition", "dexa", "dexa_scan"].includes(evidenceType)) {
    return "body_composition_history";
  }

  return "evidence_timeline";
}

function createGoalEnginePreview({ baseBriefing, evidencePackage, values }) {
  const evidenceType = evidencePackage.detected_evidence_type;
  const affectsVisibleAbs = [
    "progress_photo",
    "body_composition",
    "dexa",
    "dexa_scan",
    "weight",
  ].includes(evidenceType);
  const affectsLeanMass = ["body_composition", "dexa", "dexa_scan", "training"].includes(
    evidenceType
  );
  const isDexa = ["body_composition", "dexa", "dexa_scan"].includes(evidenceType);
  const affectedGoals = [
    affectsVisibleAbs && {
      goal: "Visible Abs at Rest",
      reason: isDexa
        ? "DEXA directly calibrates the body-fat estimate behind the visible-abs goal."
        : `${formatEvidenceLabel(evidenceType)} can affect progress only after the Evidence Engine confirms it changes the trajectory.`,
    },
    affectsLeanMass && {
      goal: "Preserve Lean Mass",
      reason: isDexa
        ? "DEXA directly measures lean mass and materially updates confidence in muscle preservation."
        : `${formatEvidenceLabel(evidenceType)} may inform lean-mass confidence when paired with supporting evidence.`,
    },
    isDexa && {
      goal: "Body Fat Goal",
      reason: "DEXA is the highest-confidence evidence type for current body-fat status.",
    },
  ].filter(Boolean);
  const numericValues = values.filter((value) => value.value_type === "number");
  const confidenceCanChange =
    isDexa || (affectedGoals.length > 0 && numericValues.length > 0);

  return {
    affectedGoals,
    confidenceChanges: confidenceCanChange
      ? [
          {
            direction: "possible",
            reason:
              "Structured numeric evidence is available, but confidence changes require comparison against history.",
          },
        ]
      : [],
    trajectoryChanges: [],
    predictionChanges: [],
    reasons:
      affectedGoals.length > 0
        ? affectedGoals.map((item) => item.reason)
        : ["No meaningful goal impact detected from this evidence alone."],
    noMeaningfulImpact: affectedGoals.length === 0,
    currentGoalConfidence: baseBriefing?.hero?.confidence ?? null,
  };
}

function createBriefingPreview({ evidencePackage, goalPreview, run, values }) {
  const isDexa = ["body_composition", "dexa", "dexa_scan"].includes(
    evidencePackage.detected_evidence_type
  );

  if (isDexa) {
    const scans = evidencePackage.evidence_objects ?? [];
    const scan = scans[0] ?? {};
    const scanCount = scans.length;

    return {
      generated: true,
      headline:
        scanCount > 1
          ? `${scanCount} DEXA scans materially update body-composition history.`
          : "DEXA materially updates body-composition confidence.",
      statements: [
        `${scanCount > 1 ? "These DEXA reports provide" : "Today's DEXA provides"} high-confidence body composition evidence${
          scan.bodyFatPercentage != null ? ` at ${scan.bodyFatPercentage}% body fat` : ""
        }${
          scan.fatMass?.value != null && scan.leanMass?.value != null
            ? `, with ${scan.fatMass.value} lb fat mass and ${scan.leanMass.value} lb lean mass`
            : ""
        }.`,
        "This scan should update body-fat, lean-mass, and visible-abs confidence without creating duplicate historical scans from comparison tables.",
      ],
      omittedClaims: getUnsupportedClaims(evidencePackage.detected_evidence_type),
      provenanceRefs: getEvidencePackageProvenanceRefs(evidencePackage),
    };
  }

  if (goalPreview.noMeaningfulImpact) {
    return {
      generated: false,
      headline: "No Daily Briefing headline generated.",
      statements: [
        `${formatEvidenceLabel(evidencePackage.detected_evidence_type)} evidence was stored, but it does not materially change today's coaching by itself.`,
      ],
      omittedClaims: getUnsupportedClaims(evidencePackage.detected_evidence_type),
      provenanceRefs: getEvidencePackageProvenanceRefs(evidencePackage),
    };
  }

  return {
    generated: true,
    headline: run.decision?.leadStory?.title ?? "Evidence may affect today's briefing.",
    statements: [
      `${formatEvidenceLabel(evidencePackage.detected_evidence_type)} evidence is available for the briefing if it changes the user's physiology, confidence, or execution decision.`,
      values.length > 0
        ? `${values.length} extracted value${values.length === 1 ? "" : "s"} can be referenced with provenance.`
        : "No extracted values are strong enough to reference directly yet.",
    ],
    omittedClaims: getUnsupportedClaims(evidencePackage.detected_evidence_type),
    provenanceRefs: getEvidencePackageProvenanceRefs(evidencePackage),
  };
}

function getUnsupportedClaims(evidenceType) {
  const common = [
    "Do not claim body fat changed unless body-composition or visual evidence supports it.",
    "Do not claim lean mass is preserved unless DEXA, training, or strong supporting evidence supports it.",
  ];

  if (["training", "nutrition", "recovery", "sleep", "activity"].includes(evidenceType)) {
    return [
      ...common,
      `${formatEvidenceLabel(evidenceType)} evidence alone should not claim visual progress.`,
    ];
  }

  return common;
}

function getEvidencePackageProvenanceRefs(evidencePackage) {
  return evidencePackage.provenance?.source_artifacts?.map((artifact) => artifact.id) ?? [];
}

function createCoachingPreview({ briefingPreview, evidencePackage, goalPreview }) {
  if (goalPreview.noMeaningfulImpact || !briefingPreview.generated) {
    return {
      generated: false,
      text: "No coaching generated.",
      reason:
        "The evidence can be stored for history, but it does not create a supported decision or behavior change by itself.",
      provenanceRefs: getEvidencePackageProvenanceRefs(evidencePackage),
    };
  }

  return {
    generated: true,
    text:
      "Coaching would be generated only after the Evidence Engine confirms this evidence changes today's decision.",
    reason:
      "The simulator detected possible goal relevance, but production coaching should remain conservative.",
    provenanceRefs: getEvidencePackageProvenanceRefs(evidencePackage),
  };
}

async function createPhotoEvidencePacket({ formData }) {
  const photos = formData
    .getAll("photos")
    .filter((file) => typeof file.arrayBuffer === "function" && file.size > 0);
  const previousPhotos = formData
    .getAll("previousPhotos")
    .filter((file) => typeof file.arrayBuffer === "function" && file.size > 0);

  if (photos.length === 0) throw new Error("Upload at least one progress photo.");

  const manualCaptureDate = normalizeString(formData.get("captureDate"));
  const manualPreviousCaptureDate = normalizeString(formData.get("previousCaptureDate"));
  const uploadDate = getTodayKey();
  const photoInputs = await Promise.all(
    photos.map((file) =>
      fileToPhotoInput({
        fallbackCapturedAt: manualCaptureDate ?? uploadDate,
        fallbackSource: manualCaptureDate ? "manual" : "upload",
        file,
      })
    )
  );
  const captureDate = manualCaptureDate ?? photoInputs[0]?.capturedAt ?? uploadDate;
  const previousPhotoInputs = await Promise.all(
    previousPhotos.map((file) =>
      fileToPhotoInput({
        fallbackCapturedAt: manualPreviousCaptureDate ?? manualCaptureDate ?? uploadDate,
        fallbackSource:
          manualPreviousCaptureDate || manualCaptureDate ? "manual" : "upload",
        file,
      })
    )
  );
  const previousCaptureDate =
    manualPreviousCaptureDate ??
    previousPhotoInputs[0]?.capturedAt ??
    captureDate;
  const photoSetId = `lab_photo_set_${Date.now()}`;
  const previousPhotoSet =
    previousPhotoInputs.length > 0
      ? {
          captureDate: previousCaptureDate,
          photoSetId: `lab_previous_photo_set_${Date.now()}`,
          photos: previousPhotoInputs,
        }
      : null;
  const result = await interpretPhotoSetWithVision({
    captureDate,
    goalContext: "Visible Abs at Rest",
    photoSetId,
    photos: photoInputs,
    previousPhotoSet,
  });
  const interpretation = result.interpretation;
  const richEvidenceObject = {
    id: photoSetId,
    capturedAt: captureDate,
    evidenceType: "progress_photo",
    interpretation,
    photos: photoInputs.map((photo) => ({
      capturedAt: photo.capturedAt,
      fileName: photo.fileName,
      pose: photo.pose,
      view: photo.view,
    })),
    provider: result.provider,
    warning: result.warning,
  };

  return {
    interpreterOutput: {
      briefingSummary: {
        biggestChanges:
          interpretation.briefing_summary?.biggest_changes ??
          interpretation.visual_changes_observed ??
          [],
        goalImpact:
          interpretation.briefing_summary?.goal_impact ??
          interpretation.goal_relevance?.join(" ") ??
          "Photo evidence can support visible goal reasoning.",
        nextStep:
          interpretation.briefing_summary?.next_step ??
          interpretation.strategy_recommendation ??
          "Continue the current plan.",
        summary:
          interpretation.briefing_summary?.summary ??
          interpretation.user_facing_summary ??
          "Photo evidence was interpreted.",
        whyTheyMatter:
          interpretation.briefing_summary?.why_they_matter ??
          "Visual evidence helps confirm whether the cut is revealing the physique in the way the goal requires.",
      },
      detailedInterpretation:
        interpretation.detailed_interpretation?.summary ??
        interpretation.coach_briefing_insert ??
        "PhotoInterpreter returned structured visual evidence.",
      structuredObservations: createPhotoStructuredObservations(interpretation),
      source: "PhotoInterpreter V1",
    },
    loggedEvidence: {
      capturedAt: new Date().toISOString(),
      currentBodyFat: "From current Founder state",
      currentWeight: "From current Founder state",
      id: photoSetId,
      label: "Today's Progress Photos",
      summary: interpretation.user_facing_summary ?? "Progress photos uploaded.",
      type: "photos",
    },
    richEvidenceObject,
  };
}

function createPhotoStructuredObservations(interpretation) {
  const observations = [];

  addObservationGroup({
    observations,
    values: interpretation.briefing_summary?.biggest_changes,
    confidence: "moderate",
    importance: "high",
    type: "briefing_observation",
  });
  addObservationGroup({
    observations,
    values: interpretation.silhouette_observations,
    confidence: "moderate",
    importance: "high",
    type: "silhouette",
  });
  addObservationGroup({
    observations,
    values: interpretation.ratio_observations,
    confidence: "moderate",
    importance: "high",
    type: "proportion",
  });
  addObservationGroup({
    observations,
    values: interpretation.high_confidence_observations,
    confidence: "high",
    importance: "high",
    type: "high_confidence",
  });
  addObservationGroup({
    observations,
    values: interpretation.emerging_evidence,
    confidence: "moderate",
    importance: "medium",
    type: "emerging_evidence",
  });
  addObservationGroup({
    observations,
    values: interpretation.uncertain_or_limited_observations,
    confidence: "low",
    importance: "limitation",
    type: "limitation",
    supportsGoal: false,
  });

  for (const entry of interpretation.observation_confidence ?? []) {
    observations.push({
      change: entry.observation,
      confidence: entry.confidence,
      importance: entry.meaningful_change_supported ? "high" : "medium",
      limitations: entry.basis ? [entry.basis] : [],
      region: inferObservationRegion(entry.observation),
      supportsGoal: Boolean(entry.meaningful_change_supported),
      type: "confidence_observation",
    });
  }

  for (const section of interpretation.detailed_interpretation?.sections ?? []) {
    observations.push({
      change: section.what_changed,
      confidence: section.confidence ?? "moderate",
      importance: section.status === "improved" ? "high" : "medium",
      limitations: [section.what_cannot_be_determined, section.confidence_note].filter(Boolean),
      region: section.region ?? inferObservationRegion(section.what_changed),
      supportsGoal: section.status !== "not_visible",
      type: "regional_review",
      unchanged: section.what_did_not_change,
      why: section.why_it_matters ?? section.why,
    });
  }

  return uniqueObservationObjects(observations).slice(0, 16);
}

function addObservationGroup({
  confidence,
  importance,
  observations,
  supportsGoal = true,
  type,
  values,
}) {
  for (const value of values ?? []) {
    observations.push({
      change: value,
      confidence,
      importance,
      limitations: [],
      region: inferObservationRegion(value),
      supportsGoal,
      type,
    });
  }
}

function inferObservationRegion(value = "") {
  const text = String(value).toLowerCase();
  if (/shoulder-to-waist|ratio|proportion|v-taper|taper/.test(text)) {
    return "Proportions";
  }
  if (/waist|lower abdomen|midsection|torso|ab|oblique|linea alba/.test(text)) {
    return "Midsection";
  }
  if (/chest|pec/.test(text)) return "Chest";
  if (/shoulder|arm|upper body|triceps|biceps/.test(text)) return "Upper body";
  if (/conditioning|leaner|silhouette|shape|softness/.test(text)) {
    return "Overall physique";
  }
  if (/weight|scale|weigh/.test(text)) return "Weight trend";

  return "Photo evidence";
}

function uniqueObservationObjects(observations) {
  const seen = new Set();

  return observations.filter((observation) => {
    const key = `${observation.region}:${observation.change}`;
    if (!observation.change || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function createWeightEvidencePacket({
  formData,
  measuredAtFieldName = "measuredAt",
  user,
  weightFieldName = "weight",
}) {
  const weightValue = Number(formData.get(weightFieldName));
  if (!Number.isFinite(weightValue) || weightValue <= 0) {
    throw new Error("Enter a valid weight.");
  }

  const measuredAt = normalizeString(formData.get(measuredAtFieldName)) ?? getTodayKey();
  const now = new Date().toISOString();
  const latestWeight = user?.id
    ? await FounderRepositories.weights.getLatestWeightEntry(user.id)
    : null;
  const weightEntry = createWeightEntry({
    id: `lab_weight_${measuredAt.replaceAll("-", "_")}_${Date.now()}`,
    userId: user?.id ?? "founder",
    measuredAt,
    relatedGoalIds: [BODY_FAT_GOAL_ID, VISIBLE_ABS_GOAL_ID],
    weight: {
      unit: user?.preferences?.weightUnit ?? "lb",
      value: weightValue,
    },
    context: {
      confidence: "high",
      intakeState: "before_food_water",
      isDefault: true,
      nutritionState: "fasted",
      scale: "normal_home_scale",
      timing: "morning",
    },
    source: {
      confidence: "high",
      name: "Narrative Engine Lab",
      type: "manual",
    },
    createdAt: now,
    updatedAt: now,
  });
  const analysis = createAnalysisFromEvidence({
    analysisId: `lab_analysis_weight_${Date.now()}`,
    confidenceAfter: 0.68,
    confidenceBefore: 0.62,
    createdAt: now,
    id: weightEntry.id,
    measuredAt,
    previousMeasuredAt: latestWeight?.measuredAt ?? null,
    previousValue: latestWeight?.weight?.value ?? null,
    type: "weight",
    unit: weightEntry.weight.unit,
    value: weightEntry.weight.value,
  });
  const change =
    typeof latestWeight?.weight?.value === "number"
      ? Number((weightValue - latestWeight.weight.value).toFixed(1))
      : null;
  const changeSummary = formatWeightChangeForBriefing(change, weightEntry.weight.unit);

  return {
    interpreterOutput: {
      briefingSummary: {
        biggestChanges: [
          change === null
            ? `Morning weight logged at ${weightValue.toFixed(1)} ${weightEntry.weight.unit}.`
            : changeSummary,
        ],
        goalImpact:
          "Weight updates the fat-loss trend and helps show whether the current cut is still moving.",
        nextStep:
          "Keep using photos and DEXA as context before changing the plan from one weigh-in.",
        summary: "Today's weigh-in updates the current trend.",
        whyTheyMatter:
          "Scale movement is useful when it is interpreted alongside visual progress and DEXA calibration.",
      },
      detailedInterpretation: analysis.summary,
      source: "Weight trend interpreter",
    },
    loggedEvidence: {
      capturedAt: now,
      currentBodyFat: "From current Founder state",
      currentWeight: `${weightValue.toFixed(1)} ${weightEntry.weight.unit}`,
      id: weightEntry.id,
      label: "Today's Morning Weight",
      summary: analysis.summary,
      type: "weight",
    },
    richEvidenceObject: {
      analysis,
      evidenceType: "weight",
      weightEntry,
    },
  };
}

function formatWeightChangeForBriefing(change, unit) {
  if (change === 0) return `The scale was unchanged this morning.`;
  const direction = change > 0 ? "up" : "down";

  return `The scale was ${direction} ${Math.abs(change).toFixed(1)} ${unit} this morning.`;
}

async function createDexaEvidencePacket({ formData, user }) {
  const files = formData
    .getAll("dexaPdf")
    .filter((file) => typeof file.arrayBuffer === "function" && file.size > 0);
  const now = new Date().toISOString();
  const pdfInterpretation = interpretPdfEvidence({
    capturedAt: now,
    files:
      files.length > 0
        ? await Promise.all(
            files.map(async (file, index) => ({
              capturedAt: now,
              fileName: file.name,
              id: `lab_dexa_pdf_${Date.now()}_${index + 1}`,
              text: await getUploadText(file),
            }))
          )
        : [
            {
              capturedAt: now,
              fileName: "BodySpec DEXA report.pdf",
              id: `lab_dexa_pdf_${Date.now()}_1`,
            },
          ],
    id: `lab_dexa_${Date.now()}`,
    userId: user?.id ?? "founder",
  });
  const scan = pdfInterpretation.scan ?? pdfInterpretation.scans?.[0];
  const scanCount = pdfInterpretation.scans?.length ?? 0;
  const summary =
    scanCount > 1
      ? `${scanCount} BodySpec DEXA reports interpreted as separate scans.`
      : scan?.bodyFatPercentage != null
        ? `BodySpec DEXA interpreted at ${scan.bodyFatPercentage.toFixed(1)}% body fat with ${scan.leanMass.value.toFixed(1)} lb lean mass.`
      : "DEXA report uploaded for calibration review.";

  return {
    interpreterOutput: {
      briefingSummary: {
        biggestChanges: [summary],
        goalImpact:
          "DEXA materially updates body-fat, lean-mass, and visible-abs confidence because it is high-confidence body-composition evidence.",
        nextStep: "Use the scan to recalibrate the plan while checking it against weight and photos.",
        summary: "Today's DEXA provides a high-confidence body-composition anchor.",
        whyTheyMatter:
          "Body fat, fat mass, lean mass, VAT, regional composition, and bone metrics are now available as structured evidence.",
      },
      detailedInterpretation: JSON.stringify(pdfInterpretation.extractedFields, null, 2),
      source: "DEXA/PDF interpreter",
    },
    loggedEvidence: {
      capturedAt: now,
      currentBodyFat:
        scan?.bodyFatPercentage != null
          ? `${scan.bodyFatPercentage.toFixed(1)}%`
          : "Pending",
      currentWeight:
        scan?.totalMass?.value != null ? `${scan.totalMass.value.toFixed(1)} lb` : "Pending",
      id: scan?.id ?? `lab_dexa_${Date.now()}`,
      label: scanCount > 1 ? "DEXA reports" : "Today's DEXA",
      summary,
      type: "dexa",
    },
    richEvidenceObject: {
      evidencePackage: pdfInterpretation.evidencePackage,
      evidenceType: "dexa",
      pdfInterpretation,
      scan,
    },
  };
}

function createGenericEvidencePacket({
  evidenceType,
  formData,
  inferredType = null,
}) {
  const evidenceConfig = getLabEvidenceConfig(evidenceType);
  const inputMethod = normalizeString(formData.get("inputMethod")) ?? "upload";
  const note = normalizeString(formData.get("evidenceNote"));
  const measuredAt = normalizeString(formData.get("measuredAt")) ?? getTodayKey();
  const files = [
    ...formData
      .getAll("evidenceUpload")
      .filter((file) => typeof file.arrayBuffer === "function" && file.size > 0),
    ...formData
      .getAll("anythingUpload")
      .filter((file) => typeof file.arrayBuffer === "function" && file.size > 0),
  ];
  const detectedType =
    inferredType ??
    inferGenericEvidenceType({
      evidenceType,
      files,
      note,
    });
  const extractedFields = extractGenericEvidenceFields({
    detectedType,
    evidenceType,
    files,
    inputMethod,
    note,
  });
  const label =
    evidenceType === "auto"
      ? `Auto-classified ${formatEvidenceLabel(detectedType)}`
      : `Today's ${evidenceConfig.label}`;
  const summary =
    extractedFields.summary ??
    `${evidenceConfig.label} evidence was provided through ${inputMethod}.`;
  const trainingInterpretation =
    detectedType === "training" && note
      ? inputMethod === "voice"
        ? interpretVoiceEvidence({
            capturedAt: new Date().toISOString(),
            id: `lab_voice_training_${Date.now()}`,
            measuredAt,
            provenanceRef: "voice_transcript_0",
            sourceArtifactRefs: ["voice_transcript_0"],
            transcript: note,
          })
        : interpretTextEvidence({
            capturedAt: new Date().toISOString(),
            expectedEvidenceType: "training",
            id: `lab_manual_training_${Date.now()}`,
            measuredAt,
            provenanceRef: "typed_evidence_0",
            sourceArtifactRefs: ["typed_evidence_0"],
            text: note,
            type: "manual",
          })
      : null;
  const textInterpretation =
    ["training", "nutrition"].includes(detectedType) && note && !trainingInterpretation
      ? interpretTextEvidence({
          capturedAt: new Date().toISOString(),
          expectedEvidenceType: detectedType,
          id: `lab_manual_${detectedType}_${Date.now()}`,
          measuredAt,
          provenanceRef: "typed_evidence_0",
          sourceArtifactRefs: ["typed_evidence_0"],
          text: note,
          type: "manual",
        })
      : null;

  if (trainingInterpretation?.evidenceObjects?.length > 0) {
    return createTrainingInterpreterEvidencePacket({
      detectedType,
      evidenceConfig,
      evidenceType,
      extractedFields,
      inputMethod,
      interpretation: trainingInterpretation,
      measuredAt,
      note,
    });
  }

  if (textInterpretation?.evidenceObjects?.length > 0) {
    return createCanonicalInterpreterEvidencePacket({
      detectedType,
      evidenceConfig,
      evidenceType,
      extractedFields,
      inputMethod,
      interpretation: textInterpretation,
      measuredAt,
      note,
    });
  }

  return {
    interpreterOutput: {
      briefingSummary: {
        biggestChanges: [summary],
        goalImpact:
          "This structured evidence is available to the Evidence Engine. Coaching should use it only if it changes today's understanding or decision.",
        nextStep:
          "Route the structured evidence through the Evidence Engine before deciding whether it belongs in the briefing.",
        summary,
        whyTheyMatter:
          "The interpreter extracts and normalizes evidence. It does not decide the coaching story.",
      },
      detailedInterpretation: JSON.stringify(
        {
          detectedType,
          extractedFields,
          interpreterBoundary:
            "Interpreter output ends at structured evidence. Coaching happens downstream.",
        },
        null,
        2
      ),
      source: `${evidenceConfig.label} Interpreter Simulator`,
      structuredObservations: [
        {
          change: summary,
          confidence: extractedFields.confidence,
          importance: "medium",
          limitations: extractedFields.limitations,
          region: evidenceConfig.label,
          supportsGoal: false,
          type: "structured_evidence",
        },
      ],
    },
    loggedEvidence: {
      capturedAt: new Date().toISOString(),
      currentBodyFat: "From current Founder state",
      currentWeight: "From current Founder state",
      id: `lab_${evidenceType}_${Date.now()}`,
      label,
      summary,
      type: evidenceType,
    },
    richEvidenceObject: {
      detectedType,
      evidenceType,
      extractedFields,
      files: files.map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type,
      })),
      inputMethod,
      measuredAt,
      note,
      persisted: false,
    },
  };
}

function createVoiceEvidencePacket({ evidenceType, formData }) {
  const evidenceConfig = getLabEvidenceConfig(evidenceType);
  const transcript = normalizeString(formData.get("evidenceNote")) ?? "";
  const measuredAt = normalizeString(formData.get("measuredAt")) ?? getTodayKey();
  const expectedEvidenceType =
    evidenceType === "auto" || evidenceType === "voice" ? "auto" : evidenceType;
  const now = new Date().toISOString();
  const interpretation = interpretVoiceEvidence({
    capturedAt: now,
    expectedEvidenceType,
    id: `lab_voice_${Date.now()}`,
    observedAt: measuredAt,
    provenanceRef: "voice_transcript_0",
    sourceArtifactRefs: ["voice_transcript_0"],
    transcript,
  });
  const activeWorkoutContext = parseActiveWorkoutContext(
    formData.get("activeWorkoutContext")
  );
  const workoutAttachment = attachVoiceEvidenceToActiveWorkout({
    activeWorkoutContext,
    attachedAt: now,
    interpretation,
    transcript,
  });
  const attachedInterpretation = {
    ...interpretation,
    evidenceObjects: workoutAttachment.evidenceObjects,
    mergedEvidenceObjects: workoutAttachment.evidenceObjects,
    workoutAttachment,
  };
  const clarificationPlan = getVoiceClarificationPlan({
    completionPhraseDetectedInOriginalTranscript:
      interpretation.completionPhraseDetectedInOriginalTranscript,
    detectedEvidenceIntents: interpretation.detectedEvidenceIntents,
    evidenceObjects: attachedInterpretation.evidenceObjects,
    numericResilience: interpretation.numericResilience,
    primaryIntent: interpretation.primaryIntent,
    resolvedClarificationIds: formData.getAll("resolvedClarificationIds").map(String),
    transcript: interpretation.dedupedNarrative ?? transcript,
  });
  const detectedType = getDetectedTypeFromVoiceInterpretation(interpretation);
  const extractedFields = {
    confidence: interpretation.confidence,
    detectedType,
    inputMethod: "voice",
    limitations:
      attachedInterpretation.evidenceObjects.length > 0
        ? []
        : ["Transcript did not contain enough evidence to create a canonical object."],
    sourceCategory: evidenceType,
    summary: createVoiceEvidenceSummary({
      evidenceObjects: attachedInterpretation.evidenceObjects,
      transcript,
    }),
    uploadedFiles: [],
  };

  return createCanonicalInterpreterEvidencePacket({
    clarificationPlan,
    detectedType,
    evidenceConfig,
    evidenceType,
    extractedFields,
    inputMethod: "voice",
    interpretation: attachedInterpretation,
    measuredAt,
    note: transcript,
  });
}

function parseActiveWorkoutContext(value) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(String(value));
    return parsed?.id && parsed?.evidence_type === "training" ? parsed : null;
  } catch {
    return null;
  }
}

function createCanonicalInterpreterEvidencePacket({
  clarificationPlan = null,
  detectedType,
  evidenceConfig,
  evidenceType,
  extractedFields,
  inputMethod,
  interpretation,
  measuredAt,
  note,
}) {
  const now = new Date().toISOString();
  const packageId = `lab_${inputMethod}_${detectedType}_${Date.now()}`;
  const evidenceObjects = interpretation.evidenceObjects.map((object, index) => ({
    ...object,
    id: object.id ?? `${packageId}_object_${index + 1}`,
    captured_at: object.captured_at ?? now,
    observed_at: object.observed_at ?? measuredAt,
  }));
  const evidencePackage = {
    package_id: packageId,
    schema_version: "physiqueos-evidence-v1",
    source_modality: inputMethod === "voice" ? "voice" : "manual",
    detected_source_application: null,
    detected_source_confidence: "moderate",
    detected_evidence_type: detectedType,
    detected_evidence_objects: getDetectedEvidenceObjectCounts(evidenceObjects),
    detected_evidence_type_confidence: "high",
    captured_at: now,
    interpreter: {
      name: inputMethod === "voice" ? "VoiceInterpreter" : "ManualEntryInterpreter",
      version: detectedType === "nutrition" ? "nutrition-day-v1" : "training-session-v1",
      provider: "internal",
      model: null,
    },
    quality: {
      extraction_confidence: "moderate",
      interpreter_confidence: "moderate",
      status: "partial",
      limitations: [
        "Manual evidence was normalized into the canonical evidence schema. Completeness depends on what the user typed.",
      ],
    },
    evidence_objects: evidenceObjects,
    provenance: {
      submission_id: packageId,
      source_artifacts: [
        {
          id: inputMethod === "voice" ? "voice_transcript_0" : "typed_evidence_0",
          kind: inputMethod === "voice" ? "voice_transcript" : "typed_evidence",
          file_name:
            inputMethod === "voice"
              ? "voice-transcript.txt"
              : "manual-evidence-entry.txt",
          mime_type: "text/plain",
          uploaded_at: now,
        },
      ],
    },
    voice_conversation:
      inputMethod === "voice"
        ? {
            conversational_resolution: interpretation.conversationalResolution,
            entity_resolution: interpretation.entityResolution,
            detected_evidence_intents: interpretation.detectedEvidenceIntents,
            detected_primary_intent: interpretation.detectedPrimaryIntent,
            clause_segmentation: interpretation.clauseSegmentation,
            numeric_resilience: interpretation.numericResilience,
            completion_phrase_detected_in_original_transcript:
              interpretation.completionPhraseDetectedInOriginalTranscript,
            user_ended_interaction: interpretation.userEndedInteraction,
            numeric_ambiguities: interpretation.numericAmbiguities,
            suspicious_numeric_values: interpretation.suspiciousNumericValues,
            domain_plausibility_checks: interpretation.domainPlausibilityChecks,
            accepted_numeric_corrections: interpretation.acceptedNumericCorrections,
            rejected_numeric_values: interpretation.rejectedNumericValues,
            active_prompt_context_applied: interpretation.activePromptContextApplied,
            transcription_confidence_notes:
              interpretation.transcriptionConfidenceNotes,
            intent_confidence: interpretation.intentConfidence,
            interpreter_outputs: interpretation.interpreterOutputs,
            merged_evidence_objects: interpretation.mergedEvidenceObjects,
            evidence_lifetime: interpretation.evidenceLifetime,
            primary_intent: interpretation.primaryIntent,
            resolved_transcript: interpretation.resolvedTranscript,
            deduped_narrative: interpretation.dedupedNarrative,
            repeated_follow_up_fragments:
              interpretation.repeatedFollowUpFragments ?? [],
            repetition_deduping_applied:
              interpretation.repetitionDedupingApplied ?? false,
            narrative_deduplication: interpretation.narrativeDeduplication,
            workout_attachment: interpretation.workoutAttachment?.diagnostics ?? null,
            workout_attachment_conflict: interpretation.workoutAttachment?.conflict ?? null,
            target_before_enrichment:
              interpretation.workoutAttachment?.targetBeforeEnrichment ?? null,
            voice_training_interpretation:
              interpretation.workoutAttachment?.voiceInterpretation ?? null,
            updated_workout_target:
              interpretation.workoutAttachment?.updatedTarget ?? null,
            transcript: note,
            clarification_plan: clarificationPlan,
            conversation_state_transitions: [
              "listening",
              "transcribing",
              "entity_resolution",
              "intent_routing",
              "parallel_interpreters",
              "evidence_merge",
              "clarification_ranking",
              "review",
              "saved",
            ],
            states: ["listening", "interpreting", "clarifying", "review", "saved"],
          }
        : undefined,
  };
  const summary = `${formatEvidenceLabel(detectedType)} Evidence package created from ${
    inputMethod === "voice" ? "voice transcript" : "typed entry"
  }: ${evidenceObjects.length} canonical object${evidenceObjects.length === 1 ? "" : "s"}.`;

  return {
    interpreterOutput: {
      briefingSummary: {
        biggestChanges: [summary],
        goalImpact:
          "The evidence is available to downstream engines through the same canonical schema used by other modalities.",
        nextStep:
          "Store the canonical evidence object and let downstream engines decide whether it changes goals or coaching.",
        summary,
        whyTheyMatter:
          "Input modality changes provenance and completeness, not the evidence contract.",
      },
      detailedInterpretation: JSON.stringify(evidencePackage, null, 2),
      source: `${evidenceConfig.label} Interpreter Simulator`,
      structuredObservations: [
        {
          change: summary,
          confidence: extractedFields.confidence,
          importance: "medium",
          limitations: extractedFields.limitations,
          region: evidenceConfig.label,
          supportsGoal: false,
          type: "structured_evidence",
        },
      ],
    },
    loggedEvidence: {
      capturedAt: now,
      currentBodyFat: "From current Founder state",
      currentWeight: "From current Founder state",
      id: packageId,
      label: `Today's ${evidenceConfig.label}`,
      summary,
      type: evidenceType === "auto" ? detectedType : evidenceType,
    },
    richEvidenceObject: {
      clarificationPlan,
      detectedType,
      evidencePackage,
      evidenceType: detectedType,
      extractedFields,
      inputMethod,
      measuredAt,
      note,
      persisted: false,
    },
  };
}

function createTrainingInterpreterEvidencePacket({
  detectedType,
  evidenceConfig,
  evidenceType,
  extractedFields,
  inputMethod,
  interpretation,
  measuredAt,
  note,
}) {
  const now = new Date().toISOString();
  const packageId = `lab_${inputMethod}_training_${Date.now()}`;
  const sourceModality = inputMethod === "voice" ? "voice" : "manual";
  const sourceArtifactId = inputMethod === "voice" ? "voice_transcript_0" : "typed_evidence_0";
  const evidenceObjects = interpretation.evidenceObjects.map((object, index) => ({
    ...object,
    id: object.id ?? `${packageId}_training_${index + 1}`,
    captured_at: object.captured_at ?? now,
    observed_at: object.observed_at ?? measuredAt,
  }));
  const evidencePackage = {
    package_id: packageId,
    schema_version: "physiqueos-evidence-v1",
    source_modality: sourceModality,
    detected_source_application: null,
    detected_source_confidence: "moderate",
    detected_evidence_type: detectedType,
    detected_evidence_type_confidence: "high",
    captured_at: now,
    interpreter: {
      name: inputMethod === "voice" ? "VoiceInterpreter" : "ManualEntryInterpreter",
      version: "training-session-v1",
      provider: "internal",
      model: null,
    },
    quality: {
      extraction_confidence: "moderate",
      interpreter_confidence: "moderate",
      status: "partial",
      limitations: [
        "Typed or voice training evidence can identify exercises and sets, but workout metadata remains limited without a connected training source.",
      ],
    },
    evidence_objects: evidenceObjects,
    provenance: {
      submission_id: packageId,
      source_artifacts: [
        {
          id: sourceArtifactId,
          kind: sourceModality === "voice" ? "voice_transcript" : "typed_evidence",
          file_name: sourceModality === "voice" ? "voice-transcript.txt" : "manual-training-entry.txt",
          mime_type: "text/plain",
          uploaded_at: now,
        },
      ],
    },
  };
  const summary = `Training Evidence package created from ${
    inputMethod === "voice" ? "voice transcript" : "typed entry"
  }: ${evidenceObjects.length} TrainingSession object.`;

  return {
    interpreterOutput: {
      briefingSummary: {
        biggestChanges: [summary],
        goalImpact:
          "This TrainingSession object is available to the Evidence Engine without exposing whether it came from manual, voice, screenshot, or API input.",
        nextStep:
          "Store the TrainingSession object and let downstream engines decide whether it changes goals or coaching.",
        summary,
        whyTheyMatter:
          "All training modalities now converge on the same canonical resistance-training schema.",
      },
      detailedInterpretation: JSON.stringify(evidencePackage, null, 2),
      source: `${evidenceConfig.label} Interpreter Simulator`,
      structuredObservations: [
        {
          change: summary,
          confidence: extractedFields.confidence,
          importance: "medium",
          limitations: extractedFields.limitations,
          region: evidenceConfig.label,
          supportsGoal: false,
          type: "structured_evidence",
        },
      ],
    },
    loggedEvidence: {
      capturedAt: now,
      currentBodyFat: "From current Founder state",
      currentWeight: "From current Founder state",
      id: packageId,
      label: `Today's ${evidenceConfig.label}`,
      summary,
      type: evidenceType === "auto" ? detectedType : evidenceType,
    },
    richEvidenceObject: {
      detectedType,
      evidencePackage,
      evidenceType: detectedType,
      extractedFields,
      inputMethod,
      measuredAt,
      note,
      persisted: false,
    },
  };
}

function getLabEvidenceConfig(evidenceType) {
  return (
    {
      auto: {
        id: "auto",
        label: "Evidence",
        shortLabel: "Evidence",
      },
      photos: {
        id: "photos",
        label: "Progress Photos",
        shortLabel: "Photos",
      },
      weight: {
        id: "weight",
        label: "Morning Weight",
        shortLabel: "Weight",
      },
      dexa: {
        id: "dexa",
        label: "DEXA",
        shortLabel: "DEXA",
      },
      nutrition: {
        id: "nutrition",
        label: "Nutrition",
        shortLabel: "Nutrition",
      },
      training: {
        id: "training",
        label: "Training",
        shortLabel: "Training",
      },
      activity: {
        id: "activity",
        label: "Activity",
        shortLabel: "Activity",
      },
      recovery: {
        id: "recovery",
        label: "Recovery",
        shortLabel: "Recovery",
      },
      labs: {
        id: "labs",
        label: "Labs",
        shortLabel: "Labs",
      },
      protocol: {
        id: "protocol",
        label: "Protocol",
        shortLabel: "Protocol",
      },
      voice: {
        id: "voice",
        label: "Voice Note",
        shortLabel: "Voice",
      },
    }[evidenceType] ?? {
      id: evidenceType,
      label: "Evidence",
      shortLabel: "Evidence",
    }
  );
}

function inferGenericEvidenceType({ evidenceType, files, note }) {
  if (evidenceType !== "auto") return evidenceType;

  const text = `${note ?? ""} ${files.map((file) => file.name).join(" ")}`.toLowerCase();

  if (/nutrition|calorie|protein|macro|myfitnesspal|cronometer/.test(text)) {
    return "nutrition";
  }
  if (/training|workout|lift|run|bike|swim|strength/.test(text)) {
    return "training";
  }
  if (/activity|move ring|exercise ring|stand ring|apple fitness|apple activity/.test(text)) {
    return "activity_day";
  }
  if (/sleep|recovery|foam|hrv|readiness/.test(text)) return "recovery";
  if (/lab|blood|lipid|glucose|testosterone/.test(text)) return "labs";
  if (/protocol|dose|retatrutide|tesamorelin|supplement/.test(text)) {
    return "protocol";
  }
  if (/weight|scale|weigh/.test(text)) return "weight";

  return files.length > 0 ? "unknown_upload" : "general_note";
}

function getDetectedTypeFromEvidenceObjects(evidenceObjects = []) {
  const types = [
    ...new Set(evidenceObjects.map((object) => object.evidence_type).filter(Boolean)),
  ];

  if (types.length === 0) return "unstructured_voice";
  if (types.length === 1) return types[0];

  return "mixed";
}

function getDetectedTypeFromVoiceInterpretation(interpretation = {}) {
  const detectedType = getDetectedTypeFromEvidenceObjects(
    interpretation.evidenceObjects
  );

  if (detectedType !== "unstructured_voice") return detectedType;

  return interpretation.primaryIntent?.evidenceType ?? detectedType;
}

function createVoiceEvidenceSummary({ evidenceObjects = [], transcript }) {
  const counts = getDetectedEvidenceObjectCounts(evidenceObjects);
  const countSummary = counts
    .map((item) => `${item.count} ${item.canonical_name}`)
    .join(", ");

  if (countSummary) {
    return `Voice transcript produced ${countSummary}.`;
  }

  return summarizeNote(transcript) || "Voice transcript captured.";
}

function extractGenericEvidenceFields({
  detectedType,
  evidenceType,
  files,
  inputMethod,
  note,
}) {
  const normalizedNote = note ?? "";
  const uploaded = files.length > 0;
  const limitations = [];

  if (!uploaded && !normalizedNote) {
    limitations.push("No file or note was provided.");
  }
  if (uploaded && detectedType === "unknown_upload") {
    limitations.push("The simulator could not confidently classify this upload yet.");
  }

  return {
    confidence: uploaded || normalizedNote ? "building" : "low",
    detectedType,
    inputMethod,
    limitations,
    sourceCategory: evidenceType,
    summary: createGenericEvidenceSummary({
      detectedType,
      files,
      inputMethod,
      note: normalizedNote,
    }),
    uploadedFiles: files.map((file) => file.name),
  };
}

function createGenericEvidenceSummary({ detectedType, files, inputMethod, note }) {
  const fileSummary =
    files.length > 0
      ? `${files.length} uploaded file${files.length === 1 ? "" : "s"}`
      : null;
  const noteSummary = note ? summarizeNote(note) : null;
  const methodSummary =
    inputMethod === "voice"
      ? "voice transcript"
      : inputMethod === "type"
        ? "typed entry"
        : "upload";

  return [
    `Interpreter classified this as ${formatEvidenceLabel(detectedType)} evidence from ${methodSummary}.`,
    fileSummary,
    noteSummary,
  ]
    .filter(Boolean)
    .join(" ");
}

function formatEvidenceLabel(value) {
  return String(value ?? "evidence")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function summarizeNote(note) {
  const text = String(note ?? "").trim();
  if (text.length <= 120) return text;

  return `${text.slice(0, 117)}...`;
}

async function fileToPhotoInput({ fallbackCapturedAt, fallbackSource = "manual", file }) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const filenameMetadata = parseFilenameMetadata(file.name);
  const capturedAt = filenameMetadata.date ?? fallbackCapturedAt;

  return {
    capturedAt,
    conditions: {
      fasted: true,
      morning: true,
      postWorkout: false,
      pump: false,
      sameLighting: true,
      sameMirror: true,
    },
    dataUrl: `data:${file.type || "image/jpeg"};base64,${buffer.toString("base64")}`,
    fileName: file.name,
    metadataSource: filenameMetadata.date ? "filename" : fallbackSource,
    mimeType: file.type || "image/jpeg",
    pose: filenameMetadata.pose,
    view: filenameMetadata.view,
  };
}

async function fileToScreenshotInput(file) {
  const buffer = Buffer.from(await file.arrayBuffer());

  return {
    dataUrl: `data:${file.type || "image/png"};base64,${buffer.toString("base64")}`,
    fileName: file.name,
    mimeType: file.type || "image/png",
    uploadedAt: new Date().toISOString(),
  };
}

async function getUploadText(file) {
  if (typeof file?.text !== "function") return "";

  try {
    return (await file.text()).slice(0, 20000);
  } catch {
    return "";
  }
}

function getUploadedFiles(formData, fieldName) {
  return formData
    .getAll(fieldName)
    .filter((file) => typeof file.arrayBuffer === "function" && file.size > 0);
}

function isImageFile(file) {
  const mimeType = String(file?.type ?? "").toLowerCase();
  const fileName = String(file?.name ?? "").toLowerCase();

  return mimeType.startsWith("image/") || /\.(png|jpe?g|webp|gif|heic|heif)$/.test(fileName);
}

function isPdfFile(file) {
  const mimeType = String(file?.type ?? "").toLowerCase();
  const fileName = String(file?.name ?? "").toLowerCase();

  return mimeType.includes("pdf") || fileName.endsWith(".pdf") || /dexa|bodyspec/i.test(fileName);
}

function looksLikeProgressPhoto(files = []) {
  const names = files.map((file) => String(file.name ?? "").toLowerCase()).join(" ");

  return /progress|physique|front|rear|back|side|relaxed|flexed|double[-_\s]?biceps|pose|check[-_\s]?in/.test(
    names
  );
}

function createScreenshotStructuredObservations(evidencePackage) {
  return getEvidencePackageValues(evidencePackage).map((field) => ({
    change: `${field.label}: ${field.value ?? "Unknown"}${
      field.unit ? ` ${field.unit}` : ""
    }`,
    confidence: field.confidence ?? "low",
    importance: "medium",
    limitations: field.caveats ?? [],
    region: evidencePackage.detected_evidence_type ?? "Screenshot evidence",
    supportsGoal: false,
    type: "standardized_evidence_value",
  }));
}

function getEvidencePackageValueSummaries(evidencePackage) {
  const values = getEvidencePackageValues(evidencePackage)
    .slice(0, 4)
    .map((field) => `${field.label}: ${field.value ?? "Unknown"}${field.unit ? ` ${field.unit}` : ""}`);

  return values.length > 0
    ? values
    : [`${formatEvidenceLabel(evidencePackage.detected_evidence_type)} evidence package created.`];
}

function getEvidencePackageValues(evidencePackage) {
  return (evidencePackage.evidence_objects ?? []).flatMap(
    (evidenceObject) => evidenceObject.values ?? []
  );
}

function createEvidencePackageSummary(evidencePackage, evidenceConfig) {
  const objectCount = evidencePackage.evidence_objects?.length ?? 0;
  const valueCount = getEvidencePackageValues(evidencePackage).length;
  const source = evidencePackage.detected_source_application
    ? ` from ${evidencePackage.detected_source_application}`
    : "";

  return `${evidenceConfig.label} Evidence package created${source}: ${objectCount} object${
    objectCount === 1 ? "" : "s"
  }, ${valueCount} value${valueCount === 1 ? "" : "s"}.`;
}

function parseFilenameMetadata(fileName) {
  const lower = String(fileName ?? "").toLowerCase();

  return {
    date: inferDateFromFilename(fileName),
    pose: lower.includes("double") || lower.includes("flex")
      ? "flexed"
      : lower.includes("relaxed")
        ? "relaxed"
        : "unknown",
    view: lower.includes("front")
      ? "front"
      : lower.includes("side")
        ? "side"
        : lower.includes("back") || lower.includes("rear")
          ? "back"
          : "unknown",
  };
}

function inferDateFromFilename(fileName = "") {
  return String(fileName).match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}

function normalizeOptionalNumber(value) {
  const text = normalizeString(value);
  if (!text) return null;
  const number = Number(text);

  return Number.isFinite(number) ? number : null;
}

function normalizeString(value) {
  const text = String(value ?? "").trim();

  return text.length > 0 ? text : null;
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}
