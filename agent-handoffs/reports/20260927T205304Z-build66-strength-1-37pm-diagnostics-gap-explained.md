# Build 66 1:37 PM Strength attempt: server correlation + why no Command Network Diagnostics entry appeared

Generated: 2026-09-27T20:53:04Z

Task: explain, from Server logs/receipts and the exact Build 66 shipped source (`04a58911`), why the Founder found no new "Command Network Diagnostics" entry after the 1:37 PM Build 66 Strength reconciliation attempt, and why "Underlying Network Errors" showed nothing new either. No fix implemented, no build cut, per instruction.

## Headline

**The reconciliation command never reached the Server at all — not this attempt, not ever, for this account.** Independently, **`CommandNetworkDiagnostics` (Build 66's new command-transport diagnostic) has no UI screen anywhere in the shipped app** — it's wired at the code level but nothing displays it. Both are now confirmed with direct evidence, not inference. Because the request never reached the network layer, the absence of a `CommandNetworkDiagnostics` entry for this specific attempt is *expected*, not itself evidence of a bug in that transport — the real, still-open question is what threw **before** any network call was attempted, and the code traces to exactly two candidates, one of which (a local JSON-encode failure) fits every piece of evidence collected so far.

## 1. Server-side correlation for the 1:37 PM PT (20:37 UTC) window — zero-write reads

Two independent Server-side sources checked for `2026-09-27 20:07–21:07 UTC` (a full hour centered on the stated time) and, separately, the account's entire history:

- **`command_receipts` (zero-write, `REPEATABLE READ READ ONLY`, rolled back):** `workout-reconciliation.resolve.v1` has **0 rows, all-time**, for this account. In the hour around 20:37 UTC, exactly 2 receipts exist, both `healthkit.observations.ingest.v1` (20:37:03.108 and 20:37:03.778 UTC) — matching the Founder's own observation that HealthKit sync was active at that moment. The day's full receipt breakdown: `check-in.submit.v1` (1), `healthkit.observations.ingest.v1` (77), `priority.complete.v1` (1). No reconciliation command anywhere.
- **Application run logs (`doctl apps logs ... --type run`):** covers 2026-09-26T22:38 through 2026-09-27T20:39 UTC. `api.request.failed` is this app's actual event name for *any* failed request that reaches it (confirmed from real examples in the same log: `HEALTHKIT_OBSERVATION_IDENTITY_COLLISION` 409s, `ACCESS_TOKEN_EXPIRED` 401s) — there is **zero** such event, and zero mention of "reconcil" anywhere, in the entire tail. The exact 20:36:59–20:37:06 UTC window shows: an auth-token refresh (200, 85ms) at 20:36:59.685, then a burst of bulk reads (`core.navigation.home` 2.76s/4.7MB, `core.navigation.log` 1.57s/9.4MB, `core.navigation.goals` twice, `active_goal_read`, `evidence.review.detail` twice), and the two HealthKit command receipts already noted. **No commands-endpoint request of any kind, successful or failed, appears for the reconciliation command in this window or the surrounding hour.**

Conclusion: the 1:37 PM attempt is a repeat, this time on Build 66's isolated command transport, of the same server-side silence seen on every prior attempt (Build 61, 64, 65). Build 66's connection-pool isolation fix did not change this outcome.

## 2. Is `CommandNetworkDiagnosticsTransport` actually wired into this path? Yes, confirmed by direct read of `04a58911`

- `AppEnvironment.swift:566–567`: `productionNativeAPI` is constructed with `commandTransport: CommandNetworkDiagnosticsTransport.production()`.
- `evidenceReviewAPI` (`AppEnvironment.swift:531`) wraps that exact same `productionNativeAPI` instance — no separate instance is created.
- `FounderServerAPI.swift`: `ProductionNativeAPI.submitCommand` passes `overrideTransport: commandTransport` on **all three** of its `perform(...)` call sites (initial attempt, post-401-refresh retry, and the nested retry-on-`.networkFailure`). Every read call site (`readResource`, `authenticatedResponse`, `sendJSON`, etc.) correctly omits it and uses the shared read transport instead.

So the wiring is exactly as intended — commands genuinely would route through the dedicated transport, *if `perform()`'s network call were ever reached for this attempt*. Per §1, it wasn't.

## 3. Why no new "Underlying Network Errors" entry either — traced through every throw site in the shipped code

This is the more decisive finding. `FounderServerAPI.perform(...)`'s catch block is unconditional:

```swift
do { return try await (overrideTransport ?? transport).data(for: request) }
catch {
    NetworkFailureDiagnostics.record(path: path, error: error)   // always runs first
    throw ProductionNativeError.networkFailure
}
```

`NetworkFailureDiagnostics.record`/`recentEvents` (read directly from `04a58911`) has no filtering, dedup, or path-based logic that could silently drop an entry — every call inserts at index 0, and the view renders the list unfiltered. **If any network-layer exception had been thrown anywhere in this attempt, a new entry would exist and would be visible.**

Tracing every place `.networkFailure` (or any other error) could originate in the reconciliation path in `04a58911`:

1. `submitCommand`'s initial `perform(..., overrideTransport: commandTransport)` — goes through the catch above.
2. Its 401-refresh retry `perform(...)` — same catch.
3. `EvidenceReviewAPI.resolveWorkoutReconciliation`'s own `catch ProductionNativeError.networkFailure { outcome = try await api.submitCommand(...) }` — a second full `submitCommand` call, itself containing throw sites 1 and 2 again.
4. The post-response guard `guard outcome.outcome != .pending, let result = outcome.receipt.result else { throw ProductionNativeError.networkFailure }` — this one requires `submitCommand` to have **returned successfully** (a real, decoded HTTP response) — which requires a completed round trip. Ruled out by §1 (zero server trace).

Every one of (1)–(3) is unconditionally logged before being rethrown. Since the Founder found no new entry, **none of them fired**. That leaves only code that runs *before* any network call in `submitCommand` — concretely `encoder.encode(envelope)`, whose failure is caught locally and rethrown as `ProductionNativeError.invalidResponse` **without ever touching either diagnostic** (it's a pure local JSON-encode step, no network attempted). This is a plain Swift enum error, not an NSURLErrorDomain one — when bridged to NSError for display (`WorkoutReconciliationDiagnostics.describe(error)`), it would show as something like `PhysiqueOS.ProductionNativeError #<ordinal> — invalidResponse`, visually distinct from the `NSURLErrorDomain -999`/`-1001` signatures seen in Build 64/65.

Also checked and ruled out: `withBackgroundExecutionAssertion` runs `operation()` directly on the caller's own Task (no detached/child Task created), so `Task.isCancelled` read at the UI's catch site genuinely reflects the one Task that ran the whole attempt — consistent with `taskWasCancelledAtCatch: false` being a real, trustworthy signal each time, not a blind spot from a different Task's cancellation.

## 4. `CommandNetworkDiagnostics`'s missing UI — confirmed independently, exhaustively

`git grep -n "CommandNetworkDiagnostics" 04a58911 -- ios/PhysiqueOS/` (whole app tree, not just Presentation/SharedUI) returns exactly 8 lines: the type's own definition file (`CommandNetworkTransport.swift`), its wiring in `AppEnvironment.swift`, and two doc comments in `FounderServerAPI.swift`. **Nothing in `ios/PhysiqueOS/Presentation/` or anywhere else references it.** Unlike `WorkoutReconciliationDiagnostics`/`NetworkFailureDiagnostics` (both rendered in `WorkoutReconciliationDiagnosticsView.swift`), `CommandNetworkDiagnostics.recentEvents()` is never read by any View. This is a genuine, confirmed gap in the Build 66 candidate — the storage/transport/tests were built and shipped, but the display was never added. It's moot for explaining *this specific* attempt (the network layer was never reached, so there'd be nothing for it to have recorded anyway), but it means a future attempt that *does* fail at the network layer still won't be visible without a follow-up fix.

## 5. One thing worth knowing, not being requested

`WorkoutReconciliationDiagnosticsView` **does** render a full `Underlying: <domain> #<code> — <description>` line for every `submit_threw` event (confirmed by direct read of the view code) — `WorkoutReconciliationDiagnostics.describe(error)` always populates this from the real thrown error, never nil. The Founder's relayed summary of the 1:37 PM row (stage/outcome/task-cancelled) didn't include that line's text, so its exact contents haven't been factored into this report — if it's convenient to note next time that screen is open anyway, it would confirm or correct the `invalidResponse`/local-encode-failure hypothesis in §3 directly. Not requesting a new attempt or a new diagnostics search for this.

## Explicitly not done, per instruction

- No fix implemented.
- No build cut.
- No Founder attempt requested or implied.

## Recommended next step (not started, awaiting authorization)

If the local-encode-failure hypothesis in §3 holds up, the fix is narrow: make `submitCommand`'s pre-network encode failure observable (it currently collapses to `.invalidResponse` with no diagnostic at all, the same blind spot `NetworkFailureDiagnostics` was built to close for the network path) and add the missing `CommandNetworkDiagnostics` display section to `WorkoutReconciliationDiagnosticsView`. Holding both per "do not cut another build or add another fix until this is explained."
