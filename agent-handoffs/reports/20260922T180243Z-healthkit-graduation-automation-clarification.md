# HealthKit graduation automation clarification — completion report

task.id: `healthkit-graduation-automation-clarification-20260922`

## Summary

Two independent problems were diagnosed and fixed under this task:

1. **Sep 22 raw-only storage.** A separate, older raw-observation canonicalization
   gate (`healthkit_canonical_daily_activation_policy`) was still bounded to
   exactly 2026-09-21 and had no way to extend past a single day. Fixed by adding
   genuine `openEnded: true` support to the policy resolver/runner (Workout
   intentionally excluded, stays bounded-only), deploying it, and switching the
   policy from the old bounded Sep-21 record to a new open-ended one effective
   2026-09-22 onward, no backfill. Verified live: Sep-22 Activity and Nutrition
   both now canonicalize and project through ordinary Log rows with correct
   Apple Health provenance. The evidence-eligibility graduation scope was also
   activated (effective 2026-09-22, no backfill); Sep 22 was still `partial_day`
   at verification time, so nothing has graduated into V3 yet — it will the
   first time Sep 22 closes as a complete day, the same pattern already proven
   for Sep 21.

2. **No real background automation existed.** Build 50's only HealthKit sync
   call sites were 100% manual, foreground-only, Founder-diagnostic-triggered
   (one button, one selected date). The real iOS background-delivery machinery
   (`HKObserverQuery` + `enableBackgroundDelivery`) and durable cursor
   persistence already existed in the codebase but nothing ever called them.
   Built a new `HealthKitAutomaticSynchronizationCoordinator` that runs on every
   app foreground transition for Activity + Nutrition only, registers the real
   observer/background-delivery APIs, and always runs one immediate catch-up
   sync as the guaranteed recovery path (since this codebase has no
   `BGTaskScheduler`/app-delegate infrastructure and whether background
   delivery alone can wake a *fully terminated* process is unverifiable without
   a real device). Independent review found and I fixed one real reentrancy
   Blocker and two Minors; a full-suite test run (not just the reviewed unit
   class) then surfaced a real regression the review had missed — Sandbox-mode
   UI tests broke because the automatic path reached real Founder Production
   unconditionally — which I root-caused, fixed, and got re-reviewed
   (APPROVE WITH NON-BLOCKING FOLLOW-UPS). Founder authorized proceeding; Build
   51 is built, archived, and uploaded (delivery `04e929ea-c751-4a84-b4aa-5331f5d6b20d`,
   VALID).

## Authority reverified at claim and again at completion

- Production Server: `924d5e556ba418ceb64de828d4c6a7c06d99f769`, deployment
  `c2442650-a9a0-499e-bc42-59b81c0c8bae`, phase ACTIVE (confirmed via `doctl
  apps get-deployment` at report time, not just trusted from earlier in the
  session).
- Native: Build 50 (`b09f476d`) was the installed build at task start; Build 51
  (`63d925e0`) is now built, archived, and uploaded — not yet confirmed
  installed on the Founder's device (that is the next Founder action).
- Inbox task confirmed still `claimed` by `claude` at report time, matching
  this task id.

## Answers to the required questions

1. **What caused Sep-22 raw-only storage?** A different, older policy record
   (`healthkit_canonical_daily_activation_policy`, controls raw→canonical
   acceptance, separate from the graduation/projection policy) was still
   bounded to exactly 2026-09-21 — it was never extended past the original
   single test day, and nothing about it was related to the graduation
   plumbing built in the prior task.

2. **What does the canary toggle do?** A local, ephemeral SwiftUI `@State` on
   the Founder Production diagnostic screen. Not persisted across launches,
   not connected to any Server policy or any sync behavior — purely a UI gate
   for showing/hiding diagnostic controls on that one screen.

3. **What does manual "Sync test day now" do?** Triggers
   `synchronizeCanonicalTestDay` — a bounded, foreground-only sync for exactly
   the Founder-selected date, using its own cursor scope/`predicateVersion`
   namespace (`healthkit-canonical-testday-v1:<date>`), completely separate
   from the new automatic path's namespace (`healthkit-automatic-v1`).

4. **Was Build 50 background-syncing before this task?** **NO.** Every sync
   call site in Build 50 was manual, foreground-only, Founder-diagnostic-
   triggered. The real background-delivery machinery existed in code
   (`SystemHealthKitObserverClient`, `HealthKitSynchronizationEngine.
   startObserving`/`enableBackgroundDelivery`) but nothing in the app ever
   called it (a comment in the codebase said as much: "App launch never calls
   this in N1"), and the main engine's feature gate defaulted to an empty
   capability set app-wide.

5. **Is canonicalization now open-ended from Sep-22?** **YES.** Verified live:
   the old Sep-21-bounded policy record is deactivated; a new
   `openEnded: true` record is active, effective 2026-09-22, no end date, no
   backfill.

6. **Was the existing raw Sep-22 Activity observation reused, or was a resync
   required?** **A resync was required.** This codebase's anti-backfill design
   makes a canonicalization decision permanent for the exact observation
   identity it was made against — a later policy fix cannot retroactively
   promote an already-decided raw observation. The Founder's fresh resync
   created a new observation identity (a new device-scoped `sourceRevision`),
   which was freshly assessed against the now-open-ended policy and
   canonicalized cleanly with zero duplication.

7. **Why was Nutrition 0 observations at the original 6:17 AM check?** Not a
   defect. The Nutrition snapshot builder correctly suppresses emitting a
   false 0-calorie observation for a day with no logged food yet; it emitted
   correctly once food was logged later that day.

8. **Are normal projections live?** **YES**, verified live: Sep-22 Activity and
   Nutrition both project through the ordinary Log UI with correct Apple
   Health source attribution.

9. **Is ordinary Evidence/V3 eligibility live?** The policy scope is active
   (effective 2026-09-22, no backfill), but Sep 22 was still `partial_day` at
   verification time, so no fact has graduated into V3 yet — it will
   automatically the moment Sep 22 closes as a complete day.

10. **Does routine ingestion now require the canary toggle?** **NO** (once
    Build 51 is installed). The automatic coordinator never reads the canary
    toggle and uses its own separate cursor namespace.

11. **Does routine ingestion now require manual Sync?** **NO** (once Build 51
    is installed). The automatic coordinator fires on every app foreground for
    Founder Production automatically. Manual "Sync test day now" remains
    available as optional recovery/debug only.

## Explicit flags

- `SEP22_RAW_ONLY_ROOT_CAUSE_FOUND`: YES
- `CANARY_TOGGLE_SEMANTICS_DOCUMENTED`: YES
- `MANUAL_SYNC_SEMANTICS_DOCUMENTED`: YES
- `BUILD50_BACKGROUND_BEHAVIOR_PROVEN`: YES (proven to be manual-only, not
  backgrounded)
- `CANONICALIZATION_OPEN_ENDED_FROM_SEP22`: YES
- `SEP21_REMAINS_VALIDATION_ONLY`: YES (the Sep-21-bounded policy record was
  deactivated, not deleted; its canonical validation-day history is untouched
  and preserved; Sep 21 never becomes evidence-eligible under the new
  open-ended policy, whose effective date starts 2026-09-22 with no backfill)
- `SEP22_RAW_ACTIVITY_REUSED_SAFELY`: NO
- `SEP22_RESYNC_REQUIRED`: YES
- `NUTRITION_ZERO_OBSERVATION_EXPLAINED`: YES
- `NORMAL_PROJECTION_ENABLED`: YES
- `EVIDENCE_ELIGIBILITY_ENABLED`: YES (policy active; no fact has graduated
  yet because Sep 22 has not closed as a complete day)
- `SEP21_HEALTHKIT_V3_ELIGIBLE`: NO
- `DUPLICATE_STRATEGIC_OBSERVATION_PRESENT`: NO
- `ROUTINE_CANARY_TOGGLE_REQUIRED`: NO (after Build 51 is installed)
- `ROUTINE_MANUAL_SYNC_REQUIRED`: NO (after Build 51 is installed)
- `BACKGROUND_DELIVERY_IMPLEMENTED`: YES (registered via the real
  `HKObserverQuery`/`enableBackgroundDelivery` APIs; whether iOS actually wakes
  a fully terminated process for a HealthKit change is unverifiable without a
  real device — the foreground catch-up sync is the proven, guaranteed
  recovery path regardless)
- `DURABLE_REVISION_STATE_IMPLEMENTED`: YES (reuses the existing durable
  per-scope cursor/pending-batch store, unchanged, under a new dedicated
  cursor namespace)
- `RELAUNCH_CATCHUP_IMPLEMENTED`: YES (one immediate incremental sync per
  stream runs on every foreground transition, cold launch and resume alike)
- `WORKOUT_ACTIVATION_ENABLED`: NO (untouched, out of scope for this task by
  design)
- `NEXT_NATIVE_BUILD_REQUIRED`: Build 51 — already built, archived, and
  uploaded this session (delivery `04e929ea-c751-4a84-b4aa-5331f5d6b20d`,
  VALID). No further build is required to ship this capability.
- `READY_FOR_NORMAL_AUTOMATIC_ACTIVITY_NUTRITION`: YES, once Build 51 is
  installed on the Founder's device.

## Work performed (Parts A–J)

- **A.** Reverified live authority at claim and again at report time (see
  above); did not trust the inbox task's `expected_*` hints.
- **B.** Diagnosed the Sep-22 raw-only root cause (see Q1).
- **C.** Extended the raw→canonical activation policy resolver/runner to
  support a genuine `openEnded: true` window (Workout excluded by design).
  Implemented, tested (Server unit suite: same count/failures as base, 0 new
  failures; all phase gates match base; ESLint clean), independently reviewed
  (APPROVE WITH NON-BLOCKING FOLLOW-UPS after two small fixes), deployed
  (`924d5e55`, deployment `c2442650`), and the policy write itself was
  authorized via explicit Founder chat sentence before executing, dry-run
  first with a captured `expected` fact set, post-apply invariant verified.
- **D.** Determined the stored raw Sep-22 observation could not be safely
  promoted (permanent anti-backfill bar); a fresh resync was the correct,
  non-duplicating recovery path (see Q6).
- **E.** Verified normal projection live with real Sep-22 data before touching
  evidence eligibility.
- **F.** Activated the evidence-eligibility graduation scope, separately
  authorized, effective 2026-09-22, no backfill.
- **G.** Audited the existing (dormant) Native background-delivery foundation,
  then implemented the missing wiring: `HealthKitAutomaticSynchronizationCoordinator`,
  a new `.n1Automatic` feature gate (read/upload/background-delivery, never
  write), invoked on every `scenePhase == .active` transition, independent of
  the diagnostic canary toggle, reusing the existing durable cursor store
  under its own namespace. Full detail below.
- **H.** Bounded acceptance evidence gathered where reachable from a
  simulator/CI-style environment (see Testing below); true background-wake-
  after-full-termination on a real device remains unverified and is
  explicitly documented as such, not claimed.
- **I.** Workout remained untouched throughout (confirmed: no Workout policy
  change, automatic coordinator's stream list is exactly
  `[.activitySummary, .nutritionDailyTotal]`, never Workout).
- **J.** The old exact-Sep-21 bounded canonicalization policy was already
  deactivated as part of switching to the open-ended policy (Part C); its
  canonical Sep-21 validation-day data is untouched and preserved. Native
  normal/automatic ingestion never reads the canary toggle. Did not
  hide/relabel the Founder diagnostic screen controls in production builds —
  out of scope, not requested, would be an unrequested design change.

## Native Part G in detail

New file `HealthKitAutomaticSynchronizationCoordinator.swift`:
`bootstrap()` (idempotent, reentrancy-safe via in-flight-`Task` coalescing) —
re-requests HealthKit authorization only if not yet asked this process (OS
silently no-ops a repeat request once already decided), registers the real
observer + background delivery for Activity and Nutrition, then always runs
one immediate catch-up sync per stream. Per-stream failures are isolated and
all accumulated (not overwritten). The Founder owner identity is fetched once
and cached across calls. Gated to fire only when `nativeAuthority ==
.founderProduction` (added after a regression was found — see below); Sandbox
and diagnostic-canary paths are completely unaffected.

**Independent review cycle:**
1. First candidate (`27823456`) reviewed: **BLOCK.** One real Blocker (no
   reentrancy guard — overlapping `bootstrap()` calls could double-request
   authorization and double-upload the same batch) and two Minors (per-stream
   errors overwrote instead of accumulated; owner identity re-fetched every
   foreground). Two Majors flagged as open product decisions, not code
   defects: the broad `.initialRead` authorization scope now fires
   automatically on first foreground rather than only via a deliberate
   diagnostic-screen tap (though the scope itself is unchanged from what that
   button always requested); and whether `enableBackgroundDelivery` alone
   suffices to wake a fully terminated process is unverifiable without a real
   device (this codebase has no `BGTaskScheduler`/app-delegate
   infrastructure).
2. Fixed the Blocker and both Minors (in-flight-`Task` coalescing, cached
   owner identity, error accumulation). Verified each fix with a dedicated
   mutation test (temporarily reverted the fix, confirmed the corresponding
   new test failed, restored it, confirmed `git status` clean).
3. Ran the FULL Native test suite (not just the reviewed unit class) as a
   final check before committing — this surfaced a real regression the
   review's narrower scope had missed: 12/12 UI acceptance tests
   (`TrainingAcceptanceUITests`, which deliberately launch pinned to Sandbox
   authority) failed. Root-caused to the automatic coordinator being wired
   unconditionally to the real production API client and firing on every
   foreground regardless of authority — reaching real Founder Production and
   triggering the real HealthKit system permission prompt on a fresh
   simulator, which blocks XCUITest behind a system alert outside the app's
   accessibility hierarchy. Confirmed the diagnosis against the Build 50
   baseline (in-place tree comparison, not a branch switch) and mutation-
   tested the fix using `xcrun simctl privacy reset` to clear stale
   HealthKit-permission-decision state between runs (a first mutation attempt
   gave a false "still passes" before the privacy reset, because iOS does not
   re-prompt once a decision is already made in that simulator).
4. Fixed by gating the `bootstrap()` call site behind
   `nativeAuthority == .founderProduction`, matching this codebase's existing
   pattern for every other production-backed feature.
5. Sent the fixed candidate (`0917e836`) back to the same reviewer for
   re-verification. **Updated verdict: APPROVE WITH NON-BLOCKING
   FOLLOW-UPS.** All three original findings confirmed fixed under direct
   build/test/mutation-testing (not just re-reading the diff); the new
   Sandbox-regression fix independently confirmed correct and sufficient via
   its own full 12/12 UI-test run on a freshly-privacy-reset simulator. One
   new, narrow, non-blocking NOTE surfaced: a mid-process-lifetime switch from
   Founder Production to Sandbox (via the in-app authority picker) does not
   tear down an already-registered background observer — not reachable by any
   current test or normal flow, flagged for awareness only.
6. Presented the two open Major decisions to the Founder explicitly (not
   silently resolved): keep the broad authorization scope, or narrow it;
   proceed to Build 51 on the foreground-catch-up fallback, or hold for
   real-device background-wake verification first. Founder chose: keep the
   broad scope, proceed now. Authorized archiving and uploading Build 51.

## Testing

- **Server** (candidate `924d5e556ba418ceb64de828d4c6a7c06d99f769`): full unit
  suite, same count and failures as base (0 new failures), all 10 phase gates
  match base, ESLint clean, exact-SHA build succeeded. Live zero-write
  verification before and after the policy writes.
- **Native unit** (final candidate `0917e836`, then `63d925e0` for the Build
  51 bump): 1272 tests, 0 failures, run at both the fixed-review SHA and again
  after the Build 51 version bump.
- **Native UI** (`TrainingAcceptanceUITests`, full class, final candidate):
  12/12 passed on a freshly-privacy-reset simulator. One isolated rerun of
  `testReportingJourneys` hit a scroll-timing failure; confirmed via repeated
  runs (2/3 pass rate) and a baseline comparison (same test, same flake
  pattern, reproducible at the unmodified Build 50 baseline too) that this is
  a pre-existing, unrelated flake, not a regression from this work.
- **Mutation testing**: every new/changed guard (reentrancy coalescing, error
  accumulation, the Sandbox-authority gate) was verified to actually fail the
  corresponding test when reverted, then restored with a clean `git status`
  confirmed before and after.
- **What was NOT verified** (explicitly, not silently assumed): true
  background wake of a fully terminated process on a real physical device.
  This requires hardware this session does not have access to.

## Not fixed / open follow-ups (non-blocking)

- Major 2 (broad initial-read authorization scope) — accepted as-is per
  Founder decision.
- Major 3 (unverifiable real-device background-wake behavior) — accepted per
  Founder decision; foreground catch-up is the guaranteed fallback regardless.
- New NOTE: an in-flight background registration from a prior Founder
  Production session is not torn down on a mid-process switch to Sandbox via
  the in-app authority picker. Narrow, not currently reachable by any test or
  normal flow.
- `testReportingJourneys`'s pre-existing scroll-timing flake (unrelated to
  this task, also reproducible at the Build 50 baseline).

## Next Founder action

Install Build 51 (delivery `04e929ea-c751-4a84-b4aa-5331f5d6b20d`, VALID) via
TestFlight once it finishes processing. After install: no daily canary toggle,
no manual Sync, no Founder Production diagnostic screen visit is required for
routine Activity/Nutrition ingestion — the app should sync automatically on
every foreground. Recommended first check: foreground the app once after
installing and confirm the current day's Activity/Nutrition appear in Log
without visiting any diagnostic screen.
