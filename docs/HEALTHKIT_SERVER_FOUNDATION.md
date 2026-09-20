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

## Request size bound

`POST /api/v1/native/commands` bounds every request body before parsing it. The command type is inside the body, so the route reads at most the largest declared bound, parses once, and then enforces the bound of the command that was actually named:

| Command | Maximum HTTP body |
| --- | --- |
| every command except HealthKit ingestion | 4 KiB (unchanged) |
| `healthkit.observations.ingest.v1` | 5 MiB (`HEALTHKIT_INGEST_MAXIMUM_REQUEST_BYTES`) |

A malformed or unrecognizable body never receives the larger bound. Size is judged before validity: a body over its bound is `413 REQUEST_TOO_LARGE`; a body within its bound that is not a JSON object is `400 REQUEST_INVALID`. The body is read as a stream and cancelled the moment it passes the 5 MiB ceiling, with or without a `Content-Length`, so buffered memory is bounded by the ceiling; a declared `Content-Length` above it is refused before any body is read.

The 4 KiB default made a valid eight-summary Activity batch fail with `413` before command handling, which Native reports as `healthkit_server_upload_unavailable` while the durable pending batch and cursor stay untouched.

### Derivation

`computeHealthKitIngestMaximumRequestBytes()` in `nativeCommandRequestBounds.js` derives the largest body a valid `healthkit-ingestion-v1` request can occupy: 100 observations, each at the largest of the three observation shapes, every bounded string at its maximum length and JSON-escaped at the worst case of six bytes per UTF-16 code unit, every optional field present, a maximal `dailyActivity`, plus a 4 KiB command envelope allowance. The result is about 4.52 MiB; the enforced constant is 5 MiB. A realistic 100-observation Activity batch is about 58 KB; the eight-day Founder canary batch is about 4.9 KB, just over the old 4 KiB limit.

The derivation is built only from the `HEALTHKIT_OBSERVATION_WIRE_FIELDS` table, and a test records every property the normalizer reads and fails if any is missing from (or extra in) that table, so a new accepted field cannot be added without the bound accounting for it. `NativeCommandRequestBounds.test.js` also fails if the constant is smaller than the derivation (a legitimate batch would be rejected) or more than 15% larger (silent loosening), and it submits a real contract-valid maximum-size request through the route to prove the derivation is reachable rather than theoretical.

### Field bounds

The derivation is only meaningful because every accepted field is bounded. Before this bound existed, optional source text, timestamps (`Date.parse` ignores parenthesized text), numeric strings, whitespace padding around required text, and `dailyActivity` metric count and names were unbounded. They are now bounded, none of which any Native or Founder-canary payload approaches:

- every string field: at most 300 UTF-16 code units, measured before trimming;
- `startedAt` / `endedAt`: at most 64 characters;
- a numeric field supplied as a string: at most 32 characters;
- `dailyActivity`: at most 32 metrics, names at most 64 characters; `ring_completion` at most 8 metrics and no further nesting.

Accepted payloads normalize to byte-identical observation identity and semantic fingerprints; only oversized or malformed input is newly rejected, with `400 HEALTHKIT_CONTRACT_INVALID` and a field-scoped error. Properties the contract does not define are still ignored by validation, are not persisted, and count against the same HTTP bound.

The derivation is the maximum over canonical JSON encodings of valid values. A body padded with non-canonical encodings (needless array nesting around a scalar, or long digit runs in a number literal) cannot be bounded by validation, because parsing discards the literal length; the HTTP bound rejects such a body with `413` by design.

Changing any bound above or adding a field to an observation shape requires updating the derivation and the reviewed constant together.

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
