# Package 4 — Nutrition, Activity, and Energy canonical integrity

## Authority and scope

Package 4 starts from `2cc0f4716652333d1cef624616ffd49cb1992ac4`, the
verified `origin/combined-app-platform-cutover` and deployed web/worker source
at the start of the package. It is server/backend-only. It does not change
Native Swift, calorie or activity targets, PI/Confidence semantics, persisted
Briefing interpretation, schema, infrastructure, or production data.

## Current write inventory

- General upload and screenshot intake enter as an Evidence Package and remain
  noncanonical until Evidence Review confirmation.
- Evidence Review confirmation is the live Nutrition/Activity canonical commit
  boundary. Review identity, package identity, source artifact identity, and
  canonical day identity remain separate.
- Training Logger may contribute Apple Fitness/Activity evidence through that
  same review boundary.
- The Nutrition day repair operation is a bounded historical repair path, not a
  second general logging authority.
- No live Native Nutrition or Activity provider write route exists yet.

No independent manual Activity database writer or active HealthKit batch route
was found. Package 4 therefore hardens the canonical server boundary for those
future adapters rather than inventing a new endpoint.

## Proven root causes

1. Activity used a stable date-shaped ID but had no centralized revision model,
   semantic fingerprint, correction history, or deterministic active-day reader.
2. A second same-value Activity source changed provenance and was treated as a
   full semantic change, so it could schedule duplicate Energy and Briefing work.
3. Nutrition had strong revision semantics, but a fresh same-value source could
   also be treated as a downstream semantic change because replacement scope was
   included in its audit fingerprint.
4. Activity source precedence existed as private logic inside generic evidence
   reconciliation rather than as a reusable canonical policy.
5. Timestamp-only Nutrition/Activity identity used string slicing in parts of
   the write path, which could assign an owner-local evening observation to the
   next UTC day.
6. Newly confirmed Nutrition/Activity records did not capture the shared
   Package 3 Goal/Phase chronology; corrections consequently had no explicit
   frozen attribution to preserve.
7. Energy selected explicit Nutrition revisions but accepted Activity inputs in
   caller order, allowing legacy duplicate days to resolve differently by
   surface.

## Canonical rules

### Nutrition

There is one active day per owner and intended local date. The stable new-record
ID is `nutrition|<date>|nutrition-day`; a legacy ID remains the lineage anchor
when already present. Meals remain separate child identities. Full-day
snapshots replace the day, matching meal corrections replace only that meal,
and distinct meals require explicit additive intent. Same-value submissions may
add provenance but do not advance the revision or enqueue continuations.

### Activity

There is one active aggregate per owner and intended local date with stable ID
`activity_day|<date>`. Workouts and source artifacts remain distinct and are
referenced. Source authority is, in order: direct Apple Health/HealthKit, Apple
Fitness, manual/typed/correction, voice, unknown. Higher-authority populated
values win; lower-authority evidence may fill gaps. Same- or higher-authority
explicit correction can revise a value. Real semantic changes create one
revision snapshot; exact replay is byte-stable; same-value new provenance does
not advance the semantic revision.

### Date and attribution

An explicit intended local date wins. Otherwise the source timestamp is mapped
through its declared time zone, defaulting to `America/Los_Angeles`. Ingestion
time is never evidence time. New records use the Package 3 canonical Goal/Phase
resolver at that date. Existing `goalId`/`phaseId` values are frozen on every
later correction.

### Energy and continuations

Energy remains a derived read model: canonical Nutrition calories plus canonical
Activity active calories plus the accepted historically applicable DEXA RMR.
Zero is observed evidence; missing is unavailable evidence. Date windows are
inclusive and deterministic. Nutrition and Activity corrections flow through
the selected active revision. Persisted Briefings remain frozen.

Canonical persistence may retain a new source's provenance even when values are
unchanged. Downstream Energy, Confidence-input, and Briefing work is staged only
for semantic changes. Exact retry or same-value provenance does not duplicate
continuations; a real correction stages one new source link. The existing
owner-scoped PostgreSQL transaction and advisory lock remain the concurrency
boundary.

## Native readiness

The domain boundary is suitable for later Native Nutrition daily writes,
Nutrition corrections, Activity daily aggregate sync, and Energy reads without
reimplementing precedence or day identity in Swift. Native must send intended
date/time-zone and stable source provenance.

Remaining API work is explicit and separate: the current versioned Native API
does not yet expose general Nutrition day write/correction, Activity daily
read/sync, HealthKit checkpoint/deletion reconciliation, Energy Evidence read,
or Evidence Review confirmation contracts. Package 4 adds no speculative route.
