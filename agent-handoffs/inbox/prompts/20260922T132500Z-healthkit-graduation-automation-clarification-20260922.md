Task id: healthkit-graduation-automation-clarification-20260922

Continue the active HealthKit Phase 2 work. This task supersedes/clarifies the remaining steps of the currently claimed graduation task. Resolve the entire Activity + Nutrition transition coherently rather than treating these as isolated questions.

Use the current HealthKit Phase 2 Claude chat. Sonnet High is appropriate.

Current observed state

Build 50 is installed. Projection policy has been applied for Activity + Nutrition effective 2026-09-22 onward, no backfill. Evidence eligibility remains OFF. Workout remains OFF.

Founder enabled the Native canary control and tapped the Sep 22 Activity/Nutrition sync once. Device then showed:
- test day 2026-09-22
- current day / partial
- Activity observations uploaded: 1
- Nutrition observations uploaded: 0
- pending batches: 0
- last acknowledgement 2026-09-22 6:17 AM Founder-local
- Server canonicalized: Nothing new
- warning: Server stored this day raw and did not canonicalize it (after activation window); tell coordinating agent before syncing again.

Do not ask Founder to sync again until the cause and safe next step are established.

Questions that must be answered from code + production evidence, not assumptions

1. Why was the Sep 22 Activity observation accepted raw but not canonicalized?
2. Is canonicalization still bounded to the old exact Sep 21 test-day policy even though projection is now prospective from Sep 22?
3. What exactly does the Native canary toggle control?
4. What exactly does "Sync test day now" trigger?
5. In Build 50 today, does Activity/Nutrition observation happen:
   - automatically in background,
   - automatically on foreground,
   - only when manual Sync is tapped,
   - or some combination?
6. Is HealthKit background delivery currently registered/enabled for Activity/Nutrition sample types?
7. If registered, what wakes the app, what is persisted, what gets uploaded, and what happens after process termination/reboot/offline periods?
8. If not registered, state that clearly. Do not describe desired behavior as current behavior.
9. Can the already-stored Sep 22 raw Activity observation be safely canonicalized/promoted after correcting policy, without requiring another device upload? If yes, prove idempotency and use the safest established path. If no, explain exactly why and tell Founder when to resync.
10. Why is Nutrition 0 observations at 6:17 AM? Determine whether Apple Health had no eligible Nutrition samples yet, whether Native suppressed an empty aggregate by design, or whether there is a defect.
11. What must be true before we can honestly say Activity + Nutrition HealthKit is "live" and no daily canary/manual action is required?

Required production architecture

Sep 21:
- remains validation-only HealthKit history;
- existing screenshot-derived ordinary Activity/Nutrition remain untouched;
- HealthKit Sep 21 must never project or become V3 eligible;
- no historical briefing regeneration.

Sep 22 onward:
- Activity + Nutrition canonicalization must be prospectively/open-ended enabled;
- no historical backfill;
- normal projection enabled;
- ordinary evidence eligibility enabled only after real projected Sep 22 data is verified;
- Apple Health provenance retained;
- no duplicate strategic observations;
- explicit Founder corrections retain precedence.

Permanent daily-driver behavior

The finished product must NOT require the Founder to:
- enable a canary every day;
- choose a test date every day;
- visit Founder Production;
- tap Sync every day;
- keep the app foregrounded for routine ingestion.

Desired permanent flow:
Apple Health changes -> PhysiqueOS observes/reconciles automatically -> Server canonical day updates -> normal Log/detail/Evidence/V3 use the data.

The Founder Production canary/test controls are diagnostics/testing scaffolding. In the permanent state they should not be required for ingestion. A manual "Sync now" may remain only as an optional recovery/debug action.

Work to perform

A. Reverify current Server/Native authority and current policies.

B. Diagnose the Sep 22 raw-only result.

C. Correct Server canonicalization policy/architecture so Activity + Nutrition canonicalization is open-ended from 2026-09-22 onward with no backfill, while Sep 21 remains excluded. If code changes are required, implement, test, independently review, deploy, and zero-write audit before policy mutation. If existing policy machinery already supports it, use the established guarded runner. Ask Founder only when the execution classifier requires direct approval.

D. Determine whether the stored Sep 22 raw Activity can be canonicalized after the policy correction without another device upload. Prefer safe reuse of the already-accepted observation if architecture supports it. Never duplicate it.

E. Verify normal projection with real Sep 22 data. Evidence eligibility remains OFF until this passes. Confirm Log/Activity/Nutrition/Evidence read behavior and Apple Health provenance. Nutrition with zero meals remains valid when daily totals exist.

F. Once projection is verified, proceed to the separately authorized evidence-eligibility step. If classifier requires direct Founder approval, ask. Then prove V3 sees each Sep 22+ canonical fact exactly once and Sep 21 HealthKit remains ineligible.

G. Background automation investigation and implementation.

Audit existing Native HealthKit background-delivery foundation before writing new code. Preserve the architectural invariant:
HealthKit observation -> canonical Activity/Nutrition -> ordinary evidence eligibility separately.

For Activity + Nutrition, implement whatever is missing for normal automatic operation:
- appropriate HealthKit background delivery / observer queries where supported;
- durable anchor/revision state across app launches;
- idempotent upload/retry;
- catch-up query after termination/relaunch;
- offline retry without duplicate canonical days;
- correct effective-date handling across midnight;
- no dependence on canary toggle;
- no dependence on the Founder diagnostic screen;
- no daily date selection.

Do not claim iOS guarantees immediate background execution. Document actual iOS/HealthKit delivery semantics and design for eventual catch-up.

H. Prove automation.

Before calling this finished, create a bounded acceptance procedure that demonstrates at least:
- canary toggle OFF / diagnostic screen untouched;
- HealthKit Activity/Nutrition changes occur normally;
- Server receives a new/revised observation without pressing Sync, where iOS background delivery occurs;
- if iOS does not deliver while terminated, relaunch catch-up uploads missed changes automatically without opening the diagnostic screen;
- process termination/relaunch does not reset revision state;
- repeated callbacks/retries are idempotent;
- date rollover updates the correct local day;
- no Sep 21 backfill;
- V3 receives only eligible Sep 22+ canonical facts.

If a new Native build is required for background automation, prepare/review it as the next build after Build 50. Do not pretend Build 50 already has behavior it does not have. Report whether Build 51 is required.

I. Workout remains OFF during this Activity/Nutrition automation work. Do not start the strength canary until Activity/Nutrition normal operation is stable, unless Founder explicitly changes priority.

J. Old test policy/canary cleanup.

Once normal prospective canonicalization is working:
- retire/deactivate the old exact Sep 21 test-day canonicalization policy while preserving its canonical validation history;
- ensure Native normal ingestion does not consult the canary toggle;
- decide whether Founder diagnostic controls should be hidden/relabelled in production builds, but do not redesign unnecessarily.

Testing/review

Run all relevant Server HealthKit, V3, briefing, Training and policy regressions.
Run Native HealthKit/background lifecycle tests if Native changes.
Test duplicate/revision/date-rollover/offline/relaunch behavior.
Independent fresh-context review exact candidates.
No schema/cost changes without surfacing them first.

GitHub protocol

This is a continuation/clarification of the active HealthKit graduation work. Publish a handoff at every Founder-action blocker and final completion. Do not silently wait.

Final report must answer plainly:
- What caused Sep 22 raw-only storage?
- What does the canary toggle do?
- What does manual Sync do?
- Was Build 50 background syncing before this task: YES/NO/PARTIAL, with exact behavior?
- Is canonicalization now open-ended from Sep 22: YES/NO?
- Was the existing raw Sep 22 Activity reused or was resync required?
- Why was Nutrition 0 at 6:17 AM?
- Are normal projections live?
- Is ordinary Evidence/V3 eligibility live?
- Does routine ingestion now require canary toggle: YES/NO?
- Does routine ingestion now require manual Sync: YES/NO?
- Is background delivery implemented: YES/NO?
- Is durable relaunch catch-up implemented: YES/NO?
- Is another Native build required?
- Exact next Founder action.

Explicit flags:
SEP22_RAW_ONLY_ROOT_CAUSE_FOUND
CANARY_TOGGLE_SEMANTICS_DOCUMENTED
MANUAL_SYNC_SEMANTICS_DOCUMENTED
BUILD50_BACKGROUND_BEHAVIOR_PROVEN
CANONICALIZATION_OPEN_ENDED_FROM_SEP22
SEP21_REMAINS_VALIDATION_ONLY
SEP22_RAW_ACTIVITY_REUSED_SAFELY
SEP22_RESYNC_REQUIRED
NUTRITION_ZERO_OBSERVATION_EXPLAINED
NORMAL_PROJECTION_ENABLED
EVIDENCE_ELIGIBILITY_ENABLED
SEP21_HEALTHKIT_V3_ELIGIBLE
DUPLICATE_STRATEGIC_OBSERVATION_PRESENT
ROUTINE_CANARY_TOGGLE_REQUIRED
ROUTINE_MANUAL_SYNC_REQUIRED
BACKGROUND_DELIVERY_IMPLEMENTED
DURABLE_REVISION_STATE_IMPLEMENTED
RELAUNCH_CATCHUP_IMPLEMENTED
WORKOUT_ACTIVATION_ENABLED
NEXT_NATIVE_BUILD_REQUIRED
READY_FOR_NORMAL_AUTOMATIC_ACTIVITY_NUTRITION
