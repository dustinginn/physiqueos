# Remaining Operating Plan action and mutation parity

| Surface | Action | Current canonical behavior preserved |
|---|---|---|
| Tracking root | Edit Support | Pushes the editor with exact `execution_morning_weigh_in` identity. |
| Tracking editor | Frequency / timing / window / reminder / notes | Edits one recurring Support draft. Weight evidence still completes the routine automatically. |
| Tracking editor | Save Support | Sends protocol/category/execution/reminder identity plus expected execution revision, persists once, reconciles canonical notifications, then dismisses. |
| Tracking editor | Failed save | Keeps the editor open and states that the schedule was not saved. |
| Coaching detail | Edit Coaching Updates | Pushes the `briefings` strategy editor with the active protocol identity. |
| Coaching editor | Cadence controls | Preserve enabled/day/exact local time for Midweek and Weekly. Monthly remains calendar Day 1; only enabled/time are editable. |
| Coaching editor | Progress Photos | Preserves 1…12 interval, week/month unit, weekday, month ordinal, time choice/specific time, Server-owned anchor preview, reminder and event briefing. |
| Coaching editor | DEXA | Preserves future-date validation, time, optional preparation note, week/day/morning reminders, upload reminder and event briefing. |
| Coaching editor | Save Coaching Updates | One atomic `operating-plan.coaching-updates.save.v1` submission across Coaching, Photos/reminder and DEXA with all current concurrency fences. No partial acceptance. |
| Coaching editor | Notifications | Explanatory only. Native saves `notify_when_ready`; no invented selector appears. |
| DEXA utility | Founder Production | Presents the current unavailable message only; no mutation is exposed. |

Cancel/back semantics remain standard NavigationStack dismissal. No production data was read or mutated to create these artifacts.

