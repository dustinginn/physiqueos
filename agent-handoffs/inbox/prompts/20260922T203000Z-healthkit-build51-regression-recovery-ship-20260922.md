Task id: healthkit-build51-regression-recovery-ship-20260922

Recover and finish the interrupted Build 51 HealthKit automatic-catch-up regression task, preserving all completed work and shipping the corrected Native build if the recovered candidate passes final gates.

This task is for an alternate existing Mac-originated Claude session because the original Remote Control connection was lost. Do not wait for the disconnected session. Do not create another Remote Control session.

Use Sonnet High.

Recovery facts established by a separate strictly read-only inspection

Original task:
healthkit-build51-foreground-catchup-regression-20260922
still marked claimed in GitHub because the original session disconnected before publishing completion.

Recovered worktree:
/Users/dustinginn/Developer/PhysiqueOS/server/.claude/worktrees/bridge-cse_01A2poR9j9mopgMyLLW8SJU6

Recovered branch:
claude/healthkit-background-automation-native

Recovered HEAD:
cccd7e2e1ed71d2c9a9c8f81c26a2b8645e16025

Commit subject:
Native: fix automatic Nutrition catch-up always failing (Build 51 regression)

Recovery inspection established:
- worktree clean;
- no uncommitted/staged/untracked work;
- recovered commit is pushed to origin;
- branch is fully pushed;
- Build 51 already on App Store Connect was archived/uploaded BEFORE cccd7e2e and therefore does NOT contain this fix;
- Build 51 delivery was 04e929ea-c751-4a84-b4aa-5331f5d6b20d and was VALID;
- no valuable work was lost from the prunable /private/tmp/hk-b51-diag worktree;
- original session appeared to be running final tests shortly before connectivity was lost, but do not assume those tests completed.

Do not discard/reimplement cccd7e2e. Start by inspecting and validating the recovered candidate.

Current observed production/device failure that prompted the fix

Build 51 automatic ingestion failed on the real device without canary/manual Sync.

Apple Health around 11:03 AM Sep 22:
- Move 624 cal
- Exercise 105 min
- Stand 5 hr
- Steps 5,218
- additional Nutrition data had also been added.

PhysiqueOS remained stale after ordinary close/reopen:
- Log Activity 166 active calories
- Log Nutrition 456 kcal / 62P / 40C / 7F
- Activity Evidence Report 166.268 active cal / 30 exercise min / 2 stand hr
- projected canonical records were stale, not merely Log UI.

Manual sync path had previously worked.

Production Server at interruption:
924d5e556ba418ceb64de828d4c6a7c06d99f769
deployment c2442650-a9a0-499e-bc42-59b81c0c8bae
Canonicalization open-ended from Sep 22.
Projection and evidence eligibility enabled from Sep 22.
Sep 21 remains validation-only.
Workout activation OFF.

Step 1 — recover exact work

Reverify live Server authority and Native branch/worktree authority.

Inspect:
- cccd7e2e diff;
- its parent chain from Build 51;
- any test artifacts/logs left by the interrupted session;
- local DerivedData/test result bundles if useful;
- git reflog/history;
- origin branch state.

Determine exactly what root cause cccd7e2e fixes and what tests the original session added.

Do not modify anything until this is understood.

Step 2 — answer Activity question before shipping

The commit subject specifically says Nutrition catch-up always failing.

Determine whether the same underlying defect also explains the observed stale Activity, or whether Activity had a separate cause.

Use source/tests and bounded read-only production evidence. Do not use canary/manual Sync.

Trace:
ordinary app launch/foreground -> automatic coordinator -> HealthKit Activity/Nutrition queries -> aggregation -> revision -> upload -> Server raw observation -> canonicalization -> projection.

If cccd7e2e fixes only Nutrition and Activity remains broken, do not ship an incomplete build. Implement the smallest Activity correction, test and review it.

If Activity was stale for a different non-code reason, prove it.

Step 3 — complete all final gates

Because the original session may have been in final testing when disconnected, rerun/verify rather than assuming completion.

At minimum:
- focused automatic-sync tests;
- Activity automatic catch-up tests;
- Nutrition automatic catch-up tests;
- lifecycle foreground/cold-launch tests;
- unchanged-data idempotency tests;
- revision advancement tests;
- date rollover tests;
- Sandbox isolation tests;
- full Native unit suite;
- full relevant TrainingAcceptanceUITests / UI acceptance suite that previously caught the Sandbox permission regression;
- project generation/release-config checks;
- Debug and unsigned Release compile as appropriate;
- git diff --check;
- HealthKit entitlements/usage strings unchanged unless reviewed reason exists.

Mutation-test the guard/root-cause fix if not already proven.

Step 4 — independent review

Fresh-context review exact final Native candidate.

Challenge:
- Nutrition automatic catch-up root cause/fix;
- Activity automatic catch-up;
- foreground/cold-launch lifecycle;
- background observer registration;
- durable revision state;
- idempotency;
- Sandbox isolation;
- broad HealthKit auth scope decision remains as Founder previously authorized;
- Workout canary capability preserved but activation OFF;
- no canary/manual Sync dependency for routine A/N ingestion.

Fix blockers/majors and re-review exact final SHA.

Step 5 — release as the next build

Do NOT overwrite/reuse Build 51. The TestFlight Build 51 binary predates cccd7e2e.

If candidate passes:
- use next sequential build number, expected Build 52;
- this Build 52 is the HealthKit automation hotfix;
- previously planned performance optimization and Training performance-record work move to Build 53; do not mix them into this hotfix;
- bump metadata deterministically;
- commit metadata separately;
- archive from clean exact SHA;
- verify bundle/team/version/build/arm64/signature/dSYM/encryption;
- verify HealthKit entitlements/usage strings;
- upload via established Admin App Store Connect API-key path;
- capture delivery and Apple VALID state.

If classifier requires Founder approval for archive/upload, publish the blocker and ask. Do not work around it.

Step 6 — real-device acceptance instructions

After upload/VALID, tell Founder only:
- install the corrected build;
- do NOT enable canary;
- do NOT press manual Sync;
- open/use PhysiqueOS normally;
- compare Apple Health Activity/Nutrition against normal Log/Evidence after foreground/catch-up;
- report result.

Acceptance:
- ordinary foreground/cold launch causes current HealthKit Activity and Nutrition to be queried automatically;
- changed values produce revision/upload automatically;
- canonical day advances exactly once;
- Log/Evidence reflect it;
- unchanged reopen is idempotent;
- Sep21 unchanged/ineligible;
- Workout activation remains OFF;
- Sandbox regression absent.

GitHub task lifecycle

The original task is still claimed. Do not corrupt its lifecycle.

Use this new recovery task as the authoritative takeover task. In the final handoff, explicitly state that it supersedes/completes the interrupted work of healthkit-build51-foreground-catchup-regression-20260922 and identify the recovered commit.

Do not attempt unsafe double-completion of the old claimed task if the inbox tool rejects it. Report the stale claimed old task for later cleanup.

Publish a handoff at any Founder-action blocker and final completion.

Final report:
- recovered worktree/branch/commit;
- root cause;
- whether Activity shared the Nutrition cause;
- exact final candidate SHA;
- tests/review;
- next build number;
- archive/upload/VALID state;
- old claimed-task disposition;
- exact real-device retest action.

Flags:
RECOVERED_INTERRUPTED_WORK
RECOVERED_COMMIT_CCCD7E2E_VALIDATED
NUTRITION_ROOT_CAUSE_CONFIRMED
ACTIVITY_ROOT_CAUSE_CONFIRMED
ACTIVITY_FIX_REQUIRED_IN_ADDITION
AUTOMATIC_FOREGROUND_CATCHUP_TESTED
SANDBOX_ISOLATION_TESTED
FULL_NATIVE_SUITE_PASSED
UI_ACCEPTANCE_SUITE_PASSED
INDEPENDENT_REVIEW_APPROVED
BUILD51_BINARY_CONTAINS_FIX
NEXT_BUILD_NUMBER
NEXT_BUILD_UPLOADED
NEXT_BUILD_APPLE_VALID
SEP21_UNCHANGED
WORKOUT_ACTIVATION_ENABLED
OLD_TASK_STILL_STALE_CLAIMED
READY_FOR_REAL_DEVICE_AUTOMATIC_RETEST
