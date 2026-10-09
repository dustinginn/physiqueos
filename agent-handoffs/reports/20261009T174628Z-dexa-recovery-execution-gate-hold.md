# October 9 DEXA recovery — all gates re-verified; HOLD at the execution gate (Founder authorization required)

- Task id: `claude-dexa-recovery-execution-gate-20261009`
- Continues: report `20261009T173942Z-dexa-postbuild93-server-gates-and-preview.md` (main `d1379b16`)
- Agent: Claude (Opus 5.5)
- Generated: 2026-10-09T17:46Z
- **Recovery executed: NO. Server deployed: NO. Production mutated: NO.**

## Why execution stopped

Two separate Founder authorizations are required. Neither exists in any GitHub handoff or in the current instruction.

1. **No deploy authorization for Server `539f7006`.**
   - Main has had no commits since `d1379b16`.
   - The governing prompt `28e04ebc` explicitly forbids a Server deploy and asks for a separate Founder decision.
   - The current instruction also forbids changing deployment configuration, and deploying `539f7006` requires updating the App Platform spec source and a force rebuild.
2. **No APPLY authorization reference for the recovery.** A passing read-only preview is not authorization, and the instruction says so explicitly.

Without (1), (2) cannot safely run anyway:
- the recovery resumes the review on whatever Server is live;
- on the live `e03f6768`, the resumed `compatibility_writes` step is the path that exhausted memory on Oct 9;
- the apply payload builder refuses `e03f6768` fail-closed, and this was re-confirmed below.

## Gates re-verified in this task (all PASS)

| Gate | Result |
|---|---|
| Live production authority | Server `e03f6768627f49175c476208eca79c99ae3d5ee9`, web and worker, deployment `69a8dc14-461f-4680-91a3-14e42522494f`, ACTIVE, health ready (`physiqueos-e03f6768-20261009`), no in-progress deployment (17:45Z) |
| Candidate | `539f7006010989a1c58797b582ac003798cfdd64`, local and remote, clean tree; = `e03f6768` + 5 scoped commits |
| Focused regression on the candidate | **191/191** across 13 files: the 120 new DEXA tests, DEXA resume regression, Photo continuation, runtime load bounds, post-confirmation resume, existing continuation recovery, and DEXA Event composition |
| Real-PostgreSQL SQL check (PGlite 0.2.17, ephemeral, repo migrations, synthetic data) | **21/21**, including the drift refusal, the single exact outbox insert, idempotent re-apply, the version-fence rollback, single-record compatibility and appointment writes, and the runtime revision bumped once |
| Fresh read-only production preview (approved Mac runner, `physiqueos-final-cutover-config`, `web`; `REPEATABLE READ READ ONLY`, `transaction_read_only = on`, SELECT-only, ROLLBACK, marker once, exit 0, empty stderr) | **`insert_continuation`, no drift.** Every sealed fact is identical to the 17:39Z preview: review version 12, canonical scan revision 1 at row version 1, appointment version 5, one dead continuation (4 attempts) with no live sibling, legacy row absent, no analysis or briefing, the same two Apple Health receipts for revision 1. Only the per-preview predicted message id differs, by design. |
| Apply gate on the live Server | `buildDexaContinuationRecoveryPayload --sha e03f6768 --mode apply` **refused**; no payload was produced |

Earlier gates from `d1379b16` stand unchanged, because the candidate is unchanged:
- Next.js production build, middleware verification and artifact privacy scan PASS;
- the worker artifact imports the fix;
- the full unit and migration-safety suites have zero new failures;
- memory audit: every bounded step grows less heap than the unchanged entry load that already succeeds in production. The entry load remains the residual risk.

## Preservation

Nothing was written:
- the canonical DEXA scan (`dexa_scan|<owner>|2026-10-09`, revision 1), scan identities, revision history and exclusions are untouched;
- the PDF/media association, Apple Health receipts and all unrelated evidence are untouched;
- no Native code, release artifact, infrastructure or deployment configuration was changed;
- no TestFlight build was started and no cost was incurred.

## Exact Founder approvals required to finish (in order)

1. **Authorize the Server deploy.** Suggested wording: "Founder authorizes guarded Server-only deployment of exact `539f7006010989a1c58797b582ac003798cfdd64` (rollback anchor `e03f6768`, no migration, Recovery OFF), including the App Platform spec source update and force rebuild." The deploy runs through the production-deploy context, then verifies:
   - web and worker `source_commit_hash` both equal `539f7006`;
   - health/ready pass.
2. **Authorize the recovery APPLY.** After the deploy, a fresh read-only preview on `539f7006` is run and its sanitized fingerprint is reported. Then provide an authorization reference, for example "Founder authorizes DEXA Oct 9 continuation recovery apply, seal `<digest>`". The apply:
   - inserts exactly one `evidence.review.continue` message for checkpoint `compatibility_writes:started:3`;
   - takes the owner lock with row-locked re-reads;
   - refuses on any drift.
3. **No Founder action is needed for verification.** The read-only postflight then runs until `complete`, verifying:
   - review confirmed with all 9 steps; canonical_commit attempted once;
   - one canonical scan, still revision 1;
   - Apple Health receipts unchanged, with no new HealthKit write;
   - exactly one legacy DEXA row;
   - appointment completed once;
   - DEXA analysis and Goal evaluation present; one DEXA Event briefing;
   - no live continuation.

Both authorizations can be given together in one instruction. The apply still re-checks every fence under lock after the deploy.

## Founder action now

Do not re-upload, re-confirm or Mark Complete the DEXA priority. Provide authorizations 1 and 2 when ready.
