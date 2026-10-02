# Apple Watch Workout V1 — Phase 0 foundation

Status: **candidate complete; implementation pushed for review**  
Repository: `dustinginn/physiqueos`  
Agent: Codex  
Implementation branch: `codex/apple-watch-workout-v1-phase0-foundation`  
Implementation SHA: `18f4569a0be48ff4ec087f4c6a49733dbf016b4c`  
Shipping Native base: Build 80, `1783691debeea46d3e4e6b2f6e470abe032c4c74`  
Coordination baseline at task start: `6b2fd58bde7ca2322467b5c362f217c26bb1f039`  
Report-main base: `ef9388a962590fa2939c13f0a8066dfafbdd0530`  

## Outcome

Phase 0 is implemented without shipping a Watch target or Watch UI. The phone remains the sole structured `TrainingSessionAuthority`; the Watch contracts are a versioned paired-client boundary. The early-finish partial-superset correctness blocker is fixed. Pause/resume and rest clocks are deterministic and persisted. A minimal Ready-for-Watch plan projection, phone command router, Live Activity parity, exact trusted HealthKit correlation seams, locked metrics semantics, revised PhysiqueOS mockups, and a physical Watch signing/target feasibility spike are complete.

No Native build or Watch TestFlight build was uploaded. No Server deployment was performed.

## Early-finish correctness blocker — resolved

One pure `TrainingPerformedSessionProjection` now feeds both production commit request construction and durable acknowledgement comparison.

The projection:

- keeps only `isCompleted` sets;
- removes exercises with no completed sets;
- preserves original exercise occurrence IDs and set IDs;
- filters every relationship member list to performed occurrence IDs;
- emits a relationship only when at least two performed members remain;
- never synthesizes or renumbers a relationship.

This removes the audited one-sided-superset failure: an exercise that was planned but never performed can no longer leave a dangling relationship member that makes Server reject Finish. The production wire test proves an incomplete later set and an entirely unperformed exercise/set never cross the commit boundary; the one-sided relationship is absent. Timed and bodyweight performed values remain intact. Two performed members of a three-member relationship remain linked under their original IDs. Zero completed sets continues to fail before network submission.

Because the Server performance/volume/PR/history pipeline receives only this performed projection, unfinished planned set IDs and values cannot enter canonical Training evidence or downstream performance records. Existing Server validation remains fail-closed for malformed relationships.

## Structured authority and pause model

`TrainingLoggerDraft` now persists:

- `pausedAt`;
- `accumulatedPausedSeconds`;
- `readyForWatchAt`;
- `finishConfirmationRequestedAt`.

`TrainingSessionAuthority` owns pause, resume-paused, active elapsed time, Ready-for-Watch selection/start, and explicit request/cancel/confirm Finish. Watch commands use the same compare-and-set mutation path as existing authority actions; there is no second session store or distributed authority.

Pause behavior:

- content mutations, including Complete Set, reject while paused;
- active elapsed time is wall time minus accumulated and current pause intervals;
- Stopwatch freezes elapsed time and re-anchors on resume;
- Countdown freezes remaining time and re-anchors its deadline on resume;
- no per-second state is persisted or transmitted;
- relaunch restores the pause ledger and frozen rest state;
- Save & Leave remains a separate lifecycle concept;
- Finish remains available while paused.

Finish never occurs automatically. `requestFinish` and `confirmFinish` remain explicit even after the final planned set.

## Prepared workout and Watch protocol

The existing phone-authored live draft is reused as Prepared; no heavy planning workflow or parallel model was added. An explicit minimal `readyForWatchAt` marker opts a zero-completion phone plan into Watch. The newest marker wins deterministically, with session ID as the tie-breaker. An active session has precedence, and Watch start fails unless the paired phone authority is reachable.

Pure Foundation Swift contracts define schema v1:

- commands: start prepared, complete set, pause, resume, request/cancel/confirm Finish, refresh projection;
- acknowledgement: mutation identity, applied/unchanged/stale/rejected result, typed reason, authoritative revision and projection;
- compact projection: prepared/active/paused/finishing/committed phase, maximum-two-row previous/current/up-next context, progress, set identity/value text, superset/round cues, rest anchors/frozen values, active elapsed ledger, finish eligibility, staleness reason and last acknowledged mutation;
- optional separated metrics: active elapsed, raw HealthKit duration, heart rate, active energy, basal energy and acquisition/availability states.

The phone router rejects unreachable structured mutations, handles mutation replay idempotently, returns strict stale-revision acknowledgements with the latest projection, and invokes only `TrainingSessionAuthority`.

## Live Activity parity

Watch projection rows derive from `TrainingSessionLiveProjection.contextRows`, preserving the accepted maximum-two-row rules for normal sets, final-set transitions, exercise transitions, supersets and single-set exercises. Live Activity has an explicit paused phase, keeps frozen context/rest presentation, and removes Complete Set while paused. Save & Leave remains outside the live projection.

## HealthKit ownership and exact correlation

Phase 0 defines, but does not yet instantiate, the Watch HealthKit lifecycle:

- `traditionalStrengthTraining`;
- `indoor`;
- explicit start/pause/resume/request-end/finish-saving transitions;
- the structured session UUID as future `HKMetadataKeyExternalUUID` correlation.

Native only emits `physiqueOSSessionId` when all checks pass: configured trusted Watch source bundle, valid UUID, strength type, indoor workout, exact owner-scoped session registry entry, and bounded start/end envelope. Server validates UUID syntax again and requires an independently injected trusted Watch bundle allowlist, which defaults to empty.

Trusted exact correlation takes precedence over ordinary Workout canonicalization. A valid PhysiqueOS Watch observation links physiology to the existing canonical structured Logger event and creates no duplicate performed Training evidence or canonical HealthKit workout. A second exact workout claim for the same structured session fails closed as `trusted_session_already_claimed`. Missing/untrusted correlation retains the existing temporal candidate/Evidence Review behavior. There is no historical backfill or existing workout rewrite.

This is dormant infrastructure: no final signed Watch bundle identity exists in production configuration, and the default empty allowlist leaves current production behavior unchanged.

## Metric semantics

- Current heart rate is optional and has acquiring/available/unavailable state.
- Active and basal/resting energy are separate optional measurements.
- Total Calories is derived only when both active and basal measurements exist; otherwise the UI contract returns unavailable (`—`).
- Structured active elapsed uses the phone authority pause ledger; raw HealthKit duration remains separately optional.

## PhysiqueOS visual lock and mockups

Updated artifacts on the implementation branch:

- `agent-handoffs/artifacts/apple-watch-workout-v1/watch-workout-v1-board.svg`
- `agent-handoffs/artifacts/apple-watch-workout-v1/README.md`

Locked tokens: background `#080D18`, raised surface `#141F31`, secondary surface `#172235`, primary purple `#8B8CFF`, primary text `#F4F6FF`, secondary text `#9AA4BA`, with green/amber/red reserved for semantic success/warning/error/heart-rate states. The twelve accepted states remain: Start, normal set, final-set transition, final workout, Crown metrics, swipe-left controls and confirmation, paused, Countdown, offline, stale/conflict, supersets and single-set.

## Non-shipping target/signing feasibility

- Xcode: 27.0 (`27A266a`); watchOS SDK: 27.0.
- Founder's paired physical Apple Watch Ultra is visible and available as product type `Watch7,12`, running watchOS 27.0 (`24R364`), satisfying the watchOS 11+ floor.
- Existing Apple Development identity is available and the generator uses development team `33GMTRM6G9`.
- Pure shared contracts type-check at `arm64-apple-watchos11.0`.
- The current project intentionally has no Watch target, so it is correctly incompatible with a Watch destination today.
- Phase 1A still must create/review the final Watch app/extension bundle IDs, App IDs/profiles, companion relationship, HealthKit entitlement, workout-processing background mode, version/build parity and archive packaging. No Apple Developer browser login or production identifier mutation occurred.

## Validation on exact implementation SHA

Passed:

- Native selected Training/Logger/Live Activity/HealthKit regression: **580 tests passed, 0 failed**. Result: `/tmp/physiqueos-watch-phase0-dd-final/Logs/Test/Test-PhysiqueOS-2026.10.01_22-51-18--0700.xcresult`.
- Server Training regression (`vitest.phase6.training.config.js`): **16 files, 156 tests passed**.
- Server command-port regression: **1 file, 53 tests passed**.
- Focused Server HealthKit observation + dormant workout foundation: **2 files, 116 tests passed**.
- Pure Watch contracts: watchOS 11 type-check passed.
- Xcode project generator was rerun; `project.pbxproj` remained byte-identical (`a78da3eac7089e8b78846275cf92294f7755fa7c`).
- `git diff --check` and changed JavaScript syntax checks passed before commit.

Broad HealthKit sweep on the exact candidate: **36/40 files passed; 717/723 tests passed**. The six failures are known repository-baseline audit drift, not runtime/correlation failures:

- three fixed-historical-diff assertions in `IntegratedHealthKitProductionShapedAcceptance.test.js` compare current HEAD against an obsolete `01d1900b` candidate and reject later repository evolution (including this intentionally additive command-port seam);
- `HealthKitStrategicReadBoundary.test.js` has three already-present allowlist offenders;
- two activation-payload audit tests expect an older script text shape.

The focused runtime, ingestion, duplicate-prevention, relationship and backward-compatibility suites are green. The six broad audit-sentinel failures were not altered or waived in this feature.

## Production / deploy status

Production Server authority was reverified read-only before Server work:

- source SHA: `2d967e48cb6a01e4a327934bbd81a405d3c26486`;
- deployment: `421cae1a-dbc6-494c-9f73-9b8778e45efd`;
- web and worker both ACTIVE at that exact source.

No Server deploy was performed. The new Server parameter is additive, defaults to an empty allowlist, and has no shipping Watch writer or final signed identity to trust. Deploying it independently now would add no Founder-visible behavior, so production was left unchanged.

No Native build, Watch archive or TestFlight upload was produced.

## Fresh review

The final diff was re-read after implementation. Review explicitly checked performed-evidence boundaries, partial and three-member relationships, pause timer math, stale/idempotent command behavior, absence of distributed authority, exact-correlation trust ordering, duplicate prevention, legacy temporal fallback, Live Activity row parity, additive wire compatibility, generator reproducibility and scope exclusions.

No shipping correctness blocker remains in Phase 0. The broad stale audit sentinels above remain repository maintenance debt, not a Watch runtime blocker.

## Phase 1A plan

1. Create the reviewed Watch app/extension target with final bundle identity, companion relationship, capabilities, version/build parity and archive test.
2. Implement a thin `WCSession` transport around the Phase 0 command/router/projection contracts; no parallel structured store and no phone-independent authority.
3. Implement Watch-owned `HKWorkoutSession`/builder lifecycle and metric collection, writing the exact external UUID only from the accepted structured start.
4. Implement the accepted PhysiqueOS Start, execution, final-set/final-workout, Crown metrics, swipe controls, paused, Countdown, offline/stale, superset and single-set surfaces.
5. Wire phone Live Activity and Watch refresh to the same authority projection, then run paired simulator and physical Watch tests for reachability loss/recovery, pause alignment, explicit Finish, exact HealthKit reconciliation and battery behavior.
6. Only after the signed bundle ID is final and the full path is accepted, configure/deploy the trusted Server allowlist and produce the first internal Watch build.

## Scope deliberately not implemented

- full Watch UI;
- `WCSession` transport;
- shipping `HKWorkoutSession` adapter;
- phone-independent/offline structured workout authority or mutation journal;
- production Watch bundle allowlist;
- historical HealthKit backfill;
- Server deployment;
- Native/Watch TestFlight upload.

## Integration and rollback

Review/merge `18f4569a0be48ff4ec087f4c6a49733dbf016b4c` as one Phase 0 candidate. The Server correlation path is inert unless a trusted Watch bundle allowlist is explicitly injected. Reverting the feature commit removes all Phase 0 source, mockup and feature-branch backlog changes; the main-branch durable backlog/report commit contains documentation only.

Local-only state: no implementation work remains untracked in the feature worktree. Build/test derived data and the inline conversation visualization remain local artifacts. No private Founder evidence, credentials, exports or harness data were added or pushed.
