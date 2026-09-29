# Server e88b8ef7 deployed — production deployment checkpoint

Generated: 2026-09-25 (UTC ~15:00)
Task: Founder-approved deployment of the exact reviewed combined Server candidate `e88b8ef78fa236ce09660997f4084bde069018a7` (see `20260925T170000Z-midweek-v3-predeploy-integrity-final.md`).
Agent: Claude (Midweek Briefing Founder Takeover lane, secondary). Stopping after this checkpoint.

## Result: DEPLOYED AND VERIFIED — all requested post-deploy checks pass

**Not done (by instruction):** Native not merged/released; no Build 60 bump; no TestFlight upload; Cardio NOT activated; workout policy NOT mutated; no deferred workout reconciled; no historical briefing regenerated; no data/policy write of any kind. `latest.json`/`latest.md` untouched.

## What was deployed
| | Value |
|---|---|
| Server SHA | `e88b8ef78fa236ce09660997f4084bde069018a7` (19 commits, clean fast-forward of `01d1900bcbb9db32ce270e49c7d24e919ba0d7d7`) |
| Production branch | `combined-app-platform-cutover` `01d1900b` -> `e88b8ef7` (quoted refspec push under `set -e`, verified with `git ls-remote`) |
| Stamps | `PHYSIQUEOS_GIT_SHA=e88b8ef78fa2…` and `PHYSIQUEOS_BUILD_ID=physiqueos-e88b8ef7-20260925` on BOTH web and worker (spec diff asserted to be exactly 4 changed values) |
| Deployment | `9727de79-588e-4445-9306-53b0ee26971e` ACTIVE (cause `manual`, force-rebuild), reached ACTIVE 14:48:38Z |
| Superseded | spec-update deployment `54e3dd1f…` CANCELED (as documented, a stamp-only update alone would reuse the old commit); previous active `8da160ac…` (`01d1900b`) SUPERSEDED |
| App | `bf57cf56-48cc-4cd6-90e4-a23ee5381741` |
Native is unchanged at `2374e11a` (not deployed, not merged). No migration; migration state unchanged (14 migrations, last `000014_evidence_intake_text_provenance`, digest identical pre/post).

## Pre-mutation gates (all passed before any change)
Production reverified ACTIVE `8da160ac`, web+worker `01d1900b`, no pending/in-progress deployment; production branch head `01d1900b`; candidate branch head == `e88b8ef7`; `01d1900b` proven an ancestor of `e88b8ef7` (fast-forward); health live/ready 200; disk 17 GiB (floor 15). Zero-write PRE audit captured a baseline (`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, `transaction_read_only = on` verified, owner-scoped SELECT-only, explicit ROLLBACK, success marker observed once; runtime SHA gate = `01d1900b`).

## Post-deploy verification
- **Control plane:** ACTIVE `9727de79`; `web` and `worker` `source_commit_hash` both exactly `e88b8ef78fa236ce09660997f4084bde069018a7`; spec stamps match; nothing pending.
- **Runtime/log SHA:** fresh web and worker log envelopes carry `gitSha e88b8ef78fa236ce09660997f4084bde069018a7` and `buildId physiqueos-e88b8ef7-20260925` (no occurrence of the old SHA after deploy); the in-component zero-write audit's runtime gate (`PHYSIQUEOS_GIT_SHA == e88b8ef7`) passed.
- **Health:** `/api/v1/health/live` 200 (buildId new); `/api/v1/health/ready` `status: ready`, no failing checks, `schema: PROVIDER_MIGRATION_000014_APPLIED`; 8/8 consecutive samples healthy. (One earlier ad-hoc `/ready` sample returned a non-JSON body once, seconds after the rollout; not reproducible in 11 subsequent samples — disclosed, judged a transient.)
- **Code actually running (read-only container file scan, no DB):** HealthKit workout-type fidelity markers `isIndoorWorkout` (in `native/commands/route.js`), `indoor_walking`, `outdoor_walking` present; Fix A `beginSettlementRun` present; Fix B `evidence_settlement_timezone_mismatch`, `coaching_updates`/`user_profile`/`product_default`, watermark `evidence_settlement_integrity_invalid`/`window_mismatch` codes, observability `briefing_settlement.readiness_checked`/`window_closed`/`deadline_fallback_used`/`settlement_gate_error`, `coverage_read_failed` all present (production minification mangles function names, so string-literal markers were used).
- **Zero-write POST audit vs PRE baseline (same payload, same runner):**
  - **HealthKit workout policy remains Strength-only:** the latest workout activation audit is `domains: ["workout"], families: ["strength"], openEnded: true, effective 2026-09-23`; all 14 `healthKitConfiguration` records digest-IDENTICAL.
  - **Cardio remains NOT activated:** no Cardio/workout-family widening in any policy record (digest identical); graduation policy domains still `activity`+`nutrition` only.
  - **No deferred Cardio observation reconciled:** `workout_canonicalization_deferred` count 4 -> 4 with IDENTICAL content digest; all observation reconciliation-state counts identical (workout_canonicalized 5, activity/nutrition states unchanged); `healthKitCanonicalWorkouts` 5 -> 5 digest identical; workout links/claims 2/4 digest identical.
  - **Historical briefing artifacts unchanged:** `dailyBriefings` 53 -> 53, content digest IDENTICAL, `max(updated_at)` unchanged (2026-09-23); none carries `evidenceSettlement` yet (expected — first new-format artifacts arrive with the next scheduled cadence).
  - **Recurring briefing timezone authority = America/Los_Angeles for the Founder:** stored `coachingUpdates.timeZone = America/Los_Angeles` (explicit, effective 2026-09-17), `monthly.dayOfMonth = 1`; `user.timeZone` still absent; all recurring artifact window zones `America/Los_Angeles`. `protocols`/`protocolVersions`/`user` digests identical.
  - Migration state unchanged. Every audited collection (10) digest-identical pre vs post.
- **No `settlement_gate_error` from the deployment:** zero occurrences (and zero `coverage_read_failed`, zero error-level lines) in web and worker logs since the rollout. Caveat, stated plainly: no recurring cadence has been due since deploy (Friday), so the gate has not yet evaluated a due entry; the worker completed real `briefing.cadence.tick`s at 14:47:52Z and 14:53:00Z on the new build — all three cadences `ineligible` (expected), `lockAcquired: false` (the executor only takes the advisory lock when at least one cadence is eligible; unchanged from production).

## Procedure notes
Established two-step followed: push -> `apps update --spec` (both stamps on web AND worker; spec copies deleted after use) -> `create-deployment --force-rebuild`. Read-only audits via the guarded runner (`physiqueos-final-cutover-config`); writes only via `physiqueos-production-deploy`. The read-only runner needed a local (non-production) `js-yaml` repair earlier in this task lineage; no credential was involved. A harmless unauthenticated `POST /api/v1/native/auth/refresh` (401) was sent once solely to emit a fresh web log envelope for the gitSha check (as documented in ops practice).

## What to watch next (no action needed now)
- **Next due cadences:** Weekly Sunday 2026-09-27 03:00 PDT; Midweek Wednesday 2026-09-30; Monthly 2026-10-01 (day 1). Expect `briefing_settlement.window_closed` / `readiness_checked` / `readiness_satisfied` (or `deadline_fallback_used` after the 480-minute maximum wait) and, on the new artifact, `evidenceSettlement` with `timeZone America/Los_Angeles` and `timeZoneAuthority briefing_schedule_authority:coaching_updates`. Alert on any sustained `settlement_gate_error` (accepted fail-safe N3) or `coverage_read_failed`.
- Still open, unchanged: real-Postgres two-worker concurrency run (deferred); reader run-token reentrancy guard (N-A); non-LA onboarding items (Weekly closed-window contract, N-B).
- Rollback path if needed (not needed): redeploy `01d1900b` via the same two-step (branch reset requires separate authorization).

## Flags
AUTHORITY_REVERIFIED · CLEAN_FAST_FORWARD_VERIFIED · PREDEPLOY_ZERO_WRITE_AUDIT_PASS · SERVER_DEPLOYED (e88b8ef7) · WEB_WORKER_SOURCE_COMMIT_EXACT · RUNTIME_AND_LOG_SHA_EXACT · ACTIVE_DEPLOYMENT_9727de79 · HEALTH_LIVE_READY_PASS · MIGRATION_STATE_UNCHANGED · POSTDEPLOY_ZERO_WRITE_AUDIT_PASS · HEALTHKIT_TYPE_FIDELITY_PRESENT · CARDIO_NOT_ACTIVATED · WORKOUT_POLICY_STRENGTH_ONLY · NO_DEFERRED_CARDIO_RECONCILED · HISTORICAL_BRIEFINGS_UNCHANGED · FOUNDER_TIMEZONE_LA_CONFIRMED · NO_SETTLEMENT_GATE_ERROR_FROM_DEPLOY
FALSE (as required): NATIVE_MERGED_OR_RELEASED · BUILD60_BUMPED · TESTFLIGHT_UPLOADED · WORKOUT_POLICY_MUTATED · HISTORICAL_BRIEFING_REGENERATED · PRODUCTION_DATA_MUTATED_BY_AGENT
