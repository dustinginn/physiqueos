# Final integrated Native Build 69 candidate (Claude + Codex), for acceptance

- **Decision executed:** `agent-handoffs/inbox/decisions/20260929T052500Z-build69-accept-server-deploy-hold-native-for-codex.md`
- **Agent:** claude (integrator)
- **Status: FINAL CANDIDATE READY.** Not uploaded to TestFlight.
- **Production (unchanged since the deploy report):** Server/Web `faa9151a` (deployment `76c3d8aa`).
- **Earlier reports:**
  - Server deploy: `agent-handoffs/reports/20260929T043000Z-daily-driver-server-faa9151a-production-deploy.md`
  - Base candidate: `agent-handoffs/reports/20260929T050000Z-native-consolidated-daily-driver-candidate-build69.md`
  - Codex's report is on branch `codex/native-workout-complete-record-celebration-20260928` at `a07edac9`: `agent-handoffs/reports/20260929T042000Z-workout-complete-performance-record-celebration.md`

## Candidate

| | Branch | SHA |
|---|---|---|
| **Native Build 69 (final)** | `claude/native-build69-integrated-20260929` | **`efa65db1`** |

It is built from the accepted base `c2b43091` plus:

| Commit | What |
|---|---|
| `0e042a13` | Codex prototype `1fa66457`, cherry-picked with `-x`. Its patch is identical to my earlier reverted `8632c690`. |
| `2c87da16` | Codex refinement `ef54e482`, cherry-picked with `-x`. |
| `efa65db1` | Integration fix (below). |

- **Build number:** 69, unchanged (`APP_BUILD_NUMBER = 69`; `CURRENT_PROJECT_VERSION = 69` ×2).
- **Recommended TestFlight build: 69.** Upload only after acceptance.

## Codex integration review

**Canonical authority: holds.**
- Workout Complete shows only Server records: either from the commit result (`performanceRecords.status == "completed"`) or from the exact canonical `training-session` read.
- The Native PR calculation (`performanceAchievementLines`) is removed and nothing references it.
- Records are grouped only by exact `canonicalExerciseId`, in the Server's order.

**Contract compliance:** Codex touched only the Workout Logger completion files and tests. There are no Server files and none of the excluded workstreams.

**Conflicts:** `TrainingLoggerViewModel.swift` and `TrainingLoggerTests.swift`, both resolved by keeping both sides. Everything is intact:
- Save & Leave and `leftAt`;
- all of Codex's tests;
- no duplicated helpers.

**All accepted Claude behaviour is preserved:** Activity, Logged Today, Log-tab routing, notifier timing, Mark Skipped and Monthly.

**Integration fix (`efa65db1`):** Codex's relaunch recovery shows Workout Complete for an earlier workout that became durable while the app was away. When the Log tab was routing the Founder to a *different* workout in progress, that older completion hid it. The in-progress workout now takes precedence; the recovered workout is already safe on the Server. A deterministic test covers it.

## Server dependency (separately gated)

The records card needs the Server change that returns `performanceRecords`. **That change is not in production**: it was deliberately left out of `faa9151a`.

- **Against today's Server** the fields are optional, so the card is simply absent:
  - nothing errors;
  - Workout Complete shows its normal success state;
  - it costs one extra `training-session` read per completion.
- **Ready-to-deploy Server candidate:** `claude/server-records-on-prod-20260929` @ **`98534bf8`**, which is production `faa9151a` plus the records change (`aaa0d675`, re-applied).
  - Full regression: 9189/9497. The 303 failures are the same environmental set as production's; **0 new**, and 11 new tests pass.
  - Production build: exit 0.
  - No migrations, schema, dependency or infrastructure changes.
  - The only database-path change is a new SELECT-only records read in the Training navigation store.
  - The result field and the read addition are both additive.

## Validation of the final Native candidate `efa65db1`

- **Full unit suite:** **1501/1501** pass.
  - The accepted base passed 1485/1485.
  - The integration adds Codex's tests plus 1 integration test.
- **Release compile:** BUILD SUCCEEDED. The only Swift warnings are the existing ones in `BackgroundExecutionAssertion.swift`, which this candidate doesn't touch.
- **Fresh-context review of the integrated candidate: APPROVE WITH NITS, no must-fix.** It checked:
  - canonical authority;
  - late-read isolation, since start, resume, cancel and recovery all clear records;
  - that the confetti plays once per session;
  - that Reduce Motion consumes the celebration without animating, so it never replays;
  - that confetti is hidden from accessibility, the title is a header, and the overlay doesn't block Return to Log;
  - lossy decoding;
  - the merge resolution;
  - absent-Server behaviour.

  Its one low-to-medium finding, the recovered completion over the Log-tab resume, is fixed in `efa65db1`. The remaining nits (below) are deferred.
- **Codex's own validation:** 75/75 focused tests, a Release compile, and a fresh review with no high or medium findings.

## Founder acceptance checklist (Build 69 final)

1. Everything in the base candidate's checklist: Activity "so far", Logged Today Strength + Cardio, Log tab → in-progress workout, review-ready notification, Mark Skipped, Monthly cleanup.
2. **Workout Complete:**
   - *After Server `98534bf8` is deployed:* completing a workout that sets records shows a "New performance records" card with the first few records (grouped by exercise) and "+N more records", plus a small one-time confetti. There's no confetti with Reduce Motion, and none when reopening.
   - *With a session that sets no record:* success state only, no card.
3. **Relaunch:** if an earlier submitted workout finished while the app was away, opening the Logger shows its completion. Tapping Log with a different workout in progress lands in that workout.

## Decisions requested

- **A.** Accept the final integrated Build 69 (`efa65db1`), then authorize the TestFlight upload (Xcode only).
- **B.** Authorize the guarded Server deploy of `98534bf8` so the records card works. It's independent of A, but deploying it first makes Build 69's card visible from day one.

## Deferred nits (non-blocking)

- Celebration and observed-review keys build up in UserDefaults without pruning.
- The confetti view stays mounted at opacity 0 after its animation.
- "Save & Leave" stays visible during a submit (this predates the candidate).
- Plus the earlier deferred list: a cross-device time-based takeover and missing-metric guard, a duplicate Logger instance guard, and automatic refetch after a skip 412.
