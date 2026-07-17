import { getLocalDateKey } from "../utils/localDate";

const BRIEFING_RELEVANT_EVIDENCE_TYPES = new Set([
  "weight",
  "progress_photo",
  "dexa",
  "nutrition",
  "sleep",
  "recovery",
]);

const ROUTINE_CONTEXT_EVIDENCE_TYPES = new Set([
  "activity",
  "activity_day",
  "training",
  "training_session",
  "walk",
  "cardio",
  "workout",
]);

export function getDailyBriefingFreshness({
  analyses = [],
  checkIns = [],
  dailyBriefing = null,
  dexaScans = [],
  nutritionContext = null,
  progressPhotos = [],
  today = getLocalDateKey(new Date()),
  expectedWindow = null,
  weightEntries = [],
} = {}) {
  const expectedEvidenceDate = expectedWindow?.date ?? today;
  const latestEvidence = getLatestBriefingRelevantEvidence({
    analyses,
    checkIns,
    dexaScans,
    nutritionContext,
    progressPhotos,
    weightEntries,
    today: expectedEvidenceDate,
  });
  const briefingGeneratedAt =
    dailyBriefing?.generatedAt ??
    dailyBriefing?.briefing?.generatedAt ??
    dailyBriefing?.createdAt ??
    null;
  const briefingDate = getBriefingDate(dailyBriefing, briefingGeneratedAt);
  const evidenceDate = latestEvidence?.evidenceDate ?? getDateKey(latestEvidence?.occurredAt);

  const matchesExpectedWindow = expectedWindow
    ? dailyBriefing?.evidenceWindow?.id === expectedWindow.id
    : briefingDate === today;

  if (!latestEvidence) {
    const isTodayBriefing = matchesExpectedWindow;

    return {
      status: isTodayBriefing ? "current" : dailyBriefing ? "ready" : "missing",
      briefingDate,
      briefingGeneratedAt,
      evidenceDate: null,
      latestEvidence: null,
      isCurrent: Boolean(dailyBriefing) && isTodayBriefing,
    };
  }

  const isTodayBriefing = matchesExpectedWindow;
  const generatedAfterEvidence =
    Boolean(briefingGeneratedAt) &&
    String(briefingGeneratedAt).localeCompare(String(latestEvidence.changedAt)) >= 0;
  const isCurrent = Boolean(dailyBriefing) && isTodayBriefing && generatedAfterEvidence;

  return {
    status: isCurrent ? "current" : dailyBriefing ? "stale" : "missing",
    briefingDate,
    briefingGeneratedAt,
    evidenceDate,
    latestEvidence,
    isCurrent,
  };
}

export function getLatestBriefingRelevantEvidence({
  analyses = [],
  checkIns = [],
  dexaScans = [],
  nutritionContext = null,
  progressPhotos = [],
  today = getLocalDateKey(new Date()),
  weightEntries = [],
} = {}) {
  const candidates = [
    ...weightEntries.map((entry) => ({
      id: entry.id,
      type: "weight",
      changedAt: getRecordChangeTimestamp(entry),
      occurredAt: getEvidenceOccurrenceTimestamp(entry, "measuredAt"),
      label: "Morning Weight",
    })),
    ...progressPhotos.map((photo) => ({
      id: photo.id,
      type: "progress_photo",
      changedAt: getRecordChangeTimestamp(photo),
      occurredAt: getEvidenceOccurrenceTimestamp(photo, "date", "capturedAt"),
      label: "Progress Photos",
    })),
    ...dexaScans.map((scan) => ({
      id: scan.id,
      type: "dexa",
      changedAt: getRecordChangeTimestamp(scan),
      occurredAt: getEvidenceOccurrenceTimestamp(scan, "measuredAt"),
      label: "DEXA",
    })),
    ...checkIns.map((checkIn) => ({
      id: checkIn.id,
      type: "check_in",
      changedAt: getRecordChangeTimestamp(checkIn),
      occurredAt: getEvidenceOccurrenceTimestamp(checkIn, "date"),
      label: "Check-In",
    })),
    ...analyses
      .filter((analysis) =>
        (analysis.evidenceTypes ?? []).some((type) =>
          BRIEFING_RELEVANT_EVIDENCE_TYPES.has(type)
        )
      )
      .map((analysis) => ({
        id: analysis.id,
        type: analysis.evidenceTypes?.[0] ?? "analysis",
        changedAt: getRecordChangeTimestamp(analysis),
        occurredAt: getEvidenceOccurrenceTimestamp(analysis, "createdAt"),
        label: "Analysis",
      })),
    nutritionContext && {
      id: nutritionContext.id ?? "nutrition_context",
      type: "nutrition",
      changedAt: getRecordChangeTimestamp(nutritionContext),
      occurredAt: getEvidenceOccurrenceTimestamp(nutritionContext, "date", "createdAt"),
      label: "Nutrition",
    },
  ]
    .filter((candidate) => candidate?.occurredAt)
    .map((candidate) => ({
      ...candidate,
      changedAt: candidate.changedAt ?? candidate.occurredAt,
      evidenceDate: getDateKey(candidate.occurredAt),
    }))
    .map((candidate) => ({
      ...candidate,
      narrativeMateriality: evaluateNarrativeMateriality(candidate),
    }))
    .filter(
      (candidate) =>
        candidate.evidenceDate === today && candidate.narrativeMateriality.material
    );

  return candidates
    .sort((a, b) => String(a.changedAt).localeCompare(String(b.changedAt)))
    .at(-1) ?? null;
}

export function evaluateNarrativeMateriality(evidence = {}) {
  const explicitMateriality =
    evidence.narrativeMateriality ??
    evidence.narrative_materiality ??
    evidence.materiality ??
    evidence.metadata?.narrativeMateriality ??
    evidence.metadata?.narrative_materiality;

  if (explicitMateriality) {
    return normalizeMaterialityDecision(explicitMateriality);
  }

  const type = normalizeEvidenceType(evidence.type ?? evidence.evidence_type);

  if (type === "weight") {
    return {
      material: true,
      reason: "Today's weigh-in can change the current physiological read.",
    };
  }

  if (type === "progress_photo" || type === "photo_session") {
    return {
      material: true,
      reason: "Progress photos can materially update the visual trajectory.",
    };
  }

  if (type === "dexa" || type === "dexa_scan" || type === "body_composition") {
    return {
      material: true,
      reason: "DEXA is high-confidence body-composition evidence.",
    };
  }

  if (type === "check_in") {
    return {
      material: true,
      reason: "Check-ins may include illness, injury, adherence, or protocol context.",
    };
  }

  if (type === "nutrition") {
    return {
      material: hasMaterialNutritionSignal(evidence),
      reason: hasMaterialNutritionSignal(evidence)
        ? "Nutrition evidence appears to materially change adherence or coaching."
        : "Routine nutrition detail updates history without changing today's story by itself.",
    };
  }

  if (ROUTINE_CONTEXT_EVIDENCE_TYPES.has(type)) {
    return {
      material: false,
      reason: "Routine workout and activity evidence enriches history without interrupting today's briefing.",
    };
  }

  return {
    material: false,
    reason: "No material change to today's physiological story was identified.",
  };
}

export function evaluateEvidencePackageNarrativeMateriality(evidencePackage, today = getLocalDateKey(new Date())) {
  const evidenceObjects = evidencePackage?.evidence_objects ?? [];
  const decisions = evidenceObjects.map((object) => ({
    evidenceId: object.id,
    evidenceType: object.evidence_type,
    evidenceDate: getDateKey(object.observed_at ?? evidencePackage?.observedDate),
    ...evaluateNarrativeMateriality({
      ...object,
      type: object.evidence_type,
    }),
  }));
  const materialDecision = decisions.find(
    (decision) => decision.evidenceDate === today && decision.material
  );

  return {
    material: Boolean(materialDecision),
    reason:
      materialDecision?.reason ??
      "Evidence was contextualized without materially changing today's physiological story.",
    decisions,
  };
}

function normalizeMaterialityDecision(value) {
  if (typeof value === "boolean") {
    return {
      material: value,
      reason: value
        ? "Marked as material by upstream narrative evaluation."
        : "Marked as non-material by upstream narrative evaluation.",
    };
  }

  if (typeof value === "string") {
    const text = value.toLowerCase();

    return {
      material: ["high", "material", "meaningful", "true"].includes(text),
      reason: `Narrative materiality marked as ${value}.`,
    };
  }

  return {
    material: Boolean(value?.material ?? value?.isMaterial ?? value?.stalesBriefing),
    reason:
      value?.reason ??
      value?.rationale ??
      "Narrative materiality was provided by upstream intelligence.",
  };
}

function hasMaterialNutritionSignal(evidence) {
  return Boolean(
    evidence.material_adherence_change ??
      evidence.metadata?.material_adherence_change ??
      evidence.goal_status?.material_change ??
      evidence.reconciliation?.material_change
  );
}

function normalizeEvidenceType(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function getEvidenceOccurrenceTimestamp(record, ...dateFields) {
  const value = dateFields.map((field) => record[field]).find(Boolean);

  return normalizeTimestamp(value);
}

function getRecordChangeTimestamp(record) {
  const value = record.updatedAt ?? record.createdAt ?? record.importedAt ?? null;

  return normalizeTimestamp(value);
}

function normalizeTimestamp(value) {
  if (!value) return null;
  const text = String(value);
  return text;
}

function getBriefingDate(dailyBriefing, briefingGeneratedAt) {
  return (
    getDateKey(dailyBriefing?.briefing?.evidenceReconciliation?.date) ??
    getDateKey(dailyBriefing?.briefing?.date) ??
    getLocalDateKey(briefingGeneratedAt)
  );
}

function getDateKey(value) {
  return getLocalDateKey(value);
}
