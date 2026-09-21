# HealthKit server foundation V1

## Boundary

HealthKit ingestion is a source transport, not an Evidence or coaching decision.

`HealthKit source observation -> canonical PhysiqueOS record (when safe) -> separately owned Evidence eligibility -> later interpretation`

The ingestion command never assigns a Goal, Phase, Confidence meaning, Narrative meaning, Briefing meaning, coaching recommendation, or strategic Evidence eligibility. Every raw source record has `evidenceEligibility.state = "not_assessed"`.

This implementation reconciles the transferred V1 foundation at commit `5ec72e09c90693cb8d107a065c3c5f9a1a2d7a65` onto Server authority `0a07132c150479c53db23f5904957bb14d13507b`. It deliberately preserves V1 observation identity, including its NUL identity-part separator. V2 identity changes are not part of this foundation.

## Native write contract

Use `POST /api/v1/native/commands` with command type `healthkit.observations.ingest.v1`, existing Founder bearer authorization, and an `Idempotency-Key` header.

Supported observation types are `activity_summary`, `nutrition_daily_total`, `workout`, and `quantity_sample`. Batches are bounded to 100 observations.

Every observation has an immutable ingestion purpose. Omitted purpose preserves V1 compatibility as `operational`; the Founder canary sends `validation_only`. Purpose is part of semantic replay protection but is deliberately not part of the accepted V1 identity hash. Reusing an identity under another purpose fails closed with `HEALTHKIT_INGESTION_PURPOSE_IMMUTABLE` and cannot promote or duplicate the raw record.

`nutrition_daily_total` requires `aggregationScope = "daily_total_all_sources"`, `coverage`, a positive device-scoped `sourceRevision`, and `dailyNutrition` with `calories` and optionally `protein_g`, `carbs_g`, `fat_g` (no other keys).

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

## Canonical days, activation, and the strategic quarantine

Layers are separate and never collapsed:

`HealthKit source observation -> canonical PhysiqueOS Activity/Nutrition day (healthKitCanonicalDays) -> separate Evidence eligibility gate -> V3 / Confidence / briefings only after explicit Founder authorization`

### Activation policy (server-owned, disabled by default)

Canonicalization is off unless the server-owned `healthKitConfiguration` record `healthkit_canonical_daily_activation_policy` is `status: "enabled"` with schema `healthkit-canonical-activation-policy-v1`, explicit `domains` (`activity`, `nutrition`), and an exact inclusive `effectiveLocalDate`..`endLocalDate` window of at most 7 local dates. `historicalBackfill` is always false and `strategicEvidenceEligibility` is always `quarantined`; neither is a parameter, and a record that says otherwise is invalid. An invalid or unrecognized policy never throws: it resolves to disabled so a delivery is never turned into a permanent Native 400.

The only writer is `HealthKitActivationPolicyRunner` (bundled by `scripts/operations/buildHealthKitPayload.mjs`, run through the accepted console runner): dry-run first, `expected` facts baked into apply, a drift fence, exactly two new/updated rows (the policy and one audit row), owner advisory lock, in-transaction verification, rollback on any failed invariant. `deactivate` sets the policy to disabled and never deletes a canonical day, source observation, or Evidence row. Windows are never widened in place; deactivate first.

An observation whose `occurrence.localDate` is before the window, after it, or in an unlisted domain is stored raw with a permanent bar. The observed local date, not receipt time, owns the day, so a delivery between 00:00 and 02:59 for the prior date canonicalizes to the prior date, and a new-day observation cannot leak into it. An accepted raw observation is never reconsidered on replay, so a later activation is never a backfill.

`validation_only` observations are permanently raw regardless of date or policy.

### Canonical day records

One record per Founder-local date and domain in the application-only `healthKitCanonicalDays` collection (`canonical_training_records`, no schema change): `healthkit_canonical_day_<domain>_<date>`, logical keys `activity_day|<date>` and `nutrition|<date>` (the Evidence store's own shapes, so a later promotion maps one to one). Each record keeps the current snapshot, a revision counter and semantic fingerprint (coverage participates), a revision history of superseded values, source observation ids, HealthKit provenance, the activation window it was written under, and a coexistence assessment.

Precedence is deterministic: `complete_day` outranks `partial_day`; within equal coverage from the same delivery device the newer device-scoped source revision wins; equal coverage from another device keeps the existing day; exact replay is a no-op; a snapshot that leaves values and coverage unchanged updates provenance without a new revision. A superseded snapshot stays raw and is marked so.

Activity canonicalizes only the approved metrics (`move_calories`, `exercise_minutes`, `stand_hours`, `steps`, `walking_running_distance`, `flights_climbed`); any other key is reported, not silently dropped or expanded. Workout calories are never added to the daily total.

Nutrition is a new observation type `nutrition_daily_total` (HealthKit daily statistics across all sources) for `calories`, `protein_g`, `carbs_g`, `fat_g` only; an unlisted nutrient is a contract violation. It uses the source-neutral NutritionDay semantics: a complete day is a `full_day_asserted` device aggregate (reliability high), a partial day is a low-reliability `partial_subtotal`; there are no meal objects and none are fabricated. Identity is source bundle, type, external id, delivery device, and device-scoped source revision, exactly like Activity summaries.

### Coexistence with screenshot and manual sources

During the proving period the Evidence store's screenshot/manual day remains the sole strategic authority and is never modified by HealthKit ingestion. The HealthKit canonical day is a separate record; ingestion records a coexistence assessment (`no_other_source`, `consistent`, `conflict_surfaced`, `other_source_not_comparable`) using the established Nutrition reconciliation tolerance (calories 25, protein/carbs/fat 2) and rounding-level Activity tolerance (move calories 1, exercise minutes 1, stand hours 0). A conflict beyond tolerance is surfaced with per-field deltas and both source identities; nothing is overwritten and no winner is applied. A partial HealthKit snapshot that trails a full-day source is reported, not a conflict. The audit recomputes the same assessment live.

### Strategic quarantine

`HealthKitEvidenceEligibilityPolicy` is the one explicit gate. `HEALTHKIT_STRATEGIC_EVIDENCE_ELIGIBLE` is a reviewed constant (false), not a setting. Canonical days carry `evidenceEligibility: { state: "quarantined", strategic: false }`. HealthKit-derived records are refused at both strategic Evidence write entry points (`upsertCanonicalDay` and the canonical Evidence package commit) with `HEALTHKIT_STRATEGIC_EVIDENCE_QUARANTINED`, including the legacy non-Native `activity-day.sync.v1` port whose default source was HealthKit. No V3, Confidence, Energy, briefing, Training, or Goal reader loads `healthKitCanonicalDays`. Promotion is a later change to that policy module, never an operator toggle.

## Workout boundary (dormant foundation)

HealthKit workouts remain source observations. Production Workout canonicalization is OFF: it needs its own server-owned policy record, `healthkit_workout_canonical_activation_policy` (schema `healthkit-workout-activation-policy-v1`, domain `workout` only, exact inclusive window of at most 3 local dates, quarantined, no backfill, `linkAutoConfirm` false). The record is independent of the Activity + Nutrition policy: separate id, separate window, separate audit rows, and the activation operation proves by digest that it never reads or writes the other. Like the daily policy it fails closed and never throws, and a raw workout stored before activation is never reconsidered (activate first, then sync).

```
HKWorkout -> Native observation (workout, activityType = numeric HKWorkoutActivityType raw value)
  -> healthkit.observations.ingest.v1 -> raw healthKitObservations row (immutable V1 identity)
  -> [policy on, inside window] canonical Apple workout (healthKitCanonicalWorkouts)
  -> strength: link candidate (healthKitWorkoutLinks)   cardio: coexistence note
  -> Evidence eligibility: quarantined (HealthKitEvidenceEligibilityPolicy)  -> V3 only after later authorization
```

Supported types: strength = traditionalStrengthTraining (50) and functionalStrengthTraining (20); cardio = walking (52), running (37), cycling (13), the types PhysiqueOS already models as cardio. Display names classify identically. Everything else stays a raw source observation, never guessed. (Native sends the numeric raw value, so the numeric form must classify like the name; before this foundation only names did.)

Identity and revisions. A first or unstated revision keeps the exact V1 observation identity; an optional `workout.sourceRevision` above 1 joins the identity so a revision is a new observation of the same source workout. The canonical record is keyed by a hash of source bundle and immutable HealthKit workout id (the private id is never stored or reported), so every revision resolves to one record. Identical replay is a no-op; a newer source revision advances the same record and keeps the prior telemetry in history; an older or equal revision never displaces a newer one. The effective local date comes from the workout's own start in its own time zone, never the client label or ingestion time. Deletion convergence is not part of the observation contract yet (Native keeps deletions deferred), so a removed or re-created HealthKit workout is a known follow-up, not silently handled.

Telemetry only. A canonical Apple workout carries start, end, duration, active and total calories, distance, average heart rate, source device and workout type; no raw heart-rate series and never exercises, sets, reps, or load. The Workout Logger remains the sole authority for training content. Workout energy is already inside Apple's daily active-energy total, so it is descriptive and never additive: the canonical day is never changed by workouts, and `composeDailyActiveEnergyWithWorkouts` adds nothing.

Strength link candidates. One deterministic Server-owned matcher reuses the existing same-workout semantics of `WorkoutDuplicateIdentityService` unchanged (confident at 80, possible at 50, five-minute temporal tolerance, no bare-filename identity): `confident_match` (one same-day session with real temporal overlap or an explicit source identity), `possible_match` (one session below the confident threshold), `ambiguous_multiple` (two or more plausible sessions, never linked) and `no_match`. Only a confident or possible single match produces a link record, and it is only a `candidate`; nothing is confirmed automatically (an explicit source identity already named by the Logger session is the one exception). A link records the Logger session id as training-content authority, the Apple workout as telemetry authority, who or what created it, and its status history; confirm, unlink and relink are state transitions that keep both records, with at most one confirmed link per side. Reassessment runs whenever a workout batch arrives while the policy is on, so a Logger session committed after the Apple workout still becomes a candidate, and a candidate the matcher no longer supports is released.

Cardio. One HealthKit workout maps idempotently to one canonical record. Coexistence with an existing Evidence workout (for example an Apple Fitness walk) is recorded, never merged, so the same physical workout is not counted twice.

Strategic quarantine holds for workouts exactly as for daily days: canonical workouts and links are quarantined, refused at the Evidence write boundary, absent from every strategic reader (pinned by the structural read-boundary test), and produce no Training performance events, PRs, Library records, or Goal changes.

## Storage and schema

Raw observations use the application-only `healthKitObservations` collection in the existing `canonical_training_records` JSON table. They are excluded from the canonical Founder runtime import/export inventory and from canonical Evidence reads.

The activation policies and their audit rows use the application-only `healthKitConfiguration` collection; canonical days, canonical workouts and workout links use `healthKitCanonicalDays`, `healthKitCanonicalWorkouts` and `healthKitWorkoutLinks`, all in that same generic table. There is no public activation command; see the gated operation above.

Founder-authenticated Native clients can read validation-only Activity observations through `/api/v1/native/read/healthkit-activity-canary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`. Both dates are required, inclusive, and limited to 31 local dates. The projection exposes normalized Activity values and bounded provenance only; it omits anchors and strategic fields and has no canonical authority.

Atomic `putIfAbsent` uses the existing primary key and `ON CONFLICT ... DO NOTHING`; a losing concurrent caller reads the existing immutable record and verifies its semantic fingerprint.

This foundation adds no table, column, index, migration, checkpoint table, infrastructure resource, SDK, or paid service. Current schema remains `000014_evidence_intake_text_provenance`.

## Deferred work

Background delivery, deletion/tombstone convergence for per-sample streams, sleep, cardio canonical commitment, explicit strength confirmation/link mutation, promotion of canonical days into strategic Evidence, and a broader activation window are later, separately authorized stages.
