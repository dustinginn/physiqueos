import {
  stableGoalProtocolTransitionId,
  stablePreviewProtocolId,
  stableProtocolReviewId,
} from "../models/goalProtocolTransitionDraft";
import { recommendProtocolTransition } from "./GoalProtocolTransitionRecommendationService";
import { reconcileProtocolTransition } from "./ProtocolTransitionReconciliationService";

export const ProtocolTransitionErrorCode = Object.freeze({
  CATEGORY_UNKNOWN: "PROTOCOL_TRANSITION_CATEGORY_UNKNOWN",
  ENTRY_NOT_FOUND: "PROTOCOL_TRANSITION_ENTRY_NOT_FOUND",
  DECISION_INVALID: "PROTOCOL_TRANSITION_DECISION_INVALID",
  SOURCE_PROTOCOL_REQUIRED: "PROTOCOL_TRANSITION_SOURCE_PROTOCOL_REQUIRED",
  VIRTUAL_PLAN_REQUIRED: "PROTOCOL_TRANSITION_VIRTUAL_PLAN_REQUIRED",
});

export const ProtocolTransitionCategoryModel = Object.freeze({
  energy: Object.freeze({ entryTypes: ["source_protocol", "virtual_plan"], virtualPlanId: "virtual_energy" }),
  nutrition: Object.freeze({ entryType: "source_protocol" }),
  training: Object.freeze({ entryType: "source_protocol" }),
  activity: Object.freeze({ entryType: "source_protocol" }),
  recovery: Object.freeze({ entryTypes: ["source_protocol", "virtual_plan"], virtualPlanId: "virtual_recovery" }),
  weight: Object.freeze({ entryTypes: ["source_protocol", "virtual_plan"], virtualPlanId: "virtual_weight" }),
  photos: Object.freeze({ entryTypes: ["source_protocol", "virtual_plan"], virtualPlanId: "virtual_photos" }),
  dexa: Object.freeze({ entryTypes: ["source_protocol", "virtual_plan"], virtualPlanId: "virtual_dexa" }),
  briefings: Object.freeze({ entryTypes: ["source_protocol", "virtual_plan"], virtualPlanId: "virtual_briefings" }),
  medication: Object.freeze({ entryType: "source_protocol" }),
  peptide: Object.freeze({ entryType: "source_protocol" }),
  supplement: Object.freeze({ entryType: "source_protocol" }),
});

export class ProtocolTransitionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProtocolTransitionError";
    this.code = code;
  }
}

export function createGoalProtocolTransitionService({ repositories, now = () => new Date() } = {}) {
  return {
    async getOrPreview({ handoff, historicalProtocols = [] }) {
      const existing = await repositories.goalProtocolTransitionDrafts.getLatestActiveForGoalTransition(handoff.transitionDraftId);
      if (existing) return { ...existing, validation: validateGoalProtocolTransition(existing) };
      return buildGoalProtocolTransitionDraft({ handoff, historicalProtocols, createdAt: now() });
    },
    async saveDisposition({ handoff, historicalProtocols = [], reviewId, disposition }) {
      const current = await loadDraft(repositories, handoff, historicalProtocols, now());
      const updated = applyProtocolDisposition(current, reviewId, disposition, now());
      return repositories.goalProtocolTransitionDrafts.save(updated);
    },
    async saveProtocolDraft({ handoff, historicalProtocols = [], reviewId, payload }) {
      const current = await loadDraft(repositories, handoff, historicalProtocols, now());
      const updated = applyProtocolDraftPayload(current, reviewId, payload, now());
      return repositories.goalProtocolTransitionDrafts.save(updated);
    },
    async markReady({ handoff, historicalProtocols = [] }) {
      const current = await loadDraft(repositories, handoff, historicalProtocols, now());
      const validation = validateGoalProtocolTransition(current);
      if (!validation.valid) throw new Error(validation.errors.join(" "));
      return repositories.goalProtocolTransitionDrafts.save({
        ...current,
        status: "ready",
        acceptedAt: current.acceptedAt ?? now().toISOString(),
        consumed: false,
        validation,
        readyForActivation: true,
        updatedAt: now().toISOString(),
      });
    },
  };
}

export function buildGoalProtocolTransitionDraft({ handoff, historicalProtocols = [], createdAt = new Date() }) {
  const id = stableGoalProtocolTransitionId(handoff.transitionDraftId);
  const stamp = createdAt.toISOString();
  const historicalById = new Map(historicalProtocols.map((protocol) => [protocol.id, protocol]));
  const inheritedIds = new Set(handoff.inheritedProtocolReferences.map((reference) => reference.protocolId));
  const inherited = handoff.intendedProtocolDispositions.map((intent) => {
    const reference = handoff.inheritedProtocolReferences.find((item) => item.reviewId === intent.reviewId) ?? {};
    const source = historicalById.get(intent.protocolId) ?? null;
    return buildReview({
      id,
      intent,
      reference,
      source,
      handoff,
      stamp,
    });
  });
  const additional = historicalProtocols
    .filter((protocol) => !inheritedIds.has(protocol.id))
    .map((source) => buildReview({
      id,
      intent: { disposition: "keep", proposedChanges: {}, protocolId: source.id },
      reference: { protocolId: source.id, sourceVersionId: source.currentVersionId, protocolType: source.protocolType ?? source.category },
      source,
      handoff,
      stamp,
    }));
  const protocolReviews = [...inherited, ...additional];
  const protocolDrafts = protocolReviews.map((review) => createPreviewProtocolDraft(id, handoff.newGoalDraftId, review, stamp, handoff)).filter(Boolean);
  return finalize({
    id,
    goalTransitionDraftId: handoff.transitionDraftId,
    sourceGoalId: handoff.completedSourceGoalId,
    pendingGoalDraftId: handoff.newGoalDraftId,
    status: "draft",
    createdAt: stamp,
    updatedAt: stamp,
    protocolReviews,
    protocolDrafts,
    generatedRoutine: [],
    generatedCommitments: [],
    validation: { valid: false, errors: [], unresolvedReviewIds: [] },
    currentProtocolId: null,
    completedProtocolIds: [],
    readyForActivation: false,
    handoff: structuredClone(handoff),
  });
}

export function applyProtocolDisposition(draft, reviewId, disposition, changedAt = new Date()) {
  const stamp = changedAt.toISOString();
  const review = draft.protocolReviews.find((item) => item.id === reviewId);
  if (!review) throw protocolTransitionError("ENTRY_NOT_FOUND", "Protocol review was not found.");
  resolveProtocolTransitionEntry(review);
  if (!["keep", "update", "replace", "pause", "leave_behind"].includes(disposition)) {
    throw protocolTransitionError("DECISION_INVALID", "Protocol transition decision is invalid.");
  }
  const linkedDraft = draft.protocolDrafts.find((item) => item.reviewId === reviewId) ?? null;
  const repairingLegacyPeptide = isLegacyIncompletePeptideUpdate(draft, review, linkedDraft);
  if (repairingLegacyPeptide) assertLegacyPeptideDraftIsOrphaned(draft, review, linkedDraft);
  const reviewStatus = disposition === "keep" ? "accepted" : ["pause", "leave_behind"].includes(disposition) ? "reviewed" : disposition === "replace" ? "blocked" : "editing";
  const dispositionReviews = draft.protocolReviews.map((item) => item.id === reviewId ? {
    ...item,
    intendedDisposition: disposition,
    reviewStatus,
    proposedChanges: disposition === "update" || (disposition === "keep" && canKeepVirtualReview(item, disposition))
      ? item.proposedChanges
      : {},
    updatedAt: stamp,
  } : item);
  const withoutCurrent = draft.protocolDrafts.filter((item) => item.reviewId !== reviewId);
  const dispositionReview = dispositionReviews.find((item) => item.id === reviewId);
  let nextDraft = createPreviewProtocolDraft(draft.id, draft.pendingGoalDraftId, dispositionReview, stamp, draft.handoff);
  if (repairingLegacyPeptide && disposition === "update" && nextDraft) {
    const payload = legacyPeptideUpdatePayload(review);
    nextDraft = {
      ...nextDraft,
      payload,
      effectiveSummary: review.currentSummary,
    };
  }
  const nextReviews = dispositionReviews.map((item) => item.id === reviewId ? {
    ...item,
    replacementProtocolDraftId: nextDraft?.id ?? null,
  } : item);
  const completed = Boolean(nextDraft && ["ready", "valid"].includes(nextDraft.status));
  return finalize({
    ...draft,
    protocolReviews: nextReviews,
    protocolDrafts: nextDraft ? [...withoutCurrent, nextDraft] : withoutCurrent,
    completedProtocolIds: completed
      ? [...new Set([...draft.completedProtocolIds, reviewId])]
      : draft.completedProtocolIds.filter((id) => id !== reviewId),
    updatedAt: stamp,
    status: "draft",
    readyForActivation: false,
  });
}

export function isLegacyIncompletePeptideUpdate(draft, review, linkedDraft) {
  if (!draft || !review || !linkedDraft) return false;
  const currentId = stablePreviewProtocolId(draft.id, review.id, review.category, "updated");
  const legacyId = `${draft.id}_preview_peptide_updated`;
  return review.category === "peptide"
    && review.intendedDisposition === "update"
    && review.reviewStatus === "editing"
    && review.replacementProtocolDraftId == null
    && !(draft.completedProtocolIds ?? []).includes(review.id)
    && linkedDraft.reviewId === review.id
    && linkedDraft.id === legacyId
    && linkedDraft.id !== currentId
    && linkedDraft.derivationType === "updated"
    && linkedDraft.status === "draft"
    && isEmptyPayload(linkedDraft.payload);
}

export function applyProtocolDraftPayload(draft, reviewId, payload, changedAt = new Date()) {
  const stamp = changedAt.toISOString();
  const review = draft.protocolReviews.find((item) => item.id === reviewId);
  if (!review) throw protocolTransitionError("ENTRY_NOT_FOUND", "Protocol review was not found.");
  resolveProtocolTransitionEntry(review);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw protocolTransitionError("DECISION_INVALID", "Protocol transition plan is invalid.");
  }
  const virtualPlan = isSupportedVirtualReview(review) && ["keep", "update"].includes(review.intendedDisposition);
  if (!["update", "replace"].includes(review.intendedDisposition) && !virtualPlan) {
    throw new Error("This protocol does not need an edited draft.");
  }
  const current = draft.protocolDrafts.find((item) => item.reviewId === reviewId) ?? createPreviewProtocolDraft(draft.id, draft.pendingGoalDraftId, review, stamp, draft.handoff);
  const validation = virtualPlan
    ? validateVirtualProtocolPayload(review.category, payload)
    : { valid: Boolean(payload && Object.keys(payload).length > 0), reasons: [] };
  const valid = validation.valid;
  const nextDraft = {
    ...current,
    category: review.category,
    entryType: resolveProtocolTransitionEntry(review).entryType,
    virtualPlanId: resolveProtocolTransitionEntry(review).virtualPlanId ?? null,
    payload: structuredClone(payload),
    effectiveSummary: summarizePayload(review.category, payload),
    status: valid ? "ready" : "draft",
    validation,
    updatedAt: stamp,
  };
  return finalize({
    ...draft,
    protocolReviews: draft.protocolReviews.map((item) => item.id === reviewId ? {
      ...item,
      reviewStatus: valid ? "reviewed" : "editing",
      replacementProtocolDraftId: nextDraft.id,
      proposedChanges: structuredClone(payload),
      updatedAt: stamp,
    } : item),
    protocolDrafts: [...draft.protocolDrafts.filter((item) => item.reviewId !== reviewId), nextDraft],
    completedProtocolIds: valid ? [...new Set([...draft.completedProtocolIds, reviewId])] : draft.completedProtocolIds.filter((id) => id !== reviewId),
    updatedAt: stamp,
  });
}

export function validateGoalProtocolTransition(draft) {
  const reconciliation = reconcileProtocolTransition(draft);
  return {
    valid: reconciliation.ready,
    errors: reconciliation.unresolvedGroups.map((group) => `${group.title} still needs review.`),
    unresolvedReviewIds: reconciliation.unresolvedReviewIds,
    preparedCount: reconciliation.preparedCount,
    unresolvedCount: reconciliation.unresolvedCount,
    unresolvedGroups: reconciliation.unresolvedGroups,
  };
}

export function buildAtomicGoalTransitionActivationContract() {
  return Object.freeze({
    boundary: "GoalTransitionActivationService.applyAtomically",
    implemented: false,
    operations: [
      "validateGoalCreationDraft",
      "validateProtocolTransitionDraft",
      "completeSourceGoal",
      "freezeHistoricalGoalProtocolAssociations",
      "createNewGoal",
      "createNewProtocolsWithProvenance",
      "linkNewProtocolsToNewGoal",
      "generateCommitments",
      "applyBriefingCadence",
      "activateNewGoalAndProtocols",
      "persistAtomicallyOrRollback",
    ],
  });
}

async function loadDraft(repositories, handoff, historicalProtocols, now) {
  return await repositories.goalProtocolTransitionDrafts.getLatestActiveForGoalTransition(handoff.transitionDraftId)
    ?? buildGoalProtocolTransitionDraft({ handoff, historicalProtocols, createdAt: now });
}

function buildReview({ id, intent, reference, source, handoff, stamp }) {
  const category = categoryFor(reference.protocolType ?? source?.protocolType ?? source?.category, intent.protocolId);
  const displayName = displayCategory(category);
  const recommendation = recommendProtocolTransition({
    goal: handoff.primaryGoal,
    review: { category, displayName },
    supportingObjectives: handoff.supportingObjectives,
    briefingCadence: handoff.briefingCadence,
  });
  const available = Boolean(source);
  const requestedDisposition = translateDisposition(intent.disposition ?? recommendation.disposition);
  const intendedDisposition = available || canKeepVirtualReview({ category, sourceProtocolId: source?.id ?? intent.protocolId }, requestedDisposition)
    ? requestedDisposition
    : "replace";
  return {
    id: stableProtocolReviewId(id, intent.protocolId),
    sourceProtocolId: source?.id ?? intent.protocolId,
    sourceVersionId: source?.currentVersionId ?? reference.sourceVersionId ?? null,
    protocolType: reference.protocolType ?? source?.protocolType ?? category,
    category,
    displayName,
    currentSummary: summarizeSource(category, source),
    currentGoalId: handoff.completedSourceGoalId,
    intendedDisposition,
    recommendation: recommendation.disposition,
    recommendationReason: recommendation.reason,
    reviewStatus: available || canKeepVirtualReview({ category, sourceProtocolId: source?.id ?? intent.protocolId }, intendedDisposition)
      ? (intendedDisposition === "keep" ? "accepted" : "pending")
      : "blocked",
    replacementProtocolDraftId: null,
    proposedChanges: structuredClone(intent.proposedChanges ?? {}),
    sourceSnapshot: source ? structuredClone(source) : null,
    available,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function createPreviewProtocolDraft(transitionId, pendingGoalDraftId, review, stamp, handoff = {}) {
  const entry = resolveProtocolTransitionEntry(review);
  if (["pause", "leave_behind"].includes(review.intendedDisposition)) return null;
  const supportedVirtualEdit = isSupportedVirtualReview(review) && ["keep", "update"].includes(review.intendedDisposition);
  if (!review.available && review.intendedDisposition !== "replace" && !supportedVirtualEdit) return null;
  const derivationType = review.intendedDisposition === "keep" ? "cloned" : review.intendedDisposition === "replace" ? "replaced" : "updated";
  const virtualPlan = supportedVirtualEdit ? buildVirtualKeepPlan(review, handoff) : null;
  const payload = virtualPlan?.payload ?? defaultPayload(review);
  const status = review.intendedDisposition === "keep" && (!virtualPlan || virtualPlan.valid) ? "ready" : "draft";
  return {
    id: stablePreviewProtocolId(transitionId, review.id, review.category, derivationType),
    reviewId: review.id,
    pendingGoalDraftId,
    sourceProtocolId: review.sourceProtocolId,
    sourceVersionId: review.sourceVersionId,
    sourceGoalId: review.currentGoalId ?? handoff.completedSourceGoalId ?? null,
    derivationType,
    protocolType: review.protocolType,
    category: review.category,
    entryType: entry.entryType,
    virtualPlanId: entry.virtualPlanId ?? null,
    status,
    payload,
    validation: virtualPlan ? {
      valid: virtualPlan.valid,
      reasons: virtualPlan.reasons,
    } : { valid: true, reasons: [] },
    virtualProvenance: virtualPlan ? {
      sourceProtocolId: review.sourceProtocolId,
      sourceGoalId: review.currentGoalId ?? handoff.completedSourceGoalId ?? null,
      sourceReviewId: review.id,
      virtualCategory: review.category,
      pendingGoalDraftId,
    } : null,
    effectiveSummary: review.intendedDisposition === "keep" ? review.currentSummary : summarizePayload(review.category, payload),
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function assertLegacyPeptideDraftIsOrphaned(draft, review, linkedDraft) {
  const referencedByAnotherReview = draft.protocolReviews.some((item) =>
    item.id !== review.id && item.replacementProtocolDraftId === linkedDraft.id
  );
  const duplicateDraftIdentity = draft.protocolDrafts.some((item) =>
    item !== linkedDraft && item.id === linkedDraft.id
  );
  if (referencedByAnotherReview || duplicateDraftIdentity) {
    throw new Error("The legacy peptide preview is ambiguously referenced and cannot be repaired safely.");
  }
}

function legacyPeptideUpdatePayload(review) {
  const source = review.sourceSnapshot ?? {};
  return {
    scheduleChoice: "keep_current",
    preservedSourcePlan: {
      dose: structuredClone(source.dose ?? null),
      doseHistory: structuredClone(source.doseHistory ?? []),
      frequency: structuredClone(source.frequency ?? null),
      schedule: structuredClone(source.schedule ?? null),
      notes: source.notes ?? null,
    },
  };
}

function isEmptyPayload(payload) {
  return Boolean(payload)
    && typeof payload === "object"
    && !Array.isArray(payload)
    && Object.keys(payload).length === 0;
}

function canKeepVirtualReview(review, disposition) {
  return disposition === "keep"
    && isSupportedVirtualReview(review);
}

function isSupportedVirtualReview(review) {
  const entry = ProtocolTransitionCategoryModel[review.category];
  return (entry?.entryType === "virtual_plan" || entry?.entryTypes?.includes("virtual_plan"))
    && review.sourceProtocolId === entry.virtualPlanId;
}

function buildVirtualKeepPlan(review, handoff) {
  const builders = {
    recovery: buildVirtualRecoveryPlan,
    weight: buildVirtualWeightPlan,
    photos: buildVirtualPhotosPlan,
    dexa: buildVirtualDexaPlan,
  };
  const builder = builders[review.category];
  return builder ? builder(review, handoff) : {
    valid: false,
    reasons: [`${review.displayName} requires a saved plan.`],
    payload: defaultPayload(review),
  };
}

function buildVirtualRecoveryPlan(review, handoff) {
  const goal = handoff.primaryGoal ?? handoff.acceptedNextGoalDefinition;
  const valid = Boolean(goal?.id);
  return {
    valid,
    reasons: valid ? [] : ["Recovery needs a pending goal."],
    payload: {
      strategyChoice: "carry_forward",
      routineStatus: "continued",
      goalDraftId: goal?.id ?? null,
    },
  };
}

function buildVirtualWeightPlan(review, handoff) {
  const scaleSignal = acceptedEvidence(handoff, "scale_weight");
  const goal = handoff.primaryGoal ?? handoff.acceptedNextGoalDefinition;
  const valid = Boolean(scaleSignal && goal?.id);
  return {
    valid,
    reasons: valid ? [] : ["Weight Tracking needs accepted scale-trend evidence and a pending goal."],
    payload: {
      collectionCadence: "daily_morning",
      collectionStatus: "continued",
      interpretationWindow: "weekly_trend",
      isolatedDailyFluctuationRole: "reduced_narrative_importance",
      evidenceType: "scale_weight",
      goalDraftId: goal?.id ?? null,
      goalRelationship: "monitor_gradual_gain_during_lean_mass_development",
      acceptedEvidenceId: scaleSignal?.id ?? null,
    },
  };
}

function buildVirtualPhotosPlan(review, handoff) {
  const photoSignal = acceptedEvidence(handoff, "progress_photos");
  const cadence = acceptedCadence(review, handoff, "photos");
  const goal = handoff.primaryGoal ?? handoff.acceptedNextGoalDefinition;
  const valid = Boolean(photoSignal && cadence && goal?.id);
  return {
    valid,
    reasons: [
      ...(!cadence ? ["Choose how often you want to take progress photos."] : []),
      ...(!photoSignal || !goal?.id ? ["Progress Photos needs an accepted measurement role and pending goal."] : []),
    ],
    payload: {
      cadence: cadence ?? null,
      sessionApproach: review.proposedChanges?.sessionApproach ?? "comparable_progress_session",
      purpose: "visual_body_composition_monitoring",
      evidenceType: "progress_photos",
      goalDraftId: goal?.id ?? null,
      goalRelationship: "monitor_shape_proportion_and_body_fat_guardrail",
      acceptedEvidenceId: photoSignal?.id ?? null,
    },
  };
}

function buildVirtualDexaPlan(review, handoff) {
  const measures = ["dexa_lean_mass", "dexa_fat_mass", "dexa_body_fat"]
    .map((type) => acceptedEvidence(handoff, type))
    .filter(Boolean);
  const cadence = acceptedCadence(review, handoff, "dexa");
  const goal = handoff.primaryGoal ?? handoff.acceptedNextGoalDefinition;
  const valid = Boolean(cadence && measures.length === 3 && goal?.id);
  return {
    valid,
    reasons: [
      ...(!cadence ? ["Choose your DEXA schedule before continuing."] : []),
      ...(measures.length !== 3 || !goal?.id ? ["DEXA needs accepted lean-mass and body-composition measurement roles."] : []),
    ],
    payload: {
      cadence: cadence ?? null,
      measurementRole: "defining_body_composition_outcome",
      measures: ["lean_mass", "fat_mass", "body_fat_percentage"],
      evidenceType: "dexa",
      goalDraftId: goal?.id ?? null,
      goalRelationship: "measure_lean_mass_progress_and_body_fat_guardrail",
      acceptedEvidenceIds: measures.map((item) => item.id),
    },
  };
}

function acceptedEvidence(handoff, evidenceType) {
  const measurement = handoff.progressMeasurement ?? {};
  return [...(measurement.outcomeMeasures ?? []), ...(measurement.predictiveSignals ?? []), ...(measurement.explanatorySignals ?? [])]
    .find((item) => item.evidenceType === evidenceType && item.accepted === true) ?? null;
}

function acceptedCadence(review, handoff, category) {
  const proposed = review.proposedChanges?.cadence;
  if (typeof proposed === "string" && proposed.trim()) return proposed.trim();
  const measurement = handoff.progressMeasurement ?? {};
  const configured = measurement.protocolCadences?.[category] ?? measurement[`${category}Cadence`];
  if (typeof configured === "string" && configured.trim()) return configured.trim();
  return null;
}

function validateVirtualProtocolPayload(category, payload = {}) {
  if (category === "energy") {
    const valid = ["increase_gradually", "estimated_maintenance"].includes(payload.calorieStrategy)
      && ["keep_current", "reduce_slightly"].includes(payload.activityStrategy);
    return { valid, reasons: valid ? [] : ["Choose a supported calorie and activity approach."] };
  }
  if (category === "briefings") {
    const days = new Set((payload.days ?? []).map((day) => String(day).toLowerCase()));
    const valid = payload.cadence === "Twice weekly"
      && days.size === 2 && days.has("wednesday") && days.has("sunday")
      && payload.dailyEvidenceCollection === true;
    return { valid, reasons: valid ? [] : ["Coaching Updates needs Wednesday and Sunday cadence."] };
  }
  if (category === "weight") {
    const valid = payload.collectionCadence === "daily_morning"
      && payload.interpretationWindow === "weekly_trend"
      && payload.evidenceType === "scale_weight"
      && Boolean(payload.goalDraftId);
    return { valid, reasons: valid ? [] : ["Weight Tracking needs a complete trend-based collection plan."] };
  }
  if (category === "photos") {
    const recurrence = payload.recurrence;
    const supportedFrequency = ["weekly", "every_two_weeks", "monthly"].includes(recurrence?.frequency);
    const supportedDay = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].includes(recurrence?.dayOfWeek);
    const supportedDaypart = ["morning", "afternoon", "evening"].includes(recurrence?.daypart);
    const complete = payload.purpose === "visual_body_composition_monitoring"
      && payload.comparisonApproach === "comparable_progress_session"
      && payload.guardrailRelationship === "monitor_body_fat_while_building_lean_mass"
      && Boolean(payload.goalDraftId);
    const valid = supportedFrequency && supportedDay && supportedDaypart && complete;
    return { valid, reasons: valid ? [] : ["Choose how often, which day, and when you want to take progress photos."] };
  }
  if (category === "dexa") {
    const recurrence = payload.recurrence;
    const supportedInterval = ["every_four_weeks", "every_six_weeks", "every_eight_weeks", "every_twelve_weeks"].includes(recurrence?.frequency);
    const measures = new Set(payload.measures ?? []);
    const complete = ["lean_mass", "fat_mass", "body_fat_percentage"].every((item) => measures.has(item))
      && payload.measurementRole === "defining_body_composition_outcome"
      && payload.guardrailRelationship === "monitor_body_fat_while_building_lean_mass"
      && Boolean(payload.goalDraftId);
    const valid = supportedInterval && complete;
    return { valid, reasons: valid ? [] : ["Choose how often you want to use DEXA to check body composition."] };
  }
  return { valid: false, reasons: ["This virtual protocol is not supported."] };
}

function finalize(draft) {
  const generatedRoutine = generateFutureRoutine(draft);
  const generatedCommitments = generatedRoutine.map((item) => ({
    id: `${draft.id}_commitment_${item.id}`,
    sourcePreviewProtocolId: item.sourcePreviewProtocolId,
    sourceProtocolId: item.sourceProtocolId,
    frequency: item.frequency,
    requirement: item.text,
    active: true,
  }));
  const next = { ...draft, generatedRoutine, generatedCommitments };
  return { ...next, validation: validateGoalProtocolTransition(next) };
}

function generateFutureRoutine(draft) {
  const rows = [];
  for (const protocolDraft of draft.protocolDrafts.filter((item) => ["ready", "valid"].includes(item.status))) {
    const review = draft.protocolReviews.find((item) => item.id === protocolDraft.reviewId);
    const routine = routineFor(review.category, protocolDraft.payload);
    for (const item of routine) {
      rows.push({
        id: `${review.category}_${item.frequency}_${rows.length}`,
        ...item,
        sourcePreviewProtocolId: protocolDraft.id,
        sourceProtocolId: review.sourceProtocolId,
      });
    }
  }
  return rows;
}

function routineFor(category, payload) {
  const rows = {
    energy: [{ frequency: "weekly", text: "Review nutrition, activity, training, and recovery together while maintenance is being established.", change: "New" }],
    nutrition: [{ frequency: "daily", text: `Meet your protein target${payload.proteinTarget ? ` of ${payload.proteinTarget} g` : ""}.` }],
    training: [{ frequency: "weekly", text: "Complete the resistance-training schedule and review progression across the week." }],
    activity: [{ frequency: "weekly", text: "Use a flexible weekly activity target that supports recovery and calibration.", change: "Changed" }],
    recovery: [{ frequency: "daily", text: "Follow the current recovery routine." }],
    weight: [{ frequency: "daily", text: "Record morning weight and interpret the weekly trend." }],
    photos: [{ frequency: "periodic", text: "Take progress photos on the selected cadence." }],
    dexa: [{ frequency: "periodic", text: "Complete DEXA scans on the selected cadence." }],
    briefings: [{ frequency: "weekly", text: "Receive coaching updates on Wednesday and Sunday instead of every morning.", change: "Changed" }],
  };
  return rows[category] ?? [];
}

function defaultPayload(review) {
  const defaults = {
    energy: { mode: "Maintenance Calibration", startingIntakeApproach: "Increase gradually from recent cut intake", activityApproach: "Temporarily retain current activity while observing response", evaluationCadence: "Weekly", adjustmentIncrement: "Small steps", trendWindow: "Two to three weeks", signals: ["Weight trend", "Training performance", "Recovery", "Progress photos"], uncertainty: "True maintenance intake is not known yet", exitCriteria: "Stable weight trend, productive training, and sustainable recovery" },
    nutrition: { proteinTarget: 180, calorieApproach: "Coordinate with maintenance calibration", carbohydrateEmphasis: "Support training performance", fatApproach: "Maintain a sustainable minimum", trainingDayFlexibility: true, restDayFlexibility: true },
    activity: { baseline: "Recent activity level", approach: "Flexible during calibration", cardioFrequency: "As needed", cardioDuration: "Flexible", weeklyTarget: "Adjustable", adjustmentSignals: ["Weight trend", "Training performance", "Recovery"] },
    training: { structure: "Keep current split", priorities: [], progression: "Add targeted volume only where priorities were selected" },
    photos: { cadence: "Every four weeks" },
    briefings: { cadence: "Twice weekly", days: ["Wednesday", "Sunday"], dailyEvidenceCollection: true },
  };
  return structuredClone(defaults[review.category] ?? {});
}

export function resolveProtocolTransitionEntry(review) {
  const category = ProtocolTransitionCategoryModel[review?.category];
  if (!category) {
    throw protocolTransitionError("CATEGORY_UNKNOWN", "Protocol transition category is not supported.");
  }
  if (review.sourceProtocolId === category.virtualPlanId
    && (category.entryType === "virtual_plan" || category.entryTypes?.includes("virtual_plan"))) {
    return { entryType: "virtual_plan", virtualPlanId: category.virtualPlanId };
  }
  const sourceProtocolSupported = category.entryType === "source_protocol"
    || category.entryTypes?.includes("source_protocol");
  if (!sourceProtocolSupported && category.virtualPlanId) {
    throw protocolTransitionError("VIRTUAL_PLAN_REQUIRED", "Protocol transition virtual plan identity is invalid.");
  }
  if (!review.sourceProtocolId || review.sourceProtocolId.startsWith("virtual_") || !review.available) {
    throw protocolTransitionError("SOURCE_PROTOCOL_REQUIRED", "Protocol transition source protocol is required.");
  }
  return { entryType: "source_protocol" };
}

function protocolTransitionError(shortCode, message) {
  return new ProtocolTransitionError(ProtocolTransitionErrorCode[shortCode] ?? shortCode, message);
}

function summarizePayload(category, payload) {
  if (category === "energy") return `${payload.mode ?? "Calibration"} with weekly review and gradual adjustments.`;
  if (category === "nutrition") return `${payload.proteinTarget ?? "Current"} g protein with intake coordinated to calibration.`;
  if (category === "activity") return "Flexible weekly activity that supports calibration, training, and recovery.";
  if (category === "training") return payload.priorities?.length ? `Current structure with added emphasis for ${payload.priorities.join(", ")}.` : "Current training structure with focused progression.";
  if (category === "briefings") return `${payload.cadence ?? "Twice weekly"} on ${(payload.days ?? []).join(" and ")}.`;
  if (category === "photos") return `${recurrenceSummary(payload.recurrence)}.`;
  if (category === "dexa") return `DEXA ${recurrenceSummary(payload.recurrence).toLowerCase()} to measure lean mass, fat mass, and body-fat percentage.`;
  return "A reviewed strategy for the new goal.";
}

function recurrenceSummary(recurrence = {}) {
  const frequency = ({
    weekly: "Weekly",
    every_two_weeks: "Every two weeks",
    monthly: "Monthly",
    every_four_weeks: "Every four weeks",
    every_six_weeks: "Every six weeks",
    every_eight_weeks: "Every eight weeks",
    every_twelve_weeks: "Every twelve weeks",
  })[recurrence.frequency] ?? "Selected cadence";
  const day = recurrence.dayOfWeek ? ` on ${capitalize(recurrence.dayOfWeek)}` : "";
  const daypart = recurrence.daypart ? ` ${recurrence.daypart}` : "";
  return `${frequency}${day}${daypart}`;
}

function capitalize(value) {
  return `${value}`.charAt(0).toUpperCase() + `${value}`.slice(1);
}

function summarizeSource(category, source) {
  const summaries = {
    energy: "Cut-focused energy balance · 1,900–2,100 calories · approximately 1,000 active calories per day · reviewed weekly.",
    nutrition: "High-protein nutrition designed for fat loss with a controlled calorie deficit.",
    training: "Current resistance-training split focused on preserving muscle and performance.",
    activity: "Approximately 1,000 active calories per day across training, cardio, walking, and normal movement.",
    recovery: "Recovery routine supporting training quality, sleep, and sustainable workload.",
    weight: "Daily morning weights interpreted through the weekly trend.",
    photos: "Progress photos used to assess shape and definition over time.",
    dexa: "Periodic DEXA scans used to measure body composition.",
    briefings: "Daily coaching updates based on the latest evidence.",
  };
  if (summaries[category]) return summaries[category];
  if (!source) return "No protocol has been configured yet.";
  return source.notes || source.intent?.summary || "Current protocol";
}

function translateDisposition(value) {
  return ({ modify: "update", remove: "leave_behind" })[value] ?? value;
}

function categoryFor(protocolType, protocolId) {
  const value = `${protocolType ?? ""} ${protocolId ?? ""}`.toLowerCase();
  if (value.includes("nutrition")) return "nutrition";
  if (value.includes("training")) return "training";
  if (value.includes("activity") || value.includes("cardio")) return "activity";
  if (value.includes("recovery")) return "recovery";
  if (value.includes("weight")) return "weight";
  if (value.includes("photo")) return "photos";
  if (value.includes("dexa")) return "dexa";
  if (value.includes("brief")) return "briefings";
  if (value.includes("energy")) return "energy";
  return protocolType ?? "other";
}

function displayCategory(category) {
  return ({
    energy: "Energy Balance",
    nutrition: "Nutrition",
    training: "Training",
    activity: "Activity",
    recovery: "Recovery",
    weight: "Weight Tracking",
    photos: "Progress Photos",
    dexa: "DEXA",
    briefings: "Coaching Updates",
    medication: "Medication",
    peptide: "Peptide",
    supplement: "Supplement",
  })[category] ?? String(category).replaceAll("_", " ");
}
