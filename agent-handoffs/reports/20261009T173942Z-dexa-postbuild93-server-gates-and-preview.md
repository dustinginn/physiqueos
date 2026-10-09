# October 9 DEXA: post-Build 93 Server gates and guarded recovery preview — ready for Founder decision

- Task id: `claude-dexa-postbuild93-server-gates-and-preview-20261009`
- Assignment: Claude inbox prompt of 2026-10-09 (post-Build 93 DEXA Server gates and preview), commit `28e04ebc`
- Agent: Claude (Opus 5.5)
- Generated: 2026-10-09T17:39Z
- Mode: Server gates and a **read-only** production preview only. This task did not deploy, did not write to production, did not apply or re-arm the recovery, did not restart the worker, did not touch Build 93 or Recovery, and did not change release pointers.

## Verdict

- **Deploy candidate `539f7006010989a1c58797b582ac003798cfdd64` passed every Server gate.** The few that ran differently from production are explained below. It is exactly the deployed production Server `e03f6768` plus 5 scoped commits, with no migration, dependency, Dockerfile, build-config or test-config change.
- **Recovery preview: PASS, and production is unchanged since this morning's triage.** Every fence held on live production. The planner predicts exactly one continuation-message insert, and the sealed fingerprint is recorded below.
- **Apply remains blocked by design.** It needs (1) the Founder's deploy decision, (2) deployment of `539f7006`, (3) a fresh preview on the fixed Server, and (4) a separate Founder authorization reference.

## Live production authority (re-verified at 17:39Z)

| | |
|---|---|
| Server (web + worker) | `e03f6768627f49175c476208eca79c99ae3d5ee9`, deployment `69a8dc14-461f-4680-91a3-14e42522494f`, ACTIVE; no in-progress or competing deployment |
| Health | ready, build `physiqueos-e03f6768-20261009` |
| Native | Build 93 VALID (release authority `a859e73d`); this task did not touch it |
| Codex | No conflicting deployment work. Build 93 release completed. |

## Stage A: Server gates on `539f7006`

| Gate | Result |
|---|---|
| Diff scope vs deployed `e03f6768` | 22 files. `db/`, `package.json`, `package-lock.json`, Dockerfiles, `next.config.mjs`, vitest configs and eslint config are all unchanged. The 5 modified source files are byte-identical between `84cc64e4` and `e03f6768`. |
| **Next.js production build** (Dockerfile.product environment: provider full runtime, isolated build root, `NEXT_PHASE=phase-production-build`, `--webpack`, Node 22 local) | **PASS.** Compiled successfully; 50/50 pages; standalone `webpack-runtime.js` present. |
| Middleware artifact verification (`verifyProviderMiddlewareArtifact.mjs`) | **PASS** |
| Provider artifact privacy scan (`scanProviderArtifact.mjs`) after the Dockerfile's standalone pruning | **PASS**: 1,109 files, 0 violations. Two local differences: the dependency tree was a local symlink (the scanner refuses symlinks; App Platform builds run a real `npm ci` and scan it in full), and `public/mockup-home.png` was excluded from a scanned copy instead of deleted from the worktree. The required private/tmp/seed/fixture paths were confirmed absent. |
| Fix present in the compiled server bundle | Yes. Unique literals of the bounded DEXA steps and the named-record mutation were found in `.next/server`. |
| Worker image path | `collectProviderWorkerArtifact.mjs` **PASS** (563 files) and includes every new module. The continuation entry point (`continueEvidenceReviewInBackground`) and the bounded DEXA steps import cleanly through the worker's own source-resolution hook, as the deployed worker does. |
| Migration-safety suite (`vitest.migration-safety.config.js`) | 1,217 tests. The 15 failures are identical, test for test, on `e03f6768`: **0 new**. |
| New DEXA tests | **120/120 pass** across 7 files. |
| Scoped DEXA, Photo, Training and resume suites (resume regression, Photo continuation, Native Training durability, runtime load bounds, post-confirmation resume, continuation recovery, outbox jobs, DEXA Event composition, DEXA appointment lifecycle) | 140/142. The 2 failures are in `NativeTrainingDurability` and are pre-existing: a fixture Nutrition Day without a local date fails `canonical_commit` of a fresh confirmation, upstream of any changed code, identically on the base. `DexaConfirmationResumeRegression` is 12/12; it is 11/12 on the base. |
| Full unit baseline (`vitest.unit.config.js`) | 10,460 tests: 10,162 pass, 293 fail. **0 new failures** vs the `e03f6768` per-test failure set. The pre-existing failures are environment-dependent: the private Founder runtime and media are absent, migration-control and root-worktree tooling are unavailable, plus stale source-text and date-fixture tests. |
| ESLint | Clean on all changed files. The 6 repo-wide problems are pre-existing and in untouched files. |
| **Real PostgreSQL SQL check** (PGlite 0.2.17: in-process, ephemeral, all 15 repo migrations applied, synthetic production-shaped rows; no server, credentials or production data) | **21/21 PASS.** Preview runs inside a real `READ ONLY` transaction. Apply refuses a drifted seal and writes nothing. With a matching seal, apply inserts exactly one correct outbox row: pending, attempt 0, null operation, payload key equal to the dedupe key. The dead message is untouched and re-apply is idempotent. Postflight reports `in_progress` at `compatibility_writes`. Bounded canonical read works. The compatibility row is appended at MAX+1 ordinal with correct metadata, its neighbour is untouched, the runtime revision is bumped once, and a replay is a no-op. The appointment completes exactly once at version+1 and the legacy execution is untouched. **A concurrent version change between read and write raises `FOUNDER_STORE_REVISION_CONFLICT` and rolls back** on the real engine. |
| `test:phase*:postgres` validators | Not run: no provisioned non-production database. The PGlite check above covers the candidate's SQL. |

### Memory audit, including the residual confirmation-entry load

Live production facts, from a read-only aggregate in this task:
- foundation runtime 62.3 MB (`analyses` 26.1, `dailyBriefings` 16.6, `evidenceReviews` 7.1, `evidencePackages` 5.4, `goalConfidenceHistory` 3.7, `canonicalEvidenceObjects` 2.5);
- `web` V8 heap limit 560 MB, with no `NODE_OPTIONS` heap flag, on a 1024 MB instance running Node v24.21.0.

The harness's `--max-old-space-size=512` gives exactly the same 560 MB limit.

Harness results, each step in its own process at the 560 MB production limit with a 150 MB retained baseline. Each cell is "sampled peak / minimum heap with no baseline".

| Step | Production size (64.6 MB), legacy | Production size, bounded | 1.4x (87.9 MB), legacy | 1.4x, bounded |
|---|---|---|---|---|
| confirmation entry (unchanged) | 389 / 256 | — | 476 / 336 | — |
| compatibility_writes | 473 / 368 | **167 / 80** | **out of memory** / 480 | 171 / 80 |
| scheduled_completion | 473 / 368 | **167 / 80** | **out of memory** / 480 | 171 / 80 |
| analysis | 440 / 272 | 270 / 96 | 486 / 352 | 335 / 128 |
| goal_evaluation | 435 / 256 | 267 / 96 | 479 / 336 | 331 / 112 |
| briefing | 424 / 256 | 329 / 144 | 491 / 352 | 387 / 192 |

**Calibration.** At production size the harness does **not** reproduce the crash: legacy `compatibility_writes` peaks at 473 MB, under 560. Yet it died twice in production at 62.3 MB. Production's real resident baseline (Next.js or the worker, plus concurrent work such as the 5-minute cadence tick) is therefore heavier than the harness's 150 MB:
- Lower bound: the crash implies the effective baseline is at least about 245 MB (560 − 315 MB growth).
- Upper bound: the unchanged entry load (231 MB growth) succeeded on every Oct 9 attempt, which bounds the baseline below about 329 MB.

**Safety argument (fails closed).** Every bounded step's growth at production size is smaller than the entry load's: briefing 171, analysis 112, Goal evaluation 109, compatibility and appointment 9 MB, against 231 MB for the entry. The entry load already succeeds in production at today's size on every confirmation, including at least four times on Oct 9. So no step on the recovery path needs more memory than production already sustains. Without the fix, the same steps grow 315 MB, above the entry, which is exactly why they crashed.

**Residual risk (not removed by this candidate).**
- The entry's own remaining headroom in production is unknown, because the baseline is bounded only between about 245 and 329 MB.
- It grows with the runtime, at about 3.6 MB of heap per MB of runtime.
- Bounding the durable-resume proof (`assertDurableResumeState`) should be the next Server change.
- During recovery, an entry-time OOM would show as a dead recovery message and a `partially_committed` review in postflight. It would not cause silent corruption. **Stop** if it happens.

## Stage B: read-only recovery preview (live production)

- **Runner and context.** The approved Mac console runner was used, its blobs verified equal to `4025f175`, with context `physiqueos-final-cutover-config`, component `web`, and runtime `PHYSIQUEOS_GIT_SHA` = `e03f6768`.
- **Transaction.** `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, `transaction_read_only = on` verified, SELECT-only statements, `ROLLBACK`. Unique success marker seen exactly once; exit 0; empty stderr.
- **Payload.** The payload is the candidate's own entry and planner, at the same blob ids as `539f7006`. It was bundled locally in **preview mode only**, pinned to `e03f6768`. The candidate's payload builder deliberately refuses unfixed Servers, to block *apply* and *postflight*; preview is read-only. No candidate source changed.
- **Seal handling.** Raw output, which contains real identifiers, went to a mode-600 file in local operator scratch. Only sanitized values appear here.

Result: **`insert_continuation`. All fences passed:**

| Fence | Observed |
|---|---|
| DEXA intake receipt for 2026-10-09 | exactly one; stored and interpreted (same receipt as triage, ref `d98dab5f8e69`) |
| Review | `committing`, owner-scoped, single DEXA object for the date, row version **12** (unchanged since triage; ref `7945415503f5`) |
| Progress | completed exactly `[canonical_commit]`; next `compatibility_writes` (`started`, attempt 3); canonical_commit recorded the scan |
| Claim | `in_progress` under `native-confirm:`; lease expired at 14:47:29Z, now far past the 5-minute lapse threshold |
| Canonical DEXA | exactly one, `dexa_scan\|<owner>\|2026-10-09`, active, **revision 1**, row version 1, from this review |
| Continuations | exactly one, **dead**, 4 attempts, last updated 14:28:37.961Z (ref `50adcf879b9b`); **no live sibling** |
| Legacy DEXA row for the date | **absent** |
| Appointment `execution_next_dexa` | **scheduled** for 2026-10-09, not completed by the scan, row version 5 |
| DEXA analysis / Goal evaluation / DEXA Event briefing | **absent** |
| Apple Health writeback receipts | exactly **two**, for canonical revision 1 (outcomes `saved`/`already_present`), unchanged |
| Other open DEXA review for the date | none |

Sealed fingerprint:

- Seal version `dexa-continuation-recovery-seal-v1`, recovery id `dexa-2026-10-09-continuation-recovery-v1`
- **Seal digest `26b9059d1513c90de429176161b998e4d3c07f44a25b7433eff05e8205bc28f0`**
- Review-state digest prefix `24667d6034822c6f`
- Predicted mutation: **1 outbox INSERT**
  - topic `evidence.review.continue`, payload version `1`, status `pending`, attempt 0, null operation;
  - payload keys `{reviewId, continuationKey}`, with `continuationKey` equal to the dedupe key;
  - checkpoint `canonical_commit:compatibility_writes:started:3`;
  - new message ref `07d557e81ce9`;
  - **no other row written.**

Comparison with the candidate planner: the preview *is* the candidate planner running on live facts. Its fingerprints (review version 12, receipt, dead message, canonical revision 1 at row version 1, appointment version 5, two Apple Health receipts) match this morning's independent read-only triage (`2f903439`). **No state drift, so no HOLD.**

The production Server is unchanged by deployment so far, so the review is still stuck: Log shows "Processing", and the DEXA appointment priority stays visible. The Build 93 Server keeps the appointment informational for its whole scheduled day; only confirmed scan evidence completes it, and the recovery's `scheduled_completion` step does exactly that.

## Exact deploy and recovery plan (each step needs its own Founder decision)

1. **Founder decision: deploy `539f7006`** as a Server-only follow-up, through the guarded deploy path (production context).
   - Pre-check: production is still `e03f6768` with no in-progress deployment, and the remote branch head is `539f7006`.
   - Deploy: set the spec source to the exact SHA, then force-rebuild. Verify web and worker `source_commit_hash` are both `539f7006`, then health/ready.
   - Rollback anchor: `e03f6768`. No migration. Recovery stays OFF; no Native change.
2. **Fresh preview on the fixed Server** (read-only):
   `node scripts/operations/buildDexaContinuationRecoveryPayload.mjs --sha 539f7006010989a1c58797b582ac003798cfdd64 --mode preview --out <scratch>/preview.mjs`
   Run it with the approved runner. Expect the same fences. The new seal will differ only in the predicted message id, since a fresh UUID is generated per preview.
3. **Founder decision: authorize APPLY** with an authorization reference.
   `--mode apply --seal <scratch>/seal.json --authorization-ref <reference>`
   - Inserts exactly one continuation under the owner lock with row-locked re-reads.
   - Refuses with `SEAL_DRIFT` on any change. Re-running reports `already_applied`.
4. **Postflight** (read-only, repeat): `--mode postflight --seal <scratch>/seal.json`, until `complete`. Expected:
   - review `confirmed` with all 9 steps; canonical_commit attempted once;
   - one canonical scan, still revision 1;
   - **Apple Health receipts unchanged (no new HealthKit write)**;
   - exactly one legacy DEXA row;
   - appointment completed once by the scan;
   - DEXA analysis and Goal evaluation present; exactly one DEXA Event briefing;
   - no live continuation.

   Stop on `failed` or `complete_with_discrepancies`.
5. **Native effect:** Log's "Processing" row resolves, the DEXA appointment priority clears, and the DEXA Event briefing appears. **No re-upload, re-confirm or manual Mark Complete at any point.**

## Founder decisions required

1. Approve deploying Server `539f7006` (guarded, Server-only, rollback anchor `e03f6768`).
2. After deploy and a fresh preview, give the authorization reference for the single-insert recovery APPLY.
3. Optional: schedule bounding of the confirmation-entry load as the next Server lane.

## Separation statement

- Production access in this task was read-only only: one preview and one aggregate sizing probe, each `REPEATABLE READ READ ONLY` with verified `transaction_read_only = on`, SELECT-only, and rolled back.
- No deploy, no production write, no apply or re-arm, no worker restart. No Build 93 Native, Recovery or release-pointer change.
- The candidate branch is unchanged at `539f7006`; this task made no candidate push.
- Local build outputs and links were removed afterwards. The PGlite package and all seal material stay in local job scratch only.
