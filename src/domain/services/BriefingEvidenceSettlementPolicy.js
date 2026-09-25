import { createHash } from "node:crypto";
import { stableSerialize } from "../../data/repositories/DailyBriefingHistory.js";
import { deepFreeze } from "../intelligence/v3/V3Runtime.js";

// Server-owned policy for WHETHER a recurring (Midweek/Weekly/Monthly)
// briefing's final local evidence day has settled enough continuous
// HealthKit-backed evidence to generate with confidence, and WHEN to
// generate if it has not fully settled. Deterministic and reusable across
// every recurring cadence; event-driven cadences (DEXA, Photo) are
// triggered by the evidence itself and never enter this lifecycle — their
// trigger semantics genuinely differ and this policy does not force them
// into it.
//
// This composes with BriefingScheduleAuthority.js rather than replacing it:
// BriefingScheduleAuthority.js already owns WHICH local date a cadence is
// due on (the user's own cadence/day choice) and the existing 03:00 local
// generation buffer, already live in production. This module owns the
// READINESS gate and the HARD-DEADLINE fallback layered on top of that
// buffer, for the specific evidence domains that determine whether the
// final day is trustworthy yet.
//
// Full lifecycle this module's three functions implement together:
//   cadence window closes (BriefingScheduleAuthority)
//     -> settlement period (evaluateBriefingReadinessV1, repeatedly)
//     -> explicit/ordinary HealthKit closeout opportunities (recordDeviceCloseoutReceiptV1)
//     -> readiness evaluation (evaluateBriefingReadinessV1)
//     -> generate/freeze when ready, or at the bounded hard deadline
//        (decideBriefingPublishActionV1, buildEvidenceSettlementWatermarkV1)
//
// User/product chooses cadence/frequency/day. Server always chooses the
// clock time within that day — never a person's presence, never a raw
// fixed time alone once evidence settlement is available for a domain.

export const BRIEFING_EVIDENCE_SETTLEMENT_POLICY_VERSION =
  "briefing_evidence_settlement_policy_v1";

// Version of the record persisted on a published briefing artifact
// (`artifact.evidenceSettlement`). Distinct from the policy version above: the
// policy version says which rules decided, this says which SHAPE was frozen.
export const BRIEFING_EVIDENCE_SETTLEMENT_WATERMARK_VERSION =
  "briefing_evidence_settlement_watermark_v1";

// Every reason code the gate/policy can produce, in one place, so the executor,
// the persisted watermark, and the logs never disagree on spelling.
export const SettlementReasonCode = Object.freeze({
  BEFORE_EARLIEST_PUBLISH_TIME: "before_earliest_publish_time",
  READINESS_SATISFIED: "readiness_satisfied",
  HARD_DEADLINE_REACHED: "hard_deadline_reached",
  AWAITING_SETTLEMENT: "awaiting_settlement",
  // The settlement-coverage read itself failed (transient store error). Never
  // authorizes generation before the hard deadline.
  COVERAGE_READ_FAILED: "coverage_read_failed",
  NOT_APPLICABLE: "no_healthkit_backed_domains_settlement_not_applicable",
  GATE_ERROR: "settlement_gate_error",
});

// Coverage vocabulary a domain carries when its state could not be READ at all
// (as opposed to being read and found partial/missing).
export const COVERAGE_UNKNOWN_READ_FAILED = "unknown_coverage_read_failed";

// Conservative initial defaults, chosen from existing evidence/timing in
// this codebase rather than invented:
// - minimumSettlementDelayMinutes (180 = 3 hours past local midnight)
//   matches BriefingScheduleAuthority's own existing 03:00 generation
//   buffer, chosen there specifically to let the whole preceding local day
//   finish and let late manual uploads and HealthKit delivery canonicalize
//   — this policy reuses that same floor as its own minimum settlement
//   delay rather than inventing a different number.
// - retryIntervalMinutes (30) is frequent enough that a briefing generates
//   soon after the final domain settles, without retries dominating.
// - maximumWaitMinutes (480 = 8 hours past the earliest publish time) is
//   generous enough to absorb the HealthKit background-delivery lag this
//   codebase has repeatedly and specifically documented (automatic
//   Nutrition sync failures, Activity daily-snapshot 409 revision loops
//   requiring a force-quit or midnight rollover to clear), without
//   indefinitely delaying a briefing someone is expecting.
export const DEFAULT_SETTLEMENT_POLICY = Object.freeze({
  schemaVersion: BRIEFING_EVIDENCE_SETTLEMENT_POLICY_VERSION,
  // Continuous HealthKit-backed domains relevant to the briefing today.
  // Training/workout evidence is deliberately excluded: its legitimate
  // absence on a given day must never cause indefinite waiting (an
  // explicit, separate requirement from the continuous domains below,
  // which are expected to exist every day once HealthKit-graduated).
  // Extend this list (e.g. add "sleep") without touching the functions
  // below.
  readinessDomains: Object.freeze(["activity", "nutrition"]),
  minimumSettlementDelayMinutes: 180,
  retryIntervalMinutes: 30,
  maximumWaitMinutes: 480,
});

// `domainStates`: { [domain]: { present, coverage, canonicalRecordId, revision } }
// for the briefing's final local evidence day, one entry per domain the
// policy tracks. `coverage` must be the domain's own canonical
// settlement/coverage state (e.g. "complete_day" / "partial_day" / "missing"
// — the same vocabulary HealthKitGraduation.js already uses for exactly
// this purpose), never a judgment about whether the observed values look
// normal or close to a protocol target. A domain with no state at all is
// treated as unsettled ("missing"), matching a fail-closed default.
export function evaluateBriefingReadinessV1({
  policy = DEFAULT_SETTLEMENT_POLICY,
  domainStates = {},
} = {}) {
  const domains = Object.fromEntries(policy.readinessDomains.map((domain) => {
    const state = domainStates[domain] ?? null;
    const coverage = state?.coverage ?? "missing";
    return [domain, Object.freeze({
      present: Boolean(state?.present),
      coverage,
      settled: coverage === "complete_day",
      canonicalRecordId: state?.canonicalRecordId ?? null,
      revision: state?.revision ?? null,
    })];
  }));
  const unsettledDomains = policy.readinessDomains
    .filter((domain) => !domains[domain].settled);
  return Object.freeze({
    schemaVersion: policy.schemaVersion,
    domains: Object.freeze(domains),
    ready: unsettledDomains.length === 0,
    unsettledDomains: Object.freeze(unsettledDomains),
  });
}

// Decides the next action at a given evaluation instant: wait for the
// earliest publish time, generate (readiness satisfied or hard deadline
// reached), or retry later. `earliestPublishAt` is expected to be
// `BriefingScheduleAuthority.resolveBriefingDueInstant(...)`'s own result —
// this function does not recompute it, keeping cadence/day/timezone
// authority in exactly one place.
export function decideBriefingPublishActionV1({
  policy = DEFAULT_SETTLEMENT_POLICY,
  earliestPublishAt,
  now,
  readiness,
} = {}) {
  const earliest = new Date(earliestPublishAt);
  const current = new Date(now);
  if (!(current instanceof Date) || Number.isNaN(current.valueOf())) {
    throw new Error("decideBriefingPublishActionV1 requires a valid `now`.");
  }
  if (!(earliest instanceof Date) || Number.isNaN(earliest.valueOf())) {
    throw new Error("decideBriefingPublishActionV1 requires a valid `earliestPublishAt`.");
  }
  if (current < earliest) {
    return Object.freeze({ action: "wait", reasonCode: "before_earliest_publish_time",
      unsettledDomains: Object.freeze([]), nextCheckAt: earliest.toISOString() });
  }
  if (readiness.ready) {
    return Object.freeze({ action: "generate", reasonCode: "readiness_satisfied",
      unsettledDomains: Object.freeze([]) });
  }
  const deadline = new Date(earliest.valueOf() + policy.maximumWaitMinutes * 60_000);
  if (current >= deadline) {
    return Object.freeze({ action: "generate", reasonCode: "hard_deadline_reached",
      unsettledDomains: readiness.unsettledDomains });
  }
  const nextCheckAt = new Date(Math.min(
    current.valueOf() + policy.retryIntervalMinutes * 60_000,
    deadline.valueOf(),
  ));
  return Object.freeze({ action: "retry", reasonCode: "awaiting_settlement",
    unsettledDomains: readiness.unsettledDomains, nextCheckAt: nextCheckAt.toISOString() });
}

// The instant after which unresolved readiness (or an unreadable coverage
// state) no longer delays generation. Same arithmetic decideBriefingPublishActionV1
// applies, exposed so the watermark records the exact deadline it was judged by.
export function resolveBriefingHardDeadline({
  policy = DEFAULT_SETTLEMENT_POLICY,
  earliestPublishAt,
} = {}) {
  return new Date(new Date(earliestPublishAt).valueOf() + policy.maximumWaitMinutes * 60_000);
}

// The freeze/watermark record: recorded once, at generation time, and
// never mutated afterward. A later evidence revision updates current
// Evidence but must never silently rewrite this record, the frozen
// artifact, its bound assessment, or its narrative/confidence — that
// immutability is enforced by the existing artifact/assessment binding
// machinery elsewhere (e.g. `validateMidweekAssessmentBinding`); this
// function only shapes what gets frozen alongside them.
export function buildEvidenceSettlementWatermarkV1({
  evidenceWindow,
  readiness,
  publishDecision,
  closeoutReceipt = null,
  generatedAt,
  cadence = null,
  timeZone = null,
  timeZoneAuthority = null,
  earliestPublishAt = null,
  hardDeadlineAt = null,
  settlementApplicable = true,
  coverageReadFailed = false,
} = {}) {
  if (!evidenceWindow?.startDate || !evidenceWindow?.endDate) {
    throw new Error("buildEvidenceSettlementWatermarkV1 requires evidenceWindow.startDate/endDate.");
  }
  if (!readiness) throw new Error("buildEvidenceSettlementWatermarkV1 requires a readiness evaluation.");
  if (!publishDecision) throw new Error("buildEvidenceSettlementWatermarkV1 requires a publish decision.");
  if (!generatedAt) throw new Error("buildEvidenceSettlementWatermarkV1 requires generatedAt.");
  const body = {
    schemaVersion: BRIEFING_EVIDENCE_SETTLEMENT_POLICY_VERSION,
    watermarkVersion: BRIEFING_EVIDENCE_SETTLEMENT_WATERMARK_VERSION,
    cadence,
    // Deeply frozen, not just at the top level: `evidenceWindow` is
    // Server-supplied and could in principle carry a nested object/array
    // field in the future — this record's "immutable freeze" claim must
    // actually hold at every depth, not only for the fields it happens to
    // receive today.
    evidenceWindow: deepFreeze({ ...evidenceWindow }),
    // The instant the evidence window closed for this artifact (the window's
    // own cutoff when it has one; otherwise null — never invented).
    evidenceCutoff: evidenceWindow.cutoff ?? null,
    // Canonical timezone authority the window/deadline were resolved in.
    timeZone: timeZone ?? evidenceWindow.timeZone ?? null,
    timeZoneAuthority,
    // false = no HealthKit-backed readiness domain applied to this window, so
    // there was nothing to settle: an honest "not applicable", never "ready".
    settlementApplicable: settlementApplicable === true,
    // Per-domain readiness state, INCLUDING canonicalRecordId + revision for
    // every domain whose canonical day existed at generation time.
    domains: readiness.domains,
    readyAtGeneration: settlementApplicable === true ? readiness.ready : null,
    unsettledDomainsAtGeneration: Object.freeze([...(publishDecision.unsettledDomains ?? [])]),
    publishReasonCode: publishDecision.reasonCode,
    // True when publication happened because the hard deadline was reached,
    // not because readiness was satisfied.
    deadlineFallback: publishDecision.reasonCode === SettlementReasonCode.HARD_DEADLINE_REACHED,
    // True when the settlement-coverage read itself was failing at generation
    // time: the per-domain state is then UNKNOWN (never "settled").
    coverageReadFailed: coverageReadFailed === true,
    earliestPublishAt,
    hardDeadlineAt,
    // null unless a real device closeout receipt exists; there is no Server
    // endpoint that records one yet, so today this is honestly always null.
    closeoutReceipt: closeoutReceipt ? Object.freeze({ ...closeoutReceipt }) : null,
    // The artifact model does not distinguish generation from publication
    // (lifecycle.completedAt === generatedAt), so there is no separate
    // publish timestamp to record; this is the freeze instant.
    generatedAt,
  };
  return deepFreeze({ ...body, integrity: settlementIntegrity(body) });
}

// Integrity envelope over the watermark body: a later reader (or an audit) can
// prove the persisted record is exactly what was frozen at generation time.
export function settlementIntegrity(body) {
  return {
    algorithm: "sha256:stable-json",
    // JSON round-trip first: the digest must survive persistence, which
    // drops `undefined` members.
    digest: createHash("sha256")
      .update(stableSerialize(JSON.parse(JSON.stringify(body)))).digest("hex"),
  };
}

export function verifyEvidenceSettlementWatermarkIntegrity(watermark) {
  if (!watermark || typeof watermark !== "object" || !watermark.integrity?.digest) return false;
  const { integrity, ...body } = watermark;
  return settlementIntegrity(body).digest === integrity.digest;
}

// --- Device closeout contract (D2) ---
//
// Server-side half of the targeted briefing-closeout protocol. When iOS
// grants background execution during the settlement period, or the app
// opens during it, Native may re-query the briefing window's final day and
// upload the latest HealthKit observations through the existing evidence-
// intake path (unchanged by this policy), then call this to record that a
// closeout attempt happened. This never gates or requires app-open: the
// settlement loop (`evaluateBriefingReadinessV1` re-run by the ordinary
// generation retry/backoff, per `decideBriefingPublishActionV1`) reaches
// readiness on its own once ordinary background HealthKit delivery
// canonicalizes — a closeout receipt only records that a device-side
// attempt ALSO happened and lets the freeze/watermark note it, for
// observability. iOS exact-time execution is never assumed here: this
// function only records whatever happened, whenever it happened.
export function recordDeviceCloseoutReceiptV1({
  requestedAt,
  respondedAt = null,
  outcome, // "uploaded" | "no_new_evidence" | "not_attempted" | "failed"
} = {}) {
  if (!requestedAt) throw new Error("recordDeviceCloseoutReceiptV1 requires requestedAt.");
  const allowed = ["uploaded", "no_new_evidence", "not_attempted", "failed"];
  if (!allowed.includes(outcome)) {
    throw new Error(`recordDeviceCloseoutReceiptV1 requires outcome to be one of: ${allowed.join(", ")}.`);
  }
  return Object.freeze({ requestedAt, respondedAt, outcome });
}

// --- Observability (D6) ---
//
// One canonical event vocabulary, cadence-agnostic, so future delivery-
// timing tuning can query/aggregate these deterministically regardless of
// which cadence or domain triggered them. Emission (actually logging these
// at the right call sites) is the next integration step once this policy is
// wired into the live generation trigger — see the accompanying report's
// integration-boundary note.
export const BriefingSettlementEvent = Object.freeze({
  WINDOW_CLOSED: "briefing_settlement.window_closed",
  CLOSEOUT_REQUESTED: "briefing_settlement.closeout_requested",
  CLOSEOUT_ELIGIBLE: "briefing_settlement.closeout_eligible",
  LATEST_RELEVANT_REVISION_RECEIVED: "briefing_settlement.latest_relevant_revision_received",
  READINESS_SATISFIED: "briefing_settlement.readiness_satisfied",
  BRIEFING_GENERATED: "briefing_settlement.briefing_generated",
  BRIEFING_PUBLISHED: "briefing_settlement.briefing_published",
  DEADLINE_FALLBACK_USED: "briefing_settlement.deadline_fallback_used",
});
