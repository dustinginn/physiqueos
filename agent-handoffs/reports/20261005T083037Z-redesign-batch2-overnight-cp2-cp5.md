# Redesign Batch 2: overnight Checkpoints 2–5 (morning review index)

Task id: `redesign-batch2-implementation-20261005`

Status: **Checkpoints 2–5 are ready for morning Founder review. STOPPED.**
- No TestFlight upload.
- No build-number bump.
- No production mutation.

Agent: Claude, in the existing Batch 2 Remote Control chat. A single RC worktree was used throughout: no EnterWorktree and no secondary worktree.

Generated (UTC): 2026-10-05T08:30:37Z

## Authority

- **Overnight override:** `a7c997ae511e46fb9611b4a86b96516768313556`.
- **Governing prompt:** `841190297b1dfd430c3489d7c8341037b201e851`.
- **Checkpoint 1:** ACCEPTED (`4926912d`).
- **Native base:** Build 87 `f66c7fc690b1b61094e620791ee2d4a40caf3799`.
- **Locked utility package:** `origin/codex/utility-surfaces-design` @ `ca088e80`, plus the Founder Done-control correction `5b47063b`.

## Four review packages

Each package README states the exact SHA, the exact locked references, the Dark and Mineral comparisons, the measurements, the focused tests and every explained difference. **Start each with `primary-mobile-review-board.png`.**

| # | Scope | Native SHA | Locked refs | Package |
|---|---|---|---|---|
| 2 | Active workout and set entry | `0d59b45e63071ad1e0ac825eb45bf82fed3a3d90` | L5, L5B, L6, L7, L8, L10 + Done correction | `agent-handoffs/artifacts/redesign-batch2-cp2-active-workout-20261005/` |
| 3 | Logger entry and exercise selection | `6d79f057385e9cf9a8258c6bb1868c9968d04fba` | L1–L4 | `agent-handoffs/artifacts/redesign-batch2-cp3-entry-selection-20261005/` |
| 4 | Review, finish and complete | `7a422a98782db58cf77ffdac8fcd420da554fba3` | L11, L12, L14, L15, L16 | `agent-handoffs/artifacts/redesign-batch2-cp4-review-finish-20261005/` |
| 5 | Workout Match (`workoutReconciliation` branch only) | `79a1a33d9113e05522e3369999f887a61361abf8` | L13 | `agent-handoffs/artifacts/redesign-batch2-cp5-workout-match-20261005/` |

**How the captures were made:**
- Every package uses real iPhone 17 Pro simulator captures (iOS 27, status bar fixed at 9:41) in Dark and Mineral Light.
- They are driven by `LoggerParityCaptureUITests` sandbox journeys on a clean install.
- Each sits beside the exact locked PNG.
- Geometry was measured with column/box segmentation, and amplified diff panels are included.

**Parity results:**
- Box heights and internal gaps are within 0.7 pt on every measured element.
- Two exceptions are each explained in their package README:
  - CP4 records field: 165.0 vs 167.7 (glyph strut);
  - CP3 create form: +5.3 pt, from the canonical candidate line.
- Every Logger color is a shared redesign token.

**What D2 means for the finish legs:**
- The PhysiqueOS leg always shows.
- The Apple Health leg appears only for a Watch-recorded HealthKit workout.
- The operation row appears only once a finish operation id exists.

**DEBUG-only review seams:**
- **What they cover:** states the sandbox cannot reach. These are the finish saving / waiting / retry states, Server records, the possible-match candidate, and the Workout Match fixture.
- **How they work:** they set presentation state only and never write to the authority.
- **Release:** strings scan of the Release binary finds none of the seam identifiers.

## Server D1 (typed Log provenance)

**NOT DEPLOYED.**
- **Blocked:** the overnight deploy attempt hit this session's production-deploy permission gate before any mutation.
- **No workaround** was attempted, per the override's fallback rule.
- **State:**
  - Production remains `27dad44a1f63d68b53f23e51152a10a5d04968e6`, deployment `99188a9e` ACTIVE.
  - Web and worker source are both `27dad44a`; `/api/v1/health/live` and `/ready` both return 200 (re-checked 2026-10-05T08:30:37Z).
  - The deploy branch `combined-app-platform-cutover` is still `27dad44a`.
- **Candidate:** `c7c99347a520d13fd344fe89b6b1398877cdd255` (branch `claude/log-sources-provenance-server-20261005`), tested with no new failures.
- **Effect today:** Native falls back safely. Sources stays hidden and the legacy caption is shown until the Server ships the typed contract.
- **To deploy:** a direct Founder chat authorization naming the exact SHA.

## Final integrated Native candidate

**`49733300672c0b52a06a2b3ee5435de49b76fd15`**, on branch `claude/redesign-batch2-log-logger-20261005` (pushed, not merged, not uploaded). It integrates the following, in order:

1. Build 87 `f66c7fc6`, with accepted Batch 1 `c4a74ad0`.
2. CP1 `b540b323` (accepted).
3. You/Settings full-row tap fix `bb6a6584` (**integrated**).
4. CP2 `0d59b45e`, CP3 `6d79f057`, CP4 `7a422a98`, CP5 `79a1a33d`.
5. Accepted Home correction `49e48f1e`, cherry-picked as `49733300` (**integrated**: no conflicts, generator byte-stable).

Build 87 Watch, HealthKit, Foam, appearance, widget and Live Activity behavior is untouched. The overnight work makes presentation-only changes to the Logger and Log views, plus additive DEBUG seams.

## Final gates (on `49733300`)

| Gate | Result |
|---|---|
| Full Native unit suite (`PhysiqueOSTests`, 2014 tests) | 2013 pass, 1 skipped, **1 failure: pre-existing `PeptideSupportEditorViewModelTests:616`** (tracked peptide fixture defect; not fixed, by instruction). This run covers `TrainingSessionAuthorityTests`, `Build83FinishLifecycleTests`, `TrainingLoggerTests`, `TrainingSessionLiveProjectionTests`, the Live Activity suites, `TrainingRestPreferenceTests`, `AppTabTests`, `LogReadModelTests`, `FounderServerAPITests`, `HomeWidgetTests`, `PhotoProcessingUXTests`, `SharedUITests`, `LoggingSandboxTests` and `WatchWorkoutTransportTests`. The 1 skip is `RecoverySleepReadModelTests` live Founder capture (environment-gated). |
| Watch unit suite (`PhysiqueOSWatchTests`) | **47 tests, 0 failures.** |
| Generic iOS Release compile (app + Watch + Live Activity + widget graph) | **BUILD SUCCEEDED**. No DEBUG review seam strings in the Release binary. |
| Logger parity journeys (CP2–CP5, Dark + Mineral) | **8/8 pass** (`LoggerParityCaptureUITests`, clean install). |
| Appearance / You-Settings UI (`FoamRollingPriorityDetailUITests`) | **9/9 pass**, including `testYouAndSettingsNavigationRowsActivateAcrossTheWholeRow` and the Home physical-parity test. |
| `TrainingAcceptanceUITests` | 16 run, **9 failures, an identical set on Build 87 `f66c7fc6`** (full suite run on both trees, clean install). None are new.

- **6 Logger journeys fail only because of suite order:** a live workout left by an earlier journey triggers the canonical Log-tab redirect. They pass when run alone on a clean install, on both the candidate and Build 87.
- **3 Briefing journeys are a Batch 1 test-identity regression,** already present in Build 87. The first briefing now renders in `HomeActionBriefingStrip`, which has no `home.latestBriefing` identifier. They fail identically in isolation on both trees. A new OPEN ledger entry records this; it was not fixed, as it is outside Batch 2 scope. |
| Server D1 candidate unit suite | Failure set identical to the production `27dad44a` baseline (307 pre-existing failures, all in environment-bound script/route suites), none new. |

## Remaining blockers and next steps

1. **Founder visual review** of the four packages.
2. **D1 Server deploy** of `c7c99347`, which needs a direct Founder chat authorization. Until then, production Log shows no Sources disclosure.
3. **Tracked defects remain OPEN, by instruction:**
   - Watch Complete Set during phone Review/Confirmation;
   - timed-set Watch projection;
   - Logger hidden error copy;
   - peptide fixture.
4. **Release:** the shipping build-number bump and TestFlight need a separate authorization.
5. **Ledger:** `DESIGN_IMPLEMENTATION_DELTA_LEDGER.md` is updated for Log Sources (Native done; Server not deployed) and You/Settings tap targets (integrated in `49733300`).
