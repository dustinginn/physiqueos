# Production deploy: Briefing Intelligence `7242043f` — deployed and verified

- **Authorization:** the Founder approved Briefing Intelligence candidate `7242043f` on 2026-09-28 ("Deploy exactly the accepted candidate through the established guarded production workflow").
- **Agent:** claude · **Status: DEPLOYED and verified.** No historical briefing was regenerated or mutated. The September Monthly was not published early; the normal Oct 1 cadence will create the completed September Monthly. No Native build; no Strength or Native backlog work started.

## Production authority

| | Before | After |
|---|---|---|
| Server/Web SHA (web + worker `source_commit_hash`) | `49211870c552b104aaf7840939f55d9dc9ecc1df` | **`7242043fd11825b49788839bd99a41d983f04c6e`** |
| App Platform deployment | `3134643d-9284-4cd5-82a3-b91cff346a9f` | **`e22b966b-adfb-4da2-9cc1-dd2d65b0087b`** (ACTIVE 9/9, cause manual force-rebuild) |
| Production branch `combined-app-platform-cutover` | `49211870` | `7242043f` (fast-forward; the candidate descends directly from production) |
| Build id (`/ready`) | `physiqueos-49211870-20260926` | `physiqueos-7242043f-20260928` |
| Schema | `PROVIDER_MIGRATION_000014_APPLIED` | unchanged: `PROVIDER_MIGRATION_000014_APPLIED` |
| Runtime log envelope `gitSha` | — | web 6/6 and worker 10/10 report `7242043f…` |

## What was deployed

34 commits, from the shared Briefing Intelligence layer through the final Monthly correction: 67 files, all inside the reviewed lane (the shared intelligence, V3 realization, briefing and presentation services, web Monthly screen and route, tests and test support). The diff touches **no migrations, dependencies, Dockerfile, app spec or Next config**. It contains:
- the shared engine for Midweek, Weekly, Monthly, DEXA and Photo;
- the Monthly in the approved August skeleton;
- nutrition reliability as completeness, with anomalies reported separately;
- the canonical phase label;
- the analytical "read" jargon rule.

## Gates (on the exact SHA, in a clean worktree)

1. **Authority re-verified before any mutation:** the production branch head was `49211870`, equal to the live `source_commit_hash`, with nothing in progress and `/live` and `/ready` both 200.
2. **Provider production build:** `npm run build -- --webpack` with `PHYSIQUEOS_GIT_SHA=7242043f…`, `PHYSIQUEOS_BUILD_ID=physiqueos-7242043f-20260928` and `NEXT_PHASE=phase-production-build`. It exited 0 with no errors.
3. **Full regression:** 9,136/9,444 passing, the same 303 environmental failures as the baseline, **0 new**. It ran with the shared machine settled, after earlier load-induced timeouts.
4. **Pre-deploy zero-write data snapshot** (`BEGIN READ ONLY`, verified, rolled back).

## Deploy chain (guarded, `set -e`, each step verified)

1. The production branch head was re-confirmed as `49211870`, then the exact SHA was pushed as `"7242043f…:refs/heads/combined-app-platform-cutover"`. `git ls-remote` confirmed `7242043f…`.
2. `doctl apps update --spec` changed exactly **4 lines**: `PHYSIQUEOS_GIT_SHA` and `PHYSIQUEOS_BUILD_ID` on web and worker. No other spec change.
3. `doctl apps create-deployment --force-rebuild` produced deployment `e22b966b`: PENDING_BUILD → DEPLOYING → **ACTIVE 9/9** at 2026-09-29T00:05:45Z.

## Post-deploy verification

- **Control plane:** web and worker `source_commit_hash` are both `7242043f…`, and no deployment is in progress.
- **Health:** `/api/v1/health/live` returned 200 in 0.30 s and `/api/v1/health/ready` 200 in 0.25 s. Every readiness check is ready, including database identity, schema at migration 000014, and runtime authority.
- **Runtime identity:** every fresh log envelope reports `gitSha 7242043f…` (web and worker).
- **Code-level proof inside the running container:** the new completeness rule (`duplicate_source_evidence`), the anomaly channel (`kept_and_reported`) and the Monthly skeleton markers are present in `/app/.next/server`. The old hard-coded `· Phase 1` literal is **absent**.
- **No data changed (zero-write snapshot, before vs after, every field identical):**
  - 64 briefing artifacts, with the same record/version digest;
  - the July and August Monthlies' payload digests;
  - the latest artifacts (Sep 20–26 Weekly, Sep 20–22 Midweek, Sep 19 Photo, Sep 13–19 Weekly);
  - 39 Confidence history records;
  - 581 evidence objects.

  **No historical briefing was regenerated or mutated.**
- **Native and briefing read paths:** the Founder opened the app after the switch (00:15–00:26Z). The deployed code served these reads, all complete, with **0 errors, 0 failed requests and 0 auth problems**:

  | Surface | Read model | Result |
  |---|---|---|
  | Home | `core.navigation.home` | complete |
  | Briefing | `briefing.native-artifact` | complete |
  | Goals | `core.navigation.goals` (×2) | complete |
  | You | `core.navigation.profile` | complete |
  | Evidence | `progress.evidence.weight` | complete |

  Latency ran from 81 ms to 2.3 s (median 264 ms, n = 6), in line with pre-deploy. Every log envelope in the window reports `gitSha 7242043f…`.

## What happens next, naturally

- The next scheduled briefings (Midweek, Weekly and the Oct 1 Monthly) will be written by the deployed engine, at 03:00 local on their cadence dates.
- The **completed September Monthly** will be created by the normal cadence on Oct 1. It covers Sep 1–30 and uses the accepted structure and corrections.
- Existing stored briefings keep their original content and format.

## Not started (per instruction)

- the Sep 27 Strength reconciliation-review notification investigation;
- the Native backlog: Logged Today, the Log-tab shortcut, Mark Skipped, PR celebration, the routine icon, and the Baseline Read label;
- session-renewal resilience and the Face ID evaluation;
- peptide items;
- the Photo magnitude producer;
- Sleep.

## Rollback path (if ever needed)

Push `49211870c552b104aaf7840939f55d9dc9ecc1df` to `combined-app-platform-cutover`, apply `apps update --spec` with the four stamps restored, then `create-deployment --force-rebuild`, verifying `source_commit_hash` and the log `gitSha`. No schema change is involved.
