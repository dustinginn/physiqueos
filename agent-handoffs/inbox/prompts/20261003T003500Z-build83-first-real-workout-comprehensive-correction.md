Build 83 comprehensive Watch/Training correction from first real Build 82 workout.

Read first:
agent-handoffs/reports/20261003T002055Z-build82-live-workout-finish-stall-audit.md
agent-handoffs/reports/20261002T213500Z-build82-sleep-v3-native-integration-activation.md
agent-handoffs/reports/20261002T173031Z-watch-v1-cancel-workout-parity-physical-checkpoint.md
agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

Base Native Build 82 e2cbcd0cf40dca64a4c8490bf0ebd4077b2eb69c. Production Server d0ff65965233fa44e108387f01b649a2bdb476df; reverify. Target Build 83.

Founder confirms 0 PR/performance events today was EXPECTED because no PRs occurred. Drop that audit.

DEXA HealthKit writeback is READY/HOLD and MUST NOT be implemented. Sleep v3 must not be disturbed.

Implement all confirmed real-workout findings:

1. Fix Watch Finish state machine. Final-set Finish Workout must show an obvious confirmation on the primary surface. Distinguish finishConfirmation from confirmed finishing. Never show "Finishing safely…" before confirmation. Controls-page Finish uses same confirmation.

2. Unify phone and Watch around ONE finishOperationId and one structured finish lifecycle. Phone Finish on a paired Watch workout must cause the Watch HKWorkoutSession to end/save; Watch Finish must use the same structured commit. Phone Finish while Watch finish is requested/in-flight joins/reuses the same operation. Exactly one Training commit and one HK workout. HealthKit failure must not block structured durability indefinitely; structured failure must not duplicate HK workout.

3. Fix command transport stall found in incident audit. Interactive commands must not burn 60-second waitsForConnectivity loops while reads work. Use a bounded user-appropriate connectivity budget (~10-15s or immediate fail/retry as technically correct), recreate failed command session when appropriate, expose Waiting for network, preserve same idempotency key.

4. Align Training commit client budget with observed Server commit (~6.1s canonical / 6.75s total). Give commit a realistic >=15s bounded attempt or equivalent safe async design. Profile Server commit and optimize clearly safe hotspots without weakening atomicity/idempotency.

5. Add recoverable finish UX. Phone after ~20s: honest Still saving / Waiting for network state, safe same-key Retry, no destructive Cancel. Watch after ~30s: Waiting for iPhone / reason + Retry. No indefinite spinners. Relaunch recovers.

6. Improve diagnostics: longer command network diagnostics and a safe Founder-exportable diagnostic surface; Server logs native command receipt start using non-sensitive identifiers. No health values/secrets.

7. Stop/freeze-hide rest Stopwatch and countdown/haptics immediately on Finish intent/confirmed finishing/terminal state. If Not Yet returns active, restore/re-anchor safely. Live Activity mirrors this.

8. Return to Log must publish terminal state immediately to Watch.

9. Watch Workout Saved summary gets a prominent Done button. Done dismisses local summary only, returns idle/Prepare/current prepared plan, sends no commit and does not touch HealthKit. Old summaries must not resurrect on later launch/day.

10. Primary Watch execution page becomes NON-SCROLLABLE. Remove ScrollView/scroll indicator. Everything below system clock must fit simultaneously without clock/title overlap. Preserve accepted Previous/Current or Completed/Up Next, large split Load/Reps, large rest. Fix Complete Set at bottom with rounded/capsule treatment following lower Watch edge. Do not solve by making critical text tiny. Test Watch Ultra and smaller supported sizes with compact layout if needed.

11. Watch workout progress bar GREEN like phone Logger. Keep purple for primary actions.

12. Workout Metrics page order exactly: Time, Active Calories, Total Calories, Heart Rate. Give each icon a distinct PhysiqueOS-compatible accent; keep current HR red/pink. Differentiate icons, not whole cards.

13. Add THIRD Crown-down Watch page: DAILY TOTALS. Order: (a) current ticking Training Session Time with seconds, using authoritative session anchors/pause semantics; (b) today's total Active Calories from canonical daily Activity; (c) today's total Nutrition calories from canonical daily Nutrition. Page 2 remains workout-only metrics. Daily totals come from same canonical daily snapshot authority used by Home/Home Widget, supplied compactly by phone via WCSession/application context. No independent Watch calculation for daily totals, no per-second network traffic; session timer ticks locally. Whole-number Activity/Nutrition formatting, missing = —, stale/offline indication.

AUDIT-FIRST items:

14. Cardio ingestion. Founder showed Apple Health/Fitness Stair Stepper + Cooldown today, but PhysiqueOS Log showed only Strength Training. Perform bounded read-only production/source audit: raw workout observations, source/device, activity type, ingestion batches/anchors, canonical workouts, mapping, Log projection, evidence eligibility, observer delivery, late arrival. Determine never-uploaded vs rejected mapping vs canonical-but-hidden vs policy-excluded vs delayed. Preserve separation: canonical ingestion != strategic evidence eligibility. Fix a real ingestion/read defect. If Cooldown is intentionally unsupported strategically, it may still belong in Log/Activity; surface any product-policy decision rather than silently changing strategic eligibility.

15. Active-calorie/exercise-minute audit. Founder observed ~945 active calories / 109 exercise minutes and only wants proof against duplication; may be correct. Reconcile Apple Health Activity Summary, active-energy samples/source/device, workout records, Stair Stepper/Cooldown, structured strength, canonical PhysiqueOS Activity day, Home/Widget totals, manual Activity, duplicate ids/overlap. Never sum workout active calories on top of Activity Summary. Invariant: one physiological energy contribution counted once. If legitimate, make NO numerical change. If duplicate, fix prospectively with proof. Audit exercise minutes similarly.

16. Add Set observation. First phone rep-edit+Complete appeared to add a set; two later identical workflows worked; Founder thinks accidental Add Set tap plausible. Audit stable set identity, edit, Complete, Watch projection/revision, stale merge and Add Set path. Add/confirm deterministic test: edit current reps -> Complete -> set count unchanged. If no race/identity defect, NO patch; close unable-to-reproduce/likely user action.

17. Today's missing PhysiqueOS strength workout in Apple Health is already explained by Watch Finish confirmation never applying. After finish fixes, prove Watch Finish AND phone Finish each save exactly one correlated HK workout. Production trusted Watch bundle allowlist remains a separate physical trust gate; do not enable exact auto-link solely from simulator evidence.

Tests must cover today's exact finish sequence, final-set confirmation/Not Yet, phone+Watch concurrent Finish, delayed HK, delayed Server, command transport stall while reads succeed, lost replies, duplicate Finish, relaunch, 13-set performed fixture, rest termination, Done, all fixed Watch layouts/states/sizes, metrics, Daily Totals, cardio mapping, Activity non-duplication, rep-edit set-count stability, and regressions for Training/Live Activity/HealthKit/Home Widget/Nutrition/Sleep v3/Progress Photos. Run full Native suite before release and relevant Server suites.

If Server changes are required, fresh independent review and guarded deploy with exact SHA/live/ready. No DEXA or Sleep strategic changes.

After green review/tests, produce Build 83 from Build 82, deterministic generator, signed archive with iPhone + Widget/Live Activity + Watch, Watch icon/HealthKit/WKBackgroundModes/companion intact, Sleep v3 compatibility and Progress Photos preserved. Guarded TestFlight upload and wait VALID. Normal workflow is TestFlight-first remote; no tether gate.

Founder acceptance after Build 83 should verify: Finish confirmation, Watch/phone Finish save HK workout, bounded finish timing/recovery, rest stops, Done dismisses summary, fixed execution screen/no scrollbar/green progress, metrics order/colors, Daily Totals, Stair Stepper/Cooldown appearance as appropriate, and no Activity inflation.

Update durable backlog. Follow mandatory GH-main protocol before every stop and publish exact final report commit SHA.


LOCKED WATCH CONTROLS GESTURE — FOUNDER CORRECTION

Founder reiterates the originally intended interaction:

From the primary Watch workout execution screen, SWIPE RIGHT to access workout controls.

The controls surface contains:
- Pause / Resume;
- Finish Workout;
- Cancel Workout.

Do NOT require swipe left for these controls.

Requirements:
- swipe-right gesture/navigation must be deliberate and reliable;
- vertical Crown/page navigation remains reserved for Execution -> Workout Metrics -> Daily Totals;
- the new fixed/non-scrollable execution layout must not interfere with swipe-right controls;
- Finish confirmation semantics from this controls surface must use the same unified finish state machine as primary final-set Finish;
- Cancel remains available active and paused;
- Pause/Resume unchanged semantically;
- update Watch interaction tests and shipping renders to reflect swipe-right controls;
- audit current navigation implementation so the visual/page direction matches the Founder's physical gesture expectation, not merely an internal TabView index label.
