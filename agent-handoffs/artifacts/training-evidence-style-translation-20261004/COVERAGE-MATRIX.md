# Complete Training Evidence coverage matrix

Legend: **Direct** = its own rendered mock; **Template** = explicitly maps to a rendered representative with identical layout behavior; **Doc** = semantic/routing rule documented because no honest Build 85 fixture exists.

| Screen/state | Current source component | Data shown | Navigation in/out | Proposed styling template | Mocked? | Covered? |
|---|---|---|---|---|---|---|
| Evidence Hub — Training row | `EvidenceView`, `EvidenceStreamRowView` | Training title, Last workout/date or metric | Evidence tab → Training root | Existing Evidence row with locked icon/tone; no hierarchy change | Template T1 entry context | Yes |
| Evidence Hub loading | `EvidenceView` | Progress only | Tab entry | Centered accent progress on page base | Template T12 | Yes |
| Evidence Hub failed | `EvidenceView` | API message | Tab entry | Plain readable failure, no false empty state | Template T12 | Yes |
| Training root loading | `TrainingHistoryView` | Progress only | Training row → root | Centered accent progress | T12 | Yes |
| Training root failed | `TrainingHistoryView` | `Training could not be loaded.` | Training row → root | Plain failure field | T12 | Yes |
| Training root loaded | `TrainingHistoryView` | Header, scope, latest day, areas, reporting, history, protocol, goals | Root → all descendants | T1 analytical root | T1 | Yes |
| Scope: All / Goal / Phase | `TrainingScopeSelectorView` | Primary options, contextual phase options, date range | Local re-fetch | Quiet segmented field; selected state by fill + check, not color alone | T1 + Template | Yes |
| Latest day collapsed | `latestTrainingDayCard` | Day label, summary, View Training Day | Root → Day | Selective contained section | T1 | Yes |
| Latest day expanded | `latestTrainingDayCard` | Session previews with value/detail/date | Root → Session | Same section, divided read-only rows | Template T1 | Yes |
| Latest day empty | `latestTrainingDayCard` | Upload/enter workout guidance | Root | Open empty copy, no invented CTA | Template T12 | Yes |
| Training Areas grid | `trainingAreasCard` | 10 canonical areas, exercise counts | Root → area / library root | Compact 2-column analytical rows | T1 | Yes |
| Reporting collapsed/expanded | `reportingCard` | Six current route labels/details | Root → report | One disclosure with open divided links | Template T1 | Yes |
| Recent History preview | `recentHistoryCard` | Most recent day + summary | Root → Day / sheet | Open date row, strong date hierarchy | T1 | Yes |
| Recent History Show All sheet | `TrainingHistorySheet` | All chronological days newest-first | Sheet → Day | Mixed Strength/Cardio open list | T2 | Yes |
| Recent History empty | `recentHistoryCard` | Current empty copy | Root | Open empty copy | Template T12 | Yes |
| Current Protocol collapsed/expanded | `currentProtocolCard` | source, activity target, objective, goal, coming soon | Local disclosure | Compact definition rows | Template T1 | Yes |
| Related Goals non-empty/empty | `RelatedGoalsView` | Goal titles | Root → Goal / omitted | Quiet chips; omitted if empty | Template T1 | Yes |
| Training Day loading | `TrainingDayView` | Progress only | Day route | Centered accent progress | T12 | Yes |
| Training Day failed | `TrainingDayView` | load failure copy | Day route | Plain failure field | T12 | Yes |
| Training Day not found | `TrainingDayView` | `No training evidence for this day.` | Day route | Honest empty field | T12 | Yes |
| Training Day single session | `TrainingDayView` | date, summary, session row | Root/report → Day → Session | Same grouped session template | Template T3 | Yes |
| Training Day multiple sessions | `TrainingDayView` | date, exact summary, ordered sessions | Root/report → Day → Session | Strength purple; walking/cardio teal; open divided rows | T3 | Yes |
| Cooldown historical row | `TrainingDaySessionSummary` (`kind=.other`) | canonical title/detail only | Day → Session | Neutral recovery stripe + `Cooldown` text; never Cardio color/totals | Doc + T3 row rule | Yes |
| Structured strength session | `TrainingSessionDetailView` | header, telemetry, exercises, sets | Day/root → Session | Read-only set lists; no inputs/checkboxes | T4 | Yes |
| Superset group | `TrainingSupersetGroupView` | `SUPERSET`, ordered members, sets | Inside Session | Restrained purple relationship rail | T5 | Yes |
| Execution variant | `TrainingExerciseOccurrenceView` | name · freeform variant | Inside Session | Variant suffix, not a badge that implies editability | T5 | Yes |
| Timed sets | `TrainingSet.formattedDetail` | `30s`, `1:15` | Inside Session | Same read-only value column | T5 | Yes |
| Bodyweight sets | `TrainingSet.formattedDetail` | reps · BW | Inside Session | Same table, explicit `BW` | T5 | Yes |
| External/weighted load | `TrainingSet.formattedDetail` | reps @ value unit | Inside Session | Tabular numeric value | T4/T5 | Yes |
| Workout telemetry | `telemetryCard` | time, duration, active cal, avg HR if present | Session | Quiet grouped metrics | T4 | Yes |
| Confirmed HealthKit attachment | `appleHealthAttachmentCard` | source, confirmed label, available telemetry | Session | Scoped teal provenance field + confirmed text | Template T6 | Yes |
| Candidate HealthKit attachment | `appleHealthAttachmentCard` | source, possible-match label | Session | Amber non-confirmed cue + literal label | Template T6 | Yes |
| Cardio/Apple Health fallback | `summaryCard`, `sourceEvidence` contract | type, date, current detail, source | Day → Session | T6 Cardio detail; source kept adjacent | T6 | Yes |
| Session generated summary fallback | `summaryCard` | preformatted detail | Session | Read-only text section | T6 | Yes |
| Supporting media loading | `TrainingSupportingMediaImage` | progress | Session | Contained media placeholder | Template T12 | Yes |
| Supporting media loaded | same | image | Session | 1:1 screenshot field | Template T4 | Yes |
| Supporting media failed/unavailable | same | Retry / unavailable | Session | Action only for retry; plain unavailable state | Template T12 | Yes |
| Production correction unavailable | `correctionCard` | current unavailable copy | Session | Informational muted section; no editor | T4 | Yes |
| Sandbox correction editor/validation/local draft | `correctionCard` | text editor, validation/status, drafts | Session local only | Preserve behavior; visually separate from canonical history | Template T12, documented | Yes |
| Session loading/failed/not found | `TrainingSessionDetailView` | progress/message | Session route | Shared async state template | T12 | Yes |
| Exercise detail loaded, no records | `TrainingExerciseDetailView` | benchmark, last session, history; records absent | Area/report → Exercise | Read-only analytical hierarchy | T7 | Yes |
| Exercise detail with records | same | optional current records plus other sections | Area/report → Exercise | Records emphasized by type label/value, no celebration | T8 | Yes |
| Benchmark populated | `benchmarkCard` | best set, last session, working weight, comparison | Exercise | Pale teal analytical field, semantic comparison | T7/T8 | Yes |
| Benchmark empty | same | `No matching history yet.` | Exercise | Open empty copy in same section | Template T12 | Yes |
| Performance Records absent | `performanceRecordsCard` | section omitted | Exercise | No empty placeholder | T7 | Yes |
| Performance Records populated | same | normalized records, dates, variants, details | Exercise | Divided list; current-only semantics | T8 | Yes |
| Session Volume record | `TrainingPerformanceRecord` | 3,340 lb, baseline/delta, date | Exercise inline | T9 record focus | T9 | Yes |
| Reps at Load record | same | 10 reps at 40 lb, baseline/delta, variant, date | Exercise inline | T10 record focus | T10 | Yes |
| Last Session populated | `lastSessionCard` | context, Volume, Best Set, Sets, set table | Exercise | Compact metrics + open table | T7 | Yes |
| Last Session empty | same | `No matching history yet.` | Exercise | Open empty copy | Template T12 | Yes |
| Recent History populated/collapsed | `historyCard` | badge/context/meta | Exercise | Read-only disclosure rows | T7/T8 | Yes |
| Recent History expanded | `TrainingExerciseHistoryRowView` | Set/Reps/Load table | Local disclosure | Chevron disclosure; no edit affordance | T11 | Yes |
| Recent History empty | `historyCard` | `Future sets will appear here.` | Exercise | Open empty copy | Template T12 | Yes |
| Exercise loading/failed/not found | `TrainingExerciseDetailView` | progress/message | Exercise route | Shared async state template | T12 | Yes |
| Resistance Reporting | `TrainingReportingView` | statuses, PRs, highlights, attention, categories, source | Root → Report → Exercise | Compact analysis blocks, semantic label + color | T13 | Yes |
| Resistance status sheet | `TrainingResistanceStatusSheet` | selected status exercises | Status → sheet → Exercise | Open list sheet | Template T13 | Yes |
| Resistance analysis sheets | `TrainingReportingAnalysisSheetView` | all PR/attention/category rows | View All → sheet → Exercise/Area | Same open list sheet | Template T13 | Yes |
| Resistance section empty | `linkListCard` | exact per-section empty copy | Report | Open empty copy | Template T12 | Yes |
| History Reporting populated | `historyCard` / `productionHistoryCard` | up to 20 days, labels, summaries/session labels | Root → Report → Day | Chronological open list | T14 | Yes |
| History Reporting empty | same | `Training days will appear here.` | Report | Open empty copy | Template T12 | Yes |
| Cardio report placeholder | `foundationCard` | current Foundation copy | Root → report | One stable destination surface | T15 | Yes |
| Volume report placeholder | same | same exact copy | Root → report | Shared T15 template | Template T15 | Yes |
| Frequency report placeholder | same | same exact copy | Root → report | Shared T15 template | Template T15 | Yes |
| Consistency report placeholder | same | same exact copy | Root → report | Shared T15 template | Template T15 | Yes |
| Reporting loading/failed/not found | `TrainingReportingView` | progress/message | Report route | Shared async state template | T12 | Yes |
| Training Library root | `TrainingLibraryRootView` | header, scope, catalog toggle, 10 areas | Root → Library → Area | Open browse list | T16 | Yes |
| Library My Library/Browse All | same | catalog-scoped counts/rows | Local re-fetch | Text toggle remains explicit | T16 + Template | Yes |
| Area populated | `TrainingAreaView` | header, breadcrumbs, scope, toggle, exercises | Library → Area → Exercise | Open browse list | T16 | Yes |
| Area empty | `TrainingAreaView` | header + honest empty Browse list | Library → Area | Empty list without invented copy | Template T16 | Yes |
| Area loading/failed/not found | `TrainingAreaView` | progress/failure/not-found copy | Area route | Shared async state template | T12 | Yes |

## Coverage result

- Unique direct product templates: **16**
- Themes: **dark + mineral light for all 16**
- Near-identical states explicitly mapped: **all**
- Uncovered states: **0**
- Invented charts: **0**
- Editable treatment applied to read-only set/session rows: **0**
