# Activity page completeness (Checkpoint B correction, Part 1)

**Verdict:** the redesigned Activity page keeps every canonical lower-page section, route, sheet and state from Build 87 (`f66c7fc6`). Nothing was dropped.

The review board showed only the top of the page. The rest is present, rendered from the same read model (`ActivityLandingReadModel` / `ActivityDayRecord`), and reachable in the shipping app.

The candidate was compared with Build 87 source file by file. The counts below are taken from the source: every `NavigationLink`/destination, `.sheet`, `.task`/`.refreshable`/foreground-refresh modifier, and state branch.

## Activity root (`ActivityHistoryView`), top to bottom

| Section / behavior | Build 87 | Candidate | Proof |
|---|---|---|---|
| Header (Evidence Report · Activity · subtitle) | yes | yes (locked A1) | UI: `evidence.page.header` |
| Goal/phase scope selector → `selectScope` re-read | yes | yes | UI: `assertScopeSwitches` (a different pill becomes selected after a canonical re-read) |
| Today's / Latest Activity Day hero → Activity Day | 1 link | 1 link | UI: `activity.latestDay` tap → `activity.day.metrics`, back reads "‹ Activity" |
| In-progress line ("Still updating from Apple Health") | yes | yes | source: `day.isInProgress` branch kept |
| Metric grid (every `day.metricTiles` entry; AX "label: value") | yes | yes | source: `ActivityMetricGridView` maps every tile |
| Energy anomaly warning (provisional vs warning) | yes | yes | source: `EvidenceDailyWarning(provisional:)` |
| Empty latest-day copy | yes | yes (same text) | source |
| **Activity Areas** (informational, non-navigating as in B87) | yes | yes | UI: `activity.areas` revealed; unit: fixture has areas |
| **Linked Training Context** (non-clickable preview, empty copy) | yes | yes | UI: `activity.linkedTraining`; unit: fixture has entries |
| **Recent Activity History**: 3-row preview, each row → Activity Day | 3-row preview | 3-row preview | UI: exactly 3 `activity.history.day.*` rows; a row opens the day; back works |
| **Show All** → full-history sheet; rows → Activity Day inside the sheet; dismiss | sheet, detents | sheet, detents, plus a flat "Done" | UI: sheet lists more than 3 rows; row → `activity.day.metrics`; back; Done dismisses |
| Empty history copy | yes | yes (same text) | source |
| Pull-to-refresh, foreground refresh, authority reload | yes | yes (identical modifier set) | source diff: no lifecycle modifier added or removed |
| Loading / failure | `ProgressView` / message | `activity.loading` / `activity.failure` panels, same messages | unit: `testActivityViewModelsStartLoadingAndReportFailureOrEmptyHonestly` |

## Activity Day (`ActivityDayView`)

Kept:

- header with date, value, detail and protocol status;
- the in-progress provenance note;
- the Activity Metrics section with its warning;
- the loading, failure and **empty** branches. The empty branch is "No activity evidence for this day.", which the unit test covers by loading an unknown date to `.loaded(nil)`.

Neither Build 87 nor the candidate has any controls or sheets on this page.

## Activity sheets

There is exactly one: the Show All history sheet. Build 87 had the same single sheet.
