# Build 92 Training Variant Server/Web candidate rebased onto live Server and verified

Task id: `build92-variant-server-reconcile-live-20261007`
Prompt: `agent-handoffs/inbox/prompts/20261007-build92-variant-server-reconcile-live.md` @ `4ee8cf13`
Owner: Claude, continuing the Build 92 Training Variants conversation.

**Status:** PhysiqueOS Build 92 Training Variants Server/Web candidate rebased and verified; no deployment performed.

## Authorities

| Item | Value |
|---|---|
| **Candidate SHA** | **`84cc64e4e7205b2540bf78ea43afd1cbfb068d06`** |
| Branch | `claude/build92-training-variant-server-integration-20261007` (normal push, verified on remote) |
| New base: live production Server | `738ce66849a1361b4ce0ed069a4a04eac6abc4ef` (Universal Skip). Active deployment `f0f1d3b4-8b95-4bc5-85ce-739a4fd0e255`, with web and worker both on `738ce668`. Health buildId `physiqueos-738ce668-20261007`, re-verified at start and at report time. |
| Old foundation | `6ac19b8c2e224a91a04e53aa5029ad14d2f3e2a3` on `e7ffc671`. Not deployed, not fast-forwarded, and its branch was left unchanged. |
| Native candidate | `39b818e2`, verified committed, pushed and clean **before** this task switched branches. It was not modified. |
| Shipped Native | Build 91 `106f0518`, untouched |

## Integration and overlap proof

* `e7ffc671` is an ancestor of `738ce668`, and there is exactly **one** live commit since the foundation's base (`738ce668 feat: implement universal priority skip`, 30 files).
* The candidate is `738ce668` plus a `git cherry-pick -x` of `6ac19b8c`. That is one commit, and it applied **cleanly**.
* **Patch identity:**
  * `git patch-id --stable` is identical for `6ac19b8c` and `84cc64e4` (`4ed6820a…`), so the variant change is exactly the reviewed foundation patch.
  * `git diff 6ac19b8c 84cc64e4` is exactly the Universal Skip diff (30 files, +1258/−257), so every live change is retained.
* **Overlap:** the only file both commits touch is `src/application/commands/CanonicalPersistenceCommandPorts.js`.
  * Universal Skip rewrote the `priority.skip.v1` port region (hunks around lines 39, 203 and 2372–2600) and removed `SKIP_SUPPORT_REMINDER_TYPES`.
  * The foundation added imports, port names and the four variant ports. It also added a variant-definitions read and `variantId` stamping inside `createNativeTrainingPackage`, plus resolver use in the commit-time PR analysis and helper functions. All of these are disjoint regions.
  * There is no shared business semantics: priority skip versus Training execution variants. **No conflict, so no stop condition.**
* **Confidence V3 and Adaptive Progression:** both are unchanged beyond the foundation's already-reviewed, additive resolver threading. Thresholds and the adaptive selector are untouched.

## Scope retained (no extra feature scope)

The candidate is exactly the foundation behavior from report `20261007T155922Z-build92-training-variant-server-foundation.md`:

* per-exercise `trainingExecutionVariants` definitions with immutable `tev_` ids, `legacyKeys`, active/retired status and provenance;
* create, rename, retire and reactivate commands, where a duplicate returns the existing variant and a retired name is reactivated;
* reserved Ordinary and Superset names;
* the optional `executionVariantsByExercise` Logger projection, never derived from history;
* Web chooses only from the projected options for that exercise;
* finalize validates and stamps the canonical `variantId`, and the legacy Build 90/91 shape stays valid;
* one resolver partitions progression, records, PR baselines and previous performance, and is identical to the legacy behavior when no definitions exist.

Also true of this candidate:

* No timed or duration logging, no Native rename/retire UI, no Super Set seed.
* No Energy phase history, Recovery Briefing or Settings work.
* **Zero schema:** no DDL and no migration. The candidate touches no `db/migrations`, `deployment/`, `infra/`, Dockerfile, `package.json`/lockfile, `agent-handoffs/`, release-authority, latest pointer or `ios/` path (diff path scan against `738ce668`).
* **Release authority diff:** none.

## Build and client compatibility

* **Shipped Build 91** (`106f0518`) decodes `training-logger` with a plain `Decodable` that ignores unknown keys, and it sends no variants. It is unaffected, and zero definitions means Ordinary only.
* **Native candidate `39b818e2`:** I generated the Server's real projection with `projectTrainingExecutionVariantChoices` and checked it field by field against the Native `TrainingExecutionVariantChoice` and selection decoders.
  * keyed by canonical exercise id;
  * choice keys `key, label, legacyKeys, provenance, selection, status, variantId`;
  * selection keys `key, label, rawLabel, variantId`;
  * selection names itself, `tev_` prefix, active status;
  * **all pass**.
* The create result `{status, variant{variantId, canonicalExerciseId, key, label, legacyKeys, status, provenance, …}, selection}` matches the Native `VariantResult`, and is covered by `TrainingExecutionVariantCommands.test.js`.

## Test results

All comparisons are against live base `738ce668`, measured in the same worktree with the same dependencies. Failure sets were compared test by test.

| Gate | Candidate `84cc64e4` | Base `738ce668` | Change |
|---|---|---|---|
| Full unit (`vitest.unit.config.js`) | 10,139 tests: 9,840 pass / 294 fail | 10,106 tests: 9,807 pass / 294 fail | **0 new failures, 0 fixed**; +33 new tests all pass |
| Phase 3 | 320 / 1 fail | 319 / 1 fail | identical failure |
| Phase 4 | 156 / 0 | 156 / 0 | green |
| Phase 6 | 566 / 3 fail (4 entries) | 565 / 3 fail (4 entries) | identical |
| Phase 6 Training | 186 / 0 | 185 / 0 | green |
| Migration safety | 1,201 / 15 fail | 1,201 / 15 fail | identical |
| **Universal Skip regression matrix** (PrioritySkipCommand, UniversalPrioritySkip, PrioritySkipService, Web parity, DEXA/Execution priority detail, ExecutionBackedDailyFocus, Morning evidence recovery and priority reconciliation, PriorityDetailSkip, ReminderOccurrenceCompletion, Supplement support) | **142 / 142** | | |
| Foundation suites (definitions, commands and finalize, seed runner, progression, records, propagation, Core navigation, web Logger preview/production, canonical persistence, Phase-3 parity, native contract) | **582 / 582** | | |
| **Web production bundle** (`npm run build -- --webpack`, production env) | **Compiled successfully** | | |
| ESLint on all 36 changed JS/JSX/MJS files | clean | | |
| `git diff --check` | clean | | |

* **Baseline-only failures:** every remaining failure (unit 294, Phase 3 1, Phase 6 3, migration safety 15) is present **identically at `738ce668`**. The exact per-test lists are retained locally.
* **Static Hold seed utilities** remain deterministic and tested in synthetic mode only: dry run, apply, idempotent rerun, reactivation, drift refusal, no evidence rewrite and no Super Set (6/6). **No production seed dry run or apply was run.**

## Zero production mutation

* Production access in this task was limited to the read-only `doctl apps get` identity check and the public health endpoint.
* No database read, no write, no deploy, no seed.

## Storage and concurrency

| Moment | Free on `/System/Volumes/Data` |
|---|---|
| Start (after a Mac reboot) | 30–31 GiB |
| End | 29 GiB |

* **Removed:** only this lane's regenerable Next.js output (`.next`, 697 MB) after the bundle result was captured.
* **Retained:** all worktrees, release archives, other lanes' simulators and outputs.
* **Concurrency with the HealthKit/Codex Native lane:** an `xcodebuild test` from `native-production-read-foundation` started during this task. The heavy Web bundle build was **deferred until that job exited and the load settled**. The Vitest suites ran before it started.

## Readiness

The candidate is ready for Founder review. It is not deployed.

## Future authorization gates (in order)

1. **Server deploy** of `84cc64e4`: the standard two-step App Platform update (spec GIT_SHA/BUILD_ID on web and worker, then a forced deployment). It is invisible to Build 91 until definitions exist.
2. **Legacy Static Hold seed dry run** against the deployed SHA (`scripts/operations/buildTrainingExecutionVariantSeedPayload.mjs --sha <deployed> --mode dry-run`), separately authorized.
3. **Seed apply** (at most 2 definition records), separately authorized, using the dry run's facts.
4. **Native Build 92 integration:** Native variants `39b818e2` plus Codex's closeout lane, then the bump, archive and TestFlight, each separately authorized.
5. **Super Set evidence cleanup:** a separate future task, if wanted.
