# Corrected Photo Intelligence production supersession — deployed and verified

- **Decision:** `agent-handoffs/inbox/decisions/20260930T143500Z-photo-pi-corrected-production-supersession.md`
- **Accepted candidate:** `9a89ff903fd587839c53e5f896d5ae9c08d1aaa0`
- **Frozen Goal-blind ancestor:** `0d0f189e8ccddaf69c5d4b833b8c2a82ce49723b`
- **Exact production integration and deployed SHA:** `372c306ba45ffaa0f93f7bf74e4c0c266070d9a5`
- **Status:** **DEPLOYED and verified**
- **Native/TestFlight:** untouched
- **Private image inference:** not rerun
- **Historical Photo regeneration/backfill:** none

## Authority and guarded integration

The predeploy authority matched the decision exactly:

| Check | Predeploy result |
|---|---|
| Production branch | `combined-app-platform-cutover` at `4a81f5b4cac981f9241e40b556341246b83c3309` |
| Active deployment | `1fa2121a-5729-49c3-9865-a79f1724bb3f`, ACTIVE 9/9 |
| Web source SHA | `4a81f5b4cac981f9241e40b556341246b83c3309` |
| Worker source SHA | `4a81f5b4cac981f9241e40b556341246b83c3309` |
| `/live` and `/ready` | HTTP 200 |
| Build ID | `physiqueos-4a81f5b4-20260930` |
| Pending/in-progress deployment | none |
| Persistent-pairing enrollment | `PHYSIQUEOS_SENDER_CONSTRAINED_REFRESH_ENROLLMENT` absent/unset on web and worker |

The integration starts at exact Build 70 production authority `4a81f5b4` and semantically replays only the reviewed Photo Intelligence commits:

1. `f291a26f` — reviewed Goal-blind perception isolation (`1f7709ae`)
2. `cfc63450` — reviewed typed/sanitized provider-boundary sealing (`0d0f189e`)
3. `372c306b` — reviewed Goal hierarchy and coach realization (`9a89ff90`)

`4a81f5b4` is an ancestor of `372c306b`. The resulting ten-file Photo Intelligence tree is byte-identical to accepted candidate `9a89ff90`; `git diff --quiet 9a89ff90..372c306b -- <the ten reviewed PI files>` passed. The integration changes only:

- `src/app/evidence/review/[reviewId]/PhotoAnalysisContinuation.test.js`
- `src/app/evidence/review/[reviewId]/actions.js`
- `src/domain/interpreters/CanonicalPhotoPerceptionService.js`
- `src/domain/interpreters/CanonicalPhotoPerceptionService.test.js`
- `src/domain/services/PhotoBriefingHolisticSynthesisService.js`
- `src/domain/services/PhotoBriefingHolisticSynthesisService.test.js`
- `src/domain/services/PhotoEventContextService.js`
- `src/domain/services/PhotoEventContextService.test.js`
- `src/domain/services/PhotoEventNarrativeService.js`
- `src/domain/services/PhotoEventNarrativeService.test.js`

No migration, schema, package/dependency, infrastructure, Docker, or Native file changed. Build 70 Server/auth/peptide work remains the production base and is not reimplemented or overwritten.

## Schema and persistent-pairing state

Read-only predeploy and postdeploy database checks both established:

- `transaction_read_only = on`;
- latest migration remains `000015_sender_constrained_refresh_recovery`, originally applied at `2026-09-30T04:01:01.450Z`;
- no new migration was introduced;
- `installation_signing_keys`, `refresh_proof_challenges`, `refresh_exchanges`, and `refresh_exchange_access_credentials` each remain at zero rows;
- sessions remain 45 total, zero `proof_v1`, zero installation-bound;
- devices remain 45 total, zero proof-capable.

The enrollment environment flag remains absent/unset on both web and worker. The deployment created no enrollment, challenge, exchange, or access-credential state.

`/ready` continues to expose the existing readiness code `PROVIDER_MIGRATION_000014_APPLIED`; direct database authority confirms migration 000015 is applied and latest. This is a pre-existing readiness-label nuance, not a migration rollback.

## Exact-integration gates

All product gates ran on exact SHA `372c306b`:

| Gate | Result |
|---|---|
| Goal-blind provider boundary, adversarial sanitization, canonical perception, stable/no-change behavior, observation-specific comparability, multi-view reconciliation, Goal/guardrail projection, evidence hierarchy, Goal-relative compatibility, time-causal synthesis, realization/redundancy, historical readability/immutability, frozen Case 1/2 integrity | **100/100 passed** across 11 files |
| Build 70 Server/auth/peptide/Native-contract regression set | **376/376 passed** across 18 files |
| Foundation suite | **38/38 passed** across 9 files |
| Access gate | **174/174 passed** across 12 files |
| Phase 2 | **121/121 passed** across 13 files; four sandbox-only socket `EPERM` timeouts disappeared on the permitted rerun |
| Targeted ESLint over all ten changed files | passed |
| Exact production webpack build | passed; Next 16.2.9, existing middleware deprecation warning only |
| `git diff --check 4a81f5b4..372c306b` | passed |
| Migration/dependency/infrastructure/Native diff check | no changes |

A fresh exact-integration review found no P0, P1, or P2 integration issue. It separately checked the Build 70 base, the ten-file accepted-candidate byte identity, the provider boundary, prospective-only producer behavior, historical-read paths, and the absence of cross-cutting migration/config changes. No source was tuned after the accepted Sep 19 replay and no Founder image inference was needed or run.

One initial test invocation omitted `--config vitest.unit.config.js`, selected only the Storybook project, and found no tests. It made no changes and was immediately superseded by the correctly configured 100/100 run above.

## Deployment

The production branch was fast-forwarded without force from `4a81f5b4` to exact integration SHA `372c306b`. The preserved integration branch was published as `codex/photo-pi-production-supersession-20260930`.

Only four App Platform spec values changed:

- web `PHYSIQUEOS_GIT_SHA`
- web `PHYSIQUEOS_BUILD_ID`
- worker `PHYSIQUEOS_GIT_SHA`
- worker `PHYSIQUEOS_BUILD_ID`

The new values are full SHA `372c306ba45ffaa0f93f7bf74e4c0c266070d9a5` and build ID `physiqueos-372c306b-20260930`. No feature flag, secret, route, sizing, or other spec field changed.

- Automatic spec-update deployment: `c9c2c6cc-8716-46d9-aeab-fc764c67de9b`
- Guarded force-rebuild deployment: `4dac1b07-8fc6-4ab4-9b8d-7f9c3756ddbb`
- Final observed state: **ACTIVE 9/9** at `2026-09-30T15:24:16Z`
- `/live`: HTTP 200, build `physiqueos-372c306b-20260930`
- `/ready`: HTTP 200, all checks ready
- Web `source_commit_hash`: exact `372c306b...`
- Worker `source_commit_hash`: exact `372c306b...`

After all of those checks succeeded, one redundant final DigitalOcean status read returned HTTP 401 after a credential became invalid/expired. It occurred after ACTIVE 9/9, health, readiness, source-SHA parity, runtime, database, and data-drift verification were complete; no retry or production mutation was attempted. Consequently this report does not assert a subsequently re-read terminal state for the superseded automatic deployment ID.

## Running-build verification

A read-only scan of `/app/.next/server` on the exact active deployment found the corrected Photo Intelligence code paths:

| Corrected PI marker | Count |
|---|---:|
| `canonical_photo_perception_goal_blind_v2` | 1 |
| `canonical_photo_provider_input_typed_v1` | 1 |
| `photo_briefing_holistic_v2` | 1 |
| `jointly_supportive` | 5 |
| `primary_objective` | 2 |

The same running build retained representative Build 70 contracts:

| Build 70 marker | Count |
|---|---:|
| `operating-plan.peptide-lifecycle.change.v1` | 2 |
| `PRIORITY_OCCURRENCE_PAUSED` | 4 |
| `PEPTIDE_LIFECYCLE_NOT_ACTIVE` | 3 |
| `scheduleSuspensions` | 18 |
| `doseAdjustable` | 2 |
| `refresh-challenge` | 25 |
| `sender-constrained-refresh-v1` | 1 |
| `legacy-refresh-v1` | 2 |
| `priority.skip.v1` | 4 |
| `PRIORITY_SKIP_UNSUPPORTED` | 2 |
| `Apple Health` | 93 |

## Historical immutability and data drift

No Photo Event was generated, no historical producer was rerun, and no Photo or analysis artifact was rewritten.

Read-only canonical snapshots establish:

| Scope | Predeploy | Postdeploy | Result |
|---|---:|---:|---|
| Photo records | 114, digest `b5da12aa6caa4c91986b5383834c73b2af914fb9bda16d981e18ca79ad6fb697` | same | **exactly unchanged** |
| Sep 19 Photo records | 14, digest `b2db1cf4dcb9b13fa16c865ba4899ec5e120d605cfbcd6935f16a1b116416086` | same | **exactly unchanged** |
| All canonical records | 2917, digest `711c28f56840a359a3287a86ab5f4538f57bfe7c539832a890abeec7247e5381` | 2921, digest `16a238f53fbd71cd91a6dff4549cee6877a413f50f9e7eaa65b7be4424e9dd1e` | four natural records arrived before deployment |

The four general records share update time `2026-09-30T15:17:45.658Z`, before the spec update at `15:19:32Z`, and are one each in `dailyCheckIns`, `weightEntries`, `canonicalEvidenceObjects`, and `analyses`. They are ordinary predeployment application activity, not deploy drift. The protected Photo and Sep 19 scopes are byte-for-byte stable.

## Product state and rollback

Corrected Goal-blind perception, typed provider inputs, multi-view reconciliation, Goal hierarchy, compatibility, holistic v2 synthesis, and coach realization now apply prospectively through the normal future Photo Event lifecycle. Existing historical Photo Events and Briefings remain unchanged and readable. The next real Founder monthly multi-pose Build Lean Mass event is the prospective production acceptance; no historical test case should be manufactured.

If rollback is required, create a new production descendant that reverts only these ten PI files to their Build 70 `4a81f5b4` state, update the four SHA/build stamps to that rollback commit, and force rebuild. Do not rewind shared branch history, alter migration 000015, or rewrite any Photo history.

## Residual follow-ups and local-only state

- Observe the next natural monthly multi-pose Photo Event; do not backfill or regenerate history.
- The existing `/ready` migration label can be corrected separately, but it did not affect direct schema authority or this deployment.
- A local ignored helper, `.tmp/digitalocean/update-production-photo-pi-stamps.mjs`, was used only to validate the old branch/stamps and stream the four-value spec update without retaining a plaintext production spec. It contains no credential or private Founder data and is not committed.
- No Native change, TestFlight upload, persistent-pairing enrollment, private image inference, historical artifact rewrite, or additional production mutation is pending from this decision.

**Final recommendation/status:** keep deployment `4dac1b07-8fc6-4ab4-9b8d-7f9c3756ddbb` active at exact SHA `372c306b`; the guarded production supersession is complete.
