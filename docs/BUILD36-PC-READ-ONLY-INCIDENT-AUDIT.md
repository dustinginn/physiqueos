# Build 36 — bounded production incident audit handoff

Status: REQUIRED / NOT EXECUTED. This request is not evidence of production
state and does not authorize any mutation, confirmation, replay, cleanup,
worker execution, interpretation, PI/OpenAI call, or deployment.

## Established PC access and authority

Repository: `C:\Users\dusti\Documents\GitHub\physiqueos`.
Runner: `.tmp/digitalocean/run-app-console-context-gzip-source-on-open.mjs`.
Explicit context: `physiqueos-final-cutover-config` (never use deployment
authority for this audit). Reverify app
`bf57cf56-48cc-4cd6-90e4-a23ee5381741`, component `web`, ACTIVE deployment
`d58978c0-f2fe-4907-963f-b3d03c40cd0d`, and web/worker source
`f88fa541b5805c38e72a0ae7ba2d1a82bd8ecf30` before running.

Established argument order:

```text
node .tmp/digitalocean/run-app-console-context-gzip-source-on-open.mjs physiqueos-final-cutover-config bf57cf56-48cc-4cd6-90e4-a23ee5381741 web <gzip-base64-bounded-node-audit-source>
```

Consume existing database/CA bindings internally. Do not print/export/write
credentials, headers, session/device IDs, idempotency keys, signed URLs, storage
paths, private image bytes, or full rows. Stop on 401/403, absent binding,
authority/schema discrepancy, or excessive scope. No Mac access workaround.

On one connection:

```sql
BEGIN READ ONLY;
SHOW transaction_read_only;
```

Require `on` before owner-scoped SELECTs. Resolve the approved Founder owner
internally; bind it as `$1`. Finish with `ROLLBACK`. No `FOR UPDATE`, write
locks, DDL/DML, commands, persistence-capable runtime getters, or reprocessing.

## 1. Intake timing: Nutrition and Logger, September 15

Incident window: 17:25–18:10 Pacific September 15, or
`2026-09-16T00:25:00Z` through `2026-09-16T01:10:00Z` (exclusive).
The reported times are approximate; distinguish measured timestamps from them.

```sql
SELECT id, expected_evidence_type, effective_date, source, version,
       media_state, interpretation_state, package_id, review_id,
       interpretation_started_at, interpretation_completed_at,
       last_error_code, created_at, updated_at,
       artifact_manifest, stored_artifacts, recovery_context
FROM physiqueos.evidence_intake_receipts
WHERE owner_user_id=$1
  AND effective_date='2026-09-15'::date
  AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
ORDER BY created_at, id LIMIT 31;
```

Bind the incident window. Abort over 30 results. Internally inspect manifest
and recovery context, but emit only intake/package/review identities, type,
status/version, attachment count, safe hashes/ordinals, and timing. If attach-time
prewarming predates this window, read only explicitly linked predecessor
receipt IDs, at most 10; do not broaden the day automatically.

Compute transfer/queue/interpretation/publication intervals where timestamps
exist. Explain which interval cannot be measured. Updated-at is NOT necessarily
upload completion, and receipt creation is NOT necessarily a Native tap time.

## 2. Exact linked packages/reviews

Derive exact IDs from step 1. Bind at most 40 IDs:

```sql
SELECT collection_name, record_id, version, status, source_identity, payload
FROM physiqueos.canonical_evidence_records
WHERE owner_user_id=$1
  AND collection_name IN ('evidencePackages','evidenceReviews')
  AND (record_id=ANY($2::text[])
       OR payload->>'id'=ANY($2::text[])
       OR payload->>'package_id'=ANY($2::text[]))
ORDER BY collection_name, record_id LIMIT 41;
```

Abort over 40. Model storage identity separately from payload identity. Return
DB/payload versions, lifecycle status, creation/readiness/confirmation/progress
timestamps, operation linkage, and each evidence object's type/date/source.
Do not emit raw narratives or whole payloads.

For Nutrition, emit only numeric daily totals, per-meal numeric totals and
counts, scope, `daily_totals_reconciliation` status, source totals, meal sums,
canonical totals, conflicting fields, differences, and tolerances. Inspect
removed flags and ALL Nutrition objects, not only the first visible item.

Using the exact deployed pure functions and read-only stubs, compare:

- `EvidenceReviewPresentationService`'s visible reconciliation result;
- `assertEvidenceCanonicalCommitReady(review.interpretedEvidence)`;
- `applyNutritionDayMealAggregation`'s result and original source totals.

Do not persist these calculations. Report whether the exact package rejects,
which object/field causes rejection, and whether review presentation reprojects
different values. A source-only possibility is not the incident root cause.

## 3. Command receipts, outbox and HTTP chronology

```sql
SELECT id, command_type, status, created_at, completed_at, operation_id, result
FROM physiqueos.command_receipts
WHERE user_id=$1
  AND command_type IN ('training-session.commit.v1','evidence-review.commit.v1',
                       'operating-plan.recurring-support.save.v1',
                       'operating-plan.coaching-updates.save.v1')
  AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
ORDER BY created_at, id LIMIT 41;
```

Bind incident window for evidence. For save incidents with unknown clock, use
only the Founder-local September 15 window (`2026-09-15T07:00:00Z` through
`2026-09-16T07:00:00Z`), save command types only, limit 21 / abort over 20.
Verify the Coaching command literal against deployed manifest before querying;
stop if different. Emit only receipt/operation linkage, safe result identities,
statuses and timestamps, never credential-like metadata.

Read outbox rows only by derived incident operation IDs (at most 40), using the
deployed schema's safe columns for topic/status/attempts/due/claim/completion/
error code. Do not execute a job. Existing redacted web/worker logs should supply
route/status/start/end/canonical-commit duration and safe problem/field-error
codes. Rejected admission may have NO receipt; absence alone proves no failure.
Do not claim exact Native timeout or response receipt unless observed.

## 4. Durable Training and Nutrition state

```sql
SELECT record_id, version, status, source_identity, payload
FROM physiqueos.canonical_evidence_records
WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
  AND COALESCE(payload->>'evidence_type',payload#>>'{payload,evidence_type}')
      IN ('training','training_session','nutrition')
  AND COALESCE(payload->>'lastObservedAt',payload#>>'{payload,observed_at}',
               payload#>>'{payload,date}',payload->>'observed_at')='2026-09-15'
ORDER BY record_id LIMIT 41;
```

Abort over 40. Verify deployed type/date shapes; if a schema-supported shape
differs, report the missed shape before changing scope. Emit source/package/
review/Logger-session identities, active/superseded state, frozen Goal/Phase,
exercise IDs/count, performed-set count, relationships, telemetry and provenance
classes, plus commit/publication chronology. No private imagery.

Identify the structured 3-exercise/12-set Logger attempt independently of the
three screenshot workouts. Reconstruct `LoggedTodayService`'s exact source for
“Strength Training logged” using pure read-only calculations. Do not infer a
durable session from the displayed string alone.

Dry-evaluate (never execute) what confirming the screenshot review would do
under the deployed generic compatibility rule: enrich/reconcile, create
separate sessions, duplicate, reject ambiguity, or no-op. Include both walks
and the narrow Apple strength counterpart eligibility. Do not assume the
Logger draft still existing proves no commit. Server cannot observe local-only
draft state; mark that limit explicitly.

## 5. Tracking and Coaching current read/fences

Read only the exact current Morning Weigh-In execution/reminder and Coaching
protocol/version + linked Progress Photos/DEXA executions/reminders. Resolve
identities from the pure production projection first, then owner-scoped exact
IDs in their canonical tables (at most 20 records total). Include independent
storage/canonical identities, DB/payload/execution revisions, current-version
identity, start/end/daypart/exact-time state, reminder availability, root/link
relationship and composite runtime fence. Do not normalize/save anything.

Tracking's exact reported “This support plan is unavailable” string is a
Native pre-request guard on `productionDetail` / `reminderId`. Report whether
the projection's reminder ID is null, why, and whether any actual request exists.
Do not invent an HTTP response for a guard that sent no request.

For Coaching, identify the exact rejected sub-operation/fence from existing
redacted errors/receipts and compare current projection with the attempted
versioned request if logged. Preserve composite atomicity; do not attempt save.

## Required sanitized return

1. Authority and transaction-read-only proof; bounded row counts.
2. Nutrition complete measured timeline, ALL object reconciliation facts,
   exact rejection invariant, admission/receipt/canonical mutation outcome.
3. Logger structured attempt, durable canonical identity/state, command and
   acknowledgement evidence, supporting review relationship and dry-evaluated
   confirmation consequence; explicitly identify unobservable local state.
4. Queue/worker/interpretation/confirmation durations versus Native's 15-second
   ordinary request timeout and three-poll fast-follow-up behavior.
5. Tracking guard/request shape and precise failure cause.
6. Coaching precise rejected operation/fence and partial-write absence/presence.
7. Any proposed bounded correction preview ONLY. No cleanup or mutation.

The existing Mac chat cannot dispatch to an established PC host. Give this file
to the existing PC production operator; do not recreate its credential path on Mac.
