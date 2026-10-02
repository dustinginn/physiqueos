Workout completion Performance Record celebration — Founder real-workout audit

Standing reporting protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

TASK TYPE

Read-only diagnosis first.

Use a NEW Codex chat/worktree.

Do not interfere with:
- Claude TrainingSessionAuthority work;
- Codex Workout Live Activity visual prototype;
- HealthKit Sleep Build 76 polish;
- prospective Sleep canary.

FOUNDER REPORT

Today the Founder:
- completed a real workout;
- completed the normal confirmation/verification flow;
- believes the workout produced new Exercise Performance Records;
- did NOT see the expected performance-record celebration/confetti/new-record presentation after confirmation.

Founder wants an audit to determine whether:
1. records were actually detected/persisted;
2. the completion/confirmation payload carried those record events;
3. Native received them;
4. Native failed to present them;
5. one-shot/deduplication/timing/navigation logic swallowed the celebration.

Use today's actual workout as the primary acceptance case.

Do not modify or delete the workout or its record events during diagnosis.

A. REVERIFY AUTHORITIES

Before reading:
- current production Server exact SHA/deployment;
- current Native accepted build/source authority on Founder device if inferable from latest reports;
- Exercise Performance Record model/version;
- confirmation/verification flow authority.

Read the latest reports relevant to:
- Exercise Performance Records normalization;
- workout confirmation/Evidence Review;
- celebration/confetti behavior;
- accepted-to-processing acknowledgement;
- Native post-confirmation navigation.

B. IDENTIFY TODAY'S COMPLETED WORKOUT

Use production read-only inspection.

Find the Founder's most recently completed/confirmed workout corresponding to today's report.

Bounded owner-scoped reads only.

Do not print private workout details unnecessarily to GH.

Report sanitized identifiers/time windows if needed.

C. VERIFY PERFORMANCE RECORDS

For the workout:
- determine which exercises/record families were evaluated;
- identify which records were genuinely new at completion time;
- verify canonical Exercise Performance Records were updated/persisted;
- verify record normalization/current-record semantics;
- confirm whether any record was suppressed because it was not actually a new PR under canonical rules.

At minimum distinguish:
- Reps at Load;
- Session Volume;
- any other current supported performance-record types.

If no PRs were actually set, prove why from canonical history.
If PRs were set, count them and continue.

D. SERVER / CONFIRMATION EVENT FLOW

Trace the exact server-side path from workout commit/confirmation to whatever response/event model Native consumes.

Determine:
- where new PRs are computed;
- whether they are included in commit/confirmation result;
- field names/schema;
- whether accepted_processing vs durable completion affects availability;
- whether confirmation/verification emits the PR data synchronously, later, or through a separate read;
- whether idempotent retry/reconciliation changes the event payload;
- whether a post-confirmation fetch is required.

For today's real workout, determine whether the authoritative Server result/event contained the expected PRs.

E. NATIVE DECODING / PRESENTATION

Audit exact Native files/types for:
- confirmation result decoding;
- new-record event model;
- celebration/confetti state;
- navigation transition after confirmation;
- one-shot consumption;
- deduplication;
- persistence across accepted_processing / processing / durable-complete;
- app background/foreground;
- view lifecycle.

Determine whether Native:
- received the PR data;
- decoded it correctly;
- stored it;
- consumed it too early;
- lost it during navigation;
- suppressed it due to a dedupe key;
- skipped it because the result arrived after the relevant view disappeared;
- required a condition that today's flow did not satisfy.

F. REAL-WORKOUT REPLAY / READ-ONLY ACCEPTANCE

If possible without mutation:
- reproduce the confirmation-result decoding/presentation path against a sanitized capture or existing server result from today's workout;
- verify whether the celebration state would or would not be created.

Do not re-confirm the real workout.
Do not duplicate records.
Do not alter canonical training history.

Synthetic fixture tests may be added after the real path is understood.

G. EXPECTED UX

Founder expectation:
When a completed workout establishes one or more new canonical performance records, the post-confirmation flow should reliably surface a celebration with the existing confetti treatment and clearly show the new record(s).

Do not redesign broadly yet.

Audit current intended UX:
- where celebration should appear;
- how long it persists;
- what happens with multiple PRs;
- whether it should survive accepted_processing;
- whether it should survive navigation to Evidence/Home;
- whether it should be replayed after relaunch if never shown.

H. ROOT CAUSE CLASSIFICATION

Classify the defect as one or more:
- PR computation defect;
- canonical persistence defect;
- Server response omission;
- async timing/lifecycle defect;
- Native decode defect;
- Native state ownership defect;
- navigation/view-lifecycle defect;
- dedupe/one-shot defect;
- confetti presentation-only defect.

Do not patch until root cause is proven.

I. PATCH PLAN

If root cause is clear and fix is bounded:
- propose exact patch;
- identify Server vs Native owner;
- add deterministic regression tests;
- preserve historical records;
- avoid replaying old celebrations unintentionally.

If the fix is low-risk and isolated, Codex may implement it on a dedicated branch after completing the diagnosis and fresh review.

If the fix risks broad workout lifecycle changes, STOP after report with exact recommendation.

Do not upload TestFlight in this audit task unless separately authorized after patch review.

J. TEST MATRIX

At minimum design/add tests for:
- one new PR;
- multiple PRs;
- no PR;
- accepted_processing then durable result;
- retry/idempotent confirmation;
- navigation immediately after confirmation;
- app background/foreground during processing;
- celebration shown exactly once;
- celebration not lost if result arrives after view transition;
- no replay on historical workouts unless explicitly intended;
- confetti + record details both present;
- unknown/new record type fails soft.

K. REPORT

Publish:
agent-handoffs/reports/<timestamp>-workout-performance-record-celebration-audit.md

Include:
- exact authorities;
- today's workout sanitized acceptance case;
- whether PRs were truly set;
- canonical persistence status;
- Server payload/event status;
- Native decode/presentation status;
- exact root cause;
- patch status;
- tests;
- whether Founder needs another natural workout to verify;
- no mutation of today's workout.

Publish GH before every stop.

END TASK.
