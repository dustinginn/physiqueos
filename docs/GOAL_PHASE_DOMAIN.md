# Goal Phase Domain Boundary

`GoalPhase` lives in `src/domain/models/goalPhase.js`, separate from the legacy
`Goal` factory. The existing goal model intentionally remains permissive and
unchanged; the phase model is a strict, read-only normalization boundary for
future phase-aware consumers.

The compatibility contract supports legacy `upcoming` and `skipped` plus
canonical `planned`, `active`, `review_due`, `review_pending_decision`,
`completed`, `superseded`, and `paused`; timing modes `fixed_duration`, `target_date`, and
`completion_criteria`; and transition policies `manual_review`,
`evidence_review`, and `automatic`. The automatic value records historical intent
only and does not execute a transition.

The strict evidence-based lifecycle and read compatibility semantics live in
`canonicalGoalPhase.js` and `PHASE_REVIEW_PRODUCTION_ARCHITECTURE.md`.

`normalizeGoalPhaseCollection` validates phase ownership, unique IDs and order
values, deterministic sequence order, active-phase cardinality, status
sequence, and date coherence. Empty collections are valid.

`resolveGoalPhases` returns explicitly authored phases when present. Otherwise,
it derives one deterministic phase marked `implicit: true` from the legacy goal
without mutating the goal or fabricating dates, duration, criteria, guardrails,
or progress. The resolver never writes to persistence. This patch adds no
repository, migration, activation operation, lifecycle behavior, or UI.
