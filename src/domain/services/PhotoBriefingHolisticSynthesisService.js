export const PHOTO_BRIEFING_HOLISTIC_VERSION = "photo_briefing_holistic_v1";
export const EVIDENCE_CUTOFF_VERSION = "canonical_evidence_cutoff_v1";

/**
 * Selects canonical evidence using both event-time and knowledge-time. An
 * observation measured before the cutoff but not available until after it is
 * excluded. Unknown availability fails closed.
 */
export function selectPhotoBriefingEvidence({
  evidence = [],
  eventDate,
  cutoff,
} = {}) {
  requireTimestamp(cutoff, "cutoff");
  const eligible = [];
  const excluded = [];
  for (const candidate of evidence) {
    const item = normalizeEvidenceCandidate(candidate);
    const reason = exclusionReason(item, { eventDate, cutoff });
    (reason ? excluded : eligible).push(reason ? { ...item, exclusionReason: reason } : item);
  }
  return deepFreeze({
    schemaVersion: EVIDENCE_CUTOFF_VERSION,
    eventDate,
    cutoff,
    eligible: eligible.sort(compareEvidence),
    excluded: excluded.sort(compareEvidence),
  });
}

/**
 * Layer B synthesis. It may strengthen interpretation through convergence, but
 * it never mutates or restates the source PI as a stronger visual claim.
 */
export function createPhotoBriefingHolisticSynthesis({
  photoIntelligence,
  evidence = [],
  eventDate,
  cutoff,
  goalContext = null,
  resultLabel = "PROSPECTIVE",
} = {}) {
  if (!photoIntelligence?.schemaVersion) {
    throw new Error("Holistic Photo Briefing requires canonical Photo Intelligence.");
  }
  const piBefore = JSON.stringify(photoIntelligence);
  const selection = selectPhotoBriefingEvidence({ evidence, eventDate, cutoff });
  const dexa = selectedDexa(selection.eligible);
  const measured = dexa ? dexaSynthesis(dexa, selection.eligible) : null;
  const convergence = assessConvergence(photoIntelligence, measured);
  const copy = buildCopy(photoIntelligence, measured, convergence);
  if (JSON.stringify(photoIntelligence) !== piBefore) {
    throw new Error("Holistic synthesis mutated canonical Photo Intelligence.");
  }
  return deepFreeze({
    schemaVersion: PHOTO_BRIEFING_HOLISTIC_VERSION,
    resultLabel,
    eventDate,
    evidenceCutoff: cutoff,
    goalContext: goalContext ? structuredClone(goalContext) : null,
    visualEvidence: {
      source: "canonical_photo_intelligence",
      schemaVersion: photoIntelligence.schemaVersion,
      comparison: structuredClone(photoIntelligence.comparison),
      overallMagnitude: photoIntelligence.overallMagnitude,
      dominantVisualStory: photoIntelligence.dominantVisualStory,
      confidence: structuredClone(photoIntelligence.confidence),
    },
    independentEvidence: selection.eligible.filter((item) =>
      measured?.sourceIds?.includes(item.id)
    ).map((item) => ({
      id: item.id,
      type: item.type,
      observedAt: item.observedAt,
      availableAt: item.availableAt,
      attribution: item.type === "dexa_scan" ? "measured_by_dexa" : "independent_canonical_evidence",
    })),
    evidenceSelection: {
      schemaVersion: selection.schemaVersion,
      eventDate: selection.eventDate,
      cutoff: selection.cutoff,
      eligible: selection.eligible.map(evidenceReference),
      excluded: selection.excluded.map(evidenceReference),
    },
    measuredEvidence: measured,
    convergence,
    userFacingCopy: copy,
    provenance: {
      producer: "photo_briefing_holistic_synthesis_service",
      producerVersion: PHOTO_BRIEFING_HOLISTIC_VERSION,
      photoIntelligenceProducerVersion: photoIntelligence.provenance?.producerVersion,
      evidenceCutoffVersion: EVIDENCE_CUTOFF_VERSION,
      visualObservationAttribution: "photos",
      measurementAttribution: measured ? "DEXA" : null,
      synthesisAttribution: "PhysiqueOS",
    },
  });
}

export function canonicalEvidenceCandidate(record, {
  type,
  availableAt = null,
  lastUpdatedAt = null,
  observedAt = null,
} = {}) {
  return {
    id: String(record?.id ?? record?.canonicalId ?? record?.canonical_id ?? ""),
    type: type ?? record?.evidence_type ?? record?.type ?? "unknown",
    observedAt: observedAt ?? record?.measuredAt ?? record?.recordedAt ??
      record?.lastObservedAt ?? record?.observed_at ?? record?.date ?? null,
    availableAt: availableAt ?? record?.canonicalAvailability?.availableAt ??
      record?.createdAt ?? record?.created_at ?? null,
    lastUpdatedAt: lastUpdatedAt ?? record?.canonicalAvailability?.lastUpdatedAt ??
      record?.updatedAt ?? record?.updated_at ?? null,
    record: structuredClone(record),
  };
}

function normalizeEvidenceCandidate(candidate) {
  const normalized = candidate?.record ? candidate : canonicalEvidenceCandidate(candidate);
  return {
    id: String(normalized.id ?? ""),
    type: String(normalized.type ?? "unknown"),
    observedAt: normalizeObservedAt(normalized.observedAt),
    availableAt: normalizeTimestamp(normalized.availableAt),
    lastUpdatedAt: normalizeTimestamp(normalized.lastUpdatedAt),
    record: structuredClone(normalized.record ?? candidate),
  };
}

function exclusionReason(item, { eventDate, cutoff }) {
  if (!item.availableAt) return "availability_unknown";
  if (Date.parse(item.availableAt) > Date.parse(cutoff)) return "available_after_cutoff";
  if (item.lastUpdatedAt && Date.parse(item.lastUpdatedAt) > Date.parse(cutoff)) {
    return "updated_after_cutoff";
  }
  if (!item.observedAt) return "observation_time_unknown";
  if (eventDate && item.observedAt.slice(0, 10) > eventDate) return "observed_after_event";
  if (Date.parse(item.observedAt) > Date.parse(cutoff)) return "observed_after_cutoff";
  return null;
}

function selectedDexa(eligible) {
  return eligible.filter((item) => item.type === "dexa_scan")
    .sort(compareEvidence).at(-1) ?? null;
}

function dexaSynthesis(latest, eligible) {
  const prior = eligible.filter((item) => item.type === "dexa_scan" &&
    item.observedAt < latest.observedAt).sort(compareEvidence).at(-1) ?? null;
  const lean = metricValue(latest.record.leanMass);
  const priorLean = metricValue(prior?.record?.leanMass);
  const bodyFat = metricValue(latest.record.bodyFatPercentage);
  const priorBodyFat = metricValue(prior?.record?.bodyFatPercentage);
  return {
    sourceId: latest.id,
    sourceIds: [prior?.id, latest.id].filter(Boolean),
    measuredAt: latest.observedAt,
    availableAt: latest.availableAt,
    leanMassLb: lean,
    comparisonLeanMassLb: priorLean,
    comparisonMeasuredAt: prior?.observedAt ?? null,
    leanMassChangeLb: finite(lean) && finite(priorLean)
      ? Number((lean - priorLean).toFixed(1)) : null,
    bodyFatPercentage: bodyFat,
    comparisonBodyFatPercentage: priorBodyFat,
    bodyFatPercentageChange: finite(bodyFat) && finite(priorBodyFat)
      ? Number((bodyFat - priorBodyFat).toFixed(1)) : null,
    attribution: "DEXA measured these values; photos did not.",
  };
}

function assessConvergence(pi, measured) {
  if (!measured) return convergenceResult("photo_only");
  const comparisons = [];
  const observations = pi.observations ?? [];
  const muscleDirection = dominantSignal(observations, /muscular|fullness|size/);
  const leanDirection = dominantSignal(observations, /lean|definition|conditioning|softness/,
    /softness/);
  const measuredMuscle = sign(measured.leanMassChangeLb);
  const measuredLeanness = invertSign(sign(measured.bodyFatPercentageChange));
  if (muscleDirection && measuredMuscle) comparisons.push(muscleDirection === measuredMuscle);
  if (leanDirection && measuredLeanness) comparisons.push(leanDirection === measuredLeanness);
  if (!comparisons.length) return convergenceResult("independent_context");
  if (comparisons.every(Boolean)) return convergenceResult("convergent");
  if (comparisons.every((item) => !item)) return convergenceResult("divergent");
  return convergenceResult("mixed");
}

function convergenceResult(status) {
  return {
    status,
    confidenceEffect: status === "convergent"
      ? "holistic_interpretation_strengthened" : "none",
    visualConfidenceChanged: false,
    causalClaim: false,
  };
}

function buildCopy(pi, measured, convergence) {
  const visual = removeCaptureInstruction(pi.exactPhotoBriefingCopy || pi.photoOnlyInterpretation);
  if (!measured) return visual;
  const date = readableDate(measured.measuredAt);
  const change = finite(measured.leanMassChangeLb)
    ? `${signed(measured.leanMassChangeLb)} lb of lean-mass change`
    : finite(measured.leanMassLb) ? `${measured.leanMassLb} lb of lean mass` : null;
  const bodyFat = finite(measured.bodyFatPercentage)
    ? `${measured.bodyFatPercentage}% body fat` : null;
  const facts = [change, bodyFat].filter(Boolean).join(" and ");
  const evidenceSentence = convergence.status === "convergent"
    ? `That visual progress also lines up with your ${date} DEXA, which measured ${facts}.`
    : convergence.status === "divergent"
      ? `Your ${date} DEXA measured ${facts}, which does not point in the same direction as the photos.`
      : convergence.status === "mixed"
        ? `Your ${date} DEXA measured ${facts}; some of that supports what is visible in the photos and some does not.`
        : `Your ${date} DEXA adds useful context by measuring ${facts}, without changing what is visible in the photos.`;
  const interpretationSentence = convergence.status === "convergent"
    ? "Together, the photos and measurement make the overall direction more convincing, while still not proving what caused the change."
    : "Keep the visual and measured findings separate; together they do not support a stronger conclusion or explain what caused the change.";
  return [visual, facts ? evidenceSentence : null, interpretationSentence]
    .filter(Boolean).join(" ");
}

function dominantSignal(observations, metricPattern, inverseMetricPattern = null) {
  const signs = observations.filter((item) => metricPattern.test(String(item.metric)))
    .map((item) => {
      let value = item.direction === "increased" || item.direction === "improved" ? 1 :
        item.direction === "decreased" || item.direction === "reduced" ||
        item.direction === "worsened" ? -1 : 0;
      if (inverseMetricPattern?.test(String(item.metric))) value *= -1;
      return value;
    }).filter(Boolean);
  if (!signs.length) return 0;
  const total = signs.reduce((sum, value) => sum + value, 0);
  return sign(total);
}

function sign(value) { return finite(value) && value !== 0 ? Math.sign(value) : 0; }
function invertSign(value) { return value ? value * -1 : 0; }

function removeCaptureInstruction(value = "") {
  return String(value)
    .replace(/,?\s*so stay the course and (?:use|take|capture) (?:the )?(?:next )?(?:matched )?(?:front[- ]relaxed )?(?:photo|photos|setup|capture)[^.?!]*[.?!]?\s*$/i, ".")
    .replace(/\s*(?:Stay the course,? and )?(?:use|take|capture) (?:a |the )?(?:next )?(?:matched )?(?:front[- ]relaxed )?(?:photo|photos|setup|capture)[^.?!]*[.?!]?\s*$/i, "")
    .replace(/\s*In the next comparison, PhysiqueOS will watch[^.?!]*[.?!]?\s*$/i, "")
    .trim();
}

function compareEvidence(left, right) {
  return String(left.observedAt).localeCompare(String(right.observedAt)) ||
    String(left.availableAt).localeCompare(String(right.availableAt)) ||
    left.id.localeCompare(right.id);
}
function evidenceReference(item) {
  return {
    id: item.id,
    type: item.type,
    observedAt: item.observedAt,
    availableAt: item.availableAt,
    lastUpdatedAt: item.lastUpdatedAt,
    ...(item.exclusionReason ? { exclusionReason: item.exclusionReason } : {}),
  };
}
function metricValue(value) {
  const number = Number(value?.value ?? value);
  return Number.isFinite(number) ? number : null;
}
function finite(value) { return Number.isFinite(value); }
function signed(value) { return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1); }
function normalizeObservedAt(value) {
  const text = String(value ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T23:59:59.999Z`;
  return normalizeTimestamp(text);
}
function normalizeTimestamp(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
function requireTimestamp(value, name) {
  if (!normalizeTimestamp(value)) throw new Error(`Photo Briefing requires a valid ${name}.`);
}
function readableDate(value) {
  const [year, month, day] = String(value).slice(0, 10).split("-");
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${months[Number(month) - 1]} ${Number(day)}, ${year}`;
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
