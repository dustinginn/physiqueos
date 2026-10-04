# Operating Plan final remaining source audit

Status: complete. This is design translation only.

## Authority

- Prompt: `agent-handoffs/inbox/prompts/20261004T195500Z-operating-plan-finish-all-remaining.md`
- Prompt commit: `3232c64a4a27cfe41678e7b8ffe6b3cd97eb0305`
- Native Build 85: `b8ee8690b194cb90086b62816b9a2c8c400dc026`
- Current Server: `3c0f4aefddbb9a6886f6ad012443978303d47024`
- Accepted Operating Plan system artifact: `89d05249f90cb65da5941d08d987eba50bfb18ce`
- Locked Recovery/Peptides/Supplements artifact: `acafbd377db3b2cc71a26fd121a73841fdc02820`

## Exact root order

Current Server `buildOperatingPlan` order, reconfirmed from source and tests:

1. Energy Strategy
2. Nutrition
3. Training
4. Recovery
5. Peptides
6. Supplements
7. Tracking
8. Coaching Updates, only when an active Coaching protocol exists

Everything through Supplements was Founder-locked before this pass. Therefore the exact remaining root rows are **Tracking** and **Coaching Updates**.

## Native route inventory after Supplements

### Tracking

`OperatingPlanLandingView` routes the Tracking row to `AppDestination.operatingPlanTracking`, rendered by `OperatingPlanTrackingView`.

The only child action is `Edit Support`, which routes with canonical `execution_morning_weigh_in` identity to `AppDestination.operatingPlanTrackingSupport` and `OperatingPlanTrackingSupportView`.

Founder Production uses the same bounded `operating-plan-recurring-support` read and `operating-plan.recurring-support.save.v1` write as Recovery. It does not use the sandbox fixture on failure.

Current content/behavior:

- title: Morning Weigh-In;
- purpose from the canonical execution record;
- Current Support;
- optional Next due;
- Completion is exactly `Weight evidence completes it automatically.` in Native Founder Production;
- frequency, timing, start/end, reminder and Execution Notes are editable;
- weight evidence owns completion; no `Mark Complete` action exists;
- save uses execution revision + reminder identity, then reconciles canonical notifications and dismisses;
- save failure preserves the draft and presents `The support schedule was not saved. Refresh before retrying.`

There is no separate Tracking detail page, history page, protocol page or completion page.

### Coaching Updates

The conditional root row routes to the generic `operatingPlanStrategy(strategyType: "briefings", strategyId:)` destination and `OperatingPlanStrategyDetailView`.

The detail read is bounded by `operating-plan-coaching-updates`. Its exact current fields are:

1. Midweek Calibration
2. Weekly Synthesis
3. Routine Daily Briefings
4. Notifications
5. Event Briefings

`Edit Coaching Updates` routes to `OperatingPlanStrategyEditorView`, whose `briefings` branch renders `CoachingUpdatesEditor`.

The complete editor order is:

1. Midweek Calibration: enabled, weekday, exact local time;
2. Weekly Synthesis: enabled, weekday, exact local time;
3. Monthly Review: enabled, read-only Day 1 rule, exact local time;
4. Progress Photos: interval 1…12, weeks/months, weekday, week-of-month when monthly, time choice, exact time when Specific, cadence preview, reminder and Photo Event briefing;
5. DEXA: future date, time, preparation note, three reminder choices, upload reminder and DEXA Event briefing;
6. Notifications explanatory text;
7. one `Save Coaching Updates` action.

The current Server projects structured flexible Progress Photo cadence, next/last dates and cadence baseline. A monthly Progress Photos state is therefore a real current editor state, not an invented flow.

Native intentionally sets the saved notification preference to `notify_when_ready`; there is no visible notification-choice editor. Routine Daily Briefings remain off and have no edit control.

The save is one atomic canonical command across Coaching cadence, Progress Photos, its reminder and DEXA. It carries global revision, both current protocol versions, both semantic digests and DEXA execution revision. No partial configuration is accepted.

There is no separate Coaching history, protocol detail, Monthly editor or event-briefing configuration page.

### DEXA appointment utility route

`AppDestination.operatingPlanDexaAppointment` and `OperatingPlanDexaAppointmentView` remain a current Operating Plan route even though there is no root row. It is intended to be reached by Priority Detail before a scan.

The Native Sandbox has a detail/editor. Founder Production deliberately renders only:

> Manage your production DEXA schedule in Coaching Updates, where Progress Photos and DEXA are saved together.

The confirmation artifact preserves this production-unavailable state and does not present the Sandbox editor as shipping behavior. The usability consequence is recorded in the implementation-delta ledger.

## Exhaustive stop proof

After excluding already locked cases, the App destination/router audit leaves exactly:

- Tracking root;
- Tracking Support editor;
- Coaching Updates detail;
- Coaching Updates editor;
- its material monthly Progress Photos conditional controls;
- the Founder Production DEXA appointment unavailable utility state.

`operatingPlanStatus` is a generic fallback for a projected item without a destination; neither current remaining root row resolves there. The Training builder is inside locked Training. Recovery, Peptide and Supplement domain/support/lifecycle routes are locked and were not reopened.

No other current Operating Plan page, subpage, history route, protocol route, schedule page or action remains undesigned.

