# Strength Reconciliation: Background-Execution-Assertion Fix — Reviewed Candidate Ready

Generated: 2026-09-27T15:37:36Z

Task: focused Native fix candidate for the remaining Build 64 Strength reconciliation failure, per the Founder's explicit instruction. **Stops at a reviewed candidate — no build number bump, no archive, no upload, no Founder confirmation attempt requested.**

## What changed

Commit `6773c93e`, on top of `ae90c947` (the exact uploaded Build 64 source), on `codex/native-batched-candidate-post-build62`, pushed to origin.

Protects `ProductionEvidenceReviewAPI.resolveWorkoutReconciliation`'s whole submission — both the original attempt and its existing, separately-justified retry-on-`networkFailure` — with an iOS background-execution assertion, so a brief app background/suspension transition during the call can no longer have it torn down by the OS before it finishes or fails cleanly. **No retry logic was added or changed** — this is purely a lifecycle-protection wrapper around the existing submission flow, per the explicit instruction not to add another blind retry.

### New: `BackgroundExecutionAssertion.swift`

- `BackgroundTaskScheduling` protocol abstracting `UIApplication.begin`/`endBackgroundTask` behind a testable seam (an `Int`-typed opaque identifier, not a UIKit type, so tests never need UIKit-level lifecycle to exercise it).
- `UIKitBackgroundTaskScheduler`: the real, production implementation — a thin wrapper, nothing more.
- `withBackgroundExecutionAssertion(named:scheduler:operation:)`: runs an async throwing operation under the assertion.
- `BackgroundTaskEndGuard` (private): guarantees the assertion ends **exactly once**, regardless of which of these happens first — normal completion, a thrown error, Swift Task cancellation, or the OS's own expiration handler firing (including the racy ordering where expiration fires before the identifier is even recorded, or fires again after normal completion already ended it).

### Changed: `EvidenceReviewAPI.swift`

`ProductionEvidenceReviewAPI` gained `var backgroundTaskScheduler: any BackgroundTaskScheduling = UIKitBackgroundTaskScheduler()` (default-valued, so every other call site is source-unchanged) and the whole submission body — including the retry — now runs inside `withBackgroundExecutionAssertion`.

## Validation

- **Six new unit tests** (`BackgroundExecutionAssertionTests.swift`) cover the wrapper's lifecycle/expiration/cleanup semantics in isolation: begins-before-runs-and-ends-once-on-success, ends-once-on-throw, ends-once-when-expiration-fires-before-completion, a late expiration after normal completion doesn't double-end, ends-once-on-Task-cancellation, and distinct calls get distinct identifiers.
- **A genuine RED check, not a rubber stamp**: deliberately broke the "already ended" guard and reran the double-end test. It initially still passed — a bug in the test itself: the fake scheduler's expiration-handler closure captured `self` weakly, so once `withBackgroundExecutionAssertion`'s stack frame had returned, `self` was already deallocated and a later simulated expiration callback was a silent no-op. Found and fixed the real cause (changed the closure's capture from `[weak self]` to a deliberate strong capture — the scheduler is the sole holder of that closure for exactly as long as the assertion is open, so keeping `self` alive that long is correct, not a leak). After that fix, breaking the guard produced a genuine failure (`[1, 1]` instead of `[1]`), and restoring it passed again — the test now demonstrably catches the bug it claims to.
- **Two new integration tests** (`FounderServerAPITests.swift`) reproduce the exact Build 64 evidence end-to-end against `ProductionEvidenceReviewAPI.resolveWorkoutReconciliation` with a fake scheduler injected: a successful submission ends the assertion exactly once; both attempts failing with a transport error (matching the real `-999 "cancelled"`) still end it exactly once, under the **same single assertion for both attempts**, not one each.
- **Full regression**: unit suite **1453/1453 passing** (1445 prior + 8 new), UI suite (`GoalsAcceptanceUITests` + `TrainingAcceptanceUITests`) **13/13 passing**, both run after a clean build.
- **Independent fresh-context review**, given only the diff and background (no prior context), verified by reading the code directly and by independently re-running all 8 new tests in the simulator: confirmed the locking in `BackgroundTaskEndGuard` is correct on every path with no deadlock risk; confirmed the strong-`self` capture introduces no real retain cycle (the scheduler is the sole external holder, released exactly once); confirmed `defer` correctly covers every exit path including Task cancellation; confirmed wrapping both the original attempt and its retry in a **single** assertion is the right design (splitting them would reopen the exact gap this fix targets), while correctly noting this mitigates the observed brief-backgrounding race without guaranteeing unlimited execution time against iOS's own background-time budget; confirmed no unintended changes elsewhere, including verifying the large `project.pbxproj` diff is purely positional file-ID renumbering from the generator (the two new files being added, no other file added/removed/restructured) rather than any structural or build-setting change. **No issues found.**

## What this fix does and does not claim

This targets the leading, most evidence-consistent hypothesis from the prior diagnosis (`agent-handoffs/reports/20260927T145034Z-strength-999-below-task-layer-diagnosis.md`): the app has zero protection against an in-flight write being torn down by a brief app-background/suspension transition, and this is the one command most likely to be attempted in exactly that kind of window. It does not, and cannot, guarantee the next real attempt will succeed — a genuine external network-path disruption at the same moment remains possible and is unaffected by this fix. What it does do is close a real, confirmed architectural gap (zero background-task-assertion coverage anywhere in the app) for this specific command, which is the correct, minimal, testable next step consistent with everything the evidence supports.

## Explicitly confirmed NOT done, per this task's instructions

- No build number bumped, no archive, no upload.
- No Founder confirmation attempt requested.
- No blind retry added — the existing, already-justified retry is unchanged; only its lifecycle protection changed.
- No production data mutated, no Server code touched.

## Candidate state

`origin/codex/native-batched-candidate-post-build62` now at `6773c93e`, containing (on top of Build 64's exact uploaded source `ae90c947`): this reviewed, tested background-execution-assertion fix. Ready for whenever cutting the next Native build is separately authorized.
