PhysiqueOS Build 85 — first real Build 84 Watch workout acceptance corrections

TASK TYPE

New Codex chat.
Use Extra High reasoning.

Audit today's real physical workout first, then implement only proven fixes/polish.
This work runs in parallel with the separate Home UI/design exploration. Do not mix the projects.

STARTING AUTHORITY

Reverify current origin/main and current Native authority before branching.

Installed Founder build:
Native Build 84
source bcd92c74602695766c270fe6af052de45afece4b
TestFlight delivery a4b7b504-e0ba-4cb5-9909-3e01cc8156d5
VALID and installed.

Build 83 Watch implementation/final:
agent-handoffs/reports/20261003T055504Z-build83-server-d3-native-testflight-final.md

Build 84 DEXA changes are additive and must remain intact.

Current production Server:
b47663b32372a78010dbc8e4aa41303012d98dc7
Reverify before any production read.
Do not deploy Server changes unless a proven defect requires them and a separately reviewed/authorized gate is reached.

TODAY'S FOUNDER PHYSICAL ACCEPTANCE

Founder completed a real strength workout using PhysiqueOS Watch + phone on Build 84.

Overall assessment:
much better experience.
Core Watch workout experience appears successful.
Only the findings below were noticed.

Preserve everything that worked.

FINDING 1 — WATCH DISPLAY-INACTIVE / REACHABILITY SEMANTICS

Founder observes that EVERY TIME the Watch display is not actively on / enters inactive Always-On presentation, the Watch execution UI shows:

OFFLINE · HEALTH ON

When the display wakes, normal connectivity presentation returns.

There was also an earlier Watch disconnect/display-state observation during today's workout. Treat these as potentially one lifecycle/reachability issue until proven otherwise.

Problem:
The UI must not equate watchOS inactive/Always-On presentation or temporary WCSession interactive-message unreachability with a genuine phone/authority disconnection.

Audit:
- WCSession activation/reachability state;
- isReachable usage;
- Watch app scenePhase/display lifecycle;
- extended runtime/workout session lifecycle;
- applicationContext/userInfo/file transfer availability;
- last successful authoritative phone projection/ack;
- stale thresholds;
- reconnect behavior;
- any logic that changes status solely because display becomes inactive;
- whether structured mutations actually fail during the dimmed state or only the label changes.

Determine whether there are TWO defects:
A. presentation-only false OFFLINE;
B. actual command/transport disconnect when display sleeps.

Do not assume.

Desired semantics:
- healthy normal operation should not show OFFLINE merely because immediate interactive messaging is unavailable;
- connectivity warning should surface only when there is actionable evidence that phone authority/reconciliation is unavailable;
- HealthKit workout recording state remains separately meaningful;
- do not hide a real structured-authority outage;
- preserve fail-closed structured mutations when authority genuinely cannot be reached.

Prefer no connectivity warning during healthy operation and a clear warning only for confirmed/stale communication failure.

Add deterministic lifecycle/reachability tests including inactive display transitions.

FINDING 2 — WATCH-ORIGINATED WORKOUT INCORRECTLY ENTERED GENERIC WORKOUT MATCH REVIEW

After today's workout completed, Founder received:

WORKOUT MATCH
Pending Review

Apple Health workout:
Traditional Strength Training
11:53 AM - 12:58 PM

Possible Logger session:
Logger session 1
Traditional Strength Training
11:53 AM - 12:58 PM
95% match · Logger time window

Buttons:
Use Logger session 1
No match

Founder has intentionally LEFT THIS PENDING REVIEW UNTOUCHED.

DO NOT resolve, confirm, dismiss, or mutate this review before completing the audit.

This workout was not an arbitrary Apple Health strength workout.
PhysiqueOS itself initiated the Watch-owned HealthKit workout from the phone-prepared structured Logger session.

Expected architecture:
PhysiqueOS Watch-started Logger session
-> trusted exact Watch/HealthKit correlation
-> one canonical workout / physiology association
-> existing structured Logger evidence retained
-> NO generic heuristic Workout Match review.

Manual Workout Match remains appropriate only for genuinely ambiguous/untrusted workouts, such as an independently started Apple Workout near a Logger session.

AUDIT THIS REAL INCIDENT READ-ONLY

Use approved production read-only path and exact runtime authority gates.

Inspect only the bounded records needed for today's Founder workout.

Prove:
- structured Training session identity;
- Watch session/correlation identity;
- HealthKit workout observation identity/provenance;
- canonical workout/link/claim state;
- trusted exact correlation metadata;
- whether trusted bundle allowlist/correlation path is enabled;
- why exact correlation did or did not fire;
- why the generic matcher created a 95% pending review;
- whether any duplicate canonical workout/evidence currently exists;
- whether today's Training evidence is already saved exactly once;
- whether HealthKit physiology is currently associated or waiting;
- whether the pending review can be safely auto-resolved after a fix, or should be left for Founder action.

Do not expose private raw identifiers in GH reports; sanitize them.

Review the Build 83 intended exact-correlation contract and compare it to actual production state.

Important:
The old Build 83 acceptance language included an independent post-acceptance review before enabling the production trusted Watch bundle allowlist. Determine whether that gate is the reason the exact path did not activate.

If the trusted correlation code is correct but the production allowlist/policy remains intentionally disabled:
- prove that;
- prepare the exact safe enablement operation;
- independently review it;
- STOP for Founder authorization before production mutation.

If there is a code defect:
- implement/test the smallest correction;
- do not mutate today's pending review until separately authorized after root cause is proven.

If today's pending review itself is useful as the bounded repair target, prepare a dry-run repair contract but do not apply it without explicit authorization.

Hard invariants:
- exactly one Training save;
- exactly one Apple Health workout;
- no duplicate performed Training evidence;
- exact trusted PhysiqueOS Watch workout wins over heuristic matching;
- foreign/untrusted Apple Health workouts still use generic reconciliation;
- spoofed metadata cannot claim trusted correlation;
- second exact claim fails closed;
- HealthKit physiology can associate without duplicating Logger evidence.

FINDING 3 — PERFORMANCE RECORD CELEBRATION WORKED; MAKE CONFETTI BIGGER

Founder physically confirmed PR celebration worked.

Workout-confirmed screen correctly showed:
Bicep Curl Machine
Session volume record 7,500 lb
Previous 7,200 lb; improved by 300 lb
Reps-at-load record 15 reps at 125 lb
Previous 13 reps at this load

This closes the functional PR-celebration acceptance for these supported record types.

Polish request:
make the confetti noticeably larger / more celebratory.

Audit current confetti implementation and increase visual presence without:
- obscuring the PR details;
- creating a long blocking animation;
- harming Reduce Motion behavior;
- replaying celebration on navigation/background/relaunch;
- changing PR detection semantics.

Keep the existing green performance-record treatment unless a tiny compatibility adjustment is needed.

This is polish, not a redesign.

OTHER BUILD 83/84 ACCEPTANCE

Do not reopen already-correct behavior without evidence.

Today's overall workout experience was substantially improved.

Preserve:
- Watch workout execution;
- set completion;
- phone editing behavior;
- pause/resume;
- Finish confirmation;
- bounded finish/recovery behavior;
- rest-stop behavior;
- Saved summary/Done behavior;
- metrics ordering;
- Daily Totals;
- Crown paging;
- green progress;
- cardio/cooldown classification;
- DEXA Build 84 functionality;
- Sleep v3 behavior.

HOME UI EXPLORATION IS SEPARATE

Another Codex chat may be producing Home design mockups.

Do not edit Home styling, global design tokens, app palette, typography system, navigation styling, or shared visual primitives in a way that interferes with that exploration.

If confetti uses a shared token, make the narrowest local change possible.

AUDIT FIRST

Before coding:
1. establish exact Build 84 source;
2. inspect relevant Watch/phone/Server code;
3. perform bounded production read-only incident audit for today's workout;
4. publish an early GH checkpoint with root cause(s);
5. state whether any Server/policy production mutation is required.

Then implement Native-only corrections that are clearly proven and safe.

SERVER/POLICY GATE

No Server deployment or production configuration mutation is pre-authorized.

If trusted Watch correlation requires enabling a production allowlist/policy:
- produce exact candidate/mutation;
- dry-run;
- fresh independent review;
- publish Founder authorization request;
- STOP at that gate.

Do not work around it with heuristic auto-match.

BUILD 85

If the proven fixes can be completed Native-only without a production mutation:
- create a Build 85 candidate;
- run focused + relevant regression suites;
- fresh independent review;
- archive;
- guarded TestFlight upload may proceed only if existing release policy permits; otherwise stop at exact reviewed candidate for Founder authorization.

If a production allowlist/policy gate is required, coordinate Build 85 so it remains safe before and after that activation.

TESTS

Watch reachability:
- active display + reachable;
- inactive/Always-On transition;
- isReachable false while applicationContext remains viable;
- genuine phone unavailable;
- stale authoritative projection threshold;
- reconnect;
- command while genuinely unavailable fails closed;
- command after reconnect succeeds;
- HealthKit session remains independent.

Trusted workout correlation:
- PhysiqueOS Watch-created workout exact match bypasses heuristic review;
- exact identity mismatch fails closed;
- foreign Apple Health strength workout still enters normal matcher;
- duplicate exact claim rejected;
- replay/idempotency;
- app kill/relaunch;
- delayed HealthKit delivery;
- phone/Watch reconnect;
- no duplicate Training evidence;
- one canonical workout;
- one physiology association.

PR celebration:
- supported PR triggers once;
- larger confetti;
- no replay;
- Reduce Motion;
- background/navigation lifecycle.

Regression:
- Build 84 DEXA writeback;
- Sleep v3 decoding;
- Activity/Cardio;
- Live Activity;
- Watch cancel/finish;
- Training Logger.

BACKLOG

Update durable backlog:
- PR celebration functional physical acceptance PASS; larger-confetti polish pending/shipped as facts warrant;
- Watch Build 84 physical acceptance generally PASS with these focused corrections;
- false offline/display-state issue;
- exact Watch workout reconciliation issue;
- do not duplicate items.

REPORTING

Publish:
agent-handoffs/reports/<timestamp>-build85-watch-physical-acceptance-corrections.md

Before every stop:
- push coherent work;
- publish GH main checkpoint;
- update latest pointers;
- fetch/reverify;
- re-read exact report;
- provide exact main report SHA.

END TASK.
