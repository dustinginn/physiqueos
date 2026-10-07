# Build 92 Training Variant Server Foundation: candidate ready for Founder review

Task id: `build92-training-variant-server-foundation-20261007`
Prompt: `agent-handoffs/inbox/prompts/20261007T154500Z-claude-build92-training-variant-server-foundation.md` @ `026bd119`
Audit authority: `63bf054e` (report `20261007T151537Z-training-variant-audit-build92-design.md`)

**Status:** Build 92 Training Variant Server Foundation ready for Founder review.

## Candidate

| Item | Value |
|---|---|
| Candidate SHA | **`6ac19b8c2e224a91a04e53aa5029ad14d2f3e2a3`** |
| Branch | `claude/build92-training-variant-server-foundation` (pushed; isolated, not merged) |
| Base | production Server `e7ffc6716706ae4d2140008a1655bfed95a93889` (verified ancestor) |
| Production | still `e7ffc671`, deployment `b98c26e4`, health buildId `physiqueos-e7ffc671-20261007` (re-verified at report time) |
| Native | unchanged; shipped Build 90 `32baf1d5` |
| Diff | 38 files, +2024 / −62 |

Nothing was deployed, seeded, or mutated in production. Build 91 candidates were not touched. Native was not bumped or uploaded, and there was no production read in this task.

## 1. Canonical model

The new module is `src/domain/models/trainingExecutionVariantDefinition.js`. Definitions live in collection **`trainingExecutionVariants`**, mapped to `canonical_training_records`. It is registered as an optional foundation collection, the same way `myLibraryMemberships` was.

```
{ id: "tev_<32 hex>",               // immutable; the partition identity
  schemaVersion: "training_execution_variant_v1",
  canonicalExerciseId,                // per-exercise scope (D1)
  displayName, key,                   // Server-normalized; key drives duplicate detection
  legacyKeys: [],                     // aliases that historical occurrences resolve through
  status: "active" | "retired",
  provenance: "system" | "user_created" | "legacy_seed",
  createdAt, updatedAt, retiredAt, version }
```

* There are no duration, `loggingMode`, tempo, or per-variant set-schema fields (D2). A test asserts they are absent. V1 variants inherit the exercise's sets/reps/load semantics.
* **Ordinary stays the sentinel** (absent variant) and is not materialized. Materializing it would have added a fake identity to every existing occurrence and changed every partition key, with no simplification.
* Reserved names: `Ordinary`, and the Superset family (`super set`, `superset`, `super_set`, plurals), which returns 400 `TRAINING_EXECUTION_VARIANT_NAME_RESERVED`.
* Display names are trimmed, whitespace is collapsed, and the existing label rules apply. The maximum length is 40.
* **Occurrence shape (additive):** a selected occurrence stores `executionVariant {variantId, key, label, rawLabel}`. `normalizeTrainingExecutionVariant` keeps a well-formed `variantId` and drops anything else, so every pre-Build-92 occurrence normalizes byte-identically.

## 2. Commands

All four commands use the Phase-3 idempotent command service. All four are in the Native write allowlist, the contract manifest, and the OpenAPI command enum.

| Command | Required | Behavior |
|---|---|---|
| `training-catalog.execution-variant.create.v1` | `canonicalExerciseId`, `displayName` | The Server derives the id deterministically from owner + validated UUIDv7 `commandId`, so a replay produces the same id and the client never chooses it. An unknown exercise returns 404. An active same-exercise duplicate (case- and whitespace-insensitive, or a legacy-alias match) returns **`already_exists` with the existing identity**, never a 409. A retired match is **reactivated** (D6). Returns `{status, variant, selection}`. |
| `…rename.v1` | `variantId`, `displayName` | The id is unchanged. The prior key moves to `legacyKeys`. 409 `TRAINING_EXECUTION_VARIANT_DUPLICATE` if another same-exercise variant owns the name. |
| `…retire.v1` | `variantId` | Idempotent. Removes the variant from choices only; history, records, and progression stay resolvable. |
| `…reactivate.v1` | `variantId` | Idempotent. |

**Rename/retire disposition (D5):** rename, retire, and reactivate all fitted the existing pattern cleanly, so all four Server authorities are implemented. Native Build 92 should still expose **Create + Select only**.

## 3. Per-exercise Logger projection

The `training-logger` read (`coreNavigation.getTrainingLogger`) gains an additive field:

```
executionVariantsByExercise: {
  spider_curl: [{ variantId, key, label, legacyKeys, status: "active", provenance,
                  selection: { variantId, key, label, rawLabel } }]
}
```

* Only active definitions appear, and only for catalog exercises. Choices are sorted by label. An exercise with no definitions is **absent, which means Ordinary only**.
* Choices are **never inferred from history**. A test proves that a history containing `static_hold` and `super_set` with zero definitions projects `{}`.
* `selection` is the exact finalize payload. It is also a valid legacy `executionVariant` for older readers.
* Every other existing field keeps its shape (tested).
* **Build 90 safety:** `ProductionTrainingLoggerAPI.Payload` is a plain `Decodable` that ignores unknown keys, and Build 90 never sends a variant. Native needed no model or decoder change, and none was made.

## 4. Finalize and backward compatibility

The change is in `commitTrainingSession` (Native, `training-session.commit.v1`) via `resolveCommittedExecutionVariant`:

* **Stable id:** the definition must exist (400 `TRAINING_EXECUTION_VARIANT_UNKNOWN`) and must belong to the same canonical exercise (400 `TRAINING_EXECUTION_VARIANT_EXERCISE_MISMATCH`). The Server stamps `{variantId, key, label, rawLabel}` from the definition and ignores the client's label and key. A retired definition is still accepted, so a workout selected before retirement is never lost.
* **Legacy shape (Build 90 and earlier, Evidence Review, Web):** still valid. When its key matches a same-exercise definition (current key or legacy key), `variantId` is attached additively. Otherwise it is stored exactly as before.
* **Ordinary-only commits:** these never read definitions during validation and persist exactly as before. Only the PR-baseline stage adds one bounded definitions read.
* **Web and Evidence Review paths:** `variantId` is preserved by normalization and validated at read time, because the resolver only honours a `variantId` whose definition belongs to that occurrence's exercise.

## 5. Web migration (D10)

* `TRAINING_LOGGER_VARIANT_OPTIONS` (Static Hold / 3-Second Pause / Slow Eccentric) is **removed as the choice authority**.
* The production web Logger reads the Server's `executionVariantsByExercise` through `listTrainingLoggerVariantChoices`. The picker shows **Ordinary**, then the canonical choices for that exercise. With no choices it shows "No saved variants for this exercise yet."
* `assignTrainingVariant` accepts only a canonical choice of that exact exercise. Free-typed labels, another exercise's variant, and provisional exercises leave the draft unchanged.
* The isolated `/preview/training-logger` page keeps one **synthetic, projection-shaped** fixture (`TRAINING_LOGGER_PREVIEW_EXECUTION_VARIANTS_BY_EXERCISE`, Spider Curls Static Hold). It is never used by production drafts.
* There is no Web Create Variant UI.

## 6. Progression and Performance Record partitioning (D8, D9)

One resolver, `createTrainingExecutionVariantResolver(definitions)`, handles every partition:

1. A `variantId` naming a same-exercise definition resolves to that definition id.
2. Otherwise, a key or legacy key matching a same-exercise definition resolves to that definition id.
3. Otherwise the identity is the legacy normalized key.
4. Otherwise (no variant) it is `ordinary`.

**With zero definitions the output is the pre-Build-92 key partition exactly** (tested), so production behavior is unchanged until a definition exists.

It is applied in four places:

* Adaptive Progression (`listComparablePerformances` / `createTrainingLoggerProgressionRecommendation`, `comparisonContext.variantKey`).
* The Logger projection.
* Performance Records (`activeRecordFamilyKey`).
* Commit-time PR baselines (`createTrainingPerformanceIntelligenceReport` via `createCommittedTrainingPerformanceAnalysis`) and previous-performance lookup (`resolvePreviousExerciseOccurrence`, including the web draft).

Behavior, all tested:

* Legacy key-only and stable-id occurrences form one context.
* A renamed definition keeps its history and records.
* A new user-created variant has **no borrowed Ordinary or Static Hold evidence** and gets `insufficient_evidence` until its own comparable sessions satisfy the unchanged policy.
* Ordinary never absorbs variant evidence.
* Static Hold records never merge into Ordinary.

The Logger still projects recommendations for Ordinary only. Eligibility thresholds and the adaptive selector are unchanged. No timed-hold record types were added.

**Residual (intentional):** other report consumers (briefings, goal previews, V3 coaching observations) still use the default resolver, which is key-based. They only diverge from stable identity **after a rename**, and Native V1 has no rename UI. Threading definitions into those read paths is a follow-up only if rename is exposed.

## 7. Historical Static Hold seed: prepared, NOT executed (D3)

| Part | Identity |
|---|---|
| Runner | `src/platform/operations/TrainingExecutionVariantLegacySeedRunner.js` |
| Entry | `scripts/operations/trainingExecutionVariantLegacySeed.entry.mjs` |
| Payload builder | `scripts/operations/buildTrainingExecutionVariantSeedPayload.mjs` |
| Tests | `TrainingExecutionVariantLegacySeedRunner.test.js` (6) |

* **Scope (fixed in code):** `spider_curl` and `pendulum_squat_machine`, each with display "Static Hold", key `static_hold`, `legacyKeys ["static_hold"]`, and provenance `legacy_seed`.
* **Ids:** deterministic `tev_` + sha256(`legacy_seed|exercise|static_hold`).
* **Behavior:**
  * creates a definition only if missing;
  * reactivates a compatible retired same-exercise definition (including a user-created one);
  * otherwise reports `existing`;
  * never duplicates;
  * never writes evidence (in-transaction digest verification);
  * never seeds `super_set` (verified).
* **Dry run:** `REPEATABLE READ READ ONLY` with a `transaction_read_only` fence. It predicts the mutations and reports a census: active Static Hold occurrences per exercise, the legacy Super Set occurrence count, and definition and evidence digests.
* **Apply:** requires the dry run's `expected` facts and an authorization reference. It runs in one READ COMMITTED transaction under the owner advisory lock, writes at most 2 records, and refuses on drift.
* **Runtime binding:** the runtime SHA must equal the payload's `--sha`, so the seed can only run against the deployed candidate.

## 8. Super Set disposition (D4)

* `super_set` is a reserved name, so it cannot be created or renamed into.
* It is never projected as a choice. A regression test confirms this, both with history present and with zero definitions.
* It is never seeded.
* Historical sessions (Leg Extensions + Sissy Squats; Seated Hip Adductions + Abductions) are **not mutated**. They keep their legacy `super_set` key partition exactly as before.

**Separate cleanup recommendation (not done):** a later, Founder-authorized Evidence correction should convert those occurrences into `exerciseRelationshipGroups` superset relationships and drop the misfiled variant. It should use the existing correction/supersession path with a dry run, and it should be scheduled only after deciding whether to keep their progression and PR partitions as they are.

## 9. Files changed (38)

* **Domain:** `trainingExecutionVariantDefinition.js` (new), `trainingExecutionVariant.js`, `TrainingLoggerProgressionService.js`, `TrainingLibraryExerciseRecordsService.js`, `TrainingPerformanceIntelligenceService.js`, `TrainingExerciseOccurrenceHistoryService.js`
* **Application:** `CanonicalPersistenceCommandPorts.js`, `Phase3CommandService.js`, `CoreNavigationReadService.js`, `TrainingNavigationReadService.js`, `TrainingReadService.js`, `TrainingPerformanceEventReconciliation.js`, `NativeProductionContractService.js`, `nativeProductionContractManifest.js`
* **Platform:** `foundationSourceCollections.js`, `phase4DomainCollections.js`, `phase5SyntheticPackage.js`, `PostgresTrainingNavigationReadStore.js` (bounded per-exercise definitions query), `founderRuntimeStore.js`, `TrainingExecutionVariantLegacySeedRunner.js` (new)
* **Web:** `TrainingLoggerPreviewState.js`, `TrainingLoggerClient.jsx`
* **Ops:** the two seed scripts (new)
* **Contracts and docs:** `openapi/physiqueos-v1.json` (command enum), `docs/ALGORITHM.md` (Build 92 Variant contract paragraph)
* **Tests:** 4 new suites, plus updates to Core navigation, progression, records, propagation, web preview/production state, parity, native contract, and synthetic package

## 10. Tests

| Gate | Result |
|---|---|
| New: definitions/resolver (13), commands + finalize (8), seed runner (6) | **27/27** |
| Focused Training gate (Logger, canonical persistence, Training evidence, progression, records, PR, web Logger, Core and Training navigation, native contract, migration; 64 files) | **849/850**. The 1 failure is pre-existing (`phase7bWorkPackage2ReferenceIndex` collection count; fails identically at `e7ffc671`). |
| Full unit suite (`vitest.unit.config.js`, 10,127 tests) | 9,819 passed / 303 failed. **The baseline at `e7ffc671` is 302 failed with an identical set**, apart from `productionEsmSyntaxIntegrity`: it timed out at 5.9 s under machine load average ≈335 (other sessions) and **passes in isolation**. No other new failure. |
| `vitest.phase6.training` | 186/186 |
| `vitest.phase4` | 156/156 |
| `vitest.migration-safety` | 1201 passed / 15 failed, **all 15 pre-existing** at base |
| `vitest.phase3` | 320 passed / 1 failed, **pre-existing** |
| ESLint on all changed JS/JSX | clean |
| `git diff --check` | clean |

* **Not run:** `next build`. The web change is exercised by unit and source tests and the ESM syntax-integrity parse, but no full web production bundle was built on this heavily loaded machine.
* **Native:** no files changed, so no Native gates were needed.

## 11. Migration and DDL

* **No DDL and no schema migration.** The collection lives in the existing `canonical_training_records` table.
* No evidence rewrite. No compatibility alias table; the alias is `legacyKeys` plus the resolver.
* Older canonical imports may omit the optional collection.

## 12. Production deployment sequencing (recommendation)

1. Founder reviews candidate `6ac19b8c`.
2. **Deploy Server** (normal two-step App Platform update: spec GIT_SHA/BUILD_ID on web and worker, plus a forced deployment). The change is invisible to Build 90: no definitions exist yet, so every projection is `{}` and every partition is byte-identical.
3. **Seed dry run** against the deployed SHA (`buildTrainingExecutionVariantSeedPayload.mjs --sha <deployed> --mode dry-run`). Review the census: expect Spider Curls ≈4 active and Pendulum Squat 1, plus the Super Set count, with 2 predicted creates.
4. **Seed apply** with the dry run's facts and a Founder authorization reference. Read back.
5. Native Build 92 Create + Select (below) against the live Server; TestFlight only on separate authorization.

## 13. Exact next Native Build 92 task

> **Native Build 92: Training Execution Variant Create + Select (iPhone Logger)**, based on Native Build 90 `32baf1d5` lineage (or the integrated Build 91 when it ships), against Server `6ac19b8c` or its successor.
>
> 1. Decode `executionVariantsByExercise` (optional) into a per-exercise `[TrainingExecutionVariantChoice]` on `TrainingLoggerCatalogExercise`. Stop using the global `TrainingLoggerConfiguration.variants` (`ProductionTrainingLoggerAPI` currently hard-codes `[]`).
> 2. Add optional `variantId` to `TrainingExecutionVariant` (Codable, optional, so old payloads decode).
> 3. Execution variant menu: **Ordinary**, then this exercise's choices, then a divider, then **Create Variant…** Show Create only when the projection field is present.
> 4. Create sheet: name only (≤40). Call `training-catalog.execution-variant.create.v1` with a stable Idempotency-Key per submission. On `created`, `reactivated`, or `already_exists`, insert the choice into the local configuration and `applyVariant(selection)` immediately. On error or offline, keep the current selection unchanged with inline retry using the same key.
> 5. `applyVariant` keeps sets, because inherit semantics match. Previous performance resolves by `variantId` → `key`/`legacyKeys`.
> 6. Finalize sends `executionVariant {variantId, key, label, rawLabel}`.
> 7. Watch: add optional `variantLabel` to `WatchWorkoutProjection.Row` (display only; no timing fields, no creation).
> 8. No timed/duration logging, no rename/retire UI, no Super Set.
> 9. Gates: unit, UI, Watch, Release compile, seam scan. No upload without authorization.

## 14. Founder authorization needed

| Action | Needs |
|---|---|
| Deploy Server candidate `6ac19b8c` to production | Explicit Founder deploy authorization |
| Run the legacy Static Hold seed **dry run** in production (read-only) | Founder authorization of a read-only production run |
| Run the seed **apply** (writes ≤2 definition records) | Separate explicit authorization plus the dry-run facts |
| Super Set evidence cleanup | Future separate task and authorization |
| Native Build 92 implementation / TestFlight | Separate tasks |

## Safety

* No deploy, no production read or mutation, no seed execution, no Build 91 changes, and no Native bump or upload.
* No secrets, owner identifiers, or raw exports appear in this report.
