# Build 89 small-fixes · Codex candidate

## Lane

- Authority task: `f50a41d3aebc7c6239453a04f0b72b92b892d028`
- Exact shipped Build 88 base: `7fce3b9708c063f3c6b58571778c595012b5de6d`
- Isolated branch: `codex/build89-small-fixes-20261006`
- Candidate content tip before this metadata-only report: `721b0aebe2e7833bb544e11c273a0fc9dce25c9b`
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

Review harness and package: `721b0aebe2e7833bb544e11c273a0fc9dce25c9b`.

## Review boards

- [C1 · Training Detail PR card](https://github.com/dustinginn/physiqueos/blob/codex/build89-small-fixes-20261006/agent-handoffs/artifacts/build89-small-fixes-codex-20261006/boards/C1-training-detail-pr-card.png?raw=1)
- [C2 · Nutrition Calories green](https://github.com/dustinginn/physiqueos/blob/codex/build89-small-fixes-20261006/agent-handoffs/artifacts/build89-small-fixes-codex-20261006/boards/C2-nutrition-calories-green.png?raw=1)
- [C3 · Home timeline copy](https://github.com/dustinginn/physiqueos/blob/codex/build89-small-fixes-20261006/agent-handoffs/artifacts/build89-small-fixes-codex-20261006/boards/C3-home-timeline-copy.png?raw=1)
- [C4 · Widget refresh accent](https://github.com/dustinginn/physiqueos/blob/codex/build89-small-fixes-20261006/agent-handoffs/artifacts/build89-small-fixes-codex-20261006/boards/C4-widget-refresh-accent.png?raw=1)

## Gates

- Focused Training contracts: 112 tests, 0 failures.
- Focused Nutrition contracts: 64 tests, 0 failures.
- Focused Home/widget contracts: 50 tests, 0 failures.
- Final combined relevant unit/contract suite: 226 tests, 0 failures (`/private/tmp/physiqueos-build89-final-unit.xcresult`).
- Focused Dark/Mineral C1+C2 review journeys: 4 tests, 0 failures (`/private/tmp/physiqueos-build89-derived/Logs/Test/Test-PhysiqueOS-2026.10.06_07-34-24--0700.xcresult`).
- Existing Training recent-history journey: 1 test, 0 failures (`/private/tmp/physiqueos-build89-training-journey.xcresult`).
- Existing Home physical-parity Dark/Mineral journeys: 2 tests, 0 failures (`/private/tmp/physiqueos-build89-home-correct.xcresult`).
- Generic iOS Simulator Release compile: succeeded.
- Project generator: stable; `project.pbxproj` SHA-256 stayed `cde880e5571fa2ce1d07f2d551be6e432789efa051303ca02f91d83f0aa4e68b`.
- `git diff --check`: clean.
- No app-target Build 89/debug/review seam introduced; review capture code is UI-test-only.
- Build/project/version files: unchanged.

## Isolation and conflict audit

- Claude A audited at `a362b844`; changed-file intersection: none.
- Claude B audited at `8826f914`; changed-file intersection: none.
- No Claude work was merged, cherry-picked, rebased, or otherwise integrated.
- No Watch, Live Activity, Briefings, Energy, Recovery, or unrelated priority implementation was changed.

## Stop boundary

This lane stops after pushing the isolated candidate and review package. No merge, build-number bump, TestFlight action, Server deploy, or production mutation was performed.
