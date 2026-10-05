PhysiqueOS Build 87 — integrate accepted Redesign Batch 1 and upload to TestFlight

TASK TYPE

Continue in Codex A / existing Batch 1 implementation chat.
Use High reasoning.
Same chat.

Founder has now explicitly accepted the Redesign Implementation Batch 1 visuals after reviewing them during the patch.

DO NOT begin Batch 2.
Claude Batch 2 remains parked at PREP ONLY.

GOAL

Create the next Native build containing:
- everything already in Apple-VALID Build 86;
- the Founder-accepted Batch 1 redesign implementation for Home + Goals + You/Settings;
- nothing else.

Then archive and guarded-upload it to TestFlight for physical-device acceptance.

AUTHORITIES

Build 86 base:
cec8af20a6121bb66ecca3ba9f667d91774a891c
Version 1.0 (86), Apple VALID.

Accepted Batch 1 implementation:
c4a74ad0855a0500e42a90a81d6f4a871e5cc3c5
Branch:
codex/redesign-batch1-home-goals-you-20261005

Batch 1 report:
agent-handoffs/reports/20261005T024500Z-redesign-implementation-batch1-home-goals-you.md

Main report publication:
ab173560e2258cc1ae9045452efc0b1be8ad1d0f
Authority correction:
591fbd53618944b98f244370ef53bd9e04517915

Founder acceptance in chat supersedes the report's earlier review gate: Batch 1 is now accepted for physical-device build validation.

SERVER

Do not change Server.

Current production includes:
- Sleep/V3 graduation;
- Option A confirmed Strength presentation.

Reverify current exact production Server authority only for reporting; no deployment.

BUILD NUMBER

Build 86 is already uploaded and VALID.
Use Build 87 unless release-state inspection proves 87 is already consumed.

Target:
1.0 (87)

INTEGRATION

Use the accepted Batch 1 implementation exactly.

Do not add Batch 2.
Do not redesign additional surfaces.
Do not opportunistically fix unrelated backlog items.

Preserve Build 86:
- Watch/HealthKit automatic workout recording;
- Watch latency fix/instrumentation;
- Foam Rolling pilot;
- System/Dark/Mineral Light infrastructure;
- Widget/Live Activity behavior.

Reverify no accepted Batch 1 commit accidentally regresses those areas.

PROJECT GENERATION

Update the canonical build number through the established generator.
Regenerate project files.
Prove regeneration is byte-identical after the intended Build 87 bump.

TEST GATES

Before archive run at minimum:
- Batch 1 focused Home tests;
- Goals tests;
- You/Settings/Appearance tests;
- Batch 1 UI/parity tests;
- shared appearance tests;
- Watch unit regression suite;
- Training/HealthKit regression subset sufficient to prove Build 86 workout behavior is untouched;
- Foam Rolling tests;
- full relevant Native unit suite;
- Release generic iOS compile including Watch, Live Activity and widget graph.

Known pre-existing failures from Build 86 may remain only if reproduced/classified identically. No introduced failures.

ARCHIVE

Archive the exact Build 87 candidate head using the established Xcode signing workflow.

Do not open/login to App Store Connect or Apple Developer in a browser.
If Xcode authentication is required, stop and tell the Founder exactly what is needed.

Verify archive contents:
- iPhone app;
- Watch app;
- Live Activity/widget extensions;
- all expected CFBundleVersion values = 87.

GUARDED TESTFLIGHT UPLOAD

Founder explicitly authorizes Build 87 TestFlight upload in this task.

Use the established guarded uploader:
1. dry run must report WOULD UPLOAD for com.physiqueos.native.dev 1.0 (87);
2. execute only with the exact required confirmation string;
3. capture delivery id;
4. poll until VALID or terminal failure.

Do not bypass guardrails.

PHYSICAL-DEVICE ACCEPTANCE PURPOSE

This build is specifically to validate the accepted Batch 1 redesign on the real iPhone before Batch 2 starts.

After VALID, instruct Founder to inspect:

HOME
- locked hierarchy/spacing/typography;
- current Goal/phase cards;
- progress treatments;
- priorities;
- Training Today;
- briefing presentation/visibility;
- navigation;
- Dark and Mineral Light;
- System appearance.

GOALS
- root;
- Your Journey;
- active Goal;
- completed Visible Abs Goal;
- progress bars;
- first/last real progress photos;
- navigation;
- Dark/Mineral.

YOU / SETTINGS
- locked You hierarchy;
- Goals and Operating Plan routes;
- Settings shell;
- Appearance;
- System/Dark/Light switching and persistence;
- no dead Profile/Data Sources/Sign Out destinations.

REGRESSION SPOT CHECK
- Log still works in its pre-Batch-2 form;
- Training Logger still opens;
- Foam Rolling still works;
- Watch app launches;
- widgets/Live Activity are not obviously regressed.

Do not require another workout solely for this build; Build 86 Watch workout physical acceptance can occur naturally on the next real workout.

REPORT

Publish:
- exact Build 87 candidate SHA;
- exact Batch 1 authority integrated;
- tests;
- Release compile;
- archive identity;
- TestFlight delivery id;
- final Apple status;
- production Server authority observed;
- physical acceptance checklist.

Update normal latest/reporting pointers.

WORKTREE RULE

Use the current authorized Codex worktree/workflow.
If Claude Remote Control is invoked for any reason, it must stay in its single RC-provided worktree and must not use EnterWorktree. But this task should remain Codex-owned unless existing release tooling requires otherwise.

STOP after Build 87 reaches VALID and the Founder has the physical-device checklist.

END TASK.