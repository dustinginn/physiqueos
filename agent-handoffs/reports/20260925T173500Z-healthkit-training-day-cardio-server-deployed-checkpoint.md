# HealthKit — Training Day Cardio presentation fix DEPLOYED (Server a399916a) — deployment checkpoint

Generated: 2026-09-25 (UTC ~17:35)
Task id: `claude-healthkit-training-day-cardio-server-deploy-20260925`
Agent: Claude (HealthKit lane). Governing prompt: `agent-handoffs/inbox/prompts/20260925T123000Z-claude-healthkit-training-day-cardio-server-deploy.md`.

## Result: DEPLOYED AND VERIFIED. STOPPED FOR FOUNDER ON-DEVICE ACCEPTANCE.
**Native Build 60 is unchanged (`00321dcc…`, Apple delivery `23788859…`, VALID) and NO Build 61 is required** — Native renders whatever `sessions[]` the Server returns and opens each row's `href`. No workout-policy change, no strategic-eligibility change, no reconciliation, no backfill, no historical briefing regeneration, no Native archive/upload, no production evidence/workout data mutation (the only production change is the Server deployment itself).

## What was deployed
| | |
|---|---|
| Server SHA | `a399916ac9b1c9128067f0f77fb7fd05666aa92a` (3 commits, 7 files: `TrainingNavigationReadService`, `TrainingReadService` classifier, new `HealthKitCardioTrainingPresentation`, one exported gate in `HealthKitWorkoutPresentationService`, a SELECT-only query in `PostgresTrainingNavigationReadStore`, two test files) on top of `e88b8ef78fa236ce09660997f4084bde069018a7`; **no migration/schema file** |
| Production branch | `combined-app-platform-cutover` `e88b8ef7` -> `a399916a` (quoted-refspec fast-forward under `set -e`, verified with `git ls-remote`) |
| Stamps | `PHYSIQUEOS_GIT_SHA=a399916a…` and `PHYSIQUEOS_BUILD_ID=physiqueos-a399916a-20260925` on BOTH web and worker (spec diff asserted to be exactly 4 changed values; spec copies deleted) |
| Deployment | `66ee39f6-c4d7-49c8-9012-3de1a77a832c` ACTIVE (cause `manual`, force-rebuild), ACTIVE ~17:27Z; the stamp-only spec-update deployment `cf158a44…` was CANCELED (documented behaviour); previous `9727de79…` SUPERSEDED |
| App | `bf57cf56-48cc-4cd6-90e4-a23ee5381741` |

## Pre-deploy gates (all passed before any mutation)
Candidate worktree clean at `a399916a` and identical on origin; production branch head `e88b8ef7`; `e88b8ef7` proven an ancestor (clean fast-forward, 3 commits); diff contains 0 migration/schema/`.sql` files; control plane ACTIVE `9727de79`, web+worker `e88b8ef7`, nothing pending; `/live` 200, `/ready` healthy with `PROVIDER_MIGRATION_000014_APPLIED`; disk 18.9 GiB (floor 15). A zero-write pre-deploy baseline was captured (below).

## Post-deploy verification
- **Control plane / identity:** deployment `66ee39f6` ACTIVE; `web` and `worker` `source_commit_hash` both exactly `a399916ac9b1c9128067f0f77fb7fd05666aa92a`; spec stamps match; nothing pending; fresh web/worker log envelopes carry only `gitSha a399916a…` / buildId `physiqueos-a399916a-20260925` (zero `e88b8ef7` lines after deploy); the in-component read-only payloads' runtime-SHA gate (`PHYSIQUEOS_GIT_SHA == a399916a`) passed.
- **Health:** `/api/v1/health/live` 200 (build id new); `/api/v1/health/ready` `ready`, no failing checks, `schema PROVIDER_MIGRATION_000014_APPLIED`, 5/5 then 3/3 samples; migrations unchanged (14, last `000014_evidence_intake_text_provenance`).
- **Logs since deploy (web + worker):** 0 error-level lines, 0 `settlement_gate_error`, 0 `healthkit_cardio_unavailable`; worker cadence ticks normal (all three cadences ineligible — Friday); the only warn is my own deliberate unauthenticated 401 probe used to emit a fresh envelope.
- **Deployed code present in the running container (read-only file scan):** `training.day.healthkit_cardio_unavailable`, `training.session.healthkit_cardio_unavailable`, `Indoor Walk`, `Outdoor Cycle`, `listHealthKitCanonicalWorkoutsForDate`, `getHealthKitCanonicalWorkout` and the widened `cycl(?:e|ing)` classifier all present, alongside the earlier settlement/fidelity code (the presentable-gate function name is mangled by production minification, so it has no string-literal marker).

## Zero-write post-deploy audit vs the pre-deploy baseline (same payloads, `BEGIN … READ ONLY`, rolled back)
- **Policy still v4 `["cardio","strength"]`**, quarantined, `historicalBackfill false`, `linkAutoConfirm false` — record IDENTICAL; Activity/Nutrition daily and graduation policies IDENTICAL.
- **The four reconciled Cardio workouts and all 9 canonical workouts (4 reconciled Cardio + 2 Sep 22 canary Cardio + 3 Strength): IDENTICAL**; all 9 workout observation rows identical; **deferred backlog 0**.
- **Sep 23 / Sep 24 whole-day Activity totals unchanged:** 782.698 kcal (rev 51) and 914.709 kcal (rev 18), both `complete_day`, all Activity numerics identical. Activity Day code is untouched by the diff.
- **Strength links (2) and claims (4): count and content IDENTICAL**; link status `confirmed 2`, one-to-one integrity zeros, `ambiguousAutoLinked 0`, Logger Strength sessions 3; no Cardio link/claim.
- **Strategic state: all 35 strategic-collection digests IDENTICAL** pre vs post (Goal, Confidence, briefing, plan, protocol, evidence, and every training collection); `healthKitWorkoutsStrategicEligible 0`. **No production data mutation occurred.**

## Training Day verification on production data (real deployed store query + day model, read-only)
| Date | Result | Verdict |
|---|---|---|
| Sep 21 | Outdoor Walk, Outdoor Walk, Traditional Strength Training (`hasWalking/hasCardio` true) — byte-identical to before | PASS (no regression) |
| Sep 22 | Outdoor Walk, Outdoor Walk, Traditional Strength Training — the 2 canonical HealthKit duplicates are **suppressed** (`suppressedAsDuplicate 2`, `projectedCardioRows 0`) | PASS |
| **Sep 23** | **Walking, Walking, Traditional Strength Training** — rows `72b253ae32` "18 min · 0.94 mi · 79 active cal", `73911e3c8f` "16 min · 0.96 mi · 107 active cal"; header flags Walking/Cardio, 1 strength session | PASS |
| **Sep 24** | **Walking, Walking, Traditional Strength Training** — rows `d72350fc8d` "18 min · 1.01 mi · 158 active cal", `70e5b3cfc0` "16 min · 1.01 mi · 188 active cal" | PASS |
| Sep 25 (current, no workout) | empty day, `hasWalking/hasCardio` false — unchanged | PASS |
**Cardio row detail path:** running the real `getDay` -> `getSession` code over the real production canonical records (fetched read-only into an owner-only local file, deleted afterwards), each of the four rows opens the existing Cardio detail: `label "Walking"`, `value` "N active cal", telemetry (duration, active calories, average heart rate, start/end), `sourceEvidence ["Apple Health"]`, `exercises []`, no `healthKitAttachment`, and no logger-session/link/claim/confirmation fields. Generic historical walking remained generic (none stored `isIndoorWorkout`). Stated limits: the rendered phone UI and the authenticated HTTP endpoints were not exercised by me (the real store query, adapter, day model and session-detail code were).

## Founder on-device acceptance (Build 60, no app update needed) — please check
1. **Training Day Sep 21:** unchanged — two Outdoor Walk rows + Traditional Strength Training, header "Quads · 1 strength session · 4 exercises · Walking · Cardio".
2. **Training Day Sep 22:** unchanged — no duplicate walk rows.
3. **Training Day Sep 23:** two **Walking** rows (generic — expected, `isIndoorWorkout` was never stored) followed by Traditional Strength Training; header now includes Walking · Cardio.
4. **Training Day Sep 24:** same shape (two Walking + Strength).
5. Tap a Walking row: opens the existing Cardio detail (time range/duration/active cal/heart rate from Apple Health), with no exercises, no Logger/link/confirm controls.
6. **Activity Day** Sep 23/24 unchanged (totals ≈ 783 / 915 kcal; workout vs non-workout split as before).
7. Strength detail (Sep 23 confirmed, Sep 24 candidate) still healthy.
Known non-blocking follow-ups (unchanged from the diagnostic report): Training landing/history/reporting/library counts still read only evidence collections and will not yet count reconciled Cardio; the first new post-activation Cardio workout with `isIndoorWorkout` metadata remains the empirical Indoor/Outdoor type-fidelity acceptance (PENDING).

## Flags
AUTHORITY_REVERIFIED · CLEAN_FAST_FORWARD_VERIFIED · SERVER_DEPLOYED (a399916a) · WEB_WORKER_SOURCE_COMMIT_EXACT · RUNTIME_AND_LOG_SHA_EXACT · ACTIVE_DEPLOYMENT_66ee39f6 · HEALTH_LIVE_READY_PASS · MIGRATION_STATE_UNCHANGED · POSTDEPLOY_ZERO_WRITE_AUDIT_PASS · POLICY_V4_CARDIO_STRENGTH_UNCHANGED · FOUR_CARDIO_WORKOUTS_UNCHANGED · DEFERRED_BACKLOG_ZERO · ACTIVITY_TOTALS_UNCHANGED · STRENGTH_LINKS_CLAIMS_UNCHANGED · STRATEGIC_STATE_UNCHANGED (35/35 digests) · TRAINING_DAY_SEP21_SEP22_UNCHANGED · TRAINING_DAY_SEP23_SEP24_WALKING_WALKING_STRENGTH · SEP25_UNCHANGED · CARDIO_DETAIL_PATH_NO_LOGGER_LINK_CLAIM · NO_UNEXPECTED_ERROR_LOGS
FALSE (as required): NATIVE_CHANGED · BUILD61_REQUIRED · TESTFLIGHT_UPLOADED · POLICY_MUTATED · FURTHER_RECONCILIATION · PRODUCTION_DATA_MUTATED_BY_AGENT

## Disk (STANDING_DISK_SAFETY)
Free space 18.8–19 GiB throughout (floor 15); no Native build/archive/suite. The temporary local test file and the owner-only records file (raw production canonical records) were deleted; no raw ids or credentials appear in this report.
