# Build 91 TestFlight release ready for Founder acceptance

- **Task:** `build91-guarded-testflight-release-20261007`. The prompt is `agent-handoffs/inbox/prompts/20261007-build91-guarded-testflight-release.md`, at commit `b5c8ab81`.
- **Lane:** the same Claude Build 91 Native integration session and managed worktree. No new conversations, agents or worktrees.
- **Status:** **Build 91 is VALID in TestFlight and ready for Founder physical acceptance.** STOPPED.

## Release authority

| Item | Value |
|---|---|
| **Release SHA** | **`106f05183ea3e2328496acce0636dc087116bbce`**: the bump commit on `claude/native-build91-testflight-release-20261007` (pushed with a normal non-force push; remote verified) |
| Pre-bump validated candidate | `3697951cb530a6f7d2593e92de76fced9613eaef` = Build 90 `32baf1d5` + Evidence Option A `a44a8a12` + Operating Plan/Watch `4eb1b07a` + Universal Priority Skip `a379fa12`. Integration report: main `1d83b999`, `agent-handoffs/reports/20261007T220548Z-build91-native-integration-candidate.md`. |
| Version | **1.0 (91)** for the app (`com.physiqueos.native.dev`), the Watch app (`…watchkitapp`) and the Live Activity/Widget extension (`…WorkoutActivity`) |
| Archive | `~/Library/Developer/Xcode/Archives/2026-10-07/PhysiqueOS-Build91-106f0518.xcarchive` (120 MB, retained) |
| App Store Connect | Delivery **`13cebc12-6572-4044-9950-8add928d8cd7`**. Uploaded 2026-10-07 22:37:47Z. build-status **VALID**, import-status **VALID**, on App Store Connect: confirmed by the tool's wait and again by a separate read-only `status` call. |
| Release state | Last uploaded = 91, so the **next build is 92** |
| Previous authority | Build 90 `32baf1d5`, delivery `68dc945f`, archive `PhysiqueOS-Build90-32baf1d5.xcarchive` (untouched) |
| Production Server snapshot at release | `738ce66849a1361b4ce0ed069a4a04eac6abc4ef`, deployment `f0f1d3b4-8b95-4bc5-85ce-739a4fd0e255` ACTIVE 9/9 with no deployment in progress. Health ready 9/9 (`physiqueos-738ce668-20261007`). All checks read-only; **not changed by this task**. |

## Pre-release verification (Part A)

- **Candidate:**
  - The remote branch `claude/native-build91-integration-candidate-20261007` was exactly `3697951c`, and the local tree was clean.
  - The 74-file change set is entirely under `ios/`.
  - The scripted union check re-ran: all 72 lane-exclusive files are byte-identical to their lanes, there are no unexpected files and no Build 92 commits.
- **Integration report:** the actual basename on main `1d83b999` is `20261007T220548Z-build91-native-integration-candidate.md`; the prompt's `…220712Z…` name does not exist.
- **No duplicate delivery:** the tool state said last uploaded = 90 before the upload, and the archive had no recorded upload.
- **Server:**
  - live `738ce668`, ready 9/9;
  - deployment `f0f1d3b4` ACTIVE 9/9, nothing in progress.
  - Build 90 backward compatibility is as stated in the integration report: Skip and Morning Check-In fields are additive, and Next DEXA Scan uses the existing Coaching Updates `editor.dexa`.
- **Release tooling:** ASC `auth-check` passed (API key, export options exactly approved, Apple ID 6806825992 resolved). The keychain identity is Apple Development (team 33GMTRM6G9), the same as Build 90; distribution signing happens at the guarded cloud export.
- **Storage:** 21.21 GiB free at release start, against the ≥ 12 GiB threshold of addendum `4bcfe4d8`.

## Bump (Part B: metadata only, following the Build 89/90 pattern)

The bump changes 3 files and 10 lines.

| File | Change |
|---|---|
| `ios/Scripts/generate_project.py` | `APP_BUILD_NUMBER = 91` |
| `ios/PhysiqueOS.xcodeproj/project.pbxproj` | 8 generated `CURRENT_PROJECT_VERSION = 91` lines (app, extension, Watch app, Watch tests; Debug + Release) |
| `ios/PhysiqueOSTests/TrainingLoggerTests.swift` | The `CFBundleVersion` pin is now "91" |

- **Unchanged:** no stale 90 remains; the marketing version stays 1.0 (14 lines); no other release pin was needed.
- **Regeneration:** two runs were byte-identical (`ea54bdee…`).
- **Hygiene:** `git diff --check` is clean, and there is no product-source change.

## Post-bump gates (Part C, on `106f0518`)

Run sequentially, with dedicated lane simulators and storage guards.

| Gate | Result |
|---|---|
| Release-contract unit: TrainingLoggerTests (CFBundleVersion 91 pin), WorkoutLiveActivityContractTests, AppTabTests, HomeWidgetTests | **142 / 0** |
| Full PhysiqueOSTests | **2198 / 0** (1 designed skip) |
| Watch unit, 49 mm Ultra 3 and 42 mm S12 | **70 / 0** at each size |
| `verify_release_configuration.py` | OK: version 1.0 (91), AppIcon, HealthKit app-only, matching App Group, Workout Live Activity + Home widget extension |
| Clean generic iOS Release (unsigned) | **BUILD SUCCEEDED**. App, Watch and extension are all 1.0 (91). |
| Release seam scan | **0** `-physiqueos.*` flags, **0** `-watch*` seams, **0** review/fixture/`op:`/`operatingPlanReviewPath`/`resetForTesting` hits in the app, Watch and extension |
| Generator determinism / diff-check | Deterministic / clean |

**UI suites were not rerun.** The delta is version metadata only. Exact pre-bump `3697951c` passed:
- iPhone UI 83/83 (two load-induced timing failures passed on isolated rerun);
- Watch UI 9/10 at each size.

**Baseline, kept separate:** the only Watch UI failure is the known no-WCSession harness limitation `testFinalSetFinishShowsConfirmationOnThePrimarySurfaceAndNotYetReturns` (line 89), identical on Builds 88–90. It is not candidate-specific.

**Not touched:** no migration, production write or Server change.

## Archive verification (Part D)

`xcodebuild archive -allowProvisioningUpdates` ran from the exact clean pushed `106f0518`. The worktree was clean before and after.

| Check | Result |
|---|---|
| Identity | `com.physiqueos.native.dev` 1.0 (91), team 33GMTRM6G9, ArchiveVersion 2, created 2026-10-07 15:33 local |
| Watch app | `com.physiqueos.native.dev.watchkitapp` 1.0 (91), arm64 + arm64_32 |
| Extension | `com.physiqueos.native.dev.WorkoutActivity` 1.0 (91), arm64 |
| Signing | Apple Development (team 33GMTRM6G9), the same as Build 90; `codesign --verify --deep --strict` OK. Distribution signing happens at the guarded export. |
| Provisioning | Team profiles for the app, Watch and extension bundle IDs |
| Entitlements | App: HealthKit + background delivery, App Group `group.com.physiqueos.native.dev.shared`. Watch: HealthKit. Extension: the same App Group. |
| dSYMs | App, Watch and extension. The app UUID `75DB9CAB-DCA0-3BB4-9AC0-289CFE09BB93` matches the binary. |
| Info.plist | `NSSupportsLiveActivities = true`; `ITSAppUsesNonExemptEncryption = false`; Watch `WKBackgroundModes = [workout-processing]` |
| Seams | 0 in all three archived binaries |
| Source stamp | Archive name `PhysiqueOS-Build91-106f0518` = the release SHA. The worktree HEAD was `106f0518` and clean at archive time. |

## TestFlight upload (guarded tool `physiqueos-asc-upload`, one upload)

1. **Dry run:** every check passed, including archive identity, codesign, dSYM UUID, build 91 above the last uploaded build (90), and no recorded upload for this archive. Verdict: WOULD UPLOAD 1.0 (91).
2. **Upload:** `--execute --confirm "UPLOAD com.physiqueos.native.dev 1.0 (91)" --wait-minutes 10`. EXPORT SUCCEEDED, and "Upload succeeded". The receipt is `~/.physiqueos-release/logs/upload-b91-20261007-153422.log`.
3. **Delivery ID:** `13cebc12-6572-4044-9950-8add928d8cd7`.
4. **Processing:** **VALID** inside the tool's wait. A separate read-only `status` re-confirmed it: build-status VALID, import-status VALID, is-on-app-store-connect True.
5. **Retries:** none.

## Release authority update (Part E)

After VALID was verified, `latest.json` and `latest.md` move from Build 90 to Build 91 in this commit.

- **Method:** the installed guarded publisher in `--release-authority` mode, on a fresh `origin/main` (`b5c8ab81`), with the pointer guard checking 90 → 91 (forward, new SHA).
- **Not changed:** README, existing reports, product files and the Server release authority.
- **Rollback:** Build 90 stays available in TestFlight. The source revert path is `32baf1d5`.

## Storage (Part F, addendum `4bcfe4d8`)

| Point | Free on /System/Volumes/Data |
|---|---|
| Release start | 21.21 GiB |
| After post-bump gates | 15.08 GiB |
| After removing gate DerivedData and simulators (before archive) | 16.96 GiB |
| After archive | 17.71 GiB |
| **After upload and final cleanup** | **17.53 GiB** |

**Removed (this lane only, after results were captured)**
- Post-bump Debug and Release DerivedData under the job scratch.
- The three dedicated `B91 Rel` simulators (iPhone 17 Pro, Watch Ultra 3 49 mm, Watch S12 42 mm), all shut down.
- This worktree's archive DerivedData `~/Library/Developer/Xcode/DerivedData/PhysiqueOS-ckfzkxff…` (345 MB; WorkspacePath verified as this worktree; no open files).

**Retained**
- Archives for Builds 85, 86, 87, 88, 89, 90 and 91 (781 MB total).
- Upload receipts and logs, the ASC configuration and key (not read), and Git source, branches and reports.
- Shared Xcode module/SDK caches.
- Other lanes' DerivedData folders, simulators, `/private/tmp` content and job scratch.

No processes were killed; there was no `git clean`, cache purge or worktree prune.

**Queued and untouched until storage allows:** the final redesign audit (`287d8745`) and the Apple Health authorization audit (`5c86fbde`).

## Founder physical-device acceptance checklist (Build 91)

1. **Evidence Option A:**
   - check the Evidence Hub and every Evidence page in **Dark and Mineral**: shared neutral surfaces, per-domain accent colors and icons;
   - Training/Nutrition/Activity semantic ink is readable on the shared Mineral card.
2. **Operating Plan:**
   - OP-A–D chrome, flat crumbs and in-page titles;
   - Peptides, Tracking and Supplements pages;
   - You → Operating Plan lands on "Your Operating Plan".
3. **Next DEXA Scan:**
   - Home DEXA priority → Priority Detail shows **View DEXA Appointment with the OP crumb, and Mark Skipped alongside it**;
   - View lands on Next DEXA Scan ("‹ <priority title>");
   - Edit opens the Coaching Updates editor at the DEXA section; a save works, and a stale save fails closed.
4. **Watch (real hardware):**
   - the Mineral panel footer is not clipped;
   - exactly **one truthful "ready" haptic** per genuine preparation;
   - no repeat on relaunch and no cue for a stale (> 10 min) preparation;
   - Start and Execution behave as in Build 90.
5. **Universal Skip:**
   - Mark Skipped on the Home focus tile/card, Priority Detail (**Fadogia**/supplement, peptide, Foam Rolling, morning evidence, Photos, DEXA), the notification Skip action, and Morning Check-In prior-day scheduled-evidence items;
   - real occurrence semantics: Server-confirmed `priority.skip.v1`;
   - **no fabricated completion or evidence**;
   - recovery-only items and completed/skipped occurrences show no Skip.
6. **Cross-lane regressions:**
   - Logger and Watch handoff ("Started on Watch" auto-dismiss);
   - Energy/Recovery navigation and back labels;
   - Photo viewer and Briefings, as in Build 90.
7. **Apple Health permission sheets:** repeated sheets are a **separate queued audit** (`5c86fbde`). They were deliberately not patched in this release.

## Not done (by design)

- No Server deploy or change, no production data mutation, no feature change.
- No Build 92 work, no HealthKit permission reset.
- The queued redesign and Apple Health audits were not started.
