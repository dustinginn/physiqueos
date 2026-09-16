# Build 36 daily-driver correctness — partial engineering checkpoint

Status: **NOT a complete release candidate. Awaiting the bounded PC production
incident audit.** No deployment, build-number bump, archive, upload, production
mutation, workspace cleanup, V3 implementation, or HealthKit work.

Native base: `3ab5ccd8c601a817ec0e098d77a37f7640144160`, 1.0 (35).
Server base / accepted production: `f88fa541b5805c38e72a0ae7ba2d1a82bd8ecf30`.
Accepted production deployment: `d58978c0-f2fe-4907-963f-b3d03c40cd0d`.
Existing branches retained. These authorities were not reset or rewritten.

Founder has physically accepted Build 35 notification delivery/diagnostics,
iOS 27 strength recognition, review dismissal, Operating Plan reads,
Training Library scope, Hyperextension navigation, and Sep 14 reconciliation.
Those accepted fixes remain untouched.

## Implemented source-proven improvements

1. Automatic uploads previously discarded accepted intake results and never
   performed the explicit-upload flow's quick review-ready follow-up, even
   for one Nutrition group. Both flows now share the follow-up. Mixed groups
   check concurrently and offer ready review links; one ready group opens
   its exact review in-flow. Publication already present in an upload response
   needs no redundant GET. A review ID without ready status is not publication.
2. Unresolved accepted groups use the existing running-app notifier and clear
   evidence-received / can-leave / notify-when-ready handoff. Failed
   interpretation is distinguished from unresolved processing; no blind
   resubmission occurs in follow-up. Fully terminated-app delivery remains
   the accepted deferred V1 limitation. The backend is still asynchronous:
   this is NOT proof that common production interpretation is now instant.
3. Server Nutrition presentation previously re-compared already-derived daily
   totals against meal sums, concealing retained original-source conflicts
   that commit admission still rejects. Presentation now honors the same
   retained interpreted reconciliation authority as admission. A sanitized
   aggregate/conflict fixture proves the old misleading match and the new
   warning without weakening validation or changing any package. This proves
   a generic contradiction, NOT the exact Sep 15 incident fields or chronology.
4. Shared Native date sheets have Today, respecting date-only calendar bounds;
   Today is disabled for future-only appointments rather than silently
   selecting tomorrow. Schedule start/end and dosing controls permit future
   selection while leaving historical persisted values unchanged on open.
   Coaching's next-DEXA picker now permits future scans, with the existing
   canonical future-only appointment validation retained.
5. Tracking and Peptide support editor headers identify the canonical object.
   Existing Recovery/Supplement support editors already identify their object.

## Pending incident evidence and architecture

Use [the exact bounded PC handoff](BUILD36-PC-READ-ONLY-INCIDENT-AUDIT.md).
No production SQL was attempted on Mac; no credential was requested.

- Nutrition: exact intake/queue/interpretation/publication times, original
  meals/totals/reconciliation for ALL objects, confirmation rejection and
  receipt/canonical-mutation state remain unknown. A usable canonical Native
  Nutrition correction path still needs implementation once the invariant
  and intended correction are proven; do not treat warning copy as a fix.
- Logger: structured session durability, response loss/timeout, screenshot
  review relationship, and what confirmation would do remain unknown.
  Source retains a draft whenever `commit` throws, with no acknowledgement
  recovery. The posted success guard still requires explicit durable Training
  acknowledgement; it was not weakened. Supporting screenshots are prewarmed
  separately and reconciled only after acknowledged structured commit.
- Shared lifecycle: ordinary JSON requests use 15 seconds; fast follow-up
  uses three polls rather than an end-to-end wall-clock budget. Non-Training
  Native confirmation intentionally pauses before canonical commit; Native
  review follow-up generally waits for full `confirmed` lifecycle. These
  existing boundaries must be revisited for the new instant-path target using
  measured evidence, receipt recovery and durable canonical readback—not a
  speculative timeout increase or synchronous downstream PI/Goal/Briefing work.
- Tracking: exact reported error is a Native pre-request guard on absent
  detail/reminder ID. The generic recurring-support reader only selects
  protocol/recovery reminder types, while canonical Tracking's resolver and
  fixtures use an evidence reminder. Production shape must be audited before
  changing that selector; do not invent a server response for an unsent request.
- Coaching: the exact rejected composite operation/fence is not yet proven.
  Atomicity and existing domain-specific concurrency remain unchanged.

## Remaining requested implementation

Not implemented yet: receipt/durability-based Logger recovery and draft
lifecycle, measured shared server instant path, usable Nutrition correction,
Tracking/Coaching incident fixes, published-briefing ready notifications and
removal of redundant notification preference, specialized dose-aware Peptide
Complete/Snooze, authorized Recovery/Supplement completion, Progress Photos
specific time, canonical support Next due, reminder-on indicators.

No production cleanup candidate is asserted before the audit establishes exact
persisted state. Do not retry/confirm/discard the incident objects as a diagnostic.

## Validation of the bounded changes

- Full Native units: 997/997, including final source/header checks.
- Focused Native evidence/shared-date/Operating Plan/Logger: 278/278.
- A pre-existing test expected Build 34 despite accepted Build 35 metadata:
  updated only its test name/expectation; no build-number bump.
- Affected UI: Today picker and evidence presentation passed; workout review
  initially failed on Simulator event synthesis, then passed unchanged on a
  bounded rerun. All three journeys have passing runs; initial failure retained.
- Focused server Nutrition/readiness/confirmation/Logger/Support/Coaching/Log:
  112/112. Canonical recurrence/Tracking and eight-domain Operating Plan
  acceptance: 36/36. Future anchors suppress earlier daily/weekly/interval
  occurrences; no parallel Swift recurrence was introduced.
- Debug test build and generic unsigned arm64 Release builds passed.
- Local server production build passed; changed-file lint passed.
- Deterministic project regeneration twice produced unchanged hash
  `af80f6d336a42917d7b50094fcf1ae7ba24084fb8828ffd73357655b650ba3c4`.
- Release configuration remains 1.0 (35); bundle/team unchanged.
- Credential/private-key signature scans and whitespace diff checks passed.
- Existing unrelated Swift actor warnings remain; new Today tests execute
  on MainActor. No private Founder data/image fixtures were retained.
- Forensic script remains unmodified, SHA256
  `5dc1bebf4153ad3518c0732b37b4b3e8b23f7f9c542518b570d1dcf68b210275`.
- Validation artifacts retained under
  `/private/tmp/physiqueos-build36-validation.2ZUWNI`; no archive/worktree or
  workspace cleanup. Last observed free disk space: 19 GiB.

Next: existing PC operator returns sanitized bounded audit evidence, then
compose the incident fixes and remaining product decisions into one validated
Build 36 candidate for Founder review. These partial commits are not shipping
authorization and must not be deployed as a complete Build 36 candidate.
