# Revision-Checked Goal Plan Update

`GoalPlanUpdateService` is the only production write boundary used by Goal Edit.
Its immutable `goal_plan_update_v1` command binds source goal identity and
revision, original-plan fingerprint, normalized proposed plan, approved diff,
draft identity, final-review token, and request time.

Final-review tokens use `goal_plan_review_v1` and bind the goal, source revision,
original and proposed plan fingerprints, diff fingerprint, draft ID, issue time,
and expiry. Tokens live in the server process, matching the existing production
activation convention. They are consumed only after a confirmed atomic commit.
A duplicate submission returns the recorded committed result. A durable commit
followed by publication failure consumes the token and returns a non-retryable
failure so ambiguous writes cannot be repeated.

The allowlist maps canonical name to `title` and writes `purpose`,
`primaryOutcome`, structured `target`, `timeline`, overall-goal criteria through
`progressMeasurement.outcomeMeasures`, goal-owned `guardrails`, and
`coachingPreferences`. Existing predictive and explanatory measurements remain
intact. IDs, ownership, lifecycle state, activation/completion metadata,
relationships, proposed stages, planning signals, source context, draft fields,
and phases cannot enter the patch.

Before commit the service re-reads persisted state, verifies active primary-goal
ownership, recomputes the wizard source revision, normalizes the proposed plan,
regenerates the diff, verifies destination and preservation flags, and validates
every token binding. Stale sources return a typed result and preserve the draft;
there is no merge or retry.

The existing founder-store unit of work supplies the atomic boundary: stage one
goal replacement, validate the candidate, compare the persisted store revision,
advance it once, serialize, atomically replace the file, and publish to the live
store. Candidate validation proves goal cardinality and active identity are
stable, all other goals are equal, protected goal fields are equal, excluded
protocol/evidence/briefing/scheduler collections are equal, and the committed
goal re-adapts to the approved canonical plan.

Persistence and serialization failures return typed failed results with the
original safe error details and no automatic retry. GoalPhase persistence,
phase editing, durable edit drafts, Home, protocols, briefings, reminders,
scheduling, activation, completion, and evidence remain outside this boundary.
For an overall target-date goal, `timeline.targetDate` is the authoritative planning date and `target.targetDate` must carry the same date for round-trip compatibility. `timeline.startDate` owns the overall journey start. Phase dates remain independently owned and are never used to infer either value.

When Goal Edit includes the Overall Goal section, final review requires a complete interpreted destination before a review token is issued. This validation does not change `goal_plan_update_v1` or its token contract.

## Save routing and typed outcomes

The Goal Edit client routes saves by review-token version, never by token presence: `goal_plan_review_v1` uses Goal Plan Update and `goal_phase_review_v1` uses Phase Persistence. Server actions preserve safe typed result fields including status, reason code, message, operation, section/field guidance, draft preservation, stale revisions, and recommended recovery.

Rejected and failed saves emit a safe structured diagnostic containing only goal/draft identity, command and token versions, source revisions, plan/diff fingerprints, validation section names, candidate stage, and timestamp. Token IDs, founder state, evidence, and stack traces are excluded.

The UI distinguishes stale sources, canonical or diff rejection, expired/invalid/consumed review tokens, and persistence failures. A failed result preserves the draft, disables reuse of the stale save state, and requires explicit review preparation or refresh; it never retries, rebases, or regenerates a token automatically.

Commit validation continues to normalize the current source plan and proposed plan, regenerate the exact approved diff, verify every token binding, map only allowlisted goal fields, and adapt the staged candidate back to `goal_planning_v1`. Candidate round-trip loss remains a hard failure.
