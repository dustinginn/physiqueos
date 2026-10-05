# Workout reliability lane — FINAL CLOSEOUT (2026-10-05)

Task: `20261005T214000Z-workout-reliability-deploy-2c-closeout` (prompt commit `b19faf1e`).
Lane: **Workout reliability lane**, separate from Redesign Batch 3 and from the Batch 2 / Build 88 release gate.
Agent: Claude, in the same single Remote Control worktree.

## Final authorities

| Item | Exact value | State |
|---|---|---|
| **Production Server** | **`b7eb1e397f0238df9ae904fd182ddbb51602e8d8`**, deployment **`6fa4e887`** | **LIVE** (contains `b5de242f`) |
| Previous production | `b5de242f` / `ea89c93e` | SUPERSEDED (rollback target), then `c7c99347` / `e7ef3157` |
| **Native workout candidate** | **`e9f8a957be419d89a10b316c57b90afeb08d2f17`** on `claude/build87-workout-reliability-audit-20261005` | unchanged, unreleased |
| **Batch 2 integration preview** | **`70ebf7534a90ec4256bbddd140cb98920a4025a4`** on `claude/workout-reliability-on-batch2-preview-20261005` (Batch 2 RC `793462b1` + `e9f8a957`) | unchanged, preview only |

There was no TestFlight upload, no build-number bump, and no merge into the final release branch.

## 1. 2-C Server deploy (`b7eb1e39`) — verified

**Pre-deploy checks:**
- Production was `b5de242f` / `ea89c93e`, and the deploy branch was at `b5de242f`.
- `b7eb1e39` is its direct child, so the push was a fast-forward.
- Exact diff: 2 files, +134/−1, both in `CoreNavigationReadService.js` and its test.
  - It is a read-time projection only: no writes, no migration or schema files, no persisted-data rewrite.
  - The standalone recommendation formatting was extracted unchanged.
- **Focused tests:** 133/133 across core navigation, progression, superset context, relationship and the HealthKit trusted correlation.
- **Wider training/progression run:** 925 passed, 23 failed. Those are the same 23 tests in the same 6 files that fail at base `b5de242f`.

**Older clients stay compatible:** the change only adds a JSON key. Older Native decoders ignore unknown keys, and Native `e9f8a957` already treats the field as optional and decodes each entry so that a bad one is dropped on its own.

**Deploy:** the guarded path, run under `set -e` with a check at each step.
1. Fast-forward push to `combined-app-platform-cutover`; the remote head was verified.
2. A 4-line spec stamp: `PHYSIQUEOS_GIT_SHA` and `PHYSIQUEOS_BUILD_ID` on web and worker.
3. `create-deployment --force-rebuild` produced `6fa4e887`. The spec-update deployment `c127ddcc` was CANCELED by the force-rebuild, as expected.

**Verification:**
- `6fa4e887` ACTIVE, 9/9 steps.
- web and worker `source_commit_hash` = `b7eb1e39…`.
- `/live` and `/ready` both report `physiqueos-b7eb1e39-20261005`; `/ready` shows access gate, provider configuration and database ready.
- Fresh log `gitSha` is `b7eb1e39…` on web and worker.
- 0 error or fatal lines in the last 400 run-log lines of each component.

## 2. Production contract verification (read-only)

**Method:**
- Ran in the production web container: runtime SHA guard, REPEATABLE READ READ ONLY, SELECT-only guard, ROLLBACK, and filesystem and network writes denied.
- The probe ran the **exact deployed** `projectTrainingLoggerContextualRecommendations` and `projectTrainingLoggerRecommendationResult`, extracted verbatim from `b7eb1e39`, plus the deployed domain progression and relationship modules.
- Input: all 245 confirmed training sessions.

**Code-level proof:** the compiled server chunk `.next/server/chunks/1840.js` contains `contextualProgressionRecommendations`.

| Local date of the request | Contextual entries | Leg Extension + Sissy Squat superset context | Standalone (unchanged) |
|---|---|---|---|
| **2026-10-05 (today)** | 0 | none: only 09-14 counts before today, and 2 comparable sessions are required | Leg Ext maintain 90 lb × 15; Sissy maintain 45 lb × 15 |
| **2026-10-06 onward** | 2 | **Leg Ext** `superset\|partners:sissy_squat` → 80 lb × 15; **Sissy** `superset\|partners:leg_extension` → 50 lb × 12 (both `recover`) | identical to today |

- **Today's empty list is correct.** The Server's existing progression rule compares only sessions strictly before the request date. Today's 10-05 workout begins to count from tomorrow, and nothing was created or edited to force a result.
- **From 10-06 the history is sufficient.** The Leg Extension + Sissy Squat superset now has 2 confirmed sessions (09-14 and 10-05), so the Server emits contextual recommendations for exactly that relationship.
- **Product note (not changed):** the existing Server rule compares load first, then reps (`comparePerformance`).
  - Today's lighter Leg Extensions, 40 × 30 (more volume), therefore read as below 09-14's 80 × 15, giving "Recovery opportunity: 80 lb × 15".
  - Sissy Squats 45 × 15 versus 50 × 12 reads the same way.
  - This is the pre-existing standalone semantics applied to the separate superset pool, exactly as approved. If rep-range changes should not count as regression, that is a separate progression-semantics decision.
- **Native match:** the production entry shape matches `e9f8a957` exactly:
  - `relationship.relationshipType / relationshipKey / partnerCanonicalExerciseIds`;
  - `state` within `opportunity|maintain|recover`;
  - the suggested fields.

  There is no decoding mismatch, so no new Native SHA is needed.

## 3. UUID-case real-production link validation (from the previous step, unchanged)

- Server `b5de242f` (now included in `b7eb1e39`) linked today's PhysiqueOS Watch strength workout automatically. This happened on the first normal HealthKit ingest after the deploy, at **2026-10-05T21:29:05Z**.
- The link `healthkit_workout_link_0ff93bd27e…` is confirmed and uses `trusted_physiqueos_session_id_v1`, confidence 100. It points to the exact stored session `training|authoritative|training_logger_draft_B1CB418C…`.
- 0 reviews were opened and 0 Evidence records were written. Addendum: `20261005T213236Z-workout-reliability-watch-link-verified.md`.

## 4. Native candidate `e9f8a957` (unchanged) — contents

On top of Build 87 `f66c7fc6`:

**`cd06bfea`:**
- Watch-finish recap / PR / confetti parity (the Server PR list persists on the completion; unknown records are re-read);
- superset history context in production Logger history;
- completed sets immune to Use suggestion / Keep previous;
- Watch Complete Set settles from the phone's context acknowledgement;
- an unsent tap never shows "Set pending";
- correlatable latency logs (`m=` pairing, rtt, queue/mutate/publish/app).

**`e9f8a957`:**
- **2-B:** on pair, unpair or re-pair, untouched and uncompleted rows refill from the new context; with no history the current values are kept.
- **2-C:** Native selects only a Server contextual recommendation whose partner set exactly matches; Native has no progression authority of its own.

## Tests (this closeout)

| Gate | Result |
|---|---|
| Server `b7eb1e39` focused | 133/133 |
| Server wider training/progression | 925 pass; 23 reds identical at base |
| Integration preview `70ebf753`: full `PhysiqueOSTests` | **2034 tests, 0 failures** (1 skipped) |
| Integration preview: `PhysiqueOSWatchTests` | **49/49** |
| Integration preview: generic iOS Release compile (unsigned) | **BUILD SUCCEEDED** |
| Watch UI tests (run by mistake without the unit-only filter) | 7 run, 1 failure: `testFinalSetFinishShowsConfirmationOnThePrimarySurfaceAndNotYetReturns`, the known pre-existing Watch UI case. Not a gate. |
| Candidate `e9f8a957` (previous step) | targeted 472/0; full 2025 with only the Build 87 Peptide baseline failure (absent on Batch 2); Watch 49/49; Release OK |

## Integration (unchanged from the previous report)

Integrate onto the final next-build authority with preview `70ebf753`, or reproduce it by merging `e9f8a957` into Batch 2 RC `793462b1`. The only conflict is `TrainingLoggerView.swift`:
- keep the catalog-aware `removeExercise`;
- keep both the DEBUG review seam and the Watch-finish records refresh hooks.

No Server ordering constraint remains, because both Server changes are live.

## Remaining, separately scoped Watch follow-ups

1. **Review/Confirmation Complete Set gating, plus the timed-set Watch projection.** These share a root: the Watch mapper versus `TrainingSessionLiveProjection`.
2. **Phone-side reply before side effects, and one projection build per command.** These are pending the next real workout's correlatable latency evidence.

**Lane status:** CLOSED. Next step: include `e9f8a957` (preview `70ebf753`) in the next build when Build 88/89 is authorized.
