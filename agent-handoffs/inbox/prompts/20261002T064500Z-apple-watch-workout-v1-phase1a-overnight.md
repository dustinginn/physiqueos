Apple Watch Workout V1 Phase 1A comprehensive overnight implementation.

Read first:
agent-handoffs/reports/20261002T055516Z-apple-watch-workout-v1-phase0-foundation.md
agent-handoffs/reports/20261002T061039Z-apple-watch-workout-v1-split-metrics-design-lock.md
agent-handoffs/reports/20261002T045500Z-apple-watch-workout-app-audit-plan.md
agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

Shipping Native expected Build 80 source 1783691debeea46d3e4e6b2f6e470abe032c4c74. Phase 0 candidate 9dea5d2e2d13afcabfcb1c810172cc2ad972a8c0. Reverify latest shipping authority because Progress Photos may ship concurrently; preserve/reconcile any newer release before final candidate.

Founder authorizes comprehensive progress overnight but NOT haphazard release. Use hard gates.

Locked architecture:
- phone is sole structured TrainingSessionAuthority and planning surface;
- Watch is paired execution client + Watch-owned HealthKit workout;
- new structured start requires phone reachable;
- connectivity loss: HK workout may continue, structured mutations fail closed;
- no phone-independent structured authority/journal/lease in V1;
- phone-prepared Ready-for-Watch plan;
- Finish always confirms, never auto-finishes;
- traditionalStrengthTraining indoor;
- total calories only active+basal when both available;
- PhysiqueOS visual tokens from Phase 0; no Apple Workout palette;
- split Load/Reps tiles are visual baseline;
- Crown editing out of V1.

Implement as much Phase 1A as safely possible:

1. Integrate Phase 0 onto latest shipping base. Gate: performed-projection early-finish, partial-superset, pause/rest math and command-router tests must remain green.

2. Create real generator-owned paired watchOS app target, watchOS 11+, companion to iOS app, version/build parity, HealthKit + workout-processing, WatchConnectivity, shared pure Swift contracts. No hand project edits. Generator twice byte-identical. If Apple capability/profile requires Founder interaction/2FA, continue safe source work but stop signing/release at that gate; never browser-login.

3. Implement WatchConnectivity: sendMessage for interactive command/ack, updateApplicationContext for replaceable latest projection. One mutation in flight, same mutationId retries, expectedRevision, stale authoritative refresh, duplicate/out-of-order protection. Never optimistically mark a set complete.

4. Implement minimal phone Ready-for-Watch UX using existing prepared zero-completion draft. No planning wizard or duplicate workout. Active session takes precedence.

5. Watch Start UI: no plan -> Prepare a workout on iPhone; prepared -> title/counts + purple Start Workout; active -> Resume Workout. Start creates exactly one phone structured session, then Watch HK workout with same correlation id, then phone Live Activity adoption. Explicit recovery if HK start fails.

6. Watch execution UI: PhysiqueOS colors; previous/current/up-next max two context rows; split large Load/Reps tiles; large Stopwatch/Countdown; progress; dominant Complete Set; final-set transition; superset/round; single-set. No load/reps editing.

7. Crown/vertical navigation from execution to metrics: structured active elapsed, current HR, active calories, total calories or —. Crown navigation only.

8. Swipe-left controls: Pause/Resume and Finish. Pause is phone-authoritative and mirrors HK pause; freezes structured elapsed/rest; Complete Set disabled. Finish always confirms; early finish states incomplete set count and that only completed sets count. Final planned set reveals prominent Finish but never auto-finishes.

9. Implement Watch HKWorkoutSession + HKLiveWorkoutBuilder, authorization, live HR/active energy/basal when legitimate, traditional strength indoor, pause/resume/end, structured UUID in HKMetadataKeyExternalUUID, recovery APIs. Do not duplicate raw HR into PhysiqueOS.

10. Implement process recovery: recover same HK session/correlation, reconnect, refresh phone projection, never start second workout.

11. Live Activity parity: Watch Start/Complete/Pause/Finish update same phone authority/revision; phone mutations update Watch; timers from anchors; if Live Activity cannot start while phone unavailable, adopt on next valid wake/open.

12. End-to-end exact HealthKit reconciliation from Phase 0. Finalize trusted signed Watch bundle identity. Only enable production trusted auto-link after signed identity, tests, paired proof, independent review. Otherwise leave allowlist dormant and retain safe existing Evidence Review fallback. Never weaken trust boundary.

13. Recoverable finish saga with one finishOperationId: structured finishing, HK end/save, Server commit, correlation pending/linked, Live Activity end, terminal committed. Handle HK-first/Server-offline and Server-first/HK-delayed without duplicates.

14. Compact Watch post-workout summary: active duration, completed sets, authoritative volume if available, active calories, average HR if available, authoritative PR count if available, correlation-pending status. Phone remains richer review.

15. Haptics: acknowledged Complete Set success; Countdown 10/5/0 restrained cues; final planned set; pause/resume; stale/rejected; finish. Never success before authority ack.

16. Intentional Always-On/reduced-luminance presentation: essential exercise/set/load/reps/rest/progress, paused/offline, reduced motion/update cadence, privacy-safe.

17. Explicit offline/error states: Phone unavailable, Reconnecting, Set pending, Stale refreshed, Health start failed, metrics unavailable, Finish pending, Health saved/PhysiqueOS pending. Structured controls disabled without authority.

Optional only after core green: brief next-exercise emphasis or complication/Smart Stack launcher. Do not add Crown editing, RPE, zones/coaching, substitution, media, voice, or offline structured start.

Testing:
- all Phase 0;
- Watch reducers/transport stale duplicate retry/out-of-order;
- Start exactly once;
- Complete exactly once;
- simultaneous phone/Watch Complete;
- pause/rest freeze;
- early finish/partial superset;
- finish saga;
- HK lifecycle/correlation/recovery;
- summary;
- paired simulator Start/Complete/Pause/Finish/disconnect/relaunch/failure;
- Training/Logger/Live Activity/HealthKit/Home Widget regressions;
- preserve Progress Photos if newer base;
- Server Training/HealthKit if changed;
- full Native suite before any release candidate.

Render actual shipping Watch states: Start, normal, final-set, final workout, metrics, controls, paused, Countdown, offline, stale, superset, single-set, summary, Always-On. Verify PhysiqueOS palette.

Physical Watch is a release gate. If safe and existing signing permits, build/install development candidate to paired Founder Watch/iPhone without asking for overnight 2FA; do not run a real workout automatically. If taps/authorization/Founder interaction are required, stop at a clean candidate and publish morning checklist.

Production/TestFlight release ONLY if all gates pass: latest shipping base reconciled; Phase 0 green; Watch signing clean; full regression no new deterministic failures; Server independently safe; exact-correlation trust proven or safely dormant; archive has correct iPhone + Widget extension + Watch app entitlements/companion ids; no Founder auth pending; independent final review no P0/P1/P2; current phone daily driver not put at risk. Otherwise DO NOT UPLOAD.

Maintain >=15 GiB free, prefer >=20 before archive; safe cleanup only.

Use milestone reports on main:
Checkpoint 1 target/transport/execution UI.
Checkpoint 2 HealthKit/pause/finish/recovery/reconciliation.
Final tests/signing/release decision.

At every stop push implementation authority, publish report to origin/main, update latest pointers, fetch/reverify main, re-read exact report, and provide exact main report SHA.

Update durable backlog with Phase 1A status and remaining physical gates. Never mark Watch V1 complete before Founder physical workout acceptance.
