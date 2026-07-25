import { presentProtocolTransitionPlan } from "./protocolTransitionReviewPresentation";
import { reconcileProtocolTransition } from "../domain/services/ProtocolTransitionReconciliationService";

export function buildProtocolReviewGroups(draft) {
  return buildProtocolReviewReconciliation(draft).groups;
}

export function buildProtocolReviewReconciliation(draft) {
  const reconciliation = reconcileProtocolTransition(draft);
  const grouped = new Map();
  for (const review of draft.protocolReviews) {
    const groupId = groupIdFor(review);
    const existing = grouped.get(groupId);
    if (existing) {
      existing.reviews.push(review);
      continue;
    }
    grouped.set(groupId, {
      id: groupId,
      title: groupTitle(groupId, review),
      reviews: [review],
    });
  }
  const groups = [...grouped.values()].map((group) => finalizeGroup(group, draft, reconciliation.groups.find((item) => item.id === group.id)));
  return {
    groups,
    cards: groups,
    preparedCount: reconciliation.preparedCount,
    unresolvedCount: reconciliation.unresolvedCount,
    unresolvedGroupIds: reconciliation.unresolvedGroups.map((group) => group.id),
    unresolvedGroupNames: reconciliation.unresolvedGroups.map((group) => group.title),
    requiredUnresolvedGroupIds: reconciliation.unresolvedGroups.map((group) => group.id),
    isReadyForNext: reconciliation.ready,
    validation: {
      valid: reconciliation.ready,
      unresolvedReviewIds: reconciliation.unresolvedReviewIds,
      unresolvedGroups: reconciliation.unresolvedGroups,
    },
    updatedAt: draft.updatedAt,
  };
}

export function protocolIdentity(review) {
  const name = review.sourceSnapshot?.name;
  if (["peptide", "supplement", "medication"].includes(review.category) && name) return name;
  return review.displayName;
}

export function currentProtocolSummary(review) {
  const source = review.sourceSnapshot ?? {};
  if (source.name === "Retatrutide") {
    const active = source.doseHistory?.find((entry) => entry.status === "active");
    const dose = active?.dose ?? source.dose?.value;
    return `${dose ?? 2} mg once weekly on Thursday night, with the planned taper retained.`;
  }
  if (source.name === "Tesamorelin") {
    return "0.5 mg Sunday through Thursday nights, after fasting for at least 3 hours before bed.";
  }
  if (review.category === "supplement") return scheduleLabel(source);
  return review.currentSummary;
}

export function preparedPlanSummary(review, protocolDraft, context = {}) {
  const reviewedVirtualKeep = review.intendedDisposition === "keep"
    && ["photos", "dexa"].includes(review.category)
    && review.sourceProtocolId === `virtual_${review.category}`
    && Boolean(protocolDraft?.payload?.recurrence)
    && ["accepted", "reviewed"].includes(review.reviewStatus);
  const reviewedEdit = ["update", "replace"].includes(review.intendedDisposition)
    && review.reviewStatus === "reviewed";
  if ((!reviewedVirtualKeep && !reviewedEdit) || !protocolDraft || !["ready", "valid"].includes(protocolDraft.status)) return [];
  const sections = presentProtocolTransitionPlan(review.category, protocolDraft.payload, { displayName: review.displayName, ...context }).sections;
  const visible = review.category === "energy" ? sections.filter((section) => ["calories", "activity", "review"].includes(section.id)) : sections;
  return visible.map((section) => section.primaryValue);
}

function finalizeGroup(group, draft, reconciliation) {
  const protocolDrafts = group.reviews.map((review) => draft.protocolDrafts.find((item) => item.reviewId === review.id)).filter(Boolean);
  const isPeptides = group.id === "peptides";
  const isSupplements = group.id === "supplements";
  return {
    ...group,
    protocolDrafts,
    resolved: reconciliation.resolved,
    statusLabel: reconciliation.statusLabel,
    recommendation: isPeptides || isSupplements ? "keep" : group.reviews[0].recommendation,
    recommendationTitle: isPeptides ? "Review the peptide plan together." : isSupplements ? "Keep the current supplement routine unless you want to change an item." : recommendationTitle(group.reviews[0]),
    recommendationReason: isPeptides
      ? "Retatrutide and Tesamorelin remain separate plans, but reviewing them together makes the full routine easier to understand."
      : isSupplements
        ? "The existing supplements can continue, with individual changes available where needed."
        : group.reviews[0].recommendationReason,
    primaryAction: reconciliation.resolved ? reconciliation.actionLabel : isPeptides || isSupplements ? reconciliation.actionLabel : actionLabel(group.reviews[0].recommendation),
    currentItems: group.reviews.map((review) => ({ id: review.id, name: protocolIdentity(review), summary: currentProtocolSummary(review) })),
    preparedItems: group.reviews.flatMap((review) => {
      const protocolDraft = draft.protocolDrafts.find((item) => item.reviewId === review.id);
      return preparedPlanSummary(review, protocolDraft, { openingBaseline: draft.handoff?.openingEvidenceBaseline }).map((summary) => ({ reviewId: review.id, name: protocolIdentity(review), summary }));
    }),
  };
}

function groupIdFor(review) {
  if (review.category === "peptide") return "peptides";
  if (review.category === "supplement") return "supplements";
  return review.category;
}

function groupTitle(groupId, review) {
  if (groupId === "peptides") return "Peptides";
  if (groupId === "supplements") return "Supplements";
  return review.displayName;
}

function actionLabel(recommendation) {
  return ({ keep: "Keep This Plan", update: "Review and Update", replace: "Choose a New Plan", pause: "Pause This Plan", leave_behind: "Leave This Plan Behind" })[recommendation] ?? "Review Plan";
}

function recommendationTitle(review) {
  return ({
    keep: `Keep your current ${review.displayName.toLowerCase()} plan.`,
    update: `Update your ${review.displayName} plan for the new goal.`,
    replace: `Choose a new ${review.displayName} plan.`,
    pause: `Pause your ${review.displayName} plan for now.`,
    leave_behind: `Leave your ${review.displayName} plan with the completed goal.`,
  })[review.recommendation] ?? `Review your ${review.displayName} plan.`;
}

function scheduleLabel(source) {
  const frequency = source.schedule?.frequency ?? source.frequency?.unit;
  if (frequency === "daily" || (source.frequency?.interval === 1 && frequency === "day")) return "Daily";
  if (frequency === "every_other_day" || source.frequency?.interval === 2) return "Every other day";
  return "Current schedule";
}
