# Next consolidated Native build — Today widget Weight removal

Date: 2026-10-10

## Outcome

Ready for the next consolidated Native integration. The Today widget no longer presents Weight in either supported family. The compact tile closes the former Weight space by tightening the metric-to-macro rhythm; Nutrition, Active calories, P/C/F, freshness, refresh, and Start/Resume Logger remain intact. The large family retains Training, Nutrition, Activity, freshness, refresh, and Start/Resume Workout Logger, with its Weight row and Weight deep link removed.

No Native archive, signed build, TestFlight upload, production change, Server change, HealthKit change, or data-model migration was made.

## Exact candidate

- Source baseline (released Build 95 lineage): `59223a41052201121ca1ade24aaf3a4ad0db637e`
- Candidate: `49113cb5be73f43c19c9e1be74c0c78e09464552`
- Branch: `codex/next-native-widget-remove-weight-20261010`
- Commit: `fix(ios): remove Weight from Today widget`

Changed files only:

- `ios/PhysiqueOSShared/HomeLoggedTodayWidgetView.swift`
- `ios/PhysiqueOSLiveActivity/HomeLoggedTodayWidget.swift`
- `ios/PhysiqueOSTests/HomeWidgetTests.swift`

The shared `HomeWidgetSnapshot.weight` field and projection remain backward-compatible and unchanged. This deliberately avoids touching Weight evidence, Home Weight, morning check-in, Weight logging, HealthKit, or Server models. Rendering tests prove that supplying or omitting that retained field produces identical pixels in both widget families.

## Focused validation

- Home widget suite: 27 executable tests passed, 0 failed. One opt-in acceptance-export test skipped because no export directory was supplied.
- Exact post-commit acceptance slice: 5/5 passed, covering:
  - Weight payload has no pixel effect in `systemSmall` or `systemLarge`;
  - Dark and Mineral Light appearances;
  - maximum accessibility Dynamic Type fit for every compact state;
  - retained Nutrition/Activity formatting contract;
  - retained Start Logger amber action and refresh action.
- Generated previews were visually inspected for compact Dark, compact Mineral Light, and large Dark: Weight is absent, remaining content is unclipped, and actions retain their hierarchy.
- Source fence confirms neither compact `WEIGHT` presentation nor large `Weight` row remains.
- `git diff --check`: pass.

## Integration boundary

Cherry-pick exact candidate `49113cb5be73f43c19c9e1be74c0c78e09464552` into the next consolidated Native build, alongside separately reviewed queued Native work. Re-run the consolidated Native gate at integration time. Do not ship this as a standalone build.

The DEXA Evidence page cleanup remains queued for that later consolidated Native build and was not modified here.
