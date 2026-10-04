PhysiqueOS final design Batch 2 — Daily Capture + Explanation

TASK TYPE

Continue in Codex A / existing UI design program chat.
Use High reasoning.
Same chat.

Founder accepted Final Design Batch 1 — Evidence Intake + Review. Treat all four Batch 1 groups as LOCKED.

This is FINAL DESIGN BATCH 2 of 3.

Design only. No shipping implementation.

SCOPE

Design the four remaining Daily Capture + Explanation surface groups identified by the exhaustive app-wide coverage audit:

1. Home Confidence Detail
2. Morning Check-In
3. Manual / backdated Weight
4. Briefing History

Use the app-wide audit at:
agent-handoffs/reports/20261004T204247Z-app-wide-redesign-coverage-audit.md

and its coverage artifacts as exact scope authority.

Do not expand into already locked Home, Weight Evidence, recurring Briefing content, or Priority Detail surfaces.

SOURCE AUDIT FIRST

Reverify current Native authority and audit the complete current production hierarchy/behavior for these four groups.

For each group identify:
- every current entry point and route/sheet;
- canonical content and ordering;
- materially distinct states;
- input/edit behavior;
- validation/error/loading/empty behavior;
- navigation after save/close;
- historical/version behavior where relevant;
- confidence V3 versus historical V2 behavior where relevant;
- current date/occurrence semantics;
- any conditional content.

Do not invent capabilities or states.

HOME CONFIDENCE DETAIL

Preserve canonical Confidence V3 authority exactly.
Do not rewrite confidence content.
Do not invent scores, bands, assumptions or coaching.
Historical V2 behavior remains unchanged where surfaced.

Audit whether the previously requested removal of the Native Assumptions section is still an open/current design requirement and reconcile against current source/locked decisions. Do not reintroduce Assumptions if it was already accepted for removal.

The detail should visually belong to locked Home while remaining an explanation/detail surface.

MORNING CHECK-IN

Preserve exact current fields, date/occurrence semantics, completion behavior and canonical write contract.
Do not duplicate Priority Detail.
Do not add wellness questions or metrics not currently collected.

MANUAL / BACKDATED WEIGHT

Preserve exact current date selection, units, validation, save semantics, Goal filtering/history effects and duplicate/conflict behavior.
Do not redesign Weight Evidence itself.
This is the capture workflow only.

BRIEFING HISTORY

Preserve exact current briefing types, chronology, availability, navigation and historical V2/V3 rendering ownership.
Do not redesign briefing content.
Do not invent filters/categories/search unless current.
History should be compact and readable, with clear type/date/status hierarchy.

VISUAL DIRECTION

Use the locked PhysiqueOS dark/Mineral-Light system.

These are compact utility/explanation surfaces:
- strong but restrained hierarchy;
- minimal decorative treatment;
- obvious primary actions;
- compact forms;
- clear historical rows;
- no dashboard duplication;
- no Coming Soon;
- no engineering diagnostics.

DARK + MINERAL LIGHT

Render every materially distinct Founder-review surface in both appearances with identical content, geometry and behavior.

ACCESSIBILITY

Maintain Dynamic Type feasibility, non-color-only states, clear labels, native-feasible controls and >=44 pt interactive targets.

IMPLEMENTATION DELTA LEDGER

Review agent-handoffs/DESIGN_IMPLEMENTATION_DELTA_LEDGER.md before stopping.
Append only newly discovered genuine implementation-relevant behavior/data/navigation/accessibility gaps.
Do not confuse a missing implementation with a missing design.

REVIEW OUTPUT

Produce:
1. one mobile-friendly primary composite covering all four groups;
2. focused Confidence Detail board if useful;
3. focused Morning Check-In / Weight capture board if useful;
4. focused Briefing History board if useful;
5. dark/light pairs for every materially distinct surface;
6. coverage/action matrix proving all current states are represented.

No multiple design directions.

REPORT

agent-handoffs/reports/<timestamp>-final-design-batch2-daily-capture-explanation.md

Follow agent-handoffs/README_REPORTING_STANDARD.md.
Publish a main-visible artifact commit and identify the exact primary PNG.

SHIPPING ISOLATION

No Native shipping changes.
No Server changes.
No production mutations.
No schema changes.
No build/TestFlight.

LOCK STATUS

All previously Founder-accepted families and Final Design Batch 1 = LOCKED.
These four Batch 2 groups = pending Founder review.

STOP when all four groups are source-audited, every material state is covered in dark/Mineral Light, parity is validated and mobile review artifacts are published.

END TASK.