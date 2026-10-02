# Build 82 (Watch + Sleep v3 compatibility) — TestFlight VALID; Sleep v3 still dormant

- Task id: `build82-sleep-v3-native-integration-activation-20261002`, with the workflow correction
- Prompts:
  - `agent-handoffs/inbox/prompts/20261002T210000Z-build82-sleep-v3-native-integration-activation.md`
  - correction `agent-handoffs/inbox/prompts/20261002T212500Z-build82-testflight-remote-workflow-correction.md` (main `7953656e`)
- Supersedes checkpoint `20261002T210500Z-build82-sleep-v3-native-integration-activation.md` (main `8009496a`).
- Generated (UTC): 2026-10-02T21:35:00Z
- Status: **Build 82 uploaded to TestFlight and VALID. Sleep v3 is still DORMANT. Waiting for the Founder to install Build 82 remotely from TestFlight and confirm.**

## Authority
| Item | Value |
|---|---|
| **Uploaded Native** | branch `claude/build82-sleep-v3-integration-20261002` @ **`e2cbcd0cf40dca64a4c8490bf0ebd4077b2eb69c`** (pushed) |
| History | Watch Build 82 `a173f27b` → Sleep compatibility `31988c06` (cherry-pick of `3ed3eae7`) → Watch background-mode fix `e2cbcd0c` |
| Version | **1.0 (82)**. Previous last upload was Build 81 (reverified); release state is now 82, so the next build is 83 |
| **TestFlight delivery** | **`f3d09d99-9b8e-4344-85e7-5d2ddcc04519`**: build VALID, import VALID, on App Store Connect, uploaded 2026-10-02 14:27 PT. Re-confirmed by a separate read-only status call |
| Archive | `~/Library/Developer/Xcode/Archives/2026-10-02/PhysiqueOS-Build82-e2cbcd0c.xcarchive` (retained) |
| Production Server | `d0ff6596`, deployment `64533990` (reverified ACTIVE, web and worker SHA, ready) |
| Sleep v3 | **dormant**: no canonical-algorithm policy record (read-only dry run, see below) |

## Workflow correction applied
- The local iPhone reachability polling was stopped.
- The tethered install path was abandoned.
- The release went through the established remote workflow: Xcode archive → guarded App Store Connect upload → TestFlight VALID → the Founder installs remotely.

## Release blocker found and fixed (first TestFlight build with the Watch app)
- **First upload attempt** (archive from `31988c06`): **App Store validation rejected the Watch bundle**:
  > Invalid value 'workout-processing' for Info.plist key UIBackgroundModes in watchOS app bundle 'PhysiqueOS.app/Watch/PhysiqueOSWatch.app'

  Nothing was uploaded and the build state was unchanged.
- **Cause:** watchOS declares workout background execution with **`WKBackgroundModes`**. `UIBackgroundModes` is the iOS key, which development installs tolerated.
- **Fix `e2cbcd0c`:**
  - Watch `Info.plist` key renamed to `WKBackgroundModes = [workout-processing]`. The value and capability are unchanged.
  - The release verifier now requires `WKBackgroundModes = [workout-processing]` and the non-independent companion relationship, and refuses `UIBackgroundModes`. A negative check confirmed it rejects the old key.
- **Behavioral note:** this is the documented watchOS key for HealthKit workout sessions in the background. The Founder's Watch physical acceptance (Start/Pause/Finish, background) should be observed on this TestFlight build.

## Integration (narrow, unchanged from checkpoint)
`RecoverySleepAdapter` treats exactly `sleep-canon-v2` and `sleep-canon-v3` as stage-capable.

- v1 and anything unknown stay "Being recalculated".
- No provenance aliasing, no stage-value change, no strategic eligibility change.
- Build 81's Progress Photos work is on the Watch branch, rebased as `33a48fe8`…`ed27384e`. Its source and tests are byte-identical to Build 81.

## Validation
On `31988c06` (the Sleep integration; `e2cbcd0c` changes only the Watch plist and the verifier):
- **Focused iOS: 603 tests, 0 failures.** It covers Sleep (including `testSleepCanonV3NightsShowStagesLikeV2`), HealthKit Sleep decoding and quarantine, Watch transport, TrainingSessionAuthority and Live Activity, Home Widget, and Progress Photos cadence.
- **Full iOS unit suite: 1,931 tests.** The only failure is the known baseline peptide fixture test. No new failure.

On `e2cbcd0c`:
- **Watch suite: 7/7** (callback bridge, cancel/terminal, HealthKit discard, acknowledgement gate, calories).
- The built Watch app has `WKBackgroundModes`, not `UIBackgroundModes`.
- The generator is byte-identical (`cf7cd2f8…`, same as the Build 82 baseline).
- The release verifier passes.

## Distribution archive inspection (`e2cbcd0c`)
| Product | Build | Entitlements |
|---|---|---|
| iPhone `com.physiqueos.native.dev` | 82 | HealthKit + background delivery + App Group |
| Live Activity/Home Widget `…WorkoutActivity` | 82 | App Group only (HealthKit-free) |
| Watch `…watchkitapp` | 82 | HealthKit |

- **Watch:** `WKBackgroundModes = [workout-processing]`, companion `com.physiqueos.native.dev`, `WKRunsIndependentlyOfCompanionApp = false`, `arm64` + `arm64_32`, 23 AppIcon renditions.
- **Signing:** `codesign --verify --deep --strict` OK for all three; dSYMs for all three.
- **Compiled-binary presence checks:**
  - iPhone contains `sleep-canon-v3` (Sleep v2 + v3 compatibility) and `cadenceChangeBaseline` (Progress Photos);
  - Watch contains `Cancel Workout` (Cancel/terminal fix).
- **Guarded tool:** the dry run passed every check (identity 1.0 (82), extension parity, codesign, dSYM UUID, 82 > 81). The upload ran with `--execute --confirm "UPLOAD com.physiqueos.native.dev 1.0 (82)"`, export succeeded, and the result was **VALID**.
- **Watch inclusion:** the IPA was exported from an archive that embeds `PhysiqueOS.app/Watch/PhysiqueOSWatch.app`. App Store validation demonstrably inspects that bundle: the first attempt was rejected on it by path, and the corrected package passed.
- **Not yet confirmed:** that the Watch app installs remotely. That needs the Founder's TestFlight install.
- No browser login, and no Founder authentication was needed.

## Sleep v3: still dormant (no activation)
A fresh guarded **dry run** (read-only, rolled back) on live `d0ff6596` found:
- **No `healthkit_sleep_canonical_algorithm_policy` record**, so ingestion is v2.
- **Target days:** exactly `[2026-10-02]`.
- **Stored Oct 2:** `sleep-canon-v2`, revision 2.
- No Oct 3 night has arrived yet.
- Historical: 87 days and 8,601 samples.

**Production mutation 0. Historical 0. Strategic 0.** The founder accepted the out-of-order Oura revision residual; it stays visible via `ambiguousContinuationCount`.

## Canary
Unchanged: **FAIL** (the stored Oct 2 row is still the v2 splice). It moves to **HOLD, not PASS**, only after activation succeeds.

## Next action: the Founder
1. Install **Build 82** from TestFlight on the iPhone. Confirm the PhysiqueOS Watch app is offered and installed on the Apple Watch (the Watch app's App Store section, or automatic install).
2. Confirm installation to Claude.

## Then: Claude (only after the Founder's confirmation)
Resume the guarded activation steps. Do not activate merely because Build 82 is VALID.
1. Fresh authority check.
2. Fresh bounded dry run (discover the exact prospective day set ≥ 2026-10-02, which may include Oct 3+).
3. Apply with exact facts and `--max-days` equal to the discovered count.
4. Verify stored == fresh v3, Evidence stages served, historical and strategic mutation 0.
5. Canary FAIL → HOLD.
6. Founder check: Sleep Evidence Oct 2 shows stages, not "Being recalculated".

## Workflow rule (durable)
- **Normal Native distribution is TestFlight-first:** archive → guarded upload → VALID → Founder installs remotely.
- **Tethered device installs are exceptional:** bring-up and debugging only.
- **Local Mac or device reachability must never be a routine release gate.** Recorded in the backlog.

## Disk / local
- About 18 GiB free at the end. Disk stayed ≥ 16 GiB throughout.
- This lane's DerivedData and private simulators were deleted after use.
- The first, never-uploaded archive `PhysiqueOS-Build82-SleepV3.xcarchive` (`31988c06`) is retained and superseded.

## Safety flags
`TESTFLIGHT_82_VALID` · `DELIVERY_F3D09D99` · `WATCH_WKBACKGROUNDMODES_FIX` · `SLEEP_V3_DORMANT` · `PRODUCTION_MUTATION_0` · `CANARY_FAIL_UNTIL_ACTIVATION` · `AWAITING_FOUNDER_REMOTE_INSTALL`

- CONTAINS_SECRETS: NO
- CONTAINS_CREDENTIALS: NO
- CONTAINS_PRODUCTION_EXPORTS: NO
- CONTAINS_FOUNDER_EVIDENCE: NO
- SAFE_FOR_CHATGPT_RETRIEVAL: YES
