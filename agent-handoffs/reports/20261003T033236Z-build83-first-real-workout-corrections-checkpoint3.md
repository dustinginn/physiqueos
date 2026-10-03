# Build 83 first-real-workout corrections — CHECKPOINT 3 (continuity; usage-limit safe)

- Task id: `build83-first-real-workout-comprehensive-correction-20261003`
- Prompt: `agent-handoffs/inbox/prompts/20261003T003500Z-build83-first-real-workout-comprehensive-correction.md` (authority main `e25fd200`; read it whole, including the final "LOCKED WATCH CONTROLS GESTURE — FOUNDER CORRECTION" section)
- Lane: Claude, Remote Control session `79959d1b`. Session `788283ca` was superseded; it used the same worktree and scratch.
- Supersedes: checkpoint 2 (`20261003T031500Z-…-checkpoint2.md`, main `49b90134`).
- Written so that Codex or a fresh agent can continue **without this conversation**.
- Status: **in progress.**
  - **Nothing has been deployed.**
  - **Production has not been mutated.**
  - **Nothing has been uploaded to TestFlight.**

---

## 1. Exact authority

| Item | Value | Durable? |
|---|---|---|
| Production Server (live) | `d0ff65965233fa44e108387f01b649a2bdb476df`, deployment `64533990-3f04-43bc-b710-a2d28dc1850e`. Sleep v3 is prospectively live on it | — |
| Native base | Build 82 `e2cbcd0cf40dca64a4c8490bf0ebd4077b2eb69c` (TestFlight delivery `f3d09d99`, Founder-installed) | — |
| **Native candidate** | branch `claude/build83-first-real-workout-corrections-20261003` @ **`abb131d9e1a4cd9eeb6c1a5caca1e1ad9e1b9c4e`** (commits `c2b171fe` → `152c813e` → `abb131d9` on top of `e2cbcd0c`). 39 files, +4,963/−614 | **Pushed to origin** |
| **Server candidate A (reviewed)** | branch `claude/build83-server-finish-observability-20261003` @ **`f91d76c0b5d21d3d2d90c73b7f815d77effee01d`** (`aa5123cc` + `f91d76c0` on top of production `d0ff6596`) | **Pushed to origin. Not deployed** |
| Server candidate B (D1/D2/D3) | branch `claude/build83-server-cardio-d1d2-20261003`, created from `f91d76c0`, worktree `~/Developer/PhysiqueOS/build83-server-20261003`. **Uncommitted work in progress** by a local subagent | **Local only. Not committed or pushed.** Being half-written, it is deliberately not pushed for checkpointing |

**D1 (Stair Stepper) and D2 (Cooldown) are NOT yet in any committed Server SHA.**
- Candidate A (`f91d76c0`) does **not** include them.
- Candidate B will carry D1/D2 plus the D3 tool, and will have a **new SHA**.
- At this checkpoint, B's uncommitted diff touches:
  - `src/domain/services/HealthKitWorkoutService.js`
  - `HealthKitCardioTrainingPresentation.js`
  - `HealthKitGraduation.js`
  - `src/application/commands/CanonicalPersistenceCommandPorts.js`
  - `scripts/operations/buildHealthKitPayload.mjs`
  - tests
- It adds these new files:
  - `src/domain/services/HealthKitWorkoutStrategicEligibility.test.js`
  - `src/application/native/HealthKitStairStepperCooldownIngestion.test.js`
  - `src/application/training/HealthKitStairStepperCooldownPresentation.test.js`
  - `src/fixtures/healthKitOct2StairStepperCooldownFixture.js`
  - `src/platform/operations/HealthKitUnsupportedWorkoutTypeRepairRunner.js`
  - `scripts/operations/healthKitUnsupportedWorkoutTypeRepair.entry.mjs`

---

## 2. Founder directives, decisions and authorizations on record

**Given directly in the assignment (binding):**
- Zero PR / performance-record events today are **EXPECTED (no PR occurred). CLOSED.** Do not investigate PR derivation.
- **DEXA → Apple Health writeback is READY/HOLD in the durable backlog and explicitly OUT OF SCOPE.** Do not implement it.
- **Sleep v3 is live prospectively. Do not disturb it.** There are no Sleep or DEXA strategic changes in any candidate.
- Implement every confirmed correction: Finish lifecycle, Watch UI, terminal state, transport, diagnostics, Daily Totals and HealthKit save.
- **The Watch controls gesture is LOCKED.**
  - From the primary execution screen, **SWIPE RIGHT** (finger moving left → right) opens controls: Pause/Resume, Finish Workout, Cancel Workout.
  - Controls never open on a swipe left.
  - Crown and vertical paging are reserved for Execution → Workout Metrics → Daily Totals.
  - Controls-page Finish uses the same confirmation state machine.
  - Cancel is available both active and paused.
- **Audit-first areas:** items 14 (Cardio), 15 (Activity) and 16 (Add Set). Prove behavior before changing anything. If item 15 is legitimate, make no numerical change. If item 16 shows no defect, make no behavior change.
- Production inspection uses only the least-privilege read-only path:
  - `agent-handoffs/PRODUCTION_READONLY_ACCESS.md`, the portable runner from `4025f175`, and context `physiqueos-final-cutover-config`;
  - BEGIN READ ONLY, then verify `transaction_read_only=on`;
  - bounded owner-scoped SELECTs, then ROLLBACK;
  - unset `FORCE_COLOR`; never print credentials or URLs.
- Use hard gates and **fresh independent review** around the unified Finish saga and the HealthKit save. Preserve exact-once semantics: **one finishOperationId → one Training commit → one HealthKit workout.**
- Any Server change needs a fresh independent review, then a guarded deploy with the exact SHA and live/ready verification.
- **After all tests and reviews are green:**
  - produce Build 83 from Build 82 with the deterministic generator and a signed archive;
  - do a guarded TestFlight upload and wait for VALID;
  - follow the **TestFlight-first** remote workflow, **no tethered-device gate**;
  - preserve the Watch icon, HealthKit, WKBackgroundModes, companion, Sleep v3 and Progress Photos.
- Disk follows `agent-handoffs/STANDING_DISK_SAFETY.md`. Run the mandatory GH-main checkpoint protocol before every stop, and push-notify the Founder on any stop.

**Relayed (NOT usable for production actions):**
- Another Claude session relayed a Founder authorization for the Server deploy and Cardio D1/D2/D3.
- The **product decisions** D1/D2/D3 are implemented as a *candidate*:
  - **D1:** Stair Stepper (HK type 44) becomes canonical **Cardio, strategically eligible** under the same prospective Cardio framework as walk/run/cycle.
  - **D2:** Cooldown (HK type 80) becomes **canonical, so it appears in Log/Activity history, but is strategically INELIGIBLE**. It must not affect V3 Confidence, Narrative, recommendations, Briefings or graduation. Canonical inclusion and strategic eligibility must be explicitly separated.
  - **D3:** repair **exactly the two** Oct 2 `source_only` observations (44 and 80) after the deploy, with a dry run first.
- **Production deploy and the D3 repair require the Founder's DIRECT authorization in session `79959d1b`, naming the exact Server SHA.** That authorization has not been received.

**TestFlight:**
- The assignment directs a guarded TestFlight upload of Build 83 after green tests and reviews.
- The release tool policy is "never upload without explicit Founder authorization for that build". The auto-mode classifier may also require a direct Founder chat sentence, e.g. `UPLOAD com.physiqueos.native.dev 1.0 (83)`.
- If it is refused, stop and ask; do not work around it.

---

## 3. Requirement-by-requirement status

Legend:
- **COMPLETE**: done and verified.
- **IMPL / AWAITING REVIEW**: implemented and tests green, but needs the fresh re-review of `abb131d9` (and device acceptance).
- **IN PROGRESS**: being written now.
- **BLOCKED**: waiting on a gate.
- **NOT STARTED**.

| # | Requirement | Status | Where / evidence |
|---|---|---|---|
| 1 | Watch finish confirmation | **IMPL / AWAITING REVIEW** | See the finish-confirmation notes below |
| 2 | Unified phone/Watch Finish: one finishOperationId and one structured lifecycle | **IMPL / AWAITING REVIEW** | See the unified-Finish notes below |
| 17 | HealthKit workout save: exactly one correlated workout for Watch Finish and for phone Finish | **IMPL / AWAITING REVIEW**. Physical proof is **Founder acceptance on Build 83** | See the HealthKit-save notes below |
| 3 | Transport recovery | **IMPL / AWAITING REVIEW** (no review findings so far) | See the transport notes below |
| 4 | Commit budgets and Server commit profiling | **Native IMPL / AWAITING REVIEW. Server COMPLETE in candidate A** (reviewed, NOT deployed) | See the commit-budget notes below |
| 5 | Recoverable Saving/Finishing UI | **IMPL / AWAITING REVIEW** | See the Saving/Finishing UI notes below |
| 6 | Network diagnostics | **Native IMPL / AWAITING REVIEW. Server in candidate A** (not deployed) | See the diagnostics notes below |
| 7 | Terminal rest | **IMPL / AWAITING REVIEW** | Rest is hidden on Finish intent, confirmed finishing and terminal states (`TrainingSessionLiveProjection.swift`; the mapper sends rest only when active/paused). The Live Activity uses the same projection. Not Yet re-anchors from the absolute anchor and replays no missed haptic |
| 8 | Return to Log propagation | **IMPL / AWAITING REVIEW** | `acknowledgeCompletion` publishes `.completionAcknowledged`, and the bridge publishes the terminal context immediately |
| 9 | Watch Done | **IMPL / AWAITING REVIEW** | A prominent Done on Workout Saved dismisses locally only: no commit, no HealthKit. Dismissals persist in order, so old summaries never resurrect. UI test passes |
| 10 | Non-scrollable execution page | **IMPL / AWAITING REVIEW** | No ScrollView. A `WatchExecutionLayout` height solver places everything below the clock (top inset = 70% of the safe-area top). Previous/Current and Completed/Up Next are kept, with large split Load/Reps and large rest. Renders checked on Ultra 49, SE 40, Series 12 42 and 46 mm |
| 10b | Bottom Complete Set | **IMPL / AWAITING REVIEW** | A capsule on the lower edge, purple primary |
| 11 | Green progress | **IMPL / AWAITING REVIEW** | The progress bar is green; primary actions stay purple |
| 12 | Metrics order and colors | **IMPL / AWAITING REVIEW** | Time, Active Calories, Total Calories, Heart Rate, each icon with a distinct accent (HR stays red/pink). Icons are tinted, not the whole cards |
| 13 | Daily Totals (third vertical page) | **IMPL / AWAITING REVIEW** | See the Daily Totals notes below |
| — | Swipe-right controls (LOCKED) | **IMPL / AWAITING REVIEW** | See the controls notes below |
| — | Crown paging | **IMPL / AWAITING REVIEW** | Vertical `verticalPage` TabView: Execution → Metrics → Daily Totals. UI test `testVerticalPagingReachesMetricsThenDailyTotals` passes |
| 14 | Cardio D1/D2/D3 | **Audit COMPLETE. D1/D2 Server IN PROGRESS (local, uncommitted). D3 tool IN PROGRESS. Deploy and repair BLOCKED on direct authorization** | §6 |
| 15 | Activity duplication audit | **COMPLETE. LEGITIMATE, no numerical change** | §5 |
| 16 | Add Set audit | **COMPLETE. No defect; closed as unable to reproduce / likely user action** | §5 |
| — | Zero PR events | **CLOSED (expected).** Not investigated, per the Founder | — |
| — | DEXA HealthKit writeback | **READY/HOLD, OUT OF SCOPE** | Untouched |
| — | Sleep v3 | **LIVE; not disturbed** | No Sleep code changed. The Sleep Evidence/Sleep v3 Native tests are in the full suite |
| — | Durable backlog update | **NOT STARTED** (done in the final report) | — |
| — | Build 83 archive, upload, VALID | **NOT STARTED** (gated on green re-review) | §8 |

**Item 1 — finish confirmation.**
- Phase `finishConfirmation` is distinct from `finishing`.
- The final-set Finish shows "Finish workout?" on the primary surface.
- "Finishing safely…" appears only after confirmation.
- Controls-page Finish reuses the same component and state machine.
- Code: `WatchWorkoutContracts.swift` (schema 3), `WatchWorkoutStore.swift`, `WatchWorkoutViews.swift`.
- Tests: Watch UI `testFinalSetFinishShowsConfirmationOnThePrimarySurfaceAndNotYetReturns` and `testControlsFinishUsesTheSameConfirmation`.

**Item 2 — unified Finish.**
- `TrainingSessionAuthority` holds `watchFinishOperationId`, minted once by `confirmPhoneFinish` / `confirmFinish`. `finishedAt` is stamped once, and the idempotency signature includes it.
- A phone Finish during a Watch request or commit joins the same operation.
- `WatchWorkoutFinishCoordinator` is the background commit owner. The phone takes the commit lock *before* it stamps the finish.
- The persisted terminal ledger (`TrainingSessionTerminalLedger.swift`, 16 records / 48 h) answers late Watch commands.
- Tests: `Build83FinishLifecycleTests` (35).

**Item 17 — HealthKit save.**
- The projection's `requiresHealthSave` makes the Watch end and save its HKWorkoutSession for a phone Finish. Watch Finish uses the same op.
- Health reports are guarded by operation, not by revision.
- Auto-save runs at most once per session.
- Only an explicit Cancel discards a Watch workout; a known finish beats a cancelled record.
- A HealthKit failure never blocks structured durability. A structured failure never duplicates the HealthKit workout, because the save is single-flight.
- Trusted Watch bundle allowlist / exact auto-link: **not enabled.** It remains a separate physical trust gate.

**Item 3 — transport recovery.**
- `CommandNetworkTransport.swift`: interactive commands get a 12 s `waitsForConnectivity` budget.
- A wait that is stuck on a satisfied path is cancelled and retried once.
- The command `URLSession` pool is recreated by generation.
- "Waiting for network" is exposed.
- The **same idempotency key** is kept on retries.

**Item 4 — commit budgets and Server profiling.**
- Native: `commitAttemptTimeouts [15, 8]` (`TrainingWriteAPI.swift`).
- Server candidate A:
  - sub-stage timings and copy-free commit comparison;
  - removed `before`/`values` aliasing;
  - **`training-session.commit.v1` body bound raised from 4 KiB to 64 KiB**; workouts of about 30+ sets would have been rejected with 413.

**Item 5 — Saving/Finishing UI.**
- Phone, after 20 s: "Still saving" / "Waiting for network", plus a same-key Retry Finish. There is no destructive Cancel; Back and Save & Leave are hidden.
- Watch, after 30 s: "Waiting for iPhone" + reason + Retry.
- Relaunch recovers: the open Logger schedules durability recovery (N5).

**Item 6 — network diagnostics.**
- Native:
  - command diagnostics ring of 256, plus a 128-entry failure ring;
  - a per-command outcome event;
  - `NetworkDiagnosticsExport` plus a You-tab share section (`NetworkDiagnosticsSection.swift`);
  - no health values or secrets.
- Server candidate A: a `native.command.received` log line with fingerprinted string identities.

**Item 13 — Daily Totals.**
- The page shows:
  1. ticking session time with seconds, from authoritative anchors and pause semantics;
  2. today's Active Calories;
  3. today's Nutrition calories.
- These come from the same `HomeWidgetSnapshotCoordinator` canonical snapshot as Home and the Widget. They travel through a separate application-context slot and are seeded from the stored snapshot. There is no Watch-side calculation and no per-second traffic.
- Whole numbers; a missing value shows "—"; stale/offline is indicated.

**Swipe-right controls.**
- A horizontal page TabView places controls to the **left** of the workout page, so a physical right swipe reveals them.
- The Watch UI test proves `swipeRight()` opens Pause/Resume, Finish and Cancel, and `swipeLeft()` does not.
- Paused keeps Resume and Cancel.

---

## 4. Test results so far (exact)

**Native `abb131d9` (current):**

| Suite | Result |
|---|---|
| Watch unit (`PhysiqueOSWatchTests`) | **26/26 pass** (19 finish-state + 7 reducer) |
| `Build83FinishLifecycleTests` + `TrainingSessionAuthorityTests` + `TrainingLoggerTests` | **197/197 pass** (35 + 88 + 74) |
| Full iOS unit suite (`-only-testing:PhysiqueOSTests`) | **1,966 tests, 1 skipped, 1 failure.** The failure is the known baseline `PeptideSupportEditorViewModelTests.testSandboxChangeDoseKeepsHistoryAndPauseResumeWorkAgainstTheFixture`, which **reproduces on Build 82** and is unrelated |
| Watch UI (`PhysiqueOSWatchUITests`) | **7/7 on `152c813e`. Re-run on `abb131d9` pending** (`abb131d9` changes Watch store state presentation) |

**Native `152c813e` (previous):**
- Full iOS unit suite: **1,963 tests, 1 skipped, 1 failure.**
  - The failure is `PeptideSupportEditorViewModelTests.testSandboxChangeDoseKeepsHistoryAndPauseResumeWorkAgainstTheFixture`.
  - It **reproduces on Build 82** as a known baseline failure. It is unrelated.
- Phone Training UI acceptance (`PhysiqueOSUITests/TrainingAcceptanceUITests`, 16 tests):
  - In suite order, 10 passed and 6 failed at "Training Logger was not available from Log".
  - **All 6 pass on a freshly erased simulator.**
  - This is the documented pre-existing order leak: the shoulders journey leaves an active workout, so Log routes into it. It failed identically at base in the 2026-10-01 workout-session-authority lane. It is not a Build 83 regression.
  - Not re-run against a Build 82 binary in this lane.

**Server:**
- Candidate A `f91d76c0`: targeted 157/157. Full unit suite (`npx vitest run --config vitest.unit.config.js`): **304 pre-existing failures, identical at base `d0ff6596`.** Those are scripts/backup/migration-client/embedded-repo tests that depend on the environment; none are in the touched areas.
- Candidate B: tests not yet reported.

**Generator / release:**
- `Scripts/generate_project.py` is deterministic: Build 83 pinned ID block `0x19FF`, Watch UI test target, `APP_BUILD_NUMBER 83`.
- The release verifier reports `1.0 (83)` OK.

---

## 5. Audit-first results (proven, read-only)

All three come from one production probe:
- the approved runner, restored byte-exact from `4025f175`, with context `physiqueos-final-cutover-config`;
- REPEATABLE READ READ ONLY, with `transaction_read_only=on` verified;
- 11 owner-scoped SELECTs, then ROLLBACK;
- runtime SHA `d0ff6596` gated.

**14. Stair Stepper and Cooldown.**
- Both were uploaded via `healthkit.observations.ingest.v1` at 2026-10-02 22:54:44Z:
  - HK type 44 (Stair Stepper), 22:38–22:49Z;
  - HK type 80 (Cooldown), 22:50–22:54Z.
- Both are stored in `healthKitObservations` as `source_only` / `unsupported_workout_type`.
- `HealthKitWorkoutService.js` canonicalizes only 50/20 (strength) and 52/37/13 (walking/running/cycling).
- Log, Training Day and Activity read only canonical workouts. **Not lost, not delayed: canonical-but-never-created, by policy.**
- Only first deliveries are canonicalized, so a repair (D3) is needed for these two.

**15. About 945 active kcal and 109 exercise minutes: LEGITIMATE.**
- One device sent 62 monotonic Activity Summary revisions, each replacing the previous one.
- The canonical day equals the latest single revision.
- Workout energy is never added (`workoutActiveCaloriesAdditive: false`).
- **No numerical change.**

**16. Add Set: no identity or race defect.**
- The deterministic test "edit current reps → Complete → set count unchanged" was added and passes.
- **No behavior patch.** Closed as unable to reproduce / likely an accidental Add Set tap.

The probe JSON is local only and is never published.

---

## 6. Cardio D1/D2/D3: Server candidate B and the D3 plan

**Status:** a local subagent is implementing it in `~/Developer/PhysiqueOS/build83-server-20261003` on `claude/build83-server-cardio-d1d2-20261003` (from `f91d76c0`). It is **uncommitted.** When it finishes, it commits locally and reports these:
- the SHA;
- file:line changes;
- where the canonical-vs-strategic separation is enforced;
- the strategic boundaries covered by tests;
- the Native compatibility verdict for Builds 82 and 83;
- the D3 dry-run shape;
- the test counts against the base export.

**Design requirements given to it:**
- **D1:** type 44 becomes canonical Cardio (`stair_climbing`), strategically eligible under the same prospective Cardio graduation framework.
- **D2:** type 80 becomes canonical for Log/Activity history but **strategically ineligible**, through an explicit separation (a non-strategic family, or a per-type strategic flag). It must be proven at every strategic read boundary:
  - graduation;
  - Weekly/Midweek/Monthly/briefing evidence;
  - confidence;
  - recommendation inputs;
  - cardio volume/strategy reads.
- Activity totals unchanged: workout energy is never added.
- **Backward compatible with Build 82 and Build 83 Native decoding.** If a new family or type would break decoding, the Server presents it through an existing Native-supported row shape. A Native change is made only if the verdict requires one.

**D3 bounded repair: prepared, NEVER executed except in tests.**
- Tool: `src/platform/operations/HealthKitUnsupportedWorkoutTypeRepairRunner.js`, entry `scripts/operations/healthKitUnsupportedWorkoutTypeRepair.entry.mjs`.
- Scope:
  - exactly two records, selected by `source_only` / `unsupported_workout_type` + activityType ∈ {44, 80} + occurrence date 2026-10-02 + owner `user_founder_001`;
  - **fails closed unless exactly those two match.**
- Dry run is the default. It prints the exact canonical records it *would* create or update.
- Apply requires explicit flags naming **both observation record ids** and the **expected deployed SHA**.
- Idempotent. It touches no other record, Activity totals, historical strategic artifact or briefing.
- Unit-tested against an in-memory store.

**Review:** not yet reviewed. It needs a **fresh independent review**, as candidate A had.

---

## 7. Independent reviews

**Review 1: Native `c2b171fe`.** Verdict: **REQUEST CHANGES** (1 blocker, 3 majors). All were addressed in `152c813e`.
- **B1 (blocker).** The background coordinator could take over the phone's own Finish commit, because stamping a finish publishes synchronously and the observer re-enters the coordinator. It also dropped supporting-evidence reconciliation.
  - **FIXED:** the commit lock is taken *before* the stamp, and the coordinator skips its own tasks.
- **M1:** a confirmed finish is frozen on the phone, with Retry as the only action. **FIXED.**
- **M2:** Health reports. **Partially fixed.** The remaining report loop was N4, fixed in `abb131d9`.
- **M3:** never discard a saved workout. **FIXED.** Its remaining hole was N3, fixed in `abb131d9`.

**Review 2: fresh re-review of `152c813e`.** Verdict: **REQUEST CHANGES.** All findings were addressed in **`abb131d9`**.

| Finding | Severity | Fix in `abb131d9` |
|---|---|---|
| **N1:** the Watch dropped a Finish or Not Yet tap that was deferred behind another command. The reply's `.active` projection cleared the local confirmation | Major | Only a phone exit from `finishConfirmation` closes it. A stale request re-asks. A deferred Not Yet presents at once and is not re-raised. Store-level deferral tests use the `commandSinkForTesting` seam (3 tests) |
| **N2:** a HealthKit save failure became terminal (Retry threw `notRunning`, the next start was blocked, and a system-ended session never saved) | Major | ending/failed sessions can be saved; the session is kept on failure (retryable); `finishInFlight`/`collectionEnded` are tracked; a system-ended session still saves a confirmed finish |
| **N3:** Discard draft was an unsafe escape hatch from a frozen finish | Major | Discard is refused while committing. A discard after a finish records `discardedAfterFinish` with its op id (ledger, contract, mapper). In `resolve`, `knownFinish` beats cancelled, so the Watch saves and does not discard |
| **N4:** a rejected Health report re-armed on every context | Minor | The rejection clears the saved-correlation marker |
| **N5:** an open Logger could dead-end on an ambiguous coordinator outcome | Minor | `noteAuthorityChange` schedules recovery; Still saving / Retry appear. Test added |
| **N6:** a Watch confirm could freeze an uncommittable finish | Minor | Authority `confirmFinish` requires completed sets > 0. The router gets a `canCommitFinish` local-validation closure. Test added |
| **N7:** `isolated deinit` on an iOS 18.0 target | Nit | Removed |
| **N8:** tombstoned every recentlyEnded id; touched attachments before acceptance; pause ignored the finish stamp | Nits | Fixed |

- Nothing was found for: two idempotency keys, a double HealthKit save, or a permanent deadlock.

**Review 3: fresh re-review of `abb131d9`.** **NOT YET RUN.** This is the next gate.

**Server candidate A `f91d76c0` review:** **APPROVE WITH NITS.** The nit (fingerprint only string identities) is fixed in `f91d76c0`.

---

## 8. Remaining steps, in execution order

1. **Native green tests on `abb131d9`.**
   - Full iOS unit suite: **DONE** (1,966 tests; only the Peptide baseline failure).
   - Watch UI 7/7.
   - Training UI acceptance on an erased simulator.
   - Re-check a Watch render or two, since presentation changed for Not Yet.
2. **Fresh independent re-review of `abb131d9`.** Use a new reviewer with no prior context, focused on the finish saga, HealthKit save and the N1–N8 fixes. Fix, then re-review, until APPROVE.
3. **Server candidate B.**
   - The subagent commits locally.
   - Verify its tests against the base export.
   - Run the Native compatibility check. If a Native change is required for Cooldown/Stair Stepper presentation, add it to Build 83 before archiving.
   - Push the branch.
   - Get a **fresh independent review** and fix until approved.
4. **Report the exact candidate-B SHA to the Founder in session `79959d1b`**, and wait for the Founder's **DIRECT** authorization naming that SHA.
5. **Guarded Server deploy, only after direct authorization.**
   - Re-verify production `d0ff6596` read-only.
   - Push the exact SHA to `combined-app-platform-cutover`.
   - `doctl apps update <app> --spec` with `PHYSIQUEOS_GIT_SHA` / `BUILD_ID` bumped on web **and** worker.
   - `create-deployment --force-rebuild`.
   - Verify `source_commit_hash`, live/ready, and a log `gitSha` equal to the exact SHA.
   - Use context `physiqueos-production-deploy`; app id is in `prod-ops` memory. Never `cancel-deployment`; supersede with force-rebuild.
6. **D3 repair, only after direct authorization.**
   - Dry run against production through the approved path.
   - Verify that exactly the 2 records are selected and the would-create output is correct.
   - Apply with both ids and the deployed SHA.
   - Read-only verification:
     - two canonical workouts exist;
     - Stair Stepper is cardio-eligible;
     - Cooldown is canonical but strategically ineligible;
     - Activity totals are unchanged (945/109 stays);
     - no other record changed.
7. **Build 83 archive.**
   - Regenerate with `python3 ios/Scripts/generate_project.py` (deterministic; verify no pbxproj diff).
   - Run the release verifier: expect `1.0 (83)`.
   - Signed Release archive with iPhone + Widget/Live Activity + Watch.
   - Verify the Watch icon, HealthKit entitlements, `WKBackgroundModes` (workout-processing), companion, Sleep v3 stage-capable decoding, and Progress Photos.
   - Copy the archive into `~/Library/Developer/Xcode/Archives/<date>/`.
8. **TestFlight upload.**
   - `~/.physiqueos-release/bin/physiqueos-asc-upload` dry run first.
   - Then `--execute --confirm "UPLOAD com.physiqueos.native.dev 1.0 (83)"`, with Founder authorization; see §2.
9. **Wait for VALID** (delivery id).
10. **Durable backlog update** (`PHYSIQUEOS_PRODUCT_BACKLOG.md`):
    - Build 83 delivery;
    - D1/D2/D3 state;
    - Activity/Add Set closures;
    - acceptance checklist;
    - DEXA HOLD and Sleep v3 unchanged.
11. **Final report** via the gated publisher. Push-notify the Founder.
12. **Founder physical acceptance on Build 83 (TestFlight):**
    - Finish confirmation from both the final set and the controls page; Not Yet;
    - Watch Finish and phone Finish each save **exactly one** HealthKit workout and one Training session;
    - bounded finish timing and recovery (Still saving / Retry);
    - rest stops on Finish;
    - Done dismisses the summary;
    - fixed execution screen with no scrollbar, green progress, bottom Complete Set;
    - metrics order and colors;
    - Daily Totals;
    - swipe-right controls; Crown paging;
    - Stair Stepper / Cooldown appear as appropriate (after the deploy + D3);
    - no Activity inflation.

---

## 9. Resume commands (no secrets)

**Worktrees:**
- Native: `~/Developer/PhysiqueOS/build83-first-real-workout-corrections-20261003` (Xcode project in `ios/`).
- Server: `~/Developer/PhysiqueOS/build83-server-20261003`.
- Main-only files: `git show origin/main:<path>`.

**Simulators:**
- iPhone `A8157897-95ED-4480-9150-6136652A6519`.
- Watch Ultra 49 mm `BF8FF7F9-29E1-4B5E-A550-D683BBDE3118`.
- Watch SE 40 mm `C7B60531-E16B-49D5-9818-AC2933386AE5`.
- Watch S12 42 mm `8E51BA0A-…`; S12 46 mm `4AB33246-…`.

**Builds and tests.** Use any DerivedData path, e.g. `$DD`.

Build iOS for testing:
```
xcodebuild build-for-testing -project PhysiqueOS.xcodeproj -scheme PhysiqueOS \
  -destination "platform=iOS Simulator,id=<iPhone>" -derivedDataPath $DD
```

iOS unit tests:
```
xcodebuild test-without-building -project PhysiqueOS.xcodeproj -scheme PhysiqueOS \
  -destination "platform=iOS Simulator,id=<iPhone>" -derivedDataPath $DD \
  -only-testing:PhysiqueOSTests
```
- Targeted selection: `-only-testing:PhysiqueOSTests/Build83FinishLifecycleTests -only-testing:PhysiqueOSTests/TrainingSessionAuthorityTests -only-testing:PhysiqueOSTests/TrainingLoggerTests`.
- Phone UI: `-only-testing:PhysiqueOSUITests/TrainingAcceptanceUITests`. Run `xcrun simctl erase` first.

Watch (`-scheme PhysiqueOSWatch -destination "platform=watchOS Simulator,id=<Ultra>"`):
- `-only-testing:PhysiqueOSWatchTests`
- `-only-testing:PhysiqueOSWatchUITests`

Watch renders: launch the Watch app with `-watchFixture <name>`.
- Fixtures: `normal`, `paused`, `final-set`, `final-workout`, `summary`, `controls`, `controls-paused`, `finish-confirmation`, `finish-confirmation-waiting`, `finishing-waiting`, `daily-totals`, `daily-totals-stale`, `daily-totals-missing`.
- Screenshot with `xcrun simctl io <id> screenshot`.

Server unit tests: `npx vitest run --config vitest.unit.config.js <paths>`. Never use the default vitest config.

**Gotchas:**
- `xcodebuild test` can hang after `Test Suite 'All tests'`. Key on that line, then kill the process.
- Key on `Test Suite 'All tests'`, not the first "Executed" line.
- `SwiftUI.TimelineView` is shadowed by `Presentation/Evidence/TimelineView.swift`.
- Container accessibility identifiers need `.accessibilityElement(children: .contain)`.
- Booted simulators download about 1 GiB of assets; erase them after renders.
- Check `uptime` / `vm_stat` before treating a flaky failure as a code bug.
- Stay above the disk floor in `STANDING_DISK_SAFETY.md`.

---

## 10. Production and safety statement

- Production Server is `d0ff6596` / deployment `64533990`, **unchanged by this lane.**
- **No deploy, no production write, no repair, no TestFlight upload has occurred.**
- Production access so far: one read-only probe (§5).
- This report contains no secrets, credentials, database URLs, production exports or Founder health values.
