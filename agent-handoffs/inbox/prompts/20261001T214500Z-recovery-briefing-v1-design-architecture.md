Recovery Briefing V1 — product semantics, strategic architecture, and visual card prototype

TASK TYPE

Research + design + architecture + zero-write modeling + visual prototype.

Codex lane.

Claude is concurrently implementing Workout Logger Live Activities. Keep this task completely isolated from that Native work.

Do NOT deploy.
Do NOT mutate historical Briefings.
Do NOT enable strategic Sleep.
Do NOT change Goal Confidence.
Do NOT change V3 policy.
Do NOT publish a production Briefing.
Do NOT touch Workout Logger/Live Activities.

READ FIRST

Sleep historical/prospective verification:
agent-handoffs/reports/20261001T061329Z-sleep-historical-import-verified-prospective-d0.md

Sleep integrated Native:
agent-handoffs/reports/20261001T145408Z-healthkit-sleep-evidence-integrated-native.md

Sleep Build 76 polish:
agent-handoffs/reports/20261001T175947Z-healthkit-sleep-evidence-founder-polish.md

Sleep Server midnight closeout:
agent-handoffs/reports/20261001T203806Z-healthkit-sleep-server-midnight-window-closeout.md

Standing reporting protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

IMPORTANT: the standing GH protocol now requires every stop/final report to be published and re-read from origin/main. Feature-branch-only reports do not count.

FOUNDER PRODUCT DIRECTION

Recovery V1 begins small:
- Sleep
- daily Foam Rolling execution

Recovery should be quieter than Energy and Training.

The Briefing card should primarily communicate a period-level recovery state:
- Green
- Yellow
- Red

This is NOT a proprietary Sleep Score or Recovery Score.

The card does NOT need narrative copy when nothing meaningful needs saying.

Commentary should appear only when something stands out over the reporting period and is useful to explain.

Recovery should primarily contextualize Goal/execution evidence rather than compete with the primary Goal.

Build Lean Mass remains the primary Goal. Leanness/body-fat is a guardrail, not the primary objective.

Recovery evidence should not automatically move Goal Confidence merely because the Recovery card is yellow/red.

Future strategic influence should depend on recovery evidence becoming relevant to Goal execution/outcome, especially repeated association with training performance/progressive overload, missed/reduced sessions, injury/limitation, or another meaningful consequence.

Association must not be presented as causation.

FOUNDER CARD DIRECTION

Conceptual healthy state:

Recovery · Green
7h 34m avg sleep · +12m vs recent baseline
[small Sleep graph / period trend]
Foam rolling 6/7

No narrative required.

Conceptual watch state:

Recovery · Yellow
6h 41m avg sleep · -48m vs recent baseline
[small Sleep graph / period trend]
Foam rolling 4/7
Sleep has run below your recent baseline across four nights. Training is holding so far, but recovery is worth watching.

Do not treat these example values as thresholds.

A. AUDIT CURRENT BRIEFING ARCHITECTURE

Map current production architecture for:
- Midweek;
- Weekly;
- Monthly;
- DEXA;
- Narrative V3;
- Confidence V3;
- briefing evidence packages;
- existing Energy/Training cards;
- current Recovery-related fields/cards if any;
- foam-rolling priority/execution evidence;
- Briefing precedence/cadence rules.

Identify exact Server and Native/web presentation boundaries.

Do not assume historical implementations.

B. RECOVERY PERIOD MODEL

Design a canonical Recovery Briefing assessment for the exact briefing reporting period.

Suggested output semantics:

status:
green | yellow | red | unavailable

period:
start/end/cadence

sleep:
- nights available / expected;
- average total sleep;
- comparison to within-person baseline;
- direction/trend;
- consistency/continuity only where clock/data provenance supports it;
- material multi-night deviation signals;
- data quality/completeness.

foamRolling:
- scheduled/completed/missed;
- adherence percentage/count;
- whether misses are isolated vs sustained.

context:
- training association if supported;
- injury/limitation/training interruption if supported by canonical evidence;
- commentary trigger/reason;
- confidence/data sufficiency.

No scalar score required.

C. WITHIN-PERSON BASELINE

Do NOT use generic population cutoffs such as:
under 7 hours = yellow.

Design a baseline based on the Founder's own recent reliable Sleep.

Evaluate candidate baseline windows such as:
- prior 28 reliable nights excluding current reporting period;
- rolling 4-week median/mean;
- robust median + dispersion;
- cadence-specific comparison.

Requirements:
- no look-ahead;
- no current-period contamination of baseline;
- minimum sample threshold;
- resistant to one anomalous night;
- historical timezone uncertainty must not invalidate total-sleep duration;
- clock-time consistency metrics only use reliable local-time provenance;
- travel uncertainty handled honestly;
- baseline should eventually work for other users.

Recommend one deterministic V1 approach and justify it.

D. GREEN / YELLOW / RED SEMANTICS

Define conservative, interpretable rules.

Principles:

GREEN
- recovery evidence broadly supportive/stable;
- no sustained material negative deviation;
- no meaningful downstream recovery constraint evident;
- no commentary necessary by default.

YELLOW
- a persistent/material pattern worth watching;
- examples may include multi-night sleep reduction vs personal baseline, worsening continuity when reliable, or multiple recovery signals aligning;
- training may still be holding;
- commentary optional but normally useful when yellow.

RED
- reserve for sustained/material recovery constraint;
- preferably stronger evidence than Sleep alone;
- repeated recovery deterioration plus meaningful downstream consequence or severe sustained deviation;
- commentary required.

Foam rolling:
- must NOT independently create yellow/red from a couple misses;
- sustained misses can contribute;
- becomes more meaningful when aligned with injury/limitation/reduced training;
- do not claim missed foam rolling caused injury.

Specify exact deterministic candidate thresholds for V1, but label them policy parameters and explain how they can be tuned.

Prefer persistence + magnitude + corroboration over simplistic thresholds.

E. TRAINING ASSOCIATION

Founder specifically values detecting potential relationships such as:
bad/reduced Sleep -> worse training session / stalled progressive overload.

Design this carefully.

V1:
- single bad night + single weak workout = observation only;
- do not elevate to causal narrative;
- repeated within-person association across comparable sessions may become an emerging pattern;
- require enough comparable training observations;
- distinguish exercise/session performance from subjective interpretation;
- use existing Exercise Performance/Training evidence where appropriate.

Define what can be calculated now versus later.

Do not implement a causal model.

F. FOAM ROLLING

Audit current canonical priority/execution data.

Determine:
- whether daily scheduled/completed/missed is trustworthy for briefing periods;
- how rest days/schedule exceptions are represented;
- whether priority completion evidence is sufficient.

V1 presentation should be lightweight:
Foam rolling 6/7
or equivalent.

Do not give it a large independent chart unless evidence suggests value.

G. CARD PRESENTATION

Design a compact Recovery card that is clearly subordinate to Energy/Training.

Required elements:
- Recovery title;
- Green/Yellow/Red state;
- period-average Sleep;
- delta vs personal baseline;
- small Sleep graph covering exact reporting period;
- 7-day average or cadence-appropriate average where useful;
- lightweight Foam Rolling execution;
- optional commentary only when triggered.

Do not require copy for Green.

Explore visual treatment for the traffic-light state that works in dark mode and does not rely on color alone:
- colored dot + word;
- accessible icon/text;
- no giant alarm banner.

No Recovery Score.

H. CADENCE BEHAVIOR

MIDWEEK
- partial-week evidence;
- more conservative status due smaller sample;
- report available nights only;
- avoid overreacting.

WEEKLY
- primary short-period Recovery card;
- week Sleep trend + comparison baseline;
- foam rolling execution.

MONTHLY
- broader pattern;
- weekly Sleep aggregation may be appropriate;
- commentary only for sustained pattern/change;
- repeated training association becomes more informative.

DEXA
- compact;
- only emphasize Recovery if it helps contextualize body-composition/training result;
- do not force commentary.

Monthly precedence remains intentional when Monthly collides with Weekly/Midweek.

I. NARRATIVE / V3 BOUNDARY

Design separation between:
1. Recovery card state/presentation;
2. Narrative V3 context;
3. Goal Confidence/Strategy Confidence.

Recovery card may be yellow/red without Confidence moving.

Define future strategic eligibility:
- Sleep must have prospective strategicEffectiveAt;
- historical July-Sep Sleep remains permanently non-strategic;
- no historical Briefing rewrite;
- only prospective eligible Sleep may enter future V3 evidence;
- foam rolling uses existing prospective execution evidence.

Define when Recovery can influence:
- Coach's Take;
- What It Means;
- What To Watch;
- recommendation;
- Confidence.

Be conservative.

J. HISTORICAL ZERO-WRITE MODELING

Use historical Sleep July 6-Sep 30 and historical foam-rolling/training evidence only for:
- validating thresholds;
- visual prototype;
- seeing distribution of hypothetical Green/Yellow/Red periods;
- testing whether rules are noisy.

This must be ZERO-WRITE.

Do NOT:
- alter old Briefings;
- alter old Confidence;
- create historical strategic evidence;
- persist hypothetical Recovery states as canonical historical artifacts.

Produce sanitized aggregate results only.

Evaluate hypothetical:
- weekly periods;
- midweek periods;
- monthly periods where data supports it.

Look for:
- too many yellows/reds;
- thresholds reacting to one-night noise;
- foam rolling dominating;
- status contradicting obviously stable Sleep.

Tune candidate policy only if evidence justifies it.

K. VISUAL PROTOTYPE

Create a NON-SHIPPING visual prototype using synthetic/redacted data shaped by the zero-write findings.

At minimum screenshots:
1. Weekly Green — no commentary.
2. Weekly Yellow — commentary.
3. Weekly Red — commentary.
4. Midweek Green.
5. Monthly with broader graph.
6. Data-insufficient/unavailable.
7. Green with imperfect foam rolling but no overreaction.
8. Yellow Sleep while training holds.
9. Red/corroborated recovery constraint.

Prefer the actual current Briefing visual language.

Show placement relative to Energy/Training if useful.

Do not use private raw Founder values in screenshots/GH.

L. POLICY VERSIONING

Propose a versioned Recovery assessment policy:
recovery_assessment_v1
or equivalent.

Inputs/outputs deterministic.

Keep thresholds/config versioned so later tuning does not silently rewrite interpretation.

No production activation now.

M. TEST PLAN

Define tests for:
- baseline exclusion/no lookahead;
- minimum nights;
- one short night stays green if period otherwise stable;
- sustained moderate deviation -> yellow;
- severe sustained deviation;
- red corroboration rules;
- foam rolling couple misses not enough;
- sustained misses contextual only;
- all uncertain clock times;
- missing Sleep;
- partial Midweek;
- Monthly aggregation;
- training association observation vs emerging pattern;
- historical data categorically non-strategic;
- prospective pre-strategicEffectiveAt excluded;
- card commentary absent when not triggered;
- accessibility state not color-only.

N. IMPLEMENTATION PLAN

Recommend exact sequencing after Founder approves prototype:

Phase 1:
Server Recovery assessment/read contract + briefing card presentation, but Sleep still non-strategic if canary not accepted.

Phase 2:
after 2-3-night Sleep canary acceptance, establish prospective strategicEffectiveAt and allow Recovery context into Narrative V3 under explicit policy.

Phase 3:
later correlation intelligence / richer Recovery evidence if useful.

Identify exact likely files/services/contracts.

O. NO PRODUCTION CHANGES

Do not deploy.
Do not change policy.
Do not publish/recompute Briefings.
Do not modify Native shipping code.
Do not activate strategic Sleep.

P. REPORT

Publish to origin/main per standing protocol:
agent-handoffs/reports/<timestamp>-recovery-briefing-v1-design-architecture.md

Include:
- current architecture audit;
- recommended baseline;
- exact candidate traffic-light semantics;
- foam rolling role;
- training association rules;
- cadence behavior;
- V3/Confidence boundary;
- zero-write historical modeling summary;
- prototype branch/SHA;
- screenshot paths;
- policy schema;
- test plan;
- implementation phases;
- Founder decisions still needed.

Before stopping:
- push prototype/code branch;
- publish report to origin/main;
- update latest pointers;
- fetch/reverify origin/main;
- re-read exact report from main;
- give Founder exact main report commit SHA.

END TASK.
