# Training Evidence navigation tree

Source authority: Build 85 Native `b8ee8690b194cb90086b62816b9a2c8c400dc026`.

```text
Evidence tab / Evidence Hub                         EvidenceView
└── Training row                                   progressStream("training")
    └── Training Evidence landing                  TrainingHistoryView
        ├── Latest Training Day
        │   ├── inline disclosure                  local state only
        │   ├── Training Day                       trainingDay(date)
        │   │   └── Session row                    trainingSession(sessionId)
        │   │       ├── structured strength        TrainingSessionDetailView
        │   │       ├── Apple Health attachment    TrainingSessionDetailView
        │   │       └── cardio/walking fallback    TrainingSessionDetailView
        │   └── direct Session preview             trainingSession(sessionId)
        ├── Training Areas
        │   ├── Browse                             progressStream("training/library")
        │   │   └── Area                           trainingLibraryArea(areaId,browseAll)
        │   │       └── Exercise                   trainingExercise(exerciseId)
        │   │           ├── Current Benchmark
        │   │           ├── Performance Records    inline, not a destination
        │   │           ├── Last Session
        │   │           └── Recent History         inline disclosure/set table
        │   └── Area tile                          trainingExercise(areaId)
        │       └── Exercise                       trainingExercise(exerciseId)
        ├── Reporting
        │   ├── Resistance Training                reporting/resistance
        │   │   ├── status sheet                   local sheet
        │   │   ├── Recent PRs sheet               local sheet
        │   │   ├── Needs Attention sheet          local sheet
        │   │   └── Category sheet                 local sheet
        │   ├── Cardio                             reporting/cardio → Foundation placeholder
        │   ├── Volume                             reporting/volume → Foundation placeholder
        │   ├── Frequency                          reporting/frequency → Foundation placeholder
        │   ├── Consistency                        reporting/consistency → Foundation placeholder
        │   └── History                            reporting/history
        │       └── Training Day                   trainingDay(date)
        ├── Recent Training History
        │   ├── first day preview                  trainingDay(date)
        │   └── Show All sheet
        │       └── Training Day                   trainingDay(date)
        ├── Current Protocol                       inline disclosure only
        └── Related Goals                          goalDetail(goalId)
```

## Route facts retained

- `Training Day` is encoded through the current `progress.stream` compound id `training/day/<date>`.
- Training Area ids and individual exercise ids share the `trainingExercise` destination; the router distinguishes the 10 canonical area ids.
- Performance Records and historical events have no independent destination. They are sections of `TrainingExerciseDetailView`.
- Cardio, Volume, Frequency, and Consistency are real stable destinations but currently share the exact Foundation placeholder.
- History rows on Exercise Detail expand in place; they do not navigate to Session or Day.
