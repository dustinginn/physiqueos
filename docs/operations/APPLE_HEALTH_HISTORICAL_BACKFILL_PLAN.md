# Apple Health historical nutrition and activity backfill audit

Status: Stage 1 read-only audit complete; device availability preview and every import/write remain unexecuted and separately gated.

Audit windows:

- discovery: 2026-05-21 through 2026-10-10;
- Visible Abs cut: 2026-05-24 through 2026-07-18 (56 days);
- Build Lean Mass check: 2026-08-15 through 2026-10-10 (57 days).

## Existing capability

| Area | Current behavior | Historical consequence |
| --- | --- | --- |
| Nutrition permission | Reads dietary energy, protein, carbohydrate, fat, and fiber. | The automatic daily snapshot emits only energy/protein/carbohydrate/fat; fiber is authorized but omitted. |
| Nutrition aggregation | Four all-source cumulative daily statistics become one synthetic `com.apple.Health` total. | Safe for a daily total, but the Server cannot reconstruct contributing apps or detect cross-app overlap from the aggregate. |
| Activity | Reads Activity Summary plus active energy, exercise/stand time, steps, walking/running distance, and flights. | Automatic upload uses daily Activity Summary plus supported daily metrics. Basal energy is not authorized or queried. |
| Workouts | Anchored UUID-based samples preserve source/device provenance. Automatic queries are prospectively fenced by the workout activation floor. | The ordinary path intentionally cannot recover pre-activation workouts. Workout energy must remain descriptive and never be added to an Activity daily total. |
| Weight | No HealthKit body-mass read type exists in the registry. Body fat and lean mass are write-only DEXA outputs. | Historical Health weight cannot be previewed or imported by the current implementation. |
| Window | Current day first, then isolated per-day catch-up for the prior 30 days. Daily observers are hourly; Workout is immediate. | May–July is unreachable through ordinary automatic synchronization. |
| Identity/retry | Owner/device/predicate-scoped durable cursors, atomic staging, batches of at most 100, idempotent Server commands, and daily revision fingerprints. | Replays are safe within an existing scope and failed days do not block later days. |
| Corrections/deletions | Changed daily totals advance source revisions. A removed Nutrition day becomes a zero-calorie revision when it was previously observed. Generic S1 sample deletions are retained only as `server_deletion_contract_deferred`. | A historical import cannot claim full deletion reconciliation until an explicit Server deletion/tombstone contract exists. |

## Read-only production baseline

The audit ran inside exact-SHA-gated, owner-scoped, repeatable-read read-only transactions and explicitly rolled back. No health values were included in the handoff-safe output.

- Visible Abs: 10/56 days have canonical Nutrition and 15/56 have canonical Activity; no stored HealthKit source observation exists in this window. Device availability is unknown. The maximum possible improvement is +46 Nutrition days and +41 Activity days, but only a physical-device preview can establish the real number.
- Build Lean Mass: canonical records cover 38 days from Aug 15–Sep 21; quarantined HealthKit canonical days cover 20 days from Sep 21–Oct 10. With the Sep 21 overlap, combined daily coverage is 57/57 for both Nutrition and Activity. Historical import should add no automatic canonical days here; this window is a duplicate/conflict validation set.
- Current HealthKit source history begins Aug 23: 49 distinct Activity days and 49 distinct Nutrition days through Oct 10. Current HealthKit canonical history is 20 days/domain from Sep 21–Oct 10, with zero duplicate canonical day keys.
- Daily HealthKit totals identify Apple Health as the synthetic aggregate source. Stored workouts retain their real sources: 41 Apple Watch workout records across 17 days and 8 PhysiqueOS workout records across 8 days in the audited range.
- Every HealthKit canonical day remains quarantined, and zero HealthKit-derived objects are present in strategic Evidence. Completed goals, Confidence, Goal Intelligence, and historical briefings therefore remain untouched.

## Stage 2 device preview (still read-only)

The Founder must explicitly start this flow; startup, background synchronization, and workout initialization must never invoke it.

1. Use the durable existing authorization receipt. If any required type is genuinely new, show that exact addition before asking; otherwise issue no permission request.
2. Query 2026-05-21 through 2026-10-10 in seven-day chunks, oldest first, with a hard ceiling of 143 local days and cancellation between chunks.
3. For dietary energy/protein/carbohydrate/fat, run daily cumulative statistics with source separation. Report per source and day: presence, metric completeness, sample count, total, first/last date, and an opaque source digest. Do not upload sample values during Stage 2 preview.
4. Inventory source apps/devices independently, then preview Activity Summary, active energy, steps, distance, flights, and workouts. Basal energy and weight must be reported as unsupported until separately added and permission-reviewed.
5. Compare candidate days to canonical Nutrition/Activity by local date and classify `new_day`, `identical`, `consistent`, `conflicting`, `partial`, or `unsupported`. Multiple nutrition apps must not be summed blindly: retain per-source totals, identify likely mirrored data, and nominate one daily authority only after review.
6. Treat workout calories as descriptive. Never add them to Activity Summary/active-energy totals, and never create Training evidence from this preview.
7. Emit only a local encrypted preview receipt: window, source digests, day counts, missing days, conflict counts, query errors, and a deterministic aggregate digest. Interruption resumes from the last completed seven-day chunk.

## Stage 3 import proposal (separate authorization)

If the device preview is accepted, build a new historical-import contract rather than widening automatic sync:

- exact owner, enrolled device, start/end dates, approved source digests, approved domains, preview digest, and candidate build are immutable authorization inputs;
- dry-run first; apply re-reads the same bounded window and refuses any aggregate-digest drift;
- maximum 100 observations per request, one seven-day chunk at a time, one in-flight upload, memory admission below 70% of the service limit, and a durable per-chunk receipt for resume;
- raw historical source observations use a distinct namespace and immutable provenance; replay is a no-op and identity/content collision fails closed;
- reconciliation is explicit and date-scoped. Existing canonical days win unless an approved conflict disposition says otherwise. No generic activation policy may reconsider old raw observations;
- deletions require durable tombstones and a dry-run impact preview. Until that contract exists, affected samples are source-only and cannot displace canonical records;
- apply snapshots affected source/canonical rows for a bounded rollback. Rollback removes only import-created rows or restores exact prior versions;
- every imported historical row is permanently ineligible for automatic confirmation, Evidence Review creation, briefing regeneration, priority/notification creation, goal/phase changes, Confidence recomputation, or completed-goal reinterpretation.

## Stop conditions

Stop before import if the preview cannot establish source separation, mirrored nutrition data cannot be resolved without double counting, an existing canonical day conflicts, deletion coverage is incomplete, the authorization receipt changes, the device timezone would rewrite historical local dates, or any operation would touch coaching/goal artifacts. Any import and any Native release require separate review and authorization.
