# Build 82 Sleep v3 Native integration + guarded activation — checkpoint

- Task id: `build82-sleep-v3-native-integration-activation-20261002`
- Prompt: `agent-handoffs/inbox/prompts/20261002T210000Z-build82-sleep-v3-native-integration-activation.md` (main `43558459`)
- Generated (UTC): 2026-10-02T21:05:00Z
- Status: **CHECKPOINT. The integrated Build 82 is signed and ready, but it could NOT be installed: the Founder's iPhone and Watch are paired but unreachable (no tunnel). Server v3 activation has NOT been run (physical compatibility gate). Production mutation: 0.**

## Authority
| Item | Value |
|---|---|
| **Integrated Native** | branch `claude/build82-sleep-v3-integration-20261002` @ **`31988c06cf5e235260feab4176f899243df9ba2a`** (pushed) |
| Base | Watch Build 82 `a173f27b4a9ab208021a1f3cd7febc7402cf3b42` |
| Applied | Sleep compatibility `3ed3eae7`, cherry-picked cleanly, no conflict |
| Shipping Native | Build 81 `6a093251` (last uploaded = 81; no TestFlight in this task) |
| Production Server | `d0ff6596` (sleep-canon-v3 dormant; no canonical-algorithm policy) |

Build 81's Progress Photos commits are on the Watch branch, rebased as `33a48fe8`…`ed27384e`. The Progress Photos source and tests are byte-identical to Build 81.

## Integration diff (narrow)
`RecoverySleepAdapter.canonicalAlgorithm = "sleep-canon-v2"` becomes `stageCapableAlgorithms = ["sleep-canon-v2", "sleep-canon-v3"]`.

- `detailStatus` treats exactly those two as stage-capable. v1 and anything unknown remain "Being recalculated".
- No provenance aliasing: the "Calculation" row shows the true version.
- No stage-value change, no strategic eligibility change, no Watch change.
- One added test: `testSleepCanonV3NightsShowStagesLikeV2`.

## Validation (all on exact `31988c06`)
- **Generator** run twice: byte-identical, `cf7cd2f8d32d3f2b…`. This equals the Build 82 report, so the integration changed nothing in the project.
- **Release verifier:** `version 1.0 (82)`, AppIcon, HealthKit app-only, matching App Group, Live Activity + Home widget extension.
- **Focused iOS suites: 603 tests, 0 failures** (1 skipped), including the new v3 test. Suites:
  - RecoverySleepReadModel, RecoverySleepPolish;
  - HealthKitSleep ingestion, historical evidence and historical validation (decoding and quarantine);
  - WatchWorkoutTransport;
  - TrainingSessionAuthority, TrainingSessionLiveProjection;
  - WorkoutLiveActivity contract, coordinator, intent and view;
  - HomeWidget;
  - OperatingPlanReadModel and FounderServerAPI (Progress Photos cadence).
- **Watch suite `PhysiqueOSWatchTests`: 7/7.** It covers the callback bridge (reply and failure on a background queue), cancel confirmation dismissal, terminal cancellation clearing, HealthKit discard policy, acknowledgement gate and total calories.
- **Full iOS unit suite: 1,931 tests**, 1 skipped, and 1 failure: the known baseline `PeptideSupportEditorViewModelTests.testSandboxChangeDose…` (also on Builds 80 and 81). **No new failure.**
- Private simulators were used (iOS 27.0 iPhone 17 Pro, watchOS 27.0 Ultra) and deleted afterwards. The shared and Watch-lane simulators were not touched.

## Signed development candidate (not installed)
Archive: `~/Library/Developer/Xcode/Archives/2026-10-02/PhysiqueOS-Build82-SleepV3.xcarchive`. Release config, automatic development signing, ARCHIVE SUCCEEDED, tree clean afterwards.

| Product | Bundle id / version | Entitlements | Profile |
|---|---|---|---|
| iPhone | `com.physiqueos.native.dev` 1.0 (82) | HealthKit, background delivery, App Group | `00df369f…` |
| Widget/Live Activity | `com.physiqueos.native.dev.WorkoutActivity` 1.0 (82) | App Group only, HealthKit-free | `2a695b81…` |
| Watch | `com.physiqueos.native.dev.watchkitapp` 1.0 (82) | HealthKit | `f4ef7d4e…` |

- Watch: companion `com.physiqueos.native.dev`, `WKApplication`, `UIBackgroundModes = [workout-processing]`, `arm64` + `arm64_32`, `Assets.car` with 23 AppIcon renditions.
- iPhone Info.plist keeps both Health usage strings, `NSSupportsLiveActivities` and `ITSAppUsesNonExemptEncryption`.
- Signed by `Apple Development` (team 33GMTRM6G9). `codesign --verify --deep --strict` OK for all three.
- Binary SHA-256 (iPhone / extension / Watch): `523eb8db…1845`, `3fd86c42…619b`, `6756c4e8…b174`.

## Physical install: blocked
`devicectl`: iPhone (`iPhone18,1`) and Watch (`Watch7,12`) are both **paired**, but `tunnelState=unavailable` and `Device State: unavailable`. They are not reachable over USB or the local network.

**Required action:** unlock the iPhone and keep it near the Mac, either on USB or on the same Wi-Fi with the Watch nearby. Then install from the archive:

```
A=~/Library/Developer/Xcode/Archives/2026-10-02/PhysiqueOS-Build82-SleepV3.xcarchive/Products/Applications/PhysiqueOS.app
xcrun devicectl device install app --device 05BF778A-22AE-5E99-B7BF-C0372E94E37D "$A"
xcrun devicectl device install app --device BA171A70-C0E5-5A73-A0CA-1373FFC7C82A "$A/Watch/PhysiqueOSWatch.app"
```

## Server activation: NOT run (gate)
The compatible Native is not installed, so the guarded v3 activation (dry run and apply) was not executed. Build 81 on the iPhone keeps showing v2 stages.

- The founder accepted the out-of-order Oura residual. It stays visible through `ambiguousContinuationCount`.
- Next: once Build 82 is confirmed installed, run a fresh dry run on `d0ff6596`, then apply with exact facts.

## Mutation ledger
- Production: 0.
- TestFlight: none.
- Server: unchanged.
- Native source: one cherry-pick on a new branch.

## Safety flags
- CONTAINS_SECRETS: NO
- CONTAINS_CREDENTIALS: NO
- CONTAINS_PRODUCTION_EXPORTS: NO
- CONTAINS_FOUNDER_EVIDENCE: NO
- SAFE_FOR_CHATGPT_RETRIEVAL: YES
