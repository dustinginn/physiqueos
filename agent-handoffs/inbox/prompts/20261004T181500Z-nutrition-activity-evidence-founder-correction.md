PhysiqueOS Nutrition + Activity Evidence — Founder correction before lock

TASK TYPE

Continue in Codex B / existing Evidence design chat.
Use High reasoning.

This is a focused correction pass before Founder lock.

Do not redesign the accepted styling.
Do not modify shipping Native UI.
Do not change Server behavior, evidence contracts, aggregation, HealthKit semantics, history data or navigation authority.

AUTHORITY

Nutrition + Activity design package:
source work branch codex/nutrition-activity-evidence-design
source work commit 8de163506d6e996328e60d510199562cdeb8dffb
artifact commit 33ea64910c505cdf068909181c5317dadf6a0d5a
main report commit 3fdf1eb2c76afd22e2875fef109063b4066d06d0

Native authority:
b8ee8690b194cb90086b62816b9a2c8c400dc026 — Build 85

Founder likes the overall Nutrition + Activity styling.

Two product/presentation corrections are required.

PART A — RESTORE RECENT HISTORY TO ROOT PAGES

The current production Nutrition root visibly includes:
Recent Nutrition History
at the bottom of the main Nutrition Evidence page.

It shows recent day rows and:
Show All >

Show All routes to the existing full Recent Nutrition History destination.

Codex's design package clearly contains the full Recent Nutrition History page/template, but the Founder cannot see the recent-history section on the redesigned Nutrition root.

This is a discoverability regression.

REQUIREMENT — NUTRITION

Restore Recent Nutrition History to the bottom of the main Nutrition Evidence root.

Preserve current production semantics:
- section title: canonical current label;
- recent day rows;
- canonical number of preview rows from current source;
- exact date;
- calories;
- macro summary;
- meal count where current projection provides it;
- row drill-down to Nutrition Day;
- Show All route to full history.

Do not duplicate or create a second history dataset.

Root preview and full history use the same canonical source.

The full history page Codex already designed remains.

REQUIREMENT — ACTIVITY

Audit current production Activity root and restore the equivalent Recent Activity History section at the bottom if current Build 85/source contract provides it.

Founder explicitly expects Recent History on BOTH Nutrition and Activity root Evidence pages.

Preserve:
- canonical preview count;
- canonical row values;
- exact drill-down;
- Show All full-history behavior if current source has it.

If Activity current Native source has a Recent History collection but current UI accidentally fails to expose it:
document the exact discrepancy and render the Founder target using the existing canonical data/route.

Do not invent history values.

PART B — REMOVE ALL USER-FACING "COMING SOON"

Founder decision:

At this stage, do NOT advertise future Evidence capabilities.

"Let's report on what we have for now."

Remove user-facing Coming Soon entries from the target design.

NUTRITION

Examples currently shown include:
- Micronutrients — Coming soon
- Supplements — Coming soon
- Hydration — Coming soon

Audit source.

If an area:
- has no usable current report;
- has no meaningful current detail;
- exists only as roadmap/placeholder;
- routes to placeholder content;

do NOT show it on the redesigned Evidence root.

Do not replace "Coming soon" with another placeholder phrase.

Do not show disabled cards for future capability.

Only expose current useful product surfaces.

Keep current functional surfaces, including where actually implemented:
- Calories;
- Macros;
- Meals;
and any other genuinely functional current Nutrition surface source audit proves exists.

ACTIVITY

Apply the same rule.

Remove:
- placeholder areas;
- coming-soon destinations;
- dead links;
- Foundation-only routes with no useful current report,
from the target Activity root.

Only report/expose what PhysiqueOS currently has.

IMPORTANT DISTINCTION

Do NOT remove a current canonical data field simply because it lacks a dedicated report.

Example:
if an Activity Day contains a valid metric, preserve it on Activity Day.

The removal rule applies to user-facing navigation/area cards that advertise nonfunctional future destinations.

Do not suppress valid current evidence.

PART C — REPORTING

Founder agrees Codex was right to eliminate Reporting pages that are dead links or go nowhere.

Maintain that cleanup.

Rules:
- functional Reporting destination: keep;
- placeholder/dead/future-only Reporting destination: hide;
- no Coming Soon;
- no dead chevrons;
- no fake destination.

Nutrition:
audit Calories/Macros/Meals and preserve the functional ones exactly.

Activity:
do not invent Reporting if Build 85 has none.

PART D — ROOT PAGE TARGET STRUCTURE

NUTRITION target should read approximately:

Evidence Report / Nutrition
→ scope
→ Latest Nutrition Day
→ functional Reporting only
→ functional current Nutrition areas only, if distinct/useful
→ Recent Nutrition History
→ any other current canonical root sections that genuinely exist.

Source authority determines exact order except:
Recent Nutrition History must remain discoverable on the root and should sit in the production-equivalent lower/root position.

ACTIVITY target:
same principle:
Evidence Report / Activity
→ scope if current
→ Today/Latest Activity Day
→ functional current sections
→ Linked Training Context if current and useful
→ Recent Activity History
→ any other genuinely current root content.

Do not advertise roadmap.

PART E — VISUAL DESIGN

Keep the accepted new Evidence styling.

Do not reopen:
- typography;
- palette;
- card language;
- metric presentation;
- history row styling;
- dark/mineral-light design direction.

Use the already-designed full-history row language for root preview rows where appropriate.

Avoid excessive cards.

PART F — DARK + MINERAL LIGHT

Produce focused corrected renders in BOTH appearances.

Required:

NUTRITION
1. corrected Nutrition root — dark, full enough to show Recent History;
2. corrected Nutrition root — mineral light;
3. focused Recent Nutrition History root section;
4. full Recent Nutrition History page only if needed to prove routing/continuity.

ACTIVITY
5. corrected Activity root — dark, full enough to show Recent History;
6. corrected Activity root — mineral light;
7. focused Recent Activity History root section;
8. full history page only if needed.

Also produce one concise before/after board showing:
- placeholder/Coming Soon navigation removed;
- Recent History restored.

Do not rerender every Nutrition/Activity subpage.

PART G — VALIDATION

Require:

Nutrition:
- Recent History root preview present;
- Show All route preserved;
- recent rows route to Nutrition Day;
- same canonical history source as full page;
- no Coming Soon text;
- no dead/future-only navigation;
- functional Calories/Macros/Meals preserved;
- totals/aggregation unchanged.

Activity:
- Recent History root preview present;
- exact canonical routing;
- no Coming Soon text;
- no dead/future-only navigation;
- no invented Reporting;
- Activity metrics/history unchanged;
- Cooldown remains non-Cardio;
- canonical Cardio semantics unchanged.

Dark/light:
- identical content/geometry;
- only tokens differ.

PART H — TRAINING

Training Evidence remains LOCKED.

Do not change it.

All 10 canonical Training Areas remain preserved.

PART I — SHIPPING ISOLATION

No shipping source changes.
No Server changes.
No evidence contract changes.
No Nutrition aggregation changes.
No Activity/Cardio policy changes.
No HealthKit changes.
No build number.
No TestFlight.

Design harness/documentation only.

PART J — REPORT DISCOVERABILITY

Follow:
agent-handoffs/README_REPORTING_STANDARD.md

Before stopping:
- report/checkpoint visible on main;
- latest.md updated;
- latest.json updated;
- exact branch/commit/artifact root recorded;
- verify main can retrieve report;
- provide exact main SHA.

PART K — LOCK STATUS

Training Evidence: LOCKED.
Nutrition Evidence: accepted styling; correction pending.
Activity Evidence: accepted styling; correction pending.

If this focused pass satisfies Founder intent:
Nutrition Evidence = READY TO LOCK.
Activity Evidence = READY TO LOCK.

REPORT

Publish:
agent-handoffs/reports/<timestamp>-nutrition-activity-evidence-founder-correction.md

Include:
- exact root/history source audit;
- functional vs placeholder destination inventory;
- what was hidden and why;
- Recent History mapping;
- artifact paths;
- dark/light parity;
- confirmation no shipping source changed.

STOP when focused corrected Nutrition + Activity root artifacts are ready for Founder confirmation and main discoverability is verified.

END TASK.
