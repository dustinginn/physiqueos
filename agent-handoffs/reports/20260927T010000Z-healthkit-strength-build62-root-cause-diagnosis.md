# Strength Build 62 failure: new decisive server-side evidence, root-cause candidates identified, deterministic Native observability prepared (not shipped)

Generated: 2026-09-27T01:00:00Z

Task: continuing `agent-handoffs/inbox/prompts/20260926T230500Z-chatgpt-build62-failure-next-build-intent.md`'s Step 2 — the deeper Strength diagnosis, now that the Cardio/V3 task (see `agent-handoffs/reports/20260927T003000Z-healthkit-cardio-v3-phase1-closeout-final.md`) is complete and published.

**This report is Strength-only. It intentionally does not touch Cardio, activation, or Native build/release status — see the linked report above for that.**

## Result

**Definitive new server-side evidence rules out ordinary transport/auth flakiness as the mechanism, in favor of two concrete architectural weaknesses found by reading the real Native Build 62 source directly. Rather than shipping a third speculative retry fix, this task prepared, tested, and fresh-context reviewed deterministic Native observability so the next real attempt is self-diagnosing.** No production data mutated. No historical artifact regenerated. No Founder device operated. The Sep24 case was not touched, not retried, not manually reconciled. No Native build was cut or uploaded — the instrumentation sits as a reviewed candidate for the future batched Native build, per the standing instruction.

## Decisive new evidence

A bounded, zero-write, rolled-back production audit searched `physiqueos.command_receipts` for the exact command type this flow sends (`workout-reconciliation.resolve.v1`) across the account's **entire history**, not a narrow window around any one attempt: **zero rows, ever.** In the same audit window, every other command type flowed completely normally: 276 `healthkit.observations.ingest.v1` batches (continuing through the moment of the audit), training-session commits, check-ins, priority completions — all committed. A 100% failure rate for exactly one command type, across two independently-shipped and independently fresh-context-reviewed retry strategies (`aa165ca9`'s retry-after-401-refresh, `f72551be`'s retry-on-first-send-failure), with zero other symptom anywhere nearby, is not explainable by ordinary transport/auth flakiness — that would need to explain 100% failure for one specific action while everything else on the same device, same network, same session, works.

## The review record's identity has churned — a second finding, distinct from the failure mechanism itself

Precise, ID-based (not substring-matched) inspection of the account's evidence-review records found **two** Strength workout-reconciliation reviews, not one:

- `healthkit_workout_reconciliation_85abbdbec5947c275c677d09fdcb6b8b004908aa` — workout `localDate: 2026-09-23`, **status `resolved_confirmed`**, resolved automatically by `healthkit-strength-auto-confirm-v1` (a system matcher, 95% confidence, `endAligned: true`) at the same instant it was created (`2026-09-24T02:50:11.249Z`). The Founder never acted on this one.
- `healthkit_workout_reconciliation_36a18cc3ea586489ca963abd1f04300ce23b9eb0` — workout `localDate: 2026-09-24` (the one matching the Founder's screenshot: 60% confidence, `assessmentOutcome: possible_match`, below the auto-confirm threshold), **status `pending`, `resolution: null`, `lifecycleHistory` with exactly one entry ever** — created `2026-09-26T16:46:22.824Z`, i.e. two days after the workout itself, by an ingestion-reassessment batch (the Strength-link reassessment mechanism shipped in `524f1882`). This is the actual record the Founder has been attempting to confirm on Build 62; it existed well before the Build 62 attempt (~21:55–23:05 UTC per the prior handoff), so it is not a case of the Founder acting on a record that didn't exist yet.

This churn is a fact worth knowing on its own, independent of the failure mechanism: **the reconciliation review a Founder is looking at can be silently superseded** by a later ingestion-reassessment pass creating a fresh record for the same underlying workout. It does not by itself explain the zero-receipts finding, but it does rule out one alternative theory (a stale/retired reviewId from an old app session) — the Build 62 attempt was against the review record that genuinely exists today.

## Root-cause candidates (from reading the real Build 62 Native source, not guessed)

Two concrete, evidence-consistent architectural weaknesses were found in `EvidenceReviewDetailView.swift` and `FounderServerAPI.swift`, either of which could fully explain "the Founder visibly invoked the action, but nothing ever reached the server, with no other error signature":

1. **A silent early-return guard.** `resolveWorkoutReconciliation`'s `guard let version = review.version else { return }` used to return with no error thrown and no UI-state change at all if the review's version failed to decode — a tap could silently do nothing, with the Founder none the wiser (no banner, no error, the button simply appears to not respond, or an *already-stale* banner from an earlier moment stays on screen). This same pattern existed identically in three sibling action flows in the same file (DEXA measurement correction, generic evidence confirm, dismiss) — none reachable from workout reconciliation, but the same defect class.
2. **A blanket, identity-discarding error catch.** `FounderServerAPI.perform(...)`'s network call is wrapped `do { return try await transport.data(for: request) } catch { throw ProductionNativeError.networkFailure }` — collapsing a genuine connection failure, a cooperative Swift Task cancellation (`URLError.cancelled`, plausible if a concurrent view/data refresh — e.g. from the very active background HealthKit ingestion traffic seen in the same window — tore down or re-triggered the confirm flow's task mid-flight), a timeout, and an ATS/certificate problem into one indistinguishable case. This is exactly why two different retry strategies aimed at "genuine transport failure" both failed real acceptance: if the actual mechanism is a cancellation or something else entirely, a bounded retry inside the same collapsed error type does not address it, and Native telemetry alone cannot tell which mechanism actually occurred.

Per the task's explicit instruction, no third speculative retry was written. **Instead, deterministic Native observability was designed, implemented, tested, and reviewed** so the next real attempt produces conclusive evidence rather than another round of speculation.

## What was built (not shipped)

On a new branch on top of the exact, already-uploaded Build 62 Native source (`85c38104`), purely additive instrumentation with **no change to retry behavior, control flow, or thrown error types**:
- Two new bounded (64-event), device-local, `UserDefaults`-backed diagnostic logs (`WorkoutReconciliationDiagnostics`, `NetworkFailureDiagnostics`), following the exact established pattern of the pre-existing `NotificationDiagnostics`.
- The silent guard (in all four affected flows) now surfaces `actionState = .failed("This review's version could not be read. Refresh before trying again.")` instead of doing nothing.
- Each stage of the confirm flow (guard passed/failed, about to submit, submit returned, submit threw — including the underlying error's real domain/code/description) is recorded.
- `perform(...)`'s catch block gains one line capturing the underlying error's true identity before it's collapsed into `.networkFailure` — proven, by a new integration test, to actually fire on the real production code path (not just the diagnostic type tested in isolation).
- A new "Workout Reconciliation Diagnostics" screen (mirroring the existing "Notification Diagnostics" screen exactly) added to the existing engineering diagnostic surface in `FounderServerConnectionView`, so the Founder can read or screenshot exactly what happened on the next real attempt — no physical device log pull needed.
- Confirmed no sensitive data (bearer tokens, HTTP bodies, HealthKit content) can enter this log at any current call site; documented (not yet structurally enforced) that a future caller putting something sensitive in a query string could leak it here, as a known, currently-inert limitation.

**Validation**: the whole app target builds clean (`xcodebuild build` succeeded). A scoped test run of the new diagnostic-type tests plus the complete pre-existing `FounderServerAPITests` suite passes **212/212** with zero failures — including all four pre-existing `testWorkoutReconciliation*` API-layer tests, confirming the `perform()` change is purely additive and nothing regressed.

**Two rounds of fresh-context review**: the first approved the instrumentation as safe, surfacing two moderate follow-ups (the three sibling silent guards left untouched; the `perform()` catch line itself had no test proving it actually fires, only the diagnostic type in isolation) plus two low-severity notes (a theoretical, currently-inert query-string leak surface; a redundant duplicate field). Both moderate follow-ups were fixed in a second commit (the three sibling guards now surface the same `.failed(...)` state; a new integration test drives a real cancelled transport through the real `resolveWorkoutReconciliation` call and asserts the diagnostic log actually received the entry) and both low-severity notes were addressed with documentation and a schema cleanup. Full suite reruns clean at 212/212 after the fixes.

**Not archived, not uploaded, no build-number bump** — this sits as a reviewed, ready candidate for the future batched Native build containing all verified Build61/62 Founder feedback (items A–H from the prior handoff), per the explicit instruction not to cut Build 63 now.

## Explicitly preserved / not done

- Sep24 case: not touched, not retried, not manually reconciled, not asked of the Founder again.
- No production data mutated (all reads were bounded, zero-write, rolled-back).
- No historical artifact regenerated.
- No Founder device operated.
- No workout policy or strategic eligibility changed (that was the separately authorized, already-completed Cardio task).
- No Native build cut or uploaded; no TestFlight action taken.

## What happens next

This diagnosis and its prepared instrumentation are ready to be folded into the single coherent next Native candidate (batching items A–H from the prior handoff), once that batching work begins under its own authorization. The genuinely decisive test of the two root-cause candidates above requires that instrumented build to actually ship and a real Founder attempt to occur against it — that is a separate, future, explicitly-authorized step (build → TestFlight upload → Founder acceptance), not part of this diagnosis task.

## Decisions required

None blocking. For awareness: whenever the next batched Native candidate is authorized, this instrumentation should be included, and the Founder's next real Strength confirmation attempt against that build will be the first one with genuine diagnostic evidence behind it (readable via the new in-app "Workout Reconciliation Diagnostics" screen) rather than requiring another round of server-side forensic guesswork.

## Safety

No production data mutated. No historical artifact regenerated. No Founder device operated. Sep24 case untouched, not retried. All server-side investigation was bounded, zero-write, and rolled back (`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, verified `transaction_read_only = on`, explicit `ROLLBACK`). All Native code changes are local commits, not pushed, not built into any archive, not uploaded.
