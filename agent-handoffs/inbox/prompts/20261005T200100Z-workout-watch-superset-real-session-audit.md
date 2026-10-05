PhysiqueOS Build 87 real-workout audit — Watch supersets, progression refresh, and Watch-finished recap parity

TASK TYPE

NEW Claude Remote Control chat.
Use High reasoning.
This is a separate workout reliability lane from Redesign Batch 3.

Start with AUDIT FIRST using the Founder's real Build 87 workout from 2026-10-05. Do not patch symptoms before tracing authority, telemetry and existing behavior.

WORKTREE RULE — MANDATORY

Use the single Remote Control-provided worktree for this new session.
No EnterWorktree.
No secondary worktree.

CONTEXT

Founder completed a real workout today on Apple-VALID Build 87 with the iPhone + Apple Watch Logger. The session exercised supersets and was finished from the Watch.

Do not ship/update a build as part of the audit. Build 88 remains separately release-gated.

TODAY'S OBSERVATIONS

ISSUE 1 — WATCH COMPLETE SET LATENCY

Founder observed noticeable lag after tapping Complete Set on Watch:
- delay before the Complete Set button visually changes/darkens;
- delay before Watch advances to the next prescribed set;
- latency seemed materially worse during supersets than ordinary sets;
- earlier Build 86/87 observations also suggested Watch responsiveness could degrade with phone distance, including roughly 10–15 ft before moving closer improved response.

Audit whether today's lag is:
- local Watch UI acknowledgement gating;
- WatchConnectivity transport;
- phone authority mutation;
- server/local persistence;
- projection generation;
- superset next-step resolution;
- Watch acknowledgement/application;
- another stage.

Use existing Build 86/87 latency instrumentation and today's real session where available.

Produce a timestamp chain where evidence permits:
Watch tap -> local UI acknowledgement -> command send -> phone receive -> canonical mutation -> projection/ack generation -> Watch receive -> next-set selection/render.

Explicitly compare:
- ordinary set transitions;
- superset A -> B;
- superset B -> next-round A;
- final superset transition;
- any available distance/connectivity indicators.

ISSUE 2 — SUPERSET MEMBERSHIP MUST REFRESH EXISTING CONTEXTUAL PROGRESSION GUIDANCE

Founder believes PhysiqueOS historically already tracks superset performance separately from standalone performance.

Do NOT invent new progression semantics until verifying the existing architecture.

Current user workflow:
- exercises are added to the active workout;
- Suggested/Maintain load + reps are initially shown;
- only then can Founder associate exercises into a superset;
- after associating the superset, the displayed guidance needs to refresh immediately so the Founder can progress using the correct existing superset-context history.

Audit:
- whether performance records already distinguish standalone vs superset context;
- how historical contextual records are selected;
- whether associating/removing/reordering superset membership invalidates the current recommendation;
- whether progression lookup/recommendation reruns;
- whether the active Logger view model replaces stale Suggested/Maintain load + reps;
- whether only uncompleted/future guidance changes;
- whether completed sets remain immutable;
- whether the refreshed projection reaches Watch.

Use recurring exercises with both standalone and superset history if fixtures/tests already support them.

Desired behavior if existing semantics confirm this:
standalone guidance -> associate superset -> immediately recompute/display superset-context Suggested/Maintain load+reps -> project to Watch.
Breaking/changing membership recomputes appropriately.
Do not rewrite completed work.

ISSUE 3 — WATCH-FINISHED WORKOUT MUST SHOW FULL PHONE RECAP / PR / CONFETTI PARITY

Founder finished today's workout from Watch.

When later opening the phone completion state, the phone showed a reduced:
Workout logged / Workout confirmed / Return to Log
screen with no performance-record recap.

Founder requirement:
The device that initiates Finish must not determine recap richness.

Audit canonical finish/completion state and determine why Watch-originated finish does not hydrate the same phone Workout Complete recap.

Desired behavior:
- finalized canonical workout drives recap regardless of Watch vs phone finish origin;
- phone displays the same workout summary;
- New Performance Records/PRs appear when earned;
- one-time confetti appears on phone when a qualifying PR exists and the phone celebration has not already been consumed;
- Reduce Motion suppression remains;
- cross-device opening must not duplicate celebration;
- no fake PRs and no client-side independent PR authority.

ISSUE 4 — RELATED KNOWN WATCH PROJECTION DEFECTS

Audit whether these known backlog items share the same authority/projection causes:
- Watch Complete Set remains offered while phone is in Review/Confirmation;
- timed-set Watch projection issue.

Do not automatically broaden the patch. If root causes overlap cleanly and fixing them together is safer, recommend that with proof. Otherwise leave them separately scoped.

ISSUE 5 — HEALTHKIT / WORKOUT RECORDING SAFETY

Today's real workout should also be checked for expected HealthKit workout lifecycle and canonical workout record, because prior Build 86 work addressed automatic workout recording.

Do not mutate or reconcile production data in this task unless separately authorized.

Confirm whether today's real session:
- has canonical Logger workout data;
- has expected HealthKit workout record/energy relationship;
- has any duplicate/truncated/manual Apple workout interaction relevant to the audit.

This is observational/read-only unless a correction is separately authorized.

REAL-SESSION-FIRST EVIDENCE

Before coding:
- identify today's real workout/session identifiers using safe local/server read paths;
- inspect available Watch/phone diagnostic logs/instrumentation;
- preserve timestamps;
- correlate the session structure including supersets;
- establish what is proven vs inferred.

Do not ask Founder to reproduce the workout before using existing evidence.

If logs are insufficient, identify exactly which missing instrumentation is needed for the next workout.

AUDIT OUTPUT BEFORE PATCHING

Publish an audit report that gives for each issue:
- observed evidence;
- root cause or ranked hypotheses;
- exact source path/functions involved;
- whether behavior is regression vs missing wiring vs existing design;
- minimal safe fix;
- test plan;
- whether a new Native build is required;
- any Server dependency.

If root causes are sufficiently proven and fixes are bounded/safe, you MAY implement them in this same task after documenting the audit.

If a fix requires changing progression semantics, production data, Server schema, or ambiguous authority, STOP and request Founder approval before implementing that part.

PATCH REQUIREMENTS IF SAFE

Preserve:
- TrainingSessionAuthority;
- exactly-once finish;
- HealthKit lifecycle;
- WatchConnectivity durability;
- canonical performance record authority;
- completed set immutability;
- Build 87/Batch 2 accepted behavior.

Add deterministic tests for:
- ordinary vs superset Watch transition latency/state progression;
- superset membership recommendation invalidation/refresh using existing contextual history;
- removal/change of superset membership;
- Watch projection receives refreshed guidance;
- Watch-originated finish hydrates identical phone recap;
- PR list parity;
- one-time confetti and Reduce Motion;
- no duplicate celebration;
- Review/Confirmation Watch action gating if fixed;
- timed-set projection if fixed.

For latency, do not write a brittle wall-clock test unless the architecture supports deterministic scheduler/transport timing. Prefer state-machine acknowledgement tests plus instrumentation proof.

BUILD / RELEASE

Do not upload TestFlight.
Do not bump build number.
Do not merge into Batch 2 release candidate yet.

If fixes are implemented, produce an exact candidate SHA and integration map for applying them to the final next-build authority after Founder review.

NOTIFICATIONS

Whenever Claude stops or needs Founder input for any reason, send a user notification.

At audit completion notify:
PhysiqueOS Workout Audit — today’s Watch/superset findings ready for review.

If safe fixes are also completed, notify:
PhysiqueOS Workout Fixes — Watch/superset candidate ready for review.

REPORT

Publish a main-visible GH report and update normal reporting pointers without overwriting the separate Batch 3 authority incorrectly; clearly label this as the workout reliability lane.

STOP after audit + any safely bounded fixes are reported.
No TestFlight.

END TASK.