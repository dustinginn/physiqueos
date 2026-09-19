# HealthKit server foundation V1

## Boundary

HealthKit ingestion is a source transport, not an Evidence or coaching decision.

`HealthKit source observation -> canonical PhysiqueOS record (when safe) -> separately owned Evidence eligibility -> later interpretation`

The ingestion command never assigns a Goal, Phase, Confidence meaning, Narrative meaning, Briefing meaning, coaching recommendation, or strategic Evidence eligibility. Every raw source record has `evidenceEligibility.state = "not_assessed"`.

This implementation reconciles the transferred V1 foundation at commit `5ec72e09c90693cb8d107a065c3c5f9a1a2d7a65` onto Server authority `0a07132c150479c53db23f5904957bb14d13507b`. It deliberately preserves V1 observation identity, including its NUL identity-part separator. V2 identity changes are not part of this foundation.

## Native write contract

Use `POST /api/v1/native/commands` with command type `healthkit.observations.ingest.v1`, existing Founder bearer authorization, and an `Idempotency-Key` header.

Supported observation types are `activity_summary`, `workout`, and `quantity_sample`. Batches are bounded to 100 observations.

Every observation has an immutable ingestion purpose. Omitted purpose preserves V1 compatibility as `operational`; the Founder canary sends `validation_only`. Purpose is part of semantic replay protection but is deliberately not part of the accepted V1 identity hash. Reusing an identity under another purpose fails closed with `HEALTHKIT_INGESTION_PURPOSE_IMMUTABLE` and cannot promote or duplicate the raw record.

`activity_summary` requires:

- positive device-scoped `sourceRevision`;
- `coverage` of `partial_day` or `complete_day`;
- `aggregationScope = "daily_total_including_workouts"`;
- existing canonical ActivityDay metric keys such as `move_calories`, `exercise_minutes`, and `stand_hours`.

`quantity_sample` contains `sampleType`, non-negative `value`, `unit`, and optional `workoutExternalId`.

Opaque `HKQueryAnchor` values are not part of authoritative Server state and are never persisted, advanced, or interpreted by ingestion. Native owns query cursors. The Server response explicitly reports `cursorResponsibility: "device"`.

## Identity, retries, and provenance

The Server derives source-observation identity from source bundle identifier, observation type, and immutable HealthKit external ID. Activity summary snapshots additionally include authenticated delivery device and device-scoped source revision because a daily snapshot legitimately changes.

V1 joins these identity parts with the NUL byte before SHA-256 hashing. This is a compatibility boundary and must not be changed without a separately versioned migration plan.

The command receipt makes an exact HTTP retry replay-safe. Source-observation identity makes repeated delivery under another batch or idempotency key a no-op. Reusing an immutable identity for different semantics fails closed with `HEALTHKIT_OBSERVATION_IDENTITY_COLLISION`.

Occurrence timestamps and intended local date are stored independently from first Server receipt time. Source bundle and device/product descriptors remain attached to the source observation.

## Activity reconciliation and activation

Canonical HealthKit Activity is disabled unless the Server-owned `healthKit_activity_activation_policy` configuration has been explicitly enabled with a Founder-approved effective local date. No date is supplied by default, inferred from authorization, or inferred from a canary range. Operational observations accepted before configuration remain raw and are not reconsidered later; there is no historical backfill.

`validation_only` Activity is permanently raw regardless of its date or any later activation policy. Its reconciliation state records the permanent canonicalization bar. It cannot update ActivityDay, canonical Evidence, or strategic state.

Once explicitly activated, an authoritative non-validation HealthKit daily total on or after the effective date may update the existing one-per-local-date canonical ActivityDay. Precedence is deterministic:

1. `complete_day` outranks `partial_day`.
2. Within equal coverage from the same authenticated delivery device, the newer source revision wins.
3. Exact replay is a no-op.
4. A late accepted semantic change uses existing canonical Activity revision history.

Coverage is evaluated before stale numeric revision checks. A newer partial snapshot therefore cannot suppress or displace an older complete snapshot.

Workout active calories are never added to the daily total because the accepted daily scope already includes workout energy.

## Workout boundary

HealthKit workouts remain in the separate `healthKitObservations` source collection.

Cardio observations expose a canonical candidate but are not committed into `canonicalEvidenceObjects`. Current downstream Training readers treat records there as strategically consumable Evidence, so auto-commit would violate the eligibility boundary.

For strength workouts, server-owned candidate matching reuses canonical workout duplicate-identity logic. One possible match remains a confirmation-required candidate; multiple matches are ambiguous; pre-existing exact source identity can be recognized; no trustworthy match remains source-only.

Ingestion never adds, changes, or removes exercises, sets, reps, load, variants, Superset relationships, bodyweight sets, or timed sets. TrainingSession remains authoritative. Confirmation and link mutation remain deferred.

## Storage and schema

Raw observations use the application-only `healthKitObservations` collection in the existing `canonical_training_records` JSON table. They are excluded from the canonical Founder runtime import/export inventory and from canonical Evidence reads.

The activation policy uses the application-only `healthKitConfiguration` collection in that same generic table. This follow-up exposes no activation mutation command and sets no activation date.

Founder-authenticated Native clients can read validation-only Activity observations through `/api/v1/native/read/healthkit-activity-canary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`. Both dates are required, inclusive, and limited to 31 local dates. The projection exposes normalized Activity values and bounded provenance only; it omits anchors and strategic fields and has no canonical authority.

Atomic `putIfAbsent` uses the existing primary key and `ON CONFLICT ... DO NOTHING`; a losing concurrent caller reads the existing immutable record and verifies its semantic fingerprint.

This foundation adds no table, column, index, migration, checkpoint table, infrastructure resource, SDK, or paid service. Current schema remains `000014_evidence_intake_text_provenance`.

## Deferred work

Native canary wiring, an explicitly Founder-authorized activation mutation path, background delivery, deletion/tombstone convergence, Nutrition canonicalization, sleep, cardio canonical commitment, explicit strength confirmation/link mutation, and strategic Evidence eligibility are later stages.
