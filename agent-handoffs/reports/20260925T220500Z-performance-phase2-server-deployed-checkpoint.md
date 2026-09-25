# Performance Phase 2 Server deployed: checkpoint

Task id: `claude-performance-phase2-server-deploy-20260925`
Lane: performance. The pointer is `agent-handoffs/performance/latest.json`. The HealthKit `agent-handoffs/latest.json` and `latest.md` are intentionally untouched.

**Server `afdc849a` is LIVE. Native Build 60 is unchanged. Native candidate `c736254b` is NOT released, and no Build 61 was prepared.** STOP for Founder direction.

## Deployment

| Item | Value |
|---|---|
| Deployment | `c4d8484e-0bfa-4d07-9cf4-0cf591ac3ee2`, ACTIVE (cause: manual force-rebuild) |
| Superseded | `66ee39f6-c4d7-49c8-9012-3de1a77a832c` (was `a399916a`) |
| Spec-update deployment | `9af97ef0-9908-45e0-83d6-f797cbc07256`, CANCELED by the force-rebuild (expected) |
| web / worker source_commit_hash | `afdc849a6399130668d846544e85236fe1974741` / `afdc849a6399130668d846544e85236fe1974741` |
| Build id | `physiqueos-afdc849a-20260925` (`/api/v1/health/live`, started 2026-09-25T21:16:44Z) |
| Runtime log envelopes | web and worker `gitSha` = `afdc849a…`, `buildId` = `physiqueos-afdc849a-20260925` |
| Health | live 200 `ok`; ready 200 `ready`, all 9 checks ready |
| Migrations | 14 before and after (`000014_evidence_intake_text_provenance`), unchanged; no migration in the diff |
| Error logs | 0 on web and worker. The only warning is the deliberate unauthenticated refresh 401 used to emit a runtime envelope. |

Procedure followed (guarded two-step, under `set -e` with a verification before each step):
1. Clean fast-forward of `combined-app-platform-cutover` from `a399916a` to `afdc849a`, using a quoted exact refspec and no force. `git ls-remote` confirmed the head.
2. `apps update --spec` changed exactly 4 values: `PHYSIQUEOS_GIT_SHA` and `PHYSIQUEOS_BUILD_ID` on web and worker. `PHYSIQUEOS_EXPECTED_ROLLBACK_BUILD_ID` and every other field were untouched.
3. `create-deployment --force-rebuild`.

## Pre-deploy checks

- **Authority:** re-verified. `66ee39f6` ACTIVE on `a399916a` (web and worker), nothing pending or in progress, live and ready 200, production branch head exactly `a399916a`.
- **Candidate:** `afdc849a` is a clean fast-forward descendant (7 commits); the worktree was clean at the exact SHA.
- **Build:** the production webpack build on exact `afdc849a` passed (Phase 2, "Compiled successfully").
- **Diff scope:** 18 files, none under `db/`, migrations, infra, package or Docker.

## Zero-write correctness audit (pre `a399916a` → post `afdc849a`)

The same four probes were used around the `a399916a` deploy. Each runs in the web container: identity-gated, `READ ONLY` transaction, owner-scoped SELECTs, `ROLLBACK`.

1. **Workout/strategic/migration audit** (window 2026-09-22..27). Everything below is identical before and after:
   - policy enabled, `families [cardio, strength]`, effective 2026-09-23, open-ended, strategic eligibility `quarantined`, historical backfill `false`, link auto-confirm `false`;
   - 9 canonical workouts (6 cardio, 3 strength), identical;
   - observation states, duplicate checks, Logger Strength sessions, link status counts, one-to-one integrity, ambiguous auto-links;
   - **all 35 strategic digests**, including `dailyBriefings` and `briefingReconciliationWorkItems`, so no briefing was regenerated;
   - migrations 14.
2. **State inventory:** workout observations, canonical workout records, link records, workout/graduation/daily policies, configuration digests, audit rows, and Activity days **Sep 21–25** are identical.
3. **Training Day probe (Sep 20–25):** identical. Sep 23/24 remain Walking, Walking, Traditional Strength Training; Sep 22 duplicates are still suppressed.
4. **Compiled-code markers:** every HealthKit/Cardio marker is present in the same file counts, including `isIndoorWorkout` type fidelity, the Training Day/Session Cardio events, the Cardio label vocabulary and the Training Day store queries. The three new Native projection allowlists are now present.

Drift since this morning's verified `a399916a` post-deploy state was expected organic ingestion only. Two HealthKit syncs at 17:34Z and 17:47Z added 3 observations and updated **today's (Sep 25)** canonical Activity day. Sep 21–24, workouts, policy and every other digest were unchanged, and nothing changed at all across the deploy window.

HealthKit ingestion, Cardio classifier and canonicalization, workout policy, `isIndoorWorkout`, and Training Day Cardio semantics are unchanged. No production data was written.

## Live performance (same zero-write benchmark, same pinned clock `2026-09-25T19:00:00Z`)

Method is the same as the Phase 2 acceptance report. On the **live `afdc849a` container**, the exact baseline source (`a399916a`) and the exact candidate source (`afdc849a`, identical to the deployed code) were run interleaved per group, and Core was repeated.

- Every live candidate response is **byte-identical to the reviewed pre-deploy candidate** (all 34 resource variants, digests and sizes), including the three projections.
- Every non-projected resource has an identical digest between baseline and candidate.
- DB latency on the shared production instance is noisy, so compute (wall minus DB) is shown separately.

| Resource | Baseline a399916a | Candidate pre-deploy | **Live afdc849a** | Notes |
|---|---|---|---|---|
| Home warm | 1.48–2.04 s (median of 4 pairs 1.87 s) | 0.97–1.41 s | **0.92 s / 1.57 s** (2 runs) | the 1.57 s run had a DB spike (1.27 s vs 0.63 s) |
| Home compute | 707–767 ms | 325–411 ms | **300–304 ms** | −58–60% |
| Home cold | 2.06–3.33 s | 1.79–2.17 s | 2.05–2.23 s | DB-dominated when cold |
| Training Logger warm / cold | 1.45–1.89 s / 2.39–2.50 s | 0.98 s / 1.11 s | **1.17 s / 1.19 s** | compute 1,596 → 740 ms |
| Progress Photos warm | 1.29–1.42 s | 0.33 s | **0.35 s** | −75% |
| Training landing | 0.57–0.89 s, **1,652,513 B** | 0.60 s, 148,150 B | **0.28 s, 148,150 B** | −91% bytes |
| Training Library (my / all / category) | 0.31–0.66 s, **191,032 / 194,062 B** | 12,578 / 15,608 B | **0.20–0.56 s, 12,578 / 15,608 B** | −93% bytes |
| Nutrition (all / lean-mass) | 0.30 / 0.19 s, **1,268,892 / 1,198,702 B** | 635,071 / 600,049 B | **0.38 / 0.18 s, 635,071 / 600,049 B** | −50% bytes |
| Evidence Hub download (landing + library + nutrition + activity + energy + dexa + photos + weight) | **~3.34 MB** | ~1.02 MB | **~1.02 MB** | −69% |
| Log (review queue) | 0.66–0.90 s | 0.78 s | 0.70–0.81 s | unchanged code; parity |
| Goals | 0.82–0.92 s | 0.86–0.88 s | 0.86 s (one 1.71 s run: DB 1.41 s) | DB noise |
| Active goal / Visible Abs | 0.45–0.52 s / 0.05–0.07 s | – | 0.30–0.47 s / 0.07–0.10 s | no 503 |
| Priority | 21–42 ms | – | 21–37 ms | – |
| Training Day / session | 22 ms / 8 ms | – | 36 ms / 16 ms | – |
| Briefing history / detail | 0.29 s / 27–88 ms | – | 0.36 s / 28–79 ms | – |
| Timeline | 0.68 s | – | 1.93 s (one run) | DB wait 6.8 s over 11 concurrent queries; code unchanged, parity identical: shared-DB noise |

No common Server-backed daily-driver read exceeded 3 s in the comparable benchmark. The two slow single samples (Timeline 1.93 s, Home 1.57 s) are attributed above to DB wait with unchanged or improved compute.

**Decoder contract:**
- The live projected responses are byte-identical to the pre-deploy candidate responses whose key sets were proven against Build 60's decoders (unit tests plus fresh-context review).
- The compiled allowlists are present in the deployed code.
- No real phone traffic hit the Server in the ~45 min after the deploy (0 errors, no `decode_failed` or 4xx/5xx beyond the deliberate probe). The Founder's next normal use of Build 60 exercises the projected Training and Evidence Hub reads.

## LIVE NOW vs NOT LIVE

**LIVE NOW (Server `afdc849a`, no app update needed):**
- Home read CPU (cached `Intl` formatters): compute −58–60%.
- Training Logger exercise-phrase normalization: ~2× faster.
- Progress Photos date formatting: −75%.
- Smaller Native payloads: Training landing −91%, Training Library −93%, Nutrition −50%, Evidence Hub download ~3.34 MB → ~1.02 MB.

**NOT LIVE until a Native Build 61 from `c736254b` (not authorized):**
- persisted last-known Home instant paint;
- Priority Detail acknowledge-first completion;
- retained view models on 19 read screens;
- visible-only foreground refresh.

## Flags

AUTHORITY_REVERIFIED=yes · CLEAN_FAST_FORWARD_VERIFIED=yes · PREDEPLOY_ZERO_WRITE_AUDIT_PASS=yes · SERVER_DEPLOYED=yes · WEB_WORKER_SOURCE_COMMIT_EXACT=yes · RUNTIME_SHA_EXACT=yes · HEALTH_LIVE_READY_PASS=yes · MIGRATION_STATE_UNCHANGED=yes · POSTDEPLOY_ZERO_WRITE_AUDIT_PASS=yes · LIVE_PERFORMANCE_REMEASURED=yes · HOME_SERVER_IMPROVEMENT_LIVE=yes · TRAINING_LOGGER_SERVER_IMPROVEMENT_LIVE=yes · PHOTOS_SERVER_IMPROVEMENT_LIVE=yes · PAYLOAD_PROJECTIONS_LIVE=yes · NON_PROJECTED_PARITY_PASS=yes · COMMON_SERVER_PATHS_UNDER_3S_OR_NOISE_EXPLAINED=yes · HEALTHKIT_CARDIO_PATH_UNCHANGED=yes · TRAINING_DAY_CARDIO_UNCHANGED=yes · NATIVE_BUILD60_UNCHANGED=yes · BUILD61_NOT_RELEASED=yes · PRODUCTION_MUTATED=no · GH_REPORT_PUBLISHED=yes

## Recommended next step

1. Wait for tomorrow's prospective Indoor/Outdoor Cardio acceptance on unchanged Build 60.
2. Optionally confirm on device that Home, Training, Evidence Hub and Nutrition load normally on the new Server, since Build 60 decodes the projected payloads.
3. Then consider Build 61 release prep from `c736254b` under a separate authorization.
