PhysiqueOS handoff housekeeping — Founder-authorized merge + guarded publisher installation

Continue in the SAME Claude handoff/release-authority housekeeping conversation and current Remote Control-provided worktree.

Do NOT create another session, child task, sub-chat, agent, or worktree.

FOUNDER AUTHORIZATION

Founder approves both recommendations from the housekeeping report:

1. Merge housekeeping candidate:
a60f98f0

2. Install the reviewed guarded publisher patch into the Mac's PhysiqueOS release tooling.

Housekeeping report:
cc2f00f9aac63a42ef2559e1de152b4fd6028e76

Original housekeeping task:
b36fe01b30d580d6195eaf0d7250d46a7658de2f

GOAL

Close the handoff/release-authority housekeeping issue by:

- safely integrating the reviewed housekeeping candidate into main;
- restoring latest.json/latest.md to accepted Build 90 release authority;
- installing the guarded publisher behavior;
- proving normal report publication leaves latest unchanged;
- proving explicit valid release-authority publication can still move latest;
- preserving all product/source/release safety boundaries.

NO PRODUCT WORK

Do not change:
- Native app source/behavior;
- Server source/behavior;
- production;
- Build 91/92 product candidates;
- Xcode builds;
- TestFlight;
- archives;
- credentials.

STEP 1 — FRESH MAIN AUTHORITY

Fetch origin.

Record current origin/main.

Determine whether a60f98f0 is still a clean fast-forward.

If main moved since the housekeeping candidate:
- rebase/recreate ONLY the single reviewed housekeeping change onto fresh origin/main;
- preserve all intervening main reports/prompts;
- do not overwrite/delete any newer timestamped report;
- ensure latest restoration remains Build 90;
- rerun every housekeeping guard/test;
- produce a new exact candidate SHA.

Never force-push.

If conflicts extend outside:
agent-handoffs/**
docs/CODEX.md
STOP and report.

STEP 2 — VERIFY HOUSEKEEPING DIFF

Before main mutation require changed paths only within:
- agent-handoffs/**
- docs/CODEX.md

Require:
- latest.json/latest.md restore Build 90 accepted release;
- Build 91/92 timestamped reports remain;
- RELEASE_AUTHORITY.md present;
- README protocol restored;
- reporting standard updated;
- guard + tests present;
- no app/Server/config/infrastructure product change.

Run:
python3 -m unittest discover -s agent-handoffs/tools -p 'test_*.py' -v

Require 17/17 or updated equivalent all green.

Run:
release_pointer_guard.py against fresh main -> candidate.

Run:
git diff --check.

STEP 3 — FAST-FORWARD MAIN

Only after all gates pass:

Push exact reviewed/rebased housekeeping candidate to:
refs/heads/main

Normal fast-forward only.

Immediately fetch/read back origin/main and require exact expected SHA.

Do not modify any product/release branch.

STEP 4 — VERIFY LIVE MAIN POINTER

Read main:
agent-handoffs/latest.json
agent-handoffs/latest.md

Require:
- task = Build 90 accepted TestFlight release;
- native SHA = 32baf1d5f43120cd07088df1210e1dc84ed26a78;
- build = 90;
- TestFlight delivery = 68dc945f-cfaa-43bb-a1ff-d0020fed54ff;
- report = agent-handoffs/reports/20261007T025954Z-build90-testflight-valid.md;
- historical Server-at-release snapshot remains the Build 90 snapshot as documented;
- current live Server e7ffc671 is NOT incorrectly mixed into the immutable Native release pointer.

STEP 5 — INSTALL GUARDED PUBLISHER PATCH

Use the reviewed candidate artifacts:

- agent-handoffs/tools/release_pointer_guard.py
- agent-handoffs/tools/physiqueos-handoff-publish.release-authority.patch
- RELEASE_AUTHORITY.md instructions.

Before changing installed tooling:
- locate exact current ~/.physiqueos-release/bin/physiqueos-handoff-publish;
- record checksum;
- create a local rollback backup in the established tooling backup location or a clearly named adjacent backup;
- do not expose credentials/secrets;
- verify patch applies exactly to expected installed version.

Install/copy:
release_pointer_guard.py
into the reviewed ~/.physiqueos-release/lib/ location.

Apply the reviewed publisher patch.

If patch does not apply cleanly:
STOP.
Do not hand-edit around unexpected drift.

Do not change git push permissions or Claude allow rules.

STEP 6 — INSTALLED TOOL VALIDATION

Run non-mutating/dry-run validation using the INSTALLED tool.

A. Normal report-only task:
- dry-run publication;
- require mode report-only;
- require latest.json/latest.md unchanged;
- require only additive reports-path behavior;
- no main push.

B. Invalid non-release task with release-authority mode:
- require refusal.

C. Explicit synthetic valid next Native release with release-authority mode:
- dry-run only;
- require guard accepts a forward build/release transition;
- do not actually change latest or main.

D. --readme legacy behavior:
- require refusal/retired behavior.

E. Re-run repository 17-test guard suite.

STEP 7 — ROLLBACK SAFETY

If installed publisher validation fails:
- restore exact pre-install publisher from backup;
- restore/remove installed guard library as needed;
- verify checksum equals original;
- leave the repository housekeeping merge intact if that merge itself was already green;
- report tooling installation failure.

Do not leave a partially patched installed publisher.

STEP 8 — PERMISSION CONTRACT

Do not attempt to broaden external Claude/Remote Control permissions.

Confirm:
- repository has no safe external classifier control;
- no broad git push allow rule was added;
- the guarded publisher is now the durable narrow enforcement mechanism available locally;
- report-only publication still requires whatever external execution authorization the classifier requests, but the tool itself enforces content scope.

STEP 9 — REPORT

Publish a NEW additive report-only file under:
agent-handoffs/reports/

Use the newly installed guarded publisher in normal report-only mode if practical.

This report MUST NOT move latest.json/latest.md.

Report:
- main before;
- merged housekeeping SHA;
- main after;
- latest pointer verification;
- original installed publisher checksum;
- backup identity;
- installed publisher checksum;
- installed guard identity;
- dry-run results A-D;
- guard tests;
- rollback status;
- confirmation latest remained Build 90 after the completion report;
- confirmation no product/Server/production/TestFlight/build/archive change.

If external permission classifier blocks the final additive report push:
use the already Founder-approved narrow report-only publication contract:
one commit adding only new file(s) under agent-handoffs/reports/, modifying no existing file, fresh normal fast-forward, stop on any delta.

Do not modify latest for this completion report.

Final status:
Handoff release-authority housekeeping installed and verified.

Notify:
PhysiqueOS handoff housekeeping — merged, publisher guarded, release pointer verified.

STOP.

END TASK.