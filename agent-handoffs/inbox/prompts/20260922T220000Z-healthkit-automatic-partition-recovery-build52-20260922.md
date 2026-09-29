Task id: healthkit-automatic-partition-recovery-build52-20260922

Finish Build 52 correctly by fixing the remaining automatic HealthKit ingestion defects before any App Store Connect upload.

Continue in the same alternate Mac-originated Claude session that recovered the interrupted work. Do not create Remote Control. Use Sonnet High.

Current authority/recovered state

Production Server:
924d5e556ba418ceb64de828d4c6a7c06d99f769
deployment c2442650-a9a0-499e-bc42-59b81c0c8bae

Current Build 52 candidate:
c638124317e27717c234976e6ac61e22f00f30d
Build 52 archive already exists but MUST be treated as superseded/unshippable because the Activity defect below is unresolved.
Do not upload that archive.

Recovered Native branch/worktree:
claude/healthkit-background-automation-native
/Users/dustinginn/Developer/PhysiqueOS/server/.claude/worktrees/bridge-cse_01A2poR9j9mopgMyLLW8SJU6

Nutrition fix from cccd7e2e was validated.
Follow-up test coverage commit 3ff2b2b6 was added.
Prior final candidate/archive c6381243 passed 1278 unit tests, 12/12 UI acceptance tests, Debug/Release compile and archive verification, but upload was blocked and should now remain blocked until this task is complete.

Known Activity root cause

Live production logs showed HEALTHKIT_INGESTION_PURPOSE_IMMUTABLE HTTP 409 around 2026-09-22T18:08:25Z, matching the real-device stale Activity report.

The automatic Activity path collided with an external identity previously used by the canary/manual path. Server purpose immutability correctly rejected the attempted reuse.

A second real defect was identified: an automatic sync partition marked permanently rejected has no recovery path. A single permanent rejection can silently stall that domain/device indefinitely. Current recovery may require clearing Application Support/reinstall, which is unacceptable for normal operation.

Goal

Fix both architectural defects before Build 52 ships:
1. automatic HealthKit ingestion identities must be namespaced so they cannot collide with canary/manual/test identities;
2. automatic synchronization must safely recover from permanently rejected partitions instead of silently remaining poisoned forever.

Preserve all previously accepted behavior:
- Sep 21 HealthKit remains validation-only and never graduates;
- Sep 22+ Activity/Nutrition canonicalization, projection and evidence eligibility remain live;
- no historical backfill;
- Workout activation remains OFF;
- Workout canary capability remains in Native;
- Nutrition automatic catch-up fix remains intact;
- Sandbox isolation remains intact;
- routine Activity/Nutrition ingestion must not require canary or manual Sync.

Audit before patching

Reverify production and branch authority.

Map identity generation for:
- canary/manual Activity;
- canary/manual Nutrition;
- automatic Activity;
- automatic Nutrition;
- any background callback vs foreground catch-up variants.

Identify exact external ID / purpose / idempotency keys used at each layer:
HealthKit aggregate/revision -> Native batch/partition -> upload request -> Server intake receipt/observation/canonical day.

Prove the collision mechanism that caused the 409. Do not merely infer from the log string.

Namespacing fix

Design stable, deterministic automatic-ingestion identity distinct from canary/manual identity.

Requirements:
- same underlying automatic observation/revision replay remains idempotent;
- foreground catch-up and background observer for the same automatic observation converge on the same automatic identity, not duplicate identities;
- automatic identity cannot collide with canary/manual/test identity;
- Activity and Nutrition domains cannot collide with each other;
- device/source/date/revision semantics remain stable;
- do not use random UUID per retry;
- no broad historical migration/backfill required.

If Server contract changes are needed to support namespacing, implement narrowly and preserve purpose immutability as a safety invariant. Do NOT weaken/remove purpose immutability merely to make the collision disappear.

Permanent-rejection recovery

Design a safe state machine for automatic partitions.

Classify errors:
- retryable/transient;
- permanent for the specific request/identity;
- permanent due to stale/colliding local identity that can be superseded by a corrected deterministic automatic identity;
- truly invalid data that should remain surfaced and not retry forever.

Requirements:
- a permanently rejected partition must not silently block all future revisions for that domain/device/day;
- corrected/new legitimate HealthKit revisions can progress;
- recovery cannot cause duplicate canonical days;
- retry loops must be bounded;
- no endless battery/network churn;
- local durable state records enough reason/status to diagnose;
- relaunch preserves recovery state;
- reinstall must NOT be the normal recovery mechanism;
- if user action is truly required, surface a diagnostic state rather than silently stalling.

For the known Build 51 poisoned Activity state, determine whether Build 52 can self-heal it after install without clearing app data. Prefer self-heal. If impossible without violating invariants, explain exactly why and propose the safest one-time migration/reset scoped only to HealthKit automatic sync state, not all PhysiqueOS data.

Do not delete canonical Activity/Nutrition history.

Nutrition

Ensure the validated Nutrition automatic-catch-up fix remains intact and receives the same identity/rejection protections.

Activity daily vs workouts

Reconfirm the previously observed Evidence Report state (stale daily active calories alongside linked workout calories) was a consequence of stale daily aggregate plus independently existing workouts, not a reason to sum workout calories into Move calories.

Never double count workout calories into daily active energy.

Testing

Add regression tests reproducing:
- canary/manual identity exists, automatic path attempts same underlying day -> no purpose collision after fix;
- exact old Build 51 behavior -> test fails on old code and passes on candidate;
- background + foreground same automatic revision -> one identity/one upload semantic;
- retry same automatic revision -> idempotent;
- permanent rejection -> later valid revision recovers;
- permanent identity collision -> corrected automatic namespace self-heals;
- truly invalid permanent payload does not retry forever;
- process termination/relaunch preserves recovery;
- Activity and Nutrition independent;
- Sep21 exclusion;
- Sep22+ prospective behavior;
- Sandbox isolation;
- Workout activation OFF.

Run full Native suite and relevant UI acceptance suite.
Run Server suites if Server code changes.
Run Debug/Release builds, project generation/release checks, diff check.
Mutation-test identity and rejection-recovery guards.

Independent review

Fresh-context adversarial review exact final candidate(s).

Challenge:
- weakening of purpose immutability;
- identity stability/idempotency;
- duplicate risk;
- retry loops;
- poisoned-state self-heal;
- battery/network churn;
- relaunch durability;
- Activity/Nutrition cross-domain collisions;
- canary/manual coexistence;
- Sep21 no-backfill;
- Sandbox isolation;
- Workout unaffected.

Fix blockers/majors and re-review exact SHA.

Production Server

If Server changes are required:
- deploy only after tests/review;
- use established production process;
- zero-write pre/post audit;
- preserve current canonical data/policies;
- no schema/cost changes unless surfaced first.

Build 52 release

After all fixes/gates/review:
- discard/supersede the existing c6381243 archive;
- retain build number 52 only if App Store Connect has NOT received Build 52 yet (current handoff says it has not);
- update metadata commit if final source SHA requires no version-number change;
- create a NEW Build 52 archive from exact clean final SHA;
- verify identity/signature/dSYM/entitlements/usage strings/encryption;
- upload via Admin API-key path;
- capture delivery and Apple VALID.

If this host classifier blocks upload again, publish a Founder-action blocker. Do not work around it.

Real-device acceptance

After corrected Build 52 is installed:
- Founder does NOT enable canary;
- Founder does NOT press manual Sync;
- ordinary app foreground/cold launch should self-heal the previously poisoned Activity state if designed;
- compare Apple Health Activity/Nutrition to PhysiqueOS normal Log/Evidence;
- verify canonical revisions advance once;
- repeat unchanged foreground is idempotent;
- verify no reinstall required if self-heal is claimed.

Do not start Workout canary until this passes.

Backlog numbering

This Build 52 is exclusively the HealthKit automatic-ingestion hotfix.
Previously planned performance optimization and Training performance-record audit move to Build 53. Do not mix them here.

GitHub protocol

Claim/complete through established inbox protocol.
Publish at any Founder-action blocker and final completion.

Final report must state:
- exact 409 collision mechanism;
- automatic namespace design;
- permanent-rejection recovery design;
- whether purpose immutability remains enforced;
- whether existing poisoned Build 51 Activity self-heals after Build 52 install;
- Nutrition fix status;
- Server changes/deploy if any;
- final Native SHA;
- tests/review;
- new archive/upload/VALID;
- exact real-device acceptance action.

Flags:
PURPOSE_IMMUTABILITY_PRESERVED
AUTOMATIC_IDENTITY_NAMESPACED
CANARY_AUTOMATIC_COLLISION_IMPOSSIBLE
BACKGROUND_FOREGROUND_IDENTITY_CONVERGES
PERMANENT_REJECTION_RECOVERY_IMPLEMENTED
POISONED_ACTIVITY_SELF_HEALS
REINSTALL_REQUIRED_FOR_RECOVERY
NUTRITION_AUTOMATIC_FIX_PRESERVED
ACTIVITY_WORKOUT_DOUBLE_COUNT_PREVENTED
SEP21_UNCHANGED
WORKOUT_ACTIVATION_ENABLED
SERVER_CHANGE_REQUIRED
SERVER_DEPLOYED
FULL_NATIVE_SUITE_PASSED
UI_ACCEPTANCE_SUITE_PASSED
INDEPENDENT_REVIEW_APPROVED
BUILD52_REARCHIVED
BUILD52_UPLOADED
BUILD52_APPLE_VALID
READY_FOR_REAL_DEVICE_AUTOMATIC_RETEST
