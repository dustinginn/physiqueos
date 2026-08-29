import { createEvidenceReviewPresentation } from "../../domain/services/EvidenceReviewPresentationService.js";
import { createLoggedTodayService } from "../../domain/services/LoggedTodayService.js";
import {
  getLocalDateKey,
  resolveLocalTimeZone,
} from "../../domain/utils/localDate.js";
import { requireAuthenticationPrincipal } from "../auth/principal.js";
import { scopeRepositoryReadService } from "../read-models/RepositoryReadScope.js";

export function createLogReadService({ repositories, now = () => new Date() } = {}) {
  return scopeRepositoryReadService({ repositories, namespace: "log", service: Object.freeze({
    async getLog({ principal, timeZone } = {}) {
      const actor = requireAuthenticationPrincipal(principal);
      const user = await repositories.users.getUserById(actor.userId);
      if (!user) return null;
      const resolvedTimeZone = resolveLocalTimeZone(
        timeZone ?? user.timeZone ?? user.timezone
      );
      const [reviews, loggedToday] = await Promise.all([
        repositories.evidenceReviews.listReviews(actor.userId),
        createLoggedTodayService({ repositories, now }).getSummary({
          userId: actor.userId,
          timeZone: resolvedTimeZone,
        }),
      ]);
      return Object.freeze({
        localDate: getLocalDateKey(now(), resolvedTimeZone),
        loggedToday,
        pendingEvidenceReviews: Object.freeze(projectPendingReviews(reviews)),
      });
    },
  }) });
}

export function projectPendingReviews(reviews = []) {
  const pending = reviews.filter((review) => ["pending", "commit_failed", "partially_committed"].includes(review.status))
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  const fingerprints = new Set();
  return pending.map((review) => {
    const objects = review.interpretedEvidence?.evidence_objects ?? [];
    const presentation = createEvidenceReviewPresentation({ evidencePackage: review.interpretedEvidence, itemDecisions: review.itemDecisions });
    const fingerprint = JSON.stringify(objects.map((item) => [item.evidence_type, String(item.observed_at).slice(0, 10), item.source_file ?? item.provenance?.source_artifact_refs]).sort());
    const likelyDuplicate = fingerprints.has(fingerprint);
    fingerprints.add(fingerprint);
    const date = String(review.interpretedEvidence?.observed_at ?? objects[0]?.observed_at ?? review.createdAt).slice(0, 10);
    const training = objects.find((item) => item.evidence_type === "training");
    return Object.freeze({
      id: review.id,
      date: formatPendingReviewDate(date),
      localDate: date,
      title: training?.metadata?.activity_type ? `${training.metadata.activity_type} ready to review` : `${presentation.items[0]?.title ?? "Check-in"} ready to review`,
      summary: formatSummary(presentation.items),
      likelyDuplicate,
      href: `/evidence/review/${encodeURIComponent(review.id)}`,
      version: String(review.version ?? review.updatedAt ?? "1"),
    });
  });
}

function formatPendingReviewDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return "Date unavailable";
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function formatSummary(items) {
  const counts = new Map();
  items.forEach((item) => counts.set(item.noun, (counts.get(item.noun) ?? 0) + 1));
  return [...counts].map(([noun, count]) => `${count} ${count === 1 ? noun : noun.endsWith("entry") ? `${noun.slice(0, -5)}entries` : `${noun}s`}`).join(", ");
}
