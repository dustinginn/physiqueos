# Redesign Batch 2: approved release candidate, ready for Build 88

Task id: `redesign-batch2-finalize-20261005`

Status: **Approved Batch 2 release candidate ready for Build 88. STOPPED before TestFlight.**
- No TestFlight upload.
- No build-number bump.
- Build 88 is not consumed.

Agent: Claude, in the existing Batch 2 Remote Control chat. A single RC worktree was used throughout: no EnterWorktree and no secondary worktree.

Generated (UTC): 2026-10-05T15:02:27Z

## Authority

- **Finalization prompt:** `d72bd3f7336d1cebc26b67d502672eca6b0bf38f`.
- **Founder acceptance:** all five Batch 2 checkpoints are ACCEPTED (CP1 Log root; CP2 active workout and set entry; CP3 Logger entry and exercise selection; CP4 review, finish and complete; CP5 Workout Match L13).
- **Also confirmed:**
  - Workout Complete confetti keeps its one-time / Reduce Motion semantics;
  - Suggested Today appears whenever canonical Server suggestion data exists.
- **Prior integrated candidate:** `49733300672c0b52a06a2b3ee5435de49b76fd15`.

## Release candidate

**`793462b11ff522f116413c5b081db0ad97954305`** on branch `claude/redesign-batch2-log-logger-20261005` (pushed; not merged; not archived).

It is `49733300` plus four narrow commits:

| Commit | Part | Change |
|---|---|---|
| `b1488c2e` | B | Home briefing accessibility identity (no visual change) |
| `81943379` | C | Peptide sandbox clock injection (test determinism; shipping default unchanged) |
| `7a9a7caa` | D | Acceptance-suite isolation (test-only) |
| `793462b1` | D | Reporting-disclosure scroll recovery (test-only) |

Everything accepted is preserved:
- Build 87 `f66c7fc6` / Batch 1 `c4a74ad0`.
- CP1 `b540b323`, CP2 `0d59b45e`, CP3 `6d79f057`, CP4 `7a422a98`, CP5 `79a1a33d`.
- You/Settings full-row tap fix `bb6a6584`.
- Home correction `49e48f1e` (as `49733300`).
- Watch, HealthKit, Foam, appearance, widget and Live Activity code is untouched by these commits.

## Part A: Server D1, DEPLOYED and verified

**Before mutation:**
- Production was `27dad44a`, deployment `99188a9e` ACTIVE, with no pending deployment.
- The deploy branch was `27dad44a`, and the candidate `c7c99347` fast-forwards it. There was no drift.

**Guarded checks on the exact SHA:**
- The D1 contract suites pass: 113/113 across 5 files.
- The production build (`npm run build -- --webpack` with the provider build environment) succeeds.

**Path:**
1. Fast-forward `combined-app-platform-cutover` to `c7c99347`.
2. `apps update --spec`: exactly 4 stamp lines (`PHYSIQUEOS_GIT_SHA` / `PHYSIQUEOS_BUILD_ID` on web and worker).
3. `create-deployment --force-rebuild`.

**Result:**
- Deployment `e7ef3157-8d1f-4e34-aa56-4668681b40bf` is ACTIVE (13:23:47Z).
  - Web and worker `source_commit_hash` = `c7c99347a520d13fd344fe89b6b1398877cdd255`.
  - Fresh log envelopes on web and worker carry `gitSha` `c7c99347`.
- Health:
  - `/api/v1/health/live` reports `physiqueos-c7c99347-20261005`.
  - `/ready` is ready with 9/9 checks (migration 000014 unchanged).
- Post-deploy runtime logs contain no errors. The only failed request is the deliberate 401 identity probe.

**Contract and compatibility:**
- **Additive only.** `context` is byte-for-byte the legacy string, and `provenance` and `contextDetail` are new keys. Build 87 and older decoders ignore unknown keys, so they keep showing the legacy caption.
- **Mutation:** no migration, no data write, and no unrelated production change.
- **Live payload:** the typed payload was not read from production, because the read-only console tooling is not present on this Mac. Code-level proof is the exact deployed SHA plus the contract tests. The Founder's first Log open on the new build is the live confirmation (Sources disclosure present).
- **Rollback:**
  1. Fast-forward-revert the deploy branch to `27dad44a`.
  2. Re-stamp the 4 identity lines.
  3. `create-deployment --force-rebuild`.

## Part B: Home briefing identity

**Root cause:** Batch 1 renders the newest briefing in `HomeActionBriefingStrip`, which had no identifier. `BriefingCardView`, now used only for older briefings, still claimed `home.latestBriefing`.

**Fix:**
- The strip's briefing tile owns `home.latestBriefing`, as a combined accessibility element with the button trait only when it navigates. This mirrors `BriefingCardView`.
- Older cards get `home.briefing.<id>`, so no identifier is duplicated.

**Proof:**
- Dark and Mineral Home captures before and after are **pixel-identical (zero differing pixels)**.
- `testBriefingParityJourneys`, `testFounderCorrectionMidweekTrainingResponseJourney` and `testFounderCorrectionWeeklyAndPhotoBriefingJourney` pass on a clean install.

## Part C: Peptide fixture failure

**Root cause:** test clock dependence.
- `testSandboxChangeDoseKeepsHistoryAndPauseResumeWorkAgainstTheFixture` pins the view model's day to `2026-09-29`.
- `OperatingPlanSandboxStore` stamped `lifecycle.since` (and peptide timeline composition) from the real device date.
- Once the calendar passed Sep 29, `since > today`, so the model treated the pause as one that "starts later", and `nextDoseLabel` was nil (`:616`).
- This was not a shipping defect. In the app, both dates come from the same device clock.

**Fix:**
- The store takes an injectable `peptideToday` clock, defaulting to the existing device-date key, so every real call site is unchanged.
- The test shares the pinned day.
- No peptide protocol, dose, history, pause or resume semantics changed.

**Proof:**
- `PeptideSupportEditorViewModelTests`: 25/25.
- The formerly failing test passed **10/10** with `-test-iterations 10`.

## Part D: UI-test order coupling

**Root cause:** `testFounderCorrectionHomeConfidenceAndLoggerShoulders` ended on "Keep Workout", leaving a live session. In alphabetical suite order, every later Logger journey's Log tap was routed into it by the canonical active-workout redirect.

**Fix (test-only):** the journey now ends with Save & Leave, as the other Logger journeys already do. The redirect behavior is unchanged.

**Proof:** `TrainingAcceptanceUITests` **16/16** in combined order on a clean install, in two separate runs (Build 87 baseline: 9/16 failures).

**Second, intermittent issue found during the final gates.** The full-UI-target run failed `testReportingJourneys` ("Could not scroll to button: training-reporting-disclosure"). Run alone it passed 2 of 3 times.
- **Cause, from the failure's screen recording:** returning to the Training landing can restore the expanded Reporting disclosure scrolled *past* its destinations. `openReportingDisclosure` only swiped up, moving further away.
- **Not a Batch 2 change:** `TrainingHistoryView` and the Training presentation are unchanged since Build 87, where the test passed 3/3. The state depends on scroll timing.
- **Fix (test-only, `793462b1`):** when the destinations already exist, swipe back down to them first.
- **Proof:**
  - A temporary test deliberately forced the scrolled-past state and recovered with one swipe down. It was removed and never committed.
  - `testReportingJourneys` passed 5/5 alone, and `TrainingAcceptanceUITests` 16/16.

## Part E: final gates

The gates ran on `7a9a7caa`. The release candidate `793462b1` differs only by the 7-line UI-test helper above, and the affected suite was re-run on it.

| Gate | Result |
|---|---|
| Project generator byte-stability | `generate_project.py` produces 0 changed files |
| `verify_release_configuration.py` | verified: 1.0 (87), AppIcon, HealthKit, App Group, Live Activity + Home widget |
| Full Native unit suite (`PhysiqueOSTests`) | **2014 tests, 0 failures**, 1 skip (`RecoverySleepReadModelTests` live Founder capture, environment-gated). The peptide `:616` failure is gone. |
| Watch (`PhysiqueOSWatchTests`) | **47/47 pass** |
| Complete UI target (`PhysiqueOSUITests`, clean install) | **37 tests, 36 passed.** The 1 failure was the intermittent `testReportingJourneys` described above, fixed in `793462b1`. These pass, among others: Logger parity 8/8, Foam/appearance/You-Settings 9/9, Goals 1/1, Recovery Sleep 3/3, and the 3 Briefing journeys. On `793462b1`, `TrainingAcceptanceUITests` is 16/16 and `testReportingJourneys` 5/5. |
| Generic iOS Release compile (app + Watch + Live Activity + widget) | **BUILD SUCCEEDED**. `PhysiqueOSLiveActivity.appex` (Live Activity + Home widget) and `PhysiqueOSWatch.app` are embedded. The Release binary contains none of the DEBUG review-seam strings. |

## Part F: Build 88 recommendation

**Recommend Build 88 for this exact candidate.**

**Why 88 is free:**
- The guarded uploader's last uploaded build is 87 (receipt `b87`).
- No report, receipt or native branch references 88.
- Source `APP_BUILD_NUMBER` is still 87.

**Release steps (separately authorized):**
1. Bump `APP_BUILD_NUMBER` to 88 and regenerate.
2. Archive.
3. Upload with the guarded tool.

## Remaining known open defects (unchanged, by instruction)

- Watch Complete Set offered while the phone is in Review/Confirmation.
- Timed-set Watch projection.
- Logger hidden error copy.
