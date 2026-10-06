PhysiqueOS production access portability — deterministic begin-frame newline + final zero-data retry

Continue in this current Mac Codex conversation and current provided work environment.

Do NOT create or delegate to sub-chats, child tasks, additional Codex sessions, or additional worktrees.

Continue from operational candidate:
9cf4c07947d0f4b8469d845065b9c03a67196e0f

Previous structural-diagnostics report:
6cd6da89360c1ec982c04f844c42a1eff6a5dca4

Progression candidate remains separate:
999a225a38ced9ddb16a65bbe840896472265468

TASK

Apply the smallest fail-closed framing correction supported by the structural diagnostics: make the controlled zero-data/audit payload force a deterministic line boundary immediately before the begin sentinel.

Do NOT broaden the parser to accept arbitrary same-line prefixes.

Then rerun all local tooling gates and perform ONE explicitly authorized zero-data Mac console-doctor retry.

If all three doctors pass, immediately complete the already-authorized bounded Training progression production verification and publish the deployment recommendation.

Do NOT deploy.

EVIDENCE

The last real-console attempt structurally proved:
- begin sentinel count = 1;
- end sentinel count = 1;
- success marker count = 1;
- zero-exit marker count = 1;
- end sentinel canonical and before marker;
- begin sentinel exists but is not a canonical standalone normalized line;
- carriage-return events = 7.

Working hypothesis:
recognized PTY/prompt framing precedes the controlled begin sentinel on the same normalized line.

PREFERRED FIX

Change controlled payload emission so an explicit line break is emitted immediately before the begin sentinel.

Requirements:
- begin sentinel becomes its own deterministic line;
- end sentinel remains unchanged/canonical;
- exact structured framing remains begin -> encoded payload -> end -> success marker;
- parser remains strict;
- no arbitrary prompt-prefix acceptance;
- no raw-output inspection;
- no weakened credential/output guards.

If implementation shows a leading newline alone cannot deterministically solve the PTY behavior, STOP before broadening parser tolerance and report why.

TESTS

Add synthetic fixtures matching the observed structural case:
- prompt/PTY framing + carriage-return behavior sharing the line before begin;
- explicit controlled leading newline isolates begin;
- split chunks;
- ANSI wrapping;
- all prior malformed/duplicate/missing/unexpected cases remain rejected.

Run:
- all production-access tests;
- lint;
- Node syntax;
- npm lock consistency;
- git diff --check.

Require green before real retry.

ZERO-DATA RETRY AUTHORIZATION

This task explicitly authorizes ONE additional zero-data Mac console-doctor attempt after local gates pass.

Use only existing:
physiqueos-final-cutover-config

No login.
No reauthentication.
No rotation.
No alternate context.

Run:
1. doctor local;
2. doctor control-plane;
3. doctor console.

Console scope only:
- runtime SHA verification;
- required binding presence booleans;
- one bounded DB connection;
- BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
- transaction_read_only=on;
- SELECT 1;
- explicit ROLLBACK;
- close;
- structured frame/marker;
- post-console authority/health check.

No Founder records/tables in doctor.

IF DOCTOR FAILS

STOP immediately.
Publish sanitized structural diagnostics.
No Founder read.
No further retry.

IF DOCTOR PASSES

Proceed immediately to progression production verification already authorized by prior tasks.

FOUNDER READ

One bounded Founder-owner REPEATABLE READ READ ONLY transaction.
Require transaction_read_only=on.
Parameterized bounded SELECTs only.
Explicit rollback before sanitized output.

Retrieve only:

A. Active Training Strategy/protocol/version:
- progression rule type;
- condition;
- action;
- successfulSessionsRequired;
- minimumExposureDays if present;
- exactly-one-active authority.

B. cable_machine_front_raise:
- recent finalized/non-superseded exact-context occurrences required for current load/prescription run;
- exercise identity;
- variant;
- relationship context;
- completed working-set profile;
- qualifying success count;
- first qualifying success;
- safe target-increment provenance.

C. one minimal expected-Maintain and one expected-Progression-Opportunity control if readily available.

No broad history dump.
No owner identifiers in report.
No writes.

SHADOW

Using identical sanitized rows compare current production b7eb1e39 and candidate 999a225a.

For Cable report:
- current state/action;
- candidate state/action;
- qualifyingSuccessfulSessions;
- successfulSessionsRequired;
- exposureStartDate;
- exposureDays;
- minimumExposureDays;
- count gate;
- exposure gate;
- exact context;
- target availability/provenance;
- progression-eligible NOW yes/no.

If eligible without safe increment:
progression_opportunity + consider_progression + target unavailable.

Never invent load.

Run bounded controls.

DEPLOYMENT DECISION

Combine production evidence with existing candidate gates:
- 128/128 focused progression;
- 167/167 Phase 6 Training;
- clean fast-forward;
- no migration/backfill;
- backward-compatible Native contract.

Publish explicit DEPLOY or DO NOT DEPLOY.

Do NOT actually deploy.

OPERATIONAL CANDIDATE

If doctor passes:
- publish updated operational candidate SHA;
- mark Mac Stage 1 real-console acceptance green;
- recommend operational tooling/runbook merge through normal review;
- PC parity remains later after PC context restoration.

REPORTING

Publish main-visible report-only handoff superseding 6cd6da89.

Include:
- exact newline framing change;
- tests;
- operational candidate SHA;
- doctor results;
- production authority;
- progression shadow if authorized;
- controls;
- DEPLOY/DO NOT DEPLOY;
- exact next action;
- no deployment / no production mutation / no Native Build 89/90 change.

Do not create sub-chats/worktrees.
STOP.

END TASK.