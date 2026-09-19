# HealthKit server foundation V1

## Boundary

HealthKit ingestion is a source transport, not an Evidence or coaching decision.

`HealthKit source observation -> canonical PhysiqueOS record (when safe) -> separately owned Evidence eligibility -> later interpretation`

The ingestion command never assigns a Goal, Phase, Confidence meaning, Narrative meaning, Briefing meaning, coaching recommendation, or strategic Evidence eligibility. Every raw source record has `evidenceEligibility.state = "not_assessed"`.

This implementation reconciles the transferred V1 foundation at commit `5ec72e09c90693cb8d107a065c3c5f9a1a2d7a65` onto Server authority `0a07132c150479c53db23f5904957bb14d13507b`. It deliberately preserves V1 observation identity, including its NUL identity-part separator. V2 identity changes are not part of this foundation.

## Native write contract

Use `POST /api/v1/native/commands` with command type `healthkit.observations.ingest.v1`, existing Founder bearer authorization, and an `Idempotency-Key` header.

Supported observation types are `activity_summary`, `workout`, and `quantity_sample`. Batches are bounded to 100 observations.

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

## Activity reconciliation

An authoritative HealthKit daily total may update the existing one-per-local-date canonical ActivityDay. Precedence is deterministic:

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

Atomic `putIfAbsent` uses the existing primary key and `ON CONFLICT ... DO NOTHING`; a losing concurrent caller reads the existing immutable record and verifies its semantic fingerprint.

This foundation adds no table, column, index, migration, checkpoint table, infrastructure resource, SDK, or paid service. Current schema remains `000014_evidence_intake_text_provenance`.

## Deferred work

Native authorization, entitlements, anchored queries, cursor storage, background delivery, deletion/tombstone convergence, Nutrition canonicalization, sleep, activation configuration, cardio canonical commitment, explicit strength confirmation/link mutation, and strategic Evidence eligibility are later stages.
