# Midweek Server deployment — complete

Generated: 2026-09-24T13:09:54Z

Agent: Founder PC Codex production operator

Status: **DEPLOYED AND ACCEPTED** — exact Server candidate `28ac1e4f51afdf3a30f2fb50fcb5c95148a2709d` is live; mandatory pre/post frozen-object reads passed with explicit read-only transactions and rollback.

This report intentionally does not update `agent-handoffs/latest.md` or `agent-handoffs/latest.json` because the Midweek lane remains secondary to the active HealthKit lane.

## Exact release authority

- application: `bf57cf56-48cc-4cd6-90e4-a23ee5381741`
- component used for bounded console reads: `web`
- production domain: `physiqueos.dustinginn.com`
- previous source: `63395579ed70611be8a57f032133a43a3bc67800`
- previous deployment: `117d8a2f-8cc1-4ef1-9247-1029c875e401`
- authorized Server candidate: `28ac1e4f51afdf3a30f2fb50fcb5c95148a2709d`
- reviewed candidate ref: `origin/codexB/midweek-v3-server-20260924`
- production ref: `origin/combined-app-platform-cutover`
- new deployment: `e8c3bed3-20f6-4f5c-b34a-d27ab0881480`
- runtime build identity: `physiqueos-28ac1e4f-20260924`

## Fresh pre-deployment authority gate

At `2026-09-24T13:01:56.857Z`, immediately before console access:

- active deployment was `117d8a2f-8cc1-4ef1-9247-1029c875e401`, phase `ACTIVE`, 9/9 successful;
- no pending or in-progress deployment existed;
- Web and worker source were both `63395579ed70611be8a57f032133a43a3bc67800`;
- `origin/combined-app-platform-cutover` was the same SHA;
- both runtime `PHYSIQUEOS_GIT_SHA` stamps were the same SHA;
- both runtime `PHYSIQUEOS_BUILD_ID` stamps were `physiqueos-63395579-20260924`;
- both stamps remained `RUN_AND_BUILD_TIME`;
- `/api/v1/health/live` returned HTTP 200 with the expected build;
- `/api/v1/health/ready` returned HTTP 200 and all nine checks ready, including runtime authority and migration `000014`.

The candidate was independently fetched and resolved exactly. It remained a five-commit normal fast-forward descendant of production. The production-to-candidate path list contained no migration/database, HealthKit, or Activity path.

## Mandatory pre-deployment frozen-object read

The established Founder-PC runner and restricted context `physiqueos-final-cutover-config` opened the `web` console. One bounded Founder-owner transaction executed:

1. `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
2. `SHOW transaction_read_only` returned `on`;
3. two bounded parameterized SELECTs read only the exact frozen artifact and its exact bound assessment;
4. explicit `ROLLBACK` completed;
5. the sanitized result and success marker emitted only after rollback.

Observed at `2026-09-24T13:02:58.512Z`:

- artifact: `midweek_briefing_user_founder_001_20260920_20260922`
- artifact database/payload version: `1 / 1`
- artifact digest: `4095d0769ff6c53f7f07b831608ae671eb9e2922c84cf9fade8219088dbe7f92`
- bound assessment: `confidence_assessment_v3|f5deaf716bae25d2f233fd2d06fcb64124c5a8b9f808b7bf11f10b01ef10c63b`
- assessment database/payload version: `1 / 1`
- assessment digest: `0f5c5b58ac7bad98d1d9ed5cac28c86504225caac20197e7c07e9110e789db56`
- artifact/assessment binding: exact
- frozen Slice 0 baseline: exact
- success marker: `PHYSIQUEOS_MIDWEEK_FROZEN_READ_ROLLBACK_VERIFIED_63395579`

No production mutation occurred during the pre-read.

## Promotion and app-spec delta

The production source branch was advanced through the exact quoted normal refspec:

`28ac1e4f51afdf3a30f2fb50fcb5c95148a2709d:refs/heads/combined-app-platform-cutover`

No force push, merge, rebase, squash, or history rewrite was used.

The reviewed application-spec semantic delta contained exactly four release-metadata values:

1. Web `PHYSIQUEOS_GIT_SHA`: `63395579...` → `28ac1e4f...`
2. Web `PHYSIQUEOS_BUILD_ID`: `physiqueos-63395579-20260924` → `physiqueos-28ac1e4f-20260924`
3. worker `PHYSIQUEOS_GIT_SHA`: `63395579...` → `28ac1e4f...`
4. worker `PHYSIQUEOS_BUILD_ID`: `physiqueos-63395579-20260924` → `physiqueos-28ac1e4f-20260924`

The operator guard cloned and reverted those four fields and required byte equality with the pre-update spec before sending the update. No other app-spec field changed. `update_all_source_versions=true` bound the resulting build/deployment to the newly advanced exact source.

Unchanged: topology, instance count, instance size, region, routes, domains, secrets, database bindings, object storage, build/run commands, scaling, and infrastructure. Incremental recurring cost: `$0`.

## Deployment result

- deployment ID: `e8c3bed3-20f6-4f5c-b34a-d27ab0881480`
- terminal phase: `ACTIVE`
- deployment progress: 9/9 successful
- Web source: `28ac1e4f51afdf3a30f2fb50fcb5c95148a2709d`
- worker source: `28ac1e4f51afdf3a30f2fb50fcb5c95148a2709d`
- Web runtime SHA: `28ac1e4f51afdf3a30f2fb50fcb5c95148a2709d`
- worker runtime SHA: `28ac1e4f51afdf3a30f2fb50fcb5c95148a2709d`
- Web/worker build: `physiqueos-28ac1e4f-20260924`
- pending/in-progress deployments after activation: none
- `/api/v1/health/live`: HTTP 200, `status=ok`, exact build
- `/api/v1/health/ready`: HTTP 200, `status=ready`, all nine checks ready
- schema readiness: `PROVIDER_MIGRATION_000014_APPLIED`
- runtime-authority readiness: `PROVIDER_RUNTIME_AUTHORITY_READY`

Exactly one application update/deployment request was made. No retry or second deployment was issued.

## Mandatory post-deployment frozen-object read

After exact source/runtime/health authority was established, the same approved runner and restricted context opened a new `web` console. A second bounded Founder-owner transaction executed with the same safety envelope:

- isolation/access: `REPEATABLE READ READ ONLY`
- `transaction_read_only`: `on`
- application SELECT count: 2, both bounded and parameterized
- explicit `ROLLBACK`: verified
- result emitted only after rollback

Observed at `2026-09-24T13:09:44.423Z`:

- runtime SHA: `28ac1e4f51afdf3a30f2fb50fcb5c95148a2709d`
- runtime build: `physiqueos-28ac1e4f-20260924`
- artifact database/payload version: `1 / 1`
- artifact digest: `4095d0769ff6c53f7f07b831608ae671eb9e2922c84cf9fade8219088dbe7f92`
- assessment database/payload version: `1 / 1`
- assessment digest: `0f5c5b58ac7bad98d1d9ed5cac28c86504225caac20197e7c07e9110e789db56`
- artifact/assessment binding: exact
- pre-read and Slice 0 baseline: byte-identical
- success marker: `PHYSIQUEOS_MIDWEEK_FROZEN_READ_ROLLBACK_VERIFIED_28ac1e4f`

The deployment changed only the dynamic read/presentation behavior. It did not regenerate, correct, replace, or otherwise mutate the frozen September 20–22 artifact or its bound assessment.

## Mutation and scope ledger

- production source branch fast-forwarded to exact candidate: **YES**
- exact Server candidate deployed: **YES**
- historical briefing regenerated or mutated: **NO**
- production database writes: **NO**
- schema/migration change: **NO**
- infrastructure/topology change: **NO**
- Native source touched: **NO**
- TestFlight uploaded: **NO**
- Codex A branch/worktree touched: **NO**
- `agent-handoffs/latest.md` / `latest.json` changed by this lane: **NO**

## Flags

- `FOUNDER_DEPLOY_AUTHORIZATION=YES`
- `AUTHORITY_REVERIFIED=YES`
- `EXACT_CANDIDATE_REVERIFIED=YES`
- `FAST_FORWARD_GATE=PASS`
- `MANDATORY_PRE_READ=PASS`
- `PRE_READ_TRANSACTION_READ_ONLY=ON`
- `PRE_READ_ROLLBACK=VERIFIED`
- `APP_SPEC_DELTA_EXACT_FOUR_VALUES=YES`
- `SERVER_DEPLOYED=YES`
- `DEPLOYMENT_ACTIVE=YES`
- `WEB_WORKER_SOURCE_EXACT=YES`
- `RUNTIME_AUTHORITY_ALIGNED=YES`
- `LIVE_READY_GREEN=YES`
- `MANDATORY_POST_READ=PASS`
- `POST_READ_TRANSACTION_READ_ONLY=ON`
- `POST_READ_ROLLBACK=VERIFIED`
- `SEP20_22_ARTIFACT_IMMUTABLE=YES`
- `SEP20_22_ASSESSMENT_IMMUTABLE=YES`
- `PRODUCTION_DATABASE_MUTATED=NO`
- `HISTORICAL_BRIEFING_REGENERATED=NO`
- `NATIVE_UPLOADED=NO`
- `CODEX_A_WORK_TOUCHED=NO`
- `INCREMENTAL_RECURRING_COST=$0`
