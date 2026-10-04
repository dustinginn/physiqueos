PhysiqueOS utility surfaces — Founder acceptance corrections before lock

TASK TYPE

Targeted Codex design refinement only.

Do NOT rerender or redesign the entire utility package for Founder review.

Do not modify shipping Native UI.
Do not create TestFlight.
Do not change Server, Watch behavior, ActivityKit behavior, Logger workflow, HealthKit behavior, evidence semantics, workout authority, gestures or data contracts.

AUTHORITY

Utility design package:
29d2fe1fcd343e4da077b020a120c1e2f14f37ea

Shipping Native authority audited by that package:
b8ee8690b194cb90086b62816b9a2c8c400dc026 — Build 85

Founder has reviewed Watch, Live Activity and Logger.

OVERALL FOUNDER DECISION

The utility-surface design direction is accepted except for TWO targeted corrections.

Everything else should remain unchanged.

LIVE ACTIVITY / DYNAMIC ISLAND

ACCEPTED AS-IS.

No visual changes.
No behavioral changes.
Do not rerender the entire Live Activity set unless needed internally for validation.

WATCH

Overall Watch design:
ACCEPTED.

ONE CORRECTION:

Workout Metrics and Daily Totals currently use newly normalized purple iconography/colors in the design package.

Founder intentionally designed the CURRENT PRODUCTION Watch with distinct metric icons and semantic colors and wants those preserved.

REQUIREMENT

For:
- Workout Metrics page;
- Daily Totals page;

restore/preserve the CURRENT SHIPPING PRODUCTION:
- icon choice for each metric;
- per-metric icon color / semantic color identity.

Do not normalize all metrics to purple.

Use Build 85 source as exact authority for current production icon/color mapping.

Audit and document the exact mapping before rendering.

Examples of metrics may include:
Workout Metrics:
- elapsed/time;
- active calories;
- total calories;
- heart rate.

Daily Totals:
- training session;
- active calories so far;
- nutrition;
and any other currently shipping metric.

Do not infer icon/color choices from the Founder screenshot if source provides exact values.

Everything else from the proposed Watch translation remains unchanged:
- surfaces;
- typography;
- spacing;
- hierarchy;
- controls;
- swipe-right model;
- Crown pages;
- finish/save;
- warnings;
- dark/mineral-light token translation.

Apply the restored metric identity in BOTH:
- dark;
- mineral-light.

If the production color requires a contrast adjustment in mineral light, preserve semantic hue identity while making the minimum token-level adjustment required for accessibility. Document it.

LOGGER

Overall Logger design:
ACCEPTED.

ONE CORRECTION:

The proposed active-set rows replaced the existing obvious Done control with a small completion circle.

Founder prefers the CURRENT larger Done button/control with checkbox/checkmark because it is:
- more obvious;
- easier to hit;
- clearer as the primary per-set completion action.

REQUIREMENT

Restore the larger existing Done completion affordance in the redesigned Logger set rows.

Use current shipping Logger source as behavioral/control authority.

Preserve:
- existing Done semantics;
- completed/uncompleted state;
- checkbox/checkmark identity;
- tap behavior;
- accessibility label;
- set mutation semantics.

Translate that control visually into the accepted new Logger language without shrinking it into a subtle circle.

The control should:
- be visually obvious;
- have a practical >=44 pt target;
- clearly show unchecked vs checked/completed;
- remain distinct from delete/remove;
- work in dense multi-set rows;
- not materially increase row height unnecessarily.

Apply to every Logger set-row template where completion is available:
- ordinary weighted;
- bodyweight;
- weighted-bodyweight;
- timed if the current Logger uses the same completion control;
- superset/linked set rows;
- any review/edit state where the same active set-row control appears.

Do not invent completion controls on read-only Review/Confirmation screens if they do not currently exist.

Apply in BOTH:
- dark;
- mineral light.

EVERYTHING ELSE

Do not alter:
- Logger entry;
- Areas;
- Picker;
- relationship menus;
- Watch-ready state;
- Finish;
- Cancel;
- Review;
- Final Confirmation;
- ambiguous Workout Match;
- trusted exact correlation;
- completion/performance records;
- confetti;
- Live Activity;
- other Watch screens.

FOCUSED OUTPUT ONLY

Founder does NOT need the complete utility package rendered again.

Produce only:

WATCH
1. Workout Metrics corrected — dark
2. Workout Metrics corrected — mineral light
3. Daily Totals corrected — dark
4. Daily Totals corrected — mineral light
5. one before/after comparison showing old proposed normalized icons/colors vs restored production metric identity.

LOGGER
6. representative active weighted exercise/set rows corrected — dark
7. same — mineral light
8. representative completed + incomplete set states together
9. representative superset/alternate set template if visually different
10. before/after close-up of proposed small completion circle vs restored larger Done checkbox/checkmark.

No Live Activity renders required.

COVERAGE VALIDATION

Update the coverage matrix without rerendering all screens.

WATCH
Prove W2/W3 template correction propagates to:
- missing metric variants;
- fresh/stale/offline Daily Totals;
- partial-day;
- any equivalent metric cell.

LOGGER
Prove Done-control correction propagates to all applicable active set-entry templates.

DARK/LIGHT RULE

Both corrected surfaces MUST be rendered in dark AND mineral light.

This is a standing PhysiqueOS design-review requirement for iPhone/product-owned design surfaces unless a documented platform constraint makes one appearance irrelevant.

Do not omit light renders.

ACCESSIBILITY

Watch:
- semantic metric identity is not color-only;
- icons + labels remain;
- contrast valid in both appearances.

Logger:
- Done target >=44 pt;
- VoiceOver communicates set number and completed/not completed;
- checkmark/checkbox has non-color state;
- delete remains clearly separate;
- Dynamic Type does not collapse the control into ambiguity.

LOCK DECISION

If these focused corrections match Founder intent:

Watch utility design direction:
READY TO LOCK.

Live Activity / Dynamic Island:
READY TO LOCK AS ALREADY PRESENTED.

Logger:
READY TO LOCK.

Do NOT claim implementation is complete.
This remains design-direction lock only.

SHIPPING ISOLATION

No shipping source changes.
No Server changes.
No build number.
No TestFlight.
No HealthKit changes.
No ActivityKit lifecycle changes.
No Logger contract changes.

Update disposable harness/artifacts only.

REPORT

Publish:
agent-handoffs/reports/<timestamp>-utility-surfaces-founder-acceptance-corrections.md

Include:
- exact authorities;
- production Watch icon/color mapping;
- Logger current Done-control source/semantics;
- focused artifact paths;
- dark/light parity;
- coverage propagation;
- accessibility;
- confirmation no other utility design changed;
- confirmation shipping source unchanged.

Update backlog:
- Live Activity accepted;
- Watch accepted pending focused icon/color confirmation;
- Logger accepted pending focused Done-control confirmation;
- implementation not started.

STOP after focused correction artifacts are ready for Founder confirmation.

END TASK.
