# Build 92 Training Variants Server/Web is LIVE (84cc64e4)

Task id: `build92-deploy-variant-server-20261007`
Prompt: `agent-handoffs/inbox/prompts/20261007-build92-deploy-variant-server.md` @ `7406ac00`
Go-ahead: `3630d601` (Founder visual approval). The visual-review branch `7c17645e` was **not** merged or used.

**Status:** PhysiqueOS Build 92 Training Variants Server/Web LIVE. Native Build 92 integration may run live contract validation.

## Deployment

| | Before | After |
|---|---|---|
| Production branch `combined-app-platform-cutover` | `738ce668` | **`84cc64e4e7205b2540bf78ea43afd1cbfb068d06`** (normal fast-forward `738ce668..84cc64e4`, no force) |
| Active deployment | `f0f1d3b4-8b95-4bc5-85ce-739a4fd0e255` ACTIVE 9/9 | **`32143aa4-90d4-496a-81b2-17f35a609fde` ACTIVE 9/9** (cause `manual`, force rebuild). `f0f1d3b4` is now SUPERSEDED. |
| web / worker `source_commit_hash` | `738ce668` / `738ce668` | **`84cc64e4` / `84cc64e4`** |
| web / worker spec stamps | `PHYSIQUEOS_GIT_SHA=738ce668…`, `PHYSIQUEOS_BUILD_ID=physiqueos-738ce668-20261007` | `84cc64e4…`, `physiqueos-84cc64e4-20261008`. Exactly 4 stamp lines changed, nothing else in the spec. |
| `/api/v1/health/live` | buildId `physiqueos-738ce668-20261007` | buildId **`physiqueos-84cc64e4-20261008`**, started 2026-10-08T02:12:45Z |
| `/api/v1/health/ready` | ready 9/9 | **ready 9/9**: access gate, provider configuration, database, database identity, product owner, schema **000014** (unchanged), runtime authority, object storage, deadline |
| In-progress / pending deployments | none | none |

* **Guarded two-step workflow:**
  1. push the branch;
  2. apply the stamp-only spec update;
  3. run `create-deployment --force-rebuild`.
* The automatic spec-update deployment `0900505a` (old commit) was **CANCELED**, superseded by the force rebuild, so no mislabeled or duplicate run went live.
* **Timing:** BUILDING 02:08Z, ACTIVE 02:13Z.
* **Rollback:** not needed. The rollback anchor is `738ce668` (deployment `f0f1d3b4`, preserved in deployment history).

## Pre-deploy gates (all passed)

**Gate 1: authority.**
* Live `738ce668`, deployment `f0f1d3b4` ACTIVE 9/9.
* No in-progress or pending deployment.
* Branch head equals live; ready 9/9; stamps and source hashes consistent.

**Gate 2: candidate shape.**
* `84cc64e4` is exactly one commit whose parent is `738ce668`: the reviewed foundation patch, cherry-picked with an identical patch-id to `6ac19b8c`.
* Universal Skip, Confidence V3 and Adaptive Progression are retained (the live commit is its parent).
* There is no `db/migrations`, DDL, dependency or lockfile, Dockerfile, deployment or infra, HealthKit, Sleep, Energy-history, `ios/` or `agent-handoffs/` change. The `src/platform/migration/*` hits are the collection-registry modules only (an optional collection mapping). No schema change.

**Gate 3: tests, rerun on the exact candidate.** The baseline is live `738ce668`, measured tonight on the same SHA, compared test by test.

| Gate | Candidate | Live base | New failures |
|---|---|---|---|
| Full unit (10,139 tests) | 9,840 pass / 294 fail | 294 fail | **0** (identical set) |
| Phase 3 / 4 / 6 / 6-Training / migration-safety | 1 / 0 / 3 / 0 / 15 fail | 1 / 0 / 3 / 0 / 15 fail | **0** |
| Universal Skip regression matrix | **142 / 142** | | |
| Training variant suites (definitions, commands, finalize, projection, PR, progression, records, seed tool in synthetic mode, Web Logger, Core navigation, native contract, parity) | **582 / 582** | | |
| Production webpack build in full provider-runtime mode (`PHYSIQUEOS_PROVIDER_FULL_RUNTIME=1`, standalone output, same environment as `Dockerfile.product`) | **compiled successfully** | | |
| Image artifact scan (`scanProviderArtifact.mjs .next/standalone public .next/static`) | **PASS**, 3,178 files, 0 violations | | |
| `fonts:check`, `ops:root:check`, middleware presence | pass | | |
| ESLint (36 changed files), `git diff --check` | clean | | |

**Gate 4: Build 91 compatibility.**
* Build 91's (`106f0518`) `training-logger` decoder is a synthesized `Decodable` with no `executionVariantsByExercise` field, so it ignores the additive projection and any optional `variantId` in history.
* With zero definitions every exercise is Ordinary only. **Create Variant does not appear on Build 91, nor on Build 92 until the Server projects the field.** Choices appear only once a definition exists.

## Post-deploy read-only verification

The check used the accepted read-only console runner (`runAppConsoleContextGzipFile.mjs`, context `physiqueos-final-cutover-config`, web component):
* runtime SHA gate `84cc64e4` and Founder-owner gate;
* `REPEATABLE READ READ ONLY` with `transaction_read_only = on` verified;
* owner-scoped `SELECT` counts only, explicit `ROLLBACK`;
* runner exit 0, success marker exactly once.

Results:
* **Code-level proof:** the compiled `/app/.next/server` output (400 files) contains `executionVariantsByExercise` (2 files), `training-catalog.execution-variant.create.v1` (2) and `trainingExecutionVariants` (5).
* **Production variant data:** **0** `trainingExecutionVariants` definitions. The live projection is therefore `{}`, which means Ordinary only, as intended.
* **Evidence untouched:** 9 evidence records carry the legacy `executionVariant` (historical Static Hold and Super Set occurrences), and **0** carry a `variantId`, so nothing was rewritten. Totals: canonical evidence 593, performance events 156, custom exercises 12.
* **Not performed (per task):** no variant create, rename or retire; no seed dry run or apply; no session finalization; no Founder write or smoke test.
* **Readability of Home, Goals, priority skip and training-logger:**
  * proven indirectly: ready 9/9 (database, runtime authority and owner checks use the same stores); exact tested code; unit-tested additive, empty-projection shapes.
  * **not performed:** an authenticated read through the Native endpoints, because no device credential is used by this lane. A full in-container reader payload (2.3 MB) would exceed the accepted runner's fixed 300 s console window, and I did not modify the accepted tooling.
  * **next:** the Native Build 92 integration lane's live contract validation with the paired device should confirm authenticated reads. No requests had reached the new deployment at report time; the Founder app was idle.

## Not done (separate gates)

* **Historical Static Hold seed:** neither the dry run nor the apply was run. They need separate explicit Founder authorization. The tools are retained in the deployed source for later review.
* No Super Set repair, no Sleep/Recovery or Energy-history change, no other candidate deployed.
* **Release authority:** `latest.json`/`latest.md` still say **Build 91**. This is a Server deploy, not a Native release.

## Native Build 92 integration handshake

* **Live Server contract:** `84cc64e4` serves the optional `executionVariantsByExercise` projection, currently `{}`, and accepts `training-catalog.execution-variant.create.v1`.
* **Native `39b818e2` against this Server:**
  * Create Variant… **does** appear (the projection field is present) for canonical catalog exercises under Founder Production;
  * no saved variants exist yet, so menus show Ordinary plus Create Variant….
* **Live validation may now run.** Note that creating a real variant during validation **is** a production Founder write, so it needs its own Founder authorization; it is not covered here.

## Storage and concurrency

* **Free space:** about 28 GiB before the gates, about 24 GiB after. The lane's `.next` output was removed after the scan; other lanes were also active.
* **Retained:** all archives (Builds 85–91), worktrees and other lanes' state.
* **Concurrency:** no Xcode job was running during the heavy Web builds.

## Production data mutation

**Zero.** The only production writes were the authorized deploy actions: branch fast-forward, stamp-only spec update, and force-rebuild deployment.
