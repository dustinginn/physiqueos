import { deepFreeze, semanticFingerprint } from "./V3Runtime.js";
import {
  resolveTrainingExerciseOccurrenceIdentity,
} from "../../models/trainingExerciseIdentity.js";
import { resolveUserFacingObjectLanguage } from
  "../../services/UserFacingObjectLanguageService.js";

const CONFIDENCE_SCORE = Object.freeze({ high: 18, moderate: 12, low: 3 });
const TYPE_SCORE = Object.freeze({
  first_weighted_work: 28,
  execution_variant_milestone: 26,
  load_milestone: 24,
  reps_at_load_milestone: 23,
  repeated_progression: 22,
  volume_milestone: 21,
  longitudinal_progression: 18,
  related_movement_contrast: 16,
  sustained_plateau: 15,
  consistency_pattern: 10,
  provisional_plateau: 4,
});

/**
 * Mines source-backed coaching candidates from canonical cadence detail. These
 * candidates are communication inputs only: they do not become evidence
 * capabilities and cannot change authority, eligibility or Confidence.
 */
export function deriveCadenceCoachingDetailsV3({
  domain,
  rawObservations = [],
  canonicalTrainingEvidence = [],
  evidenceWindow = null,
} = {}) {
  if (domain !== "training") return null;
  const training = rawObservations.filter((item) => item?.domain === "training");
  const candidates = deduplicateCandidates([
    ...mineTrainingPiCandidatesV3(training),
    ...mineTrainingHistoryMilestonesV3({
      canonicalTrainingEvidence,
      evidenceWindow,
    }),
    ...mineRelatedMovementComparisonsV3(training),
  ]);
  if (!candidates.length) return null;
  return deepFreeze({
    schemaVersion: "coaching_evidence_detail_v3",
    domain,
    candidates,
    sourceObservationIds: unique(training.map((item) => item.id)),
  });
}

export function selectSpecificCoachingObservationsV3({
  goalContract,
  observations = [],
  crossDomainSynthesis,
  priorInterpretation = null,
  evaluationContext,
  recommendation,
} = {}) {
  const priorMemory = priorInterpretation?.coachingObservationSelection?.communicationMemory ?? [];
  const priorByTopic = new Map(priorMemory.map((item) => [item.topicKey, item]));
  const signalByObservation = new Map((crossDomainSynthesis?.signals ?? [])
    .map((item) => [item.observationId, item]));
  const rankedCandidates = observations.flatMap((observation) =>
    (observation.coachingDetails?.candidates ?? []).map((candidate) => {
      const signal = signalByObservation.get(observation.observationId) ?? null;
      const prior = priorByTopic.get(candidate.topicKey) ?? null;
      const sameSubjectEvidence = priorMemory.find((item) =>
        item.subjectId === candidate.subjectId &&
        item.evidenceSignature &&
        item.evidenceSignature === evidenceSignature(candidate.evidenceIds));
      const sameTopicState = prior?.materialStateKey === candidate.materialStateKey;
      const alreadyCommunicated = sameTopicState ||
        (!prior && Boolean(sameSubjectEvidence));
      const materiallyAdvanced = Boolean(
        (prior || priorMemory.some((item) => item.subjectId === candidate.subjectId)) &&
        !alreadyCommunicated,
      );
      const recommendationCapability = resolveRecommendationCapability({
        candidate,
        goalContract,
      });
      const score = scoreCandidate({
        candidate,
        signal,
        alreadyCommunicated,
        materiallyAdvanced,
      });
      return {
        ...candidate,
        parentObservationId: observation.observationId,
        evidenceRole: signal?.semanticClass ?? null,
        goalRelevance: goalRelevance(signal),
        alreadyCommunicated,
        repeatReason: sameTopicState ? "same_topic_state" :
          !prior && sameSubjectEvidence ? "same_subject_evidence" : null,
        materiallyAdvanced,
        recommendationCapability,
        score,
        narrativeWorthy: !alreadyCommunicated && candidate.confidence !== "low" &&
          score >= 50,
      };
    }));
  rankedCandidates.sort((left, right) =>
    right.score - left.score ||
    String(right.observedAt ?? "").localeCompare(String(left.observedAt ?? "")) ||
    left.candidateId.localeCompare(right.candidateId));

  const recurring = ["closed_cadence_boundary", "weekly", "midweek", "monthly"]
    .includes(evaluationContext?.type);
  const decisionRequiresAction = ![null, undefined, "continue_current_strategy"]
    .includes(recommendation?.action);
  const selected = recurring
    ? selectConciseCandidates(rankedCandidates.filter((item) => item.narrativeWorthy), {
        decisionRequiresAction,
      })
    : [];
  const communicationMemory = mergeCommunicationMemory({
    priorMemory,
    selected,
    communicatedAt: evaluationContext?.evaluatedAt,
  });
  return deepFreeze({
    schemaVersion: "specific_coaching_observation_selection_v3",
    rankedCandidates,
    reviewCandidates: selectReviewCandidates(rankedCandidates, 5),
    selected,
    communicationMemory,
    selectionPolicy: {
      maximumSelected: 2,
      recommendationThresholdHigherThanObservation: true,
      confidenceIndependent: true,
      decisionRequiresAction,
    },
  });
}

function selectReviewCandidates(candidates, limit) {
  const selected = [];
  const subjects = new Set();
  for (const candidate of candidates) {
    if (subjects.has(candidate.subjectId)) continue;
    selected.push(candidate);
    subjects.add(candidate.subjectId);
    if (selected.length === limit) return selected;
  }
  for (const candidate of candidates) {
    if (selected.includes(candidate)) continue;
    selected.push(candidate);
    if (selected.length === limit) break;
  }
  return selected;
}

function mineTrainingPiCandidatesV3(observations) {
  const exerciseObservations = observations.filter((item) =>
    item?.subject?.type === "exercise" && item.subject.id && item.subject.label);
  return exerciseObservations.flatMap((item) => {
    const detail = item.explanationData ?? item.explanation_data ?? {};
    const latest = detail.last_session ?? detail.lastSession ?? null;
    const previous = detail.previous_comparable_session ??
      detail.previousComparableSession ?? null;
    const trend = detail.volume_trend ?? detail.volumeTrend ?? {};
    const prs = detail.pr_detection?.prs ?? detail.prDetection?.prs ?? [];
    const confidence = normalizeConfidence(item.confidence?.level ?? item.confidence);
    const evidenceIds = unique([
      ...(item.supportingEvidenceIds ?? item.supporting_session_ids ?? []),
      latest?.session_id,
      previous?.session_id,
    ]);
    const common = {
      domain: "training",
      subjectId: item.subject.id,
      subjectLabel: item.subject.label,
      relationshipKey: relationshipKey(item, latest),
      category: detail.primaryNavigationCategory ??
        detail.primary_navigation_category ?? item.subject.category ?? null,
      observedAt: latest?.date ?? item.evidenceWindow?.endDate ?? null,
      confidence,
      evidenceIds,
      exposureCount: Number(detail.frequency?.total_sessions ?? evidenceIds.length),
      sourceKind: "canonical_training_performance_observation",
    };
    const language = exerciseLanguage(common.subjectLabel, common.subjectId);
    const result = [];
    for (const pr of prs) {
      const candidate = candidateFromPr(common, pr);
      if (candidate) result.push(candidate);
    }
    const percent = finite(trend.percent_change);
    const latestVolume = finite(trend.latest);
    const previousVolume = finite(trend.previous);
    if (percent != null && latestVolume != null && previousVolume != null &&
        Math.abs(percent) >= 5) {
      result.push(createCandidate({
        ...common,
        type: "longitudinal_progression",
        topicKey: `training|${common.subjectId}|volume_progression`,
        materialStateKey: `${latest?.session_id ?? common.observedAt}|${latestVolume}|${previousVolume}`,
        longitudinalSignificance: Math.min(1, Math.abs(percent) / 25),
        milestoneValue: prs.length ? 0.7 : 0.35,
        decisionImpact: percent < -10 ? 0.8 : 0.35,
        actionability: percent < -10 ? 0.6 : 0.3,
        narrativeText: percent > 0
          ? `${language.label} moved up ${formatPercent(percent)} from the previous comparable exposure, from ${formatNumber(previousVolume)} to ${formatNumber(latestVolume)} lb of session volume.`
          : `${language.label} moved down ${formatPercent(Math.abs(percent))} from the previous comparable exposure, from ${formatNumber(previousVolume)} to ${formatNumber(latestVolume)} lb of session volume.`,
        evidenceBasis: {
          metric: "session_volume",
          currentValue: latestVolume,
          previousValue: previousVolume,
          percentChange: percent,
          currentSessionId: latest?.session_id ?? null,
          previousSessionId: previous?.session_id ?? null,
        },
      }));
    }
    if (percent != null && (latestVolume == null || previousVolume == null) &&
        Math.abs(percent) >= 5) {
      result.push(createCandidate({
        ...common,
        type: "longitudinal_progression",
        topicKey: `training|${common.subjectId}|volume_progression`,
        materialStateKey: `${latest?.session_id ?? common.observedAt}|${round(percent)}`,
        longitudinalSignificance: Math.min(1, Math.abs(percent) / 25),
        milestoneValue: prs.length ? 0.7 : 0.35,
        decisionImpact: percent < -10 ? 0.8 : 0.35,
        actionability: percent < -10 ? 0.6 : 0.3,
        narrativeText: percent > 0
          ? `${language.label} improved ${formatPercent(percent)} from the previous comparable exposure.`
          : `${language.label} declined ${formatPercent(Math.abs(percent))} from the previous comparable exposure.`,
        evidenceBasis: {
          metric: "session_volume",
          currentValue: null,
          previousValue: null,
          percentChange: percent,
          currentSessionId: latest?.session_id ?? null,
          previousSessionId: previous?.session_id ?? null,
          summarizedValuesOnly: true,
        },
      }));
    }
    const exposureCount = common.exposureCount;
    if (item.status === "improving" && exposureCount >= 3 && prs.length) {
      result.push(createCandidate({
        ...common,
        type: "repeated_progression",
        topicKey: `training|${common.subjectId}|repeated_progression`,
        materialStateKey: `${exposureCount}|${latest?.session_id ?? common.observedAt}`,
        longitudinalSignificance: Math.min(1, exposureCount / 5),
        milestoneValue: 0.65,
        decisionImpact: 0.4,
        actionability: 0.25,
        narrativeText: `${language.label} ${language.have} now progressed across ${exposureCount} comparable exposures, rather than showing a one-session spike.`,
        evidenceBasis: {
          metric: "repeated_progression",
          exposureCount,
          latestSessionId: latest?.session_id ?? null,
          prTypes: unique(prs.map((pr) => pr.type)),
        },
      }));
    }
    if (item.status === "plateauing" && exposureCount >= 3) {
      result.push(createCandidate({
        ...common,
        type: "sustained_plateau",
        topicKey: `training|${common.subjectId}|plateau`,
        materialStateKey: `${exposureCount}|${latest?.session_id ?? common.observedAt}`,
        longitudinalSignificance: Math.min(1, exposureCount / 5),
        milestoneValue: 0,
        decisionImpact: exposureCount >= 4 ? 0.65 : 0.4,
        actionability: exposureCount >= 4 ? 0.7 : 0.35,
        narrativeText: `${language.label} ${language.have} stayed essentially flat across ${exposureCount} comparable exposures.`,
        evidenceBasis: {
          metric: "plateau",
          exposureCount,
          latestSessionId: latest?.session_id ?? null,
          percentChange: percent,
        },
      }));
    }
    if (item.status === "plateauing" && exposureCount < 3) {
      result.push(createCandidate({
        ...common,
        type: "provisional_plateau",
        topicKey: `training|${common.subjectId}|plateau`,
        materialStateKey: `${exposureCount}|${latest?.session_id ?? common.observedAt}`,
        confidence: "low",
        longitudinalSignificance: Math.min(0.35, exposureCount / 10),
        milestoneValue: 0,
        decisionImpact: 0.15,
        actionability: 0,
        narrativeText: `${language.label} looked flat in the available comparison, but there are not yet enough comparable exposures to call it a sustained plateau.`,
        evidenceBasis: {
          metric: "provisional_plateau",
          exposureCount,
          minimumRequiredExposures: 3,
          latestSessionId: latest?.session_id ?? null,
          percentChange: percent,
        },
      }));
    }
    return result;
  });
}

function candidateFromPr(common, pr) {
  const current = finite(pr.value);
  const previous = finite(pr.previous_best);
  const language = exerciseLanguage(common.subjectLabel, common.subjectId);
  if (pr.type === "session_volume" &&
      (current == null || previous == null)) {
    const summarizedPercent = finite(pr.percent_change);
    if (summarizedPercent == null || summarizedPercent <= 0) return null;
    return createCandidate({
      ...common,
      type: "volume_milestone",
      topicKey: `training|${common.subjectId}|session_volume_record`,
      materialStateKey: `${round(summarizedPercent)}|${common.observedAt}`,
      longitudinalSignificance: Math.min(1, summarizedPercent / 25),
      milestoneValue: 0.8,
      decisionImpact: 0.35,
      actionability: 0.2,
      narrativeText: `${language.label} set a new session-volume best, ${formatPercent(summarizedPercent)} above the previous best.`,
      evidenceBasis: { metric: "session_volume_record", currentValue: null,
        previousValue: null, percentChange: round(summarizedPercent),
        unit: pr.unit ?? "lb", summarizedValuesOnly: true },
    });
  }
  if (current == null || previous == null || current <= previous) return null;
  if (pr.type === "heaviest_load") {
    return createCandidate({
      ...common,
      type: "load_milestone",
      topicKey: `training|${common.subjectId}|heaviest_load`,
      materialStateKey: `${current}|${pr.unit ?? "lb"}`,
      longitudinalSignificance: 0.85,
      milestoneValue: 0.9,
      decisionImpact: 0.4,
      actionability: 0.2,
      narrativeText: `${language.label} reached ${formatNumber(current)} ${pr.unit ?? "lb"}, up from the previous best of ${formatNumber(previous)} ${pr.unit ?? "lb"}.`,
      evidenceBasis: { metric: "heaviest_load", currentValue: current,
        previousValue: previous, unit: pr.unit ?? "lb" },
    });
  }
  if (pr.type === "reps_at_load" && finite(pr.load) != null) {
    return createCandidate({
      ...common,
      type: "reps_at_load_milestone",
      topicKey: `training|${common.subjectId}|reps_at_load|${pr.load}|${pr.load_unit ?? "lb"}`,
      materialStateKey: `${current}|${pr.load}|${pr.load_unit ?? "lb"}`,
      longitudinalSignificance: 0.8,
      milestoneValue: 0.85,
      decisionImpact: 0.35,
      actionability: 0.2,
      narrativeText: `${language.label} reached ${formatNumber(current)} reps at ${formatNumber(pr.load)} ${pr.load_unit ?? "lb"}, up from ${formatNumber(previous)} reps at that load.`,
      evidenceBasis: { metric: "reps_at_load", currentValue: current,
        previousValue: previous, load: Number(pr.load), unit: pr.load_unit ?? "lb" },
    });
  }
  if (pr.type === "session_volume") {
    const percent = previous > 0 ? ((current - previous) / previous) * 100 : null;
    return createCandidate({
      ...common,
      type: "volume_milestone",
      topicKey: `training|${common.subjectId}|session_volume_record`,
      materialStateKey: `${current}|${pr.unit ?? "lb"}`,
      longitudinalSignificance: 0.75,
      milestoneValue: 0.8,
      decisionImpact: 0.35,
      actionability: 0.2,
      narrativeText: `${language.label} set a new session-volume best at ${formatNumber(current)} ${pr.unit ?? "lb"}${percent == null ? "" : `, ${formatPercent(percent)} above the previous best`}.`,
      evidenceBasis: { metric: "session_volume_record", currentValue: current,
        previousValue: previous, percentChange: round(percent), unit: pr.unit ?? "lb" },
    });
  }
  return null;
}

function mineTrainingHistoryMilestonesV3({ canonicalTrainingEvidence, evidenceWindow }) {
  const sessions = canonicalTrainingEvidence.map(unwrapCanonicalTraining)
    .filter((item) => item?.evidence_type === "training" && item.id && item.observed_at)
    .filter((item) => !isSuperseded(item))
    .sort((left, right) => String(left.observed_at).localeCompare(String(right.observed_at)) ||
      String(left.id).localeCompare(String(right.id)));
  const occurrences = new Map();
  for (const session of sessions) {
    (session.exercises ?? []).forEach((exercise, index) => {
      const identity = resolveTrainingExerciseOccurrenceIdentity(exercise);
      const id = identity.canonicalExerciseId;
      if (!id) return;
      const sets = exercise.sets ?? [];
      const loadState = sets.some((set) => finite(set.weight) != null && Number(set.weight) > 0 &&
        set.weight_unit !== "bodyweight") ? "external_load" :
        sets.some((set) => set.weight_unit === "bodyweight" ||
          /body\s*weight|bodyweight|\bbw\b/iu.test(String(set.weight ?? "")))
          ? "bodyweight" : "unknown";
      occurrences.set(id, [...(occurrences.get(id) ?? []), {
        canonicalExerciseId: id,
        name: identity.canonicalExerciseName ?? exercise.name,
        date: String(session.observed_at).slice(0, 10),
        sessionId: session.id,
        loadState,
        executionVariant: exercise.executionVariant ?? null,
        order: index,
      }]);
    });
  }
  const result = [];
  for (const [id, entries] of occurrences) {
    for (let index = 1; index < entries.length; index += 1) {
      const current = entries[index];
      if (evidenceWindow?.startDate && current.date < evidenceWindow.startDate) continue;
      if (evidenceWindow?.endDate && current.date > evidenceWindow.endDate) continue;
      const prior = entries.slice(0, index);
      if (current.loadState === "external_load" &&
          prior.some((item) => item.loadState === "bodyweight") &&
          !prior.some((item) => item.loadState === "external_load")) {
        const language = exerciseLanguage(current.name, id);
        result.push(createCandidate({
          domain: "training",
          type: "first_weighted_work",
          subjectId: id,
          subjectLabel: current.name,
          topicKey: `training|${id}|first_weighted_work`,
          materialStateKey: current.sessionId,
          observedAt: current.date,
          confidence: "high",
          evidenceIds: unique([current.sessionId, ...prior.map((item) => item.sessionId)]),
          exposureCount: prior.length + 1,
          sourceKind: "canonical_training_session_history",
          longitudinalSignificance: 1,
          milestoneValue: 1,
          decisionImpact: 0.35,
          actionability: 0.15,
          narrativeText: `${language.label} ${language.have} moved from bodyweight-only work to added load for the first time in the recorded phase history—that is a real personal milestone.`,
          evidenceBasis: {
            metric: "first_weighted_work",
            currentSessionId: current.sessionId,
            priorBodyweightSessionIds: unique(prior.filter((item) =>
              item.loadState === "bodyweight").map((item) => item.sessionId)),
          },
        }));
      }
      const variant = current.executionVariant?.key ?? current.executionVariant?.label ?? null;
      if (variant && !prior.some((item) =>
        (item.executionVariant?.key ?? item.executionVariant?.label) === variant)) {
        const language = exerciseLanguage(current.name, id);
        result.push(createCandidate({
          domain: "training",
          type: "execution_variant_milestone",
          subjectId: id,
          subjectLabel: current.name,
          topicKey: `training|${id}|variant|${variant}`,
          materialStateKey: current.sessionId,
          observedAt: current.date,
          confidence: "high",
          evidenceIds: unique([current.sessionId, ...prior.map((item) => item.sessionId)]),
          exposureCount: prior.length + 1,
          sourceKind: "canonical_training_session_history",
          longitudinalSignificance: 0.8,
          milestoneValue: 0.8,
          decisionImpact: 0.25,
          actionability: 0.15,
          narrativeText: `${language.label} used the ${current.executionVariant.label ?? variant} variant for the first time in the recorded phase history.`,
          evidenceBasis: { metric: "first_execution_variant", variant,
            currentSessionId: current.sessionId },
        }));
      }
    }
  }
  return result;
}

function mineRelatedMovementComparisonsV3(observations) {
  const rows = observations.filter((item) => item?.subject?.type === "exercise")
    .map((item) => {
      const detail = item.explanationData ?? item.explanation_data ?? {};
      return {
        item,
        category: detail.primaryNavigationCategory ??
          detail.primary_navigation_category ?? item.subject.category ?? null,
        relationshipKey: relationshipKey(item, detail.last_session ?? null),
        percent: finite((detail.volume_trend ?? detail.volumeTrend)?.percent_change),
        confidence: normalizeConfidence(item.confidence?.level ?? item.confidence),
      };
    })
    .filter((item) => item.percent != null && item.confidence !== "low");
  const candidates = [];
  for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
      const left = rows[leftIndex];
      const right = rows[rightIndex];
      const related = left.relationshipKey && left.relationshipKey === right.relationshipKey ||
        left.category && left.category === right.category;
      if (!related || Math.abs(left.percent - right.percent) < 10) continue;
      const leader = left.percent > right.percent ? left : right;
      const lagger = leader === left ? right : left;
      const evidenceIds = unique([
        ...(leader.item.supportingEvidenceIds ?? []),
        ...(lagger.item.supportingEvidenceIds ?? []),
      ]);
      const laggerLanguage = exerciseLanguage(lagger.item.subject.label,
        lagger.item.subject.id);
      const leaderLanguage = exerciseLanguage(leader.item.subject.label,
        leader.item.subject.id);
      candidates.push(createCandidate({
        domain: "training",
        type: "related_movement_contrast",
        subjectId: `${leader.item.subject.id}|${lagger.item.subject.id}`,
        subjectLabel: `${leader.item.subject.label} and ${lagger.item.subject.label}`,
        topicKey: `training|relative|${[leader.item.subject.id,
          lagger.item.subject.id].sort().join("|")}`,
        materialStateKey: `${round(leader.percent)}|${round(lagger.percent)}|${evidenceIds.join("|")}`,
        relationshipKey: left.relationshipKey && left.relationshipKey === right.relationshipKey
          ? left.relationshipKey : `category:${left.category}`,
        category: left.category,
        observedAt: maxDate(leader.item.evidenceWindow?.endDate,
          lagger.item.evidenceWindow?.endDate),
        confidence: leader.confidence === "high" && lagger.confidence === "high"
          ? "high" : "moderate",
        evidenceIds,
        exposureCount: Math.min(
          leader.item.supportingEvidenceIds?.length ?? 0,
          lagger.item.supportingEvidenceIds?.length ?? 0),
        sourceKind: "canonical_related_training_comparison",
        longitudinalSignificance: 0.7,
        milestoneValue: 0.25,
        decisionImpact: lagger.percent <= 0 ? 0.55 : 0.3,
        actionability: lagger.percent <= 0 ? 0.5 : 0.2,
        narrativeText: `${laggerLanguage.label} ${laggerLanguage.have} moved more slowly than ${leaderLanguage.label} across their recent comparable exposures (${formatSignedPercent(lagger.percent)} versus ${formatSignedPercent(leader.percent)}).`,
        evidenceBasis: {
          metric: "related_movement_relative_progression",
          relationship: left.relationshipKey && left.relationshipKey === right.relationshipKey
            ? left.relationshipKey : `category:${left.category}`,
          leader: { id: leader.item.subject.id, percentChange: leader.percent },
          lagger: { id: lagger.item.subject.id, percentChange: lagger.percent },
        },
      }));
    }
  }
  return candidates;
}

function createCandidate(input) {
  const semantic = {
    schemaVersion: "specific_coaching_observation_v3",
    domain: input.domain,
    type: input.type,
    subjectId: input.subjectId,
    subjectLabel: input.subjectLabel,
    topicKey: input.topicKey,
    materialStateKey: input.materialStateKey,
    relationshipKey: input.relationshipKey ?? null,
    category: input.category ?? null,
    observedAt: input.observedAt ?? null,
    confidence: normalizeConfidence(input.confidence),
    evidenceIds: unique(input.evidenceIds ?? []),
    exposureCount: Number(input.exposureCount ?? 0),
    sourceKind: input.sourceKind,
    specificity: 1,
    longitudinalSignificance: clamp(input.longitudinalSignificance),
    milestoneValue: clamp(input.milestoneValue),
    decisionImpact: clamp(input.decisionImpact),
    actionability: clamp(input.actionability),
    narrativeText: input.narrativeText,
    evidenceBasis: structuredClone(input.evidenceBasis ?? {}),
  };
  return {
    ...semantic,
    candidateId: `specific_coaching_observation|${semanticFingerprint(semantic).slice(7)}`,
  };
}

function resolveRecommendationCapability({ candidate, goalContract }) {
  const policy = goalContract.coachingObservationPolicy?.training ?? {};
  const supportedPlateau = candidate.type === "sustained_plateau" &&
    candidate.exposureCount >= Number(policy.minimumPlateauExposuresForSuggestion ?? 4) &&
    candidate.confidence === "high" &&
    policy.allowBoundedPlateauSuggestions === true;
  return {
    capable: supportedPlateau,
    mode: supportedPlateau ? "bounded_reversible_suggestion" : "observation_only",
    text: supportedPlateau
      ? `Consider giving ${candidate.subjectLabel} extra attention over the next few sessions, then reassess before changing the broader plan.`
      : null,
    requiresCanonicalStrategyChange: false,
  };
}

function scoreCandidate({ candidate, signal, alreadyCommunicated,
  materiallyAdvanced }) {
  const goal = goalRelevance(signal);
  const novelty = alreadyCommunicated ? -100 : materiallyAdvanced ? 28 : 22;
  return round(
    (TYPE_SCORE[candidate.type] ?? 5) +
    (CONFIDENCE_SCORE[candidate.confidence] ?? 0) +
    goal * 22 +
    candidate.specificity * 12 +
    candidate.longitudinalSignificance * 18 +
    candidate.milestoneValue * 16 +
    candidate.decisionImpact * 12 +
    candidate.actionability * 6 + novelty
  );
}

function goalRelevance(signal) {
  if (!signal) return 0.25;
  if (signal.semanticClass === "LEADING_INDICATOR") return 1;
  if (signal.semanticClass === "EXECUTION_SUPPORT") return 0.8;
  if (signal.semanticClass === "OUTCOME_EVIDENCE") return 0.9;
  if (signal.semanticClass === "GUARDRAIL") return 0.75;
  return 0.35;
}

function selectConciseCandidates(candidates, { decisionRequiresAction }) {
  const selected = [];
  const topics = new Set();
  const subjects = new Set();
  for (const candidate of candidates) {
    if (topics.has(candidate.topicKey)) continue;
    if (!decisionRequiresAction && subjects.has(candidate.subjectId)) continue;
    if (decisionRequiresAction && selected.length === 0 &&
        candidate.decisionImpact < 0.5 && !candidate.recommendationCapability.capable) {
      continue;
    }
    topics.add(candidate.topicKey);
    subjects.add(candidate.subjectId);
    selected.push(candidate);
    if (selected.length === 2) break;
  }
  return selected;
}

function mergeCommunicationMemory({ priorMemory, selected, communicatedAt }) {
  const byTopic = new Map(priorMemory.map((item) => [item.topicKey, item]));
  for (const candidate of selected) {
    byTopic.set(candidate.topicKey, {
      topicKey: candidate.topicKey,
      materialStateKey: candidate.materialStateKey,
      candidateId: candidate.candidateId,
      subjectId: candidate.subjectId,
      communicatedAt,
      evidenceIds: candidate.evidenceIds,
      evidenceSignature: evidenceSignature(candidate.evidenceIds),
    });
  }
  return [...byTopic.values()].sort((left, right) =>
    left.topicKey.localeCompare(right.topicKey));
}

function evidenceSignature(evidenceIds) {
  const ids = unique(evidenceIds ?? []);
  return ids.length ? ids.join("|") : null;
}

function deduplicateCandidates(candidates) {
  const byTopicState = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.topicKey}|${candidate.materialStateKey}`;
    const existing = byTopicState.get(key);
    if (!existing || (TYPE_SCORE[candidate.type] ?? 0) >
        (TYPE_SCORE[existing.type] ?? 0)) byTopicState.set(key, candidate);
  }
  return [...byTopicState.values()];
}

function relationshipKey(item, latest) {
  return item.relationshipKey ??
    (latest?.relationship_context?.relationship_type
      ? JSON.stringify(latest.relationship_context) : null);
}

function unwrapCanonicalTraining(value) {
  return value?.payload ? {
    ...value.payload,
    id: value.payload.id ?? value.canonicalId,
    quality: value.quality ?? value.payload.quality,
  } : value;
}

function isSuperseded(value) {
  return value?.status === "superseded" || value?.supersededBy ||
    value?.quality?.status === "superseded" || value?.quality?.supersededBy;
}

function normalizeConfidence(value) {
  return ["high", "moderate", "low"].includes(value) ? value : "low";
}

function finite(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Number.isInteger(Number(value)) ? 0 : 1,
  }).format(value);
}

function formatPercent(value) {
  return `${formatNumber(round(value))}%`;
}

function formatSignedPercent(value) {
  return `${value >= 0 ? "+" : "−"}${formatNumber(Math.abs(round(value)))}%`;
}

function maxDate(...values) {
  return values.filter(Boolean).sort().at(-1) ?? null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort();
}

function exerciseLanguage(label, canonicalId) {
  const resolved = resolveUserFacingObjectLanguage({
    objectType: "exercise",
    canonicalId,
    displayName: label,
    specificity: "specific",
    narrativeContext: "v3_specific_coaching_observation",
  });
  return {
    label: sentenceStart(resolved.selectedReference || label),
    have: resolved.agreement.have,
  };
}

function sentenceStart(value) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value ?? 0)));
}

function round(value) {
  return value == null ? null : Math.round(Number(value) * 10) / 10;
}
