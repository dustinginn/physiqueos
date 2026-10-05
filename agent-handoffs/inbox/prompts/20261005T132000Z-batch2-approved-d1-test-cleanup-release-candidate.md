PhysiqueOS Batch 2 — Founder accepts all checkpoints; deploy D1, clean test baseline, prepare release candidate

Continue in the EXISTING Claude Batch 2 Remote Control chat using High reasoning. Same chat.

MANDATORY WORKTREE RULE

Stay in the single RC-provided worktree.
No EnterWorktree.
No secondary worktree.

FOUNDER ACCEPTANCE

All Batch 2 visual checkpoints are ACCEPTED:

Checkpoint 1 — Log root: accepted.
Checkpoint 2 — active workout / set entry: accepted.
Checkpoint 3 — Logger entry / exercise selection: accepted.
Checkpoint 4 — review / finish / complete: accepted.
Checkpoint 5 — Workout Match L13: accepted.

Founder also explicitly confirms:
- Workout Complete confetti stays with existing one-time/Reduce Motion semantics.
- Suggested Today training-area prompt stays and appears when canonical Server suggestion data exists.

Do not reopen or reinterpret the approved designs.

CURRENT INTEGRATED NATIVE CANDIDATE

49733300672c0b52a06a2b3ee5435de49b76fd15

It includes:
- Build 87;
- accepted Batch 2 CP1–CP5;
- accepted Home correction;
- accepted You/Settings full-row tap fix.

Do not lose or redesign any of that work.

PART A — DEPLOY APPROVED SERVER D1

Founder explicitly authorizes production deployment of exact Server candidate:

c7c99347a520d13fd344fe89b6b1398877cdd255

Purpose:
typed Log Sources provenance and contextDetail contract already reviewed and accepted in Checkpoint 1.

Before mutation:
- reverify current production Server authority;
- verify the candidate can be safely fast-forwarded/reconciled if production has advanced;
- rerun required guarded checks/dry run;
- stop on unexpected drift.

Deploy through the established guarded production path.

Verify after deployment:
- exact deployed Server SHA;
- web and worker exact authority;
- /live;
- /ready;
- relevant logs;
- typed provenance contract;
- backward compatibility for Build 87 and older payload consumers;
- no unrelated production mutation.

If the tool still raises a narrow permission prompt, use the Founder authorization in this instruction where the workflow supports it. If explicit UI approval is unavoidable, notify Founder immediately and continue the safe Native cleanup work while waiting; do not invent a workaround.

PART B — FIX HOME BRIEFING TEST / ACCESSIBILITY IDENTITY REGRESSION

The overnight final gates found a Build 87 regression unrelated to Batch 2:

The first Home briefing now renders in HomeActionBriefingStrip but lacks the stable home.latestBriefing accessibility/test identity, so three Briefing acceptance journeys fail before entering the briefing.

Fix this narrowly.

Requirements:
- preserve the accepted Home visuals pixel-identically;
- preserve briefing visibility/persistence behavior;
- preserve navigation;
- restore a stable accessibility/test identity for the first briefing doorway;
- prefer assigning the established home.latestBriefing identifier to the actual first briefing control if semantically correct;
- do not duplicate identifiers when multiple briefing controls exist;
- keep VoiceOver semantics correct.

Acceptance:
- TrainingAcceptanceUITests.testBriefingParityJourneys passes on clean install;
- testFounderCorrectionMidweekTrainingResponseJourney passes;
- testFounderCorrectionWeeklyAndPhotoBriefingJourney passes;
- Dark and Mineral Home captures remain pixel-identical in the affected strip except unavoidable dynamic/system pixels;
- no briefing content redesign.

PART C — FIX THE PRE-EXISTING PEPTIDE FIXTURE FAILURE

Now address the long-carried failure:

PeptideSupportEditorViewModelTests.testSandboxChangeDoseKeepsHistoryAndPauseResumeWorkAgainstTheFixture

Goal:
make this deterministic and get the full Native suite genuinely green without changing shipping peptide behavior.

First reproduce and diagnose.

Determine whether the failure is:
- test clock/time-zone dependence;
- fixture date relation;
- stale expected presentation;
- asynchronous ordering;
- another deterministic test-infrastructure defect.

Preferred fix:
- inject/freeze the test clock/date where the production model already supports it;
- or make the fixture explicitly relative/deterministic;
- or correct a stale test expectation only if source semantics prove it is stale.

Do NOT alter real peptide protocol semantics merely to satisfy the test.
Do NOT change production dose/history/pause/resume behavior unless you discover a genuine shipping defect, in which case STOP and report before broadening scope.

Acceptance:
- the failing test passes repeatedly;
- relevant peptide editor suite passes;
- run the formerly failing test multiple times to prove it is no longer clock-sensitive.

PART D — CLEAN UP TEST-ORDER COUPLING IF SAFE

The overnight report identified six TrainingAcceptanceUI journeys that fail in combined suite order because an earlier test leaves a live workout, triggering the canonical Log-tab redirect. They pass individually on clean install and fail identically on Build 87.

Do not change product behavior.

If this can be corrected narrowly in TEST setup/teardown so each UI journey begins from its declared clean state:
- fix the test isolation;
- preserve canonical active-workout redirect behavior;
- prove the formerly order-dependent journeys pass together.

If fixing it would require invasive product changes or risky test harness changes, leave it documented and do not block release. Report why.

PART E — FINAL INTEGRATION / GATES

Rebase/reconcile the narrow cleanup commits onto the accepted integrated Native candidate without dropping:
- CP1–CP5;
- Home correction;
- You/Settings tap fix;
- Build 87 Watch/HealthKit/Foam/appearance/widget/Live Activity behavior.

Run:
- complete PhysiqueOSTests;
- PhysiqueOSWatchTests;
- TrainingAcceptanceUITests on clean install;
- Logger parity journeys;
- Home/Goals/You appearance/acceptance tests;
- relevant briefing tests;
- peptide suite;
- full required Batch 2 regression gates from the overnight report;
- generic iOS Release compile including Watch, Live Activity and widget graph;
- project generator byte-stability.

Target:
- zero unexplained Native unit failures;
- Watch 47/47 or current exact expected count, all passing;
- no introduced UI-test failures;
- Release compile success.

Do not hide failures by deleting assertions or skipping tests.

PART F — RELEASE CANDIDATE PREP ONLY

If all required gates pass:
- prepare the exact integrated Native release-candidate SHA;
- recommend Build 88 as the next build number if 88 remains unused;
- verify release-number availability/readiness;
- do NOT bump/archive/upload unless needed solely for a non-shipping dry-run and do NOT consume Build 88;
- do NOT upload TestFlight in this task.

Publish a concise final report stating:
- all five checkpoints Founder-approved;
- Server D1 deployed authority/status;
- Home briefing identity fix;
- peptide fixture root cause/fix;
- test-order coupling disposition;
- exact integrated Native candidate SHA;
- full test results;
- Release compile;
- remaining known open defects;
- recommendation for Build 88.

KNOWN OPEN PRODUCT DEFECTS — DO NOT FIX HERE

Keep these separate unless they unexpectedly block the gates:
- Watch Complete Set offered while phone is in Review/Confirmation;
- timed-set Watch projection issue;
- Logger hidden error copy.

NOTIFICATIONS — MANDATORY

Whenever Claude stops or requires Founder input for any reason, send a notification.

At successful completion notify:
PhysiqueOS Batch 2 — approved release candidate ready for Build 88.

If Server deployment needs unavoidable Founder interaction, notify immediately but continue safe Native cleanup where possible.

WORKTREE

Single RC-provided worktree only.
No EnterWorktree.
No secondary worktree.

STOP after the approved Batch 2 release candidate is cleanly prepared and reported. Do not upload TestFlight.

END TASK.