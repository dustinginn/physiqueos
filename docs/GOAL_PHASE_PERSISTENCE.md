# Goal Phase Persistence Foundation

Explicit authored phases are stored in the optional `phases` collection on the
owning Goal aggregate. There is no GoalPhase repository or independent lifecycle
store. A missing property remains the legacy representation; an explicit empty
array can be persisted after removing authored phases. Both resolve through the
read-only implicit compatibility path, while a non-empty explicit collection
overrides it.

Persisted phase objects contain only `id`, `goalId`, `name`, `purpose`, `status`,
`order`, phase timing, criteria, guardrails, transition policy, and creation/update
timestamps. The strict authored adapter rejects implicit flags, recommendation
metadata, draft data, planning signals, source context, and every other unknown
persistence field. IDs are explicit and never derived from editable labels.

The complete collection is normalized through the GoalPhase aggregate. An active
goal may remain unphased, but a non-empty authored collection must contain exactly
one active phase. Ownership, identity/order uniqueness, status sequence, timing,
dates, duration, criteria, guardrails, and active cardinality are validated before
review and again before commit. Parent goal lifecycle state never changes.

`GoalPhaseDiffService` compares stable phase IDs and reports additions, removals,
reordering, names, purposes, statuses, timing, criteria, guardrails, transition
policies, unchanged phases, active identity, and operational-phase impact. Goal
destination impact is always false because destination remains goal-owned.

The immutable `goal_phase_update_v1` command and `goal_phase_review_v1` token bind
the source goal and revision, original/proposed phase fingerprints, approved diff,
draft ID, issue time, and expiry. Tokens are phase-specific, expire after ten
minutes, and are consumed after successful atomic commit. Duplicate submissions
return the prior result; stale and rejected attempts do not consume the token.

The service stages from the exact persisted founder-store snapshot, changes only
`goal.phases`, assigns the legitimate goal `updatedAt` during candidate
finalization, validates the candidate twice, performs revision compare-and-swap,
serializes, atomically replaces the store, and publishes the committed snapshot.
Candidate validation proves all other goals and goal fields remain equal; protocol,
evidence, briefing, reminder, scheduler, transition, activation, and completion
structures remain equal; phases rehydrate through GoalPhase; and legacy implicit
resolution still works.

The read-only capability reports source revision, explicit collection state,
aggregate validity, atomic commit support, stale protection, and review-token
availability without creating phases. Phase Editor UI, recommendation adoption,
automatic activation/transition, Home and Goals presentation, and all protocol or
briefing integration remain intentionally out of scope.
