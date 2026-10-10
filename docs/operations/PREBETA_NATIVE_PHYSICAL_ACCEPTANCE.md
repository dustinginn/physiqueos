# Consolidated Native pre-beta physical acceptance

Status: prepared, not executed. This checklist is for the next consolidated Native candidate only. It does not authorize TestFlight upload, production mutation, or release.

## Required devices and setup

- One iPhone paired to the Founder's Apple Watch, both on the candidate build.
- Existing authorized install upgraded in place first; a clean install is a separate final case.
- Apple Health contains at least one genuine workout and nutrition/activity data for today.
- Network conditioning supports online, offline, interrupted, and recovered states.
- Capture build number, iPhone/watchOS versions, device timezone, start/end time, and a screenshot or screen recording for each visual gate.

## Acceptance matrix

### HealthKit authorization durability

1. Upgrade the already-authorized installation. Cold-launch iPhone three times, foreground/background it three times, and perform one forced termination/relaunch. No Health permission sheet may appear.
2. Launch the Watch app three times, begin and cancel one pre-workout flow, and begin one real workout. No repeated Health permission sheet may appear.
3. Trigger foreground synchronization and one background-delivery wake. Both must ingest normally without requesting authorization again.
4. Update the same candidate over itself and repeat the launch/background sequence. The durable exact-scope receipt must still suppress an unnecessary request.
5. On a clean install, request the established automatic-read scope once. A second launch must not request it again.
6. Exercise a genuinely new scope separately. Only that new scope may present a sheet; the established read scope must not be re-requested.
7. Verify Activity, Nutrition, Workout ingestion and DEXA body-composition writeback still behave as before. A denied or unavailable scope must fail truthfully without disrupting manual evidence.

### Watch workout presentation

1. Inspect Ready for Workout, Complete Set, paused/resume, finish, and equivalent primary workout actions in Dark and Mineral Light.
2. Every primary action uses the accepted amber treatment with readable ink, including disabled and pressed states.
3. No unwanted system-colored bottom bar or duplicate footer appears on the workout screen.
4. The clock, set target, Health status, navigation, haptics, set completion, finish, and recovery behavior remain unchanged.
5. Check the smallest supported Watch and one larger Watch at default and largest practical text sizes.

### Today widget

1. Small and large Today widgets contain no Weight row, even when the backward-compatible payload still supplies Weight.
2. Nutrition, macros, Activity, refresh, and Start Logger remain present and actionable where supported.
3. The tightened layout has no clipping at default and large text sizes in Dark and Mineral Light.
4. Refresh and Start Logger preserve their accepted amber actions and deep links.

### Today priorities schedule copy

1. Foam Rolling renders one schedule line: `Daily · 5:00 PM`; `5:00 PM` must not appear on another line.
2. Exercise daily, weekly, one-off, peptide, workout, custom, and overdue examples on Home and any priority detail/list surface.
3. Suppress only redundant cadence/date/time text. Preserve a genuinely distinct due time versus scheduled time and preserve dose/instruction copy.
4. Verify complete and skip controls, notification schedules, canonical recurrence, card geometry, localization, accessibility labels, and Dynamic Type are unchanged.

### Durable evidence processing

1. Submit a synthetic photo or document, close the app after durable acceptance, then relaunch. The item must recover as waiting, queued, processing, retrying, ready, or failed from Server state rather than local memory.
2. Repeat while offline after acceptance, then reconnect. The status must remain truthful and converge without duplicate submission.
3. Open a recoverable failure and a terminal action-required failure. Retry and review navigation must reach the correct item; no pending state may say no action is required.
4. Confirm VoiceOver announces state and action consistently in Dark and Mineral Light.

## Pass gate

All rows require recorded evidence and no Severity 0/1 defect. A HealthKit re-prompt, missing/duplicate primary workout action, broken widget action, duplicate priority schedule, lost evidence status, or incorrect failure navigation blocks upload. TestFlight remains separately authorized.
