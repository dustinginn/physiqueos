# Build 33 physical-acceptance hotfix checkpoint

2026-09-15. Physical acceptance FAILED. This checkpoint is not a release authorization.

## Current decision — production investigation completed

The **PC production findings and final candidate** section below supersedes the
earlier unresolved-access, unknown-candidate, and not-yet-implemented statements.
The Founder supplied authoritative sanitized PC SQL/log findings; no additional
Mac production access, credentials, permissions, or production writes were used.
The generic candidate is ready for review, not deployed or physically accepted.
Native remains 1.0 (33); Build 34 has not been created.

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

## Read-only audit-context follow-up

The follow-up starts from Native `aca0c8b756b4bb29876aa63a37fbad2d0b25d90d`
and server `20239744fc690278fc76cca86526fc8b753f4836`, with clean worktrees
except the preserved server forensic script. The three proven hotfixes remain
unchanged. Only documentation changed in this follow-up; no production records
were copied into fixtures or diagnostic files.

Every DigitalOcean network read used the explicit `physiqueos-audit` context.
No default/global context was switched and the dead deploy context was not used.

### Fresh authority proof

App list and deployment metadata reads succeeded. Production is ACTIVE at
deployment `d31fa175-9739-4613-ba26-ad81ddb4fdf1`, 9/9 successful steps, exact
web and worker `source_commit_hash`:
`6728505dd3452f212bee585c5a550f3cb4c7867b`. This supersedes the earlier inability
to refresh deployment metadata; the embedded health identity is still ignored.

### Safe production log findings

A bounded 200-line web run-log read provides actual server evidence:

- `core.navigation.operating-plan-protocol-domain` is followed by HTTP 500,
  `INTERNAL_ERROR`, error class `RangeError`, at 2026-09-15T14:10:41.471Z and
  2026-09-15T14:29:53.959Z.
- Logger reads fail with HTTP 500 and error class `Error`, including
  2026-09-15T14:29:20.514Z, consistent with the proven collection-routing defect.
- Access-token expiry 401 entries also exist, but subsequent reads enter the
  domain service and fail with 500. This is not evidence that the demonstrated
  protocol-domain failure is simply missing authentication.

The structured logger intentionally redacts exception messages. It does not
include the protocolId in these failure records, so the available logs cannot
independently assign a precise input/error to Recovery versus Peptides versus
Supplements. No headers, tokens, cookies, or raw evidence contents were emitted.

The demonstrated roll-up failure is server-side before successful HTTP
serialization, not Native decoding. `getOperatingPlanProtocolDomain` passes
the owner's raw timezone into `getLocalDateKey`; an invalid timezone can cause
the observed `RangeError`. The existing `resolveLocalTimeZone` would normalize
invalid input, but the production owner timezone has NOT been read. This is a
specific hypothesis to test, not a proven input defect or a reason to guess a
new patch. Neither legacy data nor canonical validation was changed.

### Database inspection versus SQL authentication

Database list identifies the existing PostgreSQL cluster
`f544596d-594e-4aa4-a0a8-533bda0992c6` as online. Connection and existing-role
metadata reads are allowed. However:

- Connection response fields are protocol, URI, database, host, port, and SSL.
- It supplies neither a username nor a password; its URI also has neither.
- Existing roles are visible but have no supplied password.

No connection URI, password, or token value was printed. No configuration,
role, firewall, permission, console, or authentication mutation was attempted.
Inspection permission therefore does not provide a usable authenticated SQL
reader in this process. No broader DigitalOcean permission is requested.

### Exact reads still blocked

An existing approved SQL reader or a trusted operator's sanitized read-only
results are required. These are the missing business reads, not additional
DigitalOcean configuration operations:

1. Founder canonical user timezone plus owner-scoped current recovery/peptide/
   supplement protocol and current-version rows, linked execution rows,
   relevant reminders, and lifecycle/revision fields. Execute the canonical
   roll-up against that bounded snapshot with writes prohibited by PostgreSQL.
2. Founder canonical Training records (including quality/supersession and
   provenance) and linked observations for Sep 14 and the active historical
   candidate scan. No cardio mutation; only read cardio context when needed
   to demonstrate separation.
3. Founder Logger-related intake/review/command receipts around the failed
   attempts, to distinguish an earlier pending object from a failed bootstrap.

Until those reads are available, exact root causes for each Operating Plan
domain, Sep 14 identities/chronology, full historical candidate counts, and
failed-attempt server objects remain unresolved. Candidate count is UNKNOWN,
not zero. A screenshot plus metadata cannot replace canonical record inspection.

### Proposed one-time reconciliation design — not implemented or executed

After an actual candidate preview exists:

1. READ ONLY / REPEATABLE READ preview runs the pure owner-scoped audit helper
   and emits every eligible pair, every ambiguous exclusion, record versions,
   payload digests, field-preservation summary, and before/after active counts.
2. Founder explicitly authorizes that exact candidate list. A mutation must not
   accept new candidates discovered after authorization.
3. An owner-fenced PostgreSQL transaction locks the candidate records, re-reads
   current active Training context, and revalidates unchanged versions/digests,
   both-direction uniqueness, provenance, temporal/context compatibility, and
   non-supersession. Any mismatch rolls back rather than guessing.
4. Reuse the canonical forward merge transition; if it is not separately
   callable for existing records, extract that transition with characterization
   tests instead of fabricating a confirmation event or duplicating merge code.
   Preview determines exact survivor/retired identities before authorization.
5. Preserve structured exercises/sets/loads/variants/relationships and Apple
   telemetry, all evidence provenance, existing performance linkage, and
   supersession history. Recompute only affected canonical derived projections
   through established idempotent mechanisms, proving no duplicated Activity
   calories or Training volume/performance events.
6. A stable owner + authorized-pair + digest identity makes replay return the
   existing reconciliation result. Before/after record IDs and counts are
   recorded atomically. Already reconciled pairs are safe no-ops; ambiguous
   pairs never mutate. Any failure rolls back the complete transaction.

This is a design requiring actual preview data and focused implementation tests,
not a claim that a write-ready production repair has been built.

### Follow-up validation and decision

No behavioral source changed, so the prior 982 Native unit / 5 UI / 299 focused
server / 151 Training / 109 persistence / 80 foundation and build results remain
the validation of the exact preserved hotfix source. Documentation diff checks
and authority/worktree checks are repeated at closeout. No expensive suite is
presented as freshly rerun in this documentation-only follow-up.

One coherent Build 34 release candidate is NOT yet ready: protected canonical
reads are still necessary to finish diagnosis. Native remains 1.0 (33), no
deployment/upload occurred, and production data remains untouched.

## PC production findings and final candidate

### Authority and evidence provenance

This continuation verified clean Native
`bcdae2c4a2ea0d58c2449109e65a168d77c345f7` and server
`20239744fc690278fc76cca86526fc8b753f4836` on the existing Build 33 branches,
except the untouched pre-existing server forensic script. Final server candidate:
`2d0d8818db9e6b6f911348c3d0c93df400c0c63c`. Native behavioral source is unchanged
in this continuation; its documentation-only candidate SHA is reported at handoff.
Production remains the Founder/PC-verified Build 33 server
`6728505dd3452f212bee585c5a550f3cb4c7867b`, deployment
`d31fa175-9739-4613-ba26-ad81ddb4fdf1`. No Mac production commands were needed.

The approved PC read-only application-console path is documented for future
reference, NOT reproduced on Mac: repository
`C:\Users\dusti\Documents\GitHub\physiqueos`, runner
`.tmp/digitalocean/run-app-console-context-gzip-source-on-open.mjs`, explicit
context `physiqueos-final-cutover-config`, historically app
`bf57cf56-48cc-4cd6-90e4-a23ee5381741`, component `web`. Future use must reverify
authority, run `BEGIN READ ONLY`, verify `transaction_read_only = on`, and stop
on 401/403 or unavailable binding. This reference grants no deployment, write,
replay, benchmarking, or PI/OpenAI authorization; credentials must never be exposed.

### Recovery, Peptides, Supplements — one proven shared root cause

The production owner has no `timeZone` key and has `timezone: null`. The deployed
roll-up passes `user?.timeZone ?? user?.timezone` directly into `getLocalDateKey`.
That evaluates to **null**, not undefined. The helper's default parameter does
not apply to null, reproducing `RangeError: Invalid time zone specified: null`.
Production logs show the database read succeeds before date composition throws
and HTTP serialization returns 500. This is a shared server initial-roll-up
defect, not three Native decoder or editor defects.

The candidate uses the EXISTING `resolveLocalTimeZone` before date formatting
in the protocol-domain reader, peptide support detail, supplement create-editor
default date, and Logger initial date. The reader does not hardcode a zone or
invent fallback semantics. Existing resolver behavior preserves valid IANA zones
and resolves absent/null/invalid values through the canonical fallback (which
resolves this owner to America/Los_Angeles). No user/reminder records are rewritten.

| Domain | Authoritative production shape | Correction and protection |
| --- | --- | --- |
| Recovery | Active Foam Rolling execution revision 3; daily, start Sep 14, 08:40, no end; reminder 08:40, timezone null; older root 17:00 | Shared timezone resolution; current execution/reminder stay authoritative; older root untouched |
| Peptides | Linked active Retatrutide/Tesamorelin roots and executions, revision 4; Thursday / Sunday–Thursday at 21:45; reminder zones null | Shared resolution also used by peptide detail; dosing/timeline/concurrency/specialized completion unchanged |
| Supplements | Four active roots: Tongkat Ali, Fadogia Agrestis, Multivitamin, Electrolytes; executions revision 1; morning/daypart and empty daily start dates; Fadogia every other day starting July 25 | Legacy canonical schedule representations accepted, not normalized; support/strategy/lifecycle writes unchanged |

Deterministic synthetic regression tests cover six owner shapes across ALL EIGHT
domain reads: valid IANA, missing keys, explicit undefined, exact absent `timeZone`
plus null `timezone`, both null, and invalid-zone canonical fallback. Reminder
timezone null is included. Separate tests characterize Recovery's old-root/current
execution difference, both peptide schedules, and four legacy supplement daypart
shapes. Serialized runtime state is unchanged by each read. Energy stays read-only;
all editable domains retain their existing concurrency and atomic write boundary.
No sandbox fallback or raw error presentation was added.

### Shared Web/Native Logger, My Library, category

PC logs confirm `Unsupported core navigation collection: myLibraryMemberships`
fails BEFORE SQL for both Web and Native Logger. The existing candidate's optional
registration in the canonical Training table fixes their shared
`getTrainingLogger()` path. No schema, backfill, Web workaround, or alternate
catalog semantics. Real-provider collection-list and Web integration tests pass.
Durable synchronous Training canonical_commit, asynchronous downstream work,
non-Training confirmation semantics, and actual Log cache invalidation remain intact.

The previous My Library/category fixes are preserved unchanged: active performed
history UNION explicit memberships, required projection, My Library default,
explicit All Exercises, separate cache keys, stale-response generation guards,
Training/evidence invalidation, and no full-catalog error fallback. Tests cover
initial load, cache/scope isolation, errors, late responses, scope switches,
membership addition, and returning from Training confirmation. Canonical full-
catalog duplicate prevention remains intact.

Hyperextension Machine uses the server's existing **Glutes navigation category**,
not Lower Back anatomical derivation. Identity, exercise history, and performance
history are unchanged. Library/Logger focused navigation assertions pass.

### Failed September 15 attempt — no production cleanup

Within the Founder-local Sep 15 PC audit window: no new canonical TrainingSession,
Training command receipt, Training package/review, or evidence intake receipt.
Only unrelated Morning Check-In and Nutrition/Activity evidence was present.
The bootstrap failure therefore did not reach a server-side Training confirmation.
No delete, force-confirm, replay, or cleanup is required. Local-only Native draft
state at the failed attempt remains unknowable from these server findings.

### Exact historical one-pair preview — not executed

Technical identities below are engineering-only, never normal Founder UI:

- Surviving structured record:
  `training|authoritative|training_logger_draft_A5936FA6-FEE7-4BAA-9D84-9E0034BDC8A6`.
  Sep 14, Manual / Training Logger; four exercises, 16 performed sets; no workout
  window/calories/HR or Apple UUID. Identities: `leg_press_feet_middle`,
  `pendulum_squat_machine`, `leg_extension`, `sissy_squat`.
- Record proposed for supersession:
  `training|authoritative|evidence_submission_9B9B0363B6E34A599A1DF27070FA23D4_images_file_2`.
  Sep 14, Screenshot / Apple Fitness; zero exercises; 07:45–08:44,
  **3518 seconds**, **438 active calories**, **121 average HR**; no Apple UUID.

Both are active, unsuperseded, same owner/local date/frozen Goal/Phase, exactly
one eligible counterpart in EACH direction. Structured exercises without a window
and positive Apple empty-strength telemetry provide the complementary shape;
matching is not same-day + strength alone. The two Outdoor Walks remain separate.
Publication predates the Build 33 matcher: **historical omission**, NOT a forward
matcher defect. No Sep-14/date/ID/exercise-specific domain branch was added.

Complete PC audit: 217 Training records, 211 active, 6 superseded, 69 active dates
from July 4–Sep 14. **Exactly ONE deterministic pair, above; no other pair qualifies.**

| Excluded set | Reason |
| --- | --- |
| 37 dates: July 4–19, July 21–31, August 1–10 | Structured records have no eligible open Apple strength telemetry counterpart |
| 31 dates: August 11–September 4, September 8–13 | Structured records already have workout windows; not the open complementary shape |
| July 9, included in the earlier date set | Two structured sessions, no eligible telemetry; no inferred match |
| 140 active cardio/other observations | Outside narrow strength reconciliation |
| 6 superseded rows | Excluded; never resurrected |

There is no additional eligible empty strength observation and no eligible
ambiguous pair to mutate. Generic competing-strength and attribution-mismatch
tests explicitly exclude ambiguous candidates.

Expected preview, using the authoritative findings (NOT a newly run SQL preview):

| Assertion | Before → after |
| --- | --- |
| Deterministic candidate count | 1 |
| Total canonical Training records | 217 → 217 |
| Active / superseded Training | 211 / 6 → 210 / 7 |
| Sep 14 Training rows | 4 → 3; two walks and one unified strength session |
| Exercises / performed sets | 4 / 16 → 4 / 16, exact canonical IDs, loads/reps/relationships preserved |
| Goal/Phase, Logger identity and performance anchors | Unchanged |
| Apple workout window / duration / calories / average HR | 07:45–08:44 / 3518 / 438 / 121 preserved, no recalculated duration |
| Sep 14 workout calories | 438 + 84 + 105 = 627 → 627 |
| Daily Activity move calories / non-workout calculation | Unchanged; no extra 438 added |
| Evidence provenance | Both Logger and Apple screenshot retained |
| Replay | No-op, no new Training/performance events or owner revision bump |
| Review state | Untouched |

The actual canonical DB versions/digests were not included in the sanitized
handoff (review version 19 is NOT a canonical record version). A fresh approved
PC READ ONLY preview must seal the current full owner Training/Activity snapshot
before execution. No fake production hashes/versions or private fixtures are used.

### Generic historical mechanism and atomicity

`src/application/training/HistoricalTrainingReconciliationService.js` exports a
pure manifest preview and an engineering-only PostgreSQL reconciler accepting an
EXISTING injected pool and EXPLICIT owner. No HTTP endpoint, scheduler, credential
discovery, automatic execution, or implicit production connection.

Preview starts REPEATABLE READ / READ ONLY, verifies `transaction_read_only = on`,
reads owner-scoped canonical Training/Activity records, reports explicit pair IDs,
preservation/calorie/count assertions, and seals DB versions plus payload digests.
Execution requires an intact approved preview and separate explicit authorization.
It starts SERIALIZABLE, uses the established owner advisory fence, locks/re-reads
the owner context, revalidates the exact snapshot/digest and both-direction unique
compatibility, and updates only changed canonical records with version predicates.
Owner runtime revision advances atomically; any failure rolls everything back.
An atomic marker on the retired record makes exact approved replay a no-op.

`reconcileHistoricalWorkoutLoggerApplePair` reuses EXISTING canonical payload,
provenance, supersession, and Activity reconciliation functions. Structured
canonical/payload identity and exact exercises/relationships/frozen attribution
are retained, protecting performance/progression anchors. Apple telemetry is
merged into that survivor; Apple observation becomes superseded. Activity totals
use active canonical sessions and replace the retired strength reference, not
add calories. Cardio and superseded history are unchanged. No review, command,
performance, or progression records are rewritten or replayed.

The module successfully bundles as engineering Node CJS and runs a disconnected
synthetic preview smoke. For future authorized PC use, bundle source from the
exact reviewed candidate and inject the existing component binding; this does
not replicate access on Mac or independently authorize executing the write path.

### Sep 14 review anomaly — keep separate and untouched

Authoritative PC finding: structured review remains `committing`, DB version 19,
without completed confirmation, despite durable canonical Training. Existing
`EvidenceCanonicalCommitRecoveryService` can prove canonical durability only
after validating claim/progress/lease/identity and complete canonical coverage.
`EvidenceReviewService.finalizeCommit` requires the entire post-confirmation step
order, not simply an existing TrainingSession. Status/version alone cannot prove
all downstream work finished or justify synthetic completion.

Recommendation: LEAVE the historical review unchanged in this merge. Canonical
Training reconciliation does not require a lifecycle repair. No original
confirmation replay or new TrainingSession. If Founder later requests lifecycle
repair, first obtain a SEPARATE bounded read-only claim/progress/outbox/step-receipt
preview and use the existing proven recovery/continuation semantics; do not mark
complete or replay canonicalization from these incomplete facts. No speculative
review mutation is bundled into this candidate.

### Final fresh validation

| Gate | Result |
| --- | --- |
| Full Native units | 982/982 PASS |
| Affected Native UI journeys | 5/5 PASS, no skipped tests; Simulator, not physical proof |
| Debug build | PASS through unit/UI builds |
| Generic unsigned arm64 Release | PASS |
| Focused fixture-independent server hotfix suite | 356/356 PASS, 23 files |
| Operating Plan all-eight reads, six timezone shapes / legacy schedule tests | PASS inside focused suite |
| Historical preview/transaction/rollback/digest/owner/ambiguity tests | 9/9 PASS, synthetic database boundary |
| Broader Training regression | 151/151 PASS, 16 files |
| Canonical persistence regression | 109/109 PASS, 14 files |
| Foundation and transport regression | 36/36 + 80/80 PASS |
| Changed-file lint / credential scan / diff checks | PASS |
| Deterministic generation twice / release configuration | PASS, no generated-file change, 1.0 (33), original bundle/team |
| Provider-mode production server build | PASS at exact server candidate 2d0d8818; 48 static build pages, isolated validation output |

Expanded Workout Detail navigation run: 17 tests passed; one unchanged test fails
ENOENT because `private/founder/runtime-store.json` is absent. The test file is
unchanged from production authority and this is the established missing-private-
fixture baseline, not hidden or replaced with imported production data. Approved
unified Workout Detail is also covered by passing Native units and affected UI.
An initial UI invocation used an incorrect class selector and was interrupted;
the corrected `TrainingAcceptanceUITests` run actually executed all five journeys
and passed. Existing LLDB-version and Next middleware warnings are non-failing.

### Documentation implications and proposed authorized sequence

After Build 34 Founder acceptance, update canonical server `docs/ARCHITECTURE.md`
and `docs/DECISIONS.md` for canonical timezone resolution at read-composition
boundaries and explicit owner-fenced, version/digest-sealed historical canonical
repair. Document the reconciler's source location there; no existing
`docs/CODEBASE_MAP.md` exists in either worktree, so no fictional map is referenced.
This checkpoint flags those durable decisions; the broader architecture
documentation project is intentionally deferred.

1. Founder reviews final Native/server candidate and this exact one-pair preview.
2. Only after explicit deployment authorization: reverify production/current
   branch authorities and deploy the exact server candidate using the established
   mechanism, without spec/infrastructure changes. Verify exact web/worker hashes
   and live/ready. Read-only acceptance must cover BOTH Web and Native Logger,
   all eight Operating Plan reads, canonical My Library and navigation category.
3. Only after explicit ONE-PAIR mutation authorization: approved PC operator
   obtains fresh READ ONLY sealed preview. If candidate scope/context differs,
   STOP for review. Execute only that intact manifest transactionally; verify
   211→210 active Training, exact survivor/retired IDs, structure/provenance,
   unchanged 627 workout calories and both walks, and safe replay. Review stays
   untouched. Authorization for deployment does not imply authorization to merge.
4. Only after separate shipping authorization: deterministic build 33→34 bump,
   shipping-only commit, archive preserving Builds 29–33, Xcode/TestFlight upload,
   then Founder physical acceptance. No build bump/upload was performed here.

Physical Actionable Priority Notification delivery remains UNPROVEN. Running-app
Review-ready fallback remains accepted V1; terminated-app delivery is deferred,
not a Build 34 hotfix blocker. Nothing deployed, reconciled, repaired, or mutated.
