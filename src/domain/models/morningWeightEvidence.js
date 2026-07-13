export function createCanonicalMorningWeightEvidenceObject({
  createdAt = new Date().toISOString(),
  dailyCheckIn,
  userId,
  weightEntry,
} = {}) {
  if (!userId || !weightEntry?.id || !weightEntry?.measuredAt) return null;

  const date = weightEntry.measuredAt.slice(0, 10);
  const evidenceObjectId = `morning_weight_${date.replaceAll("-", "_")}`;
  const sourceArtifactRefs = [weightEntry.id];
  const reliability = weightEntry.reliability ?? weightEntry.source?.confidence ?? "high";

  return {
    canonicalId: `morning_weight|${userId}|${date}`,
    createdAt,
    evidence_type: "morning_weight",
    firstObservedAt: date,
    lastObservedAt: date,
    payload: {
      id: evidenceObjectId,
      evidence_type: "morning_weight",
      observed_at: date,
      measuredAt: date,
      source: {
        modality: "manual",
        application: "Morning Check-In",
        source_artifact_refs: sourceArtifactRefs,
      },
      metadata: {
        timing: weightEntry.context?.timing ?? "morning",
        value: weightEntry.weight.value,
        unit: weightEntry.weight.unit,
        context: weightEntry.context,
      },
      confidence: {
        extraction: reliability,
        interpretation: reliability,
      },
      quality: {
        status: "complete",
        limitations: [],
      },
      provenance: {
        daily_check_in_ids: [dailyCheckIn?.id].filter(Boolean),
        source_artifact_refs: sourceArtifactRefs,
        weight_entry_ids: [weightEntry.id],
      },
    },
    provenance: {
      daily_check_in_ids: [dailyCheckIn?.id].filter(Boolean),
      evidence_package_ids: [],
      source_artifact_refs: sourceArtifactRefs,
      contributing_evidence_object_ids: [evidenceObjectId],
      weight_entry_ids: [weightEntry.id],
    },
    updatedAt: createdAt,
    userId,
  };
}
