PhysiqueOS app-wide redesign coverage audit

TASK TYPE

Continue in Codex A / existing UI design program chat.
Use High reasoning.
Same chat.

Founder has accepted the final Tracking and Coaching Updates package. Treat the entire Operating Plan design family as LOCKED end to end.

The major PhysiqueOS redesign program is now substantially designed. Before declaring design complete, perform an exhaustive app-wide audit to identify every current user-facing Native surface that still needs explicit new-design/styling attention.

This is an AUDIT ONLY. Do not redesign surfaces in this task. Do not implement shipping UI.

GOAL

Produce a definitive remaining-design coverage map for the current Native app.

Answer:
1. Which current user-facing pages/sheets/modals/viewers/states have already been explicitly redesigned and Founder-locked?
2. Which current user-facing surfaces have been reviewed and intentionally need no dedicated redesign because they inherit a locked component/family treatment?
3. Which current user-facing surfaces still use old styling or have never received explicit design review and therefore need a design pass?
4. Which apparent surfaces are dead, sandbox-only, diagnostic-only, unreachable, obsolete, or otherwise should NOT receive redesign work?
5. Are there any important cross-app system surfaces we have missed, such as onboarding/enrollment, loading/error/empty states, media viewers, sheets, alerts, pickers, notification-related UI, HealthKit/source flows, Watch surfaces, Live Activities, or utility destinations?

SOURCE AUTHORITY

Reverify current Native authority before auditing. Do not assume Build 85 remains current merely because earlier design audits used it.

Use source/routes/navigation as the exhaustive authority, not memory and not screenshots alone.

Review:
- all AppDestination / NavigationStack routing;
- every tab root;
- sheets/full-screen covers;
- dialogs/alerts where materially styled;
- evidence intake/review flows;
- training/logger flows;
- briefing families;
- Goals;
- Priority Detail;
- Operating Plan;
- You/Settings target;
- Apple Watch app;
- Live Activities/widgets if app-owned styling applies;
- enrollment/account/source connection surfaces;
- media/photo viewers;
- DEXA intake/review/correction flows;
- notification/deep-link destinations;
- any remaining current Founder Production utility pages.

CANONICAL LOCKED DESIGN CONTEXT

Do not reopen accepted work.

At minimum reconcile against the canonical handoff and latest reports/artifacts for:
Home;
Log;
recurring Briefings;
DEXA and Photo Event briefings;
Watch;
Live Activities;
Training Logger;
Goals;
Priority Detail;
Operating Plan entire family;
Evidence Hub and Training/Nutrition/Activity/Energy/Weight/Recovery/Progress Photos/DEXA/Timeline;
You / Settings / Profile / Data Sources / Appearance.

Review agent-handoffs/DESIGN_IMPLEMENTATION_DELTA_LEDGER.md, but do not confuse an implementation delta with a missing design surface.

CLASSIFICATION

For every current user-facing surface, assign exactly one:

A — FOUNDER-LOCKED DESIGN
Explicit reviewed target exists. No more design work.

B — COVERED BY LOCKED FAMILY / COMPONENT SYSTEM
No dedicated new mockup is needed; implementation should inherit a locked family/system. Explain which authority covers it.

C — DESIGN PASS STILL REQUIRED
Current/reachable surface needs explicit Founder-facing redesign/styling review. Explain why and identify its route/entry point.

D — DO NOT REDESIGN
Dead, unreachable, sandbox-only, engineering diagnostic, obsolete, superseded, or intentionally excluded. Explain why.

E — FOUNDER DECISION NEEDED
Use sparingly where product ownership/continued existence must be decided before design.

Do not classify implementation plumbing as C unless a user-facing target itself is missing.

AUDIT DEPTH

Trace reachable Founder Production UI, including conditional routes and less-common states. Do not stop at top-level pages.

For each C item capture:
Surface | route/entry | current purpose | current styling family | why explicit design is still needed | dependencies | recommended design batch/family | priority.

Also identify any C surfaces that can be safely grouped into one final design batch.

DESIGN PROGRAM CLOSEOUT

Produce:
1. an app-wide route/surface coverage matrix;
2. a concise Founder-facing remaining-design summary;
3. a recommended final design sequence, if anything remains;
4. explicit statement whether the major redesign can be considered design-complete after those remaining items;
5. count of A/B/C/D/E classifications.

If there are zero C/E surfaces, prove that from route/source coverage rather than simply declaring completion.

IMPLEMENTATION DELTA LEDGER

Review agent-handoffs/DESIGN_IMPLEMENTATION_DELTA_LEDGER.md before stopping.
Do not append entries merely because a surface still needs design.
Append only newly discovered implementation-relevant behavior/data/navigation/accessibility gaps.

OUTPUT

Publish:
agent-handoffs/reports/<timestamp>-app-wide-redesign-coverage-audit.md

Also produce one mobile-friendly summary artifact if useful, but this is primarily a source/coverage audit; do not waste time generating decorative screen mocks.

Follow agent-handoffs/README_REPORTING_STANDARD.md and make the report/main pointer discoverable.

SHIPPING ISOLATION

No Native UI implementation.
No Server changes.
No production mutations.
No schema changes.
No build/TestFlight.
No redesign renders beyond a simple audit summary artifact if useful.

STOP when every current user-facing Native route/surface is classified and the remaining design work, if any, is unambiguous.

END TASK.