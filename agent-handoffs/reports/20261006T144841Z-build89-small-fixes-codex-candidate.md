# Build 89 small-fixes · Codex candidate

## Lane

- Authority task: `f50a41d3aebc7c6239453a04f0b72b92b892d028`
- Exact shipped Build 88 base: `7fce3b9708c063f3c6b58571778c595012b5de6d`
- Isolated branch: `codex/build89-small-fixes-20261006`
- Initial four-item candidate content tip: `721b0aebe2e7833bb544e11c273a0fc9dce25c9b`
- Logger selection-control addendum: `1162682a`
- Typography selection checkpoint and Live Activity integration note: `184c9f68`
- Merge-base audit: exact Build 88 base above

## Bounded changes

1. Training Detail workout PR card — `4cfc3aa7afe1b94b488aed9e50f27e45f3540582`
   - Reuses authoritative exact-session performance records and the existing `NewPerformanceRecordsPresentation`; no PR recalculation or duplicate authority.
   - Places a compact historical card directly below Workout Summary and before Exercises.
   - Files: `TrainingReadModel.swift`, `TrainingSessionDetailView.swift`, `TrainingFixture.json`, `TrainingSessionDetailPresentationTests.swift`, `TrainingAcceptanceUITests.swift`.
2. Nutrition Calories semantic green — `be94de5b225534d283a734a40d5a07f140dd03a1`
   - Changes only the Calories semantic palette mapping to green; other macro authorities remain unchanged.
   - Files: `EvidenceKit.swift`, `EvidenceReviewHeaderDateTests.swift`.
3. Home timeline copy — `3f5606d2c5134d6b7835c4085462e91949acd76a`
   - Compact Remaining is exactly `4 weeks`; headline is exactly `4 weeks to goal target`; the phase detail remains `Aug 15 – Oct 31 · about 4 weeks remaining`.
   - Files: `HomeJourneyFieldView.swift`, `HomeRedesignReviewFixture.json`, `HomeReadModelTests.swift`.
4. Widget refresh accent — `0ff730197662110e96fb12bc1d9dc3915782b772`
   - Refresh and Start Logger consume the same teal/cyan action-accent authority; training purple remains unchanged.
   - Files: `HomeLoggedTodayWidgetView.swift`, `HomeWidgetTests.swift`.
5. Logger Suggested Today selection control — `1162682a`
   - Adds an obvious 44 pt top-right selection target to the unselected suggestion card; it becomes the existing teal checkmark when selected.
   - The card, control, and matching Training Area tile all read and mutate the same canonical draft selection state. Suggestion generation, multi-select behavior, and the Logger flow are unchanged.
   - Files: `TrainingLoggerView.swift`, `TrainingLoggerViewModel.swift`, `TrainingLoggerTests.swift`, C5 captures/board.
6. Logger set-value typography — Founder selection checkpoint only — `184c9f68`
   - Current: 12 pt Regular. A: 14 pt Regular. B: 16 pt Semibold. C: 15 pt Medium with a proportional 13 pt SET number.
   - Uses real `NumericEditField` SwiftUI rows, fixed 390 pt geometry, one representative state, and identical headers/controls/behavior in Mineral and Dark.
   - Shipping typography remains unchanged pending Founder selection.
7. Live Activity elapsed-workout icon clarification — integration note only — `184c9f68`
   - Claude A's redesigned source exists only on unmerged candidate `f3579d87`; the Build 88 implementation was not recreated.
   - Exact post-merge change recorded: in Claude A's no-rest `WORKOUT` branch only, change `dumbbell.fill` to `stopwatch`; preserve the active-rest `timer`/`stopwatch`, green treatment, labels, clocks, and state pipeline exactly.

Review harness and package: `721b0aebe2e7833bb544e11c273a0fc9dce25c9b`.

## Review boards

- [C1 · Training Detail PR card](https://github.com/dustinginn/physiqueos/blob/codex/build89-small-fixes-20261006/agent-handoffs/artifacts/build89-small-fixes-codex-20261006/boards/C1-training-detail-pr-card.png?raw=1)
- [C2 · Nutrition Calories green](https://github.com/dustinginn/physiqueos/blob/codex/build89-small-fixes-20261006/agent-handoffs/artifacts/build89-small-fixes-codex-20261006/boards/C2-nutrition-calories-green.png?raw=1)
- [C3 · Home timeline copy](https://github.com/dustinginn/physiqueos/blob/codex/build89-small-fixes-20261006/agent-handoffs/artifacts/build89-small-fixes-codex-20261006/boards/C3-home-timeline-copy.png?raw=1)
- [C4 · Widget refresh accent](https://github.com/dustinginn/physiqueos/blob/codex/build89-small-fixes-20261006/agent-handoffs/artifacts/build89-small-fixes-codex-20261006/boards/C4-widget-refresh-accent.png?raw=1)
- [C5 · Logger Suggested Today selection](https://github.com/dustinginn/physiqueos/blob/codex/build89-small-fixes-20261006/agent-handoffs/artifacts/build89-small-fixes-codex-20261006/boards/C5-logger-suggested-selection.png?raw=1)
- [C6 · Logger set-value typography options](https://github.com/dustinginn/physiqueos/blob/codex/build89-small-fixes-20261006/agent-handoffs/artifacts/build89-small-fixes-codex-20261006/boards/C6-logger-set-typography-options.png?raw=1)
- [Live Activity integration note](https://github.com/dustinginn/physiqueos/blob/codex/build89-small-fixes-20261006/agent-handoffs/artifacts/build89-small-fixes-codex-20261006/live-activity-stopwatch-integration.md)

## Gates

- Focused Training contracts: 112 tests, 0 failures.
- Focused Nutrition contracts: 64 tests, 0 failures.
- Focused Home/widget contracts: 50 tests, 0 failures.
- Final combined relevant unit/contract suite: 226 tests, 0 failures (`/private/tmp/physiqueos-build89-final-unit.xcresult`).
- Focused Dark/Mineral C1+C2 review journeys: 4 tests, 0 failures (`/private/tmp/physiqueos-build89-derived/Logs/Test/Test-PhysiqueOS-2026.10.06_07-34-24--0700.xcresult`).
- Existing Training recent-history journey: 1 test, 0 failures (`/private/tmp/physiqueos-build89-training-journey.xcresult`).
- Existing Home physical-parity Dark/Mineral journeys: 2 tests, 0 failures (`/private/tmp/physiqueos-build89-home-correct.xcresult`).
- Generic iOS Simulator Release compile: succeeded.
- Logger selection-control focused suite: 91 tests, 0 failures (`/private/tmp/physiqueos-build89-logger-focused.xcresult`).
- Logger typography fit/render checkpoint: 2 tests, 0 failures (`/private/tmp/physiqueos-build89-logger-type-options.xcresult`); all eight real SwiftUI captures inspected.
- A later combined Xcode rerun was intentionally not launched after free disk fell below the repository's 15 GiB safety floor. No shipping source changed after the successful 91-test Logger run; the typography checkpoint changes only tests/review artifacts, and the Live Activity outcome is documentation-only.
- Project generator: stable; `project.pbxproj` SHA-256 stayed `cde880e5571fa2ce1d07f2d551be6e432789efa051303ca02f91d83f0aa4e68b`.
- `git diff --check`: clean.
- No app-target Build 89/debug/review seam introduced; review capture code is UI-test-only.
- Build/project/version files: unchanged.

## Isolation and conflict audit

- Claude A was initially audited at `a362b844`; the initial four items had no changed-file intersection.
- Claude A final candidate `f3579d87` owns the redesigned Live Activity. Its `WorkoutClockBlock` was inspected read-only and the required one-line, state-specific post-merge correction was recorded rather than recreating or editing Claude A's source.
- Claude B audited at `8826f914`; changed-file intersection: none.
- No Claude work was merged, cherry-picked, rebased, or otherwise integrated.
- No Watch, Live Activity, Briefings, Energy, Recovery, or unrelated priority implementation was changed.

## Stop boundary

This lane stops after pushing the isolated candidate and review package. Logger set-value typography is deliberately unselected and unimplemented in shipping code pending Founder choice of Current, A, B, or C. No merge, build-number bump, TestFlight action, Server deploy, or production mutation was performed.
