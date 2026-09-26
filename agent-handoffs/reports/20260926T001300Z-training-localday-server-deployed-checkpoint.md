# Training aggregation Server 09f04dc5 DEPLOYED: checkpoint

Task id: `claude-training-aggregation-server-deploy-20260925`
Lane pointer: `agent-handoffs/training-localday/latest.json`. HealthKit `latest.json`/`latest.md` and `performance/latest.json` untouched.
Governing prompt: `agent-handoffs/inbox/prompts/20260925T190000Z-claude-training-aggregation-server-deploy.md` (Founder-authorized Server deployment + read-only postdeploy acceptance only).

**Server `09f04dc54eb26bfccdd2aeb34b156d8fc7d3f80e` is LIVE (deployment `e979ee19-44f3-4c7a-ab2b-3c6e4f773349`). Native Build 60 is unchanged. Native `c15f0881` is NOT released. The Native local-day/rollover behaviour is NOT live yet. Build 61 still waits for the prospective Cardio acceptance.** STOP.

## Deployment
| Item | Value |
|---|---|
| Deployment | `e979ee19-44f3-4c7a-ab2b-3c6e4f773349`, ACTIVE 9/9 (cause: manual force-rebuild), created 2026-09-25T23:52:49Z |
| Superseded | `c4d8484e-0bfa-4d07-9cf4-0cf591ac3ee2` (was `afdc849a`) |
| Spec-update deployment | `8e8b764c-0493-491e-a4a4-c79d90fb85c7`, CANCELED by the force-rebuild (expected) |
| web / worker source_commit_hash | `09f04dc5…` / `09f04dc5…` (exact) |
| Build id | `physiqueos-09f04dc5-20260925` (`/api/v1/health/live`, started 2026-09-25T23:56:03Z) |
| Runtime log envelopes | web and worker `gitSha` = `09f04dc5…`, `buildId` = `physiqueos-09f04dc5-20260925` |
| Health | live 200 `ok`; ready 200, all 9 checks ready (schema `PROVIDER_MIGRATION_000014_APPLIED`) |
| Migrations | 14 before and after (`000014_evidence_intake_text_provenance`); no migration in the diff |
| Error logs | 0 on web and worker (the only 401 is the deliberate unauthenticated refresh probe used to emit an envelope) |

Procedure (under `set -e`, each step verified before the next): preconditions (clean exact HEAD, production branch head exactly `afdc849a`, ancestry) -> exact quoted fast-forward `afdc849a..09f04dc5` of `combined-app-platform-cutover`, no force, `ls-remote` verified -> `apps update --spec` changing exactly 4 values (`PHYSIQUEOS_GIT_SHA`, `PHYSIQUEOS_BUILD_ID` on web and worker; live spec byte-compared to the pre-read copy first; rollback fields untouched) -> `create-deployment --force-rebuild`.

## Predeploy (all passed)
- Authority: single web service + worker; `c4d8484e` ACTIVE on `afdc849a` (web+worker), nothing pending/in progress; live/ready 200.
- `09f04dc5` = clean 5-commit fast-forward descendant of `afdc849a`, pushed, worktree clean; diff has no db/migration/schema/infra/package/Docker file.
- **Production webpack build on exact `09f04dc5`: exit 0, "Compiled successfully"** (artifacts removed).
- Zero-write audits (identity-gated, `READ ONLY` transaction, owner-scoped SELECTs, `ROLLBACK`) vs the Performance lane's postdeploy snapshot of `afdc849a` (~21:30Z): Training Day probe 0 diffs; workout policy/workouts/links/claims/strategic state identical except organic HealthKit ingestion for TODAY only (7 new non-workout observations; the Sep 25 canonical Activity day updated; Sep 21–24 Activity days identical; workout observations 9, unchanged). No unexpected drift.

## Postdeploy correctness (same probes, pre `afdc849a` vs post `09f04dc5`)
1. **Workout/strategic audit** (window 2026-09-22..27): identical except runtime labels — workout policy enabled `[cardio, strength]`, effective 2026-09-23 open-ended, historical backfill false, link auto-confirm false (quarantined strategic eligibility unchanged); 9 canonical workouts (6 cardio, 3 strength); observation states; duplicate checks; Logger Strength sessions; link status `confirmed: 2`; one-to-one integrity; ambiguous auto-links; **all 35 strategic digests identical (no briefing regeneration)**; migrations 14.
2. **State inventory**: identical except runtime labels (observations, canonical workout records, link records, workout/graduation/daily policies, configuration digests, audit rows, Activity days Sep 21–25).
3. **Training Day probe (Sep 20–25)**: 0 diffs.
4. **Compiled-code markers**: every prior HealthKit/Cardio/Performance marker present in the same file counts (Training Day/Session Cardio events, Indoor/Outdoor/cycle vocabulary, `isIndoorWorkout` fidelity, settlement gate, Training Day store queries, the three Performance Phase 2 Native projection allowlists); new markers present (aggregate Cardio store query + family SQL, landing/reporting unavailable events, Native Library skip, zone validator).

### Training acceptance (Sep 21–24), production data
| Day | Recent Training History BEFORE -> AFTER | Training Day | Reporting history |
|---|---|---|---|
| Sep 20 | 3 -> 3 | 3 (unchanged) | 3 -> 3 |
| **Sep 21** | **3 -> 3** (Outdoor Walk ×2 + Traditional Strength Training) | 3 (unchanged) | 3 -> 3 |
| **Sep 22** | **3 -> 3, not 5** (HealthKit duplicates suppressed) | 3 (unchanged) | 3 -> 3 |
| **Sep 23** | **1 -> 3** (Walking, Walking, Traditional Strength Training) | 3 (unchanged) | 1 -> 3 |
| **Sep 24** | **1 -> 3** (Walking, Walking, Traditional Strength Training) | 3 (unchanged) | 1 -> 3 |
| Sep 25 | — | 0 | — |
- Latest Training day on the landing (feeds Build 60's Evidence Hub training stream): Sep 24 "1 session" -> "3 sessions". Training day count 79 -> 79.
- Reporting overview "Sessions" 235 -> 239 (the four reconciled walks); latest-day "Active Calories" 0 -> 346 (the two Sep 24 walks) — the reviewed presented-workout contract.
- Native Training Library exercise payload: 13,978 B, digest identical. Resistance presentation digest identical. Resistance performance: baseline code and candidate code run on the live container at the same moment produce identical output (0 raw diffs); its digest moved vs the 23:50Z pre-run only because the content is wall-clock dependent (the baseline code yields the same new digest), not because of the deploy.
- No HealthKit Strength duplicate session (one Strength per day); Cardio rows carry no exercises and open the existing Cardio detail (no Logger/link/claim); generic historical walks stay "Walking"; web Cardio breakdown adds "Walking 4", existing buckets unchanged.

### Performance parity (same zero-write benchmark, live container)
| Read | Pre (afdc849a, warm) | Post (09f04dc5, warm) |
|---|---|---|
| Training landing | 331 / 339 ms | 131 / 131 ms |
| Training reporting | 275 / 472 ms | 500 / 503 ms |
| Native Library | 151 / 92 ms | 154 / 79 ms |
| Native landing payload | 138,022 B | 140,875 B (+2.1%) |
| Native reporting presentation | 29,525 B | 30,121 B |
| Native Library payload | 13,978 B | 13,978 B |
Cold first round: landing 403 -> 550 ms, reporting 573 -> 808 ms, library 229 -> 341 ms (shared-DB noise range). Queries per landing+reporting+library round 9 -> 11 (one bounded Cardio SELECT each for landing and reporting; Native Library +0). No common path near 3 s; landing well under 1–2 s; no drift toward multi-MB payloads; Performance Phase 2 gains preserved (landing ~141 KB vs the pre-Phase-2 1.65 MB; Library ~14 KB vs 191 KB; projection allowlists present).

## Backward compatibility with Build 60 (local-day)
Build 60 sends no `timeZone`: the deployed contract resolves an absent zone to null, so Logged Today and the weigh-in future-date guard use exactly the canonical user zone as before (unit-tested contract `getLog({ timeZone: null })`; weigh-in without zone judged by the canonical day), Home/Morning Check-In ignore any zone, and briefing/schedule modules cannot consume a requested zone. **The Native rollover/zone fix (c15f0881) is NOT live; Build 60 daily-driver behaviour is unchanged until a Build 61.** No Native read or write errors in the logs since the deploy.

## HealthKit / strategic safety
Workout policy v4 [cardio, strength], quarantined / no backfill / no auto-confirm — unchanged; canonical workouts and deferred state unchanged; `isIndoorWorkout` / prospective Cardio ingestion path unchanged (markers identical; no ingestion/classifier file in the diff); Sep 23/24 Activity totals unchanged; Strength links/claims unchanged; strategic digests unchanged; no briefing regeneration. **No production data was written.**

## Explicit statements
- Build 60 (`00321dcc`) unchanged.
- Native `c15f0881` unreleased (and Performance `c736254b` unreleased).
- Local-day Native behaviour not live yet.
- Build 61 still waits for tomorrow's prospective Cardio acceptance on Build 60 and a separate authorization.

## Disk
~17.9–19 GiB free throughout; one webpack build (removed) and one temporary baseline tree (removed).

## Flags
AUTHORITY_REVERIFIED · CLEAN_FAST_FORWARD_VERIFIED · PREDEPLOY_ZERO_WRITE_AUDIT_PASS · SERVER_DEPLOYED · WEB_WORKER_SOURCE_COMMIT_EXACT · RUNTIME_SHA_EXACT · HEALTH_LIVE_READY_PASS · MIGRATION_STATE_UNCHANGED · POSTDEPLOY_ZERO_WRITE_AUDIT_PASS · SEP21_HISTORY_THREE · SEP22_HISTORY_THREE_DEDUP · SEP23_HISTORY_THREE · SEP24_HISTORY_THREE · TRAINING_DAY_UNCHANGED · REPORTING_SEMANTICS_PASS · NATIVE_LIBRARY_UNCHANGED · TRAINING_PERFORMANCE_PARITY_PASS · PERFORMANCE_PHASE2_SERVER_GAINS_PRESERVED · HEALTHKIT_PROSPECTIVE_CARDIO_PATH_UNCHANGED · STRATEGIC_STATE_UNCHANGED · BUILD60_UNCHANGED · NATIVE_C15F0881_UNRELEASED · LOCALDAY_NATIVE_NOT_LIVE_YET · GH_REPORT_PUBLISHED
PRODUCTION_MUTATED = false · TESTFLIGHT_UPLOADED = false
