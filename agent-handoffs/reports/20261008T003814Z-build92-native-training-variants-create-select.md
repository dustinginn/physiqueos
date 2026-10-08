# Build 92 Native Training Execution Variants: Create + Select candidate ready

Task id: `build92-native-training-variants-create-select-20261007`
Task prompt: `agent-handoffs/inbox/prompts/20261007-build92-native-training-variants-create-select.md` @ `c4ea1c9d`
Ownership override: `agent-handoffs/inbox/prompts/20261007-build92-claude-variants-codex-visual-ownership-swap.md` @ `1fe9f073`
Owner: Claude (the same conversation that wrote the variant audit `63bf054e` and the Server foundation `6ac19b8c`)

**Status:** Build 92 Native Variants candidate ready.

## Candidate

| Item | Value |
|---|---|
| Candidate SHA | **`39b818e214c858ab127f891e3010760ba2ad9b17`** |
| Branch | `claude/native-build92-training-execution-variants-20261007` (pushed with a normal push, verified on remote) |
| Base | shipped Native Build 91 `106f05183ea3e2328496acce0636dc087116bbce`, version 1.0 (91). The candidate is one commit on top. |
| Build number | **unchanged, 91**. No bump, no archive, no TestFlight. |
| Live Server (re-verified) | `738ce668`, buildId `physiqueos-738ce668-20261007` |

**Isolation:** the branch was created from Build 91 inside this conversation's single Remote Control worktree, under the standing single-worktree rule. No extra worktree, session, or agent was created. The Server foundation branch `claude/build92-training-variant-server-foundation` (`6ac19b8c`) was already committed and pushed before the switch, and it was not modified.

## Server contract expected

The client is built against the foundation contract `6ac19b8c` from report `20261007T155922Z-build92-training-variant-server-foundation.md`:

* **Read:** `training-logger` adds the optional `executionVariantsByExercise: { [canonicalExerciseId]: [{ variantId, key, label, legacyKeys, status, provenance, selection: { variantId, key, label, rawLabel } }] }`.
* **Command:** `training-catalog.execution-variant.create.v1` with payload `{ canonicalExerciseId, displayName }`. It returns `{ status: created | reactivated | already_exists, variant, selection }`. Validation failures return 400 `TRAINING_EXECUTION_VARIANT_*`; an unknown exercise returns 404 `CANONICAL_EXERCISE_UNAVAILABLE`.
* **Finalize:** `training-session.commit.v1` sends `executionVariant { key, label, rawLabel, variantId? }`. The legacy shape stays valid.

**Coordination:** the staged Server reconciliation task (`4ee8cf13`, which targets live `738ce668`) has **no pushed integration branch yet**, so this candidate relies on no unpushed SHA. Against today's live Server, which has no projection, the candidate behaves as Ordinary only with Create hidden; this is tested. The reconciliation must preserve the read and command shapes above.

## What changed (15 files, +855 / −13)

**Contracts**
* `TrainingReadModel.swift`:
  * `TrainingExecutionVariant.variantId` is optional and immutable.
  * New `TrainingExecutionVariantChoice`. Its `isSelectable` requires a `tev_` id, a selection that names itself, active status, and a key that is not Ordinary or the Superset family.
  * New `TrainingExecutionVariantIdentity`, a Swift mirror of the Server resolver: `variantId`, then key, then legacy key resolve to the choice id; anything else stays the legacy key; no variant is Ordinary. With no choices it equals the old key comparison.
* `TrainingLoggerReadModel.swift`:
  * New `TrainingLoggerConfiguration.supportsExecutionVariantCreation` (optional).
  * New per-exercise `TrainingLoggerCatalogExercise.executionVariants`.
  * Previous-performance lookup passes this exercise's choices.
* `TrainingExerciseHistoryCalculator.swift`: `previousComparableOccurrence` partitions by stable identity. The default with no choices behaves exactly as before.
* `WatchWorkoutContracts.swift`: `Row.variantLabel` is optional and display only.

**Networking**
* `ProductionDailyDriverAPI.swift`: decodes the projection with a per-entry failable decoder and filters to selectable choices. A missing field means Ordinary only with no Create.
* `TrainingExerciseCatalogWriteAPI.swift`:
  * New protocol requirement `createExecutionVariant`, with a default that throws for Sandbox and older writers, so no local-only variant is possible.
  * Idempotency key scope is the exercise plus the normalized name. A retry reuses the key; the key is forgotten after a terminal answer.
  * Server rejections are surfaced as `TrainingExecutionVariantRejection` carrying the Server's own message.
* `ProductionCommandAPI.swift`: new command type constant. Cache invalidation of `training-logger` already applies through the existing "training" rule.
* `WatchWorkoutProjectionMapper.swift`: passes the selected variant label to the Watch row.

**Presentation**
* `TrainingLoggerView.swift`:
  * Per-exercise **Execution variant** menu: **Ordinary**, then the canonical choices for this exercise (selected one shows a checkmark), then a divider, then **Create Variant…**.
  * Create is shown only under Founder Production, when the Server supports the contract, and for a canonical catalog exercise.
  * A restored selection that is no longer offered stays visible as a disabled checked item.
  * New `TrainingExecutionVariantCreateSheet`: name only, at most 40 characters, medium detent. Cancel and Create (Retry after an error), with an inline truthful message. Swipe-dismiss is blocked while the request is in flight.
* `TrainingLoggerViewModel.swift`: `variantChoices`, `canCreateVariant`, `selectVariant`, `begin`/`cancelCreatingVariant`, and `submitNewVariant`.
  * A returned canonical choice is inserted for that exercise only, de-duplicated by `variantId`, and selected immediately.
  * On failure the prior selection is kept and the sheet stays open.
  * Concurrency guard: selection is applied only if the same exercise occurrence (same id and canonical exercise) still exists when the response arrives.
* `PhysiqueOSWatch/WatchWorkoutViews.swift`: the row title becomes "A · Spider Curls · Static Hold". Tiles are unchanged; there is no Watch edit, create, or timing.

**Behavior preserved**
* Ordinary sentinel is unchanged.
* Switching variants **never clears or rewrites sets**; variants inherit sets, reps, and load.
* No duration or timed-hold input, no new set type, no Super Set choice, no rename or retire UI.
* The legacy global `configuration.variants` is no longer offered as choices; the Sandbox fixture list is not used as a menu.
* Adaptive Progression is unchanged: Native shows no recommendation for non-Ordinary variants, as before.
* The finish payload carries `variantId` only when selected. Ordinary and legacy writes encode byte-identically (tested).

## Tests

Storage-safe and sequential. One dedicated DerivedData, plus one dedicated iPhone simulator and one Watch simulator for this lane only. No `xcodebuild` from another lane was running during these runs.

| Gate | Result |
|---|---|
| New unit tests: `TrainingExecutionVariantTests` (8); adapter/command tests in `FounderServerAPITests` (4); Watch-projection mapper test (1) | all pass |
| Focused iPhone: TrainingExecutionVariant, FounderServerAPI, TrainingLogger, TrainingCatalogMyLibrary, TrainingReadModel, TrainingLoadSemantics | **477 / 0** |
| **Full iPhone unit (`PhysiqueOSTests`)** | **2211 executed, 0 failures, 1 skipped** |
| **Watch unit (`PhysiqueOSWatchTests`)** | **71 / 0** (includes new variantLabel decode/title test) |
| UI: new `testExecutionVariantMenuWithoutServerChoicesOffersOrdinaryOnly` and `testCheckpoint2ActiveWorkoutDark` | **pass** |
| UI: `testSaveAndLeavePersists…` and `testRestPreferenceMenuDefaults…` | fail **identically on unmodified Build 91 `106f0518`** in the same simulator: stale `openWorkoutLoggerFromLog` helper ("Training Logger was not available from Log") after the Log redesign. **Baseline, not a regression**; flagged for the visual or integration lane. |
| Generic iOS **Release** build (`CODE_SIGNING_ALLOWED=NO`) | **BUILD SUCCEEDED**, covering app, Watch, and Live Activity/Widget extension |
| Release seam scan | **0** `-physiqueos.*` / `-watch*` launch flags and **0** preview/review/fixture types in app, Watch, and extension. The scanner was validated: it finds 40 flags in the Debug dylib. The Release app contains the new `trainingLogger.variant.create` UI. |
| `verify_release_configuration.py` | OK, version 1.0 (91) (unchanged) |
| `git diff --check` | clean |

* **Test-run artifact:** the widget snapshot test rewrote 14 tracked PNGs under `agent-handoffs/artifacts/home-screen-widget-v1/`. They were **restored to Build 91** and are not part of the candidate.
* **UI coverage note:** UI tests cover the Sandbox/old-Server path. The Founder Production create path is covered by ViewModel and adapter unit tests, because there is no production-stub UI harness. **Physical acceptance against a deployed variant Server is still required.**

Specific required cases covered:
* old Server without the projection;
* per-exercise isolation (no leakage onto another exercise);
* select, and create-then-select;
* idempotent repeat (`already_exists` and `reactivated` both reuse the identity) and retry with the same key;
* offline/error keeps the prior selection; Server rejection message shown; over-length name never sent;
* stale in-flight response is not applied after the exercise was removed;
* persisted selection survives a draft round-trip; legacy drafts and configurations decode;
* Ordinary sessions unchanged;
* legacy Static Hold history keyed to the definition;
* no Superset choice; retired choice not selectable;
* new variant borrows no Ordinary or Static Hold evidence (Adaptive Progression and previous-performance identity contract);
* Live Activity and Watch compatibility (optional row field, older-phone decode).

## Integration conflicts

* **Codex visual closeout** `codex/build92-final-native-visual-closeout-20261007` (`f6b39423`, also based on Build 91):
  * **zero overlapping files**;
  * a trial `git merge-tree` of the two candidates is **conflict-free** (tree `531a6629`);
  * Codex touched `TrainingSessionDetailView.swift`, which is not a Logger file I changed.
* Logger refusal/error-state styling, which belongs to Codex's closeout scope: my only new error UI is the sheet's inline red message using `PhysiqueOSTheme.redesignRed`. Review it at integration if the closeout standardizes refusal styling.
* The two baseline UI-test failures above should be fixed by whichever lane owns the Log entry tests.

## Storage

| Moment | Free on `/System/Volumes/Data` |
|---|---|
| Task start | ~19 GiB |
| Before cleanup (other lanes also writing) | 13.26 GiB |
| After cleanup | **15.28 GiB** |

* **Removed:** only this lane's regenerable artifacts, about 4.9 GB:
  * DerivedData 0.93 GiB;
  * Release products 0.65 GiB;
  * four `.xcresult` bundles 0.34 GiB (results captured in logs first);
  * the two lane-only simulators, both shut down (iPhone 2.5 GiB, Watch 0.31 GiB);
  * a small Swift probe.
* **Retained:** archives for Builds 85–91, other lanes' booted simulators (B91 OP, LaneB Briefings, B90 Watches), all worktrees, credentials, receipts, and SDK runtimes.
* **Risk for the next lane:** about 15 GiB free with several lanes active. A full UI suite or Release build needs about 3–5 GiB headroom.

## Founder authorization still needed (none performed)

1. Server/Web integration candidate from task `4ee8cf13`, reconciled to live `738ce668`: review, then deploy authorization. Until then this Native build shows Ordinary only with Create hidden.
2. Legacy Static Hold seed: dry run, then apply, each separately authorized after the Server deploy.
3. Native integration with the Codex closeout and other Build 92 lanes, then the Build 92 bump and archive, then the TestFlight upload. Each step is separate.
4. Build 91 physical acceptance (October 8) stays independent. Build 91 archives and release authority were not touched.

## Safety

No deploy, no production read or mutation, no seed, no build bump, no archive, no TestFlight upload. No Build 91 or Server-foundation edits. Only the authorized candidate branch was pushed, and this report is published report-only.
