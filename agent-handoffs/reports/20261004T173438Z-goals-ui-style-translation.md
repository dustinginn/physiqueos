# Goals UI style translation — Founder review checkpoint

Generated: 2026-10-04T17:34:38Z  
Agent: Codex  
Status: **complete design exploration; Goals pending Founder review**

## Outcome

The complete current Founder Production Goals hierarchy has one direct translation into the locked PhysiqueOS design family in dark and mineral light. This is not a multi-direction exploration.

Review root:

- `agent-handoffs/artifacts/goals-ui-style-translation-20261004/`
- start: `agent-handoffs/artifacts/goals-ui-style-translation-20261004/comparison-board.html`
- artifact checkpoint: `a45c5609eb47621af89e0d02606389f0c4846c05`

## Locked-design record

Recorded as locked and not reopened:

- Home;
- Log Compact Command Center, including dense Logged Today and bottom-collapsed Sources;
- Weekly and Midweek;
- Monthly with closing Coach's Take / Strategic Summary and no redundant hero Goal/Phase tags;
- DEXA with field-specific units and full Goal/Phase body-composition breakdown;
- Photo with its exact five-section flow and existing single-photo inspection.

Photo's simultaneous paired Previous/Current comparison viewer with synchronized zoom/pan remains required implementation behavior because Build 85 does not provide it. Nutrition and Activity are accepted as good in their separate lane and were not reopened.

## Source authority and audit

Native Build 85 authority: `b8ee8690b194cb90086f6f62816b9a2c8c400dc026`  
Production Server authority: `3c0f4aefddbb9a6886f6ad012443978303d47024`  
Prompt authority: `31e8f9ce413b674ff8f3cfc77794209c88f34cfd`

Audited current source:

- `GoalsView`
- `GoalDetailView` / `ActiveGoalCurrentStateSections`
- `GoalPhaseDetailView`
- `CompletedGoalDetailContent`
- `GoalsReadModel`
- `ProductionDailyDriverAPI` Goal mappings
- `ProgressPhotoTile`
- Goal edit, transition, strategy and protocol screens for reachability
- Server `ActiveGoalCurrentStateService` / production read proofs
- Server `CompletedGoalPreviewService`

Current Founder Production exposes root, active Goal, active/completed phase detail, completed Goal and loading/failed/unavailable states. It does not permit product writes. Edit/transition/protocol screens are sandbox-only or routed unavailable and are not presented as production UI.

## Render coverage

The package contains 18 full-resolution PNGs across 9 surfaces and both appearances:

1. Goals root;
2. active Build Lean Mass;
3. current Phase 2;
4. completed Phase 1;
5. completed Visible Abs at Rest;
6. Your Journey focus;
7. completed first/final photo focus;
8. Goal / Phase / Guardrail relationship;
9. loading / error / empty-read-only / unavailable states.

The concise coverage board and complete matrix are:

- `screens/goals-root-dark-light.png`
- `screens/active-goal-dark-light.png`
- `screens/phase-details.png`
- `screens/completed-goal-dark-light.png`
- `screens/journey-photos-focus.png`
- `screens/goal-phase-guardrail.png`
- `screens/states-dark-light.png`
- `COVERAGE-MATRIX.md`

## Design translation

- The active Goal uses the locked immersive teal/navy trajectory field and keeps the exact current-state order: Hero → Your Journey → Body Composition → Guardrail → Training → Turning Points → Coach's Take.
- Phase 1 and Phase 2 remain sequential on a progress rail.
- Guardrail is a cyan cross-phase band explicitly labeled persistent and is never drawn as Phase 3.
- Completed state uses amber achievement cues without making every surface a card.
- Mineral light uses selective teal, cyan, amber and blue fields to preserve the locked rhythm instead of becoming a wall of white.
- Purple remains a brand/section/navigation accent rather than carrying status meaning.

## Canonical-content proof

`source/render-and-validate.mjs` passed:

- 402 pt width for every render;
- exact dark/light text parity per surface;
- exact active Goal destination, Confidence thesis/provenance, composition table, progress, Guardrail, Training, turning points and Coach's Take;
- exact completed Goal recap, milestones, final composition, achieved-by list and unlocked relationship;
- exact first/final photo roles and dates;
- correct Goal/Phase/Guardrail distinction;
- representative loading/error/empty/unavailable coverage.

Result: `validation.json` → `pass: true`, `screenCount: 18`, `shippingChanges: false`.

## Current implementation boundaries

1. Historical completed phases receive status/dates/progress from the production adapter but no purpose/evidence/strategy/success/guardrail arrays. The design conditionally omits empty groups; it does not invent phase copy.
2. `SupportingObjectiveDetailContent` exists, but the production adapter only resolves active/completed Goal IDs. Supporting objective detail currently reaches unavailable.
3. Completed Goal photos now receive correct authenticated production `mediaId` bindings. The harness redacts Founder pixels while preserving the first/final role requirement. `ProgressPhotoTile` itself is not tappable/expandable in the Goals surface.
4. Phase edit/transition semantics exist only behind non-production write capability and remain excluded.

## Accessibility / feasibility

The proposed hierarchy preserves 44 pt actions, visible and spoken phase status, numeric progress semantics, static Confidence semantics, role/date photo labels and a Dynamic Type stacking path for composition metrics. Implementation can reuse the locked Home hero/timeline grammar plus current Goal primitives; the main new reusable seams are a Goal trajectory hero, Journey rail, cross-phase Guardrail band, composition comparison and completed photo pair.

## Safety and stop condition

- No shipping Native code changed.
- No Server behavior or production projection changed.
- No production data or media was accessed.
- No build or TestFlight action occurred.
- Goals remains exploration pending Founder review; no direction is marked accepted.

Stopped because the complete dark/mineral-light Goals hierarchy, coverage proof, source audit and review board are ready.
