# Build 37 PC read-only production incident audit

This handoff closes only the production-specific evidence gaps from the Build 36 physical pass. It authorizes no mutation, deployment, command replay, model invocation, or benchmark.

## Authority and execution boundary

- Repository: `C:\Users\dusti\Documents\GitHub\physiqueos`
- Runner: `.tmp/digitalocean/run-app-console-context-gzip-source-on-open.mjs`
- Saved read-only context: `physiqueos-final-cutover-config`
- Expected app: `bf57cf56-48cc-4cd6-90e4-a23ee5381741`
- Expected component: `web`
- Expected production source: `51e3e11fd63d5bf4f41bbcec5315116abf561677`
- Expected deployment: `cfd71f31-e696-4e29-bbda-096b92d6576c`

Reverify all four authorities before inspection. Stop on `401`, `403`, an unavailable application-console/database binding, source drift, or scope that would require mutation. Do not inspect or print credentials.

Every SQL session must begin:

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SHOW transaction_read_only;
```

Require `transaction_read_only = on`, resolve the Founder owner once, use only owner-fenced bounded `SELECT`s, and end with `ROLLBACK`. Return sanitized values only. Never return image bytes, OCR text, signed URLs, storage paths/keys, credentials, or arbitrary payload dumps.

Application logs may be read only for the bounded timestamps and known safe event names below. Do not request a new token or repurpose `physiqueos-production-deploy`.

## A. Coaching Updates stale composite save

Incident window: `2026-09-16T05:06:00Z` through `2026-09-16T05:17:59Z` (Sep 15 10:06–10:17 PM PDT).

Return:

1. Every owner-scoped `operating-plan.coaching-updates.save.v1` command receipt or rejection trace in the window: command ID, receipt status, problem code, expected runtime revision, actual runtime revision, and idempotency key hash only.
2. The exact editor-owned fences at the attempted save: Coaching protocol ID/current version ID, Progress Photos protocol ID/current version ID, Progress Photos execution revision, reminder ID/version, DEXA execution ID/revision/status/active flag, and the composite semantic digest if persisted.
3. The same resource versions at the nearest preceding read, where persisted/logged.
4. Owner runtime revision/version changes within the window, including safe command type and timestamp for every change between the read and rejected save. Identify whether the advancing command touched any Coaching/Photos/reminder/DEXA resource.
5. The rejected sub-resource/fence, with expected and actual values. If only the global runtime revision differed while all semantic/per-resource fences were unchanged, say so explicitly.
6. Confirm no partial Coaching, Progress Photos, reminder, or DEXA mutation occurred.

Do not perform a save. Do not change the completed historical DEXA.

## B. Fresh Build 36 Nutrition conflict and card identity

Bounded search window: `2026-09-16T05:17:00Z` through `2026-09-16T05:42:00Z`. Select only owner-scoped Nutrition intake/review rows created in that window.

### Required provenance correction before any Nutrition patch

The Founder supplied the exact two MyFitnessPal screenshots used by the fresh
Build 36 upload. Visual inspection establishes these source facts:

- Breakfast: `400 cal / 61g protein / 27g carbs / 6g fat`
- Lunch: `588 cal / 61g protein / 24g carbs / 23g fat`
- Dinner: `809 cal / 47g protein / 27g carbs / 57g fat`
- Snacks: `687 cal / 12g protein / 87g carbs / 34g fat`
- Complete four-meal sum: `2484 cal / 181g protein / 165g carbs / 120g fat`

The displayed quantities include `Cheez-It: 81 crackers`, `Magnifisauce: 32 g`,
`Egg: 4.5 egg`, and `Bacon: 1.5 pieces`; these are real source values and must
not be classified as OCR inflation.

The alleged source totals `1496 / 59 / 114 / 91` equal **Dinner + Snacks
exactly**. They are therefore a visible partial-meal subtotal from one artifact,
not a visible independent full-day summary. Breakfast + Lunch independently
equal `988 / 122 / 51 / 29`; both artifact subtotals combine to the complete
four-meal total above.

Do not recommend changing meal quantities or weakening Nutrition reconciliation.
The audit must determine how the Dinner + Snacks subtotal became
`source_daily_totals` and whether that happened during fresh interpretation,
same-date candidate merging, or reuse of an older review/package.

For the exact fresh intake, additionally return the following bounded,
sanitized provenance facts:

1. Receipt ID, submission identity, package ID, review ID, and their creation,
   update, interpretation-start, and review-ready timestamps.
2. For each stored artifact: ordinal, artifact ID, media-object ID, SHA-256,
   byte length, and MIME type. Do not return filename, storage key/path, signed
   URL, bytes, or OCR text.
3. For each pre-merge Nutrition candidate retained anywhere in the package,
   receipt, diagnostics, or safe structured logs: candidate ID, source artifact
   refs, `daily_totals`, `metadata.daily_totals_scope`,
   `daily_totals_source_artifact_refs`, and meal labels plus four aggregate
   macros only.
4. For the final merged NutritionDay: source artifact refs, chosen
   `source_daily_totals`, its source artifact refs, scope, meal sums,
   differences, status, and conflicting fields.
5. Whether the raw interpreter labeled the Dinner + Snacks candidate
   `partial_meal_subtotal`, `unknown`, or `full_day_summary`. If the raw output
   is not durably retained, say so explicitly rather than inferring it.
6. The exact function/stage that first assigned or retained
   `1496 / 59 / 114 / 91` as the merged source authority, to the extent the
   persisted safe diagnostics prove it.
7. Compare submission identity, package/review IDs, artifact hashes, and
   content lineage with every pending Sep 15/16 Nutrition review. State whether
   the completed receipt was replayed under the same submission identity or a
   new receipt/review was created. Do not assume content-hash deduplication.
8. Return whether the Native one-card presentation selected an existing card,
   replaced a card, or simply displayed the only pending review supported by
   the bounded rows. If that fact is not persisted, mark it unavailable.
9. Determine whether the exact pending review is eligible for the existing
   version-protected `reprocessPendingReviewInPlace` path using its retained
   package and verified stored artifacts. Return its current version/status,
   source-artifact fingerprint, any prior reprocessing lifecycle/version, and
   whether reprocessing under the corrected structural-scope logic would
   preserve the same review/package identities. Do not invoke reprocessing.

The screenshots attached to the Mac chat may have been transcoded by transport.
Their local attachment hashes are useful only as comparison hints and must not
be assumed to equal production hashes without byte-lineage proof:

- first attachment (Dinner/Snacks):
  `eed0f799d0b5973b9c86160cf7c552f2b1ac650b2469f8f1622191c636bb2f35`
- second attachment (Breakfast/Lunch):
  `f9370e305ce2e1141033fe9ae2517aca6e8de219bfa0a52a080f86d475aa22c4`

For each matching intake/review, return:

- intake ID, submission identity, review ID, created/started/ready timestamps, status, version;
- artifact count and SHA-256 hashes only (no filenames if private, no bytes/paths);
- interpreter provider/model and per-stage safe timing fields;
- extracted daily totals for `calories`, `protein_g`, `carbs_g`, `fat_g`;
- ordered meal summaries limited to meal label plus each meal's four aggregate macros;
- summed meal totals for the same four fields;
- `daily_totals_reconciliation.status`, tolerances, differences, and `conflicting_fields`;
- whether any food/quantity is absent, unparsed, duplicated, or excluded according to interpretation diagnostics;
- review confirmation/commit progress and any command receipt (expected: no canonical mutation for a blocked conflict).

Also compare this upload's artifact hashes and submission identity with every pending Sep 15 Nutrition review. Report whether the upload reused the exact same content/idempotency identity and therefore the same review, or created another review that Native failed to show. Return the exact pending Nutrition review count. Do not dismiss or confirm anything.

## C. Activity T1/T2/T3 and read visibility

Incident window: `2026-09-16T05:41:00Z` through `2026-09-16T05:48:00Z` (upload around 10:42 PM PDT, Review ready around 10:45 PM).

Resolve the single owner-scoped Activity intake/review and return:

- intake/submission/review IDs and artifact hash;
- accepted, queued, interpretation-started, review-ready, confirm-pressed/command, canonical-write, and final-review timestamps;
- outbox message created/available/claimed/completed timestamps and attempt count;
- safe application-log events for this intake only:
  - `evidence.intake.artifact_stored`
  - `evidence.intake.accepted`
  - `evidence.intake.interpretation_started`
  - every `evidence.intake.interpretation_stage`
  - `evidence.intake.review_ready`
  - `native.command.durable_acknowledgement`
- the logged `queueWaitMs`, registry/context/artifact-load/model-or-screenshot-interpretation/normalization/persistence/total durations;
- interpreter provider/model and whether the external model call dominates T2;
- review commit-progress step timestamps and exact point at which canonical Activity became durable;
- Activity canonical record identity/version and the first persisted/readable state used by the Log projection;
- whether Log's empty result can be explained by pre-commit success acknowledgement, stale read cache, or both.

Do not re-run interpretation or confirmation. Do not call an external model. Do not mutate the Activity day.

## D. Review-ready publication evidence

For the Activity intake from section C, return whether the server exposed `reviewReadyAt`/ready status when polled and whether any server-side publication intent exists. The Build 36 fallback is a Native local-notification path, so state explicitly which facts cannot exist in SQL (local observation task, `UNUserNotificationRequest`, pending/delivered state). Do not infer iOS scheduling from server rows.

## E. Supplement reminder A/B and Next Due inputs

Read only the active Founder supplement roots/executions/reminders for `Fadogia Agrestis` and `Electrolytes`.

Return, for each:

- protocol ID/status/current version;
- execution ID/type/active/revision, cadence, preferred schedule, start/end, reminder preference, completion history dates;
- every linked reminder ID/type/active/version, linked protocol/execution IDs, schedule, and completion history dates;
- the deployed `operating-plan-protocol-domain` method projection's `reminderEnabled` value;
- the deployed `operating-plan-supplement-support` projection's `nextDue` value.

This is an A/B audit: prove which exact field caused Electrolytes to show a bell and which missing/projected field caused Fadogia Next Due to be absent. Do not edit either support.

## F. Old three-workout review comparison (required and bounded)

Review only `evidence_review_CDA0400DF634424D9D9D5D93802E9DB1` and active Sep 15 canonical Training records. Return the review's three workout identities/types/windows/telemetry/source artifact hashes and the candidate count against each canonical Training record under the current generic Apple/Logger compatibility rule. Classify each as unique, ambiguous, incompatible, or already represented. Do not confirm, dismiss, reconcile, or mutate the review.

Specifically compare the screenshot strength window and both walk windows to
the durable Logger session
`training|authoritative|training_logger_draft_E017D899-55F6-4983-8F14-022AD7DBE809`
and every other active Sep 15 Training record. Return enough sanitized timing,
activity type, telemetry, provenance, and explicit reconciliation-link facts
for Mac Codex to classify the preserved review under the corrected rule that
same calendar date alone is never sufficient to merge workouts. Do not infer
compatibility from the date.

## Required final gates

```text
PRODUCTION SQL TRANSACTION READ ONLY: YES/NO
PRODUCTION AUTHORITY EXACT 51e3e11f...: YES/NO
COACHING FAILED FENCE IDENTIFIED: YES/NO
COACHING EXPECTED/ACTUAL VALUES IDENTIFIED: YES/NO
COACHING UNRELATED GLOBAL REVISION ADVANCE PROVEN: YES/NO
COACHING PARTIAL MUTATION: NO
NUTRITION REVIEW IDENTIFIED: YES/NO
NUTRITION EXACT CONFLICTING VALUES IDENTIFIED: YES/NO
NUTRITION SCREENSHOT MEAL TOTALS MANUALLY VERIFIED: YES
MEAL-DERIVED 2484/181/165/120 MATCH SCREENSHOTS: YES
1496/59/114/91 PROVENANCE IDENTIFIED: YES/NO
WRONG-REVIEW/STALE-METADATA REUSE RULED OUT: YES/NO
NUTRITION TRUE ROOT CAUSE FOUND: YES/NO
NUTRITION ONE-CARD IDENTITY EXPLAINED: YES/NO
NUTRITION IN-PLACE REPROCESS ELIGIBILITY PROVEN: YES/NO
NUTRITION CANONICAL HISTORY MUTATED: NO
ACTIVITY INTAKE/REVIEW IDENTIFIED: YES/NO
ACTIVITY T1/T2 STAGES MEASURED: YES/NO
ACTIVITY EXTERNAL MODEL DOMINANT: YES/NO/UNKNOWN
ACTIVITY T3/CANONICAL WRITE CHRONOLOGY MEASURED: YES/NO
ACTIVITY PRODUCTION DATA MUTATED BY AUDIT: NO
FADOGIA/ELECTROLYTES A-B SHAPE PROVEN: YES/NO
OLD THREE-WORKOUT REVIEW MUTATED: NO
OLD THREE-WORKOUT REVIEW COMPARISON COMPLETE: YES/NO
PRODUCTION DATA MUTATED BY AUDIT: NO
```
