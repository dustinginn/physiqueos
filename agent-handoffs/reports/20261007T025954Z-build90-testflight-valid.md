# Build 90 TestFlight release ready for Founder acceptance

**Task:** `build90-testflight-release-20261007`. The prompt is `agent-handoffs/inbox/prompts/20261007T024500Z-claude-build90-release-upload.md`, at commit `ef6f4074`.

**Status:** **Build 90 is VALID in TestFlight and ready for Founder physical acceptance.** STOPPED.

## Release authority
| Item | Value |
|---|---|
| **Release SHA** | `32baf1d5f43120cd07088df1210e1dc84ed26a78`: the bump commit on `claude/native-build90-integration-candidate-20261007` (pushed) |
| Pre-bump validated candidate | `8fab4fcb6be2c2c9d9f0f87b1123a6e49337fdbd` = Build 89 `51399425` + Claude A `a14eb4c4` + Claude B `8c3172e1` (integration report `e7da8be9`) |
| Version | **1.0 (90)** for the app, the Watch app and the Live Activity/Widget extension |
| Archive | `~/Library/Developer/Xcode/Archives/2026-10-06/PhysiqueOS-Build90-32baf1d5.xcarchive` |
| App Store Connect | Delivery `68dc945f-cfaa-43bb-a1ff-d0020fed54ff`, uploaded 2026-10-07 02:57:52Z, build-status **VALID**, import-status **VALID**, on App Store Connect |
| Release state | Last uploaded = 90, so the **next build is 91** |
| Previous authority | Build 89 `51399425`, archive `PhysiqueOS-Build89-51399425.xcarchive` (untouched; Info.plist checksum unchanged) |
| Production Server | `1b6687ff` / deployment `cbe6be96` (Codex Adaptive Progression V1). Independent: **not changed by this task**. Read-only health check: live and ready both 200. |

## Pre-release verification
- **Code authority:**
  - HEAD, the clean tree and the pushed remote were exactly `8fab4fcb` before the bump;
  - the 10 commits since Build 89 are exactly the integration;
  - no unexpected commits.
- **Release authority:** `latest.json` was still Build 89 before this task.
- **Release tooling:** ASC `auth-check` OK; last uploaded build was 89.
- **Server coupling:** the Adaptive Progression V1 Server delta (`b7eb1e39..1b6687ff`) changes 0 `ios/` files, so there is no Native coupling.

## Bump (metadata only, following the Build 89 pattern)
The bump changes 3 files and 10 lines:
- `ios/Scripts/generate_project.py`: `APP_BUILD_NUMBER = 90`.
- `ios/PhysiqueOS.xcodeproj/project.pbxproj`: 8 generated `CURRENT_PROJECT_VERSION = 90` lines (app, extension, Watch app, Watch tests; Debug + Release).
- `ios/PhysiqueOSTests/TrainingLoggerTests.swift`: the `CFBundleVersion` pin is now "90".

**Unchanged:** the marketing version stays 1.0, and no stale 89 pin remains.

**Generator determinism:** regenerating twice produced byte-identical projects.

`git diff --check` is clean, and there is no product-source change.

## Post-bump gates (on `32baf1d5`)
| Gate | Result |
|---|---|
| Release-contract unit gate: TrainingLoggerTests (CFBundleVersion 90 pin), WorkoutLiveActivityContractTests, AppTabTests, HomeWidgetTests | **142 / 0** |
| Full PhysiqueOSTests | **2159 / 0** (1 designed skip) |
| Watch unit | **59 / 0** |
| `verify_release_configuration.py` | OK: version 1.0 (90), AppIcon, HealthKit app-only, matching App Group, Live Activity + Home widget |
| Clean generic iOS Release | **BUILD SUCCEEDED**. App, Watch and Live Activity/Widget are all 1.0 (90). |
| Release seam scan | **0** `-physiqueos.*` / `-watch*` launch flags and **0** review/fixture types in the app, Watch and extension |

The UI suites were not rerun, because the delta is version metadata only. Exact pre-bump `8fab4fcb` passed:
- full unit 2159/0;
- focused 502/0;
- full iPhone UI (all classes passed; one non-reproducible wait, then 7/7 twice on rerun);
- Watch UI 6/7, identical to the Build 89 baseline.

## Archive verification
`xcodebuild archive -allowProvisioningUpdates` ran from the exact clean pushed `32baf1d5`, and the worktree stayed clean afterward.

| Check | Result |
|---|---|
| Identity | `com.physiqueos.native.dev` 1.0 (90), team 33GMTRM6G9, ArchiveVersion 2 |
| Watch app | 1.0 (90), arm64 + arm64_32 |
| Extension | 1.0 (90), arm64 |
| Signing | Apple Development (team 33GMTRM6G9), the same as Build 89; distribution signing happens at the guarded export. `codesign --verify --deep --strict` OK. |
| Entitlements | App: HealthKit and background delivery, App Group. Watch: HealthKit. |
| dSYMs | App, Watch and extension. The app UUID `1C11D02A-…` matches the binary. |
| Info.plist | `NSSupportsLiveActivities = true`; `ITSAppUsesNonExemptEncryption = false`; Watch `WKBackgroundModes = [workout-processing]` |
| Seams | 0 in all three binaries |

## TestFlight upload (guarded tool `physiqueos-asc-upload`, one upload)
1. **Dry run:** all PASS, including the check that build 90 is above the last uploaded build (89), and that the archive has no recorded upload. Verdict: WOULD UPLOAD 1.0 (90).
2. **Upload:** `--execute --confirm "UPLOAD com.physiqueos.native.dev 1.0 (90)"`. EXPORT SUCCEEDED, and "Upload succeeded".
3. **Delivery ID:** `68dc945f-cfaa-43bb-a1ff-d0020fed54ff`.
4. **Processing:** **VALID** within the tool's wait. The guarded `status` call re-confirmed VALID: build VALID, import VALID, on App Store Connect.
5. **Retries:** none were needed.

## Release authority update
After VALID, `latest.json` and `latest.md` move to Build 90 in this same commit, following the Builds 88 and 89 process.

**Rollback:** Build 89 stays available in TestFlight. The source revert path is `51399425`.

**Server release authority:** not touched.

## Storage
| When | Free space |
|---|---|
| Before archive | 20.52 GiB |
| After upload and cleanup | **20.96 GiB** |

I removed only this lane's DerivedData and Release products and shut down its simulators. Both archives are retained, and no worktrees, source or boards were removed.

## Founder physical-device acceptance checklist (Build 90)
1. **Logger clock.**
   - With no Watch, start a workout: the WORKOUT clock sits beside Finish Workout.
   - Complete a set: REST counts with **End**. Tap End: WORKOUT again.
   - Background the app for a minute: the time is continuous.
   - Finish hides the clock; Back to set entry restores it.
2. **Rest synchronization.** Phone, Live Activity and Watch show the same rest. End on the phone clears all three.
3. **Watch handoff, unlocked on-wrist Watch.** Before the first set, the centered card appears. Ready on Watch should bring PhysiqueOS forward with Start Workout. Tap Start: the phone shows "Started on Watch", dismisses itself, and shows the On Watch chip. There is no large Ready for Watch card.
4. **Watch handoff, locked, off-wrist or unreachable Watch.** The phone stays in Waiting with the open-and-tap instruction, or shows Watch not reachable with Try Again. It never claims success. A manual Start on the Watch dismisses the card.
5. **Use without Watch.** The card closes immediately. There is no re-prompt after leaving, relaunching or reconnecting the Watch for that workout.
6. **Photo Briefing expanded viewer, real media:**
   - a bounded, centered pair with no blank columns;
   - Previous/Current and the dates on the photos;
   - the canonical interpretation card below;
   - pinch and pan move both photos;
   - swipe down is blocked while zoomed;
   - Close works.

   Check relaxed and flexed poses.
7. **Watch (Ultra 3, Mineral and Dark).** Start Workout, Idle (Refresh) and the Apple Health orphan prompt have their button centered; Execution is unchanged. A phone-side Watch appearance change applies live, without relaunching the Watch app.
8. **Energy:**
   - Avg Est. Expenditure / Est. expenditure wording and the footnote;
   - kcal;
   - history;
   - error states show Try again;
   - 44 pt Details/Hide disclosure.
9. **Recovery/Sleep:**
   - Sleep Window date labels and the typical band;
   - the floating nightly Total Sleep floor;
   - zero-based bar summaries;
   - chart selection;
   - Trends, All Nights and Night Detail navigation and back labels;
   - loading, failure, empty and not-available states.
10. **Suggested progression.** Server Adaptive Progression V1 is live. Confirm Logger progression suggestions render and behave sensibly in Native. Build 90 changed no progression code.
11. **DEXA appointment dead end.** It is unchanged: known backlog, OP-A's first fix, not a Build 90 regression.

## Not done (by design)
No Server change or deploy, no production mutation, no new feature work, no DEXA/Operating Plan/progression changes.
