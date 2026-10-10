# Previous-cut evidence audit (read-only, code only)

## What was audited

| | |
|---|---|
| Production code | `85a9802587de0ef23ff2021e803258dea825254d`, on `combined-app-platform-cutover` (the production branch) |
| `origin/main` | `src/` last changed 2026-08-11, so it is not the production code line |
| Branch B (dormant) | `99f11ae6`, `claude/goal-adaptation-phase0-phaseA-20261010` (Goal Adaptation Phase B) |
| Method | No database or production reads; no Founder values were read in this task |
| Marking | **V** = verified in code at the production SHA (key files spot-checked by hand). **I** = inferred. |

## 1. Goal history

- **V.** Goals are kept in the `goals` collection with status `active`, `paused`, `completed` or `archived`. Every goal type is the generic `body_composition`. Visible Abs is identified only by `id: goal_visible_abs_at_rest` and `metricKey: visualDefinition`.
- **V.** A goal transition is additive. It writes `activationHistory.preservationMode = "additive_immutable_chapter"` and marks the old goal `completed` (`GoalTransitionActivationTransactionPlanBuilder.js:228`). The new goal records `sourceGoalId`. Completed goals stay listable through `GoalRepository.listGoals`.
- **V.** `VisibleAbsGoalCompletionService` writes `goal.completion` as **pointers only**: the final photo session, the Jul 18 DEXA, the event briefings and the milestone relationships. It stores no outcome numbers.
- **V.** The cut window is hardcoded: `EVIDENCE_CONTEXT_WINDOWS["visible-abs"] = 2026-05-24 → 2026-07-18`. Build Lean Mass starts 2026-07-19. An earlier read-only production audit (report `ba50a591`) found the goal transition committed on 2026-07-21.
- **I.** The cut has no `phaseStrategy` or phase records. `phaseStrategy` requires `purpose.supportLeanMassGain`.

## 2. Target history

- **V. Overwritten in place:** `operatingPlan` (`nutrition.estimatedDailyCaloricIntake`, `training.estimatedDailyActiveCalories`) and `nutritionContext`.
- **V. Versioned:** `protocolVersions` is append-only, with `effectiveAt` and `endedAt`.
  - The cut ran `protocol_nutrition_founder_cut`: a daily calorie range and a protein minimum, a `calculationSnapshot`, and a link to Visible Abs.
  - It also ran `protocol_activity_founder_cut`: a daily active-kcal target.
  - `resolveProtocolVersionAtDate()` (`ActiveProtocolSuccessorService.js:91`) returns the targets that were in force on any date.
- **V. Per-day target snapshots:** the protein target in `dailyCheckIns`, and `move_goal` on `activity_day` records.

## 3. Outcome data covering the cut window

| Data | Source | Covers May 24 – Jul 18? |
|---|---|---|
| Logged intake | `canonicalEvidenceObjects` (nutrition) | V: append-only, no pruning |
| Activity | `activity_day`, from Apple Fitness screenshots in that era | V: kept |
| Weight | `weightEntries` (same-day corrections kept in `correctionHistory`) | V: `listWeightEntries(range)` |
| DEXA | `dexaScans`: body-fat %, lean, fat and total mass, RMR | V: append-only |
| Training | `training` objects and `trainingPerformanceEvents` | V: kept |
| Briefings | `dailyBriefings` and `replacedBriefingHistory` | V: kept, so cut-era Weekly, Monthly and Event briefings are readable |

- **V.** `getEnergyEvidenceReport({ context: "visible-abs" })` (`EnergyEvidenceService.js`) **already computes**, over the cut window: average intake, average expenditure (DEXA RMR plus active), average balance, and counts of complete days. It is not saved and not compared with targets.
- **I.** Cut-era intake logging may be sparse. The Phase B golden fixture's cut period has intake on 9 of 28 days, which would fail the 70% coverage rule. Real coverage was not checked.

## 4. Existing intelligence to build on

- **`EnergyEvidenceService` (cut-window energy averages):** reuse it for the "what you ate / burned" line.
- **`resolveProtocolVersionAtDate` with the cut protocol versions:** reuse it for "the targets you were on".
- **`dexaScans` and `DEXAEventContextService`:** these compare each scan with the previous one, across goals. Reuse them for "lean mass held".
- **`trainingPerformanceEvents`:** reuse them for "lifts held".
- **`CompletedGoalPreviewService`:** this is the only summary of a previous goal. It reads DEXA baseline and final scans live, but its completion date, recap and highlight text are **hardcoded strings** (including figures written as prose). It is preview-only and saves nothing. **Do not use its prose as evidence.**
- **`EnergyCalibrationV1` (branch B, dormant):** a pure function over the periods it is given (at least 21 days, at least 70% of days logged, up to 4 periods, 56-day half-life). It can cover goal boundaries if it is given a cut-era period. Nothing builds such periods today.
- **V3 (production):** reads only the current goal and phase. `V3EvidenceUniverse` "never adds evidence from another Goal, Phase". `priorGoalHistory` in confidence is a fixed label, with no outcomes behind it.

## 5. Gaps

These are documented, not built.

1. No saved per-goal outcome summary or "what worked" record.
2. Nothing joins cut-era outcomes to the cut's protocol targets, so adherence to the cut is never computed.
3. Nothing compares one goal with another. V3 excludes other goals by design.
4. A goal's type can't tell a cut apart from other goals. The cut window and completion date are hardcoded per goal id.
5. The Operating Plan and nutrition-context targets are overwritten; only protocol versions keep target history.
6. Cut-era logging coverage is unknown and possibly low. If it is low, the page must say "rough" rather than drop the line or invent precision.
