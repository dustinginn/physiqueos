# Build 34 historical repair helper correction

2026-09-15. Engineering checkpoint, NOT production mutation authorization.
Production hotfix/read acceptance at `2d0d8818db9e6b6f911348c3d0c93df400c0c63c`
and deployment `a81ed25f-8e84-4ab8-a37e-6580abc0730d` are accepted from the
Founder/PC handoff. No Mac production SQL/access was attempted in this task.
Native remains unchanged at `3366d222b9f4708314abd84dc34e12a7072a03cb`, 1.0 (33).

## Persisted and domain identities are independent

Source proof:

- `src/platform/migration/phase4CanonicalImport.js`: `upsertRecord` uses
  `resolveRecordId(record, position)`, which selects top-level id/package_id/
  review_id, otherwise `@index:position`; it does NOT select canonicalId.
- `src/platform/database/PostgresFounderRepositoryFacade.js`: `replaceCollection`
  uses the same identity rule, addresses rows by owner + collection + record_id,
  retains source_ordinal, and stores the full canonical object in JSON payload.
- `src/platform/database/Phase4CanonicalRecordStore.js`: `get`/`put` use the
  EXPLICIT caller-provided recordId. ExpectedVersion fences that DB row; put
  advances the payload and DB version together. Some newer Native canonical-day
  callers pass a canonicalId as recordId; this is a caller convention, not a
  universal guarantee that legacy storage keys equal domain IDs. The in-memory
  store's fallback also selects canonicalId, illustrating why a mock-only
  equality assumption did not characterize the legacy production facade.
- `src/data/repositories/CanonicalEvidenceRepository.js` and
  `src/domain/services/CanonicalEvidenceService.js`: canonical lookup, merge,
  source/evidence provenance, and supersededBy use canonical DOMAIN identities.
- Migration reference indexing explicitly distinguishes ordinal keys from
  stable IDs (`phase7bWorkPackage2ReferenceIndex.js`). A persisted ordinal must
  never be regenerated for a targeted repair; use the key read from the DB.

The old helper wrongly required recordId == payload.canonicalId, then used that
same conflation for update selection and replay lookup. Production's legitimate
legacy keys therefore failed before preview. No production-key migration is needed.

## V2 fencing and generic correction

`HistoricalTrainingReconciliationService.js` now validates/seals BOTH identities:
persisted recordId, payload canonicalId, database owner, payload owner, collection,
safe integer DB version, full canonical-payload digest, record type, independent
DB/canonical status, supersededBy, and source identity. Storage keys AND canonical
IDs must each be unique in the snapshot. No @index-specific/date/Founder branches.

The manifest schema is `historical-training-preview-v2`; v1 is rejected even if
self-sealed. Pair entries carry survivorId/retiredId (domain) plus survivorRecord/
retiredRecord (full independently sealed storage identities). Snapshot covers the
bounded owner's entire Training/Activity context so a competing counterpart or
changed related Activity state cannot slip through.

Preview uses REPEATABLE READ / READ ONLY and verifies transaction_read_only=on.
Execute remains separate and explicit: SERIALIZABLE + established owner advisory
fence + FOR UPDATE context reload + exact v2 manifest/digest revalidation. SQL
UPDATE predicates include owner/collection, actual stored key, expected DB version,
AND canonical payload ID. Full-payload digest was revalidated under those locks.
Payload/DB versions advance together; merged provenance column stays aligned.
Storage key, source_ordinal, source_identity, and record cardinality are not changed.
The atomic replay marker names both domain and persisted survivor/retired IDs;
replay verifies those independent identities and makes no additional writes.
Canonical payload/provenance/supersession/Activity merge logic and forward matcher
are unchanged. Review, walks, catalog, performance/progression records stay outside
the write set; only the two Training rows and changed existing same-date Activity
rows are eligible, as explicitly listed in the new preview.

## Actual Activity consequence, not a forced constant

`CanonicalEvidenceService.js`'s `reconcileActivityDaysWithTrainingSessions`:

1. Excludes superseded canonical objects and groups ALL active Training payloads
   by the existing observed_at date-key rule. It does not restrict to strength.
2. Sums finite metadata.active_calories across those canonical sessions.
3. Leaves daily_activity.move_calories and all daily observations unchanged.
4. Sets workout_active_calories to that sum; non_workout_active_calories to
   max(0, move_calories - sum), with the existing missing-value behavior.
5. Replaces training_session_ids with unique canonical DOMAIN IDs and sets
   training_sessions_referenced to active session count (including walks).

The supplied production shape is persisted zero-derived state, not a populated
627-calorie projection. Its zero/empty references establish stale or unreconciled
derived state under today's semantics, but do NOT alone prove which historical
writer/event left it that way. Do not infer a specific lost event from these fields.

For the four known Sep 14 active records, canonical Training sum before merge is
438 + 84 + 105 = 627; the structured side has no calories. After superseding the
Apple-only side and moving its telemetry into the structured survivor, the sum
remains 627. This is calculated by generic source semantics, not a date constant.

| Affected Activity field | Actual persisted before | Proposed canonical refresh after |
| --- | --- | --- |
| move_calories | 948 | 948 |
| workout_active_calories | 0 | 627 |
| non_workout_active_calories | 948 | 321 |
| training_sessions_referenced | 0 | 3 |
| training_session_ids | [] | Structured survivor + both walk canonical IDs |

The old assertion that persisted workout calories were already 627 was INVALID.
The computed post-repair 627 remains correct for the supplied active Training set.
This targeted refresh of EXISTING Activity rows on a repaired pair's date is the
same canonical consequence as forward reconciliation, not all-history normalization.
It IS a separately exposed consequence requiring review of the new preview;
earlier conditional authorization predicated on unchanged persisted 627 must not
be reused. No mutation is authorized/executed in this task.

V2 explicitly carries activityChanges: sealed Activity storage/domain identity,
full before/after daily observations, derived metrics, references, semantic
fingerprint, and a consequence label. Canonical Activity semantic fingerprint
(`CanonicalActivityDayService.js`) covers date + daily observations, not these
derived/reference fields. Those observations/fingerprint/revision remain unchanged;
the DB resource version advances. Preview rejects changed observed Activity or a
change to the pre/post canonical Training calorie sum. It never creates Activity
rows or normalizes other dates. If Founder instead requests Training-only repair
with Activity preserved, that must be reviewed as a different plan; this mechanism
currently previews the explicit current-canonical same-date refresh, not a hidden
preserve/normalize toggle.

## PC requirements for a NEW sealed READ ONLY preview

1. Obtain this exact reviewed helper commit/bundle; do not use deployed v1 or
   treat the supplied evidence digest `234bcad6…` as executable authorization.
   Reverify production web/worker remain the accepted authority before access.
2. Use ONLY the established approved PC application-console READ ONLY path,
   consuming its existing DB/CA binding internally. Do not reproduce on Mac,
   discover/export credentials, or repurpose this READ ONLY authorization for writes.
3. Run preview: BEGIN REPEATABLE READ READ ONLY, verify transaction_read_only=on,
   owner-scoped canonicalEvidenceObjects Training/Activity SELECT. SQL loader reads
   record_id,version,payload,owner_user_id,collection_name,status,source_identity.
   The pure input contract uses recordId,version,payload,ownerUserId,collectionName,
   databaseStatus,sourceIdentity. Always preserve real DB keys; never infer them.
4. Review v2: candidate count 1, eligible ambiguity count 0; exact Sep 14 domain
   survivor/retired IDs already reviewed, persisted keys @index:507/@index:509,
   expected DB versions 4/3, corresponding full payload digests from the current
   handoff if unchanged. Related Activity key @index:512, DB version 1, current
   digest if unchanged. No stale digest substitutes for a new DB read.
5. Validate current owner/frozen Goal/Phase, active/non-superseded state, both-
   direction uniqueness, four exercise IDs and 16 performed sets, exact preserved
   loads/reps/relationships and both provenances, literal 07:45–08:44, duration
   3518, calories 438, HR 121, both walks, and current Activity 948/0/948/0/empty.
6. Manifest must expose Training 211→210 active, total 217 unchanged; raw Training
   workout sum 627→627; Activity derived refresh 0/948→627/321 with three domain
   session references and unchanged move observations/revision. Any deviation
   from these reviewed facts or any additional write set requires STOP/review.
7. Return the COMPLETE v2 manifest and its NEW digest to Founder for authorization
   of this changed Activity consequence. Later execution must accept that intact
   manifest only and recompute/revalidate under transaction locks immediately
   before mutation. Never execute from the current evidence digest or from this
   engineering expectation table. The committing review/version 19 stays untouched.

## Deployment and Native shipping decision

No product read/command/forward-matcher code changed here. The engineering-only
module bundles successfully for the existing source-carrying PC runner; a reviewed
bundle can generate v2 preview against the accepted deployment without another
application deployment. Later authorized repair also needs the corrected reviewed
helper, not deployed v1; delivering the helper as an engineering bundle is
technically sufficient, but this does NOT establish or authorize a mutation access
path. An operator that insists on importing the deployed file would need its tool
source updated first. No deployment is performed or implicitly authorized here.

Native correctness is technically separable from this historical pair: the live
server already exposes accepted Operating Plan/Logger/My Library/category contracts.
The Native hotfix can ship independently; Sep 14 will still show two strength rows
until canonical data repair, a known historical correction rather than a Native
bootstrap/decoder/forward-logger release defect. Previous shipping authorization
was CONDITIONAL on completed repair. Founder must explicitly approve shipping
despite the deferred repair before build bump/archive/upload. None occurred here.

## Validation and durable documentation flag

- Focused helper/merge/Activity/provider/Operating Plan/durability: 132/132 PASS,
  9 files, including 25/25 historical-helper tests. Realistic distinct @index keys,
  literal local clocks, zero-derived 948 Activity, SQL dual identity/version fences,
  stale key/ID/version/digest/owner/status/type/source/Activity, duplicate rejection,
  rollback, safe replay, ambiguity, provenance, relationships and cardio preserved.
- Canonical persistence 109/109 PASS; Training regression 151/151 PASS.
- Broader facade run: 17/18 PASS; unchanged synthetic Weight Progress composite
  fails RangeError Invalid time value at ProgressReportingService shiftIsoDate.
  Reproduced in isolation without helper tests running. Facade/test/Weight source
  files are unchanged from accepted production; no unrelated fix is mixed in.
- Changed-file lint, diff checks, credential scan and engineering bundle smoke
  results are reported at final handoff. No new Native source/project changed,
  so expensive Native builds/unit/UI validation is not re-presented as rerun.

During post-physical-acceptance canonical closeout, update docs/ARCHITECTURE.md and
docs/DECISIONS.md to document storage record identity vs canonical domain identity,
legacy ordinal-key fencing, expected resource version vs semantic fingerprint,
and preview-sealed targeted Activity consequences. This narrow checkpoint does
not perform that broader documentation closeout or rewrite historical migrations.
