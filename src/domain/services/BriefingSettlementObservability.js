import {
  BriefingSettlementEvent,
  SettlementReasonCode,
} from "./BriefingEvidenceSettlementPolicy.js";

// Live emission of the evidence-settlement lifecycle from the real executor
// path. One observer per worker PROCESS (the provider composition creates it
// once and hands it to every per-tick executor), because the dedup memory has
// to outlive a tick: the worker polls every five minutes and a naive emitter
// would repeat window_closed / readiness_satisfied on every poll.
//
// DEDUP (in-memory, per process, bounded to `maxTrackedWindows`; a restart
// simply re-emits the once-per-window events once, which is acceptable and is
// the documented trade-off for not needing a store):
//   window_closed                     once per (cadence, window)
//   closeout_eligible                 once per (cadence, window)
//   latest_relevant_revision_received once per per-domain change of
//                                     (canonicalRecordId, revision, coverage)
//   readiness_checked                 first check, on any change of the check
//                                     outcome, else at most one per
//                                     `checkHeartbeatMinutes` (default 30)
//   awaiting_settlement               every wait/retry check (existing
//                                     behavior; the retry loop's heartbeat)
//   readiness_satisfied /
//   deadline_fallback_used /
//   settlement_not_applicable         once per (cadence, window, reason)
//   coverage_read_failed              every failing check (an outage is never
//                                     collapsed)
//   briefing_generated / _published   once per created artifact; NEVER for an
//                                     idempotent/duplicate/matched result
//
// NOT EMITTED: closeout_requested / a closeout receipt. Only a device can be
// asked to close out, and no Server endpoint or Native request path exists yet;
// emitting it would be a lie. The Server honestly emits closeout_eligible
// ("a device closeout would help: HealthKit-backed domains are still
// unsettled") and the receipt stays null in the watermark.
//
// REDACTION: field names avoid the structured logger's sensitive-key pattern
// (evidence|health|pin|token|content|...), values are ids, enums, timestamps
// and domain/coverage labels only; never a user name/email, never an observed
// value, never an error message.

const DEFAULT_MAX_TRACKED_WINDOWS = 64;
const DEFAULT_CHECK_HEARTBEAT_MINUTES = 30;

export function createBriefingSettlementObserver({
  logger = null,
  maxTrackedWindows = DEFAULT_MAX_TRACKED_WINDOWS,
  checkHeartbeatMinutes = DEFAULT_CHECK_HEARTBEAT_MINUTES,
} = {}) {
  const windows = new Map();

  function memory(entry) {
    const key = `${entry.cadence}|${entry.evidenceWindow?.id ?? entry.expectedArtifactId ?? "unknown"}`;
    let state = windows.get(key);
    if (!state) {
      state = { once: new Set(), domains: new Map(), lastCheck: null, generated: new Set() };
      windows.set(key, state);
      while (windows.size > maxTrackedWindows) windows.delete(windows.keys().next().value);
    } else {
      // Recently used windows stay; the oldest untouched one is evicted first.
      windows.delete(key);
      windows.set(key, state);
    }
    return state;
  }

  const emit = (level, event, fields) => {
    const target = logger?.[level] ?? logger?.info;
    target?.call(logger, event, fields);
  };
  const once = (state, token) => {
    if (state.once.has(token)) return false;
    state.once.add(token);
    return true;
  };

  return Object.freeze({
    // One gate evaluation for a cadence entry that is due (window closed and
    // earliest-publish time reached). Emits the ordered check-side lifecycle.
    observeCheck({ entry, decision, asOf }) {
      if (!logger) return;
      const state = memory(entry);
      const common = commonFields(entry, decision, asOf);

      if (once(state, "window_closed")) {
        emit("info", BriefingSettlementEvent.WINDOW_CLOSED, {
          ...common,
          windowCutoff: entry.evidenceWindow?.cutoff ?? null,
          earliestPublishAt: decision.earliestPublishAt ?? entry.dueAt ?? null,
        });
      }

      if (decision.coverageReadFailed) {
        emit("warn", BriefingSettlementEvent.COVERAGE_READ_FAILED, {
          ...common,
          readErrorStage: decision.readError?.stage ?? null,
          readErrorName: decision.readError?.name ?? null,
          readErrorCode: decision.readError?.code ?? null,
          hardDeadlineAt: decision.hardDeadlineAt ?? null,
        });
      } else if (decision.readiness) {
        for (const [domain, next] of Object.entries(decision.readiness.domains)) {
          const fingerprint = `${next.present}|${next.canonicalRecordId}|${next.revision}|${next.coverage}`;
          const previous = state.domains.get(domain) ?? null;
          if (previous?.fingerprint === fingerprint) continue;
          state.domains.set(domain, { fingerprint, coverage: next.coverage, revision: next.revision });
          if (!next.present && !previous) continue; // nothing has arrived yet: not a "revision received"
          emit("info", BriefingSettlementEvent.LATEST_RELEVANT_REVISION_RECEIVED, {
            ...common, domain,
            previousCoverage: previous?.coverage ?? null, previousRevision: previous?.revision ?? null,
            coverage: next.coverage, revision: next.revision, canonicalRecordId: next.canonicalRecordId,
          });
        }
      }

      if (decision.action !== "generate" && !decision.coverageReadFailed &&
          (decision.unsettledDomains?.length ?? 0) > 0 &&
          once(state, "closeout_eligible")) {
        emit("info", BriefingSettlementEvent.CLOSEOUT_ELIGIBLE, {
          ...common, hardDeadlineAt: decision.hardDeadlineAt ?? null,
          closeoutRequest: "not_available_server_has_no_closeout_request_path",
        });
      }

      const checkKey = `${decision.action}|${decision.reasonCode}|${domainSummary(decision)}`;
      const heartbeatMs = checkHeartbeatMinutes * 60_000;
      const last = state.lastCheck;
      if (!last || last.key !== checkKey || asOf.valueOf() - last.at >= heartbeatMs) {
        state.lastCheck = { key: checkKey, at: asOf.valueOf() };
        emit("info", BriefingSettlementEvent.READINESS_CHECKED, { ...common, hardDeadlineAt: decision.hardDeadlineAt ?? null });
      }

      if (decision.action !== "generate") {
        emit("info", BriefingSettlementEvent.AWAITING_SETTLEMENT, common);
        return;
      }
      const terminal = decision.reasonCode === SettlementReasonCode.HARD_DEADLINE_REACHED
        ? BriefingSettlementEvent.DEADLINE_FALLBACK_USED
        : decision.reasonCode === SettlementReasonCode.NOT_APPLICABLE
          ? BriefingSettlementEvent.SETTLEMENT_NOT_APPLICABLE
          : BriefingSettlementEvent.READINESS_SATISFIED;
      if (once(state, `decision:${terminal}`)) emit("info", terminal, common);
    },

    // The gate itself failed unexpectedly (not a coverage read failure).
    observeGateError({ entry, error }) {
      emit("warn", BriefingSettlementEvent.SETTLEMENT_GATE_ERROR, {
        cadenceKey: entry.cadence, userId: entry.userId, windowId: entry.evidenceWindow?.id ?? null,
        timeZone: entry.timeZone ?? null, reasonCode: SettlementReasonCode.GATE_ERROR,
        errorName: String(error?.name ?? "Error").slice(0, 80),
        errorCode: String(error?.code ?? "UNCLASSIFIED_ERROR").slice(0, 80),
      });
    },

    // A generator run that CREATED an artifact. Never called for an idempotent /
    // matched / duplicate result. In the current artifact model generation and
    // publication are one atomic commit (lifecycle.completedAt === generatedAt),
    // so both events fire together, once.
    observeCreated({ entry, artifactId, decision, watermark, asOf }) {
      if (!logger) return;
      const state = memory(entry);
      if (state.generated.has(artifactId)) return;
      state.generated.add(artifactId);
      const fields = {
        ...commonFields(entry, decision ?? {}, asOf),
        artifactId,
        settlementReasonCode: decision?.reasonCode ?? null,
        deadlineFallback: watermark?.deadlineFallback ?? false,
        watermarkDigest: watermark?.integrity?.digest ?? null,
      };
      emit("info", BriefingSettlementEvent.BRIEFING_GENERATED, fields);
      emit("info", BriefingSettlementEvent.BRIEFING_PUBLISHED, fields);
    },
  });
}

function commonFields(entry, decision, asOf) {
  return {
    cadenceKey: entry.cadence,
    userId: entry.userId,
    windowId: entry.evidenceWindow?.id ?? null,
    windowStart: entry.evidenceWindow?.startDate ?? null,
    windowEnd: entry.evidenceWindow?.endDate ?? null,
    timeZone: entry.timeZone ?? entry.evidenceWindow?.timeZone ?? null,
    action: decision.action ?? null,
    reasonCode: decision.reasonCode ?? null,
    unsettledDomains: [...(decision.unsettledDomains ?? [])],
    readinessDomains: readinessDomains(decision),
    checkedAt: asOf?.toISOString?.() ?? null,
  };
}

function readinessDomains(decision) {
  return Object.fromEntries(Object.entries(decision.readiness?.domains ?? {}).map(([domain, state]) => [
    domain, { coverage: state.coverage, settled: state.settled, revision: state.revision },
  ]));
}

function domainSummary(decision) {
  return Object.entries(decision.readiness?.domains ?? {})
    .map(([domain, state]) => `${domain}:${state.coverage}:${state.revision}`).join(",");
}
