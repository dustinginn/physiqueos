export function createBriefingReconciliationPresentation({
  evidenceDate = null,
  hasPendingConfirmation = false,
  publicationRootId = null,
  workItems = [],
} = {}) {
  const relevant = workItems
    .filter((item) => !publicationRootId || item.publicationRootId === publicationRootId)
    .filter((item) => !evidenceDate || item.affectedDependencies?.some(
      (dependency) => dependency.observedDate === evidenceDate
    ))
    .sort((left, right) =>
      String(right.updatedAt).localeCompare(String(left.updatedAt))
    );
  const item = relevant[0] ?? null;
  if (!item) return Object.freeze({ state: "current", visible: false });
  if (["revision_pending", "revising"].includes(item.status)) {
    return Object.freeze({
      canFinalize: item.status === "revision_pending" && !hasPendingConfirmation,
      cadence: item.cadence,
      message: hasPendingConfirmation
        ? "Confirm the evidence that is still awaiting review before finishing this update."
        : "Your current briefing stays available while recently confirmed evidence is applied.",
      state: "updating",
      title: hasPendingConfirmation
        ? "Briefing update is waiting for confirmation"
        : `${cadenceLabel(item.cadence)} is ready to update`,
      visible: true,
    });
  }
  if (item.status === "failed") {
    const retryable = item.failure?.retryable !== false && (item.attempts ?? 0) < 3;
    return Object.freeze({
      canFinalize: retryable && !hasPendingConfirmation,
      cadence: item.cadence,
      message: retryable
        ? "The current briefing is unchanged. You can safely try the update again."
        : "The current briefing is unchanged. This update needs technical review.",
      state: "update_failed",
      title: `${cadenceLabel(item.cadence)} update needs attention`,
      visible: true,
    });
  }
  if (item.status === "current_after_revision") {
    return Object.freeze({
      canFinalize: false,
      cadence: item.cadence,
      message: "Recently confirmed evidence is included.",
      state: "current",
      title: `${cadenceLabel(item.cadence)} is current`,
      visible: true,
    });
  }
  return Object.freeze({ state: "current", visible: false });
}

function cadenceLabel(cadence) {
  return `${String(cadence ?? "briefing").replace(/^./, (letter) =>
    letter.toUpperCase())} Briefing`;
}
