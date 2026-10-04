PhysiqueOS final design Batch 3 — Home Screen Widget closeout

TASK TYPE

Continue in Codex A / existing UI design program chat.
Use High reasoning.
Same chat.

Founder accepted Final Design Batch 2 — Daily Capture + Explanation. Treat Batch 2 and every previously accepted design family as LOCKED.

This is FINAL DESIGN BATCH 3 of 3 and the final explicit design task identified by the exhaustive app-wide redesign coverage audit.

Design only. No shipping implementation.

SCOPE

Design the remaining Home Screen Widget surface group identified by the exhaustive audit.

Use:
agent-handoffs/reports/20261004T204247Z-app-wide-redesign-coverage-audit.md

and its coverage artifacts as exact scope authority.

Do not expand into Live Activities, Apple Watch, Home tab, notifications, or other already locked surfaces.

SOURCE AUDIT FIRST

Reverify current Native authority and audit the current widget implementation completely:
- supported widget families/sizes;
- current timeline/provider behavior;
- exact canonical content shown;
- refresh/timeline semantics;
- deep-link/tap behavior;
- loading/placeholder/snapshot behavior;
- stale/unavailable/error behavior if materially user-visible;
- privacy/redaction behavior if current;
- app-group/shared-state dependencies;
- appearance behavior and any current fixed-dark assumptions.

Do not invent new widget capabilities, metrics, controls or sizes.

DESIGN INTENT

Translate the current Home Screen Widget into the locked PhysiqueOS visual system.

The widget should feel like a compact extension of locked Home:
- high information density appropriate to its actual size;
- immediate Goal/trajectory/status meaning only where current content supports it;
- restrained branding;
- readable at a glance;
- no mini-dashboard clutter;
- no invented coaching;
- no duplicated information merely to fill space.

Preserve exact current content/behavior authority.

If multiple current widget sizes materially differ, render each.

DARK + MINERAL LIGHT

Render every supported/material widget family in Dark and Mineral Light.

Also account for System appearance behavior in the target design, but do not implement the global appearance architecture in this task.

Ensure WidgetKit/system background/container behavior remains feasible.

ACCESSIBILITY / SYSTEM FIT

Respect widget-safe typography, truncation, contrast, privacy behavior and system margins.
No interaction smaller or more complex than WidgetKit/current behavior supports.
Do not design unsupported interactive controls.

IMPLEMENTATION DELTA LEDGER

Review agent-handoffs/DESIGN_IMPLEMENTATION_DELTA_LEDGER.md before stopping.
Append only newly discovered genuine implementation-relevant behavior/data/navigation/accessibility gaps.

DESIGN PROGRAM CLOSEOUT

After the widget is fully designed, reconcile the original exhaustive audit.

Explicitly report whether all nine former C-classification groups are now Founder-reviewed/ready for lock:
- Home Confidence Detail;
- Morning Check-In;
- manual/backdated Weight;
- Briefing History;
- generic Evidence intake;
- Progress Photos intake;
- DEXA intake;
- generic Evidence Review;
- Home Screen Widget.

If the widget is accepted by Founder after this task, the current Native redesign program should be able to be declared DESIGN COMPLETE.

Produce a concise design-program closeout matrix showing every former C item and its final design authority.

REVIEW OUTPUT

Produce:
1. one mobile-friendly primary widget review board;
2. dark/light pair for each materially distinct supported widget size/state;
3. compact source/behavior coverage matrix;
4. design-program closeout matrix.

No multiple design directions.

REPORT

agent-handoffs/reports/<timestamp>-final-design-batch3-home-screen-widget.md

Follow agent-handoffs/README_REPORTING_STANDARD.md.
Publish a main-visible artifact commit and identify the exact primary PNG.

SHIPPING ISOLATION

No Native/widget shipping implementation.
No Server changes.
No production mutations.
No schema changes.
No build/TestFlight.
Do not start the global appearance implementation yet.

LOCK STATUS

All prior design families + Final Design Batches 1 and 2 = LOCKED.
Home Screen Widget = pending Founder review.

STOP when the current widget family is fully source-audited, all material states/sizes are covered in dark/Mineral Light, validation passes, closeout matrix is published, and Founder review artifacts are ready.

END TASK.