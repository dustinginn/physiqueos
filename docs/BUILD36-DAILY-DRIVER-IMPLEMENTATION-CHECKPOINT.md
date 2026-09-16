# Build 36 daily-driver correctness — candidate checkpoint

Status: **validated engineering candidate; not deployed or uploaded.** No build
number change, archive, TestFlight upload, Founder production mutation,
workspace cleanup, Confidence/Narrative V3 work, or HealthKit work occurred.

- Native Build 35 base: `3ab5ccd8c601a817ec0e098d77a37f7640144160`,
  version 1.0 (35).
- Native Build 36 functional candidate: `9c22bf8b`.
- Server production base: `f88fa541b5805c38e72a0ae7ba2d1a82bd8ecf30`.
- Server Build 36 candidate: `51e3e11f`.
- Production remains deployment `d58978c0-f2fe-4907-963f-b3d03c40cd0d`
  on `f88fa541`; it was not changed or queried from Mac during implementation.

Founder has physically accepted the Build 35 notification, diagnostics, iOS 27
strength screenshot, Evidence Review disposition, Operating Plan, Training
Library, Hyperextension, and Sep 14 reconciliation work. Build 36 does not
reopen those results.

## Production incident evidence

The bounded PC audit ran in repeatable-read, read-only transactions and is
recorded in `BUILD36-PC-READ-ONLY-INCIDENT-AUDIT.md`.

### Nutrition

- Intake accepted at 17:42:03.846 PDT; interpretation began 4.6 seconds later;
  Review became ready 55.3 seconds after submission. Interpretation itself
  consumed 50.7 seconds.
- Review `evidence_review_22DD208D2B84436ABCDE09D668E56A80` remains pending,
  version 1. No confirmation receipt or canonical write exists.
- Presentation had recomputed a meal-derived aggregate and displayed a match,
  while admission trusted retained reconciliation metadata from the original
  source totals. This allowed “Meal totals match” and
  `NUTRITION_DAILY_TOTALS_CONFLICT` to coexist.
- Presentation and admission now use one resolver. It recomputes from retained
  source daily totals plus the current meal model. A real conflict remains
  fail-closed and Native names the safe conflicting fields with a usable
  dismiss/correct/re-upload path; a resolved/stale flag cannot block confirmation.

### Workout Logger

- Commit receipt: 17:36:33.821 PDT. Durable canonical TrainingSession row:
  +12.7 seconds. Full canonical payload finalized: +18.8 seconds.
- The active canonical session exists with the exact three exercises and 12
  sets. It is the source of “Strength Training logged.” Native's former
  15-second transport deadline expired before the durable response, so the
  draft remained even though the server succeeded.
- The separate three-screenshot Training review predates Finish Workout by
  roughly 26 minutes and is not the Logger commit package. Its duplicate/
  enrichment consequence was not mutated or guessed.

### Tracking and Coaching

- Morning Weigh-In's canonical reminder is an `evidence_reminder`. The
  recurring-support projection excluded that valid type and returned no
  reminder identity, so Native stopped before HTTP. The projection now accepts
  the canonical Tracking type and fails closed on missing/ambiguous linkage.
- Coaching had two generic preconditions matching production: the save boundary
  passed a nullable raw owner timezone into local-date formatting, and the read
  projected a completed historical DEXA back into the future “next DEXA” field.
  The save now uses canonical timezone resolution; completed DEXA remains
  protected history and is not a mandatory future appointment for an unrelated
  atomic Coaching change. A new future scan may still be scheduled explicitly.

## Evidence latency decomposition and changes

### Nutrition T1/T2

Before:

- T1 (accepted to interpretation start): 4.6 seconds. This includes queue/
  worker acquisition after intake/storage acknowledgement.
- T2 (interpretation start to Review ready): 50.7 seconds. Deployed Build 35
  did not emit sub-stage timings, so the old run cannot be split more finely
  after the fact. Source tracing proves the external screenshot interpreter was
  awaited once per attachment, sequentially; normalization, Nutrition
  reconciliation, and Review persistence are local work after those calls.
- End-to-end: 55.3 seconds. The external interpretation boundary dominates the
  measured interval; exact provider versus local milliseconds require the new
  instrumentation on a deployed candidate.

After candidate:

- Artifact loads are bounded at concurrency 3; per-screenshot external model
  calls are bounded at concurrency 2 while preserving original ordering.
- Exercise-registry read, photo-session context read, each artifact load, each
  external interpretation, normalization/reconciliation, Review persistence,
  worker total, and queue wait are separately timed.
- Common uploads share the quick follow-up path. Review opens in-flow when it
  becomes ready inside the short interactive window. Otherwise the UI says the
  evidence is received, may be left, and will notify on canonical Review-ready
  publication under the accepted running-app notifier boundary.
- Provider/model time is not weakened or bypassed. No post-change production
  latency is claimed before deployment; the candidate removes provable serial
  work and makes the remaining latency measurable.

### Workout T3

Before:

- Receipt to durable Training row: 12.7 seconds; receipt to full finalized
  canonical payload: 18.8 seconds.
- Critical path contained validation, idempotent receipt, duplicate/reconciliation
  preparation, canonical Training write, Activity consistency, transaction/
  locking, and durable readback. The bounded canonical commit also loaded
  unrelated Founder collections/application metadata.
- Supporting-evidence interpretation and downstream PI/confidence/briefing work
  were already asynchronous and must remain downstream.

After candidate:

- The durable canonical commit loads only the collections required for source
  commit/reconciliation and omits unrelated application/import metadata.
- Durable acknowledgement still requires the canonical TrainingSession and the
  reconciliation needed to prevent duplicates and make Log immediately honest.
  Workout Complete is never shown from a staged receipt.
- Native gives the ordinary path 3 seconds, then performs one 1-second replay
  using the identical persisted idempotency key, with canonical readback after
  each ambiguous result. A readback validates canonical ID, date, exercises,
  and set count before recovering success and clearing the draft.
- If the result is still genuinely processing after that bounded budget, Native
  says exactly that and retains the draft. Established rejection remains a real
  failure. There is no minute-long spinner and no timeout increase masquerading
  as a fix.
- Server logs receipt-commit and durable-acknowledgement durations; Native logs
  T3 outcome/duration without IDs or evidence payloads.

The <=3-second ordinary T3 objective is an engineering target, not a result yet:
the candidate removes unnecessary runtime loading, but deployment measurement
is required to prove it. If reconciliation/transaction work remains above the
target, that irreducible work must be reported rather than moved past the
durability boundary.

## Product behavior included

- Enabled Midweek, Weekly, Monthly, DEXA Event, and Photo Event briefings have
  one canonical notify-on-publication policy; the redundant product-level
  notification toggle is removed. Native observes newly published Home briefing
  artifacts, not scheduled generation clocks, and deep-links to the exact
  artifact. This is a running-app local publication observer; no unsupported
  remote/background execution architecture is claimed.
- Peptide notifications preserve `peptide_protocol` workflow and carry the
  scheduled dose/protocol into the specialized completion command. Recovery and
  Supplements expose Complete/Snooze only when the canonical projection proves
  the occurrence completable and supplies an expected version. Blind generic
  completion remains prohibited.
- Shared date pickers provide Today. Future start dates are valid recurrence
  anchors with no earlier occurrences; historical existing anchors are
  preserved. DEXA permits the next future scan.
- Progress Photos supports a canonical specific time as well as dayparts.
- Support reads expose canonical Next due; overview cards show a reminder icon
  only for enabled reminders; editor headers identify their support object.

## Observability contract

- T1: accepted timestamp to worker interpretation-start timestamp.
- T2: interpretation-start timestamp to canonical Review-ready persistence.
- T3: Confirm/Finish pressed to durable acknowledgement or validated canonical
  readback.
- Logs contain stage names, counts, durations, and outcomes only. They do not
  contain evidence bytes, OCR/model text, filenames, tokens, or credentials.

## Validation

- Full Native unit suite: 1001/1001.
- Expanded focused Native API/notification/Operating Plan/evidence: 239/239.
- Bounded Logger ambiguity/durable-readback regression: 3/3.
- Affected Native UI journeys: 3/3 (Evidence, Today picker, Logger review).
- Focused server changed-path suite: 161/161. Earlier expanded candidate suite:
  207/207. Production-shaped Coaching/DEXA follow-up: 23/23.
- Server production build passed. Changed-file ESLint and syntax checks passed.
- Native Debug test build passed. Generic unsigned arm64 Release build passed.
- Project generation was deterministic twice at SHA-256
  `af80f6d336a42917d7b50094fcf1ae7ba24084fb8828ffd73357655b650ba3c4`.
- Release configuration remains 1.0 (35), bundle
  `com.physiqueos.native.dev`, team `33GMTRM6G9`.
- Native/server whitespace diff and changed-range credential/private-key scans
  passed. The forensic script remains unmodified at SHA-256
  `5dc1bebf4153ad3518c0732b37b4b3e8b23f7f9c542518b570d1dcf68b210275`.
- The repository-wide server unit command was also run and retained its known
  fixture/environment failures: absent private Founder runtime files, migration/
  backup fixtures, and sandbox-denied local listeners. It produced 299 failing
  historical/environment cases and does not supersede the green bounded suites.

## Production state and follow-up

No production object was changed. The pending Nutrition review remains available
for a post-deployment corrected read/correction flow. The earlier screenshot-only
Training review should not be confirmed until a bounded read-only comparison
proves whether current duplicate reconciliation would enrich the durable Logger
session or reject/no-op; no cleanup mutation is proposed here.

The candidate is ready for Founder engineering review. Deployment, build 36
metadata, archive, TestFlight, and physical acceptance require separate
authorization.
