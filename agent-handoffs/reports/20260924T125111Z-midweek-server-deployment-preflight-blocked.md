# Midweek Server deployment — mandatory pre-read blocked

Generated: 2026-09-24T12:51:11Z  
Agent: Codex B  
Status: **DEPLOYMENT NOT STARTED** — the approved production database read path is offline, so the required pre-deployment immutability proof could not be executed safely.

## Founder authorization and exact release target

The Founder authorized deployment of exactly:

- Server candidate: `28ac1e4f51afdf3a30f2fb50fcb5c95148a2709d`
- Reviewed source branch: `origin/codexB/midweek-v3-server-20260924`
- Production branch destination: `refs/heads/combined-app-platform-cutover`
- Intended runtime build stamp: `physiqueos-28ac1e4f-20260924`

The authorized guarded procedure requires a bounded owner-scoped production read before and after deployment, with `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, proof that `transaction_read_only = on`, bounded `SELECT`s, and explicit `ROLLBACK`. It also requires the exact quoted push refspec, Web/worker runtime SHA and build stamps, a force rebuild, exact component source/runtime authority checks, and live/ready health checks.

## Current production authority reverified

Fresh read-only DigitalOcean and public health checks immediately before this checkpoint confirmed:

- application: `bf57cf56-48cc-4cd6-90e4-a23ee5381741`
- application spec name: `physiqueos-foundation-staging` (known historical naming mismatch; the verified production domain and authority are below)
- production domain: `physiqueos.dustinginn.com`
- region: `sfo`
- active deployment: `117d8a2f-8cc1-4ef1-9247-1029c875e401`
- active phase/progress: `ACTIVE`, 9/9 successful
- in-progress deployment: none
- Web source commit: `63395579ed70611be8a57f032133a43a3bc67800`
- worker source commit: `63395579ed70611be8a57f032133a43a3bc67800`
- `origin/combined-app-platform-cutover`: `63395579ed70611be8a57f032133a43a3bc67800`
- Web/worker `PHYSIQUEOS_GIT_SHA`: `63395579ed70611be8a57f032133a43a3bc67800`
- Web/worker `PHYSIQUEOS_BUILD_ID`: `physiqueos-63395579-20260924`
- all four stamps are `RUN_AND_BUILD_TIME`
- `/api/v1/health/live`: HTTP 200, `status=ok`, build `physiqueos-63395579-20260924`
- `/api/v1/health/ready`: HTTP 200, `status=ready`, all nine checks ready, including runtime authority and migration `000014`

No authority drift or transitional deployment was observed.

## Exact candidate lineage gate

GitHub refs were fetched immediately before this checkpoint:

- `origin/codexB/midweek-v3-server-20260924`: `28ac1e4f51afdf3a30f2fb50fcb5c95148a2709d`
- `origin/combined-app-platform-cutover`: `63395579ed70611be8a57f032133a43a3bc67800`
- `origin/main`: `92341cf1c279a30737200cf1c02dd70e2106273c`

The candidate is a clean five-commit fast-forward descendant of current production. The production-to-candidate path list contains no database/migration, HealthKit, or Activity path. The reviewed Midweek Server candidate therefore remains the exact authorized release object and does not overlap Codex A's HealthKit/Activity work.

## Frozen September 20–22 immutability baseline

The already approved sanitized Slice 0 baseline is:

- artifact: `midweek_briefing_user_founder_001_20260920_20260922`
- artifact database/payload version: `1 / 1`
- artifact digest: `4095d0769ff6c53f7f07b831608ae671eb9e2922c84cf9fade8219088dbe7f92`
- bound assessment: `confidence_assessment_v3|f5deaf716bae25d2f233fd2d06fcb64124c5a8b9f808b7bf11f10b01ef10c63b`
- assessment database/payload version: `1 / 1`
- assessment digest: `0f5c5b58ac7bad98d1d9ed5cac28c86504225caac20197e7c07e9110e789db56`

Source fixture: `agent-handoffs/fixtures/20260924T051615Z-midweek-slice0-production-lineage-parity.json`.

These are the exact identities and digests that the mandatory bounded pre/post reads must prove byte-identical. This checkpoint does **not** substitute the earlier Slice 0 read for the new deployment-time pre-read.

## Mandatory stop condition

The repository's approved production-read policy permits this audit only through the Founder PC saved read-only console path:

- saved context: `physiqueos-final-cutover-config`
- verified application/component: the application above, component `web`
- one owner-scoped read-only transaction with explicit rollback

The Founder-PC Remote Control surface currently reports that the computer is asleep or offline. The current Codex host inventory also exposes only the local Mac, not the Founder PC. Therefore:

- the deployment-time pre-read was **not performed**;
- `transaction_read_only = on` was **not reverified** for a new transaction;
- no SQL was issued;
- no sanitized pre-deployment digest result was emitted;
- no alternate Mac credential or console path was invented or used.

Because the user explicitly required bounded pre/post proof that the artifact and bound assessment remain byte-identical, starting the release without the pre-read would break the guarded procedure. Deployment stopped before its first mutation.

## Mutation and scope ledger

- exact quoted production refspec pushed: **NO**
- production branch changed: **NO**
- DigitalOcean spec changed: **NO**
- Web/worker runtime stamps changed: **NO**
- force rebuild started: **NO**
- production database read performed in this deployment turn: **NO**
- production database write performed: **NO**
- historical briefing regenerated or mutated: **NO**
- Midweek Native candidate uploaded: **NO**
- Codex A branch/worktree touched: **NO**

The only external mutation in this turn is publication of this durable checkpoint to GitHub `main`.

## Exact next step

Bring the Founder PC and its approved Remote Control/read-only console path online. Then, from a fresh authority snapshot:

1. run the bounded pre-deployment transaction and record the sanitized artifact/assessment identities, versions, and digests;
2. require an exact match to the frozen baseline above and stop on any mismatch;
3. push the exact quoted refspec `git push origin '28ac1e4f51afdf3a30f2fb50fcb5c95148a2709d:refs/heads/combined-app-platform-cutover'`;
4. stamp both Web and worker with `PHYSIQUEOS_GIT_SHA=28ac1e4f51afdf3a30f2fb50fcb5c95148a2709d` and `PHYSIQUEOS_BUILD_ID=physiqueos-28ac1e4f-20260924`, proving the spec diff is limited to those four values;
5. force-rebuild and wait for the resulting deployment to become exactly `ACTIVE`;
6. verify exact Web/worker source commits, deployment-owned runtime stamps, and live/ready health;
7. run the bounded post-deployment transaction through the same approved PC path and prove both frozen objects byte-identical to the pre-read and Slice 0 baseline;
8. publish the completed deployment checkpoint to GitHub `main`, without changing `agent-handoffs/latest.md` or `agent-handoffs/latest.json`, and stop.

## Flags

- `FOUNDER_DEPLOY_AUTHORIZATION=YES`
- `AUTHORITY_REVERIFIED=YES`
- `EXACT_CANDIDATE_REVERIFIED=YES`
- `FAST_FORWARD_GATE=PASS`
- `MIGRATION_DIFF=NONE`
- `HEALTHKIT_ACTIVITY_OVERLAP=NONE`
- `MANDATORY_PRE_READ=BLOCKED_PC_OFFLINE`
- `PRODUCTION_SQL_PERFORMED=NO`
- `SERVER_DEPLOYED=NO`
- `PRODUCTION_MUTATED=NO`
- `NATIVE_UPLOADED=NO`
- `HISTORICAL_BRIEFING_REGENERATED=NO`
- `CODEX_A_WORK_TOUCHED=NO`
- `GH_CHECKPOINT_PUBLISHED=YES`
