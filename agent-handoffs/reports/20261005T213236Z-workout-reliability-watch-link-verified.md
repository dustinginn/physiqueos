# Workout reliability lane — today's Watch workout linked after the UUID-case deploy (read-only verification)

Task id: `workout-reliability-founder-decisions-complete-20261005`.
This addendum follows `agent-handoffs/reports/20261005T212016Z-workout-reliability-founder-decisions-complete.md`.

## Result: LINKED through normal reassessment (no manual mutation)

**What triggered it:**
- The first normal `healthkit.observations.ingest.v1` after deployment `ea89c93e` (Server `b5de242f`) committed at **2026-10-05T21:29:05Z**.
- Its `workoutRelationships` summary: assessed 30, `automaticallyConfirmed: 1`, reviews created 0.

**The new link:**
- `healthkit_workout_link_0ff93bd27e…`, status **confirmed**.
- `matchBasis: trusted_physiqueos_session_id`, `associationAuthority: trusted_physiqueos_session_id_v1`, confidence 100, `createdBy: trusted_watch_correlation`.

**Correct targets:**
- It joins the PhysiqueOS Watch strength workout `healthkit_canonical_workout_0a125cfcf9…` to the Logger session `training|authoritative|training_logger_draft_B1CB418C…`.
- `loggerSessionCanonicalId` equals the stored canonical session id exactly, uppercase (`linkTargetsStoredSessionExactly: true`).

**Source observation:**
- The reconciliation now records `workoutLinkId`, `associationAuthority` and `canonicalTrainingSessionId` (the same stored id).

**No Founder review was opened:** 0 reconciliation reviews.

## Writes since the deploy (all expected from that one ingest)

| Collection | Writes |
|---|---|
| `healthKitWorkoutLinks` | 1 |
| `healthKitWorkoutLinkClaims` | 2 |
| `healthKitObservations` | 2 (the batch's own observation and the Watch workout's reconciliation stamp) |
| `healthKitCanonicalDays` | 1 (the normal daily total) |
| Evidence collections | **0** (Logger session and Evidence untouched) |

## Method

- Read-only REPEATABLE READ READ ONLY probes, SELECT-only guard, explicit ROLLBACK.
- A watcher polled every 5 minutes and stopped at the first post-deploy ingest.

## Still open

- The 2-C Server candidate `b7eb1e39` awaits Founder deploy approval.
- Native `e9f8a957` is unreleased (integration preview `70ebf753`).
- Watch follow-ups are unchanged.
