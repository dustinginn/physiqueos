PhysiqueOS Build 90 — integrate approved Claude A + Claude B Native candidates

Continue in the existing Build 90 integration/operator Claude Remote Control conversation if one exists. Otherwise use the current authorized Native integration conversation/work environment.

Do not create additional child sessions or unnecessary worktrees.

TASK TYPE

Native integration + validation only.

Do NOT bump Build 90.
Do NOT archive.
Do NOT upload TestFlight.
Do NOT deploy Server.
Do NOT mutate production.

AUTHORITIES

Shipped Build 89 base:
51399425b683d6a6e36b5c91836290259e31a7e0

Claude A Founder-selected implementation:
a14eb4c45ee602025cc7d666c96956b7972beac1

Claude A report:
2a643ec3d25cd3e07b0e7e9fa2a418f7cb924a0b

Claude B Energy + Recovery implementation:
8c3172e1e2493b025114f12cd8b0bdf2c58d484e

Claude B report:
cb3ae1b1e3d0bc0e076e94686f0f547817aacef8

Production Server remains:
b7eb1e397f0238df9ae904fd182ddbb51602e8d8

Codex progression work is separate and MUST NOT be included.

GOAL

Produce one exact clean pre-bump Build 90 Native integration candidate containing ONLY the approved Claude A and Claude B production changes on top of shipped Build 89, plus integration-only corrections if genuinely required.

Preserve all Founder selections and approved Energy/Recovery decisions exactly.

STEP 1 — SAFE STORAGE PRECHECK

Measure free space before integration/build work.

If below 25 GiB, reclaim space ONLY from clearly regenerable Xcode/test artifacts:
- PhysiqueOS DerivedData;
- stale PhysiqueOS xcresult/test bundles;
- regenerable build intermediates from completed lanes;
- completed dedicated test simulators only when shutdown and no active session uses them.

Do NOT delete:
- any Xcode Archive;
- any Git worktree/repository/source;
- review boards;
- credentials/config;
- production tooling;
- Founder media;
- iOS/watchOS runtimes;
- anything uncertain.

Target at least 25 GiB before full validation if safely achievable.
Do not chase a target by deleting uncertain files.

Record before/after free space and cleanup categories.

STEP 2 — EXACT SOURCE INTEGRATION

Start from exact shipped Build 89:
51399425b683d6a6e36b5c91836290259e31a7e0

Integrate exact Claude A candidate:
a14eb4c45ee602025cc7d666c96956b7972beac1

Integrate exact Claude B candidate:
8c3172e1e2493b025114f12cd8b0bdf2c58d484e

Use semantic integration, not blind textual conflict resolution.

Expected shared file:
AppEnvironment.swift
with disjoint intent:
- Claude A: Watch companion / launcher;
- Claude B: DEBUG Energy/Recovery fixture wrappers.

Preserve both.

Do not incorporate unrelated commits from either branch.

Do not incorporate:
- Codex progression candidate;
- production-access tooling;
- report-only GH main commits;
- Operating Plan redesign;
- DEXA appointment redesign;
- other backlog items.

STEP 3 — VERIFY APPROVED CONTENT

Claude A must preserve:

B90-1:
- Option A docked Logger stopwatch;
- WORKOUT clock when no rest;
- canonical rest timer when rest active;
- canonical End Rest;
- no phone Pause/Resume;
- hidden during Finish confirmation.

B90-2:
- Option B centered Watch handoff modal;
- Ready on Watch;
- truthful Watch launch semantics;
- Use without Watch;
- no re-prompt same workout;
- dismissal only on watchStartedAt;
- quiet On Watch state;
- large Ready for Watch card removed.

B90-3:
- Option B centered Photo comparison group;
- bounded stage;
- labels on photos;
- canonical interpretation card below;
- synchronized zoom/pan.

B90-4:
- true-centered Watch primary action;
- shared intended Idle/orphan impact;
- 49 mm / 42 mm fit.

Claude A defect fixes retained:
- Ready/start-clearing guard;
- Watch appearance-slot forwarding;
- fractional-second startedAt parsing.

Claude B must preserve all approved Energy/Recovery behavior:
- estimated expenditure wording + footnote;
- kcal;
- Sleep Window date labels + typical band;
- Try again;
- 44 pt Details/Hide;
- floating nightly Total Sleep floor;
- zero-based bar summaries;
- accepted chart arbitration;
- navigation fixes;
- all canonical Energy/Sleep semantics.

DEXA appointment dead end remains unchanged and explicitly backlogged to OP-A.

STEP 4 — REVIEW SEAMS / RELEASE SAFETY

Audit combined tree for:
- Claude A option-selection seams;
- Claude B design-capture seams;
- DEBUG fixtures;
- release-only leakage.

Allowed:
legitimate DEBUG-only test fixtures that compile out of Release.

Require 0 review/debug seam strings in shipping app, Watch and Widget/Live Activity binaries.

Do not remove legitimate Sandbox/test architecture merely because it is DEBUG-only.

STEP 5 — COMBINED TESTS

Run focused first:

iPhone:
- TrainingSessionAuthority;
- Training Logger;
- Watch handoff;
- Live Activity projection;
- Photo Briefing/inspection;
- Energy;
- Recovery/Sleep;
- navigation affected by both lanes.

Watch:
- Watch workout/session authority;
- Watch finish;
- appearance propagation;
- panel placement.

Then full:
- PhysiqueOSTests;
- Watch unit suite;
- relevant iPhone UI suites including Founder-selected Build 90 and Energy/Recovery;
- relevant Watch UI suite on 49 mm and 42 mm.

The known WCSession no-session harness limitation may remain only if byte-for-byte/behaviorally identical to Build 89 baseline and no new failure is introduced. Document precisely.

STEP 6 — RELEASE GATES

From the exact integrated source:

- generic iOS Release compile;
- embedded Watch app verification;
- Widget/Live Activity extension verification;
- verify_release_configuration.py;
- Release seam scan;
- generator determinism if project/generator inputs changed;
- git diff --check.

Do not bump build number.
Expected metadata remains 1.0 (89) at this pre-bump stage.

STEP 7 — STORAGE AFTER

Record free space after.

Remove only this integration lane's regenerable DerivedData/test products after validation if needed.

Do not remove Archives/worktrees.

STEP 8 — INTEGRATION CANDIDATE

Commit/push one clean pre-bump Build 90 integration candidate.

Report:
- exact integrated SHA;
- exact parents/input authorities;
- merge/integration method;
- any semantic conflict resolution;
- changed-file summary;
- full/focused tests;
- UI results;
- Release compile;
- seam scan;
- build/version remains 89;
- storage before/after;
- DEXA OP-A backlog confirmation;
- Codex progression excluded;
- Server unchanged;
- physical-device acceptance checklist;
- explicit recommendation READY FOR BUILD 90 RELEASE BUMP or HOLD.

Do not bump/upload even if green.

STATUS if green:
Build 90 Native integration candidate validated — ready for release bump authorization.

Notify:
PhysiqueOS Build 90 Native integration — candidate ready for Founder release decision.

STOP.

END TASK.