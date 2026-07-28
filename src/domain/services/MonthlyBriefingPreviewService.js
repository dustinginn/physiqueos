const PREVIEW_ID = "monthly_briefing_preview_2026_07_01";
const PREVIEW_WINDOW = {
  startDate: "2026-06-01",
  endDate: "2026-07-30",
  deliveryDate: "2026-07-01",
};

export const MONTHLY_NARRATIVE_PREVIEW_VERSION = "monthly_narrative_preview_v5";
export const MONTHLY_EDITORIAL_DECISION_VERSION = "monthly_editorial_decision_preview_v1";

export const MONTHLY_SCORE_WEIGHTS = Object.freeze({
  strategicSignificance: 0.22,
  evidenceStrength: 0.19,
  novelty: 0.08,
  durability: 0.08,
  goalRelevance: 0.1,
  phaseRelevance: 0.07,
  decisionImpact: 0.11,
  confidenceImpact: 0.06,
  contradictionOrRisk: 0.06,
  recencyWithinWindow: 0.07,
  futureRelevance: 0.05,
  dominantThesisSupport: 0.01,
});

const MONTHLY_BOUNDED_MILESTONE_TYPES = Object.freeze(["goal_completion"]);
const MONTHLY_EDITORIAL_CAPACITY = 7;

export const MONTHLY_STORY_TYPES = Object.freeze([
  "goal_completion",
  "goal_start",
  "phase_transition",
  "new_baseline",
  "dexa_baseline",
  "dexa_comparison",
  "dexa_contradiction",
  "energy_trend",
  "training_evolution",
  "recovery_issue",
  "contradiction",
  "interruption",
  "recommendation_change",
  "confidence_shift",
  "photo_progression",
  "weight_context",
  "risk_signal",
]);

export const REQUIRED_CANDIDATE_FIELDS = Object.freeze([
  "storyId",
  "storyType",
  "title",
  "timeWindow",
  "monthlyWindow",
  "storyWindow",
  "comparisonWindow",
  "carryInContext",
  "evidenceRefs",
  "sourceClaimRefs",
  "evidenceStrength",
  "narrativeIntent",
  "strategicSignificance",
  "novelty",
  "durability",
  "goalRelevance",
  "phaseRelevance",
  "decisionImpact",
  "confidenceImpact",
  "contradictionOrRisk",
  "recencyWithinWindow",
  "futureRelevance",
  "dominantThesisSupport",
  "syntheticInvolvement",
  "scoreContributors",
  "score",
  "scoreRank",
  "included",
  "exclusionReason",
  "renderedOrder",
  "mergeMetadata",
  "provenance",
]);

export const MONTHLY_DECISION_SCHEMA_FIELDS = REQUIRED_CANDIDATE_FIELDS;

function toDateKey(value) {
  return String(value ?? "").slice(0, 10);
}

function parseDate(value) {
  return toDateKey(value);
}

function addDays(date, offset) {
  const next = new Date(`${toDateKey(date)}T12:00:00.000Z`);
  if (!Number.isFinite(next.getTime())) return null;
  next.setUTCDate(next.getUTCDate() + offset);
  return toDateKey(next.toISOString());
}

function isBoundedMilestoneType(storyType) {
  return MONTHLY_BOUNDED_MILESTONE_TYPES.includes(storyType);
}

function makeCandidateWindow(records, monthWindow, dateField, label, options = {}) {
  const { requireStoryWindow = true } = options;
  const sorted = [...(records ?? [])]
    .map((item) => ({
      item,
      date: toDateKey(item?.[dateField] || inferDate(item)),
    }))
    .filter((entry) => entry.date)
    .sort((left, right) => left.date.localeCompare(right.date));

  if (sorted.length === 0) {
    return {
      timeWindow: null,
      storyWindow: null,
      comparisonWindow: null,
      carryInContext: false,
      storyRecords: [],
    };
  }

  const storyBoundary = toDateKey(monthWindow.storyWindowStart || monthWindow.deliveryDate || monthWindow.startDate);
  const inStoryWindow = sorted.filter((entry) => entry.date >= storyBoundary && entry.date <= monthWindow.endDate);
  if (inStoryWindow.length === 0 && requireStoryWindow) return null;

  const storyRecords = inStoryWindow.length > 0 ? inStoryWindow : sorted;
  const comparisonRecords = inStoryWindow.length > 0 ? sorted.filter((entry) => entry.date < storyRecords[0].date) : [];

  return {
    timeWindow: buildTimeWindow(storyRecords[0].date, storyRecords.at(-1).date, label),
    storyWindow: buildTimeWindow(storyRecords[0].date, storyRecords.at(-1).date, label),
    comparisonWindow: comparisonRecords.length ? buildTimeWindow(comparisonRecords[0].date, comparisonRecords.at(-1).date, `${label} context`) : null,
    carryInContext: comparisonRecords.length > 0,
    storyRecords: storyRecords.map((entry) => entry.item),
    storyRecordsRaw: storyRecords,
    comparisonRecords: comparisonRecords.map((entry) => entry.item),
  };
}

function getCarryInAwareWindow(records, monthWindow, dateField, label, options = {}) {
  return makeCandidateWindow(records, monthWindow, dateField, label, options);
}

function resolveSyntheticDateRange(continuation, lastRealDate, monthWindow) {
  const configuredStart = parseDate(continuation?.syntheticDateRange?.startDate);
  const configuredEnd = parseDate(continuation?.syntheticDateRange?.endDate) || monthWindow.endDate;
  const cutoff = parseDate(lastRealDate) || monthWindow.startDate;
  const fallbackStart = addDays(cutoff, 1) || cutoff;
  const resolvedStart = configuredStart && configuredStart > cutoff ? configuredStart : fallbackStart;
  const resolvedEnd = configuredEnd >= resolvedStart ? configuredEnd : resolvedStart;
  return {
    startDate: resolvedStart,
    endDate: resolvedEnd,
    realEvidenceCutoffDate: cutoff,
  };
}

function inferDate(item) {
  return toDateKey(item?.date ?? item?.measuredAt ?? item?.capturedAt ?? item?.generatedAt ?? item?.createdAt);
}

function maxDateFrom(items) {
  return [...(items ?? [])]
    .map(inferDate)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, minimum = 0, maximum = 10) {
  const n = number(value);
  if (n === null) return minimum;
  return Math.max(minimum, Math.min(maximum, n));
}

function byDate(field) {
  return (left, right) => {
    const leftDate = toDateKey(left?.[field] ?? left?.date);
    const rightDate = toDateKey(right?.[field] ?? right?.date);
    return leftDate.localeCompare(rightDate);
  };
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

function round(value) {
  return Math.round((number(value) ?? 0) * 100) / 100;
}

function roundOne(value) {
  return Math.round((number(value) ?? 0) * 10) / 10;
}

function dateDistance(valueA, valueB) {
  const left = new Date(`${toDateKey(valueA)}T12:00:00Z`);
  const right = new Date(`${toDateKey(valueB)}T12:00:00Z`);
  if (!Number.isFinite(left.getTime()) || !Number.isFinite(right.getTime())) return null;
  return Math.abs((right.getTime() - left.getTime()) / (1000 * 60 * 60 * 24));
}

function isSynthetic(entry) {
  return Boolean(entry && (entry.isSynthetic === true || entry.source === "preview_fixture"));
}

function normalizeNumericBodyMass(item) {
  if (item == null) return null;
  return number(item.value ?? item);
}

function listInWindow(items, field, window) {
  return (items ?? []).filter((item) => {
    const date = toDateKey(item?.[field] ?? item?.generatedAt ?? item?.measuredAt ?? item?.capturedAt ?? item?.date);
    return date >= window.startDate && date <= window.endDate;
  });
}

function filterByWindow(items, field, window) {
  return listInWindow(items, field, window);
}

function toEvidenceRefs(items) {
  return [...new Set((items ?? []).map((item) => item?.id || item?.storyId || `${item?.source || "record"}_${toDateKey(item?.date || item?.measuredAt || item?.generatedAt)}`))];
}

function buildTimeWindow(startDate, endDate, label) {
  return {
    startDate: toDateKey(startDate),
    endDate: toDateKey(endDate),
    label,
  };
}

function normalizeSyntheticContinuation(syntheticContinuation) {
  if (!syntheticContinuation) {
    return {
      syntheticActive: false,
      records: [],
      weights: [],
      dexaScans: [],
      progressPhotos: [],
      dailyBriefings: [],
      energyContinuations: [],
      trainingObservations: [],
      fixtureId: null,
      fixtureVersion: null,
      fixtureSeed: null,
      syntheticDateRange: null,
    };
  }

  const fixtureId = syntheticContinuation.fixtureId || "monthly-preview-unknown-fixture";
  const fixtureVersion = syntheticContinuation.fixtureVersion || "monthly-preview-unknown-version";
  const fixtureSeed = syntheticContinuation.fixtureSeed || "monthly-preview-unknown-seed";
  const syntheticDateRange = syntheticContinuation.syntheticDateRange || null;
  const normalizeRecord = (record) => ({
    ...record,
    isSynthetic: record?.isSynthetic !== false,
    source: record?.source || "preview_fixture",
    fixtureId,
    fixtureVersion,
    fixtureSeed,
    syntheticDateRange,
  });

  const allRecords = [
    ...(syntheticContinuation.weights ?? []),
    ...(syntheticContinuation.dexaScans ?? []),
    ...(syntheticContinuation.progressPhotos ?? []),
    ...(syntheticContinuation.dailyBriefings ?? []),
    ...(syntheticContinuation.energyContinuations ?? []),
    ...(syntheticContinuation.trainingObservations ?? []),
  ].map(normalizeRecord);

  return {
    syntheticActive: allRecords.length > 0,
    records: allRecords,
    weights: (syntheticContinuation.weights ?? []).map(normalizeRecord),
    dexaScans: (syntheticContinuation.dexaScans ?? []).map(normalizeRecord),
    progressPhotos: (syntheticContinuation.progressPhotos ?? []).map(normalizeRecord),
    dailyBriefings: (syntheticContinuation.dailyBriefings ?? []).map(normalizeRecord),
    energyContinuations: (syntheticContinuation.energyContinuations ?? []).map(normalizeRecord),
    trainingObservations: (syntheticContinuation.trainingObservations ?? []).map(normalizeRecord),
    fixtureId,
    fixtureVersion,
    fixtureSeed,
    syntheticDateRange,
  };
}

function normalizeBriefingEntries(entries) {
  return (entries ?? []).map((entry) => {
    if (entry?.briefing) {
      return {
        ...entry,
        ...entry.briefing,
        id: entry.id ?? entry.briefing?.id,
        generatedAt: entry.generatedAt ?? entry.date ?? entry.briefing?.generatedAt,
      };
    }
    return entry;
  });
}

function makeStoryId(storyType, startDate, endDate) {
  return `${storyType}_${toDateKey(startDate)}_${toDateKey(endDate)}`;
}

function createCandidate(overrides) {
  const storyId = overrides.storyId || makeStoryId(
    overrides.storyType,
    overrides.timeWindow?.startDate,
    overrides.timeWindow?.endDate,
  );

  return {
    ...overrides,
    monthlyWindow: overrides.monthlyWindow || PREVIEW_WINDOW,
    storyWindow: overrides.storyWindow || overrides.timeWindow,
    comparisonWindow: overrides.comparisonWindow || null,
    carryInContext: Boolean(overrides.carryInContext),
    storyId,
    storyType: overrides.storyType,
    title: overrides.title,
    timeWindow: overrides.timeWindow,
    evidenceRefs: toEvidenceRefs(overrides.evidenceRefs),
    sourceClaimRefs: [...new Set(overrides.sourceClaimRefs ?? [])],
    evidenceStrength: clamp(overrides.evidenceStrength ?? 0),
    narrativeIntent: overrides.narrativeIntent,
    strategicSignificance: clamp(overrides.strategicSignificance ?? 0),
    novelty: clamp(overrides.novelty ?? 0),
    durability: clamp(overrides.durability ?? 0),
    goalRelevance: clamp(overrides.goalRelevance ?? 0),
    phaseRelevance: clamp(overrides.phaseRelevance ?? 0),
    decisionImpact: clamp(overrides.decisionImpact ?? 0),
    confidenceImpact: clamp(overrides.confidenceImpact ?? 0),
    contradictionOrRisk: clamp(overrides.contradictionOrRisk ?? 0),
    recencyWithinWindow: clamp(overrides.recencyWithinWindow ?? 0),
    futureRelevance: clamp(overrides.futureRelevance ?? 0),
    dominantThesisSupport: clamp(overrides.dominantThesisSupport ?? 0),
    syntheticInvolvement: Boolean(overrides.syntheticInvolvement),
    scoreContributors: overrides.scoreContributors || {},
    score: 0,
    scoreRank: null,
    included: overrides.included ?? false,
    exclusionReason: overrides.exclusionReason ?? null,
    renderedOrder: null,
    mergeMetadata: overrides.mergeMetadata ?? null,
    provenance: overrides.provenance || { source: "monthly_story_candidate" },
  };
}

function scoreDimension(value, weight) {
  const safe = clamp(value, 0, 10);
  return {
    value: safe,
    weight,
    weighted: roundOne(safe * weight * 100),
  };
}

function applyDeterministicScoring(candidate) {
  const contributions = {
    strategicSignificance: scoreDimension(candidate.strategicSignificance, MONTHLY_SCORE_WEIGHTS.strategicSignificance),
    evidenceStrength: scoreDimension(candidate.evidenceStrength, MONTHLY_SCORE_WEIGHTS.evidenceStrength),
    novelty: scoreDimension(candidate.novelty, MONTHLY_SCORE_WEIGHTS.novelty),
    durability: scoreDimension(candidate.durability, MONTHLY_SCORE_WEIGHTS.durability),
    goalRelevance: scoreDimension(candidate.goalRelevance, MONTHLY_SCORE_WEIGHTS.goalRelevance),
    phaseRelevance: scoreDimension(candidate.phaseRelevance, MONTHLY_SCORE_WEIGHTS.phaseRelevance),
    decisionImpact: scoreDimension(candidate.decisionImpact, MONTHLY_SCORE_WEIGHTS.decisionImpact),
    confidenceImpact: scoreDimension(candidate.confidenceImpact, MONTHLY_SCORE_WEIGHTS.confidenceImpact),
    contradictionOrRisk: scoreDimension(candidate.contradictionOrRisk, MONTHLY_SCORE_WEIGHTS.contradictionOrRisk),
    recencyWithinWindow: scoreDimension(candidate.recencyWithinWindow, MONTHLY_SCORE_WEIGHTS.recencyWithinWindow),
    futureRelevance: scoreDimension(candidate.futureRelevance, MONTHLY_SCORE_WEIGHTS.futureRelevance),
    dominantThesisSupport: scoreDimension(candidate.dominantThesisSupport, MONTHLY_SCORE_WEIGHTS.dominantThesisSupport),
  };

  const score = round(Object.values(contributions).reduce((total, entry) => total + entry.weighted, 0));
  return {
    ...candidate,
    scoreContributors: contributions,
    score,
  };
}

function rankCandidates(candidates) {
  const ranked = [...candidates]
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.evidenceStrength !== left.evidenceStrength) return right.evidenceStrength - left.evidenceStrength;
      return right.recencyWithinWindow - left.recencyWithinWindow;
    })
    .map((candidate, index) => ({ ...candidate, scoreRank: index + 1 }));

  return ranked;
}

function hasThesisOverlap(left, right) {
  const leftIntent = String(left?.narrativeIntent ?? "").toLowerCase();
  const rightIntent = String(right?.narrativeIntent ?? "").toLowerCase();
  if (!leftIntent || !rightIntent) return false;
  if (leftIntent === rightIntent) return true;
  return leftIntent.includes(rightIntent) || rightIntent.includes(leftIntent);
}

function thesisFrom(type, intent) {
  return `${String(type)}:${String(intent)}`;
}

function evidenceOverlap(leftEvidenceRefs, rightEvidenceRefs) {
  const leftSet = new Set((leftEvidenceRefs ?? []).map((id) => String(id)));
  const overlap = (rightEvidenceRefs ?? []).some((id) => leftSet.has(String(id)));
  return overlap;
}

function withinTransitionWindow(leftWindow, rightWindow, toleranceDays) {
  const leftStart = toDateKey(leftWindow?.startDate);
  const rightEnd = toDateKey(rightWindow?.endDate);
  const rightStart = toDateKey(rightWindow?.startDate);
  const leftEnd = toDateKey(leftWindow?.endDate);
  if (!leftStart || !leftEnd || !rightStart || !rightEnd) return false;
  const diff = Math.max(
    Math.abs(dateDistance(leftEnd, rightStart) ?? 0),
    Math.abs(dateDistance(leftStart, rightEnd) ?? 0),
  );
  return diff <= toleranceDays;
}

function shouldMerge(candidate, existing) {
  if (candidate.storyType === "goal_start" && existing.storyType === "phase_transition") {
    return withinTransitionWindow(candidate.timeWindow, existing.timeWindow, 5) && evidenceOverlap(candidate.evidenceRefs, existing.evidenceRefs);
  }
  if (candidate.storyType === "phase_transition" && existing.storyType === "goal_start") {
    return withinTransitionWindow(candidate.timeWindow, existing.timeWindow, 5) && evidenceOverlap(candidate.evidenceRefs, existing.evidenceRefs);
  }
  if (
    (candidate.storyType === "new_baseline" && existing.storyType === "dexa_baseline")
    || (candidate.storyType === "dexa_baseline" && existing.storyType === "new_baseline")
  ) {
    return evidenceOverlap(candidate.evidenceRefs, existing.evidenceRefs);
  }
  if (
    candidate.storyType === "photo_progression"
    && ["dexa_baseline", "dexa_comparison", "new_baseline"].includes(existing.storyType)
  ) {
    return evidenceOverlap(candidate.evidenceRefs, existing.evidenceRefs);
  }
  if (candidate.storyType === "confidence_shift" && existing.storyType === "recommendation_change") {
    return true;
  }
  if (candidate.storyType === "recommendation_change" && existing.storyType === "confidence_shift") {
    return true;
  }
  if (candidate.storyType === "training_evolution" && existing.storyType === "energy_trend") {
    return evidenceOverlap(candidate.evidenceRefs, existing.evidenceRefs) && hasThesisOverlap(candidate, existing);
  }
  return false;
}

function suppressionReasonFor(candidate, selected) {
  if (selected.length >= 7) return "editorial_capacity_reached";
  if (candidate.score < 32) return "insufficient_evidence_strength";
  if (selected.some((entry) => hasThesisOverlap(candidate, entry) && entry.storyType !== "contradiction")) {
    return "dominant_narrative_overlap";
  }
  return null;
}

function applyMergeAndSuppression(scoredCandidates) {
  const ordered = [...scoredCandidates];
  const selected = [];
  const mergedDecisions = [];

  for (const candidate of ordered) {
    if (candidate.score < 32 && selected.length >= 4) {
      candidate.included = false;
      candidate.exclusionReason = "below_inclusion_threshold";
      continue;
    }

    const mergeTarget = selected.find((entry) => candidate.storyType !== entry.storyType && shouldMerge(candidate, entry));
    if (mergeTarget) {
      const existing = mergeTarget;
      candidate.included = false;
      candidate.exclusionReason = `merged_into_${existing.storyId}`;
      candidate.mergeMetadata = {
        mergedInto: existing.storyId,
        reason: "thesis_overlap_and_evidence_overlap",
      };

      existing.mergeMetadata = {
        mergedCandidateIds: [...(existing.mergeMetadata?.mergedCandidateIds ?? []), candidate.storyId],
        primaryCandidateId: existing.storyId,
        primaryStoryType: existing.storyType,
        mergeReason: "goal_transition_or_evidence_overlap",
        retainedEvidenceRefs: [...new Set([...existing.evidenceRefs, ...candidate.evidenceRefs])],
        retainedProvenance: [...new Set([existing.storyId, existing.provenance?.source, candidate.provenance?.source].filter(Boolean))],
      };
      existing.mergeMetadata.retainedEvidenceRefs = existing.mergeMetadata.retainedEvidenceRefs;
      mergedDecisions.push({
        primary: existing.storyId,
        mergedCandidateId: candidate.storyId,
        reason: existing.mergeMetadata.mergeReason,
        retainedEvidenceRefs: existing.mergeMetadata.retainedEvidenceRefs,
        retainedProvenance: existing.mergeMetadata.retainedProvenance,
      });
      continue;
    }

    candidate.inclusionReason = "selected";
    const suppression = suppressionReasonFor(candidate, selected);
    if (suppression) {
      candidate.included = false;
      candidate.exclusionReason = suppression;
      continue;
    }

    candidate.included = true;
    selected.push(candidate);
  }

  for (const selectedCandidate of selected) {
    if (!selectedCandidate.mergeMetadata) {
      selectedCandidate.mergeMetadata = null;
    }
  }

  return {
    candidates: ordered,
    selected,
    mergedDecisions,
  };
};

function applyEditorialOrdering(includedCandidates) {
  const milestonePriority = new Set(["goal_completion", "new_baseline", "goal_start", "phase_transition"]);
  const renderPriority = {
    new_baseline: 1,
    energy_trend: 2,
    training_evolution: 3,
    photo_progression: 4,
    weight_context: 5,
    recommendation_change: 6,
    confidence_shift: 7,
    recovery_issue: 8,
    dexa_baseline: 9,
    dexa_comparison: 10,
    dexa_contradiction: 11,
    risk_signal: 12,
    interruption: 13,
    phase_transition: 14,
    goal_start: 15,
    goal_completion: 16,
    contradiction: 17,
  };

  const editorialCandidates = [...includedCandidates].filter((candidate) => !isBoundedMilestoneType(candidate.storyType));
  const boundedMilestones = [...includedCandidates].filter((candidate) => isBoundedMilestoneType(candidate.storyType));
  const rankedEditorial = editorialCandidates.sort((a, b) => {
    const aPriority = renderPriority[a.storyType] ?? 99;
    const bPriority = renderPriority[b.storyType] ?? 99;
    if (aPriority !== bPriority) return aPriority - bPriority;
    if (a.score !== b.score) return b.score - a.score;
    return a.scoreRank - b.scoreRank;
  }).map((candidate) => ({ ...candidate }));

  const rankedBounded = boundedMilestones.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.scoreRank - b.scoreRank;
  }).map((candidate) => ({ ...candidate }));

  const ordered = [...rankedEditorial, ...rankedBounded].map((candidate, index) => ({
    ...candidate,
    renderedOrder: index + 1,
  }));

  const adjustments = ordered
    .filter((candidate) => candidate.scoreRank !== candidate.renderedOrder)
    .map((candidate) => ({
      storyId: candidate.storyId,
      scoreRank: candidate.scoreRank,
      renderedOrder: candidate.renderedOrder,
      reason:
        candidate.storyType === "new_baseline" && candidate.storyType !== "goal_completion"
          ? "coherence_preserve_strategy_chain"
          : "coherence_adjustment",
    }));

  return { ordered, adjustments };
}

function deduceGoalStartDate(goal) {
  return goal?.timeline?.startDate || null;
}

function deduceGoalTargetDate(goal) {
  if (goal?.timeline?.targetDate) return goal.timeline.targetDate;
  if (goal?.targetDate) return goal.targetDate;
  return null;
}

function latestGoalPhase(goal) {
  const phases = Array.isArray(goal?.phases) ? goal.phases : [];
  return phases
    .map((phase) => ({ ...phase, startDate: toDateKey(phase.startDate) }))
    .filter((phase) => phase.startDate >= PREVIEW_WINDOW.startDate && phase.startDate <= PREVIEW_WINDOW.endDate)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;
}

function makeGoalCompletionCandidate(goal, closeDailyBriefing, monthWindow) {
  const completionDate = deduceGoalTargetDate(goal);
  if (!goal || !completionDate) return null;
  if (toDateKey(completionDate) < monthWindow.startDate || toDateKey(completionDate) > monthWindow.endDate) return null;
  const completionWindow = getCarryInAwareWindow(
    [{ date: completionDate, id: `goal-completion-${toDateKey(completionDate)}` }],
    monthWindow,
    "date",
    "Goal completion",
    { requireStoryWindow: true },
  );
  if (!completionWindow) return null;

  return createCandidate({
    monthlyWindow: monthWindow,
    storyType: "goal_completion",
    title: `${goal.title || "Goal"} completed and crossed its completion boundary.`,
    timeWindow: completionWindow.storyWindow,
    storyWindow: completionWindow.storyWindow,
    comparisonWindow: completionWindow.comparisonWindow,
    carryInContext: completionWindow.carryInContext,
    evidenceRefs: [goal.id || "goal_completion", closeDailyBriefing?.id || "goal_close", `goal_${toDateKey(completionDate)}`],
    sourceClaimRefs: ["goal_completion", "completion_boundary"],
    narrativeIntent: "goal_boundary",
    evidenceStrength: 9,
    strategicSignificance: 9,
    novelty: 4,
    durability: 8,
    goalRelevance: 10,
    phaseRelevance: 7,
    decisionImpact: 9,
    confidenceImpact: 7,
    contradictionOrRisk: 4,
    recencyWithinWindow: 8,
    futureRelevance: 8,
    dominantThesisSupport: 7,
    syntheticInvolvement: false,
    provenance: {
      source: "monthly_goal_completion_candidate",
      goalId: goal.id,
      completionDate: toDateKey(completionDate),
      goalResult: closeDailyBriefing?.goalStatus?.primary?.progress ?? closeDailyBriefing?.goal?.result ?? null,
    },
  });
}

function makeGoalStartCandidate(goal, monthWindow) {
  const startDate = deduceGoalStartDate(goal);
  if (!startDate || startDate < monthWindow.startDate || startDate > monthWindow.endDate) return null;
  return createCandidate({
    monthlyWindow: monthWindow,
    storyType: "goal_start",
    title: `${goal.title || "A new goal"} launched and set the operating target for the month.`,
    timeWindow: buildTimeWindow(startDate, startDate, "Goal start"),
    storyWindow: buildTimeWindow(startDate, startDate, "Goal start"),
    comparisonWindow: null,
    carryInContext: false,
    evidenceRefs: [goal.id || "goal_start", `goal-start-${toDateKey(startDate)}`],
    sourceClaimRefs: ["goal_start", "goal_launch"],
    narrativeIntent: "goal_transition_context",
    evidenceStrength: 8,
    strategicSignificance: 8,
    novelty: 7,
    durability: 6,
    goalRelevance: 9,
    phaseRelevance: 7,
    decisionImpact: 7,
    confidenceImpact: 4,
    contradictionOrRisk: 3,
    recencyWithinWindow: 9,
    futureRelevance: 8,
    dominantThesisSupport: 8,
    syntheticInvolvement: false,
    provenance: {
      source: "monthly_goal_start_candidate",
      goalId: goal.id,
      startDate: toDateKey(startDate),
    },
  });
}

function makePhaseTransitionCandidate(goal, monthWindow) {
  const phase = latestGoalPhase(goal);
  if (!phase || !phase.startDate) return null;
  const transitionWindow = getCarryInAwareWindow(
    [{ date: phase.startDate, id: phase.id || `phase-${phase.name || "transition"}`, phaseName: phase.name }],
    monthWindow,
    "date",
    "Phase transition",
    { requireStoryWindow: false },
  );
  if (!transitionWindow) return null;
  if (transitionWindow.storyWindow && transitionWindow.storyWindow.startDate < (monthWindow.storyWindowStart || monthWindow.deliveryDate || monthWindow.startDate)) return null;
  return createCandidate({
    monthlyWindow: monthWindow,
    storyType: "phase_transition",
    title: `${phase.name || "Phase transition"} began within the month and reframed the next operating state.`,
    timeWindow: transitionWindow.storyWindow,
    storyWindow: transitionWindow.storyWindow,
    comparisonWindow: transitionWindow.comparisonWindow,
    carryInContext: transitionWindow.carryInContext,
    evidenceRefs: [...toEvidenceRefs([phase]), goal.id || "goal"],
    sourceClaimRefs: ["phase_transition", "phase_start"],
    narrativeIntent: "goal_transition_context",
    evidenceStrength: 8,
    strategicSignificance: 8,
    novelty: 6,
    durability: 7,
    goalRelevance: 9,
    phaseRelevance: 10,
    decisionImpact: 8,
    confidenceImpact: 5,
    contradictionOrRisk: 3,
    recencyWithinWindow: 8,
    futureRelevance: 8,
    dominantThesisSupport: 9,
    syntheticInvolvement: false,
    provenance: {
      source: "monthly_phase_transition_candidate",
      phaseId: phase.id || "phase",
      phaseName: phase.name || "Goal phase",
      startDate: phase.startDate,
    },
  });
}

function pickDexaCandidates(dexaScans) {
  const sorted = [...dexaScans].sort(byDate("measuredAt"));
  const baseline = sorted.find((item) => item?.isNewBaseline || item?.baselineRole || item?.dexaRole === "new_baseline");
  const latest = sorted.at(-1) || null;
  const previous = sorted.at(-2) || null;
  return { baseline, latest, previous };
}

function makeNewBaselineCandidate(dexaScans, monthWindow) {
  const selected = pickDexaCandidates(dexaScans).baseline;
  if (!selected) return null;
  const date = toDateKey(selected.measuredAt || selected.date);
  if (!date || date < monthWindow.startDate || date > monthWindow.endDate) return null;
  const baselineWindow = getCarryInAwareWindow([selected], monthWindow, "measuredAt", "New baseline", { requireStoryWindow: false });
  if (!baselineWindow) return null;
  const bodyFat = normalizeNumericBodyMass(selected.bodyFatPercentage);
  const leanMass = normalizeNumericBodyMass(selected.leanMass);
  const fatMass = normalizeNumericBodyMass(selected.fatMass);

  return createCandidate({
    monthlyWindow: monthWindow,
    storyType: "new_baseline",
    title: "A new composition baseline was established for future Build Lean Mass comparison.",
    timeWindow: baselineWindow.storyWindow,
    storyWindow: baselineWindow.storyWindow,
    comparisonWindow: baselineWindow.comparisonWindow,
    carryInContext: baselineWindow.carryInContext,
    evidenceRefs: [selected.id || `dexa_${date}`, `goal_reference_${date}`],
    sourceClaimRefs: ["new_baseline", "evidence_reference"],
    narrativeIntent: "dexa_baseline_reference",
    evidenceStrength: 10,
    strategicSignificance: 10,
    novelty: 8,
    durability: 10,
    goalRelevance: 10,
    phaseRelevance: 9,
    decisionImpact: 9,
    confidenceImpact: 3,
    contradictionOrRisk: 2,
    recencyWithinWindow: 9,
    futureRelevance: 10,
    dominantThesisSupport: 10,
    syntheticInvolvement: isSynthetic(selected),
    provenance: {
      source: "monthly_new_baseline_candidate",
      scanId: selected.id || "dexa_baseline",
      scanDate: date,
      bodyFat,
      leanMass,
      fatMass,
      role: selected.baselineRole || "new_baseline",
    },
  });
}

function makeDexaBaselineCandidate(dexaScans, monthWindow) {
  const latest = pickDexaCandidates(dexaScans).latest;
  if (!latest) return null;
  const date = toDateKey(latest.measuredAt);
  if (date < monthWindow.startDate || date > monthWindow.endDate) return null;
  const baselineWindow = getCarryInAwareWindow([latest], monthWindow, "measuredAt", "DEXA baseline", { requireStoryWindow: false });
  if (!baselineWindow) return null;
  return createCandidate({
    monthlyWindow: monthWindow,
    storyType: "dexa_baseline",
    title: "Composition evidence was used to anchor the month’s body-composition interpretation.",
    timeWindow: baselineWindow.storyWindow,
    storyWindow: baselineWindow.storyWindow,
    comparisonWindow: baselineWindow.comparisonWindow,
    carryInContext: baselineWindow.carryInContext,
    evidenceRefs: [latest.id || `dexa_${date}`],
    sourceClaimRefs: ["dexa_baseline", "composition_reference"],
    narrativeIntent: "composition_reference_anchor",
    evidenceStrength: 8,
    strategicSignificance: 7,
    novelty: 5,
    durability: 8,
    goalRelevance: 8,
    phaseRelevance: 7,
    decisionImpact: 6,
    confidenceImpact: 4,
    contradictionOrRisk: 2,
    recencyWithinWindow: 6,
    futureRelevance: 8,
    dominantThesisSupport: 7,
    syntheticInvolvement: isSynthetic(latest),
    provenance: {
      source: "monthly_dexa_baseline_candidate",
      scanId: latest.id || "dexa_baseline",
      scanDate: date,
    },
  });
}

function makeDexaComparisonCandidate(dexaScans, monthWindow) {
  const { latest, previous } = pickDexaCandidates(dexaScans);
  if (!latest || !previous) return null;
  const latestDate = toDateKey(latest.measuredAt);
  const previousDate = toDateKey(previous.measuredAt);
  if (!latestDate || !previousDate) return null;
  const comparisonWindow = getCarryInAwareWindow([previous, latest], monthWindow, "measuredAt", "DEXA comparison");
  if (!comparisonWindow) return null;
  if (!comparisonWindow.storyWindow || comparisonWindow.storyWindow.startDate < monthWindow.startDate || comparisonWindow.storyWindow.startDate > monthWindow.endDate) return null;

  const latestBodyFat = normalizeNumericBodyMass(latest.bodyFatPercentage);
  const priorBodyFat = normalizeNumericBodyMass(previous.bodyFatPercentage);
  const bodyFatDirection = latestBodyFat == null || priorBodyFat == null ? "unknown" : (latestBodyFat <= priorBodyFat ? "non_increasing" : "increasing");
  const latestLean = normalizeNumericBodyMass(latest.leanMass);
  const priorLean = normalizeNumericBodyMass(previous.leanMass);
  const leanDirection = latestLean == null || priorLean == null ? "unknown" : (latestLean >= priorLean ? "non_declining" : "declining");

  return createCandidate({
    monthlyWindow: monthWindow,
    storyType: "dexa_comparison",
    title: "DEXA trend was used for interpretation, without over-claiming lean-mass progress.",
    timeWindow: comparisonWindow.storyWindow,
    storyWindow: comparisonWindow.storyWindow,
    comparisonWindow: comparisonWindow.comparisonWindow,
    carryInContext: comparisonWindow.carryInContext,
    evidenceRefs: toEvidenceRefs([...comparisonWindow.storyRecords, ...comparisonWindow.comparisonRecords]),
    sourceClaimRefs: ["dexa_comparison", "directional_context"],
    narrativeIntent: "composition_direction",
    evidenceStrength: 6,
    strategicSignificance: 7,
    novelty: 5,
    durability: 7,
    goalRelevance: 7,
    phaseRelevance: 6,
    decisionImpact: 6,
    confidenceImpact: 4,
    contradictionOrRisk: 3,
    recencyWithinWindow: 5,
    futureRelevance: 6,
    dominantThesisSupport: 6,
    syntheticInvolvement: isSynthetic(latest) || isSynthetic(previous),
    provenance: {
      source: "monthly_dexa_comparison_candidate",
      latestDate,
      previousDate,
      direction: latestBodyFat !== null && priorBodyFat !== null && latestBodyFat <= priorBodyFat ? "non_improving" : bodyFatDirection,
      leanDirection,
    },
  });
}

function makeDexaContradictionCandidate(dexaScans, weights, monthWindow) {
  const { latest } = pickDexaCandidates(dexaScans);
  if (!latest || weights.length < 2) return null;
  const latestDate = toDateKey(latest.measuredAt);
  if (!latestDate || latestDate < monthWindow.startDate || latestDate > monthWindow.endDate) return null;
  const contradictionWindow = getCarryInAwareWindow([latest], monthWindow, "measuredAt", "Composition contradiction");
  if (!contradictionWindow) return null;
  if (!contradictionWindow.storyWindow) return null;

  const weightsSorted = [...weights].sort(byDate("measuredAt"));
  const first = number(weightsSorted[0]?.weight?.value ?? weightsSorted[0]?.weight);
  const last = number(weightsSorted.at(-1)?.weight?.value ?? weightsSorted.at(-1)?.weight);
  const bodyFat = normalizeNumericBodyMass(latest.bodyFatPercentage);
  if (first == null || last == null || bodyFat == null) return null;
  const apparent = last < first && bodyFat > 11;
  if (!apparent) return null;

  return createCandidate({
    monthlyWindow: monthWindow,
    storyType: "dexa_contradiction",
    title: "Body-composition and weight signals are mixed enough to require cautious interpretation.",
    timeWindow: contradictionWindow.timeWindow,
    storyWindow: contradictionWindow.storyWindow,
    comparisonWindow: contradictionWindow.comparisonWindow,
    carryInContext: contradictionWindow.carryInContext,
    evidenceRefs: toEvidenceRefs([latest, ...weightsSorted]),
    sourceClaimRefs: ["composition_signals", "risk_signal"],
    narrativeIntent: "interpretation_qualification",
    evidenceStrength: 5,
    strategicSignificance: 6,
    novelty: 6,
    durability: 5,
    goalRelevance: 6,
    phaseRelevance: 5,
    decisionImpact: 7,
    confidenceImpact: 6,
    contradictionOrRisk: 9,
    recencyWithinWindow: 7,
    futureRelevance: 6,
    dominantThesisSupport: 5,
    syntheticInvolvement: isSynthetic(latest),
    provenance: {
      source: "monthly_dexa_contradiction_candidate",
      bodyFat,
      weightChange: roundOne(last - first),
    },
  });
}

function makeEnergyTrendCandidate(energyContinuations, monthWindow) {
  const records = [...(energyContinuations ?? [])].sort(byDate("date"));
  if (records.length < 2) return null;
  const windowed = getCarryInAwareWindow(records, monthWindow, "date", "Energy evolution", { requireStoryWindow: false });
  if (!windowed) return null;
  const filtered = windowed.storyRecords;
  if (filtered.length < 2) return null;

  const start = number(filtered[0]?.balance);
  const end = number(filtered.at(-1)?.balance);
  if (start == null || end == null) return null;
  const closing = Math.abs(end) <= 500 && filtered.every((entry, index, all) => index === 0 || Math.sign(all[index - 1].balance - all[index].balance) >= 0);
  return createCandidate({
    monthlyWindow: monthWindow,
    storyType: "energy_trend",
    title: `Energy moved from ${start} to ${end}, with continuity across the month.`,
    timeWindow: windowed.storyWindow,
    storyWindow: windowed.storyWindow,
    comparisonWindow: windowed.comparisonWindow,
    carryInContext: windowed.carryInContext,
    evidenceRefs: toEvidenceRefs(filtered),
    sourceClaimRefs: ["energy_balance", "energy_trajectory"],
    narrativeIntent: "energy_stability",
    evidenceStrength: clamp(filtered.length * 2, 0, 10),
    strategicSignificance: closing ? 8 : 6,
    novelty: 5,
    durability: Math.min(10, filtered.length + 2),
    goalRelevance: 8,
    phaseRelevance: 5,
    decisionImpact: 7,
    confidenceImpact: 3,
    contradictionOrRisk: closing ? 3 : 4,
    recencyWithinWindow: 9,
    futureRelevance: 7,
    dominantThesisSupport: 8,
    syntheticInvolvement: filtered.some((entry) => isSynthetic(entry)),
    provenance: {
      source: "monthly_energy_trend_candidate",
      trendDirection: end < start ? "closer_to_maintenance" : "away_from_maintenance",
      sampleCount: filtered.length,
    },
  });
}

function makeTrainingCandidate(trainingObservations, monthWindow) {
  const records = [...(trainingObservations ?? [])];
  if (records.length < 2) return null;
  const windowed = getCarryInAwareWindow(records, monthWindow, "date", "Training evolution", { requireStoryWindow: false });
  if (!windowed) return null;
  const filtered = windowed.storyRecords;
  const improving = filtered.filter((entry) => entry.direction === "improving");
  const plateau = filtered.filter((entry) => entry.direction === "plateauing");
  if (improving.length === 0) return null;
  const startDate = toDateKey(filtered[0]?.date);
  const endDate = toDateKey(filtered.at(-1)?.date);
  if (!startDate || !endDate) return null;

  const improvingShare = improving.length / records.length;
  const includesPlateau = plateau.length > 0;
  return createCandidate({
    monthlyWindow: monthWindow,
    storyType: "training_evolution",
    title: `Training showed ${improving.length}/${records.length} improving data points${includesPlateau ? " with some plateauing structure." : "."}`,
    timeWindow: windowed.storyWindow,
    storyWindow: windowed.storyWindow,
    comparisonWindow: windowed.comparisonWindow,
    carryInContext: windowed.carryInContext,
    evidenceRefs: toEvidenceRefs(filtered),
    sourceClaimRefs: ["training_observations", "movement_progress"],
    narrativeIntent: "training_progress",
    evidenceStrength: clamp(improvingShare * 10, 0, 10),
    strategicSignificance: 7,
    novelty: 4 + improvingShare * 3,
    durability: 7,
    goalRelevance: 8,
    phaseRelevance: 5,
    decisionImpact: includesPlateau ? 7 : 6,
    confidenceImpact: 3,
    contradictionOrRisk: improvingShare > 0.6 ? 2 : 4,
    recencyWithinWindow: 8,
    futureRelevance: 8,
    dominantThesisSupport: 7,
    syntheticInvolvement: records.some((entry) => isSynthetic(entry)),
    provenance: {
      source: "monthly_training_evolution_candidate",
      improvingCount: improving.length,
      plateauCount: plateau.length,
      uniqueMovements: new Set(records.map((entry) => entry.type || entry.movement)).size,
    },
  });
}

function makeRecoveryIssueCandidate(trainingObservations, monthWindow) {
  const issueWindow = getCarryInAwareWindow((trainingObservations ?? []).filter((entry) => entry.issue), monthWindow, "date", "Recovery signal", { requireStoryWindow: false });
  if (!issueWindow) return null;
  const issueRecords = issueWindow.storyRecords;
  if (issueRecords.length === 0) return null;

  return createCandidate({
    monthlyWindow: monthWindow,
    storyType: "recovery_issue",
    title: "Recovery or fatigue warnings suggest the month deserves pacing guardrails.",
    timeWindow: issueWindow.storyWindow,
    storyWindow: issueWindow.storyWindow,
    comparisonWindow: issueWindow.comparisonWindow,
    carryInContext: issueWindow.carryInContext,
    evidenceRefs: toEvidenceRefs(issueRecords),
    sourceClaimRefs: ["fatigue_signal", "recovery_risk"],
    narrativeIntent: "recovery_risk_gate",
    evidenceStrength: clamp(issueRecords.length * 2.2, 0, 10),
    strategicSignificance: 6,
    novelty: 3,
    durability: 6,
    goalRelevance: 7,
    phaseRelevance: 6,
    decisionImpact: 7,
    confidenceImpact: 6,
    contradictionOrRisk: 8,
    recencyWithinWindow: 6,
    futureRelevance: 7,
    dominantThesisSupport: 5,
    syntheticInvolvement: issueRecords.some((entry) => isSynthetic(entry)),
    provenance: {
      source: "monthly_recovery_issue_candidate",
      issueCount: issueRecords.length,
      issues: [...new Set(issueRecords.map((entry) => entry.issue))],
    },
  });
}

function makeRecommendationCandidate(closeBriefings, monthWindow) {
  if (!Array.isArray(closeBriefings) || closeBriefings.length < 2) return null;
  const ordered = [...closeBriefings].sort(byDate("generatedAt"));
  const windowFiltered = ordered.filter((entry) => {
    const date = toDateKey(entry.generatedAt);
    return date >= monthWindow.startDate && date <= monthWindow.endDate;
  });
  if (windowFiltered.length < 2) return null;

  const startConfidence = number(windowFiltered[0]?.hero?.confidence ?? windowFiltered[0]?.confidence);
  const endConfidence = number(windowFiltered.at(-1)?.hero?.confidence ?? windowFiltered.at(-1)?.confidence);
  if (startConfidence == null || endConfidence == null || endConfidence < 70) return null;
  const changed = Math.abs(endConfidence - startConfidence) >= 8;
  if (!changed) return null;

  return createCandidate({
    monthlyWindow: monthWindow,
    storyType: "recommendation_change",
    title: "Recommendation posture strengthened and remained coherent through the month.",
    timeWindow: buildTimeWindow(windowFiltered[0].generatedAt, windowFiltered.at(-1).generatedAt, "Recommendation continuity"),
    evidenceRefs: toEvidenceRefs(windowFiltered),
    sourceClaimRefs: ["recommendation_continuity", "confidence_window"],
    narrativeIntent: "recommendation_stability",
    evidenceStrength: clamp(Math.abs(endConfidence - startConfidence), 0, 10),
    strategicSignificance: 7,
    novelty: 4,
    durability: 6,
    goalRelevance: 7,
    phaseRelevance: 4,
    decisionImpact: 7,
    confidenceImpact: 7,
    contradictionOrRisk: 3,
    recencyWithinWindow: 7,
    futureRelevance: 6,
    dominantThesisSupport: 6,
    syntheticInvolvement: windowFiltered.some((entry) => isSynthetic(entry)),
    provenance: {
      source: "monthly_recommendation_change_candidate",
      confidenceRange: [startConfidence, endConfidence],
      recommendation: windowFiltered.at(-1)?.hero?.recommendation || "maintenance-calibration",
    },
  });
}

function makeConfidenceShiftCandidate(closeBriefings, monthWindow) {
  const sorted = [...(closeBriefings ?? [])].sort(byDate("generatedAt"));
  if (sorted.length < 2) return null;
  const filtered = sorted.filter((entry) => {
    const date = toDateKey(entry.generatedAt);
    return date >= monthWindow.startDate && date <= monthWindow.endDate;
  });
  if (filtered.length < 2) return null;

  const start = number(filtered[0]?.hero?.confidence ?? filtered[0]?.confidence);
  const end = number(filtered.at(-1)?.hero?.confidence ?? filtered.at(-1)?.confidence);
  if (start == null || end == null || Math.abs(end - start) < 8) return null;

  const startDecision = filtered[0]?.hero?.decision || filtered[0]?.decisionSignal;
  const endDecision = filtered.at(-1)?.hero?.decision || filtered.at(-1)?.decisionSignal;
  const changesDecision = startDecision && endDecision && startDecision !== endDecision;

  return createCandidate({
    monthlyWindow: monthWindow,
    storyType: "confidence_shift",
    title: "Confidence moved materially, with decision signal review support.",
    timeWindow: buildTimeWindow(filtered[0].generatedAt, filtered.at(-1).generatedAt, "Confidence dynamics"),
    evidenceRefs: toEvidenceRefs(filtered),
    sourceClaimRefs: ["confidence_delta", "decision_readiness"],
    narrativeIntent: "confidence_trajectory",
    evidenceStrength: clamp(Math.abs(end - start), 0, 10),
    strategicSignificance: changesDecision ? 6 : 4,
    novelty: 5,
    durability: 5,
    goalRelevance: 5,
    phaseRelevance: 3,
    decisionImpact: changesDecision ? 8 : 3,
    confidenceImpact: 8,
    contradictionOrRisk: 4,
    recencyWithinWindow: 7,
    futureRelevance: changesDecision ? 6 : 4,
    dominantThesisSupport: changesDecision ? 5 : 3,
    syntheticInvolvement: filtered.some((entry) => isSynthetic(entry)),
    provenance: {
      source: "monthly_confidence_shift_candidate",
      confidenceRange: [start, end],
      decisionShift: changesDecision,
      startDecision,
      endDecision,
    },
  });
}

function makePhotoProgressionCandidate(photos, monthWindow) {
  const validPhotos = (photos ?? []).filter((photo) => photo?.capturedAt);
  const windowed = getCarryInAwareWindow(validPhotos, monthWindow, "capturedAt", "Photo progression", { requireStoryWindow: false });
  if (!windowed) return null;
  const inWindow = windowed.storyRecords;
  if (inWindow.length < 2) return null;

  return createCandidate({
    monthlyWindow: monthWindow,
    storyType: "photo_progression",
    title: "Photos confirmed a coherent direction at visual check-in cadence.",
    timeWindow: windowed.storyWindow,
    storyWindow: windowed.storyWindow,
    comparisonWindow: windowed.comparisonWindow,
    carryInContext: windowed.carryInContext,
    evidenceRefs: toEvidenceRefs([...windowed.storyRecords, ...windowed.comparisonRecords]),
    sourceClaimRefs: ["photo_progression", "visual_context"],
    narrativeIntent: "visual_progression",
    evidenceStrength: clamp(inWindow.length * 2, 0, 10),
    strategicSignificance: 5,
    novelty: 4,
    durability: 5,
    goalRelevance: 7,
    phaseRelevance: 4,
    decisionImpact: 4,
    confidenceImpact: 2,
    contradictionOrRisk: 3,
    recencyWithinWindow: 5,
    futureRelevance: 5,
    dominantThesisSupport: 4,
    syntheticInvolvement: inWindow.some((photo) => isSynthetic(photo)),
    provenance: {
      source: "monthly_photo_progression_candidate",
      photoCount: inWindow.length,
      cadence: `${Math.round((inWindow.length - 1) / Math.max(1, inWindow.length))}`,
    },
  });
}

function makeWeightContextCandidate(weights, monthWindow) {
  const valid = [...(weights ?? [])].sort(byDate("measuredAt"));
  if (valid.length < 2) return null;
  const windowed = getCarryInAwareWindow(valid, monthWindow, "measuredAt", "Weight context", { requireStoryWindow: false });
  if (!windowed) return null;
  const inWindow = windowed.storyRecords;
  if (inWindow.length < 2) return null;
  const start = number(inWindow[0]?.weight?.value ?? inWindow[0]?.weight);
  const end = number(inWindow.at(-1)?.weight?.value ?? inWindow.at(-1)?.weight);
  if (start == null || end == null) return null;

  return createCandidate({
    monthlyWindow: monthWindow,
    storyType: "weight_context",
    title: `Scale coverage stayed steady around ${roundOne(start)} to ${roundOne(end)} in the month.`,
    timeWindow: windowed.storyWindow,
    storyWindow: windowed.storyWindow,
    comparisonWindow: windowed.comparisonWindow,
    carryInContext: windowed.carryInContext,
    evidenceRefs: toEvidenceRefs([...windowed.storyRecords, ...windowed.comparisonRecords]),
    sourceClaimRefs: ["weight_series", "scale_context"],
    narrativeIntent: "weight_grounding",
    evidenceStrength: clamp(valid.length * 1.4, 0, 10),
    strategicSignificance: 6,
    novelty: 3,
    durability: 5,
    goalRelevance: 7,
    phaseRelevance: 4,
    decisionImpact: 5,
    confidenceImpact: 4,
    contradictionOrRisk: 4,
    recencyWithinWindow: 8,
    futureRelevance: 4,
    dominantThesisSupport: 4,
    syntheticInvolvement: valid.some((item) => isSynthetic(item)),
    provenance: {
      source: "monthly_weight_context_candidate",
      pointCount: valid.length,
      startWeight: start,
      endWeight: end,
    },
  });
}

function makeRiskSignalCandidate(weights, monthWindow) {
  const riskWindow = getCarryInAwareWindow(weights ?? [], monthWindow, "measuredAt", "Weight risk", { requireStoryWindow: false });
  if (!riskWindow) return null;
  const sorted = [...riskWindow.storyRecords, ...riskWindow.comparisonRecords].sort(byDate("measuredAt"));
  if (sorted.length < 4) return null;
  const start = number(sorted[0]?.weight?.value ?? sorted[0]?.weight);
  const end = number(sorted.at(-1)?.weight?.value ?? sorted.at(-1)?.weight);
  if (start == null || end == null) return null;
  const delta = Math.abs(end - start);
  const markedRisk = sorted.some((entry) => entry?.riskSignal || entry?.riskMarker || entry?.riskReason);
  if (!markedRisk) return null;
  if (delta <= 3.5) return null;

  return createCandidate({
    monthlyWindow: monthWindow,
    storyType: "risk_signal",
    title: "Weight variance became a meaningful monitor signal that should influence risk framing.",
    timeWindow: riskWindow.storyWindow,
    storyWindow: riskWindow.storyWindow,
    comparisonWindow: riskWindow.comparisonWindow,
    carryInContext: riskWindow.carryInContext,
    evidenceRefs: toEvidenceRefs(sorted),
    sourceClaimRefs: ["weight_variance", "risk_monitoring"],
    narrativeIntent: "risk_signal_context",
    evidenceStrength: clamp(delta, 0, 10),
    strategicSignificance: 6,
    novelty: 3,
    durability: 6,
    goalRelevance: 7,
    phaseRelevance: 5,
    decisionImpact: 7,
    confidenceImpact: 3,
    contradictionOrRisk: 8,
    recencyWithinWindow: 5,
    futureRelevance: 6,
    dominantThesisSupport: 5,
    syntheticInvolvement: sorted.some((item) => isSynthetic(item)),
    provenance: {
      source: "monthly_risk_signal_candidate",
      delta: roundOne(delta),
    },
  });
}

function makeInterruptionCandidate(weights, photos, monthWindow) {
  const entries = [...(weights ?? []), ...(photos ?? [])];
  const interruptionWindow = getCarryInAwareWindow(entries, monthWindow, "capturedAt", "Coverage interruption", { requireStoryWindow: false });
  if (!interruptionWindow) return null;
  const inWindow = [...interruptionWindow.storyRecords, ...interruptionWindow.comparisonRecords].sort(byDate("capturedAt"));
  if (entries.length < 3) return null;
  if (inWindow.length < 3) return null;
  const hasInterruptionSignal = inWindow.some((entry) => entry?.interruptionSignal || entry?.gapReason || entry?.issue);
  if (!hasInterruptionSignal) return null;
  const dates = inWindow.map((entry) => toDateKey(entry.capturedAt || entry.measuredAt || entry.date)).filter(Boolean).sort();
  const maxGap = Math.max(...dates.slice(1).map((value, index) => dateDistance(dates[index], value) || 0));
  if (maxGap < 8) return null;
  return createCandidate({
    monthlyWindow: monthWindow,
    storyType: "interruption",
    title: "A major observation gap reduced continuity confidence in one segment.",
    timeWindow: interruptionWindow.storyWindow,
    storyWindow: interruptionWindow.storyWindow,
    comparisonWindow: interruptionWindow.comparisonWindow,
    carryInContext: interruptionWindow.carryInContext,
    evidenceRefs: toEvidenceRefs(inWindow),
    sourceClaimRefs: ["continuity_gap", "observation_gap"],
    narrativeIntent: "continuity_check",
    evidenceStrength: clamp(maxGap / 2, 0, 10),
    strategicSignificance: 5,
    novelty: 2,
    durability: 6,
    goalRelevance: 4,
    phaseRelevance: 4,
    decisionImpact: 5,
    confidenceImpact: 6,
    contradictionOrRisk: 6,
    recencyWithinWindow: 4,
    futureRelevance: 4,
    dominantThesisSupport: 4,
    syntheticInvolvement: entries.some((entry) => isSynthetic(entry)),
    provenance: {
      source: "monthly_interruption_candidate",
      maxGap,
    },
  });
}

function listCandidateCatalog({evidence, goal, monthWindow}) {
  const {
    weights = [],
    dexaScans = [],
    progressPhotos = [],
    dailyBriefings = [],
    energyContinuations = [],
    trainingObservations = [],
  } = evidence;

  const closeBriefings = [...dailyBriefings].sort(byDate("generatedAt"));
  const finalBriefing = closeBriefings.at(-1) ?? null;

  const candidates = [
    makeGoalCompletionCandidate(goal, finalBriefing, monthWindow),
    makeGoalStartCandidate(goal, monthWindow),
    makePhaseTransitionCandidate(goal, monthWindow),
    makeNewBaselineCandidate(dexaScans, monthWindow),
    makeDexaBaselineCandidate(dexaScans, monthWindow),
    makeDexaComparisonCandidate(dexaScans, monthWindow),
    makeDexaContradictionCandidate(dexaScans, weights, monthWindow),
    makeEnergyTrendCandidate(energyContinuations, monthWindow),
    makeTrainingCandidate(trainingObservations, monthWindow),
    makeRecoveryIssueCandidate(trainingObservations, monthWindow),
    makeRecommendationCandidate(closeBriefings, monthWindow),
    makeConfidenceShiftCandidate(closeBriefings, monthWindow),
    makePhotoProgressionCandidate(progressPhotos, monthWindow),
    makeWeightContextCandidate(weights, monthWindow),
    makeRiskSignalCandidate(weights, monthWindow),
    makeInterruptionCandidate(weights, progressPhotos, monthWindow),
  ].filter(Boolean);

  return candidates.map(applyDeterministicScoring);
}

function listMonthScopeCandidateSet(evidence, goal, monthWindow) {
  return listCandidateCatalog({ evidence, goal, monthWindow });
}

function selectMonthCandidates(evidence, goal, monthWindow) {
  const candidates = listMonthScopeCandidateSet(evidence, goal, monthWindow).map((candidate) => ({ ...candidate, included: true }));
  const ranked = rankCandidates(candidates);
  const merged = applyMergeAndSuppression(ranked);

  const orderedMap = applyEditorialOrdering(merged.selected);
  const rankedEditorial = orderedMap.ordered.filter((candidate) => !isBoundedMilestoneType(candidate.storyType));
  const boundedCandidates = orderedMap.ordered.filter((candidate) => isBoundedMilestoneType(candidate.storyType));
  const editorialCapacity = Math.min(MONTHLY_EDITORIAL_CAPACITY, rankedEditorial.length);
  const selectedEditorial = rankedEditorial.slice(0, editorialCapacity);
  const renderedCandidateIds = [
    ...selectedEditorial,
    ...boundedCandidates,
  ].map((candidate) => candidate.storyId);
  const rankedEditorialStoryIds = selectedEditorial.map((candidate) => candidate.storyId);
  const orderedCandidates = orderedMap.ordered.map((candidate, index) => ({ ...candidate, renderedOrder: index + 1 }));

  const adjustedCandidates = candidates.map((candidate) => {
    const updated = orderedCandidates.find((item) => item.storyId === candidate.storyId);
    return updated ? { ...updated } : candidate;
  });

  const included = adjustedCandidates.filter((candidate) => candidate.included);
  const editorialSelectedSet = new Set(selectedEditorial.map((candidate) => candidate.storyId));
  const boundedSelectedSet = new Set(boundedCandidates.map((candidate) => candidate.storyId));

  for (let index = 0; index < adjustedCandidates.length; index += 1) {
    const candidate = adjustedCandidates[index];
    const keeps = editorialSelectedSet.has(candidate.storyId) || boundedSelectedSet.has(candidate.storyId);
    if (keeps) {
      candidate.included = true;
      if (!candidate.mergeMetadata) {
        candidate.mergeMetadata = null;
      }
    } else if (candidate.included) {
      if (!candidate.inclusionReason) {
        candidate.inclusionReason = "editorial_capacity_reached";
      }
      candidate.exclusionReason = "editorial_capacity_exceeded";
      candidate.included = false;
      if (!candidate.renderedOrder) candidate.renderedOrder = null;
    }
  }

  return {
    candidates: adjustedCandidates,
    orderedCandidates: selectedEditorial,
    scoreRankedCandidateIds: adjustedCandidates.map((candidate) => candidate.storyId),
    renderedCandidateIds: renderedCandidateIds,
    rankedEditorialStoryIds,
    mergedDecisions: merged.mergedDecisions,
    orderingAdjustments: orderedMap.adjustments,
    mergeMeta: merged,
  };
}

function deriveHeroThesisIds(candidates) {
  const preferredOrder = [
    "new_baseline",
    "energy_trend",
    "training_evolution",
    "photo_progression",
    "weight_context",
    "dexa_baseline",
    "dexa_comparison",
    "dexa_contradiction",
    "risk_signal",
    "interruption",
    "goal_completion",
    "goal_start",
    "phase_transition",
  ];
  const priority = Object.fromEntries(preferredOrder.map((type, index) => [type, index + 1]));
  return candidates
    .filter((candidate) => candidate.included && candidate.scoreRank !== null)
    .sort((left, right) => {
      const leftPriority = priority[left.storyType] ?? 999;
      const rightPriority = priority[right.storyType] ?? 999;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return (left.scoreRank ?? 999) - (right.scoreRank ?? 999);
    })
    .slice(0, 3)
    .map((candidate) => candidate.storyId);
}

function deriveBoundedMilestones(candidates) {
  return candidates
    .filter((candidate) => candidate.included)
    .filter((candidate) => isBoundedMilestoneType(candidate.storyType))
    .sort((left, right) => (left.scoreRank ?? 99) - (right.scoreRank ?? 99))
    .map((candidate) => candidate.storyId);
}

function createEditorialDecision({ evidence, goal, monthWindow }) {
  const {
    candidates,
    orderedCandidates,
    scoreRankedCandidateIds,
    renderedCandidateIds,
    rankedEditorialStoryIds,
    mergedDecisions,
    orderingAdjustments,
    mergeMeta,
  } = selectMonthCandidates(evidence, goal, monthWindow);
  const sortedScore = [...candidates].sort((left, right) => (left.scoreRank ?? 99) - (right.scoreRank ?? 99));
  const sortedRendered = [...orderedCandidates].sort((left, right) => (left.renderedOrder ?? 99) - (right.renderedOrder ?? 99));
  const syntheticContinuation = evidence?.syntheticContinuations?.length ? evidence.syntheticContinuations : [];
  const syntheticActive = syntheticContinuation.length > 0;
  const syntheticDates = syntheticActive ? [
    toDateKey(syntheticContinuation.at(0)?.generatedAt ?? syntheticContinuation.at(0)?.measuredAt ?? syntheticContinuation.at(0)?.date),
    toDateKey(syntheticContinuation.at(-1)?.generatedAt ?? syntheticContinuation.at(-1)?.measuredAt ?? syntheticContinuation.at(-1)?.date),
  ] : null;

  return freeze({
    id: `${PREVIEW_ID}_editorial_decision`,
    version: MONTHLY_EDITORIAL_DECISION_VERSION,
    generatedAt: new Date().toISOString(),
    previewWindow: monthWindow,
    synthetic: {
      active: syntheticActive,
      candidateCount: syntheticContinuation.length,
      fixtureId: evidence?.syntheticFixtureId ?? null,
    fixtureVersion: evidence?.syntheticFixtureVersion ?? null,
      fixtureSeed: evidence?.syntheticFixtureSeed ?? null,
      syntheticDates,
      realEvidenceCutoff: evidence?.syntheticRealEvidenceCutoff ?? null,
      syntheticStart: evidence?.syntheticStartDate ?? null,
      syntheticEnd: evidence?.syntheticEndDate ?? null,
      syntheticDateRange: evidence?.syntheticDateRange ?? null,
    },
    scoreWeights: MONTHLY_SCORE_WEIGHTS,
    candidates: candidates.map((candidate) => ({
      ...candidate,
      mergeMetadata: candidate.mergeMetadata ?? null,
    })),
    scoreRankedCandidateIds: scoreRankedCandidateIds,
    renderedCandidateIds: renderedCandidateIds,
    rankedEditorialStoryIds,
    selectedStoryCount: sortedRendered.length,
    selectedStoryIds: sortedRendered.map((candidate) => candidate.storyId),
    heroThesisCandidateIds: deriveHeroThesisIds(candidates),
    boundedMilestoneCandidateIds: deriveBoundedMilestones(candidates),
    mergeDecisions: mergedDecisions,
    orderingAdjustments,
    storySchema: MONTHLY_DECISION_SCHEMA_FIELDS,
    schemaVersion: MONTHLY_EDITORIAL_DECISION_VERSION,
    mergeDiagnostics: {
      suppressed: candidates.filter((candidate) => !candidate.included).map((candidate) => ({ storyId: candidate.storyId, reason: candidate.exclusionReason })),
      selectedThesis: sortedRendered.map((candidate) => thesisFrom(candidate.storyType, candidate.narrativeIntent)),
      primaryThesis: sortedRendered.at(0)?.storyType ?? null,
      syntheticOnly: mergeMeta?.syntheticOnly ?? false,
    },
  });
}

function deriveHeroTitle(weightChange, bodyFat, confidence) {
  if (weightChange < -8 && confidence >= 88 && bodyFat != null) return "June turned momentum into confidence.";
  if (weightChange < -5 && confidence >= 84) return "The month showed measurable momentum with a clearer path forward.";
  return "June clarified what matters for the next phase.";
}

function deriveBodyFat(measurement) {
  const value = normalizeNumericBodyMass(measurement?.bodyFatPercentage);
  if (value != null) return roundOne(value);
  return null;
}

function composeLegacyMonthlyNarrative(evidence, monthWindow, currentDexa, priorDexa) {
  const weights = [...(evidence.weights ?? [])].sort(byDate("measuredAt"));
  const photos = [...(evidence.progressPhotos ?? [])].sort(byDate("capturedAt"));
  const dailyBriefings = [...(evidence.dailyBriefings ?? [])].sort(byDate("generatedAt"));
  const close = dailyBriefings.at(-1) || null;
  const firstWeight = number(weights[0]?.weight?.value ?? weights[0]?.weight);
  const lastWeight = number(weights.at(-1)?.weight?.value ?? weights.at(-1)?.weight);
  const weightChange = (firstWeight != null && lastWeight != null) ? roundOne(lastWeight - firstWeight) : null;
  const bodyFat = deriveBodyFat(currentDexa);
  const priorBodyFat = deriveBodyFat(priorDexa);
  const confidence = number(close?.hero?.confidence ?? close?.confidence ?? close?.progress);

  const startDate = monthWindow.startDate;
  const endDate = monthWindow.endDate;

  const points = weights.map((item) => ({
    id: item.id || `weight_${toDateKey(item.measuredAt)}`,
    date: toDateKey(item.measuredAt),
    value: number(item.weight?.value ?? item.weight),
  })).filter((point) => Number.isFinite(point.value));

  const markers = [
    currentDexa ? { date: toDateKey(currentDexa.measuredAt || currentDexa.date), type: "DEXA" } : null,
    ...photos.map((photo) => ({ date: toDateKey(photo.capturedAt), type: "Photo" })),
  ].filter(Boolean);

  return freeze({
    id: PREVIEW_ID,
    preview: true,
    version: MONTHLY_NARRATIVE_PREVIEW_VERSION,
    reviewWindow: monthWindow,
    deliveryDate: monthWindow.deliveryDate,
    hero: {
      title: deriveHeroTitle(roundOne(weightChange ?? 0), bodyFat, confidence ?? 0),
      thesis: `June moved the month from visible structure into a clearer operating line and positioned the next decision window.`,
      highlights: [
        firstWeight != null ? {
          domain: "weight",
          tone: "transformation",
          icon: "↓",
          label: "Transformation",
          value: `${Math.abs(weightChange ?? 0).toFixed(1)} lb`,
          detail: `${roundOne(firstWeight)} to ${roundOne(lastWeight)} lb`,
        } : null,
        bodyFat != null ? {
          domain: "composition",
          tone: "confirmation",
          icon: "◉",
          label: "Composition",
          value: `${bodyFat.toFixed(1)}%`,
          detail: priorBodyFat != null ? `${Math.abs(roundOne(bodyFat - priorBodyFat)).toFixed(1)} points vs prior scan` : "Measured with DEXA window",
        } : null,
        {
          domain: "visual",
          tone: "visual",
          icon: "◍",
          label: "Visual",
          value: photos.length > 1 ? "Multi-angle context" : "Single reference",
          detail: `${photos.length} photo session${photos.length === 1 ? "" : "s"} in scope`,
        },
        confidence != null ? {
          domain: "goal",
          tone: "finish",
          icon: "✓",
          label: "Confidence",
          value: `${Math.round(confidence)}%`,
          detail: `${roundOne((close?.goalStatus?.primary?.progress ?? close?.goal?.progress ?? 0))}% in close state`,
        } : null,
      ].filter(Boolean),
      milestone: confidence && confidence >= 88 ? { label: "Milestone", value: "Goal boundary moved into the completion lane." } : null,
    },
    weightStory: {
      title: "How June unfolded",
      summary: "Monthly scale and body-composition signals stayed coherent across the measured period.",
      points,
      markers,
      start: firstWeight != null ? `${roundOne(firstWeight)} lb` : "N/A",
      end: lastWeight != null ? `${roundOne(lastWeight)} lb` : "N/A",
      change: `${weightChange != null ? `${Math.abs(weightChange)} lb ${weightChange <= 0 ? "down" : "up"}` : "in motion"}`,
    },
    whereMonthBegan: {
      title: "Where June began",
      summary: `The month opened at ${firstWeight != null ? `${roundOne(firstWeight)} lb` : "baseline-weight"} with the strategy intent to preserve momentum while protecting recovery.`,
      facts: [
        { label: "Opening question", value: "What mattered beyond the scale trend?" },
        { label: "Starting signal", value: "Composition and photo context anchored early." },
        { label: "Decision state", value: "Maintain direction and inspect for continuity." },
        { label: "Window", value: `${startDate} to ${endDate}` },
      ],
    },
    whatChanged: {
      title: "What changed",
      themes: [
        {
          title: "Priority moved through the month.",
          body: "The scale stayed aligned to its trajectory while composition context narrowed interpretation risk.",
        },
        {
          title: "Composition framing",
          body: currentDexa ? `DEXA set the anchor at ${deriveBodyFat(currentDexa)}% body-fat.` : "Composition snapshots remained limited but present.",
        },
      ],
    },
    definingMoments: {
      title: "Defining moments",
      moments: [
        currentDexa ? {
          date: toDateKey(currentDexa.measuredAt || currentDexa.date),
          label: "Composition read point",
          body: "Composition and scale context were interpreted together to avoid overclaiming lean-mass change.",
        } : null,
        photos.length > 1 ? {
          date: toDateKey(photos.at(-1).capturedAt),
          label: "Visual update",
          body: "Photo cadence showed the same strategic direction without a change in evidence class.",
        } : null,
      ].filter(Boolean),
    },
    strategyReview: {
      title: "Strategy review",
      thesis: "Execution quality held more significance than isolated data spikes.",
      items: [
        { tone: "positive", label: "Execution", value: "Steady", detail: "No abrupt pivots in the evidence stream." },
        { tone: "watch", label: "Monitoring", value: "Continue", detail: "Maintain continuity to prevent interpretive drift." },
        { tone: "neutral", label: "Lean-mass interpretation", value: "Cautious", detail: "Avoid premature directional claims from one baseline point." },
        { tone: "decision", label: "Recommendation", value: "Prioritize evidence continuity", detail: "Anchor future claims to sustained windows." },
      ],
    },
    costOfProgress: null,
    chapterAhead: {
      title: "The chapter ahead",
      thesis: "The next phase should protect confidence while collecting a fuller evidence sequence.",
      guidance: [
        { icon: "🧭", label: "Decision", value: "Preserve continuity", detail: "Hold the same interpretation framework and add more coverage." },
        { icon: "⚙", label: "Signal quality", value: "Improve daily completeness", detail: "Reduce unknown windows between weekly observations." },
        { icon: "📈", label: "Outcome", value: "Confirm trend", detail: "Use future DEXA only as directional confirmation." },
        { icon: "🧠", label: "Readiness", value: "Pause claims", detail: "Do not treat baseline as progress until repeatable evidence returns." },
      ],
      body: "The month becomes stable only when trends repeat across coverage."
    },
    priorities: [],
  });
}

function mergeContinuationEvidence(baseEvidence, continuation, monthWindow) {
  const lastRealDate = maxDateFrom([
    ...baseEvidence.weights,
    ...baseEvidence.dexaScans,
    ...baseEvidence.progressPhotos,
    ...baseEvidence.dailyBriefings,
    ...baseEvidence.energyContinuations,
    ...baseEvidence.trainingObservations,
  ]);
  const resolvedSyntheticRange = resolveSyntheticDateRange(continuation, lastRealDate, monthWindow);
  const syntheticEndDate = resolvedSyntheticRange.endDate;
  const continuationFilter = (items, field) => (items || []).filter((item) => {
    const date = toDateKey(item?.[field] ?? item?.measuredAt ?? item?.generatedAt ?? item?.date);
    return date > resolvedSyntheticRange.realEvidenceCutoffDate && date <= syntheticEndDate;
  });
  const full = {
    weights: [...baseEvidence.weights, ...continuationFilter(continuation.weights, "measuredAt")],
    dexaScans: [...baseEvidence.dexaScans, ...continuationFilter(continuation.dexaScans, "measuredAt")],
    progressPhotos: [...baseEvidence.progressPhotos, ...continuationFilter(continuation.progressPhotos, "capturedAt")],
    dailyBriefings: [...baseEvidence.dailyBriefings, ...continuationFilter(continuation.dailyBriefings, "generatedAt")],
    energyContinuations: [...baseEvidence.energyContinuations, ...continuationFilter(continuation.energyContinuations, "date")],
    trainingObservations: [...baseEvidence.trainingObservations, ...continuationFilter(continuation.trainingObservations, "date")],
    syntheticContinuations: [...continuation.records],
    syntheticFixtureId: continuation.fixtureId,
    syntheticFixtureVersion: continuation.fixtureVersion,
    syntheticFixtureSeed: continuation.fixtureSeed,
    syntheticDateRange: resolvedSyntheticRange,
    syntheticRealEvidenceCutoff: resolvedSyntheticRange.realEvidenceCutoffDate,
    syntheticStartDate: resolvedSyntheticRange.startDate,
    syntheticEndDate,
  };
  if (full.syntheticContinuations.length > 0) {
    full.syntheticDateRange = resolvedSyntheticRange;
  }
  return full;
}

function currentAndPriorDexa(dexaScans) {
  if (!Array.isArray(dexaScans) || dexaScans.length === 0) return { current: null, prior: null };
  const sorted = [...dexaScans].sort(byDate("measuredAt"));
  const current = sorted.at(-1) || null;
  const prior = sorted.length > 1 ? sorted.at(-2) : null;
  return { current, prior };
}

export function composeMonthlyBriefingPreview({
  weights = [],
  dexaScans = [],
  progressPhotos = [],
  dailyBriefings = [],
  energyContinuations = [],
  trainingObservations = [],
  goal = null,
  syntheticContinuation = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const monthWindow = PREVIEW_WINDOW;
  const baseEvidence = {
    weights: listInWindow(weights, "measuredAt", monthWindow),
    dexaScans: filterByWindow(dexaScans, "measuredAt", monthWindow),
    progressPhotos: filterByWindow(progressPhotos, "capturedAt", monthWindow),
    dailyBriefings: filterByWindow(normalizeBriefingEntries(dailyBriefings), "generatedAt", monthWindow),
    energyContinuations: filterByWindow(energyContinuations, "date", monthWindow),
    trainingObservations: filterByWindow(trainingObservations, "date", monthWindow),
    syntheticContinuations: [],
  };

  const continuation = normalizeSyntheticContinuation(syntheticContinuation);
  const fullEvidence = mergeContinuationEvidence(baseEvidence, continuation, monthWindow);
  if (continuation.records.length > 0) {
    // synth-first continuation can include explicit synthetic lists outside window checks above
    const additionalEnergy = (continuation.energyContinuations ?? []).filter((record) => {
      const date = toDateKey(record.date);
      return date >= monthWindow.startDate && date <= monthWindow.endDate;
    });
    const additionalTrain = (continuation.trainingObservations ?? []).filter((record) => {
      const date = toDateKey(record.date);
      return date >= monthWindow.startDate && date <= monthWindow.endDate;
    });
    fullEvidence.energyContinuations = [...fullEvidence.energyContinuations, ...additionalEnergy];
    fullEvidence.trainingObservations = [...fullEvidence.trainingObservations, ...additionalTrain];
  }

  const narrativeEvidence = {
    weights: baseEvidence.weights,
    dexaScans: baseEvidence.dexaScans,
    progressPhotos: baseEvidence.progressPhotos,
    dailyBriefings: baseEvidence.dailyBriefings,
    energyContinuations: baseEvidence.energyContinuations,
    trainingObservations: baseEvidence.trainingObservations,
  };

  const { current: currentDexa } = currentAndPriorDexa([...baseEvidence.dexaScans, ...fullEvidence.dexaScans]);
  const { prior: priorDexa } = currentAndPriorDexa([...baseEvidence.dexaScans, ...fullEvidence.dexaScans]);
  const narrative = composeLegacyMonthlyNarrative(
    narrativeEvidence,
    monthWindow,
    currentDexa,
    priorDexa,
  );
  const editorialDecision = createEditorialDecision({
    evidence: fullEvidence,
    goal,
    monthWindow,
  });
  return freeze({
    ...narrative,
    id: PREVIEW_ID,
    preview: true,
    version: MONTHLY_NARRATIVE_PREVIEW_VERSION,
    reviewWindow: monthWindow,
    deliveryDate: monthWindow.deliveryDate,
    editorialDecision,
    provenance: {
      ...narrative.provenance,
      previewOnly: true,
      persisted: false,
      generatedAt,
      previewDecision: {
        version: MONTHLY_EDITORIAL_DECISION_VERSION,
        syntheticContinuation: continuation.syntheticActive,
        fixtureId: continuation.fixtureId,
        fixtureVersion: continuation.fixtureVersion,
      },
    },
  });
}

export function createMonthlyBriefingPreviewService({ repositories }) {
  return {
    async preview({ userId, syntheticContinuation = null }) {
      const [weights, dexaScans, progressPhotos, dailyBriefings, goal] = await Promise.all([
        repositories.weights.listWeightEntries(userId),
        repositories.dexaScans.listDEXAScans(userId),
        repositories.progressPhotos.listPhotos(userId),
        repositories.dailyBriefings.listDailyBriefings(userId),
        repositories.goals.getActiveGoal(userId),
      ]);

      return composeMonthlyBriefingPreview({
        weights,
        dexaScans,
        progressPhotos,
        dailyBriefings,
        goal,
        syntheticContinuation,
      });
    },
  };
}
