# Strength Reconciliation -999: Root Cause Isolated Below the Swift Task Layer

Generated: 2026-09-27T14:50:34Z

Task: continuation of the Build 64 acceptance work, diagnosing the 2026-09-27 ~07:36 America/Los_Angeles Strength reconciliation confirm attempt on Build 64, using the new `taskWasCancelledAtCatch` diagnostic signal.

## Build 64 acceptance update

Per the Founder's report: **Your Journey progress bars now PASS. Completed Visible Abs Beginning/Completion real photos now PASS. Logged Today Cardio remains PASS.** Strength reconciliation is now the only failed Build 64 acceptance item. Those three passing items are not reopened here absent a regression.

## The new evidence

The 2026-09-27 ~07:36 America/Los_Angeles confirm attempt's Workout Reconciliation Diagnostics showed: `guard_check_passed` (Version: 1, Int), `submit_attempt`, then `submit_threw` / `acceptance_uncertain`, underlying `NSURLErrorDomain -999 "cancelled"`, and critically — **`App task cancelled at catch: no`** (the new `taskWasCancelledAtCatch` field shipped in Build 63/64).

**This is decisive and rules out the SwiftUI/task-lifecycle cancellation theory with direct evidence, not inference.** `Task.isCancelled` was read at the exact `catch` site in `EvidenceReviewDetailView.resolveWorkoutReconciliation`, before any further `await` in that block — and it was `false`. Swift's `URLSession.data(for:)` async bridging only cancels its underlying `URLSessionTask` when the *owning Swift Task* is cancelled (via `withTaskCancellationHandler`); since the owning Task was demonstrably not cancelled, that specific propagation path is eliminated as the cause of this `-999`.

## Correlating the exact attempt against the Server (zero-write, read-only)

Two separate zero-write, owner-scoped, `ROLLBACK`-guaranteed production reads, run against the live Server (`49211870c552b104aaf7840939f55d9dc9ecc1df`, matching the runtime that served this exact request):

**1. `command_receipts`, all-time and in a tight window around the attempt:**
- `workout-reconciliation.resolve.v1` has **zero** receipts, ever, for this account — confirmed again, matching every prior check.
- In the 14:16–14:56 UTC window (covering 07:36 America/Los_Angeles ± 20 minutes), the *only* two receipts of any kind are two `healthkit.observations.ingest.v1` background-sync commands at 14:34:45 and 14:34:49 UTC — automatic, unrelated to the manual confirm tap.

**2. The Server's own structured request/read log for the `web` component**, pulled read-only via `doctl apps logs` (covers the app process's entire uptime, 2026-09-26T22:38 onward — comfortably spans the attempt):
- `14:34:39.081` — `native.auth.refresh_succeeded` (an access-token refresh)
- `14:34:39–14:34:43` — a burst of `provider.*_read.complete` log lines (Home, Goals, Briefing, Active Goal) — the signature of the app just coming to the foreground and refetching its cached screens
- `14:34:45` / `14:34:49–50` — the two HealthKit background-sync commands, logged with full `native.command.receipt_committed` entries (proving the app's write-command logging path works and is visible in these logs when a command actually reaches it)
- `14:36:07.208` and `14:36:09.562` — two `provider.evidence_review_read.complete` (`readModel: 'evidence.review.detail'`) reads, 2.3 seconds apart — this is the Founder opening the Strength reconciliation review
- **Then nothing for 78 seconds.** The next log line of any kind is `14:37:27.250`, a `core.navigation.home` read.

**There is no `native.command.receipt_committed`, no `api.request.failed`, no log line of any kind for a commands-endpoint request anywhere in this window.** The two HealthKit commands minutes earlier prove this app *does* log write-command attempts clearly when they arrive — the total absence of any such entry for the reconciliation confirm, combined with zero `command_receipts` rows, means **the request never reached the Server's application code at all.** It didn't fail there; it never arrived. Whatever happened, happened entirely client-side, in the 78-second gap between viewing the review and the next successful read.

**3. `security_events`**: zero rows in the 14:00–15:00 UTC window. Whatever happened left no trace at the security/session layer either.

## Ruling out the remaining app-owned/network-code theories

Re-inspected the exact code path this candidate ships (`FounderServerAPI.swift`, unchanged in this area since the original diagnosis):
- `URLSessionFounderHTTPTransport.data(for:)` is a single line: `try await session.data(for: request)`, where `session` defaults to `URLSession.shared` — Apple's own async/await bridging, no custom delegate, no custom configuration.
- Zero occurrences of `.invalidate()` / `.invalidateAndCancel()` anywhere in the app.
- Zero `TaskGroup` / `async let` / client-side timeout-race patterns in the networking layer — only plain `URLRequest.timeoutInterval` (which produces `-1001`, not `-999`, and wasn't hit here since Task.isCancelled is unrelated to timeoutInterval anyway).
- `submitCommand` is sequential: one attempt, one bounded token-refresh-and-retry on 401, no explicit cancellation anywhere.

This rules out every app-owned URLSession-management bug a static code read can surface. Combined with (1) Task.isCancelled == false and (2) zero server-side trace of any kind, the failure is isolated to exactly where the Founder asked: **below the Swift Task layer, in the OS/network stack itself, before the request ever left the device (or at least before it ever reached this application's code).**

## Why this command type, specifically — the differentiating factor found

Checked for any `beginBackgroundTask` / `UIBackgroundTaskIdentifier` / `ProcessInfo.performExpiringActivity` background-task-assertion usage anywhere in the app: **there is none, anywhere.** The app has no mechanism to request a brief execution grace period from iOS for an in-flight network request when the app transitions to the background. (Contrast: `PhotosHistoryView` and `LogView` explicitly gate their own `.task(id:)` work on `scenePhase == .active` — the codebase is scenePhase-aware elsewhere, but no code path gives an in-flight *write* request any protection against the app backgrounding mid-request.)

This is the most likely explanation consistent with every piece of evidence gathered:
- The confirm attempt occurred ~90 seconds into a freshly-foregrounded app session (auth refresh + read burst at 14:34:39, confirm attempt at ~14:36:xx) — a window where a brief interruption (a screen lock, an incoming call, a notification banner tap-away, switching apps) is unremarkable and easy to miss.
- If the app was even briefly backgrounded or suspended while the reconciliation POST was in flight — with no background-task assertion protecting it — iOS can and does cancel in-flight `URLSessionTask`s for a suspended process. This surfaces to the app, once it resumes, as exactly `NSURLErrorCancelled` (-999) on that task, with the owning Swift Task itself never having been told to cancel (it wasn't — it's the OS tearing down the connection out from under a suspended process, not a cooperative Swift-level cancellation).
- This also explains "why this command type": it is the one write command in the app's whole command surface that is characteristically triggered from a screen reached via a push notification tap, often shortly after opening the app — exactly the moment when a brief backgrounding interruption (checking the notification, then returning) is most plausible. The other command types that succeed reliably (HealthKit background sync, check-in, priority-complete, training-session-commit) are typically issued during a more settled, sustained in-app session, not in the first ~90 seconds after a cold/warm foreground.
- It also explains "zero receipts, ever, across multiple independent fix attempts": none of those fixes touched this specific vulnerability, because none of them were investigating the OS-lifecycle/background-task angle — they were reasonably investigating the guard/version-decode theory, then the blanket-error-catch theory, then (this task) the Swift-Task-cancellation theory. Each was a real, worthwhile hypothesis to rule out, and each is now eliminated with direct evidence.

## What this diagnosis does NOT claim

This is the most evidence-consistent explanation, not a certainty — a genuine external network-path disruption (WiFi/cellular handoff, weak signal) at the same moment remains possible and would look identical from the server's side (zero trace either way). The two are not mutually exclusive: a backgrounding-without-assertion gap makes the app *more vulnerable* to exactly this kind of transient interruption turning into an unrecoverable cancellation, regardless of which triggered it first. Server-side evidence cannot distinguish "OS suspended the app" from "the network path genuinely dropped" — both leave the identical signature (zero server trace, Task.isCancelled == false). What the evidence *does* rule out with confidence is: Swift Task cancellation, any app-owned URLSession bug, and any server-side failure.

## Recommended next step (not implemented in this task — no build was cut)

Wrap the workout-reconciliation command submission (and, by extension, any other write command reachable from a just-foregrounded/notification-driven screen) in a background-task assertion (`UIApplication.beginBackgroundTask`/`endBackgroundTask`, or `ProcessInfo.processInfo.performExpiringActivity`) for the duration of the network call, giving it a brief grace period to complete even if the app backgrounds mid-request. This is a small, targeted, testable change consistent with the "smallest correct fix" standard already used in this lane — but per this task's explicit instruction, it has **not** been implemented, and no build has been cut. It is offered as the concrete next candidate for whenever a fix is authorized.

**No further Founder confirmation attempt is requested by this diagnosis, per explicit instruction.**

## Explicitly confirmed NOT done, per this task's instructions

- No blind retry logic added.
- No Founder confirmation attempt requested.
- No Native code changed, no build cut, no build number bumped, no archive, no upload.
- No production data mutated — two additional zero-write, owner-scoped, `ROLLBACK`-guaranteed reads only (command_receipts/request-log correlation; security_events/sessions check).
- No Server code deployed.

## Files (read-only forensics, not part of any candidate)

- `/private/tmp/physiqueos-production-readonly-mac-bootstrap/scripts/operations/strengthBuild64AttemptCorrelation.entry.mjs`
- `/private/tmp/physiqueos-production-readonly-mac-bootstrap/scripts/operations/strengthBuild64SecurityAndSessionCheck.entry.mjs`
