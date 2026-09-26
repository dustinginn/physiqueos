Task id: claude-healthkit-strength-reconciliation-new-thread-20260926

Start a NEW Claude HealthKit thread. Do not resume the exhausted prior HealthKit conversation.

Current authority to reverify:
Production Server 2a23eee762472081815d9122b97c0f0a9f1b8969
Installed Native Build 60 at 00321dcc6dd86a6479dbca5dd27e691c87348cd8
Intended unreleased Build 61 lineage efcb8574d38d7462c3e2ccb0fd0e04ccb936517d
Build 61 is not prepared or authorized.

Read first:
agent-handoffs/inbox/prompts/20260926T120000Z-chatgpt-physiqueos-master-thread-handoff.md
agent-handoffs/reports/20260926T170800Z-healthkit-prospective-cardio-outdoor-walk-acceptance-PASS.md
agent-handoffs/STANDING_DISK_SAFETY.md

Prospective Cardio is now accepted. The Sep 26 Outdoor Walk arrived through normal automatic sync, preserved explicit isIndoorWorkout=false, canonicalized exactly once as outdoor_walking, presented as Outdoor Walk, passed Activity accounting, created no Logger/link/claim, and left strategic eligibility quarantined. Do not reopen this gate absent a regression.

Immediate task: diagnose the Sep 24 Strength reconciliation confirmation defect read-only first.

Founder flow on Build 60:
Pending Review showed Apple Health Traditional Strength Training around 11:22-11:50 and a possible Logger Traditional Strength Training session around 11:22-12:56 at 60% match.
Founder selected Use Logger session 1.
Expected: candidate relationship becomes confirmed, one Strength workout, no duplicate, review clears, detail shows confirmed relationship.
Observed: Workout Detail still showed Possible match with Workout Logger. Pending Review then showed Refresh required because the requested outcome could not be verified. Founder tapped Refresh Review and it did not resolve.
The later Cardio acceptance audit independently showed Sep 24 still candidate/unconfirmed at 60%, while two earlier Strength relationships remain confirmed and one-to-one integrity has no violations.

Preserve this exact production case. Do not ask Founder to submit the match again or repeatedly refresh.

Using established bounded owner-scoped read-only production procedures, prove:
the exact HealthKit Strength workout and Logger candidate;
whether the Founder action/command/audit record exists and what target/action it recorded;
idempotency/version/revision state;
whether any canonical relationship mutation occurred;
current relationship and claim state;
current Pending Review/queue state;
current Workout Detail projection;
the exact verification condition that produced Refresh required;
why Refresh Review does not converge;
whether root cause is Server write, Server projection/readback, Native verification/refresh, or a combination;
whether a retry would be safe/idempotent, without performing it.

Do not mutate production, manually confirm/replay reconciliation, change workout policy, alter strategic eligibility, regenerate historical artifacts, operate the Founder device, deploy, or prepare/upload Build 61 during diagnosis.

After root cause is proven, determine the smallest correct fix and whether the defect is severe enough that Build 61 should wait. Determine whether the fix is Server-only, Native-only, or both, and whether efcb8574 can remain the intended lineage or a reviewed descendant should replace it. Do not deploy or release without separate Founder authorization.

If code is required, produce a reviewed candidate with focused deterministic tests and stop at the appropriate gate.

Publish a GH report/pointer containing authority, zero-write status, root cause, relationship/action/queue/projection findings, why verification and Refresh failed, duplicate/idempotency risk, fix recommendation, Build 61 recommendation, candidate SHA if any, tests/review status, deployment/mutation/release status, and any required Founder action.

Keep Cardio strategic eligibility quarantined.

END HANDOFF.
