# Apple Watch Workout V1 Phase 1A — checkpoint 1

Status: **checkpoint 1 candidate; overnight implementation continuing**  
Repository: `dustinginn/physiqueos`  
Agent: Codex  
Implementation branch: `codex/apple-watch-workout-v1-phase1a-overnight`  
Implementation SHA: `e9c7b3cbb7669ecbc49e3a3ff1e96884f55ff608`  
Shipping Native authority reverified at task start: Build 80, `1783691debeea46d3e4e6b2f6e470abe032c4c74`  
Phase 0 base: `9dea5d2e2d13afcabfcb1c810172cc2ad972a8c0`

## Checkpoint outcome

The real generator-owned watchOS app target, shared transport contracts, phone bridge, Ready-for-Watch control and the first shipping Watch execution UI are implemented and pushed. The phone remains the only structured `TrainingSessionAuthority`; Watch mutations fail closed while the phone is unreachable. No Watch build or Server change has been deployed.

This is the prompt's target/transport/execution-UI checkpoint, not a release candidate. HealthKit finish recovery/reconciliation, paired interaction proof, full regression, signed archive inspection and physical Watch acceptance remain open and are the active overnight work.

## Implemented

- generator-owned `PhysiqueOSWatch` and `PhysiqueOSWatchTests` targets with watchOS 11 floor, companion bundle relationship, version/build parity, HealthKit entitlement, workout-processing background mode, WatchConnectivity and source-controlled Watch scheme;
- schema-v1 pure Swift command/ack/projection codec used by phone and Watch;
- phone `WCSession` router around the existing Phase 0 `WatchWorkoutCommandRouter`, including `sendMessageData` for interactive commands and `updateApplicationContext` for replaceable latest projection;
- one interactive mutation in flight, identical command/mutation identity on retry, expected-revision compare-and-set, stale authoritative refresh and out-of-order acknowledgement protection;
- minimal Ready-for-Watch phone affordance on the existing zero-completion prepared draft;
- Watch Start/no-plan/offline, execution, final-workout, metrics, controls, paused, Countdown, stale, superset, single-set and summary surfaces;
- locked PhysiqueOS near-black/navy/purple tokens and split large Load/Reps tiles; no Apple Workout green/orange treatment;
- Crown vertical paging to metrics, swipe-left controls, explicit Finish confirmation, no auto-finish and no Watch load/reps editing;
- real Watch `HKWorkoutSession`/`HKLiveWorkoutBuilder` adapter for indoor traditional strength, heart rate, active/basal energy, pause/resume/end/save, external structured UUID metadata and process-recovery entry point;
- Total Calories remains `—` unless both active and basal energy are present.

## Validation on exact checkpoint

Passed:

- Xcode generator ran twice with byte-identical `project.pbxproj` SHA-256 `4e3a8da456f84653f6f13341a401082113d3d9bc0a5d9b65b90921e3029e9e9d`;
- paired iPhone scheme build for the iOS 27 simulator, including embedded Watch app: passed;
- Watch scheme build for the paired watchOS 27 simulator: passed;
- focused `WatchWorkoutTransportTests`: passed, exit 0;
- `plutil` validation for Watch Info.plist/entitlements and `git diff --check`: passed.

Open/failing:

- the Watch test bundle builds, but the Watch simulator killed the test process before XCTest bootstrap; no reducer test is claimed passed yet;
- no paired interactive Start/Complete/Pause/Finish tour has been claimed;
- the full Phase 0 and Native regression matrices have not yet run on this checkpoint;
- no signed archive, physical install, HealthKit authorization or physical workout has been attempted.

## Hard gates and safety

- No production Server deploy occurred. The exact-correlation trust allowlist remains dormant; no signed Watch identity has been promoted.
- No Native or Watch TestFlight build was uploaded.
- The current implementation is not a release candidate.
- The recoverable finish saga remains incomplete at this checkpoint: a Watch Finish reaches structured authority and Watch HealthKit, but durable Server commit/retry ordering is the next milestone.
- The unrelated dirty primary checkout was not touched; implementation is isolated in the dedicated Watch worktree.
- No private Founder data, credentials or local harness data were committed.

## Next safe work

Implement and test the one-operation recoverable finish saga, HealthKit mirroring/recovery, pause/finish alignment, summary/reconciliation status and failure states. Then repair the Watch XCTest runtime, run paired simulator scenarios, reconcile any newer shipping Native authority (including concurrent Progress Photos), run the required full regressions, inspect signing/archive contents and stop at a morning physical-device checklist unless every real-world gate is satisfied.

