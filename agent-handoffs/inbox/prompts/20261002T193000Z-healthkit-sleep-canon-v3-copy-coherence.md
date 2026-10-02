HealthKit Sleep — sleep-canon-v3 coherent Oura revision fix and prospective-only correction

TASK TYPE

Claude Server-only correctness patch.

Founder explicitly authorizes fixing the P2 cross-revision Oura splice discovered by the Oct 2 prospective canary.

Do NOT change Native.
Do NOT enable strategic Sleep.
Do NOT wire Recovery.
Do NOT rewrite historical Sleep.
Do NOT alter historical Briefings, Confidence, Narrative, recommendations, or strategic artifacts.

READ FIRST

Canary audit:
agent-handoffs/reports/20261002T182755Z-healthkit-sleep-prospective-canary-audit.md

Sleep closeout:
agent-handoffs/reports/20261001T203806Z-healthkit-sleep-server-midnight-window-closeout.md

Recovery shadow:
agent-handoffs/reports/20261001T224516Z-recovery-briefing-v1-shadow-assessment.md

Durable backlog:
agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md

GH protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

PRODUCTION AUTHORITY

Reverify before work/deploy.
Canary audited production Server:
4ffde0f5faf1832decfbc09d822088aeba0dca89
deployment faaf66bd-930f-46a2-9b8e-77e604c23a86.

D0:
2026-10-02
America/Los_Angeles
validation_only
strategic Sleep quarantined.

A. DEFECT TO FIX

sleep-canon-v2 can splice two Oura revisions into one synthetic canonical night.

Observed prospective Oct 2:
- two Oura revisions;
- second write deleted some old samples but left others live;
- v2 selected 31 stale-revision intervals + 38 current-revision intervals;
- total asleep stayed close;
- stage composition/hypnogram became incorrect.

Synthetic reproduction showed a splice can erase deep sleep entirely even when both genuine revisions contain deep sleep.

Root path identified:
selectAuthoritativeLaneCopy -> partitionNonOverlapping
greedy interval partitioning can switch between distinct contiguous source copies at shared boundaries.

B. VERSIONING

Create sleep-canon-v3.

Do not silently alter v2 semantics in place.

Historical imported/canonical Sleep remains:
- sleep-canon-v2;
- display-only/quarantined;
- byte/content unchanged.

Prospective ordinary days on/after D0 may move to v3 only through the bounded prospective correction below.

C. COHERENT COPY SELECTION

Design a deterministic copy-selection algorithm whose primary invariant is:

A selected canonical lane copy must correspond to ONE coherent source revision/copy, not a boundary-by-boundary splice assembled from multiple revisions.

Because Oura revisions may lack an explicit revision identifier, infer coherent copies from interval topology/content conservatively.

Evaluate candidate approaches, including:
- maximal contiguous/abutting chains;
- continuation preference;
- segmentation consistency;
- whole-chain scoring;
- copy-level coverage/range;
- deletion/rewrite shape.

Required properties:
- no cross-copy switching at a shared boundary merely because intervals do not overlap;
- deterministic;
- stable under input ordering;
- preserves one genuine coherent copy when duplicate revisions overlap;
- does not double count;
- handles partial deletion of an old copy;
- handles differently segmented rewrite;
- preserves Oura source preference;
- fallback behavior for non-Oura/current other sources unchanged unless required by generic correctness.

Do not use heuristics that fabricate stages.

D. EXACT REPRO TESTS

Add permanent tests for:

1. Exact sanitized production shape:
partial deletion of revision A + differently segmented revision B.
Assert selected timeline belongs coherently to one revision and does not mix A/B.

2. Synthetic worst case from audit:
A and B both contain deep sleep but v2 splice yielded zero deep.
Assert v3 preserves a coherent real copy and deep > 0.

3. Identical duplicate copies.

4. Same total range, different segmentation.

5. Partial old copy + complete new copy.

6. Complete old + partial new.

7. Shared boundaries.

8. Input shuffled repeatedly -> identical canonical output.

9. Midnight crossing.

10. Oura + Apple Watch overlapping lanes -> existing preference semantics preserved.

11. No duplicate copy -> v3 equals intended v2 output.

12. Late update same canonical day identity.

E. ZERO-WRITE HISTORICAL INCIDENCE AUDIT — HARD GATE

Before any deploy/recompute:

Run v3 in zero-write comparison mode against the existing bounded historical validation corpus / historical Sleep inputs.

Measure:
- how many historical nights would differ v2 -> v3;
- how many appear to contain v2 cross-revision splice;
- asleep delta distribution;
- deep/REM/core/awake delta distribution;
- stage timeline changes;
- whether v3 ever chooses a lower-quality/incomplete copy where v2 was already coherent.

This is ANALYSIS ONLY.

Do not write v3 into historical rows.
Do not mutate the historical corpus.
Do not backfill.

Publish sanitized aggregate incidence.

GATE:
If v3 causes broad unexplained changes outside duplicate-revision nights, stop for review rather than deploy.

F. PROSPECTIVE OCT 2 PROOF

Against a read-only snapshot of the Oct 2 prospective inputs:

Compute v3 expected canonical output.

Compare:
- current stored v2;
- first Oura revision;
- current/latest coherent Oura revision;
- v3.

Required:
- v3 selects one coherent revision;
- no stale/current splice;
- stage totals match the selected coherent copy;
- no double count;
- same canonical sleep-day identity;
- timezone/window semantics unchanged.

Do not publish raw sample-level Founder data.

G. STRATEGIC ISOLATION TESTS

Before deploy prove:
- v3 prospective day remains strategicEligible=false;
- validation_only remains;
- no V3 evidence eligibility;
- no Goal Confidence;
- no Strategy Confidence;
- no Narrative;
- no recommendations;
- no Recovery publication;
- historical strategic artifacts unchanged.

H. REVIEW

Fresh independent review focused on:
- copy-coherence invariant;
- determinism;
- source preference;
- deletion semantics;
- late updates;
- midnight/date attribution;
- historical immutability;
- prospective-only migration boundary;
- strategic quarantine.

No unresolved P0/P1/P2 before deployment.

I. DEPLOY

If gates pass:
- deploy Server-only sleep-canon-v3;
- no policy change;
- no strategic eligibility change;
- no Native build.

Verify:
- active deployment;
- web/worker exact SHA;
- live/ready;
- schema unchanged unless genuinely required.

J. PROSPECTIVE-ONLY RECOMPUTE

After deployment, authorize one bounded correction:

Scope:
- owner Founder;
- ordinary prospective Sleep days >= 2026-10-02;
- currently expected only Oct 2, but discover exact bounded set first;
- NEVER historical rows before D0;
- NEVER historical validation corpus;
- NEVER Briefings/Confidence/strategic artifacts.

Before write:
- transaction/scope dry run;
- list sanitized affected day ids/count;
- expected v2 -> v3 changes;
- prove historical count affected = 0.

Write:
- use canonical supported recanonicalization path;
- same canonical day identity;
- update algorithm/version to sleep-canon-v3;
- preserve provenance;
- no duplicate day.

After:
- re-read day;
- fresh v3 recompute equals stored;
- Evidence read path reflects corrected stage timeline/totals;
- strategicEligible still false;
- no strategic artifact writes.

If more than the expected prospective bounded days are selected, STOP before mutation.

K. POST-DEPLOY CANARY STATE

Do NOT declare canary PASS.

After correction classify current status:
likely HOLD pending natural nights/background/artifact gates.

Record next gates:
- Oct 3+ natural nights under v3;
- at least 2, preferably 3;
- ideally duplicate-revision night to naturally prove v3;
- background closed-app observation;
- Oct 4 Weekly strategic-leak scan;
- later Midweek if needed;
- 14 prospective reliable nights before Recovery baseline can be meaningful.

L. TESTS

Run:
- canonicalizer unit/contract;
- ingest;
- deletion/manifest;
- strategic eligibility/quarantine;
- Evidence;
- historical validation;
- prospective correction;
- relevant full Sleep suite.

No Native/Xcode work.

M. BACKLOG

Update durable backlog:
- P2 splice fixed or blocked;
- sleep-canon-v3 authority;
- Oct 2 prospective correction status;
- canary returns to HOLD if defect resolved;
- exact remaining natural gates.

N. REPORT

Publish:
agent-handoffs/reports/<timestamp>-healthkit-sleep-canon-v3-copy-coherence.md

Include:
- root cause;
- v3 algorithm;
- tests;
- zero-write historical incidence;
- Oct 2 proof;
- review;
- deployed SHA/deployment if deployed;
- prospective-only mutation ledger;
- historical mutation = 0;
- strategic mutation = 0;
- Evidence result;
- resulting canary status;
- next natural gate.

MANDATORY GH PROTOCOL

Before every stop:
- push implementation authority;
- publish checkpoint/final report to origin/main;
- update latest pointers;
- fetch/reverify main;
- re-read exact report;
- provide exact main report commit SHA.

END TASK.
