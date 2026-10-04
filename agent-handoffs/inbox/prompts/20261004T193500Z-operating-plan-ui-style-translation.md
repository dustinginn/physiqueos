PhysiqueOS UI design — Priority Detail lock/correction + Operating Plan root and three strategy subpages

TASK TYPE

Continue in Codex A / existing primary-app design chat.
Use High reasoning.

Founder is comfortable moving quickly.

No shipping implementation yet.

PART A — PRIORITY DETAIL FINAL LOCK

Priority Detail visual direction is accepted with ONE small correction:

Tesamorelin/dose-aware detail currently renders two separate Preparation sections:
- Finish eating approximately 2–3 hours before injection.
- Take fasted before bed.

Founder considers these redundant as separate sections.

Consolidate canonical preparation information into ONE Preparation section while preserving BOTH pieces of information and exact underlying semantics.

Do not rewrite away either requirement.
Do not change completion/dose behavior.

Use one primary preparation instruction plus secondary supporting preparation/timing detail, or another compact single-section treatment.

Apply consistently wherever the same duplicate Preparation projection occurs.

No need to rerender entire Priority family.
Produce one focused Tesamorelin dark/light correction proving consolidation.

Then record Priority Detail = LOCKED.

PART B — NEXT FAMILY: OPERATING PLAN

Translate only:

1. Operating Plan root.
2. Current Phase Energy Plan / Energy Strategy detail.
3. Nutrition strategy detail.
4. Training strategy detail.

Do NOT expand scope to other Operating Plan domains in this task unless one of these exact routes requires a shared state/component for truthful rendering.

Founder supplied production screenshot of root as visual/content context.

SOURCE AUDIT FIRST

Audit exact Build 85 Native source and current Server Operating Plan/strategy contracts.

Preserve exact:
- domain order;
- titles;
- current values;
- Active status;
- phase ownership;
- review cadence;
- history;
- edit/action semantics;
- navigation;
- strategy provenance/versioning if exposed.

OPERATING PLAN ROOT

Current production screenshot establishes at least:

OPERATING PLAN
Your Operating Plan
Current strategy across every domain, and the protocols that support it.

ENERGY STRATEGY
Current Phase Energy Plan
2,500 kcal/day intake · 800 kcal/day activity · Monthly review
Active

NUTRITION
Calorie Calibration
1 g per lb of body weight · intake adjusted gradually
Active

TRAINING
Maintenance Training Strategy
9 weekly area sessions · Moderate progression
Active

Use actual current source values as authority; do not hard-code screenshot values if source differs.

Audit:
- back/navigation behavior;
- all three cards;
- icons/semantic colors;
- Active state;
- card taps;
- loading/error/empty if materially distinct.

ENERGY STRATEGY DETAIL

Audit exact current Energy Strategy page.

Preserve:
- current phase energy strategy;
- caloric intake target;
- activity/expenditure target;
- review cadence;
- effective/start date;
- phase association;
- rationale/notes if current;
- history/previous Phase 1 calibration if current;
- edit/change affordance if current;
- transition semantics if current.

Important historical product rule:
When moving Phase 1 Maintenance Calibration → Phase 2, user establishes a new Phase 2 Energy Strategy while Phase 1 history is preserved.

Do not collapse historical strategy into current strategy.

Do not invent editing if current Native is read-only.

NUTRITION DETAIL

Audit actual page.

Preserve current:
- strategy title;
- protein/calorie/macronutrient guidance;
- calibration rules;
- effective period;
- phase/Goal relationship;
- rationale;
- status;
- history;
- edit/change behavior if current.

Do not turn this into Nutrition Evidence.

This is strategy/protocol, not observed intake history.

TRAINING STRATEGY DETAIL

Audit actual page.

Preserve current:
- strategy title;
- weekly area-session target;
- progression approach;
- training split/areas if current;
- status;
- phase/Goal association;
- rationale;
- history;
- edit/change behavior if current.

Do not turn this into Training Evidence or Workout Logger.

DESIGN INTENT

Operating Plan is strategic configuration/reference.

It should visually bridge:
- Goals/Home strategic surfaces;
- Priority Detail execution surfaces.

Use locked PhysiqueOS system.

Root:
compact domain overview.

Detail:
clear current strategy first;
supporting rules/rationale/history below.

Avoid:
- giant card stacks;
- duplicated domain labels;
- Evidence-style raw history presentation;
- Logger-style controls;
- excessive purple.

Use semantic domain colors/icons where useful and already established.

DARK + MINERAL LIGHT

Required for:
- root;
- Energy Strategy detail;
- Nutrition detail;
- Training detail;
- materially distinct edit/history state if current.

Exact content/behavior parity.

NAVIGATION/ACTION PARITY

Create matrix:

Surface | entry | current strategy | history | edit/action | destination | production behavior | target behavior

Audit all card taps and detail actions.

No dead chevrons.
No invented actions.

CONTENT

Exact canonical current content from source-shaped fixtures.

No fabricated values.
No rewriting tuned strategy content for aesthetics.

ACCESSIBILITY

Dynamic Type.
VoiceOver domain/status/targets.
Units explicit.
44pt taps.
Active not color-only.

IMPLEMENTATION DELTA LEDGER

Review:
agent-handoffs/DESIGN_IMPLEMENTATION_DELTA_LEDGER.md

Append genuine implementation gaps discovered.

Do not add design-harness-only issues.

REVIEW OUTPUT

Concise:

1. Priority Tesamorelin consolidated Preparation dark/light.
2. Operating Plan root dark/light.
3. Energy Strategy detail dark/light.
4. Nutrition detail dark/light.
5. Training detail dark/light.
6. one concise Operating Plan family board.
7. any materially distinct current edit/history state only if needed.

Produce mobile-friendly composite PNG as PRIMARY FOUNDER REVIEW ARTIFACT.

REPORT must name the primary review PNG explicitly.

SHIPPING ISOLATION

No shipping Native.
No Server.
No strategy mutations.
No phase transition.
No build/TestFlight.

Design harness/docs only.

REPORTING

Follow:
agent-handoffs/README_REPORTING_STANDARD.md

Also follow mobile review convention:
publish consolidated review PNG and include exact artifact-commit path in report/latest metadata.

REPORT

agent-handoffs/reports/<timestamp>-operating-plan-ui-style-translation.md

LOCK STATUS

Goals = LOCKED.
Priority Detail = LOCKED after Preparation consolidation.
Operating Plan root/Energy/Nutrition/Training = exploration pending Founder review.

STOP when exact source audit, four Operating Plan surfaces dark/light, focused Priority correction, delta review, and mobile-friendly review board are ready.

END TASK.