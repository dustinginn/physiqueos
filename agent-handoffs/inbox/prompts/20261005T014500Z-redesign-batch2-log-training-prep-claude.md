PhysiqueOS redesign implementation Batch 2 prep audit — Log + Training Logger

TASK TYPE

NEW Claude Remote Control chat.
Use High reasoning.
Preparation/audit only.
Do NOT implement shipping UI in this task.

WORKTREE RULE — MANDATORY

Use the single Remote Control-provided worktree for the entire session.
Do NOT use EnterWorktree.
Do NOT create or switch to a secondary worktree for isolation.
Use normal git refs/fetch/show/diff operations from the existing authorized worktree.
If a second worktree is genuinely unavoidable, STOP and explain why before attempting it.

CONTEXT

The app-wide redesign is Founder-locked and DESIGN COMPLETE.

Build 86 Native authority:
cec8af20a6121bb66ecca3ba9f667d91774a891c
Version 1.0 (86), Apple VALID.

Codex A is concurrently implementing Redesign Implementation Batch 1:
Home + Goals + You/Settings
Prompt authority:
f4bd9c50c6a0132d700f41cb894788e5a61d8ff6

Claude must NOT compete with or duplicate Batch 1 implementation.

GOAL

Prepare an implementation-ready plan for Redesign Implementation Batch 2:

1. Log
2. Training Logger

Do all source/design/dependency/state/test analysis now so implementation can begin immediately after Founder accepts Batch 1.

No shipping code changes.

SOURCE AUTHORITY

Reverify current Native authority and inspect Build 86 source.

Use the Founder-accepted locked design artifacts/reports for:
- Log;
- Training Logger / Compact Command Center;
- exercise selection/add exercise;
- active workout/session flows;
- set rows;
- supersets;
- timed sets;
- bodyweight/variant sets;
- workout finish/pause/cancel;
- Evidence Review transition;
- cardio/Training Today relationships only where they affect Log/Logger entry behavior.

Do not reinterpret locked designs.

Do not use temporary old-layout global appearance screenshots as redesign authority.

AUDIT LOG

Map:
- Log root;
- all current Log actions/entry points;
- navigation to Weight, Nutrition, Activity, Training, Photos, DEXA, generic Evidence intake and other current actions;
- current conditional states;
- current badges/status;
- active-workout presentation;
- loading/error/empty behavior;
- any deep-link/notification entry behavior.

Identify exactly what the locked Log redesign changes visually versus what canonical behavior must remain.

AUDIT TRAINING LOGGER

Trace every current materially distinct state and route:
- start workout;
- resume active workout;
- exercise selection;
- Add Exercise before/after start;
- category behavior;
- exercise detail/context if part of Logger flow;
- standard sets;
- warmups if current;
- supersets;
- variants;
- bodyweight;
- timed sets;
- editing/deleting sets;
- rest/timer behavior;
- progress/session metrics;
- pause/resume;
- cancel;
- finish confirmation;
- duplicate/retry behavior;
- Evidence Review handoff;
- offline/network/reconciliation states;
- current Watch projection dependencies that must not be disturbed.

Do not invent states.

BUILD 86 SAFETY

Build 86 contains newly accepted Watch/HealthKit behavior.

Identify every Training Logger file/component/state model that is coupled to:
- Watch projection;
- workout revision;
- HealthKit start/save;
- finish semantics;
- Live Activity;
- server mutation/reconciliation.

Mark these as behavior-sensitive.

The redesign implementation must change presentation without regressing Build 86 behavior.

TIMED-SET KNOWN GAP

Review the implementation-delta ledger for the known timed-set Watch projection issue.

Do not fix it in this prep audit.
Determine whether Batch 2 implementation will touch the same model/components and flag the integration risk.

BATCH 1 DEPENDENCIES

Codex A is currently implementing shared visual architecture in Home + Goals + You/Settings.

Identify likely dependencies Batch 2 should inherit after Batch 1:
- theme tokens;
- cards;
- section headers;
- navigation chrome;
- buttons;
- status chips;
- row treatments;
- loading/error/empty states;
- typography;
- spacing primitives.

Do NOT independently implement replacements.

Produce a “wait for Batch 1” dependency list and a “safe to implement independently” list.

GLOBAL APPEARANCE

Build 86 already provides System / Dark / Mineral Light infrastructure.

Map every Log/Training Logger appearance owner to that infrastructure.

Identify intentional component-specific colors that must remain semantic.

PARITY MATRIX

Create an exhaustive implementation matrix:

Surface/state | current route/source | canonical behavior owner | locked design authority | appearance states | Batch 1 shared dependency | Watch/HealthKit sensitivity | implementation risk | required tests.

Every materially distinct Log/Training Logger state must appear.

IMPLEMENTATION SEQUENCE

Recommend the exact coding order for Batch 2 after Batch 1 is accepted.

Prefer a sequence that:
- establishes shared presentation primitives first;
- keeps canonical workout state untouched;
- allows deterministic visual parity checkpoints;
- minimizes large-file rewrites;
- protects Watch/HealthKit behavior.

TEST PLAN

Prepare the exact deterministic acceptance plan:
- unit tests;
- UI tests;
- navigation tests;
- appearance tests;
- Logger behavior regression tests;
- Watch projection regression tests;
- finish/reconciliation tests;
- Release compile.

Identify which existing Build 86 tests are mandatory gates.

VISUAL ACCEPTANCE PLAN

Define the real-simulator screenshot matrix needed for Founder review in Dark + Mineral Light.

Do not render new designs. Use locked artifacts as target authority.

CONFLICT CHECK

Identify any current canonical behavior that conflicts with a locked Log/Training Logger design.

Classify each as:
- no conflict;
- implementation detail;
- design target requires existing behavior preserved invisibly;
- genuine Founder/product decision.

Do not silently resolve genuine product conflicts.

OUTPUT

Publish a concise prep report under agent-handoffs/reports/ with:
- exact authority;
- exhaustive surface/state inventory;
- file/component ownership map;
- Batch 1 dependency map;
- Build 86 Watch/HealthKit risk map;
- parity matrix;
- coding sequence;
- test plan;
- visual acceptance matrix;
- blockers/product decisions.

Use normal reporting/latest standard, but clearly identify this as PREP ONLY and separate from Codex A Batch 1.

No Native shipping code changes.
No Server changes.
No production mutations.
No build/TestFlight.
No new worktree.
No EnterWorktree.

STOP when Batch 2 is implementation-ready pending only Batch 1 Founder acceptance/integration authority.

END TASK.