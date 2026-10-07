# Training execution variants: authority audit and Build 92 Create Variant design

Task id: `training-variant-audit-build92-design-20261007`
Source prompt: `agent-handoffs/inbox/prompts/20261007T153000Z-claude-training-variant-audit-build92-design.md` @ `b513246a`
Type: audit of current behavior plus architecture and product requirements. No implementation, no deploy, no production mutation, no Build 91 edits, no Native bump or upload.

## 0. Authority (re-verified live)

| Item | Value |
|---|---|
| Production Server | `e7ffc6716706ae4d2140008a1655bfed95a93889`. The active deployment `b98c26e4` has web and worker on the same SHA. `/api/v1/health/live` reports buildId `physiqueos-e7ffc671-20261007`. No deployment is in progress. |
| Shipped Native | Build 90, `32baf1d5f43120cd07088df1210e1dc84ed26a78` |
| Source audited | Server: `git show e7ffc671:<path>`. Native: Build 90 tree `32baf1d5`. |
| Production read | One bounded read-only inspection, which the Founder authorized in the prompt. Details are in §3. |

## Executive summary

* **Static Hold still exists, but only as occurrence data in historical Training evidence.** No registry, definition, or library entry for any execution variant exists on the Server or in production data, and none ever did. The prompt's outcome **F** (never existed as canonical reusable definitions) applies, together with outcome **B** (exists only in historical evidence).
* The Founder's memory is correct. Native Builds up to 18 (before 2026-09-10) ran the Logger on the sandbox/fixture API. Its menu listed **Static Hold, 3-Second Pause, Slow Eccentric**. The web Logger hard-codes the same three labels. Those lists were UI constants, not canonical choices.
* **Why Build 90 shows only "Ordinary":** `ProductionTrainingLoggerAPI.fetchConfiguration()` hard-codes `variants: []`. That line has been there since Founder Production wiring landed on 2026-09-10 (`81467f25`). The Server `training-logger` read also has no variant-choice field. The menu renders "Ordinary" plus that empty list.
* **Classification: DATA/PROJECTION GAP sitting on a LEGACY MODEL LIMITATION.** This is not a Server regression. Finalization still accepts and persists any freeform variant, and progression, records, and history still partition by variant. What is missing is any source of *choices*.
* **Build 91: no restoration (recommended).** Restoring choices properly needs the canonical definition model, so the fix belongs in Build 92. A Native-only stopgap is possible and is listed as Founder decision D7, but it is not recommended.
* **Build 92 design:** use per-exercise variant definitions with immutable ids. They live in a new `trainingExecutionVariants` collection in the existing `canonical_training_records` table, so no DDL is needed. A Server create command reuses the precedent set by `training-catalog.exercise.create.v1`. The Logger read gains an additive per-exercise choice projection. A small logging-mode field covers timed holds. Progression and records partition by variant id, with a legacy key alias.
* **Static Hold semantics need care.** All of the Founder's real Static Hold sets are **reps plus external load**, with no duration. Static Hold therefore cannot be hard-wired to "timed". V1 needs a two-value logging mode, and both modes are justified by evidence.

## 1. Current canonical variant model

**Model:** `src/domain/models/trainingExecutionVariant.js`. It was added in `9c67623c` on 2026-08-09, and the V1 contract was completed in `c4d8c2da` on 2026-08-10.

| Aspect | Current behavior |
|---|---|
| Field | `exercise.executionVariant = { key, label, rawLabel }` on each exercise occurrence inside a Training evidence payload (`canonicalEvidenceObjects[].payload.exercises[]`) |
| Allowed values | Open string, not an enum. `key` is the NFKC, lower-case, underscore slug of the label. The only alias is `"static holds" → "static hold"`. |
| Ordinary | Sentinel. `ORDINARY_EXECUTION_VARIANT_KEY = "ordinary"` means the field is absent. Performance events must omit the variant for Ordinary. |
| Display label | Derived from the input. Uniform-case input is title-cased; mixed-case input is preserved. `formatTrainingExerciseOccurrenceLabel` produces "Name · Label". |
| Identity | **Slug only.** There is no id, createdAt, status, or provenance, and there is no persistence collection. |
| Scope | Evidence-derived and per occurrence. It applies to every set in that occurrence (Variant V1 contract, `docs/ALGORITHM.md` ~L458). |
| Creation | Parsed from typed or OCR evidence ("Name (Variant)" or a `Variant: X` directive in `trainingSessionEvidence.js`), set by Evidence Review freeform text (web placeholder "Static Hold"), or sent by the Logger in the finalize payload. Server finalize normalizes it in `CanonicalPersistenceCommandPorts.js` ~L3200. |
| Retire/delete | Not applicable, because there are no definitions. |
| Progression context | Yes. `TrainingLoggerProgressionService.listComparablePerformances` filters on the exact canonicalExerciseId, variantKey, and relationshipKey. |
| Performance records | Yes. `activeRecordFamilyKey` includes `executionVariant.key`, and the performance-event context identity includes `variant:<key>`. |
| History | `TrainingExerciseOccurrenceHistoryService` has exact-variant matching and `listPreviouslyUsedExecutionVariants()`. **That function has no production caller; only a test uses it.** |
| Relationship | Superset is modeled independently in `exerciseRelationshipGroups` and may coexist with a variant. |

Native mirrors this explicitly. The doc comment on `TrainingExecutionVariant` and the comment in `TrainingExerciseCanonicalizationCommand.swift` both state that variants are freeform occurrence text with "no separately persisted registry entity", so no creation command exists.

**Precedent for Build 92:** user-created canonical *exercises* already exist. They use command `training-catalog.exercise.create.v1` (`Phase3CommandService`), `createCanonicalExercise` in `CanonicalPersistenceCommandPorts`, collection `canonicalExerciseLibrary`, and a server-owned duplicate check that returns 409 `CANONICAL_EXERCISE_DUPLICATE` with recovery candidates.

## 2. Exact Build 90 Logger choice path

1. `TrainingLoggerView.exerciseMenu` (`TrainingLoggerView.swift` ~L1112) builds `Menu("Execution variant")`. It contains a fixed `Button("Ordinary")` and `ForEach(viewModel.configuration?.variants ?? [])`.
2. `configuration` comes from `TrainingLoggerAPI.fetchConfiguration()`.
   * **Founder Production** (`AppEnvironment.nativeAuthority == .founderProduction`) uses `ProductionTrainingLoggerAPI` (`ProductionDailyDriverAPI.swift` ~L1622). It reads `/api/v1/native/read/training-logger` (`coreNavigation.getTrainingLogger`) and builds the configuration with **`variants: []` hard-coded**.
   * **Sandbox/fixture** uses `TrainingLoggerFixture.json`, whose `"variants"` list holds `static_hold`, `3_second_pause`, and `slow_eccentric`. This was the only Logger mode before `81467f25` on 2026-09-10 (Build 18 and earlier).
3. The Server's `getTrainingLogger` payload (`CoreNavigationReadService.js` ~L198) contains `initialCanonicalExercises`, `initialHistorySessions` (the 120 latest, each with per-exercise `executionVariant`), `initialPerformedExerciseIds`, `initialMyLibraryExerciseIds`, `initialProgressionRecommendations` (Ordinary only), `contextualProgressionRecommendations` (Ordinary only), and `initialCategorySuggestion`. **It has no variant-choice field.**
4. The choice list is a single global list, not filtered per exercise. Native receives the current variant only through historical records. It receives no choice list.
5. Selecting a variant is a **local draft mutation**: `TrainingLoggerDraft.applyVariant`. It sets `executionVariant` and refreshes previous performance from history with the same variant. No Server command is involved.
6. `progressionRecommendation(variant:relationship:)` returns `nil` for any non-Ordinary variant (`guard variant == nil`). Variant sessions show previous performance but no Suggested or Maintain recommendation.
7. Finalization (`TrainingWriteAPI` ~L144) sends `executionVariant {key,label,rawLabel}`. The Server normalizes and persists it, and the performance-event producer and records partition by key.
8. Watch: the `WatchWorkoutProjection.Row` contract has no variant field. Live Activity rows have `variantLabel`.
9. The web Logger (`TrainingLoggerClient.jsx` ~L1199) uses the hard-coded `TRAINING_LOGGER_VARIANT_OPTIONS` (Static Hold, 3-Second Pause, Slow Eccentric) from `TrainingLoggerPreviewState.js`.

**Why only Ordinary appears now:** the Production adapter hard-codes an empty list, and the Server has no list to send. No filter suppresses Static Hold, because there has never been a production list to filter.

## 3. Production findings (one bounded read-only inspection)

**How the read was run:**

* Path: the accepted read-only runner from `4025f175` (`runAppConsoleContextGzipFile.mjs`), context `physiqueos-final-cutover-config`, app web component. The files were extracted to the session scratch directory; no worktree was created.
* Safety envelope:
  * runtime SHA check against `e7ffc671`;
  * Founder-owner check;
  * `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, with `transaction_read_only = on` verified before any query;
  * parameterized, owner-scoped `SELECT`s only, limited to rows whose payload mentions a variant or a hold;
  * explicit `ROLLBACK`.
* Outcome: remote exit 0, success marker seen exactly once after the rollback.
* One wrapper flag: the local wrapper reported `RUNNER_STDERR_UNEXPECTED`. The only stderr line was a **local** Node warning (`NO_COLOR` ignored because `FORCE_COLOR` is set in this shell), not remote output. The data is complete. I did not re-run, because only one read was authorized.
* Nothing was written or exported. No owner identifiers were emitted.

**Collections scanned (counts only):** canonicalEvidenceObjects 592, evidencePackages 347, evidenceReviews 249, trainingPerformanceEvents 154, canonicalExerciseLibrary 12, myLibraryMemberships 1. There is no variant-definition collection.

**Historical variant identities found:**

| Variant key / label | Exercise (canonical id) | Canonical Training evidence | Set shape | Status |
|---|---|---|---|---|
| `static_hold` / "Static Hold" | Spider Curls (`spider_curl`) | 2026-08-08, 08-19, 08-26, 08-29 (active); 2026-08-10 (superseded, `retracted_false_proving_evidence`) | 4 sets, **reps + external load on every set, no duration** (`weighted_reps`) | Occurrence data only |
| `static_hold` / "Static Hold" | Pendulum Squat Machine (`pendulum_squat_machine`) | 2026-08-13 (active) | 4 sets, reps + load, no duration | Occurrence data only |
| `super_set` / "Super Set" | Leg Extensions + Sissy Squats; Seated Hip Adductions + Abductions | 2026-08-20, 08-24, 08-25 (active) | reps + load | **Misclassified.** "Super Set" is relationship context, not an execution variant. |

* Raw labels varied ("Static Hold", "static hold"). Normalization merged them into one key as designed.
* Source: typed evidence text, either "Spider Curls (Static Hold)" or "Variant: Static Hold" inside a superset block, confirmed through Evidence Review. No Static Hold occurrence came from the Native Logger.
* Performance events: one `session_volume_pr` exists in the `spider_curl | static_hold` partition (2026-08-26). Records already keep Static Hold separate from Ordinary.
* No canonicalExerciseLibrary entry mentions a hold or isometric movement. **No reusable definition exists.**
* Latest Static Hold evidence: 2026-08-29. That is before Founder Production Logger wiring and before any Native Logger variant use.
* Logger projection today: these variants are present only inside `initialHistorySessions` records, and only if they fall within the 120-session window. They are never offered as choices.

## 4. Why only Ordinary appears

The cause is source, not data. `ProductionTrainingLoggerAPI` returns `variants: []` because the Server contract has no choice field. When Production wiring was built on 2026-09-10, the fixture list was correctly not reproduced as fake canonical data, but nothing replaced it. Static Hold remains intact in canonical evidence and is not filtered anywhere.

## 5. Classification

**DATA/PROJECTION GAP on top of a LEGACY MODEL LIMITATION.**

* Not REGRESSION: no canonical choice list ever existed on the Server.
* Not EXPECTED CURRENT MODEL either: alternate variants clearly exist in canonical history. Finalize, records, and progression support them, and earlier Native and web UIs offered them.
* From the Founder's point of view, this is a parity regression against fixture-era Native (Build 18 and earlier) and against the web Logger.

## 6. Build 91 restoration: not warranted (recommended)

* A correct fix needs canonical definitions: per-exercise scope, stable identity, the Super Set exclusion, and logging-mode semantics. That is Build 92 architecture.
* A Native-only stopgap would be to derive choices from `initialHistorySessions` variants for the current exercise, mirroring the Server's unused `listPreviouslyUsedExecutionVariants` and excluding `super_set`. It would be about 20 lines and needs no Server change. It is fragile, though:
  * history is capped at 120 sessions, so Static Hold may already be outside the window;
  * it adds an evidence-derived choice semantic that Build 92 would replace;
  * it would land in the middle of Build 91 candidate assembly.
* **Recommendation:** defer to Build 92. In the meantime, the web Logger still offers Static Hold if it is needed. See D7.

## 7. Build 92 Create Variant: recommended architecture

### 7.1 Definition entity (new)

* Collection: `trainingExecutionVariants`, mapped to `canonical_training_records` in `phase4DomainCollections`. This is a document collection, so **no DDL** is needed.
* Record id: `tev_<ulid>`, immutable.

```
{
  id: "tev_…",                    // immutable identity; the progression and records partition key
  canonicalExerciseId: "spider_curl", // V1 scope: exactly one canonical exercise
  label: "Static Hold",            // user-facing, renamable
  normalizedName: "static hold",   // Server-computed with normalizeTrainingExecutionVariant rules; used for duplicate checks
  legacyKeys: ["static_hold"],     // historical occurrence keys that resolve to this definition
  loggingMode: "inherit" | "timed",// see §9
  status: "active" | "retired",
  provenance: "user_created" | "system" | "legacy_evidence",
  createdAt, updatedAt, retiredAt?
}
```

### 7.2 Occurrence contract (additive)

* `exercise.executionVariant` becomes `{ variantId?, key, label, rawLabel }`. When a variant id is present, the Server stamps `key` and `label` from the definition at commit time.
* Occurrences without `variantId` (all history, and Build 90 writes) resolve at read time through (canonicalExerciseId, key) to the definition whose `legacyKeys` contains that key. If no definition matches, the bare key remains the partition.

### 7.3 Partition identity

* `variantIdentity(occurrence)` returns `variantId`, else the resolved definition id, else `key:<key>`, else `ordinary`.
* Progression (`listComparablePerformances`), records (`activeRecordFamilyKey`), and occurrence history must all switch to this one resolver. Partitioning must never use the display label.

### 7.4 Commands

All commands are idempotent through the existing Phase-3 command service with an Idempotency-Key.

* `training-catalog.execution-variant.create.v1` takes `{canonicalExerciseId, label, loggingMode}` and returns the `{variant}` definition.
* `…execution-variant.rename.v1` and `…execution-variant.retire.v1` exist on the Server in V1. Native UI for them is optional (D5).

### 7.5 Read projection (additive)

* The `training-logger` read gains `executionVariantsByExercise: { [canonicalExerciseId]: [{variantId, label, loggingMode, status, provenance}] }`. Only active variants are included, ordered by most recent use and then by label.
* Build 90 ignores the unknown key.
* The web Logger should switch from `TRAINING_LOGGER_VARIANT_OPTIONS` to this projection in the same Server slice or later (D10).

### 7.6 Reserved names

`ordinary` and the superset family (`super set`, `superset`, `super_set`) are rejected with a 400 that says to use Superset instead. "Super Set" is relationship context.

### 7.7 Scope

Per canonical exercise, which is the narrowest scope and prevents cross-exercise contamination. The same label on two exercises becomes two definitions (for example, Static Hold on Spider Curls and on Pendulum Squat). If the user reuses a label, a "Used on other exercises" suggestion can be added later without changing identity.

### 7.8 Duplicates

| Case | Behavior |
|---|---|
| Same exercise, `normalizedName` matches an active definition | 409 `EXECUTION_VARIANT_DUPLICATE` with `existingVariant`. Native silently selects the existing variant (no error UI). |
| Matches a retired definition | Reactivate it and return it. History stays continuous (D6). |
| Matches the `legacyKeys` or label of a system or legacy-seeded definition | Return that definition; never create a parallel one. |
| Case or whitespace variants ("static hold", "Static  Hold") | Collide through normalization. |
| Rename | Changes `label` and `normalizedName` (with a duplicate check), never the id. Progression and records are unaffected. The old key is appended to `legacyKeys`. |
| Retire | Removes the variant from choices only. Historical occurrences, records, and progression stay readable and are labeled with the definition's last label. Delete is not offered. |

## 8. Minimal V1 create flow (Native)

* **Menu:** the Execution variant menu lists "Ordinary", then the active variants for **this exercise**, then a divider, then **"Create Variant…"**. This keeps the common path to one tap and puts creation last.
* **Sheet:** a medium-detent sheet (not a full screen) titled "New variant for Spider Curls".
  * **Name** text field, required, at most 40 characters. The keyboard opens on appear.
  * **"How do you log it?"** segmented control: **Reps × load** (the default, labeled "Same as Spider Curls" for a reps exercise) or **Timed hold**.
  * Primary **Create** button and a Cancel button.
  * Deliberately left out: description, slug field (Server-generated), progression toggles, scope picker, load and rep semantics beyond the logging mode.
* **On success:**
  * the definition is inserted into the local configuration for that exercise;
  * `applyVariant(variant)` runs on the current exercise;
  * the menu immediately includes the variant;
  * the next configuration fetch (future sessions) includes it from the Server.
* **On a duplicate (409):** select the existing variant and show a quiet inline note: "Using your existing Static Hold".
* **Offline or error:** creation requires connectivity, which matches the V1 offline policy that plan and catalog edits need a connection.
  * The sheet stays open with an inline error and a Retry button.
  * The current variant selection is **unchanged**.
  * The draft is never mutated before the Server confirms.
  * Retry reuses the same Idempotency-Key, so a lost response cannot create duplicates (lesson from the 2026-09-28 refresh-reuse incident).
* **Switching semantics (`applyVariant`):**

| Switch | Effect on uncompleted sets | Effect on completed sets |
|---|---|---|
| Same logging mode (Ordinary ↔ inherit variant) | Kept as is; previous performance and recommendation refresh to the new partition (as today) | Kept |
| Different logging mode (reps ↔ timed) | Values cleared and input fields swapped (reps ↔ seconds) | Switch is blocked with "Complete sets use reps; finish this exercise or remove those sets first." Completed sets are never silently converted. |

* **Finalization:** sends `executionVariant {variantId, key, label, rawLabel}`. The Server validates that the variant exists for this canonical exercise and is active or was retired after the draft started, then stamps key and label from the definition. A `timed` variant requires `durationSeconds` on each completed set.

## 9. Static Hold semantic requirements

* The evidence shows that the Founder's actual Static Hold (Spider Curls, Pendulum Squat) is **reps × load with a held contraction**: all 5 active occurrences have reps and weight and none has a duration. Hard-wiring Static Hold to duration would therefore have mis-modeled every real use.
* There are two legitimate modes:
  * `inherit`: same fields as the exercise (reps × load, or BW × reps). This is the default and the mode of the seeded Static Hold definitions.
  * `timed`: `durationSeconds` per set, plus optional external load (reusing the Logger's existing `.duration` measurement fields of duration plus load). Reps are not collected. Sets display as "35 lb · 45 s", or "45 s" without load.
* Native: `TrainingLoggerDraftExercise.measurement` becomes `variant.loggingMode == .timed ? .duration : catalog.measurement`. This is a small change, because `.duration` input, focus order, and validation already exist for plank-type exercises.
* Watch: the Watch can already display `durationText`. See §12.

## 10. Progression implications (Adaptive Progression V1 contract, documented only)

* A new variant starts its own empty context, because the partition key is the variant identity. Comparable history is zero, so the variant gets no recommendation and therefore cannot leak from Ordinary.
* A rename keeps the id, so the context is preserved. Legacy `static_hold` history resolves through `legacyKeys` to the seeded definition, so existing Spider Curls Static Hold history stays continuous.
* Retirement preserves evidence. The context simply stops being offered.
* `timed` variants: `normalizeComparableSets` drops sets without both load and reps, so the engine returns `insufficient_evidence`. That is the correct "unsupported" result. Build 92 should make it explicit with `reasonCode: "unsupported_logging_mode"` so the UI does not suggest that more sessions would help.
* Today the Logger projects Ordinary recommendations only, and Native returns `nil` for any variant. Projecting `inherit` variant recommendations (same engine, variant pool) is an optional Build 92 slice (D8). Adaptive Progression V1 is not broadened here.

## 11. Performance Record implications

* Records already partition by variant key. Switching `activeRecordFamilyKey` and the event context identity to the variant-identity resolver keeps rename stability.
* The existing `spider_curl | static_hold` session-volume PR maps to the seeded definition through `legacyKeys`.
* `inherit` variants: reps-at-load PRs and session-volume PRs work unchanged within the variant partition.
* `timed` variants: reps-at-load and volume are meaningless. The producer must emit no events for duration-only sets; it currently relies on reps, which needs a guard and a test. Records show "No records for timed holds yet". A "longest hold at load" event type is a later decision (D9).
* History and detail: label occurrences with the current definition label and keep `rawLabel` for provenance. Show retired variants in history with their label, with no badge in V1.

## 12. Watch implications

* Creation happens on iPhone only. The Watch consumes the already-selected variant, and no Watch command is needed: the Watch only sends `completeSet` and lifecycle commands, and values are prepared on the iPhone.
* Additive, optional `variantLabel` on `WatchWorkoutProjection.Row`. Older Watch apps ignore it, so no schema version bump is needed. This brings Watch to parity with Live Activity rows, which already have the field.
* `timed` sets already render through `durationText` and `valueText` ("45 s"). Watch logging of a hold is the same `completeSet` with the iPhone-prepared duration. In-Watch hold timing is out of V1 scope.

## 13. Migration and backward compatibility

* **Schema:** no DDL. Add the collection mapping and seed collection list entries (`foundationSourceCollections`, `phase4DomainCollections`, synthetic package).
* **Seed** (a separate Founder-authorized operation with a dry run before apply, never part of a deploy) creates two `legacy_evidence` definitions, both with `loggingMode: inherit` and `legacyKeys: ["static_hold"]`:
  * `spider_curl` / "Static Hold";
  * `pendulum_squat_machine` / "Static Hold".
* No semantics are invented: the seeds use `inherit` because the evidence is reps plus load.
* **Do not seed `super_set`.** Exclude it from choices. Whether to correct those 3 sessions into relationship groups is a separate decision (D4).
* **Historical evidence is never rewritten.** Resolution through `legacyKeys` happens at read time, so no occurrence gets a backfilled `variantId`.
* **Compatibility alias:** the `(canonicalExerciseId, key) → definition` resolver is the alias. Occurrences without `variantId` must be accepted indefinitely.
* **Build 90 against the new Server:** Build 90 ignores `executionVariantsByExercise` and keeps showing Ordinary. Its writes contain no variants, so nothing breaks. Build 92 against an old Server receives no projection, so it shows Ordinary only. The create command returns 404 or unsupported, and Native must handle that by hiding "Create Variant…" when the projection field is absent.

## 14. Test plan

**Server (vitest unit plus Postgres transactional fixture):**

* Create: valid input; reserved names (`ordinary`, superset family); label trimming and normalization; 409 duplicate in the same exercise (case and whitespace); same label on a different exercise is allowed; retired-name reactivation; legacy-key collision returns the seeded definition; idempotent replay returns the same definition; owner scoping.
* Rename keeps the id and appends a legacy key; retire hides the variant from the projection only.
* Finalize: `variantId` validation (unknown, wrong exercise, retired after draft start); key and label stamping; `timed` requires `durationSeconds`; legacy key-only writes are still accepted.
* Partition resolver: legacy `static_hold` maps to the definition, a renamed variant has the same partition, Ordinary is unaffected, superset relationship plus variant is still exact.
* Progression: a new variant has an empty context; no Ordinary leakage; `timed` returns `unsupported_logging_mode`.
* Records: no events for duration-only sets; the legacy PR maps to the definition.
* Read projection: per-exercise, active only, ordering, absent for exercises with none; Build 90 payload compatibility snapshot.
* Seed operation: dry run, apply, idempotent rerun, zero writes outside the collection.

**Native (unit plus UI):**

* Menu lists per-exercise choices and "Create Variant…" last.
* Create success selects the variant and adds it to the menu.
* 409 selects the existing variant.
* Offline or error leaves the selection unchanged and retry reuses the idempotency key.
* Projection absent hides "Create Variant…".
* Logging-mode switch rules, including the blocked switch with completed sets.
* Finalize payload carries `variantId`.
* Decoding of the old payload.
* UI test: create a Timed variant on a reps × load exercise, log a duration set, finish.

**Watch:** Row decodes with and without `variantLabel`; a timed row renders `durationText`.

**Acceptance (Founder, physical):** select seeded Spider Curls · Static Hold and see previous performance from August. Create a new variant mid-workout, finish, then confirm it appears in the next session and in Exercise detail.

## 15. Recommended Build 92 implementation sequence

1. **Server S1 (dormant-safe, additive):** definition model and collection mapping; create, rename, and retire commands; the `executionVariantsByExercise` projection; the variant-identity resolver adopted in progression, records, and history; finalize `variantId` validation; `timed` guard in the event producer; tests. Deploy as an ordinary Server release; nothing is visible to Build 90.
2. **Server S2 (operation):** Founder-authorized seed of the two legacy Static Hold definitions (dry run, then apply, then a read-back).
3. **Native N1:** decode the projection into a per-exercise `variants` list on `TrainingLoggerCatalogExercise`; menu per exercise; Create Variant sheet plus the command client with idempotency; `applyVariant` logging-mode rules; finalize `variantId`; hide create when the projection is absent; Watch `Row.variantLabel` (additive).
4. **Optional S3:** `inherit` variant progression recommendations (D8) and web Logger parity (D10).
5. **Integration and acceptance:** gates; Build 92 bump and upload only on Founder authorization.

## 16. Founder decisions needed

| # | Decision | Recommendation |
|---|---|---|
| D1 | Variant scope | Per canonical exercise |
| D2 | Include the "Timed hold" logging mode in V1 | Yes (two-option segmented control; default "Reps × load") |
| D3 | Seed the historical Static Hold definitions (Spider Curls, Pendulum Squat) as `inherit` | Yes, as a separate authorized operation |
| D4 | Legacy "Super Set" variant occurrences (3 sessions) | Exclude from choices now; a correction into relationship groups is a separate later task, if wanted |
| D5 | Rename and retire UI in Build 92 | Server commands in V1; Native create only in Build 92, with rename and retire from Exercise detail later |
| D6 | Creating a name that matches a retired variant | Reactivate the existing variant (keeps history continuous) |
| D7 | Build 91 stopgap | No; defer to Build 92 (web Logger still offers Static Hold meanwhile) |
| D8 | Variant (inherit) progression recommendations in Build 92 | Optional slice; acceptable to ship with previous performance only |
| D9 | Timed-hold performance records (longest hold at load) | Defer; V1 shows "no records for timed holds" |
| D10 | Web Logger switches from hard-coded options to the canonical projection | Yes, in S1 or S3 |

## Safety

* No implementation, deploy, production mutation, Build 91 change, or Native bump/upload. The single production read was read-only and rolled back.
* No owner identifiers, credentials, DB bindings, raw exports, or set values were emitted. Only exercise names, dates, and set-shape summaries appear.
* No secondary worktree was created. The read-only runner files were extracted to session scratch only.
