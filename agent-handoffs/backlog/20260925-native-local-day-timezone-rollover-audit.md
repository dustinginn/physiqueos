PhysiqueOS backlog: Native local-day/timezone rollover audit

Founder observation:
At approximately 12:11 AM on Sep 25 while traveling in Texas, the Native Log screen appeared to still show Sep 24 “Logged Today” values (Strength 28 min, Nutrition 2,415 calories, Activity 915 active calories, Weight 175.9 lb).

This is an observation, not yet a proven defect.

Future audit goals:
- Confirm whether Native “Today” surfaces roll over based on the device’s current local calendar/timezone.
- Audit behavior when the device timezone changes during travel.
- Distinguish intended canonical Goal/briefing timezone semantics from daily-driver “Today” UX semantics. Daily Log/Home “Today” likely should reflect the user/device’s current local day, while strategic briefing evidence windows may intentionally use a separately-authoritative canonical timezone.
- Trace date keys/cache keys, midnight refresh triggers, scene foreground/background handling, HealthKit query bounds, Server localDate parameters, and cached prior-day values.
- Confirm whether an app left open across midnight automatically invalidates/reloads without requiring force quit, navigation, or foreground transition.
- Test travel across timezone boundaries in both directions and DST boundaries.
- Verify Activity, Nutrition, Training, Weight, priorities/check-ins, and Logged Today all agree on the same intended current-day semantics.
- Ensure a timezone/day rollover does not rewrite historical records or reassign already-canonical observations to another date.
- Add deterministic tests for midnight rollover while foregrounded, rollover while backgrounded then foregrounded, timezone change before/after midnight, and server/device date disagreement.

Do not patch until reproduced and intended product semantics are explicitly confirmed.

Evidence:
Founder screenshot supplied in ChatGPT on Sep 25 showing the apparent prior-day Logged Today values after local midnight.
