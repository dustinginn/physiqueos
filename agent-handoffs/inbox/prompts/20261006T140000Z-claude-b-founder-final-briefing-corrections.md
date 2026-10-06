PhysiqueOS Overnight Lane B — Founder final corrections: DEXA Briefing + Briefing History

Continue in the EXISTING Claude B Briefings Remote Control chat using High reasoning. Same chat/worktree/branch.

FOUNDER REVIEW STATUS

Founder approves the Briefings redesign lane except for the two correction groups below.

Do not reopen Midweek, Weekly, Monthly body presentation, Photo Briefing, paired Photo viewer, shared chrome/states, or other accepted presentation unless required mechanically by these exact corrections.

CORRECTION 1 — DEXA BRIEFING

The current Native candidate drifted away from the locked DEXA reference by replacing the scan-change visual treatment with spreadsheet-like tables.

Founder explicitly wants the LOCKED REFERENCE geometry/presentation restored.

Use the locked reference shown in the existing DEXA review board as layout authority:
- compact Snapshot / Measured Event area;
- “What Measurably Changed”;
- individual metric change rows/rails;
- previous/current endpoints;
- visual rail;
- delta;
- Regional Fat Change;
- Measured Lean Tissue Change;
- Other Notable Changes;
- subsequent phase/context/coaching sections per the lock.

Do NOT use the candidate’s large generic Previous / Current / Delta table presentation as the primary design.

The briefing should feel like a briefing/interpretation surface, not raw Evidence tables.

DIRECTIONAL COLOR

Founder wants delta/value accent color to communicate whether a change is favorable or unfavorable for the active physique goal, and to break up monotonous all-green figures.

Semantic direction must NOT simply mean positive number = green.

For the current Lean Mass Build semantics:
- lean tissue gain -> green / favorable;
- lean tissue loss -> red/coral / unfavorable;
- fat tissue gain -> red/coral / unfavorable;
- fat tissue loss -> green / favorable;
- body-fat percentage increase -> red/coral / unfavorable;
- body-fat percentage decrease -> green / favorable;
- effectively unchanged / neutral -> neutral gray;
- metrics where favorable/unfavorable cannot safely be inferred -> neutral or restrained amber, not fabricated green/red.

RMR, ratios and other context-dependent metrics must remain neutral/amber unless canonical briefing semantics support a favorable/unfavorable interpretation.

Regional fat and regional lean rows follow their tissue-specific semantics.

Keep the rail itself structural/teal as in the lock. Apply semantic color primarily to delta/accent values so the page remains restrained.

ARROWS

Founder is fine removing the old direction arrows.

Prefer the signed delta + semantic color + rail without redundant arrows if that produces the cleaner locked treatment.

Do not require arrows merely because the historical DEXA presentation used them.

GOAL CONTEXT

Implement semantic coloring through a bounded presentation semantic mapping that can support other physique goals safely.

Do not hard-code “gain is good” globally.

If the active/historical goal context is insufficient to infer favorability for a metric, use neutral/amber.

Do not modify historical DEXA payloads or regenerate the briefing.

CORRECTION 2 — BRIEFING HISTORY

Remove the candidate behavior that replaces navigation row titles with briefing narrative/headlines.

Founder wants stable navigation titles.

Primary row title:
- Weekly Briefing
- Midweek Briefing
- Photo Briefing
- DEXA Briefing

Monthly exception:
- retain the useful month/year qualifier, e.g. “Monthly Briefing · September 2026”.

Keep publication date/time beneath as currently designed.

Narrative/hero headlines belong inside the briefing detail, not in Briefing History navigation.

TYPE COLOR CODING

Give each briefing type a consistent semantic accent color for fast scanning.

Apply the type color to:
- briefing type eyebrow/header;
- corresponding icon/accent treatment.

Do NOT color the large/main row title; keep it neutral for hierarchy and legibility.

Define/reuse one semantic type-color mapping so the same briefing type is identifiable consistently wherever type identity is presented.

Use restrained colors compatible with both Dark and Mineral Light and the accepted PhysiqueOS palette.

Do not alter briefing meaning or content.

REVIEW

Rerender only the affected review boards:
- DEXA Dark;
- DEXA Mineral Light;
- Briefing History Dark;
- Briefing History Mineral Light.

Each board must show locked/reference intent beside corrected real SwiftUI.

Push the corrected boards to GH and verify the direct GitHub links remotely before reporting.

TESTS

Add/update focused deterministic tests for:
- DEXA locked rail geometry/presentation replacing the generic table layout;
- tissue/goal-aware favorable/unfavorable/neutral semantic mapping;
- ambiguous metrics stay neutral/amber;
- stable History titles;
- Monthly month/year qualifier;
- no narrative headline used as History row title;
- per-type semantic accent mapping;
- main row title remains neutral;
- Dark + Mineral Light.

Run the relevant Briefing unit/UI regression suite and Release compile if behavior-bearing source changes warrant it.

No briefing regeneration.
No canonical payload mutation.
No Server change/deploy.
No build bump.
No TestFlight.
No merge.

OUTPUT

Publish corrected candidate SHA, test results and verified direct links to the four corrected boards.

Notify:
PhysiqueOS Briefings — Founder corrections ready for final review.

STOP.

END TASK.