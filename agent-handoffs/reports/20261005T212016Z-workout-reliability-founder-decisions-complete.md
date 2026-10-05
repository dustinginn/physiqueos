# Workout reliability lane — Founder decisions complete: 2-B, 2-C and the UUID-case Server deploy

Task: `20261005T204500Z-workout-reliability-founder-decisions-complete` (prompt commit `f6f3b47d`).
Lane: **Workout reliability lane**, separate from Redesign Batch 3 and from the Batch 2 / Build 88 release gate.
Agent: Claude, in the same single Remote Control worktree (no EnterWorktree, no extra worktrees).

## Authorities

| Item | Value | State |
|---|---|---|
| **Production Server** | **`b5de242f`** (UUID-case trusted Watch correlation), deployment **`ea89c93e`** | **DEPLOYED, ACTIVE** (Founder-authorized) |
| Previous production | `c7c99347` / `e7ef3157` | SUPERSEDED (the rollback target) |
| 2-C Server candidate | **`b7eb1e39`** on `claude/server-contextual-progression-20261005` (base `b5de242f`) | **NOT deployed — awaiting deploy approval** |
| Native workout candidate | **`e9f8a957`** on `claude/build87-workout-reliability-audit-20261005` (base Build 87 `f66c7fc6`; includes `cd06bfea`) | pushed, unreleased |
| Native integration preview | `70ebf753` on `claude/workout-reliability-on-batch2-preview-20261005` (Batch 2 RC `793462b1` + `e9f8a957`) | pushed, **preview only** — not the release branch |

There was no TestFlight upload, no build bump, and no merge into the Batch 2 / final release branch.

## 1. UUID-case Server fix — deployed and verified

**Pre-deploy checks:**
- Production was still `c7c99347` / `e7ef3157`, and the deploy-branch head was `c7c99347`.
- `b5de242f` is a direct child of `c7c99347`, so the push was a fast-forward with no reconciliation needed.
- Exact diff: 3 files, +77/−5 (`HealthKitObservationService.js`, `HealthKitWorkoutRelationshipService.js`, plus tests). No migration, no schema change.
- Focused re-run: 7 files, **208/208** (DormantFoundation, Relationship, Observation, LinkConfirmation, LinkReassessment, TrustedWatchPolicy, LinkService).

**Deploy (guarded path, `set -e` with a check at each step):**
1. Fast-forward push to `combined-app-platform-cutover`; the remote head was verified as `b5de242f`.
2. `apps update --spec` with a 4-line stamp diff (`PHYSIQUEOS_GIT_SHA` and `PHYSIQUEOS_BUILD_ID` on web and worker).
3. `create-deployment --force-rebuild` produced `ea89c93e`. The spec-update deployment `da7cc8c1` was CANCELED by the force-rebuild, as expected.

**Verification:**
- `ea89c93e` ACTIVE, 9/9 steps.
- web and worker `source_commit_hash` = `b5de242f29acc7e213ffbcfc849b4796eda6353f`.
- `/api/v1/health/live` → `physiqueos-b5de242f-20261005`.
- `/api/v1/health/ready` → `ready`: access gate, provider configuration and database all ready.
- Fresh log envelopes report `gitSha` `b5de242f…` on web and worker.
- No error or fatal lines in the last 400 run-log lines of either component.
- Zero canonical writes from 20:32Z until the 21:19Z probe, so no unrelated production mutation.

**Did today's Watch workout link? Not yet. It is waiting on a normal ingest.**
- Read-only probes at 20:37Z, 20:47Z and 21:19Z all found **no `healthkit.observations.ingest.v1` command since the deploy**. The phone's last HealthKit sync was 19:02Z, before the deploy.
- Today's PhysiqueOS Watch strength workout (`healthkit_canonical_workout_0a125cfcf9…`) is still unlinked: `linkAssessment` null, 0 link records for session `B1CB418C…`, 0 reconciliation reviews.
- Nothing was manually mutated, as instructed.
- **Expected effect:** the next normal HealthKit sync (opening PhysiqueOS on the iPhone triggers one) runs `reassessWorkoutRelationships`.
- **How that link happens:** the deployed case-insensitive correlation finds the stored uppercase session `training|authoritative|training_logger_draft_B1CB418C…`. It then writes one trusted, confirmed link that names that exact stored id.
- **Proof the reassessment path works:** test `links an already-ingested lowercase-id Watch workout on the next ingestion pass` reproduces exactly this. The workout is ingested first; the next activity-only ingest then links it, with no Founder review and no Evidence change.
- **Production confirmation is pending** until that sync happens. A read-only watcher keeps re-probing, and an addendum will report the outcome.

## 2. Decision 2-C — Server contract `b7eb1e39` (additive, not deployed)

`training-logger` gains `contextualProgressionRecommendations`:

```
[{ canonicalExerciseId,
   relationship: { relationshipType: "superset",
                   relationshipKey: "superset|partners:<sorted ids>",
                   partnerCanonicalExerciseIds: [<sorted ids>] },
   state, eyebrow, message, prescription,
   suggestedLoad, suggestedLoadType, suggestedReps, suggestedUnit }]
```

- **How entries are built:**
  - There is one entry per (canonical exercise, superset relationship) context found in confirmed history.
  - Each entry is computed by the **unchanged** `createTrainingLoggerProgressionRecommendation`, given that context's `relationshipContext`.
  - That means it uses only the superset pool, keyed by the existing relationship comparison key, ordinary execution only.
  - Contexts with fewer than 2 comparable sessions are omitted, so no claim is made without history.
- **What is unchanged:** `initialProgressionRecommendations` (the standalone recommendation). The formatting function was extracted, and its output is byte-identical.
- **Safety:** no schema, migration or persisted-data change. Older Native clients ignore the field. A Server without the field degrades to "no superset Suggested/Maintain".
- **Tests:**
  - new: separate standalone (90×15) and superset (80×15 / 50×12) pools; correct `relationshipKey` and `partnerCanonicalExerciseIds`; one-session context → no entry; no standalone leak from the superset pool;
  - updated: contract key presence;
  - 4 core files, 51/51.
- **Wider Server checks:** 85 training, progression, relationship and navigation files ran 925 passed / 23 failed. The same 23 fail identically at base `b5de242f`; they are pre-existing.
- **With real data:** the Founder now has 2 Leg Extension + Sissy Squat superset sessions (09-14 and 10-05). Once deployed, both exercises will receive superset-context Suggested/Maintain on the next workout.
- **Status:** the prompt reserves broader-contract deploys for explicit approval, so this candidate is **STOPPED for Founder deploy authorization**.

## 3. Native candidate `e9f8a957` — 2-B and 2-C (on top of `cd06bfea`)

**2-B, contextual row refill:**
- Superset membership changes are: pair, unpair, re-pair (the former partner is recomputed too), and removing a partner.
- On any of these, every affected exercise recomputes its contextual Previous and its Server recommendation.
- Only rows that are **neither completed nor hand-edited** refill from the new context's previous performance (Previous set *i*, or its last set for extra rows).
- If the new context has **no history**, rows keep their current values. Previous then shows "No comparable prior performance for this variant and relationship context." It never borrows another context.
- **Hand-edited rows:** a value typed through the phone UI (`TrainingSessionAuthority.setValue`, origin `.ui`) marks the row `isManuallyEdited`. This flag is local and optional, decodes from older drafts, and is never part of the commit.
- **Reordering** exercises does not change partner identity (partner order is ignored), so nothing recomputes.
- Completed sets are never modified. `cd06bfea` already guards Use suggestion and Keep previous.

**2-C, contextual recommendation selection:**
- **Decoding:** `contextualProgressionRecommendations` decodes with a failable entry wrapper, so one malformed entry is dropped alone and an older payload yields `nil`.
- **Selection:** `TrainingLoggerCatalogExercise.progressionRecommendation(variant:relationship:)` returns:
  - standalone → the standalone recommendation;
  - superset → **only** the entry whose relationship type and exact sorted partner set match the current grouping;
  - a variant → none.
- **No device-side progression:** Native derives none.
- **Membership changes:** a stale context's recommendation never survives; swapping exercises uses the same selection.
- **On the Watch:** the Watch shows the draft rows, so pairing refreshes the Watch through the authority revision; Use suggestion then projects the contextual target.

**All `cd06bfea` fixes are preserved:**
- Watch-finish recap / PR / confetti parity;
- superset history wiring;
- completed-set immutability;
- Watch context acknowledgement;
- unsent-tap state;
- correlatable latency instrumentation.

## Validation

| Gate | Result |
|---|---|
| Targeted Native classes (Build87SupersetHistoryContext 13, FounderServerAPI 248, Build83FinishLifecycle 41, TrainingLogger 89, TrainingSessionAuthority 81) | 472 / 0 failures |
| Full `PhysiqueOSTests` on `e9f8a957` (Build 87 base) | 2025 tests, 1 skipped, **1 failure = baseline `PeptideSupportEditorViewModelTests:616`** (also fails on Build 87) |
| Full `PhysiqueOSTests` on integration preview `70ebf753` (Batch 2 base) | **2034 tests, 0 failures** (the Peptide baseline is fixed on Batch 2 and not reintroduced) |
| `PhysiqueOSWatchTests` (candidate and preview) | 49/49 and 49/49 |
| Generic iOS Release compile (no signing; candidate and preview) | BUILD SUCCEEDED (both) |
| Server UUID fix focused | 208/208 |
| Server 2-C | 51/51 core; 23 reds pre-existing at base |
| Zero-write audits | production probes read-only (REPEATABLE READ READ ONLY + ROLLBACK); 0 writes since the deploy at probe time |

**New deterministic tests:**
- **2-B:**
  - pair refills only untouched, uncompleted rows; completed and hand-edited rows are unchanged; extra rows take the last contextual set;
  - unpair returns to standalone;
  - no history → values kept and no Previous claim;
  - re-pair recomputes every affected member with no stale Previous or recommendation;
  - reordering keeps context;
  - an authority `setValue` edit protects the row.
- **2-C:**
  - only the recommendation matching the grouping is used, and unpair restores standalone;
  - the Watch projection shows the applied contextual suggestion and the refreshed pairing;
  - the production payload decodes and a malformed entry is dropped alone;
  - an older payload produces no superset claim.

## Integration map (Native → final next-build authority)

1. Start from the Batch 2 RC `793462b1`, the pending Build 88 authority.
2. Merge `claude/build87-workout-reliability-audit-20261005` @ `e9f8a957`, which contains `cd06bfea` and `e9f8a957`. `793462b1` and this candidate share the base `f66c7fc6`.
3. Expect one conflict file: `ios/PhysiqueOS/Presentation/TrainingLogger/TrainingLoggerView.swift`. Resolve it exactly as preview `70ebf753` does:
   - **(a)** Keep Batch 2's restructured provisional-exercise list and use `removeExercise(id:catalog: viewModel.configuration?.exercises ?? [])`. The auto-merged "Remove exercise" menu call becomes the same.
   - **(b)** On Workout Complete, keep both the DEBUG `LoggerReviewSeam` `.onAppear` and the Watch-finish `refreshCompletedPerformanceRecordsIfUnknown` `.onAppear` / `.onChange(scenePhase)`.
4. Every other file auto-merges. No project-generator or pbxproj changes, no new files.
5. Proven gates on the result: unit 2034/0, Watch 49/49, Release compile OK.
6. `70ebf753` can be used directly as the integration commit, or recreated on the final authority.
7. **Server order:** `b5de242f` is already live. Native `e9f8a957` works with or without `b7eb1e39`: without it there is no superset Suggested/Maintain, only superset Previous plus row refill. Deploying `b7eb1e39` before or after the Native release is safe.

## Remaining Watch follow-ups (unchanged, separately scoped)

- Review/Confirmation Complete Set gating, and the timed-set Watch projection. These share a root with each other (the Watch mapper versus `TrainingSessionLiveProjection`). Nothing in this task overlapped them.
- Phone-side reply before side effects, and one projection build per command. These wait on the next real workout's correlatable logs (`m=` pairing).

## Decisions / next steps for the Founder

1. **Authorize deploying the 2-C Server candidate `b7eb1e39`.** It is additive, with no migration and no data rewrite.
2. Open PhysiqueOS on the iPhone to let a normal HealthKit sync run. That links today's Watch workout through reassessment, and the watcher then reports it read-only.
3. When ready, integrate Native `e9f8a957` into the next-build authority using the map above (preview `70ebf753`).
