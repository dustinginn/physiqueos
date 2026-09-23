# HealthKit Evidence summary formatting: residual raw-double leak fixed (server-side), no new Native build needed

Task id: `healthkit-evidence-summary-formatting-cleanup-20260923`

## Headline

The residual Build 53 defect — Evidence **headline/subheadline/Activity Areas** strings still showing raw floating-point precision while the metric cards on the same screens were already compact — is fixed and verified. One material correction to the task's framing: **this was never a Native formatting defect.** Those strings are built by the Server read-model projection and decoded verbatim by Native (`ActivityDayRecord`/`NutritionDayRecord` `value`+`detail`, `ActivityAreaSummary.value` are plain `String`s; no Native code constructs them). The fix is therefore Server code, on branch `claude/healthkit-evidence-summary-formatting-cleanup` (`44edddb7` + `d2aa86e0` + `4b362591`, final SHA `4b362591cb5f80c599f8f45eb7f392de7c44a36f`, based on the deployed `ccff693b`).

Consequences, both per this task's own constraints:
- **No Native change is required, so no Build 54 is needed for this fix** — the Workout-canary readiness work keeps the next build number, exactly as the task asked.
- **The fix is code/test/review only and is not deployed.** It takes effect on the next Server deploy, which needs the Founder's separate go-ahead. Until then the Founder's device will keep showing the raw strings on those surfaces.

## Authority reverified

Production deployment `0bdc1748-d918-452f-a84a-52a9bfdc5373` ACTIVE, `source_commit_hash = ccff693b61c98737b670be620f7916c375cb37ce` (read from the deployment's own spec, not assumed); production branch `combined-app-platform-cutover` head `ccff693b`; Native worktree `1c57556f`, clean, matches origin. All three match the task's hints exactly.

## What leaked, exactly

Every builder interpolated the canonical Double straight into the string:

`src/domain/services/ProgressReportingService.js`
- `formatNutritionDayValue` / `formatNutritionDayDetail` — Nutrition headline ("2405.5120239257812 calories") and subheadline ("178.25211668014526g protein · 173.8842658996582g carbs · 109.46525192260742g fat")
- `formatActivityDayValue` / `formatActivityDayDetail` — Activity headline ("782.1669999999962 active cal / 42.00000000000001 min") and subheadline ("… 241.16699999999616 non-workout active cal")
- `getActivityAreas` — all four Activity Areas values
- Found by independent review, missed by my first pass: `formatActivityProtocolSupport` (report `trend`, the headline card's and every history row's `protocolStatus`, Progress-hub trend — reachable when a HealthKit day merges onto a screenshot day carrying `move_goal`: "217.83300000000384 active calories below the recorded daily target.") and `formatActivityHubMetric` (Web Evidence-hub "Latest"; Native derives its hub metric from the already-fixed `value`).

`src/domain/services/EvidenceTimelineService.js`
- `formatActivityDayTitle` / `formatActivityDayDetail` — the Evidence hub timeline's "Daily Activity" rows (same pattern).

## The fix

One shared helper, `src/domain/services/HealthKitEvidenceNumberFormatting.js` → `formatWholeNumber(value)` = `Number.isFinite(value) ? String(Math.round(value)) : null`, now feeds all nine builders. It deliberately mirrors the Native cards' `String(Int(value.rounded()))` — whole number, **no thousands separator** — so headline and cards agree character-for-character ("2406 calories" vs card "2406"; "782 active cal" vs card "782 cal"). It is intentionally *not* the Log screen's `Intl` formatter ("2,406"), because the cards don't use a separator either. `Math.round` (half-up) equals Swift's `.rounded()` (toNearestOrAwayFromZero) for the non-negative inputs these fields carry; negatives are unreachable (HealthKit ingest rejects `< 0`, and non-workout calories are clamped at 0).

Presentation only: every numeric field the records carry (`activeCalories`, `nonWorkoutActiveCalories`, `totals.*`, `moveGoal`, …) still holds the exact canonical value — asserted in the tests. Every fallback string (`"Logged intake"`, `"Pending"`, `formatDate(...)`, `"Daily activity summary"`, `"Activity history updated"`, `"Activity context available."`), the `" · "` joiners, the integer "workouts linked" and meal counts, and the wording differences between the two services are untouched. The protocol-support string rounds the *difference* rather than the operands, so "1000 goal vs 782 shown" reads "218 below", consistent with the cards.

Deliberately left alone, per the task's "do not broaden into non-HealthKit sites": `formatTrainingRecordValue`, `EvidenceTimelineService.formatTrainingDetail`, and the Training report's `trainingOverview` "Active Calories". The reviewer rightly notes these are HealthKit `HKWorkout` doubles too, so they belong on the existing raw-double backlog with that annotation, not dismissed as "Training only".

## Verification

- **Tests**: new `src/domain/services/HealthKitEvidenceSummaryFormatting.test.js` (registered in `vitest.phase3.config.js`; also picked up by the `unit` glob) drives the real exported builders — `createProviderActivityEvidenceReport`, `getNutritionReportExtras`, `createEvidenceTimelineItems`, `createProviderProgressHubReport`, `formatActivityProtocolSupport` — through the genuine `getCanonicalPayloads`/active-selection path with the Founder's exact reported values (2405.5120239257812, 178.25211668014526, 173.8842658996582, 109.46525192260742, 782.1669999999962, 241.16699999999616), asserting whole-number output, no fractional tail anywhere, and preserved canonical precision — including the reviewer's `.5`-tie vectors. 9/9.
- **Mutation-tested twice**: reverting only the two builder files (helper kept) fails exactly the five builder tests reproducing the Founder's strings verbatim while the helper's own test still passes; reverting only the two review-driven builders fails exactly those two new tests ("217.83300000000384…", "199.50000000000023…"). Both restores verified byte-identical.
- **Server suites**: phase3 282/283 (the one failure is the pre-existing gitignored `private/founder/runtime-store.json` fixture, present before any change in this task), foundation 38/38, phase2 97/97, phase4 137/137. eslint clean. No snapshot files exist; every sibling assertion on these strings uses integer inputs, so nothing needed updating.
- **Native**: untouched at `1c57556f`; full unit suite re-run anyway as a no-regression check — 1289/1289. UI acceptance target: the full 12-test run reported 1 failure, `TrainingAcceptanceUITests.testReportingJourneys` ("Missing visible text: Training History") at the end of an 809-second run; re-run in isolation it passed in 44.5 s. That is a Training navigation journey no Build 53 commit or anything in this Server-only task touches, on the identical tree that passed 12/12 for Build 52 — reported as an environmental flake, not hidden. Net: 12/12 across the two runs, with the flake called out.
- **Independent fresh-context review** (adversarial, isolated worktree): verified every one of the 13 call sites is `Number.isFinite`-guarded (no literal "null" possible), rounding parity with Swift including `-0`, behavior preservation, real (not artificial) test path, module/config hygiene — and found the two in-scope misses above, both fixed in `d2aa86e0` with tests. A second, delta-only verification of `d2aa86e0` confirmed both fixes, the hub-stream fields, the test fixtures' path parity with production merged days, and the hub lookup's robustness, re-audited both services and found **no remaining raw HealthKit-double interpolation on any Activity or Nutrition Evidence surface, Native or Web** — and caught one last real 1-off: rounding the protocol-support *difference* was not tie-safe against the cards (an exact `.5` move would read one calorie off). Fixed in `4b362591` exactly as prescribed (round operands, then subtract), with the reviewer's own tie vectors as tests, mutation-verified.

## Flags

- ACTIVITY_SUMMARY_FLOAT_TAILS_ELIMINATED: YES (headline, subheadline, Activity Areas, protocol-support/trend, hub metric, timeline rows)
- NUTRITION_SUMMARY_FLOAT_TAILS_ELIMINATED: YES (headline, subheadline, history rows)
- ACTIVITY_NUTRITION_CARDS_UNCHANGED: YES (no Native change; cards were already correct)
- CANONICAL_PRECISION_UNCHANGED: YES (asserted on every numeric field in the tests)
- FULL_NATIVE_SUITE_PASSED: YES (1289/1289, Native untouched)
- UI_ACCEPTANCE_SUITE_PASSED: YES (12/12 across two runs; one environmental flake on an untouched Training journey, re-run green in isolation — disclosed above)
- INDEPENDENT_REVIEW_APPROVED: YES (two adversarial passes; all three findings fixed and re-verified; final re-audit found nothing remaining in scope)
- NEXT_NATIVE_CANDIDATE_READY: NOT NEEDED — the fix is Server-side; no Build 54 required for it
- SERVER_DEPLOY_REQUIRED_TO_TAKE_EFFECT: YES — not deployed (task is code/test/review only); Founder go-ahead needed
- CANARY_USED / MANUAL_SYNC_USED / WORKOUT_ACTIVATION_ENABLED: NO / NO / unchanged (OFF)
- SECRETS_EXPOSED: NO
