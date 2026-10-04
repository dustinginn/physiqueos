PhysiqueOS Evidence — Founder correction pass for Energy, Weight and Recovery before lock

TASK TYPE

Continue in Codex B / existing Evidence design chat.
Use High reasoning.

This is a focused correction and production-interaction parity pass.

Do not reopen accepted visual direction.
Do not modify shipping code.
Do not change Server/evidence contracts, calculations, HealthKit semantics, navigation authority or strategic Recovery policy.

AUTHORITY

Original prompt:
fbd6dd35e4e0dbabe5834d309170dcd2e724398a

Evidence design report:
36ac9b70cae5aebe1c82b007c7822ddfe6948593

Artifact commit:
1f8ba1b9abd0db1826ac911bffcdbd7536d332c8

Native:
Build 85 / b8ee8690b194cb90086b62816b9a2c8c400dc026

FOUNDER OVERALL DECISION

Energy, Weight and Recovery styling is largely accepted.

The correction pass must preserve the actual production interaction architecture, not merely prove that underlying data exists somewhere in the harness.

PROCESS LESSON

When source audit finds "no dedicated detail route", do NOT replace the production interaction with explanatory UI.

Audit what production actually does:
- Show All sheet/drawer;
- inline disclosure;
- contextual cross-link;
- separate history surface;
- or another existing affordance.

Navigation/disclosure behavior is part of the product contract.

Do not put source-audit explanations such as "No X route exists..." into product UI unless production itself contains that copy.

PART A — ENERGY

Founder provided current production screenshots as interaction authority.

Production Energy has two distinct root sections:

1. WEEKLY HISTORY
- preview rows on root;
- Show All;
- full weekly-history sheet/drawer.

2. RECENT DAILY ENERGY
- preview rows on root;
- Show All;
- full daily-history sheet/drawer.

Daily Energy rows preserve:
- date;
- completeness/status;
- Intake;
- Active Calories where available;
- Estimated Expenditure;
- signed Balance;
- contextual Nutrition Day link when nutrition evidence exists;
- contextual Activity link when activity evidence exists.

There is intentionally no dedicated Energy Day Detail route.

That absence is handled by the contextual Nutrition Day / Activity links, NOT by explanatory product copy.

CORRECTION

Reproduce the production architecture exactly in the accepted new styling:

Energy root
→ Weekly History preview → Show All weekly sheet
→ Recent Daily Energy preview → Show All daily sheet
→ contextual Nutrition Day / Activity links per canonical availability.

Remove all explanatory harness/product copy about no Energy day-detail route.

Do not flatten the two Show All destinations into one page.

Do not merge weekly and daily history.

Do not invent Energy Day Detail.

Use exact current production data/semantics.

Render focused dark + mineral-light:
- corrected Energy root showing both history sections;
- Weekly Show All sheet;
- Daily Show All sheet;
- representative Daily rows with both cross-links and missing-link variants if materially distinct.

PART B — WEIGHT

Founder likes the Weight visual direction.

The second W2 image is understood as a QA/state-coverage board, not a proposed production screen. Do not redesign those states merely because they were stacked for review.

ONE REQUIRED AUDIT BEFORE LOCK:

Production visibly has:
- Weekly Averages → SHOW ALL
- Weight History → SHOW ALL

Audit exact Build 85 interaction behavior for BOTH controls.

Determine whether each:
- expands inline;
- opens a sheet/drawer;
- navigates elsewhere;
- uses another disclosure mechanism.

Do not infer from visual appearance.

Then make the design harness match exact production interaction behavior.

If Codex's current statement that Show All expands inline is correct:
document source proof and keep it.

If either opens a sheet/drawer:
correct the design package and render that destination.

Preserve:
- Build Lean Mass Highest semantics;
- Visible Abs Lowest / Last Change semantics;
- 3-day/7-day averages;
- Weekly Averages;
- Weight History;
- DEXA markers;
- Goal range filtering;
- read-only history;
- no streak;
- no Related Goals.

Remove any audit explanation from product UI that says there is no detail/history route.

Audit notes belong in documentation, not product screens.

Render only focused correction/proof:
- Weight root dark/light;
- exact Weekly Averages Show All behavior;
- exact Weight History Show All behavior;
- no need to rerender QA state board unless behavior changes it.

PART C — RECOVERY

Founder prefers Codex's Recovery redesign over production styling.

KEEP the accepted Codex Recovery direction:
- Recovery root;
- Last Night;
- Sleep;
- Sleep Window;
- Recent Nights / All Nights;
- See Trends;
- Sleep Trends;
- time-range controls;
- Total Sleep;
- Sleep Window trend;
- Stage Mix;
- Night Detail;
- Stages;
- Continuity;
- Time in Bed;
- Source & Data;
- finality/updating/provenance states.

Two focused visual corrections:

C1 — NIGHT DETAIL TIMELINE OVERFLOW

In the rendered Night Detail, sleep-stage blocks/labels visibly escape or collide with the Timeline card/chart bounds.

Fix:
- clipping;
- internal chart padding;
- plot-area bounds;
- stage-label placement;
- time-axis placement;
- Dynamic Type resilience;
- iPhone-width geometry.

All stage segments and labels must remain visually contained inside the intended Timeline chart/card.

Do not change underlying sleep-stage values.

Do not simplify away the interactive timeline.

C2 — CONTINUITY VISUALIZATION

Founder dislikes the large/fat vertical bars used for Continuity trends.

Redesign ONLY the Continuity data visualization.

Preserve exact canonical measures:
- Awake in sleep window;
- Longest continuous sleep;
- dates/range;
- exact values;
- missing data semantics.

Goal:
lighter, more analytical, less visually dominant.

Explore internally and choose ONE best treatment consistent with the locked Recovery language.

Acceptable directions include:
- thin stems + points;
- point series with restrained connecting line where truthful;
- lollipop treatment;
- compact dot/stem rails;
- another restrained analytical visualization.

Do not use chunky/fat histogram bars.

The two Continuity measures should feel related but remain distinguishable.

Do not change chart meaning or invent smoothing/trend data.

Render:
- corrected Recovery Night Detail dark/light;
- corrected Continuity trend dark/light;
- focused before/after Continuity comparison;
- full Recovery Trends viewport only if needed to prove integration.

PART D — PRODUCTION ROUTE/DISCLOSURE PARITY

For Energy, Weight and Recovery, create an interaction matrix:

Surface | Root affordance | Production behavior | Destination/disclosure | Target design behavior | Source proof

Validate every:
- Show All;
- See Trends;
- night row;
- Last Night;
- Nutrition Day;
- Activity;
- disclosure/expand control.

Zero interaction omissions.

This is now a standing Evidence rule:
data parity alone is insufficient; navigation/disclosure parity is required.

PART E — DARK + MINERAL LIGHT

All corrected product states in BOTH appearances.

Same content, routes, geometry and semantics.
Only appearance tokens differ.

PART F — IMPLEMENTATION DELTA LEDGER

Review:
agent-handoffs/DESIGN_IMPLEMENTATION_DELTA_LEDGER.md

Append any newly discovered implementation-relevant delta.

Do not add a delta merely because the design harness previously modeled production incorrectly.

If source proves production behavior is already correct, fix documentation/harness only.

PART G — VALIDATION

Energy:
- separate Weekly Show All and Daily Show All preserved;
- daily contextual cross-links exact;
- no fake Energy detail;
- no audit explanation in product UI.

Weight:
- exact Show All behaviors source-proven;
- calculations/DEXA/Goal semantics unchanged.

Recovery:
- timeline contained;
- exact stage values unchanged;
- Continuity exact values unchanged;
- no Recovery Score;
- no strategic activation.

Dark/light parity exact.

PART H — SHIPPING ISOLATION

No shipping source changes.
No Server changes.
No HealthKit changes.
No evidence policy changes.
No build/TestFlight.

Design harness/docs only.

PART I — REPORTING

Follow agent-handoffs/README_REPORTING_STANDARD.md.

Publish main discoverability checkpoint, latest.md/latest.json, exact work/artifact commits, verify main visibility.

REPORT

agent-handoffs/reports/<timestamp>-energy-weight-recovery-founder-correction.md

If corrected artifacts satisfy the explicit Founder feedback:
Energy / Weight / Recovery = READY TO LOCK pending Founder visual confirmation.

STOP after focused corrected artifacts and interaction-parity proof are ready.

END TASK.