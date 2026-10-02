# Apple Watch Workout V1 Phase 1A — checkpoint 2

Generated: 2026-10-02T07:38:00Z  
Implementation branch: `codex/apple-watch-workout-v1-phase1a-overnight`  
Implementation authority: `1b8838a4caee79daf0f77ad479d449ec7ef9a77a`  
Shipping Native reconciled: Build 81, `6a0932517cbd8de165bf25c7637a2d2d6fea03dc`  
Production Server unchanged: `4ffde0f5faf1832decfbc09d822088aeba0dca89`, deployment `faaf66bd-930f-46a2-9b8e-77e604c23a86`

## Outcome

Checkpoint 2 is complete. Phase 1A now has a Watch-owned `HKWorkoutSession`/`HKLiveWorkoutBuilder` for indoor traditional strength training, live heart-rate and energy collection, companion mirroring, pause/resume/end/save, External UUID correlation, active-session recovery, a two-leg recoverable Finish saga, retained completion presentation, and compact Watch summary.

The phone remains the only structured `TrainingSessionAuthority`. Interactive Watch mutations are compare-and-set and idempotent through that authority; disconnected structured actions fail closed while the HealthKit workout may continue. Finish always requires confirmation and never follows automatically from the final set.

## Implemented checkpoint-2 behavior

- Watch HealthKit authorization and lifecycle, with active and basal energy kept separate; Total Calories is unavailable unless both exist.
- One persisted `finishOperationId` joins Watch Health save and the idempotent Server commit. Neither health-first nor server-first completion removes the local session until both durable effects succeed.
- Successful Health save awaiting phone acknowledgement survives Watch relaunch; phone commit recovery reuses the existing draft/idempotency identity and performs durability readback.
- Watch pause/resume mirrors the phone-authoritative structured pause ledger; workout/rest clocks freeze and re-anchor deterministically.
- Phone workout-session mirroring handler retains the mirrored Watch session; the same authority projection continues to feed the phone Live Activity and Watch.
- The summary contains active duration, completed-set count, performed-only external-load volume, active calories, average heart rate, authoritative PR count when available, and correlation-pending state.
- Haptics happen only after authority acknowledgement. Countdown cues are scheduled at 10, 5 and 0 seconds.
- Actual Watch state renders exist for Start, normal, final-set, final workout, Crown metrics, controls/confirmation, paused, Countdown, offline, stale, superset, single-set, finishing, summary and Always-On.
- Build 81 Progress Photos commits were reconciled exactly; combined generator output is stable at SHA-256 `18f619f9a57313892d4ee06d2f639fd5b8d203f1cba8009d8ce9bddba7886020` across repeated runs.

## Correctness and regression evidence

- Full integrated Native run: 1,918 passed, 1 skipped, 1 failed. The sole failure is the same deterministic `PeptideSupportEditorViewModelTests.testSandboxChangeDoseKeepsHistoryAndPauseResumeWorkAgainstTheFixture()` date-fixture drift already recorded by the Build 81 authority; there are no new Watch, Training, Live Activity, HealthKit, Widget or Progress Photos failures.
- Exact final focused authority/transport rerun passed after adding explicit proof for replayed Start exactly once, replayed Complete exactly once, simultaneous phone/Watch Complete stale rejection, health-first Finish and server-first Finish.
- Watch reducer suite: 2/2 passed on the paired Watch simulator.
- Server Training: 156/156 passed.
- Server canonical command ports: 53/53 passed.
- Focused Server HealthKit observation/workout foundation: 116/116 passed.
- Broad Server HealthKit sweep: 717/723 passed. Its six failures exactly match the known Phase 0 stale audit-sentinel baseline; runtime ingestion, exact correlation and duplicate-prevention slices are green.
- Paired simulator app installation/launch and actual shipping-surface screenshot fixture run passed.
- Unsigned generic Release build passed and contains the iPhone app, `PhysiqueOSLiveActivity.appex`, and embedded `PhysiqueOSWatch.app` at Build 81 with watchOS 11 minimum, companion identifier, HealthKit entitlement source and `workout-processing` background mode.

## Trust, release and signing status

The dormant Server exact-correlation seam remains disabled. No Server deployment occurred and no trusted Watch bundle allowlist was enabled.

The signed Release gate correctly stopped: an Apple Development identity exists, but Xcode has no authenticated Developer account in Accounts and the available wildcard provisioning profile lacks the HealthKit capability/entitlement for `com.physiqueos.native.dev.watchkitapp`. No archive, physical-device install, TestFlight upload, Apple login workaround, or real workout was attempted.

## Checkpoint-2 release posture

This is a strong source/test candidate, not a shipping release candidate. Final reporting still must preserve the signing stop, re-read the exact main report, and provide the Founder morning checklist for Developer account/profile creation, paired install, Health authorization, physical workout acceptance, disconnect/relaunch proof, archive inspection, and only then the separately reviewed trust/production-release decision.

No secrets, credentials, Founder evidence, or production exports are present in this report.
