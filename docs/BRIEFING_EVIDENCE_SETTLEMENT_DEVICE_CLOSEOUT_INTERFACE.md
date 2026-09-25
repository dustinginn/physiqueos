# Briefing evidence settlement — device closeout interface (for HealthKit Native)

Status: Server contract/protocol defined and tested (`src/domain/services/BriefingEvidenceSettlementPolicy.js`). Native implementation is **not** part of this task — the active HealthKit Native lane owns Native/HealthKit sync files, and this task's authorization explicitly stops at defining the Server-side contract when implementing the Native side would overlap that lane. This document is the precise interface for whoever picks that up next.

## What this is for

The Server settlement policy (`evaluateBriefingReadinessV1`) waits for the briefing's final local evidence day to reach `complete_day` coverage for each configured domain (Activity, Nutrition today) before generating a recurring briefing with full confidence — or generates anyway at a bounded hard deadline, recording which domains were still unsettled. This happens **entirely server-side and does not require the app to be open**: ordinary HealthKit background delivery, once it canonicalizes, is what ordinarily satisfies readiness.

A device closeout is an **optional accelerant**, not a requirement: when iOS grants background execution during the settlement window, or the person opens the app during it, Native *may* re-query the briefing window's final day and push the latest HealthKit observations through the existing evidence-intake path sooner than ordinary background delivery would have. This can only make a briefing arrive sooner or more complete — never later, never required.

## What Native would need to do (not yet implemented)

1. Determine it's inside a relevant settlement window. The Server does not push this to Native today; the simplest correct design is Native checking, on its own existing app-open/background-execution triggers (e.g. the automatic HealthKit sync coordinator already in `HealthKitAutomaticSynchronizationCoordinator`), whether "yesterday" (or the active cadence's final evidence day) is a day a recurring briefing might still be settling for. This does **not** need a new Server round-trip to discover — Native already knows the current local date and can compute the same window `BriefingScheduleAuthority.js` uses (cadence day + 03:00 local + the settlement policy's `maximumWaitMinutes`).
2. Re-run the existing HealthKit sync for that specific final day only (already-existing sync machinery — this is not a new sync mechanism, just an additional trigger to call it for a specific bounded day).
3. Let the existing evidence-intake path canonicalize the result, exactly as any other sync does today — **no new Native→Server endpoint is required for the upload itself.**
4. Optionally, report the attempt's outcome for observability, matching `recordDeviceCloseoutReceiptV1({ requestedAt, respondedAt, outcome })`'s exact shape:
   - `outcome` is one of `"uploaded"` (new evidence was pushed), `"no_new_evidence"` (synced, nothing new), `"not_attempted"` (Native decided not to, e.g. outside the window), `"failed"`.
   - This would need exactly one new, narrowly-scoped Server endpoint (not yet designed/authorized) if this observability signal is wanted; the closeout itself works without it, since it rides the existing evidence-intake path.

## What the Server side already provides (implemented, tested)

- `evaluateBriefingReadinessV1({ domainStates })` — is the final day settled?
- `decideBriefingPublishActionV1({ earliestPublishAt, now, readiness })` — wait / generate / retry, with a hard deadline.
- `buildEvidenceSettlementWatermarkV1({ evidenceWindow, readiness, publishDecision, closeoutReceipt, generatedAt })` — the immutable freeze record.
- `recordDeviceCloseoutReceiptV1({ requestedAt, respondedAt, outcome })` — the receipt shape above, ready to be populated by a future Native call once one exists.

## Explicitly not required by this design

- The person does not need to open the app for a briefing to arrive.
- No exact iOS wake time is assumed or promised anywhere in this contract.
- No new Native-facing upload endpoint is required for the closeout's actual evidence upload (it reuses the existing intake path) — only the optional receipt/observability call would be new, and is not yet designed.

## Integration boundary (updated after live wiring)

The readiness/publish-action policy is now wired into the live generation path: `BriefingCadenceExecutorService` consults `BriefingCadenceSettlementGate` (built in `providerBriefingCadenceComposition`) before invoking a recurring cadence's generator, and Server owns delivery time. Event-driven DEXA/Photo briefings and Monthly's day-1 cadence do not pass through the gate.

Still NOT wired: `buildEvidenceSettlementWatermarkV1` has no production caller. The live path records `settlementReasonCode` on the execution record and emits `briefing_settlement.*` log events (including `unsettledDomains` on deadline fallback), but the frozen watermark (cutoff, record/revision identities, readiness state, closeout receipt, generation timestamp) is not yet persisted on the published artifact. `recordDeviceCloseoutReceiptV1` likewise has no Native->Server endpoint yet. Both are separate, explicitly authorized follow-ups.
