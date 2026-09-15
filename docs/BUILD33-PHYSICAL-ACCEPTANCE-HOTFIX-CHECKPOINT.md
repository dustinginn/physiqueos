# Build 33 physical-acceptance hotfix checkpoint

2026-09-15. Physical acceptance FAILED. This checkpoint is not a release authorization.

## Authorities and boundaries

Native preflight: `222e402f3880050dabd6088a21b151d92e30eadc`, branch
`claude/native-v1-build33-operating-plan-notifications-training`, initially clean,
version 1.0 (33). Server preflight: `6728505dd3452f212bee585c5a550f3cb4c7867b`,
branch `claude/server-build33-operating-plan-notifications-training`, initially
clean except the preserved untracked `scripts/auditDexaConfirmationFailure.mjs`.

Generic server hotfix commit: `20239744fc690278fc76cca86526fc8b753f4836`.
The Native hotfix is committed on the same Native branch; its final SHA is
reported with the handoff rather than embedding a self-referential commit ID.

Production's last verified authority remains `6728505dd3452f212bee585c5a550f3cb4c7867b`,
deployment `d31fa175-9739-4613-ba26-ad81ddb4fdf1`, previously ACTIVE with exact web
and worker SHAs. No deployment was requested here. A fresh scoped doctl metadata
read returned an errors wrapper rather than a deployment record, so this run
does not independently refresh the source-hash proof. Public production live
and ready reads succeeded, with all eight readiness checks green. The known
stale embedded health build label is not source authority.

No production writes, catalog mutations, historical merges, draft deletions,
force confirmations, build-number changes, uploads, or authentication changes.
No HealthKit, Confidence V3, Narrative V3, Photos rework, or V3 plumbing changes.
Incremental recurring cost: $0.

## 1. Operating Plan failures — unresolved runtime causes

The Founder screenshot maps exactly to `OperatingPlanProtocolDomainView`'s
catch-all read failure. This is the initial shared protocol-domain roll-up,
not proof that an individual execution editor failed. Recovery, Peptides, and
Supplements each reach that screen and call:

`GET /api/v1/native/read/operating-plan-protocol-domain?protocolId=…`

The server owns the typed protocol destination and protocol ID. Native's
production adapter requests that resource and decodes
`OperatingPlanProtocolDomainReadModel`. Server selection is owner-scoped and
fails closed for unavailable or ambiguous execution relationships. Inspection
did not establish a routing/request defect, a decoding defect, or a specific
production record defect. The screenshot cannot distinguish HTTP status,
refresh failure, nullability, enum decoding, or another thrown read error.

| Domain | Proven observation | Root cause | Behavioral patch |
| --- | --- | --- | --- |
| Recovery | Initial protocol-domain read fails on device | Not yet proven | None guessed |
| Peptides | Initial protocol-domain read fails on device | Not yet proven | None guessed |
| Supplements | Initial protocol-domain read fails on device | Not yet proven | None guessed |

The existing individual read contracts remain unchanged: recurring support
uses executionId; peptide and supplement support use protocolId. Their
domain-specific revision/version and specialized completion semantics are
not weakened. No sandbox fallback was introduced.

Added local Release-visible engineering diagnostics distinguish HTTP read
status and decode classification (missing field, wrong type, unexpected null,
invalid value). Only allowlisted field names are logged; bodies, authorization
headers, tokens, query values, opaque IDs, and exception text are not logged.
These diagnostics are not normal Founder UI and are not yet on the shipped
Build 33 device. This instrumentation is not a root-cause claim or a deployed fix.

Required next evidence: authenticated GET status plus a safe error
classification/field shape for each failing protocol-domain request, using an
already approved product session, or corresponding read-only server error
telemetry. A session refresh failure must be separated from the resource read.

## 2. My Library — proven and patched

The daily Native Training Library read consumed the entire canonical catalog,
never applying the Logger's server-owned membership projection. Consequently,
Library and Logger could disagree: a working Library path displayed All
Exercises while Logger used `initialMyLibraryExerciseIds`. This was an
implementation inconsistency, not proof that the canonical union itself raced.

Changes:

- One server helper computes active, non-superseded Training history IDs UNION
  explicit memberships, deduplicated and sorted. Logger and a bounded internal
  membership read reuse it; no redundant performed-membership records.
- Existing Native `training-library` resource defaults to `libraryScope=my-library`.
  `libraryScope=all` is explicit. Both return required authoritative membership IDs.
  Missing/failed membership projection fails closed; it is never full-catalog fallback.
- Native defensively filters with those IDs, uses distinct cache keys for each
  scope, preserves All Exercises selection through typed area navigation, and
  provides an explicit Browse All Exercises/Show My Library control.
- Generation guards discard late responses from an older scope selection.
- Training commands already invalidate Library and Logger. Evidence confirmation
  now also invalidates Training membership/session projections, because confirmed
  Training evidence can add history or reconcile telemetry.
- Full-catalog exercise-detail lookup and duplicate checks remain full-catalog.

Tests cover derived + explicit membership, superseded history exclusion,
missing/failed projection, two scope cache keys, late All response after My
selection, typed area navigation, Logger membership, and evidence invalidation.
Determinism is proven in tests, not yet on the Founder production device.

## 3. Hyperextension Machine — authoritative category preserved

Canonical server `EXPLICIT_CANONICAL_EXERCISE_NAVIGATION_CATEGORIES` already maps
the existing Hyperextension Machine identity to Glutes. Native ignored that
navigation authority and derived its area from anatomical primary muscles;
Lower Back became Back. This is the proven presentation-layer defect.

Both server catalog read projections now expose `primaryNavigationCategory`
from the existing canonical navigation resolver. Native Library and Logger
consume that category rather than re-deriving placement from anatomy.

Hyperextension Machine navigation is Glutes in focused Library + Logger tests.
No canonical identity, muscle anatomy, historical exercise ID, set, performance
record, or stored catalog data changed. No broad recategorization was performed.

## 4. Workout Logger — proven provider collection-routing failure

The Founder screenshot appears before Logger entry/start. In shipped Build 33,
the exact phrase “PhysiqueOS is temporarily unavailable.” corresponds to the
HTTP 5xx error category. Bootstrap is one `training-logger` GET, with possible
existing authentication refresh. It is not a confirmation result.

`CORE_NAVIGATION_COLLECTIONS.trainingLogger` requests `myLibraryMemberships`,
but neither the canonical source inventory nor `PHASE4_DOMAIN_TABLES` registered
that collection. The real PostgreSQL read store throws
`Unsupported core navigation collection: myLibraryMemberships.` before SQL.
This deterministically breaks the provider Logger bootstrap even when there
are zero memberships. Mocked/repository acceptance did not exercise that map.

Before correction, a new test using the ACTUAL Logger collection list and real
PostgreSQL read-store implementation failed exactly at collection routing.
After correction it passes. The existing canonical Training table now owns
the optional collection. No schema/new table/backfill is needed. Required v2
source inventory is unchanged; old sources may omit optional membership.
Export validation and synthetic fixtures correctly separate required versus
optional collections. Explicit membership add/create commands now also have
valid canonical storage routing rather than an unsupported collection error.

Native startup failure copy is a friendly fixed message, not a raw exception.
No synchronous confirmation, idempotency, supporting-evidence, or downstream
orchestration boundary was changed. Workout logged STILL requires durable
canonical TrainingSession; the focused durability tests pass. Log's actual
`evidence-review-queue` cache invalidation remains intact.

Read-only paired-device inspection confirmed installed version 1.0 build 33.
Only the known production Logger draft preference key was inspected: no saved
production local draft was present at that snapshot. The copied preferences
were removed immediately. No credentials or other preference values were
inspected. This says nothing about an earlier draft, pending review, or canonical
object on the server. Those production objects and attempted request chronology
remain unaudited without authenticated read access. This failed open cannot
itself create a workout; no evidence was deleted or force-confirmed.

## 5. Sep 14 duplicate — exact records not yet accessible

Founder observation: two walks remain separate and two strength rows exist,
one with zero exercises and one with Quads/four exercises. This screenshot does
not prove canonical IDs, timing, Apple provenance, evidence linkage, telemetry
completeness, or whether both are active/non-superseded records.

Source proof: Build 33's narrow matcher is invoked during new Training
confirmation/canonicalization. Deployment does not revisit all historical
canonical records. Sep 14 predates deployment, so a historical omission is
plausible, but not confirmed for this particular pair. No Swift row hiding or
Sep 14 special case was added.

## 6. Historical candidates — audit prepared, NOT executed in production

No actual production candidate list is available. Do not interpret the
synthetic Sep 14 test label as Founder data. No private production fixtures
were imported into tests.

Added pure `auditHistoricalWorkoutLoggerApplePairs` accepts an explicitly
owner-scoped canonical read; it has no repository, write, scheduler, or sweep.
It uses the existing shape/compatibility matcher, excludes superseded records,
and requires uniqueness in BOTH directions. It reports deterministic candidates
and ambiguous exclusions with date, technical IDs, strength-candidate count,
exercise/set counts. Cardio and other owners stay outside the candidate set.

Required production read includes owner-scoped canonical Training payloads,
quality/supersession, source provenance, observed/start/end dates, exercise/set
structure, and linked evidence/source identity. Inspect all relevant historical
strength observations before asserting that Sep 14 is the only candidate.

If verified, proposed bounded mutation would reuse the canonical merge machinery,
preserve Logger exercise IDs/sets/variants/relationships and Apple telemetry,
retain evidence provenance, and supersede the duplicate canonical object. The
actual survivor/retired IDs and exact pair list must be presented FIRST, then
explicitly authorized. No manual or bulk reconciliation is currently authorized.

## 7. Forward proof and safety guards

The original matcher did not require positive Apple source provenance for its
exercise-less strength side, and did not require strength activity type for
its structured side. Synthetic counterexamples proved unrelated non-Apple
strength telemetry or exercise-bearing cardio could enter the narrow rule.
Guards now require Apple Watch/Health/Fitness provenance and strength on both
sides. Unknown source does not justify the narrow merge. The generic scorer
is retained; this is not a date/name-only rewrite.

Deterministic tests prove both confirmation orders, one active resulting
TrainingSession, telemetry (duration/calories/HR) and structured sets preserved,
superset relationships retained, idempotent replay with zero changes, ambiguous
same-day strength left unmerged, and cardio separated. Synthetic future-date
tests are distinct from the inaccessible historical production audit.

Workout Detail's approved telemetry-once/structured-exercises-once presentation
and suppression of generated duplicate exercise summaries remain unchanged.

## 8. Access dependency and next action

Normal product route uses the existing Native bearer session; access state is
in memory and refresh credentials are in iOS Keychain. No approved process-safe
bearer bridge is available here. A bounded unauthenticated production Logger
GET returned HTTP 401. Database URL presence checks were false; no credential
stores, tokens, cookies, or authorization headers were extracted or printed.

Minimum unresolved access is an EXISTING approved authenticated product read
path (or a trusted operator's sanitized read-only results), sufficient for:

1. Each failing protocol-domain GET's status/error/contract field shape.
2. Owner-scoped failed-attempt review/command/canonical chronology if it exists.
3. Owner-scoped historical canonical Training/evidence records for candidate audit.

Do not ask for a secret pasted into chat. Do not grant console/PAT permissions
automatically. Public healthy readiness is not a substitute for authenticated
domain acceptance. Founder screenshot evidence has narrowed the failed stage,
but not supplied the missing protected response or canonical records.

Server-first rollout is required if this hotfix is later authorized: the new
Native adapter requires the membership/category projection fields added by the
server hotfix. No Build 34 shipping is authorized at this checkpoint.

## 9. Validation

| Gate | Result |
| --- | --- |
| Native full unit suite, final cache correction included | 982/982 PASS |
| Five affected established Native UI journeys | 5/5 PASS (Simulator, not production physical proof) |
| Debug build | PASS (full unit/UI build) |
| Generic unsigned arm64 Release build | PASS |
| Focused server hotfix/Operating Plan/catalog/durability/reconciliation | 299/299 PASS, 17 files |
| Eight-domain Operating Plan acceptance inside focused suite | 10/10 PASS; not authenticated production acceptance |
| Broader Training regression | 151/151 PASS, 16 files |
| Canonical persistence/import regression | 109/109 PASS, 14 files |
| Foundation regression | 80/80 PASS, 10 files |
| Provider-mode server production build | PASS, 48 static build pages; dedicated validation output |
| Changed server files lint | PASS |
| Project generation twice | Identical hash, no generated project change |
| Release configuration | PASS, 1.0 (33), original bundle/team |
| Credential/private-key diff scan | PASS |
| Native/server diff checks | PASS |

Initial Native run had one stale test asserting shipped build 32; corrected to
current shipped build 33 and full rerun passed. Missing collection reproduction
was deliberately red before correction. Optional collection registration
initially exposed required/optional assumptions in export/synthetic validation;
those were corrected and both suites fully rerun. These were fix-time failures,
not hidden unrelated fixture baselines. Existing non-failing warnings remain:
deprecated Next middleware naming, LLDB version-store UI-test warning, and a
pre-existing unawaited assertion warning in phase4PersistenceSecurity.

## 10. Closeout and decision

Task-owned DerivedData, results, temporary test configs, and separate server
production build output may be removed after result summaries are recorded.
Build 29/30/31/32/33 archives and existing forensic artifacts remain preserved.
Initial available storage: approximately 17 GiB. Final free space is reported
with the handoff. Forensic script checksum remains
`5dc1bebf4153ad3518c0732b37b4b3e8b23f7f9c542518b570d1dcf68b210275`.

Validated generic fixes are ready for code review, but the COMPLETE five-defect
investigation is NOT complete. Recovery/Peptides/Supplements runtime causes and
Sep 14/historical candidates remain blocked on the bounded authenticated reads.
Do not claim physical acceptance or deploy/upload yet. Physical priority
notification delivery remains unproven. Running-app Review-ready fallback is
accepted V1; terminated-app delivery remains deferred and is not a blocker.
