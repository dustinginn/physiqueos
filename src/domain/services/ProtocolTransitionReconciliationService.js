export function reconcileProtocolTransition(draft) {
  const reviews = draft.protocolReviews.map((review) => reconcileReview(review, draft.protocolDrafts));
  const groupMap = new Map();
  for (const outcome of reviews) {
    const groupId = ["peptide", "supplement"].includes(outcome.category) ? `${outcome.category}s` : outcome.category;
    const group = groupMap.get(groupId) ?? { id: groupId, title: groupTitle(groupId, outcome.displayName), outcomes: [] };
    group.outcomes.push(outcome);
    groupMap.set(groupId, group);
  }
  const groups = [...groupMap.values()].map((group) => {
    const unresolved = group.outcomes.filter((item) => !item.resolved);
    const resolved = unresolved.length === 0;
    return {
      ...group,
      resolved,
      statusLabel: resolved ? groupStatus(group.outcomes) : "Needs review",
      actionLabel: resolved ? groupReviewAction(group.id, group.outcomes) : groupContinueAction(group.id, group.outcomes),
      unresolvedReviewIds: unresolved.map((item) => item.reviewId),
    };
  });
  const unresolved = reviews.filter((item) => !item.resolved);
  return {
    reviews,
    groups,
    preparedCount: reviews.length - unresolved.length,
    unresolvedCount: unresolved.length,
    unresolvedReviewIds: unresolved.map((item) => item.reviewId),
    unresolvedGroups: groups.filter((group) => !group.resolved).map((group) => ({ id: group.id, title: group.title })),
    ready: unresolved.length === 0,
  };
}

function reconcileReview(review, protocolDrafts) {
  const protocolDraft = protocolDrafts.find((item) => item.reviewId === review.id) ?? null;
  const draftReady = Boolean(protocolDraft && ["ready", "valid"].includes(protocolDraft.status));
  const intentionalStop = ["pause", "leave_behind"].includes(review.intendedDisposition);
  const keepReady = review.intendedDisposition === "keep" && ["accepted", "reviewed"].includes(review.reviewStatus) && draftReady;
  const editedReady = ["update", "replace"].includes(review.intendedDisposition) && review.reviewStatus === "reviewed" && draftReady;
  const stoppedReady = intentionalStop && review.reviewStatus === "reviewed" && !protocolDraft;
  const resolved = keepReady || editedReady || stoppedReady;
  return {
    reviewId: review.id,
    category: review.category,
    displayName: review.displayName,
    disposition: review.intendedDisposition,
    reviewStatus: review.reviewStatus,
    protocolDraft,
    resolved,
    statusLabel: resolved ? outcomeStatus(review.intendedDisposition) : "Needs review",
    actionLabel: resolved ? outcomeAction(review.intendedDisposition) : recommendationAction(review.recommendation),
  };
}

function outcomeStatus(disposition) {
  return ({
    keep: "Ready for new goal",
    update: "Updated plan prepared",
    replace: "New plan prepared",
    pause: "Paused for new goal",
    leave_behind: "Not continuing",
  })[disposition] ?? "Needs review";
}

function outcomeAction(disposition) {
  return ["update", "replace"].includes(disposition) ? "Review or Edit Plan" : "Review Decision";
}

function recommendationAction(recommendation) {
  return ({
    keep: "Keep This Plan",
    update: "Review and Update",
    replace: "Choose a New Plan",
    pause: "Pause This Plan",
    leave_behind: "Leave This Plan Behind",
  })[recommendation] ?? "Review Plan";
}

function groupStatus(outcomes) {
  if (outcomes.some((item) => item.disposition === "replace")) return "New plan prepared";
  if (outcomes.some((item) => item.disposition === "update")) return "Updated plan prepared";
  if (outcomes.every((item) => item.disposition === "keep")) return "Ready for new goal";
  return "Decisions reviewed";
}

function groupReviewAction(groupId, outcomes) {
  if (groupId === "peptides") return "Review Peptide Plan";
  if (groupId === "supplements") return "Review Supplements";
  return outcomes[0].actionLabel;
}

function groupContinueAction(groupId, outcomes) {
  if (groupId === "peptides") return "Continue Peptide Review";
  if (groupId === "supplements") return "Continue Supplement Review";
  return outcomes.find((item) => !item.resolved)?.actionLabel ?? "Review Plan";
}

function groupTitle(groupId, displayName) {
  if (groupId === "peptides") return "Peptides";
  if (groupId === "supplements") return "Supplements";
  return displayName;
}
