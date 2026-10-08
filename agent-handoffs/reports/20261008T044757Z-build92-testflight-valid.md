# Build 92 is VALID in TestFlight and ready for Founder acceptance

Task id: `build92-guarded-testflight-release-20261008`
Prompt: `agent-handoffs/inbox/prompts/20261007-build92-conditional-testflight-release.md` @ `fb74a9d9`
Founder visual approval: `3630d601`

**Status:** PhysiqueOS Build 92 TestFlight VALID, ready for Founder acceptance.

## Release identity

| Item | Value |
|---|---|
| **Release SHA** | **`beaf5eff9d3c4147fba4dec095e8092c0fae9b91`**: the bump commit on `claude/native-build92-testflight-release-20261008` (normal push; remote verified) |
| Source candidate | Integrated `56c51e4f7f41b521845dcfc2b9f0583407494e3c` (`codex/native-build92-three-lane-integration-20261007`, report main `2210e488`) |
| App | `com.physiqueos.native.dev` **1.0 (92)**, team 33GMTRM6G9 |
| **ASC delivery** | **`56b0c334-b8f5-42e4-979b-78e68a6d0573`**: **build-status VALID, import-status VALID**, on App Store Connect, uploaded 2026-10-07 21:46 local. Confirmed in the tool's wait **and** again by a separate read-only `status` call. |
| Archive | `~/Library/Developer/Xcode/Archives/2026-10-08/PhysiqueOS-Build92-beaf5eff.xcarchive` (122 MB, retained) |
| Previous authority | Build 91 `106f0518`, delivery `13cebc12`. Its archive is untouched. |
| **Production Server snapshot** | **`84cc64e4e7205b2540bf78ea43afd1cbfb068d06`**, deployment `32143aa4-90d4-496a-81b2-17f35a609fde` ACTIVE 9/9, no pending deployment, health ready 9/9 (`physiqueos-84cc64e4-20261008`). Read-only checks only; **not changed by this task.** |

## Upstream gates (verified fresh from GitHub and production)

**Native integration.**
* Branch head is `56c51e4f`, and `106f0518` is its ancestor.
* It contains exactly 4 commits: three cherry-picks plus one integration commit.
* `git patch-id` is identical for each input:

| Input | Picked as | Patch-id |
|---|---|---|
| Variants `39b818e2` | `e9344c6e` | `db2c3057…` |
| Final redesign `f6b39423` | `33f27e86` | `abd70c35…` |
| HealthKit `6c52df29` | `045af2e9` | `ca498abc…` |

* The integration commit `56c51e4f` touches only Logger view, view model, and tests (refusal UI and the stale-helper fix).
* All 50 changed files are under `ios/`: no Server source, no migration.
* **The DEBUG visual-review branch `7c17645e` is not an ancestor,** and its harness strings are absent from the source and from the Release binaries.

**Server.** Production is `84cc64e4`, ACTIVE 9/9 per deploy report `9e2084c8`, re-verified at start and before publication.

**Release state.**
* `latest.json` was Build 91 VALID.
* The tool's last uploaded build was **91**, so Build 92 had not been uploaded before.
* Storage was 28 GiB free at start (floor 12, preferred 20). No other `xcodebuild` was running at any gate start.

## Bump

`chore(ios): Build 92` matches the shape of the Build 91 bump exactly:
* `APP_BUILD_NUMBER = 92` in `ios/Scripts/generate_project.py`;
* `CURRENT_PROJECT_VERSION = 92` ×8 in `project.pbxproj`;
* the `TrainingLoggerTests` CFBundleVersion pin set to "92".

That is 3 files, +10/−10, with no functional source edits and no identity, signing or bundle-id drift. The generator was run twice and produced byte-identical output (`project.pbxproj` sha256 `12bdbbc5…`). `git diff --check` is clean.

## Verification on the exact release SHA `beaf5eff`

Gates ran sequentially, on dedicated lane simulators.

| Gate | Result |
|---|---|
| Release-contract unit (TrainingLoggerTests with the CFBundleVersion 92 pin, WorkoutLiveActivityContractTests, AppTabTests, HomeWidgetTests) | **147 / 0** |
| Full `PhysiqueOSTests` | **2223 executed, 0 failures** (1 designed skip) |
| **Full iPhone UI suite (`PhysiqueOSUITests`)** | **93 tests; all 93 passed on `beaf5eff`.** The full run passed 87. The 6 that failed were rerun in isolation on a freshly erased simulator and **all 6 passed** (see below). |
| Watch unit, 49 mm Ultra 3 and 42 mm S12 | **75 / 0** at each size |
| `verify_release_configuration.py` | OK: version 1.0 (92), AppIcon, HealthKit app-only, matching App Group, Workout Live Activity + Home widget extension |
| Clean generic iOS Release (unsigned) | **BUILD SUCCEEDED**: app, Watch and extension are all 1.0 (92) |
| Release seam scan (app, Watch, extension) | **0** `-physiqueos.*` flags, **0** `-watch*` seams, **0** review/fixture strings (including `TrainingVariantsReview`), **0** `op:`/`operatingPlanReviewPath`/`resetForTesting` |
| Watch UI | Not rerun here; the delta is version metadata only. On the integrated candidate (Codex report `2210e488`) it was 9/10 at each size. The only failure is the known baseline no-WCSession harness limitation `testFinalSetFinish…`, identical to Builds 88–91. |

**About the 6 UI failures in the full run.**
* **The tests:**
  * `testDatePickerTodayIsReachable…`
  * `testFounderCorrectionHomeConfidenceAndLoggerShoulders`
  * `testHomeWidgetStartAndResumeLinks…`
  * `testWorkoutCompleteSurvivesATabSwitch…`
  * `testWorkoutReviewScreenshotCardIsReachable…`
  * `testWorkoutStartedAndSetCompletedThenBackgrounded…`
* **Symptom:** all six failed at reaching the Logger start or Log entry ("Training Logger was not available from Log", "Could not scroll to button: trainingLogger.start").
* **Cause:** order-dependent persisted Sandbox workout state left by earlier tests in the same 81-minute run. Build 91's Log legitimately auto-routes into an active workout.
* **Evidence:** on an erased simulator, the same six on the same build all passed (24–54 s each).
* **Classification:** test isolation, not a product regression. Build 91's release also needed 2 isolated reruns.
* **Follow-up (non-blocking):** reset Sandbox draft state between `TrainingAcceptanceUITests` cases.

**Test artifact:** the widget snapshot unit test rewrites tracked PNGs under `agent-handoffs/artifacts/home-screen-widget-v1/`. They were restored before archiving, so the worktree was clean at archive time.

## Archive verification

`xcodebuild archive -allowProvisioningUpdates` ran from the exact clean, pushed `beaf5eff`. HEAD was verified before and after, and the worktree was clean.

| Check | Result |
|---|---|
| Identity | `com.physiqueos.native.dev` 1.0 (92), team 33GMTRM6G9, ArchiveVersion 2 |
| Watch app | `com.physiqueos.native.dev.watchkitapp` 1.0 (92), arm64 + arm64_32 |
| Extension | `com.physiqueos.native.dev.WorkoutActivity` 1.0 (92), arm64 |
| Signing | Apple Development, team 33GMTRM6G9 (the same model as Builds 90–91). `codesign --verify --deep --strict` OK. Distribution signing happens at the guarded export. |
| Entitlements | App: HealthKit + background delivery, App Group `group.com.physiqueos.native.dev.shared`. Watch: HealthKit. Extension: the same App Group. |
| Info.plist | `NSSupportsLiveActivities = true`; `ITSAppUsesNonExemptEncryption = false`; Watch `WKBackgroundModes = [workout-processing]` |
| dSYMs | App, Watch and extension. The app UUID `2F982C5C-3719-3F18-A712-DDA7DF13917F` matches the binary. |
| Seams | 0 in all three archived binaries |

## TestFlight upload (guarded `physiqueos-asc-upload`, exactly one upload)

1. **Dry run:** all checks passed.
   * API-key authentication.
   * Archive identity: bundle, version, build and team.
   * One app; extensions share version and build.
   * Codesign and signature team.
   * dSYM presence and UUID match.
   * Build 92 above the last uploaded build (91).
   * No recorded upload for this archive.
   * Verdict: **WOULD UPLOAD 1.0 (92)**.
2. **Upload:** `--execute --confirm "UPLOAD com.physiqueos.native.dev 1.0 (92)"`. EXPORT SUCCEEDED, "Upload succeeded".
3. **Processing:** VALID (import VALID) inside the tool's wait.
4. **Confirmation:** a separate read-only `status --delivery-id` call returned build-status VALID, import-status VALID, on App Store Connect.

There was no double upload. The tool state now records last uploaded = 92.

## Release authority

`latest.json`/`latest.md` move **91 → 92** through the installed guarded publisher `--release-authority` (pointer guard). They point at:
* release SHA `beaf5eff`;
* Native build 92;
* delivery `56b0c334`;
* Server snapshot `84cc64e4` / `32143aa4`.

## Boundaries kept

* **Not done:** no Static Hold seed (neither dry run nor apply), no production variant writes, no Super Set cleanup, no Recovery Briefing activation, no Energy phase history, no Settings work, no production database mutation, no Server deploy.
* **Excluded:** the visual-review DEBUG tools were not merged.
* **Preserved:** Build 91's TestFlight version and all archives (Builds 85–92), for rollback.

## Storage

| Moment | Free on `/System/Volumes/Data` |
|---|---|
| Start | 28 GiB |
| After the test gates, before cleanup | 21 GiB |
| After removing this lane's test, Release and archive DerivedData (job scratch) and the three `B92 Rel` simulators | **25 GiB** |

* **Retained:** archives for Builds 85–92, other lanes' worktrees and simulators, receipts and credentials.

## Founder device acceptance checklist (Build 92)

**One-tap Skip.**
* Home shows the red circular Skip on eligible priorities.
* One tap skips. A short "Skipped" confirmation fades in place.
* Completed shows its own confirmation.
* Grouped rows behave the same way.

**Training variants.**
* In a workout, open an exercise's ••• menu, then **Execution variant**: you see **Ordinary** and **Create Variant…**.
* Production has no saved variants yet, and historical Static Hold is **not** listed until the separately authorized seed runs.
* Creating a variant is a real canonical write. If you test it, use a variant you want to keep, for example "Static Hold" on Spider Curls.
* Expected: the new variant is selected immediately, sets are unchanged, the card shows the label, and Previous reflects that variant's history.
* An offline create shows an inline Retry and keeps your selection.

**Logger refusals.** A refused action (paused, stale, invalid set) shows inline red copy without clearing the draft, the sets or the variant.

**HealthKit.**
* Launch and background recovery should **not** present repeated Apple Health permission sheets.
* Deliberate actions present a sheet only when iOS says the exact scope still needs a request.
* DEXA writeback stays write-only (Body Fat %, Lean Mass).

**Watch.**
* The phone-selected variant shows on Watch rows (for example "Spider Curls · Static Hold").
* Workout start, save and finish behave as before.
* Build 91's still-pending Watch footer/haptic acceptance is **still pending** and carries forward.

**Redesign tails.** Home secondary/no-goal/older-briefing states, Workout Match states, the DEXA PDF wrapper, the evidence date sheet, and training supporting-media placeholders.
