export const PHOTO_BRIEFING_HOLISTIC_VERSION = "photo_briefing_holistic_v2";
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
  const goalEvidenceHierarchy = createGoalEvidenceHierarchy({ goalContext });
  const goalRelativeCompatibility = evaluateGoalRelativeCompatibility({
    photoIntelligence,
    measuredEvidence: measured,
    goalEvidenceHierarchy,
  });
  const copy = buildCopy({
    photoIntelligence,
    measured,
    convergence,
    compatibility: goalRelativeCompatibility,
  });
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
    goalEvidenceHierarchy,
    goalRelativeCompatibility,
    userFacingCopy: copy,
    coachingImplication: buildCoachingImplication({
      hierarchy: goalEvidenceHierarchy,
      compatibility: goalRelativeCompatibility,
    }),
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

/**
 * Projects the canonical Goal contract into explicit evidence roles. The
 * primary objective and accepted guardrails remain authoritative; photos and
 * execution evidence can support or challenge them but cannot replace them.
 */
export function createGoalEvidenceHierarchy({ goalContext = null } = {}) {
  const goal = goalContext?.activeGoal ?? goalContext?.goal ?? null;
  const target = goal?.target ?? null;
  const primaryMetric = normalizeMetric(target?.metric) ??
    inferMetric(goal?.progressMeasurement?.outcomeMeasures ?? []);
  const primaryObjective = primaryMetric ? {
    role: "primary_objective",
    metric: primaryMetric,
    direction: normalizeDirection(target?.direction),
    amount: target?.amount != null && finite(Number(target.amount))
      ? Number(target.amount) : null,
    unit: target?.unit ?? metricUnit(primaryMetric),
    evidenceAuthority: authorityForMetric(primaryMetric),
  } : null;
  const guardrails = [
    ...(Array.isArray(goal?.guardrails) ? goal.guardrails : []),
    ...(Array.isArray(goalContext?.activePhase?.guardrails)
      ? goalContext.activePhase.guardrails : []),
  ].filter((item) => item?.accepted !== false).map((item, index) => {
    const metric = normalizeMetric(item.metric) ?? inferMetricFromText(item.text ?? item.label);
    return {
      role: "guardrail",
      id: item.id ?? item.key ?? `guardrail_${index + 1}`,
      metric,
      range: guardrailRange(item),
      text: item.text ?? item.label ?? null,
      evidenceAuthority: authorityForMetric(metric),
    };
  });
  return deepFreeze({
    goalId: goal?.id ?? null,
    goalType: goal?.type ?? null,
    primaryObjective,
    guardrails,
    supportingEvidence: [
      { type: "photos", role: "supporting_evidence", canEstablishPrimaryObjective: false },
      { type: "weight", role: "supporting_evidence", canEstablishPrimaryObjective: false },
      { type: "training", role: "execution_evidence", canEstablishPrimaryObjective: false },
      { type: "nutrition_activity", role: "execution_evidence", canEstablishPrimaryObjective: false },
    ],
  });
}

export function evaluateGoalRelativeCompatibility({
  photoIntelligence,
  measuredEvidence,
  goalEvidenceHierarchy,
} = {}) {
  const objective = evaluateObjective(
    goalEvidenceHierarchy?.primaryObjective,
    measuredEvidence,
  );
  const guardrails = (goalEvidenceHierarchy?.guardrails ?? []).map((guardrail) =>
    evaluateGuardrail(guardrail, measuredEvidence));
  const visual = evaluateVisualSupport(photoIntelligence);
  const evaluatedGuardrails = guardrails.filter((item) => item.status !== "unavailable");
  const guardrailsSatisfied = evaluatedGuardrails.length > 0 &&
    evaluatedGuardrails.every((item) => item.status === "within_range");
  const guardrailConflict = evaluatedGuardrails.some((item) =>
    ["above_range", "below_range"].includes(item.status));
  let status = "insufficient_goal_context";
  if (objective.status === "progressing" && !guardrailConflict &&
      (guardrailsSatisfied || guardrails.length === 0) && visual.status !== "challenging") {
    status = "jointly_supportive";
  } else if (objective.status === "progressing" && guardrailConflict) {
    status = "objective_progress_guardrail_conflict";
  } else if (objective.status === "regressing") {
    status = "objective_not_progressing";
  } else if (objective.status !== "unavailable" || evaluatedGuardrails.length) {
    status = "qualified";
  }
  return deepFreeze({
    status,
    objective,
    guardrails,
    supportingVisualEvidence: visual,
    visualStabilityConflictsWithMeasuredProgress: false,
    rationale: compatibilityRationale({ status, objective, guardrailsSatisfied, visual }),
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

function buildCopy({ photoIntelligence: pi, measured, convergence, compatibility }) {
  const visual = removeCaptureInstruction(pi.exactPhotoBriefingCopy || pi.photoOnlyInterpretation);
  if (!measured) return visual;
  const objective = compatibility.objective;
  const objectiveSentence = objectiveCopy(objective, measured);
  const evaluatedGuardrail = compatibility.guardrails.find((item) =>
    item.status !== "unavailable");
  const guardrailSentence = guardrailCopy(evaluatedGuardrail);
  const visualSentence = compatibility.supportingVisualEvidence.status === "stable"
    ? `The matched photo views look broadly unchanged, so measured progress is ahead of a clear visible size change${compatibility.status === "jointly_supportive" ? " without an obvious visual tradeoff" : ""}.`
    : compatibility.supportingVisualEvidence.status === "directional"
      ? "The photos add a directional visual signal, but they do not establish the measured objective on their own."
      : compatibility.supportingVisualEvidence.status === "challenging"
        ? "The photos raise a visual concern that should be weighed against the measured result."
        : null;
  if (objectiveSentence || guardrailSentence) {
    return [objectiveSentence, guardrailSentence, visualSentence].filter(Boolean).join(" ");
  }
  const date = readableDate(measured.measuredAt);
  const change = finite(measured.leanMassChangeLb)
    ? `${signed(measured.leanMassChangeLb)} lb of lean-mass change`
    : finite(measured.leanMassLb) ? `${measured.leanMassLb} lb of lean mass` : null;
  const bodyFat = finite(measured.bodyFatPercentage) ? `${measured.bodyFatPercentage}% body fat` : null;
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

function buildCoachingImplication({ hierarchy, compatibility }) {
  const objectiveName = metricLabel(hierarchy?.primaryObjective?.metric);
  const hasGuardrail = (hierarchy?.guardrails?.length ?? 0) > 0;
  if (compatibility?.status === "jointly_supportive") {
    const authority = hierarchy?.primaryObjective?.evidenceAuthority;
    return `Stay with the current approach and use the next ${authority ?? "objective measurement"} to confirm that ${objectiveName ?? "progress"} keeps moving in the intended direction${hasGuardrail ? " inside the accepted guardrail" : ""}.`;
  }
  if (compatibility?.status === "objective_progress_guardrail_conflict") {
    return "The primary objective is moving, but the guardrail needs attention before continuing unchanged.";
  }
  if (compatibility?.status === "objective_not_progressing") {
    return "Do not infer success from stable photos; use the objective measurement and current execution evidence to decide the next adjustment.";
  }
  return "Keep the current approach under review and wait for the next objective measurement before making a photo-led strategy change.";
}

function evaluateObjective(objective, measured) {
  if (!objective) return { role: "primary_objective", metric: null, status: "unavailable", value: null, change: null };
  const change = measuredChange(objective.metric, measured);
  const value = measuredValue(objective.metric, measured);
  let status = "unavailable";
  if (finite(change)) {
    const direction = objective.direction ?? "increase";
    const aligned = direction === "decrease" ? change < 0 : direction === "maintain" ? change === 0 : change > 0;
    status = change === 0 ? "stable" : aligned ? "progressing" : "regressing";
  }
  return { ...objective, status, value, change };
}

function evaluateGuardrail(guardrail, measured) {
  const value = measuredValue(guardrail.metric, measured);
  const range = guardrail.range;
  let status = "unavailable";
  if (finite(value) && range && (finite(range.min) || finite(range.max))) {
    status = finite(range.min) && value < range.min ? "below_range" :
      finite(range.max) && value > range.max ? "above_range" : "within_range";
  }
  return { ...guardrail, status, value };
}

function evaluateVisualSupport(pi = {}) {
  const supported = (pi.observations ?? []).filter((item) =>
    !["unknown", "insufficient"].includes(item.direction));
  const stable = pi.overallMagnitude === "none" ||
    (supported.length > 0 && supported.every((item) => item.direction === "stable"));
  const challenging = supported.some((item) =>
    ["worsened", "deteriorated"].includes(item.direction));
  return {
    role: "supporting_evidence",
    status: challenging ? "challenging" : stable ? "stable" : supported.length ? "directional" : "unavailable",
    establishesMeasuredObjective: false,
    overallMagnitude: pi.overallMagnitude ?? null,
  };
}

function compatibilityRationale({ status, objective, guardrailsSatisfied, visual }) {
  if (status === "jointly_supportive" && visual.status === "stable") {
    return "The primary measurement is progressing, accepted guardrails are satisfied when measurable, and stable photos do not conflict with that result.";
  }
  if (status === "objective_progress_guardrail_conflict") {
    return "The primary measurement is progressing, but an accepted guardrail is outside its configured range.";
  }
  if (status === "objective_not_progressing") {
    return "The primary measurement is not progressing in the configured direction; supporting evidence cannot override it.";
  }
  return guardrailsSatisfied || objective.status !== "unavailable"
    ? "Available evidence is only partly evaluable against the configured Goal contract."
    : "The canonical Goal contract or its authoritative measurements are unavailable.";
}

function objectiveCopy(objective, measured) {
  if (!objective || objective.status === "unavailable") return null;
  const label = metricLabel(objective.metric) ?? "objective";
  if (finite(objective.change) && measured.comparisonMeasuredAt) {
    const direction = objective.change > 0 ? "increase" : objective.change < 0 ? "decrease" : "change";
    return `DEXA measured a ${Math.abs(objective.change).toFixed(1)} ${objective.unit ?? ""} ${direction} in ${label} from ${readableDate(measured.comparisonMeasuredAt)} to ${readableDate(measured.measuredAt)}.`.replace(/\s+/g, " ");
  }
  return finite(objective.value)
    ? `DEXA measured ${objective.value.toFixed(1)} ${objective.unit ?? ""} of ${label} on ${readableDate(measured.measuredAt)}.`.replace(/\s+/g, " ")
    : null;
}

function guardrailCopy(guardrail) {
  if (!guardrail || guardrail.status === "unavailable") return null;
  const label = metricLabel(guardrail.metric) ?? "guardrail metric";
  const range = guardrail.range;
  const configuredRange = range && finite(range.min) && finite(range.max)
    ? `${range.min}–${range.max}${range.unit ?? ""}` : "the accepted range";
  const relation = guardrail.status === "within_range" ? "within" :
    guardrail.status === "above_range" ? "above" : "below";
  return `The latest scan measured ${guardrail.value.toFixed(1)}${range?.unit ?? ""} ${label}, ${relation} the accepted ${configuredRange} guardrail.`;
}

function measuredChange(metric, measured = {}) {
  if (metric === "lean_mass") return measured.leanMassChangeLb;
  if (metric === "body_fat_percentage" || metric === "body_fat") return measured.bodyFatPercentageChange;
  return null;
}

function measuredValue(metric, measured = {}) {
  if (metric === "lean_mass") return measured.leanMassLb;
  if (metric === "body_fat_percentage" || metric === "body_fat") return measured.bodyFatPercentage;
  return null;
}

function normalizeMetric(value) {
  const metric = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["lean_mass", "dexa_lean_mass"].includes(metric)) return "lean_mass";
  if (["body_fat", "body_fat_percentage", "dexa_body_fat"].includes(metric)) return "body_fat_percentage";
  return metric || null;
}

function inferMetric(entries = []) {
  return entries.map((item) => normalizeMetric(item.metric ?? item.evidenceType))
    .find(Boolean) ?? null;
}

function inferMetricFromText(value) {
  const text = String(value ?? "").toLowerCase();
  if (/body[- ]?fat/.test(text)) return "body_fat_percentage";
  if (/lean[- ]?mass/.test(text)) return "lean_mass";
  return null;
}

function guardrailRange(item = {}) {
  const rawMin = item.min ?? item.minimum ?? item.range?.min;
  const rawMax = item.max ?? item.maximum ?? item.range?.max;
  const directMin = rawMin == null ? null : Number(rawMin);
  const directMax = rawMax == null ? null : Number(rawMax);
  if (finite(directMin) || finite(directMax)) {
    return { min: finite(directMin) ? directMin : null, max: finite(directMax) ? directMax : null, unit: item.unit ?? item.range?.unit ?? null };
  }
  const match = String(item.text ?? item.label ?? "").match(/(\d+(?:\.\d+)?)\s*(?:%|percent)?\s*[–—-]\s*(\d+(?:\.\d+)?)\s*(%|percent)?/i);
  return match ? { min: Number(match[1]), max: Number(match[2]), unit: match[3] ? "%" : null } : null;
}

function normalizeDirection(value) {
  const direction = String(value ?? "").toLowerCase();
  return ["increase", "decrease", "maintain"].includes(direction) ? direction : null;
}

function authorityForMetric(metric) {
  return ["lean_mass", "body_fat_percentage", "body_fat"].includes(metric) ? "DEXA" : null;
}

function metricUnit(metric) {
  if (metric === "lean_mass") return "lb";
  if (["body_fat", "body_fat_percentage"].includes(metric)) return "%";
  return null;
}

function metricLabel(metric) {
  if (metric === "lean_mass") return "lean mass";
  if (["body_fat", "body_fat_percentage"].includes(metric)) return "body fat";
  return metric ? metric.replaceAll("_", " ") : null;
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
