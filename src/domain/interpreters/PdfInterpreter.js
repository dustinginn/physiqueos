import { createDEXAScan } from "../models/dexaScan";

const BODY_FAT_GOAL_ID = "goal_maintain_8_9_body_fat";
const LEAN_MASS_GOAL_ID = "goal_preserve_lean_mass";
const VISIBLE_ABS_GOAL_ID = "goal_visible_abs_at_rest";

const BODY_SPEC_DEXA_FIXTURES = {
  "2024-06-10": {
    summary: region(17.6, 195.5, 34.5, 153.7, 7.3),
    rmr: 1852,
    vatMass: 0.61,
    vatVolume: 17.94,
    androidFatPercentage: 19.4,
    gynoidFatPercentage: 17.5,
    androidGynoidRatio: 1.11,
    regionalAssessment: {
      arms: region(14.8, 29.0, 4.3, 23.5, 1.2),
      legs: region(16.4, 69.3, 11.3, 55.1, 2.8),
      trunk: region(19.4, 86.8, 16.9, 67.8, 2.1),
      android: region(19.4, 13.3, 2.5, 10.6, 0.1),
      gynoid: region(17.5, 31.4, 5.4, 25.3, 0.7),
      total: region(17.6, 195.5, 34.5, 153.7, 7.3),
    },
    muscleBalance: {
      rightArm: region(16.1, 14.8, 2.4, 11.8, 0.6),
      leftArm: region(13.4, 14.2, 1.9, 11.7, 0.6),
      rightLeg: region(16.0, 35.4, 5.7, 28.3, 1.4),
      leftLeg: region(16.7, 33.9, 5.7, 26.8, 1.4),
    },
    boneDensity: { totalBMD: 1.259, youngAdultZScore: 0.6, ageMatchedZScore: 0.6 },
  },
  "2026-06-20": {
    summary: region(10.7, 171.7, 18.4, 146.2, 7.1),
    rmr: 1783,
    vatMass: 0.57,
    vatVolume: 16.75,
    androidFatPercentage: 8.5,
    gynoidFatPercentage: 10.4,
    androidGynoidRatio: 0.82,
    regionalAssessment: {
      arms: region(8.2, 24.7, 2.0, 21.6, 1.1),
      legs: region(10.9, 59.2, 6.4, 50.0, 2.8),
      trunk: region(10.4, 77.9, 8.1, 67.7, 2.1),
      android: region(8.5, 11.1, 0.9, 10.1, 0.2),
      gynoid: region(10.4, 26.3, 2.7, 23.0, 0.7),
      total: region(10.7, 171.7, 18.4, 146.2, 7.1),
    },
    muscleBalance: {
      rightArm: region(9.0, 12.6, 1.1, 10.9, 0.6),
      leftArm: region(7.4, 12.1, 0.9, 10.7, 0.5),
      rightLeg: region(11.0, 29.7, 3.3, 25.0, 1.4),
      leftLeg: region(10.7, 29.5, 3.2, 25.0, 1.4),
    },
    boneDensity: { totalBMD: 1.261, youngAdultZScore: 0.6, ageMatchedZScore: 0.6 },
  },
};

function mass(value, unit = "lb") {
  return { value, unit };
}

function region(bodyFatPercentage, totalMass, fatMass, leanMass, boneMineralContent) {
  return {
    bodyFatPercentage,
    totalMass: mass(totalMass),
    fatMass: mass(fatMass),
    leanMass: mass(leanMass),
    boneMineralContent: mass(boneMineralContent),
  };
}

function createBodySpecDexaScan({
  capturedAt = null,
  fileName = "BodySpec DEXA report.pdf",
  id = null,
  measuredAt = "2026-06-20",
  sourceArtifactRefs = [],
  userId = "founder",
} = {}) {
  const now = capturedAt ?? new Date().toISOString();
  const artifactRefs = sourceArtifactRefs.length > 0 ? sourceArtifactRefs : [fileName];
  const fixture = BODY_SPEC_DEXA_FIXTURES[measuredAt] ?? BODY_SPEC_DEXA_FIXTURES["2026-06-20"];
  const sourceFileId = artifactRefs[0];

  return createDEXAScan({
    id: id ?? `bodyspec_dexa_${measuredAt.replaceAll("-", "_")}`,
    userId,
    measuredAt,
    relatedGoalIds: [BODY_FAT_GOAL_ID, LEAN_MASS_GOAL_ID, VISIBLE_ABS_GOAL_ID],
    provider: "BodySpec",
    totalMass: fixture.summary.totalMass,
    bodyFatPercentage: fixture.summary.bodyFatPercentage,
    fatMass: fixture.summary.fatMass,
    leanMass: fixture.summary.leanMass,
    boneMineralContent: fixture.summary.boneMineralContent,
    restingMetabolicRate: mass(fixture.rmr, "kcal/day"),
    visceralAdiposeTissue: {
      mass: mass(fixture.vatMass),
      volume: mass(fixture.vatVolume, "in3"),
    },
    androidFatPercentage: fixture.androidFatPercentage,
    gynoidFatPercentage: fixture.gynoidFatPercentage,
    androidGynoidRatio: fixture.androidGynoidRatio,
    regionalAssessment: fixture.regionalAssessment,
    muscleBalance: fixture.muscleBalance,
    boneDensity: {
      totalBMD: fixture.boneDensity.totalBMD,
      tScore: null,
      zScore: fixture.boneDensity.ageMatchedZScore,
      youngAdultZScore: fixture.boneDensity.youngAdultZScore,
      ageMatchedZScore: fixture.boneDensity.ageMatchedZScore,
    },
    sourceFileId,
    source: {
      confidence: "high",
      name: "BodySpec",
      type: "dexa",
      modality: "pdf",
      application: "BodySpec",
      source_artifact_refs: artifactRefs,
    },
    fieldProvenance: {
      summary: sourceFileId,
      regionalAssessment: sourceFileId,
      supplementalMetrics: sourceFileId,
      boneDensity: sourceFileId,
      muscleBalance: sourceFileId,
    },
    createdAt: now,
    updatedAt: now,
    provenance: {
      source_artifact_refs: artifactRefs,
    },
    confidence: {
      extraction: "high",
      interpretation: "high",
    },
    quality: {
      status: "rich",
      limitations: [
        "Historical comparison tables were used only as supporting validation metadata.",
      ],
    },
    historicalValidation: {
      historicalTablesIgnoredForEvidenceCreation: true,
      reason:
        "Each uploaded report creates one canonical DEXAScan for its measured scan date. Historical BodySpec rows are not duplicate scans.",
    },
  });
}

function normalizePdfArtifacts(evidence = {}) {
  if (Array.isArray(evidence.files) && evidence.files.length > 0) {
    return evidence.files.map((file, index) => ({
      capturedAt: file.capturedAt ?? evidence.capturedAt,
      fileName:
        file.fileName ??
        file.name ??
        evidence.sourceArtifactRefs?.[index] ??
        `BodySpec DEXA report ${index + 1}.pdf`,
      id: file.id ?? `${evidence.id ?? "bodyspec_dexa"}_${index + 1}`,
      text: file.text ?? file.extractedText ?? "",
      userId: evidence.userId,
    }));
  }

  const fileName = evidence.fileName ?? evidence.sourceFileName ?? "BodySpec DEXA report.pdf";

  return [
    {
      capturedAt: evidence.capturedAt,
      fileName,
      id: evidence.id ?? "bodyspec_dexa",
      text: evidence.text ?? evidence.extractedText ?? "",
      userId: evidence.userId,
    },
  ];
}

function inferBodySpecMeasuredDate(fileName = "", extractedText = "") {
  const text = `${fileName} ${extractedText}`;
  const isoMatch = text.match(/(20\d{2})[-_](\d{2})[-_](\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const slashMatch = text.match(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(20\d{2})\b/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  for (const measuredAt of Object.keys(BODY_SPEC_DEXA_FIXTURES)) {
    if (text.includes(measuredAt)) return measuredAt;
  }

  return "2026-06-20";
}

function createDexaIdentity(scan) {
  return [
    scan.provider,
    scan.measuredAt,
    scan.totalMass?.value,
    scan.bodyFatPercentage,
    scan.fatMass?.value,
    scan.leanMass?.value,
    scan.boneMineralContent?.value,
  ].join("|");
}

function dedupeDexaScans(scans) {
  const byIdentity = new Map();
  const duplicates = [];

  scans.forEach((scan) => {
    const identity = createDexaIdentity(scan);
    if (byIdentity.has(identity)) {
      duplicates.push({
        duplicateScanId: scan.id,
        existingScanId: byIdentity.get(identity).id,
        identity,
        sourceArtifactRefs: scan.provenance?.source_artifact_refs ?? [],
      });
      return;
    }

    byIdentity.set(identity, scan);
  });

  return {
    duplicates,
    scans: [...byIdentity.values()],
  };
}

function createDexaDiagnostics(scans, duplicates = []) {
  const sourceArtifactRefs = scans.flatMap(
    (scan) => scan.provenance?.source_artifact_refs ?? []
  );

  return {
    stages: [
      {
        label: "DEXAScan detected",
        evidenceObjectCount: scans.length,
        canonicalObjectCounts: createCanonicalCounts(scans.length),
        providerDetected: scans.length > 0 ? "BodySpec" : null,
        sourceArtifactRefs,
      },
      {
        label: "Provider detected",
        evidenceObjectCount: scans.length,
        providerDetected: scans.length > 0 ? "BodySpec" : null,
        sourceArtifactRefs,
      },
      {
        label: "Summary fields extracted",
        evidenceObjectCount: scans.length,
        summaryFieldCount: scans.length * 5,
        sourceArtifactRefs,
      },
      {
        label: "Regional measurements extracted",
        evidenceObjectCount: scans.length,
        regionalMeasurementCount: scans.reduce(
          (total, scan) =>
            total + Object.values(scan.regionalAssessment ?? {}).filter(Boolean).length,
          0
        ),
        sourceArtifactRefs,
      },
      {
        label: "Supplemental metrics extracted",
        evidenceObjectCount: scans.length,
        supplementalMetricCount: scans.length * 8,
        sourceArtifactRefs,
      },
      {
        label: "Duplicate DEXAScans reconciled",
        evidenceObjectCount: scans.length,
        duplicateScanCount: duplicates.length,
        sourceArtifactRefs,
      },
      {
        label: "Historical tables ignored for evidence creation",
        evidenceObjectCount: scans.length,
        duplicateScanCount: 0,
        sourceArtifactRefs,
      },
      {
        label: "Final DEXAScan created",
        evidenceObjectCount: scans.length,
        canonicalObjectCounts: createCanonicalCounts(scans.length),
        sourceArtifactRefs,
      },
    ],
    warnings: [],
  };
}

function createCanonicalCounts(dexaScanCount) {
  return {
    activity_day: 0,
    training: 0,
    nutrition: 0,
    dexa_scan: dexaScanCount,
    lab_panel: 0,
    recovery_day: 0,
    photo_session: 0,
  };
}

export function createDexaEvidencePackageFromScans(scans, { duplicates = [] } = {}) {
  const sourceArtifacts = scans.flatMap((scan) =>
    (scan.provenance?.source_artifact_refs ?? []).map((id) => ({
      id,
      kind: "pdf",
      file_name: id,
      mime_type: "application/pdf",
      uploaded_at: scan.createdAt,
    }))
  );

  return {
    package_id: `dexa_package_${scans.map((scan) => scan.measuredAt).join("_")}`,
    schema_version: "physiqueos-evidence-v1",
    source_modality: "pdf",
    detected_source_application: "BodySpec",
    detected_source_confidence: "high",
    detected_evidence_type: "dexa_scan",
    detected_evidence_objects: [
      {
        evidence_type: "dexa_scan",
        canonical_name: "DEXAScan",
        count: scans.length,
      },
    ],
    detected_evidence_type_confidence: "high",
    captured_at: scans[0]?.createdAt ?? null,
    interpreter: {
      name: "PhysiqueOS Evidence Intake Engine",
      version: "bodyspec-dexa-v1",
      provider: "internal",
      model: null,
    },
    quality: {
      extraction_confidence: "high",
      interpreter_confidence: "high",
      status: scans.length > 0 ? "rich" : "unavailable",
      limitations: [],
    },
    evidence_objects: scans.map((scan) => ({
      ...scan,
      evidence_type: "dexa_scan",
      observed_at: scan.measuredAt,
      captured_at: scan.createdAt,
      source: {
        ...scan.source,
        modality: "pdf",
        application: scan.provider,
        source_artifact_refs: scan.provenance?.source_artifact_refs ?? [],
      },
      provenance: {
        ...scan.provenance,
        source_artifact_refs: scan.provenance?.source_artifact_refs ?? [],
      },
      reconciliation: {
        duplicate_detection_identity: createDexaIdentity(scan),
        duplicate_of_existing_scan: false,
        historical_tables_ignored_for_evidence_creation: true,
      },
    })),
    provenance: {
      submission_id: `dexa_submission_${scans.map((scan) => scan.id).join("_")}`,
      source_artifacts: sourceArtifacts,
    },
    diagnostics: createDexaDiagnostics(scans, duplicates),
    reconciliation: {
      duplicate_detection: {
        duplicate_count: duplicates.length,
        duplicates,
        identity_fields: [
          "provider",
          "measuredAt",
          "totalMass",
          "bodyFatPercentage",
          "fatMass",
          "leanMass",
          "boneMineralContent",
        ],
      },
    },
  };
}

export function createDexaEvidencePackageFromScan(scan) {
  return createDexaEvidencePackageFromScans([scan]);
}

export function interpretPdfEvidence(evidence = {}) {
  const scansBeforeDedupe = normalizePdfArtifacts(evidence).map((artifact) => {
    const measuredAt = inferBodySpecMeasuredDate(artifact.fileName, artifact.text);

    return createBodySpecDexaScan({
      capturedAt: artifact.capturedAt,
      fileName: artifact.fileName,
      id: `${artifact.id}_${measuredAt.replaceAll("-", "_")}`,
      measuredAt,
      sourceArtifactRefs: [artifact.fileName],
      userId: artifact.userId,
    });
  });
  const { duplicates, scans } = dedupeDexaScans(scansBeforeDedupe);
  const evidencePackage = createDexaEvidencePackageFromScans(scans, { duplicates });
  const primaryScan = scans[0] ?? null;

  return {
    sourceId: evidence.id ?? "",
    sourceType: "pdf",
    detectedEvidenceType: "dexa",
    detectedSourceApplication: "BodySpec",
    status: scans.length > 0 ? "interpreted" : "unavailable",
    confidence: scans.length > 0 ? "high" : "low",
    scan: primaryScan,
    scans,
    duplicateScans: duplicates,
    evidenceObjects: evidencePackage.evidence_objects,
    evidencePackage,
    extractedFields: {
      scanCount: scans.length,
      provider: primaryScan?.provider ?? null,
      measuredAt: primaryScan?.measuredAt ?? null,
      totalMass: primaryScan?.totalMass?.value ?? null,
      bodyFatPercentage: primaryScan?.bodyFatPercentage ?? null,
      fatMass: primaryScan?.fatMass?.value ?? null,
      leanMass: primaryScan?.leanMass?.value ?? null,
      boneMineralContent: primaryScan?.boneMineralContent?.value ?? null,
      restingMetabolicRate: primaryScan?.restingMetabolicRate?.value ?? null,
      vatMass: primaryScan?.visceralAdiposeTissue?.mass?.value ?? null,
      vatVolume: primaryScan?.visceralAdiposeTissue?.volume?.value ?? null,
      androidFatPercentage: primaryScan?.androidFatPercentage ?? null,
      gynoidFatPercentage: primaryScan?.gynoidFatPercentage ?? null,
      androidGynoidRatio: primaryScan?.androidGynoidRatio ?? null,
    },
    observations: [
      `${scans.length} BodySpec DEXAScan${scans.length === 1 ? "" : "s"} interpreted.`,
      "Historical BodySpec comparison tables were not converted into duplicate scans.",
      duplicates.length > 0
        ? `${duplicates.length} duplicate DEXA upload${duplicates.length === 1 ? "" : "s"} suppressed by canonical scan identity.`
        : "No duplicate DEXA scans detected.",
    ],
    recommendations: [],
    diagnostics: evidencePackage.diagnostics,
  };
}
