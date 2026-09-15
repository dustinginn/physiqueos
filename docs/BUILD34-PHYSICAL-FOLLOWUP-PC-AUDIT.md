# Build 34 physical follow-up — bounded PC READ ONLY audit

Status: COMPLETED by the established PC operator. The Founder-provided sanitized
findings are recorded in the Build 33 physical-acceptance checkpoint's completed
PC audit / Build 35 section and the separate four-review cleanup preview. Do not
repeat this audit from Mac or interpret this historical request as cleanup
authorization. Preserve the read-only access handoff below for future bounded
investigations; reverify authority before future use.

Production expected: `2d0d8818db9e6b6f911348c3d0c93df400c0c63c`,
deployment `a81ed25f-8e84-4ab8-a37e-6580abc0730d`. Reverify before use.
This is NOT deployment, dismissal, confirmation, replay, or cleanup authorization.

Use only the established PC repository/runner:
`C:\Users\dusti\Documents\GitHub\physiqueos`,
`.tmp/digitalocean/run-app-console-context-gzip-source-on-open.mjs`,
explicit context `physiqueos-final-cutover-config`, verified app
`bf57cf56-48cc-4cd6-90e4-a23ee5381741`, component `web`.
Do not use `physiqueos-production-deploy` for this audit.
Do not extract or print database bindings, credentials, auth headers, tokens,
cookies, device/session credentials, storage URLs, or artifact bytes.
Stop on 401/403, missing binding, changed authority, excessive scope, or schema
discrepancy. Do not improvise another access path.

## Transaction and scope

Use the existing internally resolved Founder owner as parameter `$1`.
`$2 = 2026-09-15`; owner-local day is `2026-09-15T07:00:00Z` through
`2026-09-16T07:00:00Z`, exclusive end. Perform:

```sql
BEGIN READ ONLY;
SHOW transaction_read_only;
```

Require `on` before any audit SELECT. Finish with ROLLBACK. No advisory write
locks, FOR UPDATE, DDL, INSERT, UPDATE, DELETE, commands, worker execution,
PI/OpenAI calls, or runtime hydration that can persist state.

## 1. Foam Rolling schedule and current read projection

```sql
SELECT collection_name, record_id, version, status, source_identity, payload
FROM physiqueos.canonical_execution_records
WHERE owner_user_id=$1
  AND collection_name IN ('executionItems','reminders')
  AND (payload->>'id' ILIKE '%foam%' OR payload->>'title' ILIKE '%foam%')
ORDER BY collection_name, record_id LIMIT 11;
```

Abort if more than 10 results; do not broaden without review. Within the audit
process inspect linked/root records by exact IDs if needed, at most 10.
Emit only schedule, expected revision/version, active/completion state,
occurrence date, linkage identities and relevant schedule history timestamps.
Do not normalize or save the existing records. Preserve the failed occurrence.

Use the deployed canonical pure read projection with these owner-fenced inputs
to report Home/Priority notificationAction for Sep 15, including scheduledTime,
classification and route/completion-command availability. Repositories must be
read-only stubs or owner-fenced SELECT implementations; do not run reconciliation
jobs or persistence-capable getters. Mark current projection versus historical
12:21 projection distinctly. Current state is not proof of what Native received.

Read existing redacted production logs for 19:15–19:25 UTC, then 18:30–20:00 UTC
only if necessary. Report route/status/request timing and safe problem codes,
not auth material. Server SQL cannot prove a local UNNotificationRequest existed.

## 2. September 15 intake receipt chronology

```sql
SELECT id, expected_evidence_type, source, effective_date, version,
       media_state, interpretation_state, package_id, review_id,
       last_error_code, created_at, updated_at,
       artifact_manifest, stored_artifacts
FROM physiqueos.evidence_intake_receipts
WHERE owner_user_id=$1 AND effective_date=$2::date
ORDER BY created_at, id LIMIT 101;
```

Abort if more than 100. Inspect manifest/artifact metadata internally; emit only
ordinal, filename, MIME type, byte length, content hash and stable source ordinal
needed to distinguish batches. No storage locations or artifact contents.
For each relevant receipt: attachment count, creation/interpretation timestamps,
type hint, package/review linkage, status, and overlapping attachment hash sets.
Identify full/subset submissions versus same-receipt retries; do not assume four
Log rows equal four duplicates. Include whether any matching review predated the
Logger interaction. Receipt uniqueness is owner+submission identity; same exact
retry must not create a second receipt, but changed attachment sets have different
Native submission signatures.

## 3. Bounded linked reviews/packages and disposition failures

From step 2 derive exact review/package IDs. Read only those rows (max 100):

```sql
SELECT collection_name, record_id, version, status, source_identity, payload
FROM physiqueos.canonical_evidence_records
WHERE owner_user_id=$1
  AND collection_name IN ('evidenceReviews','evidencePackages')
  AND record_id=ANY($2::text[])
ORDER BY collection_name, record_id LIMIT 101;
```

Emit review/package identities, DB/payload versions, statuses, evidence types,
created/updated timestamps, intake linkage, source-artifact hash/ordinal linkage,
and canonical publication references only. Do not print raw interpreted narrative
or private imagery. Distinguish actual photo sessions from workout screenshot
packages and whether any four observed items are unrelated/pre-existing.

```sql
SELECT id, command_type, status, payload_hash, created_at, completed_at, result
FROM physiqueos.command_receipts
WHERE user_id=$1
  AND command_type IN ('evidence-review.dispose.v1',
                       'evidence-review.commit.v1', 'training-session.commit.v1')
  AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
ORDER BY created_at, id LIMIT 101;
```

Bind the owner-local day window; abort over 100. Emit only review/workout linkage,
status, timestamps and safe problem code. No idempotency, session or device tokens.
Inspect existing redacted native command HTTP logs for failed requests that never
created a receipt. Native .evidenceReview guard rejection can occur before HTTP,
so absence of a receipt alone does not prove a server failure.

## Required return

1. Current Foam Rolling schedule/projection, safely observed historical reads,
   and explicit limits on reconstructing the 12:21 Native request.
2. Exact observed review count and each review's intake/attachment chronology.
3. Whether retries/subsets or pre-existing items explain the four rows.
4. Current review states and allowed-state dismissal eligibility.
5. A proposed cleanup preview only if misrouted reviews are proven: exact owner,
   review identity, expected version/digest, no published canonical photo history,
   disposition-only consequence. NO cleanup execution.
6. Read-only transaction proof and production authority. No data mutation.

The Mac cannot directly route to a PC operator thread in its current connected
host inventory. Give this bounded handoff to the existing PC production operator;
do not start another implementation or recreate the access mechanism on Mac.
