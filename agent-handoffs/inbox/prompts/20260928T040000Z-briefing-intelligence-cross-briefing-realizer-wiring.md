Task id: briefing-intelligence-cross-briefing-realizer-wiring-20260927

Continue on branch codex/weekly-v3-weekly-pattern-narrative from release-ready candidate 6abbed64.

DO NOT DEPLOY YET.

FOUNDER PRODUCT DECISION

The shared Briefing Intelligence architecture, holistic synthesis, section contracts, information budgets, coach voice, causal restraint, weight policy, and Weekly realization are accepted.

The remaining work is NOT to redesign Midweek, Monthly, DEXA and Photo as separate products and NOT to repeat the Weekly copy-iteration exercise four more times.

The product model is:

one shared Briefing Intelligence engine
-> one shared holistic goal-relative evidence picture/synthesis
-> briefing-type policy controls purpose, horizon, authority, information budget and section responsibilities
-> briefing-specific realizer expresses that same intelligence appropriately for the briefing type.

The same engine should scale with the briefing.

REQUIRED IMPLEMENTATION

Wire the remaining canonical briefing types to the already-approved shared realization framework:

1. MIDWEEK
Purpose:
- lightest narrative density;
- partial-window interpretation;
- what is emerging so far;
- concise and provisional;
- do not narrate an incomplete week as though it is finished;
- do not force complete-week conclusions;
- no Confidence movement merely from emerging period characterization unless existing canonical Confidence logic independently supports it.

Use the existing shared evidence picture, holistic synthesis, section contracts and Midweek information budget.

2. MONTHLY
Purpose:
- richer than Weekly;
- synthesize multiple weeks;
- distinguish persistence from one-offs;
- trajectory/adaptation/strategy fit;
- must not concatenate four Weekly briefings;
- same shared evidence domains and causal restraint;
- section progression appropriate to a longer horizon.

Use the shared temporal/persistence intelligence rather than separate siloed logic where possible. Fold existing Monthly intelligence into shared abstractions carefully without changing valid semantics.

3. DEXA
Purpose:
- outcome-led strategic checkpoint;
- new DEXA measurement leads because it is the reason for the briefing;
- connect the authoritative body-composition result to Goal trajectory, guardrail and preceding execution since the prior scan;
- preceding execution is context, not proof of causality;
- same holistic evidence picture underneath;
- no causal "plan worked" language unless future explicit causal-support semantics exist.

4. PHOTO
Purpose:
- visual-result-led;
- depth scales with meaningful visual change and corroborating/contradicting evidence;
- use visual evidence as the lead when actual visual-change facts exist;
- other eligible evidence provides context;
- do not force Monthly-length prose;
- preserve causal restraint;
- if current production lacks a canonical visual-change magnitude producer, wire everything else possible and clearly identify the production-data gap rather than inventing it.

SHARED-ENGINE REQUIREMENT

Do not create separate intelligence engines or duplicate baseline/materiality/reliability logic by briefing type.

Where existing Midweek/Monthly/DEXA/Photo reasoning is siloed, consolidate the concepts into the shared layer or adapt them through briefing policy.

The shared layer must continue to support future Recovery/Sleep evidence naturally without another architectural redesign.

INFORMATION-BUDGET MODEL

Keep the already-approved scale:

Midweek -> least copy
Weekly -> moderate completed-period recap
Monthly -> deeper multi-week synthesis
DEXA -> strategic checkpoint depth
Photo -> proportional to visual/context evidence

This should be implemented through semantic section responsibilities and per-briefing budgets, not arbitrary copy padding.

ACCEPTANCE STRATEGY

Do NOT hash out every briefing sentence manually.

After wiring each type, generate one representative preview per briefing type to prove the shared model scales.

Use real historical canonical evidence where possible:
- Midweek: choose a representative recent V3 Midweek with enough evidence to exercise the shared engine.
- Monthly: choose a representative recent Monthly with multiple weeks of evidence.
- DEXA: choose a representative recent DEXA briefing with a meaningful body-composition result and preceding execution context.
- Photo: choose a representative Photo briefing with real visual-comparison evidence if the canonical producer supports it. If no suitable production visual-change fact exists, use the strongest real-data preview possible and pair it with a synthetic fixture demonstrating the intended strong-visual-change path.

These are acceptance previews, not copy-design sessions.

For each preview publish:
- all generated Founder-facing narrative;
- briefing type and purpose;
- information budget/section contract used;
- key domain assessments;
- holistic synthesis and selected complementary insights;
- what was intentionally omitted and why;
- whether Confidence/strategy changed independently;
- comparison to the currently served artifact where applicable;
- proof that causal restraint, non-redundancy and historical immutability hold.

The question for Founder/ChatGPT is:
"Does the same shared engine scale naturally to this briefing type?"
not:
"Do we want to manually rewrite sentence 3?"

VALIDATION

Extend shared property tests across all briefing types:

MIDWEEK
- partial-window language;
- shortest information budget;
- no complete-week framing;
- emerging patterns remain provisional;
- no redundant sections.

MONTHLY
- persistence prioritized over isolated one-offs;
- richer than Weekly but concise;
- multi-week synthesis, not concatenation;
- all goal-relevant domains considered;
- complementary insights selected.

DEXA
- outcome leads;
- body-composition result has appropriate authority;
- preceding execution is context, not cause;
- guardrail/Goal trajectory handled correctly;
- no effectiveness causality from measurement alone.

PHOTO
- visual result leads when available;
- depth scales with visual materiality;
- visual/context evidence can agree or conflict;
- no invented visual facts when producer lacks them;
- causal restraint preserved.

CROSS-TYPE
- same canonical input domain is interpreted consistently across briefing types;
- same evidence hierarchy/claim restraint applies;
- narrative density scales with horizon/purpose;
- exercise performance never explains Goal Confidence;
- weight considered appropriately for relevant goals;
- future recovery/sleep slot remains supported;
- determinism;
- historical artifacts remain immutable;
- no regression to generic "Nothing here calls for a change" when meaningful period evidence exists;
- stable/quiet periods remain concise.

FRESH-CONTEXT REVIEW

Run independent review focused on:
- true shared-engine reuse vs duplicated/siloed logic;
- semantic scaling across horizons;
- whether Monthly is synthesis rather than concatenation;
- whether DEXA/Photo are outcome-led without causality;
- whether Midweek stays appropriately light;
- whether future Sleep can enter without redesign;
- whether all previews are genuinely engine-generated from canonical inputs.

DEPLOYMENT GATE

Do not deploy any Server changes in this task.
Do not regenerate historical published briefings.
Do not mutate production.
Do not cut/upload Native.
Do not start HealthKit Sleep ingestion.

The goal is to reach one reviewed cross-briefing candidate and a preview set for Founder/ChatGPT approval.

OTHER OPEN WORK AFTER THIS PROJECT

Once this cross-briefing work reaches its deployment decision, next investigate:
1. Natural Strength reconciliation-review notification failure from Sep 27. Founder received no notification hours after a real possible-match strength event.
2. Logged Today should compactly show strength AND cardio together when both exist, rather than strength hiding cardio.
3. Queued Native context-aware Log tab -> active Workout Logger shortcut.

Do not begin these inside this Server briefing task.

STANDING NOTIFICATION RULE

Whenever Claude stops for any reason, immediately push-notify Founder. Do not silently stop.

END TASK.
