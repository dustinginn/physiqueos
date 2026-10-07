PhysiqueOS Training progression V1 — resolve strategy authority ambiguity and rerun bounded shadow

Continue in this current Codex conversation and current provided work environment.

Do NOT create/delegate to sub-chats, child tasks, additional Codex sessions, or additional worktrees.

CANDIDATE

Adaptive progression V1:
1b6687ffbf016575e674d12406200c3792eb90a7

Base eligibility candidate:
999a225a38ced9ddb16a65bbe840896472265468

Current production Server:
b7eb1e397f0238df9ae904fd182ddbb51602e8d8

Production-read tooling:
d789ce2770eda2f9bdb13a48bbc572901f2c61e2

Previous V1 report:
8ace3021941ed728785d5b796c9eaa7b8452e6e7

TASK

Resolve ONLY the fresh production Training protocol/current-version ambiguity that blocked the V1 shadow.

Do not modify V1 code unless this task proves a genuine code defect rather than an audit-query/projection issue.

Do not deploy.

AUTHORIZATION

Founder explicitly authorizes:

1. ONE narrowly bounded read-only Training authority diagnostic;
2. if and only if authority resolves unambiguously and matches supported V1 semantics, ONE bounded three-exercise production shadow in the same task.

No broader production exploration.

PRECHECK

Freshly verify:
- approved context;
- current app/deployment;
- no transitional deployment;
- web/worker source;
- public health/build.

Require production source exact b7eb1e39.

Stop on drift.

AUTHORITY DIAGNOSTIC

Use one owner-scoped REPEATABLE READ READ ONLY transaction.

Read ONLY fields required to resolve:

- active Training protocol records;
- active/current Training protocol version records;
- linkage keys between protocol and version;
- protocol status;
- version status;
- current-version pointer/reference if present;
- effective dates;
- category/type identifying Training;
- any superseded/deprecated/archive flags that affect executable authority.

Do not read exercise history in this diagnostic.

Do not emit:
- owner identifier;
- unrelated Operating Plan categories;
- notes/free text;
- credentials;
- raw JSON blobs.

Sanitize to:
- bounded counts;
- protocol IDs/version IDs only where necessary;
- statuses;
- linkage relation;
- effective date;
- whether exactly one executable Training authority exists.

COMPARE WITH PRODUCTION APPLICATION SEMANTICS

Trace the exact production code path that resolves the current active Training strategy.

Determine whether the failed V1 audit harness incorrectly assumed:
- one active protocol row AND one separately active version row;
- a status field that is not canonical;
- a current-version pointer shape different from production;
- multiple historical active-status rows where only one is executable by pointer/effective semantics;
- or another projection mismatch.

The diagnostic must use application semantics as authority.

OUTCOME A — HARNESS/QUERY MISMATCH

If production application semantics resolve exactly one executable Training strategy/version:

- document the exact mismatch;
- correct ONLY the shadow harness/query logic needed to mirror production authority resolution;
- add a local regression test for the authority projection;
- do not alter runtime progression semantics.

Then proceed to the three-exercise shadow.

OUTCOME B — REAL PRODUCTION AMBIGUITY

If production genuinely has more than one executable Training authority under current application semantics:

STOP.

Do not run exercise shadow.
Do not mutate strategy.
Publish the exact bounded ambiguity and recommended remediation.

THREE-EXERCISE SHADOW

Only after Outcome A is proven and corrected.

Use one bounded owner-scoped read-only transaction for exactly:
- pull_up
- cable_machine_front_raise
- spider_curl

Reuse the proven canonical Training evidence semantics from prior production reads.

Run:
CURRENT production b7eb1e39
vs
V1 candidate 1b6687ff

Report for each:
- eligibility
- selector invoked yes/no
- repSupported
- loadSupported
- progressionStep
- legacy suggested fields
- reasonCode/confidence

Expected from the previously audited evidence unless live evidence changed:

Pull-Up:
REP
+25 lb
4 x 8
same_load_rep_rebuild_supported

Cable:
REP
150 lb
4 x 11
same_load_rep_rebuild_supported

Spider:
Maintain
selector not invoked at 13/14 days

If live evidence changed, use actual current evidence and explain.

No raw sessions.
No unrelated exercises.
No production writes.

TESTS

If harness correction is required:
- add focused authority-resolution test;
- rerun V1 selector tests;
- focused progression;
- Phase 6 Training subset;
- git diff --check.

Do not rerun unrelated full suites unless needed.

DEPLOYMENT DECISION

If:
- authority is unambiguous under production semantics;
- V1 shadow is coherent;
- local gates remain green;

publish:
DEPLOY RECOMMENDATION READY

Otherwise:
HOLD / DO NOT DEPLOY

Do NOT actually deploy.

REPORTING

Publish main-visible report-only handoff with:
- authority root cause;
- whether production was truly ambiguous;
- harness correction if any;
- test result;
- three-exercise shadow;
- deployment recommendation;
- exact candidate/base/rollback identities;
- confirmation no deployment/mutation and Native Build 89/90 untouched.

Notify me and STOP.

END TASK.