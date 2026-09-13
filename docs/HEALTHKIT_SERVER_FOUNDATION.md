# HealthKit server foundation

## Boundary

HealthKit ingestion is a source transport, not an Evidence or coaching decision.

`HealthKit source observation -> canonical PhysiqueOS record (when safe) -> separately owned Evidence eligibility -> later interpretation`

The ingestion command never assigns a Goal, Phase, Confidence meaning, Narrative meaning, Briefing meaning, coaching recommendation, or strategic Evidence eligibility. Every source record has `evidenceEligibility.state = "not_assessed"`.

## Native write contract

Use `POST /api/v1/native/commands` with command type `healthkit.observations.ingest.v1`, the existing Founder bearer authorization, and an `Idempotency-Key` header.

The payload is:

```json
{
  "batchId": "device-generated-delivery-id",
  "observations": [
    {
      "observationType": "workout",
      "externalId": "immutable-healthkit-uuid",
      "source": {
        "bundleIdentifier": "com.apple.Health",
        "productType": "iPhone17,1",
        "deviceModel": "optional",
        "operatingSystemVersion": "optional"
      },
      "occurrence": {
        "localDate": "2026-09-12",
        "timeZone": "America/Los_Angeles",
        "startedAt": "2026-09-12T10:00:00-07:00",
        "endedAt": "2026-09-12T11:00:00-07:00"
      },
      "workout": {
        "activityType": "Traditional Strength Training",
        "durationSeconds": 3600,
        "activeCalories": 400,
        "totalCalories": 500,
        "distance": 5.1,
        "distanceUnit": "km",
        "averageHeartRate": 122
      }
    }
  ]
}
```

Supported observation types are `activity_summary`, `workout`, and `quantity_sample`. Batches are bounded to 100 observations.

`activity_summary` requires a positive device-scoped `sourceRevision`, `coverage` of `partial_day` or `complete_day`, and `aggregationScope = "daily_total_including_workouts"`. Its `dailyActivity` uses the existing canonical ActivityDay metric keys such as `move_calories`, `exercise_minutes`, and `stand_hours`.

`quantity_sample` contains `sampleType`, non-negative `value`, `unit`, and optional `workoutExternalId`.

## Identity, retries, and provenance

The server derives the source-observation ID from the source bundle identifier, observation type, and immutable HealthKit external ID. Activity summary snapshots also include the authenticated delivery device and device-scoped source revision because daily totals legitimately change during the day.

The command receipt makes an exact HTTP retry replay-safe. The source-observation identity makes repeated delivery under a different batch or idempotency key a no-op. Reusing an immutable identity for different semantics fails closed with `HEALTHKIT_OBSERVATION_IDENTITY_COLLISION`.

Occurrence timestamps and intended local date are stored independently from first server receipt time. Source bundle and device/product descriptors remain attached to the source observation.

HealthKit anchored-query cursors remain device-owned. The server contract does not accept, advance, or infer them; it tolerates replay regardless of cursor behavior.

## Canonicalization and reconciliation

An authoritative HealthKit daily Activity total may update the existing one-per-local-date canonical ActivityDay. A newer device revision supersedes an older one; a complete-day summary outranks a partial-day summary. Workout active calories are never added to that daily total, because the accepted daily scope already includes workout energy.

HealthKit workouts remain in the separate source-observation collection. Cardio observations expose a canonical Workout candidate but are not committed into `canonicalEvidenceObjects` yet: current downstream readers treat every canonical TrainingSession there as strategically usable Evidence, so auto-commit would violate the eligibility boundary.

For strength workouts, server-owned candidate matching reuses the canonical workout duplicate-identity logic. It compares the HealthKit timing and trusted metrics against active, detailed strength TrainingSessions. One possible match is returned as `training_match_candidate`; multiple matches are `training_match_ambiguous`; a pre-existing exact source identity is `training_session_linked`; no trustworthy match remains `source_only`.

Ingestion never adds, changes, or removes exercises, sets, reps, load, variants, Superset relationships, bodyweight sets, or timed sets. TrainingSession remains authoritative for all detailed strength data. Confirmation and canonical linkage mutation are intentionally deferred.

## Storage

Raw observations use the application-only `healthKitObservations` collection in the existing `canonical_training_records` JSON table. They are excluded from the canonical Founder runtime import/export collection inventory and from canonical Evidence reads. This introduces no table, column, index, migration, infrastructure resource, SDK, or paid service.
