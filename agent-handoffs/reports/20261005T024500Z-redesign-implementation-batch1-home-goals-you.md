# Redesign Implementation Batch 1 — Home, Goals, You / Settings

Status: **Founder-approved implementation candidate; ready for downstream integration.**

## Authority

- Repository: `dustinginn/physiqueos`
- Build 86 Native base: `cec8af20a6121bb66ecca3ba9f667d91774a891c`
- Prompt: `f4bd9c50c6a0132d700f41cb894788e5a61d8ff6`
- Implementation branch: `codex/redesign-batch1-home-goals-you-20261005`
- Exact pushed implementation commit: `c4a74ad0855a0500e42a90a81d6f4a871e5cc3c5`
- Server: unchanged

## Implemented

- Founder-locked Home loaded composition and current navigation/behavior.
- Founder-final Home corrections: no Phase 2 progress track; continuous amber-to-green phase timeline; quieter support arcs/rules; corrected display-name scale; larger confidence ring; compact two-line guardrail; edge-to-edge trajectory field; and removal of the redundant purple briefing eyebrow by explicit Founder override.
- Goals root, active Goal, completed Goal, active/completed phase detail, journey/progress/guardrail treatments.
- You root, Settings shell and existing System / Dark / Light Appearance flow.
- Shared Batch 1 redesign semantic tokens layered on Build 86 global appearance infrastructure.
- DEBUG-only deterministic Home review fixture and route selection. Production projection and semantics are unchanged.

Profile writes, Data Sources / Apple Health projection and Sign Out remain deferred. Their rows are not exposed as dead actions. Log, Training Logger, Evidence, Briefings, Operating Plan redesign implementation, remaining Priority Detail and widgets remain outside this batch.

## Founder review artifacts

- Primary: `agent-handoffs/artifacts/redesign-implementation-batch1-20261005/primary-mobile-review-board.png`
- Home: `agent-handoffs/artifacts/redesign-implementation-batch1-20261005/home-parity-board.png`
- Goals: `agent-handoffs/artifacts/redesign-implementation-batch1-20261005/goals-parity-board.png`
- You / Settings: `agent-handoffs/artifacts/redesign-implementation-batch1-20261005/you-settings-parity-board.png`
- Mobile index: `agent-handoffs/artifacts/redesign-implementation-batch1-20261005/index.html`
- Parity matrix: `agent-handoffs/artifacts/redesign-implementation-batch1-20261005/PARITY-MATRIX.md`
- Full-resolution captures: `agent-handoffs/artifacts/redesign-implementation-batch1-20261005/screens/`

All captures are from an iPhone 17 Pro simulator in Dark and Mineral Light. Home was recaptured after the final Founder corrections and explicitly approved in chat.

## Validation

- Focused exact-candidate tests: HomeReadModelTests, GoalsReadModelTests, GoalsSandboxStoreTests and SharedUITests — PASS.
- Full exact-candidate `PhysiqueOSTests` run: one failure, identical deterministic Build 86 pre-existing failure: `PeptideSupportEditorViewModelTests.testSandboxChangeDoseKeepsHistoryAndPauseResumeWorkAgainstTheFixture` (`Paused` expected; nil received). No peptide source changed in this batch.
- Generic Release iOS compile — **BUILD SUCCEEDED**, including `PhysiqueOS`, `PhysiqueOSWatch` and `PhysiqueOSLiveActivity` dependency graph.
- `git diff --check` — PASS.
- Server tests: not applicable; Server unchanged.
- TestFlight: **not uploaded**.

## Safety / integration

- No Server behavior or production data changed.
- No Build 86 Watch / HealthKit workout behavior changed.
- The exact implementation stays on its pushed feature branch because current `origin/main` is the documentation/design coordination line and does not contain the Build 86 Native tree at the same paths. Review artifacts and this report are published directly on main.
- Rollback is the single implementation commit on the feature branch.

Recommended next family after Batch 1 integration: locked Log + Training Logger Batch 2, using this candidate’s semantic tokens and components.

IMPLEMENTATION_COMPLETE: YES · FOUNDER_APPROVED: YES · HOME_FINAL_CORRECTIONS_APPLIED: YES · DARK_MINERAL_PARITY_CAPTURED: YES · FOCUSED_TESTS_PASS: YES · FULL_NATIVE_SUITE_ONE_PREEXISTING_FAILURE: YES · RELEASE_COMPILE_PASS: YES · SERVER_CHANGED: NO · WATCH_HEALTHKIT_CHANGED: NO · TESTFLIGHT_UPLOADED: NO · MAIN_VISIBLE_ARTIFACTS: YES
