# October 9 DEXA: bounded confirmation fix and guarded recovery (CANDIDATE)

- Task id: `claude-dexa-bounded-confirmation-fix-recovery-candidate-20261009`
- Assignment: Claude inbox prompt of 2026-10-09 (bounded DEXA confirmation fix and recovery candidate), commit `982ca4ab`
- Agent: Claude (Opus 5.5)
- Generated: 2026-10-09T15:47Z
- Mode: candidate only. **No deploy, no production mutation, no recovery execution, no Build 93 change, no release-pointer change.**

## Candidate

| | |
|---|---|
| Branch | `claude/dexa-bounded-confirmation-recovery-20261009` (pushed, non-force) |
| Head | `539f7006010989a1c58797b582ac003798cfdd64` |
| Base | Build 93 Server candidate `e03f6768627f49175c476208eca79c99ae3d5ee9` (unchanged) |
| Size | 22 files, +3331 / −14 (most of it tests, harness, recovery and runbook) |
| Portability | All 5 modified source files are byte-identical between production `84cc64e4` and `e03f6768`, so the commits also apply to production unchanged. |

Commits, in order. Each one is independently reviewable, and each passes its own tests.

1. `ebf60654` fix(server): bound every DEXA post-confirmation step to the records it uses
2. `98b4ab97` fix(server): a Native retry of a resumed review runs no step in the request
3. `ccc6375f` perf(server): hash the Founder runtime semantic digest without one giant string
4. `c452e61f` test(server): production-shaped memory harness for the DEXA confirmation steps
5. `539f7006` feat(ops): guarded recovery for the October 9 DEXA confirmation (not executed)

Runbook in the branch: `docs/operations/DEXA_CONFIRMATION_CONTINUATION.md`.

## Authority at publication (re-verified live)

- Production: Server `84cc64e4` on deployment `32143aa4`, web and worker both, ACTIVE, no in-progress deployment. Read via `physiqueos-final-cutover-config`.
- Build 93: Native `ac3def4c`, Server `e03f6768`. Both are candidates only. TestFlight is still Build 92.
- Codex is resuming the storage-gated Build 93 release. Latest main is `63a8c895`, after the Option B and verified-cleanup handoffs `cbf879cb` and `4bdaeefb`.
- This task touched no Codex worktree or branch and ran no Xcode, simulator or Native build. The Next.js production build was deliberately held (see Gates).
- No production read or write was performed in this task. Production facts come from the read-only report `20261009T150500Z` (main `2f903439`).

## Step audit (DEXA path at `e03f6768`) and disposition

| Step | Before (production code) | Now, for DEXA-only confirmations |
|---|---|---|
| Confirmation entry (every invocation) | One in-scope whole-runtime load for the durable-resume proof | **Unchanged. Residual (measured below).** |
| `compatibility_writes` | Unscoped whole-runtime load to find the scan, plus a whole-runtime facade write for one `dexaScans` row. **The Oct 9 crash.** | Bounded `canonicalEvidenceObjects` read, plus a single-record write of the one row |
| `scheduled_completion` | Whole load, whole-runtime facade read and whole-runtime write of the appointment | Bounded canonical read, plus a single-record appointment reconciliation using the existing lifecycle logic |
| `analysis` | Whole canonical load and unscoped whole `listDEXAScans`; bounded analyses write | Bounded reads; existing bounded analyses writer (Photo-fix precedent) |
| `training_performance_events` | No-op for DEXA | Unchanged |
| `goal_evaluation` | One in-scope whole load | Bounded read of the 6 consumed collections; existing analyses writer |
| `event_eligibility` | Pure | Unchanged |
| `briefing` | In-scope whole load for preferences; whole load **plus clone** for the DEXA Event; whole-store digest string | Bounded preference read; bounded, guarded DEXA Event runtime (no clone) excluding review/package history, Training events and libraries, and PI queues; streaming digest |
| `home_refresh`, final confirm | Pure / targeted | Unchanged |

Every other evidence type keeps its exact existing path.

Mechanisms:

- `executePostgresFounderRecordMutation`:
  - takes the owner advisory lock and claims the runtime-authority boundary;
  - reads each named record `FOR UPDATE`;
  - writes only the rows that changed, each fenced on the version it was read at;
  - loads no collection;
  - keeps row metadata and version semantics identical to `replaceCollection` (pinned by a parity test against the whole-runtime write).
- `createGuardedBoundedRuntime`: a bounded load no longer silently defaults unloaded collections to empty. Any read of an unloaded collection throws a coded, retryable error. One repository (Daily Briefings) reads eagerly at construction, so the bounded steps build only the repositories they use.
- **Native retry fix:** when a Native Confirm resumes a review whose canonical save is already durable, it now runs zero synchronous steps. It claims, releases to the worker chain, and returns `processing`/`accepted`. This is exactly what restarted the web process at 14:38Z on Oct 9. It restores the documented contract in `DexaConfirmationResumeRegression`, which **failed on the `e03f6768` base** and now passes.
- **Streaming semantic digest:** identical digests, no giant string. It is shared by every V3 publication; equivalence is tested against the previous implementation verbatim.

## Memory evidence (`scripts/operations/memory/`, opt-in)

Setup:
- Each step runs in its own Node process.
- Heap limit: `--max-old-space-size=512`.
- Baseline: 150 MB retained, standing in for the web/worker process.
- Runtime: synthetic, shaped like production on 2026-10-09 and scaled to **87.9 MB** of foundation JSON. Production is 62.8 MB; the 84 MB measured on Oct 9 included about 21.6 MB of HealthKit collections that the runtime loader never loads.
- Peaks are sampled around every database statement. "Min heap" is the smallest limit (16 MB steps, no baseline) at which the step completes.

| Step | Before | After | Min heap after |
|---|---|---|---|
| compatibility_writes | **out of memory** (min 480) | 171 MB | 80 MB |
| scheduled_completion | **out of memory** (min 480) | 171 MB | 80 MB |
| analysis | 486 MB | 335 MB | 128 MB |
| goal_evaluation | 479 MB | 331 MB | 112 MB |
| briefing (DEXA Event) | 514 MB (491 with the new digest) | 387 MB | 192 MB |
| confirmation entry (unchanged) | 476 MB | 476 MB | 336 MB |

Notes on these numbers:
- The harness reproduces the production failure: both previously crashing steps exhaust the heap.
- The digest change alone took the DEXA briefing's baseline-digest phase from +207 MB to +12 MB.
- The analysis and Goal-evaluation remainder is the existing, collection-bounded analyses writer.

## Tests and gates

| Gate | Result |
|---|---|
| New tests | 120, all passing: record mutation 14, guard 7, bounded steps 20, end-to-end provider-mode continuation 10 (including the Native retry), digest equivalence 14, recovery planner/run/postflight 45, payload builder 10 |
| End-to-end regression | Real handlers, bounded loader, mutations and appointment logic over a persisting fake canonical database. Starts from the exact Oct 9 shape (`committing`, expired `native-confirm` claim, `compatibility_writes` started at attempt 3, dead continuation) and reaches `confirmed` with **zero whole-runtime repository calls**. It also proves: stale dead-letter key is a no-op; claim takeover only after lease lapse; crash/retry idempotency; one compatibility row; appointment completed once; no canonical replay; non-DEXA isolation. |
| DEXA/Photo/Training confirmation suites | `DexaConfirmationResumeRegression` 12/12 (was 11/12 on base), `PhotoAnalysisContinuation` passing, `ConfirmationRuntimeLoadBounds` passing |
| Full unit suite (`vitest.unit.config.js`, 2 workers) | 10,460 tests: 10,161 pass, 294 fail in 107 files. **Zero new failures:** the per-test failure set for those 107 files is identical on `e03f6768`. Pre-existing causes: missing gitignored private Founder runtime/media (144), migration-control and root-worktree tooling unavailable in a linked worktree (55), stale source-text assertions, date/fixture-dependent tests. |
| ESLint | Clean on all 21 changed files. The repo-wide run reports 6 pre-existing problems, all in untouched files. |
| Payload builder | Bundles a 29 KB preview payload at the head; refuses `84cc64e4` and `e03f6768` (fix absent). |
| **HELD: Next.js production build** | Not run. Codex is resuming the storage-gated Build 93 release (12 GiB hard floor, measured stage budgets, timing-sensitive UI gate). A local `.next` build would consume GiB-scale disk and saturate the CPU mid-gate. Run it as part of the guarded Server deploy gate for this candidate. |
| Not run | `test:phase4:postgres` / `test:phase2:postgres` validators (no local PostgreSQL). Provider SQL is covered by the fake-database statement contract and parity tests. |

## Recommended deployment and recovery order

1. **Do nothing to production now.** Do not re-upload, re-confirm, re-arm or mark the DEXA priority. The review is `committing`, so a Native Confirm is already a no-op.
2. **Codex finishes Build 93 untouched:** its guarded deploy of exact `e03f6768`, then Build 93 upload and VALID. Do not fold this candidate into Codex's exact-candidate gates.
3. **Server-only follow-up deploy of `539f7006`** (= `e03f6768` + these 5 commits), with:
   - its own guarded gates: production build, migration/schema guard (no migration is added), scoped DEXA/Photo/review suites, health/ready;
   - a rollback anchor of `e03f6768`;
   - no Native change required.

   If the Founder prefers the fix before Build 93 ships, the same commits apply unchanged on `84cc64e4`. That would change production authority under Codex's in-flight release, so it should only happen with Codex explicitly paused.
4. **Recovery preview** (read-only) via the accepted Mac console runner, built for the deployed SHA. Keep the seal in local scratch only.
5. **Founder authorization reference**, after reviewing the sanitized preview. Then **apply**: one fenced outbox insert under the owner lock, refused on any drift.
6. **Postflight** (read-only), repeated until `complete`. Expected end state:
   - review `confirmed`, nine steps completed, canonical_commit attempted once;
   - one canonical scan, still revision 1;
   - Apple Health receipts unchanged, with **no new Apple Health write**;
   - one legacy DEXA row;
   - appointment completed once;
   - DEXA analysis and Goal evaluation present;
   - one DEXA Event briefing;
   - no live continuation.

## Recovery mechanism: what it does and why

- **Why not reset the dead message** (the Photo precedent): its key is `compatibility_writes:not_started:0`, but the review's checkpoint is now `started:3` after the Native retry, and its operation does not own the claim. The worker would reject it as `stale` and do nothing. The end-to-end test proves this.
- **What it does:** inserts exactly one continuation for the review's current checkpoint, built by `createEvidenceReviewContinuationMessage`, the same function the system uses to enqueue continuations. The worker takes over the lapsed claim and resumes on the bounded steps. The dead message stays as history.
- **Preview checks:** single receipt, review, and canonical revision 1; completed steps exactly `[canonical_commit]`; lapsed `native-confirm` claim (at least 5 minutes); exactly one dead message and no live one; no legacy row; scheduled appointment; no briefing or analysis yet; exactly two Apple Health receipts for revision 1; no other open DEXA review for the date.
- **What the seal pins:** ids, versions, a review-state digest, and the predicted message.
- **Apply:** requires a Founder authorization reference plus the seal, both baked into the payload at build time. It re-derives everything under the owner lock with row locks and refuses with `SEAL_DRIFT` on any change. It is idempotent (`already_applied`).
- **No Founder identifier is in source.** The owner comes from the runtime binding, and the review is discovered from its 2026-10-09 DEXA intake receipt.

## Residual risks and limitations (disclosed, not hidden)

1. **Confirmation entry load.** Every continuation invocation still begins with one in-scope whole-runtime load (`assertDurableResumeState`).
   - It is pre-existing and shared by every evidence type.
   - It survived at least 4 times in production on Oct 9 at production size.
   - It passes at 512 MB with the 150 MB baseline on the 1.4x runtime (476 MB sampled).
   - It becomes the limiting step if the foundation runtime grows past roughly 85 MB.
   - Recommended next Server change: bound it, or read the review targeted first.
   - It is not a known crash path at current size, which is why recovery is not held on it.
2. **DEXA Event bounded collection set.** It was derived from read instrumentation of the real provider DEXA Event path (generate, V3 finalizer, bounded publication) plus static review. A production-only branch that reads an excluded collection would fail the step **loudly and retryably** (dead-letter, then `partially_committed`, both observable), never silently degrade or crash. Postflight would show `failed` at `briefing`.
3. **Analyses writer.** Analysis and Goal evaluation still use the existing collection-bounded analyses writer, which rewrites the analyses collection: 128 MB minimum heap at 1.4x.
4. **Gates not run here:** the Next production build and the PostgreSQL validators, as above.

## Decisions required (Founder)

1. Approve the Server-only follow-up deploy of `539f7006` after Codex completes Build 93, through the guarded deploy path, including the production build gate.
2. After that deploy, approve the read-only recovery preview, then separately give the authorization reference for the single-insert apply.
3. Optionally, prioritize bounding the confirmation-entry load (residual 1) in the next Server lane.

## Separation statement

- No production read or write; no deploy; no recovery executed.
- No Build 93 Native or Server candidate changed; no Codex worktree or branch touched.
- No Xcode, simulator or Native build; no release-pointer change.
- GitHub writes: the candidate branch (new, non-force) and this additive report on main.
- The local scratch holds no Founder data. The harness is fully synthetic.
