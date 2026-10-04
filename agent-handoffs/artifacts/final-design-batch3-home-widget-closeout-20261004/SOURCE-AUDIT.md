# Home Screen Widget source audit

## Authority

- Native Build 85: `b8ee8690b194cb90086f62816b9a2c8c400dc026`
- current Server authority: `3c0f4aefddbb9a6886f6ad012443978303d47024`
- exact task authority: `c91e3ae1d958c11f5e6112b1edf715ff7f6b874f`
- app-wide scope authority: audit row `U04`

No Build 86 authority exists in the audited repository. The design harness is disposable documentation and is not compiled into an app or extension target.

## Supported families and current geometry

`HomeLoggedTodayWidget` currently declares exactly two families:

- `.systemSmall`;
- `.systemLarge`.

There is no current medium, extra-large, accessory, Lock Screen or Control Center family. Current deterministic screenshot tests use 170 × 170 pt with 12 pt preview margins and 360 × 376 pt with 16 pt preview margins. This package uses those exact conditions. It does not add a size.

## Provider and timeline

`HomeLoggedTodayTimelineProvider`:

- uses the canonical sample snapshot only for placeholder/preview;
- otherwise reads one local App Group file;
- performs no extension-owned Server, HealthKit or credential work;
- emits the current entry and, when at least five minutes away, a next-local-midnight entry;
- asks WidgetKit for a new timeline after 45 minutes.

There is no separate user-visible loading skeleton. A missing/malformed/future-schema snapshot fails soft into the current unavailable presentation.

## Canonical content

The shared snapshot is version 1 and contains only display/navigation fields:

- local day, time zone, write/success timestamps and refresh state;
- Training summary and at most two bounded display lines;
- Nutrition calories, protein, carbs and fat;
- Activity active calories plus partial-day state;
- exact current-day Weight display string;
- active-workout state, session id, short label and completed/total set counts.

The projection is exact-day only. Yesterday is never substituted. Missing values remain missing, never zero. Training provenance/source is intentionally removed before the widget snapshot.

### Small content

`Today`; compact freshness; refresh; Nutrition calories and P/C/F; Active calories; Weight when present; Start Logger or Resume Workout. Training is intentionally absent. The whole small widget owns the workout deep link.

### Large content

`Logged Today`; freshness; refresh; Training; Nutrition; Activity; Weight; Start Workout Logger or Resume Workout. Each domain row has its current independent deep link.

## Freshness and failure semantics

- Fresh: successful read age ≤ 90 minutes.
- Aging: successful read age > 90 minutes and ≤ 4 hours.
- Stale: age > 4 hours or refresh state is not success; trusted values remain visible and warning copy appears.
- Waiting for today: snapshot local date is not the current date in its named time zone; prior-day Nutrition, Activity and Weight stay hidden.
- Unavailable: absent snapshot or no successful read time; prompts opening PhysiqueOS.
- Failed with no prior snapshot: writes an empty failed snapshot, which resolves to unavailable copy.
- Offline with a prior snapshot: preserves prior canonical totals and active-workout projection.

No invented red error state, spinner or retry workflow was added.

## Refresh and write ownership

The app-owned coordinator reads current Log, exact-day Nutrition and Activity, projects exact-day Weight, attaches the selected authority's active live workout and atomically writes the App Group snapshot with complete-file-protection-until-first-authentication. It keeps authority/account-scope fences and clears or rotates on session boundaries.

The widget refresh action foregrounds the app and asks the installed app-side coordinator for canonical reads. The extension never owns credentials or a parallel health/data authority.

## Deep links and mutation safety

Current typed destinations cover summary, Training day, Nutrition, Activity day, Weight, refresh, Start Workout and Resume Workout. Parsing is scheme/host exact, duplicate-key rejecting, date validated and value length bounded.

Start/Resume links are navigation-only. The app revalidates the selected authority and active session. A stale Resume falls back safely; a live session wins over stale Start; saved-and-left drafts are not silently resumed. The widget cannot create or mutate a workout.

## Privacy and redaction

The snapshot excludes credentials, tokens, raw HealthKit samples, meal detail, evidence bytes and set/load/rep detail. Current totals/rows and active-workout progress are marked privacy-sensitive. The package includes an explicit privacy-redacted state in both appearances and sizes.

## Appearance finding

Current source is fixed dark: hard-coded navy, white text and purple accent. The target replaces those display constants with appearance-aware locked dark/Mineral-Light widget tokens while preserving `containerBackground` and system-owned widget geometry. This is already covered by the open app-wide Appearance implementation delta; it is not a new duplicate ledger item.

For System appearance, WidgetKit should resolve the device color scheme. The target does not assume the app's future in-app preference can override Home Screen appearance before the global appearance architecture is implemented. Accent/tinted rendering must preserve labels, dividers and status copy so meaning never depends on color.

## Test authority inspected

`HomeWidgetTests` proves snapshot round-trip/fences, malformed/future-schema fail-soft behavior, exact-day projection, fresh/aging/stale/waiting state calculation, typed deep links, navigation-only workout handling, number formatting, session cleanup, protected-data behavior and the seven original visual fixture states. Batch 3 adds an explicit unavailable/no-snapshot design render and retains every original fixture state.
