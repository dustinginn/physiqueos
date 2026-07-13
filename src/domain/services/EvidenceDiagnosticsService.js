export function getEvidenceDiagnosticsView(evidencePackage = {}, { mode = "developer" } = {}) {
  if (mode === "developer") {
    return evidencePackage.diagnostics ?? { stages: [], warnings: [] };
  }

  return createProductionDiagnostics(evidencePackage);
}

function createProductionDiagnostics(evidencePackage = {}) {
  const stages = evidencePackage.diagnostics?.stages ?? [];
  const warnings = evidencePackage.diagnostics?.warnings ?? [];
  const evidenceObjects = evidencePackage.evidence_objects ?? [];
  const sourceArtifacts = evidencePackage.provenance?.source_artifacts ?? [];
  const finalStage = stages.at(-1) ?? {};

  return {
    mode: "production",
    status: evidencePackage.quality?.status ?? "unknown",
    evidenceEntered: {
      sourceArtifactCount: sourceArtifacts.length,
      sourceModality: evidencePackage.source_modality ?? null,
    },
    canonicalObjects: {
      count: evidenceObjects.length,
      counts:
        finalStage.canonicalObjectCounts ??
        evidencePackage.detected_evidence_objects?.reduce((counts, object) => {
          counts[object.evidence_type] = object.count;
          return counts;
        }, {}) ??
        {},
    },
    reconciliation: summarizeReconciliation(evidencePackage, stages),
    confidence: {
      extraction: evidencePackage.quality?.extraction_confidence ?? null,
      interpretation: evidencePackage.quality?.interpreter_confidence ?? null,
    },
    unresolvedAmbiguity: [
      ...(evidencePackage.quality?.limitations ?? []),
      ...warnings,
    ],
  };
}

function summarizeReconciliation(evidencePackage = {}, stages = []) {
  const duplicateDetection = evidencePackage.reconciliation?.duplicate_detection;
  const duplicateStage = stages.find((stage) =>
    /duplicate/i.test(String(stage.label ?? ""))
  );
  const activityStage = [...stages]
    .reverse()
    .find((stage) => Number.isFinite(Number(stage.linkedTrainingSessionCount)));

  return {
    duplicateCount:
      duplicateDetection?.duplicate_count ??
      duplicateStage?.duplicateScanCount ??
      0,
    linkedTrainingSessionCount:
      activityStage?.linkedTrainingSessionCount ?? null,
    summary: getReconciliationSummary({
      duplicateCount:
        duplicateDetection?.duplicate_count ??
        duplicateStage?.duplicateScanCount ??
        0,
      linkedTrainingSessionCount: activityStage?.linkedTrainingSessionCount ?? null,
    }),
  };
}

function getReconciliationSummary({ duplicateCount, linkedTrainingSessionCount }) {
  const parts = [];

  if (duplicateCount > 0) {
    parts.push(`${duplicateCount} duplicate evidence item${duplicateCount === 1 ? "" : "s"} reconciled`);
  }

  if (Number.isFinite(Number(linkedTrainingSessionCount))) {
    parts.push(`${linkedTrainingSessionCount} training session${linkedTrainingSessionCount === 1 ? "" : "s"} linked`);
  }

  return parts.length > 0 ? parts.join("; ") : "No reconciliation conflicts detected";
}
