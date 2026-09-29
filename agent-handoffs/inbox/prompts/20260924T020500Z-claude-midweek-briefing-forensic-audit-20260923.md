Task id: claude-midweek-briefing-forensic-audit-20260923

Perform a read-only forensic audit of the current PhysiqueOS Midweek Briefing failure. Do not modify code, production data, policies, Native builds, or Codex's active worktree/task.

Use a NEW Claude chat/session. Sonnet High.

Founder-observed Sep 20-22 Midweek defects:
- briefing is missing major strategic domains/content such as Energy, Weight/body-composition trajectory, broad Training synthesis, and other expected operating-state material;
- one performance event/PR dominates the briefing;
- structured/backend-shaped Result / What It Means / What To Do / What To Watch / Confidence content appears flattened or duplicated into prose and then exposed again;
- copy is too long, repetitive, and caveat-heavy;
- confidence language repeats;
- calorie/evidence-quality caveats repeat;
- Still Unresolved reads like backend diagnostics rather than concise coaching;
- insufficient Build Lean Mass/current-phase synthesis;
- possible internal contradiction: headline referenced Machine Lateral Raise reaching 90 lb while Coach's Take referenced Leg Extensions reaching 90 lb;
- some individual copy is good, so do not assume the entire narrative generator is bad.

Goal:
Produce an implementation-ready defect map, not a cosmetic rewrite.

Trace end to end:
canonical evidence -> evidence eligibility -> V3 interpretation/confidence -> Midweek structured payload -> narrative generation -> persisted briefing -> API/read model -> Native decoding/presentation.

Audit the actual Sep 20-22 briefing and compare it with:
- intended Midweek contract;
- current V3/Narrative V3 contract;
- previously accepted Midweek presentation behavior;
- Build Lean Mass active Goal/phase semantics;
- cadence/precedence rules.

Determine for each missing/redundant/contradictory element whether root cause is:
source evidence absent/stale;
eligibility/filtering;
V3 interpretation;
briefing assembly/domain coverage;
narrative prompt/model output;
persistence/schema;
API/read model;
Native rendering/presentation.

Required domain-coverage audit:
Energy
Nutrition
Weight/body composition
Activity
Training overall
Recovery/execution where applicable
Goal/phase progress
Confidence/strategy
DEXA/body-comp context where applicable
What changed
What it means
What to do
What to watch

Do not require every domain to emit filler when there is nothing meaningful; determine the intended inclusion/omission contract.

For the suspected lateral-raise vs leg-extension contradiction, trace exact source facts and identify where divergence entered. Do not infer which is correct without evidence.

Assess verbosity/information hierarchy:
- duplicate facts across headline/body/cards;
- repeated confidence;
- repeated caveats;
- backend diagnostic leakage;
- generic low-information coaching;
- whether one fact appears more than once without adding value.
Propose a concise presentation contract: one fact -> one useful appearance unless a deliberate summary/detail relationship adds new information.

Do not regenerate or overwrite the briefing.
Do not patch code.
Do not change V3, confidence, strategic eligibility, or historical artifacts.

Deliverables:
1. Exact current authority.
2. Data-flow map with file/module ownership.
3. Sep 20-22 defect matrix: symptom, expected behavior, actual behavior, layer/root cause, severity, proposed correction.
4. Domain coverage matrix.
5. Contradiction trace.
6. Duplication/verbosity trace.
7. Proposed canonical Midweek presentation contract.
8. Implementation slices ordered by dependency, with tests/acceptance criteria.
9. Explicit statement of what is Server/model vs Native so Codex does not patch the wrong layer.
10. Whether historical Sep 20-22 briefing should remain immutable after fixes or whether a bounded Founder-only regeneration is warranted; do not execute regeneration.

Publish durable GitHub progress/checkpoint updates after substantive chunks and a final sanitized report. Do not replace/interfere with Codex's active inbox/task.

Standing simulator/disk rule if any Native inspection is needed: use only the existing iPhone 17 Pro simulator; do not create/retain other simulator devices; do not delete the required iOS runtime.

No privileged actions.
