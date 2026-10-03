# Build 83 first-real-workout corrections — IN-FLIGHT STATUS SNAPSHOT (observer)

- Purpose: a Founder-requested quick status for ChatGPT. **This is not the Build 83 lane's own report**, and the lane was **not** stopped or interrupted.
- Observer: the Claude Build 82 incident session, read-only observation of the lane's worktree, local branches and scratch logs.
- Lane:
  - background Claude session "PhysiqueOS Build 83 First Real Workout Corrections" (bg id `788283ca`), Extra High effort, launched 2026-10-03 ~00:44Z;
  - status at snapshot: **busy, still running tests**.
- Task: `agent-handoffs/inbox/prompts/20261003T003500Z-build83-first-real-workout-comprehensive-correction.md` (authority main e25fd200, including the locked swipe-right controls correction)
- Snapshot time: 2026-10-03T02:45:58Z

## Why this snapshot exists

The lane drafted its own **Checkpoint 1** at ~02:00Z, but could not publish it to main. The Claude Code auto-mode permission classifier refused its guarded **production Server deploy** and then refused most later shell actions, including the GitHub publication. The facts below summarize that unpublished checkpoint, which is sanitized, plus what was observed live afterwards.

## Authority (reverified by the observer, read-only)

- Production Server: still `d0ff65965233fa44e108387f01b649a2bdb476df`, deployment `64533990` ACTIVE, web and worker on the same SHA, no deployment in progress. **Nothing has been deployed.**
- Native base: Build 82 `e2cbcd0c`.
- Native candidate: local branch `claude/build83-first-real-workout-corrections-20261003` @ `c2b171fe`, a WIP commit with 37 files and +4,134/−555 lines, plus 36 further uncommitted files. **Not pushed.**
- Server candidate: local branch `claude/build83-server-finish-observability-20261003` @ `f91d76c0` (base `d0ff6596`). **Not pushed, not deployed.**
- TestFlight: no Build 83 archive and no upload yet.

## Audit-first results (from the lane's checkpoint; proven, no speculative patches)

The lane used one approved read-only production probe: REPEATABLE READ READ ONLY, `transaction_read_only=on`, 11 owner-scoped SELECTs, then ROLLBACK.

- **14. Stair Stepper / Cooldown: stored, then excluded by mapping by design.**
  - Both were uploaded by the Watch Ultra and stored as raw `healthKitObservations` (`source_only`, `unsupported_workout_type`).
  - Server canonicalizes only strength (50/20) and walk/run/cycle (52/37/13). Stair Stepper is 44 and Cooldown is 80.
  - Log, Training Day and Activity read only canonical workouts, so both are hidden. They are not lost, delayed or failed uploads.
  - Today, canonical creation is also strategic eligibility, so showing them is a **product-policy decision** (below). Oct 2 would also need a guarded repair, a production mutation.
- **15. Active calories (~945) and exercise minutes (~109): LEGITIMATE. No numerical change.**
  - The canonical Activity day equals the single latest Apple Activity Summary revision (62 monotonic revisions from one device, each replacing the last).
  - Workout energy is never added on top, and there is no competing manual day.
  - The late increase matches the Stair Stepper + Cooldown.
  - Unproven Apple-side observation: the never-ended Build 82 Watch workout session may have let Apple credit extra post-workout exercise minutes. That is not PhysiqueOS duplication, and Build 83 ends the session at Finish.
- **16. Add Set: no race or identity defect. Closed as unable to reproduce / likely user action.**
  - Sets have stable ids. Edit and Complete never add sets. Add Set pre-fills the edited values, so an accidental tap looks like a duplicate.
  - Deterministic test added; no behavior change.

## Implemented in the local candidates (per lane checkpoint)

- **Finish lifecycle:**
  - wire schema v3 (a mismatched v2/v3 pair fails closed);
  - an explicit `finishConfirmation` phase, so "Finishing safely…" never appears before confirm;
  - the Watch shows confirmation on the primary surface, and controls Finish uses the same state machine;
  - **one `finishOperationId`** minted by the first confirmed Finish from either device;
  - a phone Finish ends and saves the Watch HealthKit workout at the authoritative `finishedAt`;
  - concurrent Finish joins the existing operation; one commit owner;
  - a persisted terminal ledger, so a committed session is never answered with a cancelled terminal;
  - rest hidden and haptics stopped on Finish intent (Watch + Live Activity), with Not Yet restoring rest from its anchor;
  - Return to Log publishes to the Watch immediately;
  - Watch summary Done is local only;
  - phone "Still saving" after 20 s with same-key Retry and no Cancel; Watch "Waiting for iPhone" plus Retry after 30 s; relaunch recovery.
- **Transport and budgets:**
  - command connectivity wait bounded to 12 s;
  - a waiting task on a satisfied path is cancelled and retried once on a fresh session;
  - the command session is recreated after failures;
  - "Waiting for network" UI;
  - Training commit attempts go from 3 s / 1 s to 15 s / 8 s;
  - diagnostic rings grow 64 → 256, plus a failure ring and per-command outcome events;
  - Founder export: You → Founder Production → Network diagnostics → Share (paths, timings and codes only).
- **Watch UI:**
  - a non-scrolling execution page with legibility floors;
  - an edge-capsule Complete Set;
  - a green progress bar;
  - Metrics order Time / Active / Total / Heart Rate with distinct icon accents;
  - a new third Crown page, **Daily Totals** (local ticking session time plus canonical Active and Nutrition calories via application context);
  - **controls reached by a physical SWIPE RIGHT**, with Crown paging Execution → Metrics → Daily Totals;
  - renders on Ultra 49, SE 40, and Series 12 42 and 46 mm.
- **Generator:** a pinned Build 83 id block, a watchOS UI test target, build number 83, byte-deterministic. The release verifier passes "1.0 (83)".
- **Server f91d76c0 (not deployed):**
  - a `native.command.received` start log (fingerprints only, `requestId`-joined);
  - the `training-session.commit.v1` body limit goes from 4 KiB to 64 KiB, because workouts of about 30+ sets would have hit 413;
  - two clearly-safe commit hot-spot copies are removed;
  - sub-stage timings.

## Tests and reviews

From the lane's checkpoint:
- **Server:**
  - targeted 196/196 and 554/554;
  - full unit suite 304 failed / 9,610 passed / 5 skipped, the identical failing set at base;
  - fresh independent review **APPROVE WITH NITS**; nit 1 fixed in f91d76c0; targeted rerun 157/157.
- **Native at checkpoint time:** not yet green on the final candidate. The fresh independent Native review of the finish saga and HealthKit save was still running.

Observed live afterwards, from the lane's scratch logs, **not yet interpreted by the lane**:
- **02:22Z, Watch test run:** 13 tests, 0 failures, `TEST EXECUTE SUCCEEDED`. That covers the Watch interaction/UI tests (swipe-right controls, vertical paging, final-set confirmation, Done), which had failed before the layout rework.
- **02:24Z, full iOS unit suite:** 1,963 tests, 1 skipped, **77 assertion failures in 24 test cases**:
  - 22 `TrainingLoggerTests`;
  - 1 `NetworkFailureDiagnosticsTests`, matching the intended ring-cap change;
  - 1 `PeptideSupportEditorViewModelTests`, matching a previously reported unrelated failure.

  The machine load average peaked at ~33–40 during this window. The lane was running another focused `xcodebuild test-without-building` at snapshot time, so it is presumably working through these. **Treat Native as NOT green.**

## Blockers and decisions for the Founder

1. **Authorization (required for the lane to finish).**
   - The auto-mode classifier refused the guarded production deploy of Server f91d76c0 and, for a time, other shell actions.
   - The lane asks for an explicit Founder chat sentence in the lane, for example: *"I authorize deploying Server f91d76c0 to production and continuing Build 83 through TestFlight upload."*
   - Alternatively, add a permission rule.
   - Note: Native Build 83 does not need the Server deploy to be functionally correct, unless the >4 KiB commit-body limit matters for large workouts. The lane chose deploy-first.
2. **Cardio product policy (item 14).**
   - **D1:** map Stair Stepper (44) to canonical Cardio, which is strategically eligible like walk/run/cycle. The lane recommends this.
   - **D2:** show Cooldown (80) in Log/Activity as non-strategic. This needs a canonical-vs-eligibility boundary design.
   - **D3:** guarded repair of the two Oct 2 `source_only` observations after D1/D2.

## Remaining steps

The lane's plan after authorization:
1. Guarded deploy of f91d76c0 (exact SHA plus live/ready).
2. Re-run Watch/iOS suites to green.
3. Close the Native review.
4. Signed Build 83 archive, then guarded TestFlight upload, then VALID.
5. Final report and backlog update on main.

## Safety / no-mutation (observer)

- The observer made no production writes. The only production access was one read-only control-plane `apps get`. No commands were sent, nothing was deployed or uploaded, and the lane was not interrupted.
- This report contains no secrets, credentials, production exports, raw Health values or set-level workout data.
