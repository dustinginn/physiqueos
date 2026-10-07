# Build 91 Native integration candidate — 3697951c (report-only)

- **Task:** `agent-handoffs/inbox/prompts/20261007-build91-guarded-native-integration.md` (prompt commit `e7b717f6`), with the mandatory storage addendum `4bcfe4d8`.
- **Task id:** `build91-guarded-native-integration-20261007`.
- **Agent:** Claude, one Remote Control session, one managed worktree. No child chats, subagents or extra worktrees.
- **Status:** INTEGRATED AND VALIDATED. Ready for a Founder-authorized Build 91 release bump.
- **Not done (by instruction):** no bump (still 1.0 (90)), no archive, no TestFlight, no Server change, latest.json/latest.md unchanged.

## Candidate

| | |
|---|---|
| Branch | `claude/native-build91-integration-candidate-20261007` (pushed with a normal non-force push; remote verified) |
| Integrated SHA | **`3697951cb530a6f7d2593e92de76fced9613eaef`** |
| Base | Shipped Build 90 `32baf1d5f43120cd07088df1210e1dc84ed26a78` |
| Version | 1.0 (90). `APP_BUILD_NUMBER = 90`; no bump. |

History is three `--no-ff` merges on Build 90.

| Merge | Input (approved tip) | Commit actually merged | Excluded |
|---|---|---|---|
| `9012c249` | Evidence Option A `a399387b` | `a44a8a12` (`72ff7353` + `a44a8a12`) | `a399387b` proof boards (`agent-handoffs/artifacts/build91-evidence-option-a-20261007/`, artifacts only) |
| `f04f4fa8` | Operating Plan + Watch `b944ad1e` | `4eb1b07a` (`0bc2af7c`, `bc34d790`, `76bd0097`, `9861b0a2`, `4eb1b07a`) | `b944ad1e` proof package (`agent-handoffs/artifacts/build91-op-watch-implementation-20261007/`, artifacts only) |
| `3697951c` | Universal Priority Skip `a379fa12` | `a379fa12` exactly | — |

All three inputs fork directly from `32baf1d5`, and every reviewed code commit is preserved with its exact SHA. The two excluded tip commits only add files under `agent-handoffs/artifacts/`. No report/artifact history, no Server commits and no Build 92 Training Variant work is reachable from the candidate.

The change set is 74 files, all under `ios/`.

**Union verification (scripted):**
- Every one of the 72 files changed by only one lane is byte-identical to that lane's tip.
- No file changed that no lane changed.
- No commit matches variant/Build 92.

## Conflict resolution

There were no textual conflicts; git auto-merged everything. The two known overlaps were reviewed semantically.

1. **`Presentation/Home/PriorityDetailView.swift`**
   - OP's `navigate(_:from:)` crumb wrapper is kept on all three OP-bound actions: evidence action ("View DEXA Appointment" / "Upload Photos"), continue, and paused "Go to …".
   - Skip's universal `skipControl` renders under every template whose occurrence has a Server `canonicalSkipCommand`, including morning evidence, photos and DEXA.
   - The DEXA detail therefore shows **both** the "‹ <priority title>" crumb route to Next DEXA Scan and Mark Skipped.
   - The Weight mini-buttons (`onNavigate`) are base behavior, untouched by either lane.
2. **`PhysiqueOSUITests/FoamRollingPriorityDetailUITests.swift`** — both expectations are kept:
   - Skip's variant matrix: `markSkipped` present on supplement, morning, photos and DEXA; absent on morning-completed, paused, completed and skipped. Also the 44 pt Skip touch target.
   - OP's You → "Your Operating Plan" landing assertion.
   - The merged test passes (`FoamRollingPriorityDetailUITests` 14/14).

There were no other overlaps, no other conflicts, and no product behavior change beyond the three approved candidates.

## Gates

All gates ran sequentially on the exact `3697951c`, using dedicated lane simulators (iOS 27.0 / watchOS 27.0) and one lane DerivedData.

| Gate | Result |
|---|---|
| Generator determinism | Two regenerations byte-identical (`1ed3fd6c…`) and identical to the committed project |
| `git diff --check 32baf1d5..3697951c` | Clean |
| Focused integration unit (29 classes) | **1023 / 0** (1 skipped) |
| Full `PhysiqueOSTests` | **2198 / 0** (1 skipped) |
| Watch unit, 49 mm Ultra 3 and 42 mm S12 | **70 / 0** at each size |
| Watch UI, 49 mm and 42 mm | **9 / 10** at each size. Only the baseline `testFinalSetFinish…` failed (see below). |
| iPhone UI, relevant classes (Priority Detail/Skip, OP redesign, Evidence pages, Energy/Recovery, Build 90 regression, Goals) | 46 tests. 44 passed in-run; 2 timing failures passed on isolated rerun (see below). **46 / 46 after rerun.** |
| iPhone UI, remaining classes (Training acceptance, Logger parity, Build 89, Evidence intake) | **37 / 0** |
| iPhone UI total | **83 / 83**, two of them on targeted rerun |
| Generic iOS Release build (`CODE_SIGNING_ALLOWED=NO`) | BUILD SUCCEEDED |
| `verify_release_configuration.py` | OK: 1.0 (90), AppIcon, HealthKit app-only, matching App Group, Workout Live Activity + Home widget |
| Release seam scan (app, Watch, widget extension) | **0** `-physiqueos.` flags, **0** `-watch*` seams, **0** review/fixture/`op:`/`operatingPlanReviewPath`/`resetForTesting` hits |

**Focused coverage, by area**
- **Cross-lane Priority Detail:** `PriorityReadModel`, `PriorityOccurrenceCalculator`, `FoamRollingPriorityDetailUITests`.
- **DEXA route:** `OperatingPlanReadModelTests`, `FounderServerAPITests`, `DEXA*`, `OperatingPlanRedesignUITests`, `EvidencePhotosDEXAUITests`.
- **Evidence pages:** `Evidence*`, Energy, Recovery/Sleep, Activity, Nutrition, Weight and Photos read models, plus the Evidence UI classes.
- **Watch haptic/footer:** `TrainingSessionAuthorityTests`, `WatchWorkoutTransportTests`, `WatchWorkoutFinishStateTests` (ready-cue decision), and Watch navigation UI at both sizes.
- **Skip, Fadogia and evidence:**
  - `HomeReadModelTests` (Fadogia actionable skip);
  - `CompletionFeedbackAndNotificationCapabilityTests` (Fadogia notification skip);
  - `PriorityNotificationSchedulerTests`;
  - `MorningCheckInModelTests` (scheduled-evidence skip vs recovery-only items).

### Known baseline issues, kept separate

- **Watch UI `testFinalSetFinishShowsConfirmationOnThePrimarySurfaceAndNotYetReturns`** (`WatchWorkoutNavigationUITests.swift:89`): the known no-WCSession harness gap. It is identical on Builds 88, 89 and 90 and in the OP/Watch lane (9/10). It is not a candidate regression.
- **`EnergyRecoveryRedesignUITests.testRecoveryBackLabelsFollowTheRealParentAndAllNightsPages`** (line 1251): failed in the long run, passed on isolated rerun. This is pre-existing: it reproduces on the Build 90 base (XCUI scrolls "See trends" under the Evidence top inset), and Build 90 integration saw the same pass-on-rerun.
- **`Build90FounderSelectedUITests.testHandoffReadyWaitsTruthfullyAndDismissesOnlyOnWatchStart`** (line 1390, an 8 s "Started on Watch" wait): failed once and passed on isolated rerun.
  - It failed while machine load was **106** with about 80 MB of free memory (another user's Safari, system daemons).
  - The only lane change on this path is the additive optional `preparedAt` in the Watch projection, and nothing on the iPhone handoff path reads it.
  - Classified as load-induced timing, not a regression.

## Server compatibility (read-only)

No production writes and no Server change.

- **Live production:**
  - `GET /api/v1/health/live` and `/ready` → `buildId physiqueos-738ce668-20261007`, ready on all 9 checks;
  - read-only doctl lookup → active deployment `f0f1d3b4-8b95-4bc5-85ce-739a4fd0e255` **ACTIVE 9/9** (updated 18:58:12Z).
- **Universal Skip contract, Native `a379fa12` vs Server `738ce668`: match.**
  - Native requires `priority.skip.v1` `{commandType, expectedVersion, payload{priorityId, occurrenceDate}}`. That is exactly `prioritySkipCommand()` in `ReminderOccurrenceCompletion.js`.
  - Native reads it from `skipCommand` on Priority Detail (`PriorityDetailService`) and from Home focus items (`DailyFocusService.skipCommand`), with `notificationAction.skipCommand` as the fallback.
- **Morning Check-In:** Native reads `evidenceRequired`, `evidenceType`, `statusLabel`, `primaryAction{label, href}` and the kinds `execution_reconciliation` / `evidence_recovery`. These match `MorningEvidenceRecoveryService` at `738ce668`.
- **Next DEXA Scan is Native-only.** It reads the existing `operatingPlanStrategy("briefings", id)` landing destination and the Coaching Updates detail `editor.dexa` (`CoachingUpdatesEditorService`, already in production). There is no new Server command.
- **Evidence Option A and the Watch footer/haptic are presentation-only.** `preparedAt` is an additive optional Watch-transport field (phone → Watch); no Server involvement.

## Storage (addendum `4bcfe4d8`)

| Point | Free on /System/Volumes/Data |
|---|---|
| Start of task (98% used) | ≈ 11–12 GiB (`df -h` 12Gi, then 11Gi) |
| After pre-flight cleanup | 13.66 GiB |
| Lowest during gates | 7.58 GiB (relevant iPhone UI; watchdog floor 5 GiB never hit) |
| **End of task** | **16.16 GiB** |

**Removed**
- **Codex Universal Skip Native lane's completed, idle, regenerable DerivedData:** `/private/tmp/physiqueos-universal-skip-{derived,release,tests}`. Removed `Build/`, `Index.noindex`, `CompilationCache.noindex`, `ModuleCache.noindex`, `SDKExplicitPrecompiledModules`, `SDKStatCaches.noindex`.
  - About 2.3 GiB.
  - Verified first: WorkspacePath was PhysiqueOS, no open files, last write 09:33.
  - Its `Logs/` xcresults (181 MB) and `info.plist` were **kept**.
- **`B90 iPhone 17 Pro` simulator `6E1B5F1B`**, shut down: deleted **with explicit Founder approval in chat**.
  - The Build 90 lane is shipped; the simulator was last used by the completed Codex Skip test run at 09:33.
  - `du` showed 5.1 GiB, but the net reclaim was small: simulator data is largely APFS clones of the runtime.
- **This lane's own artifacts, after results were captured:**
  - Release DerivedData;
  - the dedicated `B91 Int` iPhone 17 Pro, Watch Ultra 3 49 mm and Watch S12 42 mm simulators;
  - the lane Debug DerivedData (1.1 GiB).
  - Gate text logs are kept in the job scratch (4.6 MB).

**Intentionally retained (not touched)**
- Every git repository and worktree.
- Archives (Builds 85–90 in `~/Library/Developer/Xcode/Archives`, 661 MB), signing material, receipts, boards and reports.
- Booted simulators: `B91 OP iPhone`, `LaneB Briefings`, `B90 Watch S12 42mm`, `B90 Watch Ultra3 49mm`.
- `B91 Evidence iPhone 17 Pro`: shut down, but its Evidence session is still alive.
- Empty default Watch simulators, simulator runtimes and SDKs.
- Other agents' `/private/tmp` content (≈ 4 GiB of Codex audit/report scratch, ambiguous ownership).
- `~/.claude/jobs/*/tmp` of other lanes.

No processes were killed; there was no `git clean`, cache purge or worktree prune.

**Storage risk for the next lane**
- Other sessions consumed about 1–4 GiB during this run, and load spiked to 106.
- The release lane needs an archive (≈ 0.7 GiB retained) plus post-bump unit/Release gates. Start it with ≥ 12 GiB free and re-check between gates.
- The remaining large shut-down simulator (`B91 Evidence`, ≈ 3.4 GiB) can be reclaimed once that Evidence session ends.

## Release readiness

**READY FOR BUILD 91 RELEASE BUMP**, which is a separate Founder authorization:
1. `APP_BUILD_NUMBER = 91` and `CURRENT_PROJECT_VERSION` ×8 via `generate_project.py`.
2. The `TrainingLoggerTests` build pin.
3. Regenerate.
4. Post-bump unit, Watch unit, verifier, clean Release and seam gates.
5. Archive from `3697951c` + bump.
6. Guarded API-key upload, then latest.* only after delivery VALID (`--release-authority`).

## Physical-device acceptance still required (after TestFlight)

1. **Evidence Option A:** hub and every Evidence page in Mineral and Dark. Shared neutral surfaces, per-domain accent and icon, contrast of Training/Nutrition/Activity inks.
2. **Operating Plan:** OP-A–D chrome and crumbs; Peptides; Tracking; Supplements; You → Operating Plan.
3. **Next DEXA Scan:**
   - Home DEXA priority → "View DEXA Appointment" → Next DEXA Scan with a "‹ <priority>" crumb;
   - Edit opens the Coaching Updates editor at the DEXA section;
   - save, and a stale save fails closed.
4. **Watch:**
   - the Mineral panel footer is not clipped on the real Watch size;
   - exactly one truthful "ready" haptic per genuine preparation;
   - no cue on relaunch or for a stale (> 10 min) preparation.
5. **Universal Skip:**
   - Mark Skipped on Home focus tile/card, Priority Detail (supplement such as Fadogia, peptide, Foam Rolling, morning evidence, Photos, DEXA), the notification Skip action, and Morning Check-In scheduled-evidence items;
   - Skip never fabricates evidence;
   - recovery-only items have no Skip;
   - completed/skipped occurrences show no Skip;
   - Server confirms (`priority.skip.v1`).
6. **Cross-lane:** the DEXA Priority Detail shows both View DEXA Appointment (OP crumb) and Mark Skipped.

## Safety

- No production writes: Server checked only by read-only health GET, doctl read and source comparison.
- No Server deploy or mutation; no secrets in this report.
- Pushed: the candidate branch only, plus this new report via the guarded report-only publisher. latest.json and latest.md are unchanged (still Build 90 `32baf1d5`).
