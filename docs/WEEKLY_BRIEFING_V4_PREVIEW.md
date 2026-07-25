# Weekly Briefing V4 Preview

The production `WeeklyBriefingScreen` and its five-card `weekly_narrative_v5_1` contract are the canonical Weekly presentation. V4 changes evidence selection, interpretation, and coaching conclusions; it does not define a second visual system.

The deterministic review route is `/briefings/weekly/preview?date=2026-07-19`, resolving the completed July 12–18 week. When a persisted Weekly artifact exists for the requested window, the preview uses that artifact as the presentation and historical-goal source of truth. This keeps the July 12–18 interpretation attached to Visible Abs at Rest rather than the goal active today.

Same-week Wednesday coaching threads may inform the Weekly interpretation, but internal resolution states remain hidden. The UI describes naturally what the rest of the week confirmed, changed, or left uncertain. Without a Midweek artifact, the Weekly remains complete and does not show an empty continuity treatment.

The preview is read-only. It does not create or replace artifacts, advance lifecycle state, alter history, or affect production Weekly scheduling and generation.
