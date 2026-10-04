# Source coverage proof

## Authority

- Prompt: `961c61236a43d4edb22a30c1884bd5b722c305fd`
- Native: Build 85 at `b8ee8690b194cb90086b62816b9a2c8c400dc026`
- Server: `3c0f4aefddbb9a6886f6ad012443978303d47024`

Build 85 remains the newest Native branch authority visible in the fetched repository. `ios/Scripts/generate_project.py` and the generated Xcode project both declare build 85. No Build 86 source branch, report, generated build number or uploaded-build authority exists in the fetched refs.

## Enumeration method

The audit did not infer coverage from screenshots. It enumerated and reconciled:

1. all 46 `AppDestination` cases in `ios/PhysiqueOS/Contracts/AppDestination.swift`;
2. every resolution branch in `AppDestinationRouterView`;
3. all five `RootTabView` stacks;
4. every route producer and external entry from notification, Home Widget and Live Activity deep links;
5. all 41 `.sheet`, `.fullScreenCover`, `.alert`, `.confirmationDialog`, `.photosPicker` and `.fileImporter` declarations in the iPhone target;
6. every top-level presentation `View` in the iPhone, Watch and Widget/Live Activity targets;
7. current Founder Production capability/authority gates versus Sandbox-only views;
8. accepted design reports, artifact coverage matrices and the canonical design-program handoff;
9. the complete `DESIGN_IMPLEMENTATION_DELTA_LEDGER.md` so a plumbing gap was not mislabeled as a missing design.

## Route disposition proof

The 46 destinations resolve into the following exhaustive buckets:

- Goals: locked production browse/detail routes; sandbox-only edit/transition routes classified D.
- Check-in and logging: Morning Check-In and manual weight classified C; production upload/review classified C; sandbox intake/review classified D.
- Briefings: all detail cadences locked; History classified C.
- Priorities: complete family locked.
- Training/Evidence: all production evidence destinations locked; generic Evidence Review separated from the already locked workout-match state.
- Operating Plan: all production routes locked; unused generic status route classified D.
- Founder connection: current diagnostic route classified D; the locked Settings account/source family is the product replacement.

No `AppDestination` case is absent from `SURFACE-COVERAGE-MATRIX.tsv` either as an individual route or as an explicitly named route family.

## Modal and system-surface proof

Material app-owned sheets were checked individually:

- Home Confidence: C.
- Evidence history/reporting sheets: A.
- DEXA PDF and Photo inspection: A.
- Training reporting/history: A.
- Recovery All Nights: A.
- Operating Plan peptide/support sheets and dialogs: A.
- generic Evidence Review and intake states: C.
- Sandbox-only review pickers: D.

System-owned Photos, Files, Health authorization, notification permission, date/time picker, keyboard, menu, alert, confirmation and share surfaces are B: their product copy/tint/context is covered, but custom replacement would be inappropriate.

## Extension proof

- Watch workout: locked current-system translation covers all material states.
- Live Activity / Dynamic Island: locked current-system translation covers all material states.
- Home Screen Widget: current and reachable, but its accepted 2026-10-02 implementation predates the 2026-10-03/04 selected design system. It was not included in the locked utility-surface translation, so it is C.

## Classification semantics

Counts are counts of material user-facing surface/state groups, not SwiftUI struct declarations. Reusable rows, charts and private view fragments are assigned through their owning surface rather than double-counted.

