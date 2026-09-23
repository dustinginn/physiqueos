import { createEvidenceReviewPresentation } from "../../domain/services/EvidenceReviewPresentationService.js";
import { createLoggedTodayService } from "../../domain/services/LoggedTodayService.js";
import {
  getLocalDateKey,
  resolveLocalTimeZone,
} from "../../domain/utils/localDate.js";
import { requireAuthenticationPrincipal } from "../auth/principal.js";
import { scopeRepositoryReadService } from "../read-models/RepositoryReadScope.js";
import {
  isHealthKitWorkoutReconciliationReview,
  projectHealthKitWorkoutReconciliationPresentation,
} from "../../domain/services/HealthKitWorkoutReconciliationService.js";

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
      const localDate = getLocalDateKey(now(), resolvedTimeZone);
      const processingEvidenceReviews = projectProcessingReviews(reviews, resolvedTimeZone);
      return Object.freeze({
        localDate,
        loggedToday: overlayAcceptedProcessing(loggedToday, processingEvidenceReviews, localDate),
        pendingEvidenceReviews: Object.freeze(projectPendingReviews(reviews)),
        processingEvidenceReviews: Object.freeze(processingEvidenceReviews),
      });
    },
  }) });
}

export function projectPendingReviews(reviews = []) {
  // Only reviews that require Founder action belong in this queue. Once a
  // version-protected confirmation is accepted, an actively committing
  // review is server-owned processing rather than an actionable upload.
  // Terminal commit failures remain actionable.
  const pending = reviews.filter((review) => ["pending", "commit_failed", "partially_committed"].includes(review.status))
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  const fingerprints = new Set();
  return pending.map((review) => {
    if (isHealthKitWorkoutReconciliationReview(review)) {
      const presentation = projectHealthKitWorkoutReconciliationPresentation(review);
      return Object.freeze({
        id: review.id,
        kind: presentation.kind,
        date: formatPendingReviewDate(review.localDate),
        localDate: review.localDate,
        title: presentation.title,
        summary: `${review.candidates?.length ?? 0} possible Logger sessions`,
        likelyDuplicate: false,
        href: `/evidence/review/${encodeURIComponent(review.id)}`,
        version: String(review.version ?? "1"),
      });
    }
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

export function projectProcessingReviews(reviews = [], timeZone) {
  return reviews
    // `partially_committed` is a terminal failed continuation and remains
    // actionable; only an active `committing` claim is accepted processing.
    .filter((review) => review.status === "committing")
    .map((review) => {
      const objects = review.interpretedEvidence?.evidence_objects ?? [];
      const date = getLocalDateKey(
        review.interpretedEvidence?.observed_at ?? objects[0]?.observed_at ?? review.createdAt,
        resolveLocalTimeZone(timeZone),
      );
      const domain = processingDomain(objects);
      return Object.freeze({
        id: review.id,
        localDate: date,
        domain,
        label: processingLabel(domain),
        status: "accepted_processing",
      });
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function overlayAcceptedProcessing(loggedToday, processingReviews, localDate) {
  const processingDomains = new Set(processingReviews
    .filter((review) => review.localDate === localDate)
    .map((review) => review.domain));
  return Object.freeze({
    ...loggedToday,
    rows: Object.freeze(loggedToday.rows.map((row) => {
      // A multi-session Training row intentionally has no singular recordId,
      // but it is still populated canonical history. Processing may only
      // replace the genuinely empty placeholder, never real combined data.
      const genuinelyEmpty = row.recordId == null && row.href == null && row.summary === "Nothing logged yet";
      if (!processingDomains.has(row.id) || !genuinelyEmpty) return row;
      return Object.freeze({
        ...row,
        summary: `${processingLabel(row.id)} processing`,
        context: "Confirmation accepted · No action required",
        processing: true,
      });
    })),
  });
}

function processingDomain(objects) {
  const types = new Set(objects.map((item) => item.evidence_type));
  if (types.has("nutrition")) return "nutrition";
  if (types.has("activity_day")) return "activity";
  if (types.has("training")) return "training";
  return "evidence";
}

function processingLabel(domain) {
  return ({ nutrition: "Nutrition", activity: "Activity", training: "Training" })[domain] ?? "Evidence";
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
