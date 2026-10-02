# Apple Watch Workout V1 Phase 1A — final overnight report

Generated: 2026-10-02T07:40:00Z
Implementation branch: `codex/apple-watch-workout-v1-phase1a-overnight`
Exact implementation authority: `1b8838a40613fead6d5f8d62f1d9831cb977f83f`
Shipping Native reconciled: Build 81, `6a0932517cbd8de165bf25c7637a2d2d6fea03dc`
Production Server unchanged: `4ffde0f5faf1832decfbc09d822088aeba0dca89`, deployment `faaf66bd-930f-46a2-9b8e-77e604c23a86`

## Final outcome

Phase 1A source and simulator implementation is complete at the strongest safe candidate possible. It is pushed to GitHub, reconciles the latest valid Native authority including Progress Photos Build 81, and preserves every locked product/authority decision.

No Watch TestFlight or production build was uploaded. The signed archive and physical-device gates remain deliberately closed because Xcode is not authenticated to the Apple Developer account and the only locally available wildcard profile lacks Watch HealthKit. The dormant exact-correlation Server seam remains disabled and production was not changed.

## What is implemented

### Paired architecture and authority

- A generator-owned watchOS 11+ `PhysiqueOSWatch` app and test target, embedded in the iPhone app with shared version/build parity.
- The phone remains the sole structured `TrainingSessionAuthority` and planning surface. Watch starts only a phone-prepared Ready-for-Watch draft while the phone is reachable.
- `WCSession.sendMessageData` carries interactive command/ack traffic; `updateApplicationContext` carries the replaceable latest projection.
- One mutation is in flight, transport retry reuses the exact command/mutation identity, commands carry `expectedRevision`, stale commands refresh from authoritative state, and late acknowledgements cannot clear newer pending work.
- Watch never optimistically marks a set complete. Offline structured mutation controls fail closed while an already-running HealthKit workout may continue.
- The phone Live Activity and Watch receive projections derived from the same authority/revision and timer anchors.

### Watch execution product

- Locked PhysiqueOS near-black/navy surfaces, purple primary actions, semantic warning/error/success accents, and no Apple Workout green/orange treatment.
- Founder-selected split large Load/Reps tiles, deliberately preserving a future focus-then-Crown editing seam without shipping Crown editing now.
- Previous/current/up-next context, set count/progress, large Stopwatch or Countdown, dominant Complete Set, final-set transition, final-workout Finish affordance, supersets/rounds and single-set exercises.
- Vertical Crown/page navigation to elapsed active time, current heart rate, active calories, and Total Calories only when both active and basal energy are actually available.
- Swipe-left controls for Pause/Resume and Finish. Finish always confirms—even after the final planned set—and early Finish explicitly states the number of incomplete sets and that only completed sets count.
- Explicit paused, set-pending, stale-refreshed, offline/reconnecting, Health-start-failed, finish-pending, Health-saved/PhysiqueOS-pending and metrics-unavailable states.
- A compact saved-workout summary and intentional reduced-luminance/Always-On treatment.
- Acknowledgement-only haptics plus restrained Countdown 10/5/0, final-set, pause/resume, stale/rejected and finish cues.

### Watch-owned HealthKit and recovery

- Real `HKWorkoutSession` + `HKLiveWorkoutBuilder` using `.traditionalStrengthTraining` and `.indoor`.
- Watch authorization, live heart rate, active energy, basal energy, average heart rate, raw HealthKit duration, pause/resume/end/save and companion mirroring.
- The structured session UUID is stored in `HKMetadataKeyExternalUUID`; the signed source bundle and envelope remain part of the trusted Server correlation boundary.
- Active workout recovery uses `recoverActiveWorkoutSession`; it reconnects to the same correlation and never starts a second structured session.
- One persisted `finishOperationId` joins Health save and Server commit. Health-first/Server-offline and Server-first/Health-delayed both retain the local session until both legs are durable. Successful Health save awaiting acknowledgement survives Watch relaunch.

## Early-finish correctness proof

The Phase 0 blocker remains fixed and covered on the integrated candidate:

- `TrainingPerformedSessionProjection` is the single performed-evidence boundary used for commit/durability comparison.
- Only sets explicitly completed by the Founder survive projection.
- A partially completed exercise includes only its completed sets.
- A wholly unfinished planned exercise disappears from performed evidence.
- A partial superset whose other member has no completed sets becomes one standalone performed exercise; no dangling relationship is sent.
- A partial superset with completed sets on both members retains the relationship and only the completed sets.
- Three-member relationships retain only performed members and disappear when fewer than two remain.
- Volume, PR inputs, history and performance records therefore never receive unfinished planned sets.

This is a correctness gate, not a visual convention. The exact Server request-body regression verifies the one-sided partial-superset payload contains no unfinished exercise/set and no invalid superset.

## Latest-Native reconciliation

The final valid Native authority changed overnight from Build 80 to Progress Photos Build 81. The four exact Build 81 commits were integrated and reviewed against their source authority. Progress Photos cadence/editor behavior was preserved; the only overlapping test-file difference is the already-approved performed-only early-finish payload proof.

Generator output was produced twice on the combined candidate and remained byte-identical:

`18f619f9a57313892d4ee06d2f639fd5b8d203f1cba8009d8ce9bddba7886020`

## Validation

- Full integrated Native suite: **1,918 passed, 1 skipped, 1 failed**. The sole failure is the exact Build 81 baseline date-fixture drift in `PeptideSupportEditorViewModelTests.testSandboxChangeDoseKeepsHistoryAndPauseResumeWorkAgainstTheFixture()`; isolated rerun reproduces it. No new Watch, Training, Live Activity, HealthKit, Home Widget or Progress Photos failure exists.
- Final exact focused authority/transport suite after concurrency additions: **72/72 passed**.
- Watch reducer suite on paired simulator: **2/2 passed**.
- Server Training: **156/156 passed**.
- Server canonical command ports: **53/53 passed**.
- Focused Server HealthKit observation/workout foundation: **116/116 passed**.
- Broad Server HealthKit: **717/723 passed**; the six failures exactly reproduce the known stale audit-sentinel baseline from Phase 0. Runtime ingestion, trust, duplicate prevention and relationship behavior are green.
- Paired iPhone 17 Pro / Apple Watch Ultra 4 simulator installation, launch and actual Watch surface renders passed.
- Unsigned generic Release build passed. The package contains `PhysiqueOS.app`, `PhysiqueOSLiveActivity.appex`, and embedded `Watch/PhysiqueOSWatch.app`; the Watch bundle is build 81, minimum watchOS 11, companion `com.physiqueos.native.dev`, non-independent, with Health usage descriptions and `workout-processing`.
- Repeated project generation is byte-identical; `git diff --check` passes.

## Fresh review

The final diff was re-read for authority duplication, optimistic completion, replay identity, revision mismatch, pause/rest clock drift, automatic Finish, performed-evidence leakage, two-leg Finish deletion, HealthKit duplicate creation, untrusted exact correlation, phone/Watch projection divergence, Total Calories fabrication, debug fixture leakage into Release, companion packaging and newer Native loss.

No P0, P1 or P2 source defect was found. The open items below are real-world release gates that cannot be truthfully satisfied in source or simulator.

An unrelated set of Home Widget screenshot PNG modifications is present only as unstaged local work in the implementation worktree. It was not created, committed, discarded or pushed by this Watch task and is not part of the implementation authority.

## Release decision

**DO NOT UPLOAD.** A signed Release build stops with:

- no authenticated Apple Developer account in Xcode Accounts;
- the available wildcard provisioning profile lacks the HealthKit capability and `com.apple.developer.healthkit` entitlement for `com.physiqueos.native.dev.watchkitapp`.

Accordingly there is no signed archive, physical install, HealthKit authorization acceptance, physical workout proof, exact signed-bundle Server trust proof, battery observation or post-device review. The production trusted Watch bundle allowlist stays empty. No Server deployment was required or performed.

## Exact morning checklist

1. In Xcode Settings > Accounts, sign in to the Apple Developer account for Team `33GMTRM6G9`. Do not share credentials or 2FA through an agent.
2. Ensure the Watch App ID `com.physiqueos.native.dev.watchkitapp` exists with HealthKit enabled; let Xcode create/refresh an explicit development profile for it. Confirm the companion remains `com.physiqueos.native.dev`.
3. Fetch current `origin/main` and the current valid Native release authority again. If a newer Native build shipped, reconcile it before any archive. Advance the next candidate to Build **82** through the generator so iPhone, Live Activity/Widget and Watch all match.
4. Produce a signed Release archive and inspect—not merely compile—the embedded products, code signatures, provisioning profiles, build parity, Watch companion ID, `com.apple.developer.healthkit`, Health usage strings and `workout-processing`. Keep at least 15 GiB free; prefer 20 GiB before archive.
5. Install the development candidate on the paired Founder iPhone/Watch. Grant Health read/write authorization by tapping on-device; do not automate consent.
6. Prepare a short phone workout containing a normal multi-set exercise, a single-set exercise and a superset. Start from Watch and verify phone Live Activity parity.
7. Prove Complete Set exactly once, simultaneous phone/Watch action, Pause/Resume rest freeze, Countdown, final-set transition, explicit final confirmation, and disconnect/reconnect/relaunch recovery. While disconnected, Health may continue but structured controls must fail closed.
8. Early-finish once with a partially completed exercise and a one-sided partial superset. Verify production history, volume, PRs and performance records contain only completed sets and no duplicate event.
9. Finish a complete workout. Verify exactly one Apple Health strength workout and one structured PhysiqueOS event share the intended correlation; inspect heart rate, active calories, Total Calories availability, duration, summary and Live Activity end.
10. Observe Always-On legibility and battery behavior during a representative workout.
11. Only after the signed-source/correlation proof and a fresh independent review, consider the separate Server allowlist deployment. Then rerun full regressions and archive inspection before any TestFlight upload.

## Review artifacts

Actual non-shipping renders are committed on the implementation branch under `agent-handoffs/artifacts/apple-watch-workout-v1/phase1a-actual-states/`. The review board delivered in chat shows all fifteen states, including the split Load/Reps option selected by the Founder.

No secrets, credentials, production exports or Founder evidence are included in this report.
