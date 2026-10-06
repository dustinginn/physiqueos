# Build 89 production-surface coverage matrix (re-audit)

Authority: shipped Build 89 source `51399425` (VALID in TestFlight). DEBUG review seams are excluded. Line numbers are against `51399425`.

Class key (this lane's prompt):
- **A**: redesigned / accepted in Build 89 or earlier.
- **B**: partially redesigned / mixed grammar.
- **C**: still old presentation.
- **D**: intentionally platform-specific, no redesign required.
- **E**: obsolete / unreachable in Founder Production.

Detailed per-row evidence: `appendix-home-priority-capture-briefings-widget.md`, `appendix-evidence-log-children.md`, `appendix-operating-plan-you.md` (same folder).

## Summary by family

| Family | Build 88 audit | Build 89 class | What changed in Build 89 |
|---|---|---|---|
| Home root (header, journey, Latest Briefing strip, Priorities shell) | B | A | Physical acceptance pending; not reopened |
| Home children: Priorities tile internals | D (partial) | **B** | Untouched by Build 89 (`FocusTileView.swift:93,108-122,133,153`) |
| Home children: morning grouped session card | D | **C** | Untouched; daily-frequency (`TodaysFocusCardView.swift:61-130`) |
| Home children: older briefing cards, additional-goals card, no-goal hero | D | **C** | Untouched; conditional (`BriefingCardView`, `GoalRowView:313-330`, `HomeHeroCardView`) |
| Home loading / failed / reconnect / notices | D | **C** | Untouched (`HomeView.swift:195-213,345-385`) |
| Priority Detail, every type and state (#9-#15) | E | **A** | Lane A `5f5df553`; Skip dialog is system (D); Photos/DEXA action buttons now present |
| Morning Check-In (all child states), manual/backdated weight, Home Confidence sheet | E | **A** | Lane A `97028dbc` |
| `DateField` picker sheet (shared) | — | **B** | Well redesigned; sheet keeps legacy tint/background (`DateField.swift:82,84`) |
| Briefings: Detail states, Weekly, Midweek, Monthly, Photo, DEXA, History | E | **A** | Lane B; zero legacy components remain; Briefing P0 swipe trap gone |
| Photo Briefing expanded viewer | — | A (owned by another lane) | Paired viewer new; single-photo viewer retry state still legacy tint (`PhotoInspectionViewer.swift:452,456`). Not touched here |
| Live Activity, Dynamic Island, Watch W1-W11 | E / P3 | **A** | Lane A |
| Widget small / large | E | **B** | Build 89 only recolored Refresh. Still SF Rounded, purple Training row, Refresh 24/28 pt targets |
| Log root, Logger, Workout Match idle/resolved | B | A | Not reopened |
| Logger leftovers (spinners, Save & Leave, load-failure text, confetti palette) | D | **B** | Unchanged (`TrainingLoggerView.swift:153,160,174-176,1661,1816-1820`) |
| Workout Match confirming / refresh-required / failed / Back to Log + "← Back" label | D | **B** | Unchanged (`EvidenceReviewDetailView.swift:88-99,272-276,629-698`) |
| Evidence Hub, Timeline, Training, Activity, Nutrition, Weight, Photos, DEXA, intake, generic Review | B | A | About 75 child surfaces, nearly all A |
| Evidence residual children: session screenshot states, DEXA PDF sheet, intake date sheet, Hub "Try Again" system button | D | **B** | Unchanged |
| **Energy root, both charts, both Show All sheets, states** | E | **C** | Untouched; still legacy `chartScrub` (the last two call sites in the app). **Designed in this lane** |
| **Recovery root, Sleep Trends, Night Detail, All Nights, states** | E | **C** | Untouched (24 `CardContainer`). **Designed in this lane** |
| Operating Plan: landing, 4 strategy details, editors, protocol domain | E | **C** | Zero Build 89 diff |
| Operating Plan: Peptide execution, Advanced, dose editor, 4 sheets | E | **C** | Zero Build 89 diff |
| Operating Plan: Recovery support + schedule editor, Tracking + support, Supplement support/edit | E | **C** | Zero Build 89 diff |
| Operating Plan: DEXA appointment page | G (orphan) | **C, newly reachable** | Build 89 maps Priority "View DEXA Appointment" (`/profile/operating-plan/execution/dexa`) to this legacy dead end (`ProductionDailyDriverAPI.swift:1227`) |
| Operating Plan: status route, production Training builder, legacy peptide fallback, Add Supplement (production) | C / G | **E** | Not reached in Founder Production |
| You root, Settings, Appearance (incl. new Watch appearance) | A | A | Not reopened |
| DEXA writeback toggle | C | **B** | Styled; locked home (Data Sources) is deferred |
| Founder device connection, Network Diagnostics, Sep 12 validation | C | **D** | Engineering surfaces; Sandbox picker still selectable in Release |
| Sleep canary / validation / historical import | C | **E** | Code says remove after Sleep graduation (graduated 2026-10-05) |
| App shell tab tint | — | **B** (minor) | Tab bar selection still uses legacy purple accent |

## Energy and Recovery/Sleep rows (this lane's own audit)

| Surface / state | Route | Source (Build 89) | Class at 89 | Lane candidate |
|---|---|---|---|---|
| Energy root (header, scope, Period Summary) | Hub → `progressStream(energy)` | `EnergyHistoryView.swift:34-147` | C | Redesigned |
| Energy Over Time (range, legend, line chart, selected week) | in root | `EnergyChartViews.swift:22-114` (legacy `chartScrub` :105) | C | Redesigned; scroll-safe tap + horizontal scrub |
| Weekly Energy Balance (latest four weeks, selected week) | in root | `EnergyChartViews.swift:116-189` (legacy `chartScrub` :163) | C | Redesigned; same arbitration |
| Weekly History preview + Show All sheet | root → `.sheet` | `EnergyHistoryView.swift:178-218`; sheet `:221-240` (no Done) | C | Redesigned; Done added |
| Recent Daily Energy preview + Show All sheet, completeness tags, Nutrition/Activity links | root → `.sheet` | `EnergyHistoryView.swift:186-260`, rows `:285-404` | C | Redesigned |
| Energy loading / failed / empty | root | `EnergyHistoryView.swift:80-89` (no retry) | C | Redesigned; Try again added |
| Energy as-of / stale | — | No field in the canonical contract | n/a | Not designed (would need a Server field) |
| Recovery root: Last/Final Night, Sleep chart, Sleep Window, Recent Nights, Data Sources | Hub → `progressStream(recovery)` | `RecoverySleepViews.swift:376-676` | C | Redesigned |
| Recovery scope states (Goal dates loading / failed + Try again / empty) | root, Trends | `RecoverySleepViews.swift:223-245` | C | Redesigned |
| Sleep Trends: range, Total Sleep, Sleep Window, Continuity, Stage Mix, All Nights, weekly view | root → `recovery/sleep/trends` | `RecoverySleepViews.swift:680-923`, charts `SleepEvidenceCharts.swift` | C | Redesigned; Continuity is the locked point/line correction |
| Night Detail: header, Timeline, Stages, Continuity, Time in Bed, Additional Sleep, Source & Data | root / Trends / All Nights → `recovery/sleep/night/<day>` | `RecoverySleepViews.swift:927-1245` | C | Redesigned; Timeline contained; back label from trail |
| Night Detail: recalculating / stage-absent / not-found / failed | same | same | C | Redesigned |
| All Nights sheet (paged, loading more) | root / Trends → `.sheet` | `RecoverySleepViews.swift:323-372` | C | Redesigned |
| Recovery loading / failed / not available / no data | root, Trends, sheet, night | various | C | Redesigned (failed gains Try again) |
