# Wednesday Midweek Briefing

The Wednesday Midweek Briefing is a read-only editorial preview. It interprets the opening Sunday-through-Tuesday portion of the current week while there is still time to adjust. It is intentionally shorter and more operational than Sunday’s Weekly Briefing.

The preview uses date-only boundaries in the user timezone. A July 22, 2026 preview includes July 19–21 and excludes Wednesday. Sunday’s production Weekly Briefing remains the complete prior Sunday-through-Saturday window; it is not redefined as Wednesday through Saturday.

## Editorial hierarchy

The preview leads with one specific verdict, then prioritizes Energy Balance, Training Response, phase interpretation, concise weight context, relevant DEXA evidence, the goal-level guardrail, one coaching decision, at most three priorities through Sunday, and open questions for the Weekly Briefing. Evidence completeness is disclosed compactly. Weight never receives a chart.

Energy expenditure combines the latest supported resting-energy basis with Apple Watch active energy. Active energy receives the established ±30% uncertainty range. Intake minus active calories is never called total energy balance. Estimates require an intake, active-energy value, and resting-energy basis for the same day; missing days remain missing. The chart appears only with at least two defensible observations.

Training reports resistance-session count, representative movement signals, logged sets when available, and resistance-training minutes by day. It does not invent workload from incomplete logs or repeat every exercise. Weight uses a three-day average, a prior comparable window when available, and noise-aware prose without inferring body composition.

A DEXA inside the window becomes a prominent section connected to the overall target and body-fat guardrail. Without a new scan, the latest DEXA may appear only as context; scale weight never substitutes for lean mass, fat mass, or body-fat evidence. Other evidence is included only when it changes the active-goal interpretation.

The coaching decision contains one decision type, evidence-linked rationale, uncertainty, a Sunday reversal condition, and an explicit `protocolChangeRecommended: false` preview field. Priorities derive from that decision and are capped at three.

Open coaching threads are deterministic preview objects with source claims, evidence requirements, priority, and an open lifecycle state. They are never persisted. A future Sunday adapter may classify them as confirmed, revised, unresolved, or retired using the full week. Sunday may reuse the evidence totals but should cite and resolve the Wednesday hypothesis rather than repeat its prose.

The preview does not create briefing artifacts, advance claims or lifecycle state, alter Weekly generation, notify users, modify protocols, or write evidence, goals, or phases. Wednesday production uses the same approved composition core through a separate persistence adapter; this development preview remains isolated and read-only.
