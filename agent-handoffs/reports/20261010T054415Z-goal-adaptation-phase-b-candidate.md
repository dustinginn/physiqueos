# Goal Adaptation: Phase B candidate (dormant): ranked options, energy calibration, timelines, validation, revalidation

- Task id: `claude-goal-adaptation-phase-b-20261010`
- Authorization: Founder chat on 2026-10-10. The Founder accepted the Phase 0 + A scenario results and authorized Phase B development.
- Generated: 2026-10-10T05:44Z
- **Status: candidate complete. Dormant. All numerical thresholds are provisional and await Founder review.**
  - Not deployed. Not activated. No production writes. No Native or TestFlight change. No goal or phase changes. Release pointer unchanged.

## Candidate

| Item | Value |
|---|---|
| Branch | `claude/goal-adaptation-phase0-phaseA-20261010`, candidate only (never merged directly) |
| Accepted Phase 0/A head (base) | `5d4701e757872cf83f4c92901dd10465fa4bae38` |
| **Phase B head** | **`99f11ae66ca62882e08145e1f0b93f00829c192f`** |
| Commit | https://github.com/dustinginn/physiqueos/commit/99f11ae66ca62882e08145e1f0b93f00829c192f |
| Production at the time | Server `85a98025`, deployment `40122906` ACTIVE; Native Build 94 `49829781` |
| Founder board (updated in place, version 2) | https://claude.ai/artifact/KbgjJ4EZt3A17dCShAXLK8 |
| Board, results and screens on the branch | `agent-handoffs/artifacts/goal-adaptation-scenario-gate-20261010/` |

**Code (new unless marked):**
- Energy calibration: https://github.com/dustinginn/physiqueos/commit/99f11ae66ca62882e08145e1f0b93f00829c192f#diff-8894fa2b2b886449832de5d012302473b1381a115c4535ada47582639e02c057
- Options and revalidation: https://github.com/dustinginn/physiqueos/commit/99f11ae66ca62882e08145e1f0b93f00829c192f#diff-89f01dfd7229ea5c70e6bed37d86147e233d5dcd5b3d85d7c9e61ae94c38b922
- Phase B evaluator: https://github.com/dustinginn/physiqueos/commit/99f11ae66ca62882e08145e1f0b93f00829c192f#diff-02187a40ba6e51dc004277b21617029af923704720f7cdcabf288295257891d1
- Policy (modified; `phaseB` block): https://github.com/dustinginn/physiqueos/commit/99f11ae66ca62882e08145e1f0b93f00829c192f#diff-f7e74e4e948866edc7aff0d24f01c453f5a4c225ccfca6ed8b555f784beae6e1
- Tests: https://github.com/dustinginn/physiqueos/commit/99f11ae66ca62882e08145e1f0b93f00829c192f#diff-146afabea3ea6da63a90e4cc220c6d3f1e8b31bb7f8b16f0bfcbcd1a935a93b7
- Phase B scenario inputs: https://github.com/dustinginn/physiqueos/commit/99f11ae66ca62882e08145e1f0b93f00829c192f#diff-fed998832475cde2cb5d814199822d083ea015e08d85145a5dd028d17d420385
- Accepted decisions lock: https://github.com/dustinginn/physiqueos/commit/99f11ae66ca62882e08145e1f0b93f00829c192f#diff-0c06875cac55b0da392c3b0c8649a35418bd96639db76dadee0ebadc314af1ff

The diff touches 11 source and script files, +1,534 / −8. It makes **no change** to `src/domain/intelligence/v3/**`, the Phase A modules' decisions, or any route, worker or Native file.

## What was built

1. **Evidence-calibrated energy** (`calibrateEnergy`).
   - **Method.** Maintenance is estimated from periods bounded by two measurements:
     - mean logged intake − stored energy per day;
     - stored energy = Δfat × 4250 + Δlean × 830 kcal/lb when there is a scan;
     - otherwise a mixed weight-change density is used, with wider uncertainty.
   - **Units.** The result is in the user's **logged** calories, so a consistent logging bias cancels out.
   - **Exclusions.** Periods under 21 days, or with under 70% of days logged, are excluded and never imputed.
   - **Weighting.** Periods are activity-normalized to planned activity and recency-weighted (56-day half-life).
   - **Confidence.** Graded high, moderate or low from spread across periods.
   - **DEXA not required.** Weight-trend periods also calibrate.
2. **Ranked, personalized options** (`buildAdaptationOptions`).
   - **Builders.** Rung-specific builders cover:
     - resolving a constraint conflict or a guardrail review (gain, cut, maintenance);
     - reviewing the timeline;
     - a strategy stall (body or strength);
     - a below-range review;
     - sustainability;
     - the end of a time-limited phase;
     - a goal achieved.
   - **What each option carries:**
     - a daily intake range and its change from plan;
     - a timeline (phase weeks plus the goal-completion window);
     - projected body fat and lean mass;
     - `fitsLimits`;
     - `requires` (for example the revised upper limit it needs);
     - tradeoffs (protects / costs);
     - validation errors and warnings.
   - **"Make my own changes"** is always last.
3. **Guardrail validation.**
   - Options that breach the user's limits are marked `fitsLimits: false` and ranked below options that fit.
   - Intake is clamped to safe bounds: never more than 25% below or 500 kcal above calibrated maintenance, rounded to 25.
4. **Recommendation gating.** The top option is marked *recommended* only when all of these hold:
   - Phase A evidence is sufficient;
   - the option is valid and fits the limits;
   - any energy number is backed by at least moderate calibration.

   Otherwise the options are still shown, but none is recommended and the calorie numbers read "requires calibration". User approval is always required, and `automaticApplicationAllowed` stays false.
5. **Revalidation** (`revalidateRecommendation`). A shown recommendation carries a snapshot: date, evidence fingerprint, maintenance estimate and recommended kind. Before approval it is re-checked:
   - **`current`**: approval is allowed;
   - **`superseded`**: new evidence or a maintenance shift of 100 kcal or more; the user sees the refreshed options;
   - **`expired_needs_refresh`**: older than 14 days; approval is blocked until refreshed.
6. **Dormancy.** `evaluateGoalAdaptationPhaseB` wraps the unchanged Phase A shadow. Nothing calls it from production, nothing is persisted, and no route or worker is added.

## The Founder's own Oct 9 result (actual engine, provisional numbers)

**Calibration** comes from the read-only production extraction, sanitized to aggregates:

| Period | Logged days | Mean intake | Activity | Stored kcal/day | Maintenance |
|---|---|---|---|---|---|
| Jun 20 → Jul 18 | 9/28 (32%) | 1990 | 1062 | — | excluded: logging too sparse |
| Jul 18 → Aug 15 | 27/28 | 2349 | 980 | +24 | 2325 ±203 |
| Aug 15 → Sep 12 | 28/28 | 2714 | 880 | +361 | 2353 ±209 |
| Sep 12 → Oct 9 | 27/27 | 2568 | 832 | **+544** | 2024 ±213 |

Maintenance at the planned 800 kcal activity is **≈ 2,117 logged kcal/day (1,977–2,258), moderate confidence**.

The last period explains the Oct 9 conflict. At about 2,570 logged kcal (close to the 2,500 plan), the body stored about 540 kcal/day, and 3.2 of the 4.5 lb gained was fat. The plan sits roughly 380 kcal above calibrated maintenance at the current activity, rather than being a lean surplus.

| # | Option | Daily intake | Timeline | Projected | Fits limits |
|---|---|---|---|---|---|
| 1 | **Lean out first, then keep building** (recommended) | 1,600–1,775 kcal (−900 to −725 vs plan; held at the 25% safety floor) | lean 2–7 weeks; goal ≈ 2027-01-19 → 2027-05-22 | body fat 8.3–9%; about 2.6 lb fat to lose | yes |
| 2 | Keep building with a new range and date | 2,275–2,375 kcal (−225 to −125) | goal ≈ 2027-01-05 → 2027-04-03 | body fat 10.4–11.3%; needs an upper limit of at least 11.5% | no (as currently set) |
| 3 | Keep my current plan | 2,500 kcal | goal ≈ 2026-11-26 → 2026-12-28 | body fat 12.4–14% | no |
| 4 | Make my own changes | user defined | — | — | — |

Revalidation behaves as follows:
- **B2:** shown Oct 9 and approved Oct 12, so the recommendation is `current`.
- **B3:** a new scan arrives, so it is `superseded`.
- **B4:** Oct 30 is 21 days later, so it is `expired_needs_refresh` and approval is blocked.
- **B1:** with sparse logging, calibration is `insufficient_history`. The options are still shown, nothing is recommended, and no calorie numbers are given.

## All scenarios (Phase B actual)

| ID | Phase A rung (unchanged) | Calibration | Ranked options | Recommended |
|---|---|---|---|---|
| F1, G1, D1, D2, P1 | resolve_constraint_conflict | 2,117 (moderate) | lean_out_first > keep_building_revised_limits > keep_current_plan > custom | lean_out_first, 1,600–1,775 |
| M3 | below_range_review | 2,663 (high) | adjust_energy > adjust_range > keep_current_plan > custom | adjust_energy, 2,900–3,000 |
| M5 | strategy_review (stall) | 2,699 (high) | adjust_energy > recheck_soon > custom | adjust_energy, 2,800–2,900 |
| L2 | review_timeline | 2,551 (high) | extend_date > adjust_energy > keep_current_plan > custom | extend_date (intake unchanged) |
| L3 | guardrail_review (cut) | 2,551 (high) | slow_the_cut > diet_break > keep_current_plan > custom | slow_the_cut, 2,050–2,150 |
| MT1 | guardrail_review (maintenance) | 2,352 (high) | tighten_briefly > adjust_range > keep_current_plan > custom | tighten_briefly, 2,050–2,150 |
| S1 | strategy_review (strength) | insufficient (not needed) | deload_then_progress > change_program_variables > keep_current_plan > custom | deload_then_progress |
| A2 | sustainability_review | 2,663 (high) | realistic_targets > adherence_support > custom | realistic_targets, 3,050–3,175 |
| T1 | phase_time_limit_review | 2,663 (high) | extend_leaning > resume_building_revised > maintain > custom | extend_leaning |
| GA1 | goal_achieved | 2,663 (high) | maintain > set_next_goal > raise_target > custom | maintain, 2,625–2,725 |
| F2–F4, M1, M2, M4, L1, S2, MT2, C1, E1, A1 | non-proposal rungs | computed | **no options** (Phase A did not reach a proposal) | — |
| B1–B4 | Phase B extras | see above | — | see above |

## Tests

| Run | Result |
|---|---|
| Goal Adaptation suites (Phase 0/A plus Phase B: calibration, options, gating, revalidation, accepted lock) | **72/72 pass** |
| Scenario runner (26 accepted + 4 Phase B extras, all checks including `phaseB.*`) | **30/30 PASS** |
| **Accepted 26 decisions lock** | Phase A decisions are byte-compared against `phaseAAcceptedDecisionsV1.json` (snapshot of accepted `5d4701e7`). **Unchanged.** |
| **Full unit suite: Phase B vs production base `85a98025`** | Phase B: 10,577 tests, 294 failed. Base: 10,505 tests, 294 failed. **The failing sets are identical: 0 new, 0 fixed.** All 294 are environment-only, from the absent local `private/founder/runtime-store.json`. |
| ESLint (all new and changed files) | clean |
| Board render (1440/1280 desktop Dark + Mineral Light, 390 mobile) | 0 horizontal overflow, 0 page errors, filters work |

## Read-only production access

**Purpose:** the calibration history extraction (`scripts/operations/goalAdaptationPhaseBCalibrationExtract.mjs`), run under the Founder's read-only production authorization for this Goal Adaptation work.

**How it was run.** Approved Mac console runner, context `physiqueos-final-cutover-config`, component `web`.
- **Passes:** two (markers C and D; D corrected the field selection).
- **Identity gates:** runtime SHA `85a98025`; owner is the Founder.
- **Transaction:** `REPEATABLE READ READ ONLY`, with `transaction_read_only` = on; owner-scoped SELECTs only; explicit `ROLLBACK`; each marker seen exactly once.
- **Output:** period aggregates only. No raw evidence, no credentials.
- **Writes: none.**

## Provisional thresholds for Founder review (`policy.phaseB`, status `provisional_requires_founder_review`)

1. **Energy densities and measurement error**
   - Fat 4,250 and lean 830 kcal/lb.
   - Mixed weight change: 2,500 kcal/lb when gaining, 3,300 kcal/lb when losing.
   - Scan error ±1.0 lb fat and ±1.5 lb lean; intake logging error 10%.
2. **Calibration**
   - Periods of at least 21 days with at least 70% of days logged.
   - 56-day recency half-life; at most 4 periods.
   - Moderate confidence needs at least 2 periods with a spread of 350 kcal or less; high needs 175 kcal or less.
3. **Rates**
   - Leaning: 0.4–0.7% of body weight per week, with 80–95% of the loss as fat.
   - Slow build: 0.5–1.0 lb lean per month at a surplus of +150–250 kcal.
   - Adjustment sizes: maintenance tightening −200 to −300; cut slowdown +150 to +250; stall +100 to +200; below range +100 to +200.
4. **Leaning target.** 75% of the way up the user's body-fat range (Founder range 8–9% → aim about 8.75%).
5. **Safety bounds.** No more than 25% below or 500 kcal above calibrated maintenance; round to 25 kcal. **The Founder's lean-out option sits on this floor (1,600 kcal).** If a gentler cut is preferred, raise the floor or lower the leaning rate. This is the most consequential number to review.
6. **Recommendation gate.** At least moderate calibration before any calorie number is recommended.
7. **Revalidation.** Expire after 14 days; supersede on new evidence or a maintenance shift of 100 kcal or more.

## Founder decisions remaining

1. Approve or adjust the provisional thresholds above, especially the deficit floor and leaning rate behind the 1,600–1,775 kcal lean-out.
2. **Option set and ordering:** confirm the per-rung options and the rule that options that fit the limits rank above options that do not.
3. **No-calibration behaviour:** show options without calorie numbers and with no recommendation, as in B1. Confirm this rather than hiding the proposal.
4. **Phase C scope** (separate authorization): persisting recommendations, wiring briefing delivery and the Your Journey events, and a dormant Server deploy. Native remains out of scope until it is designed and authorized.

## Storage

Free disk was 20 GiB, above the 15 GiB floor. Only task temp files under the job directory and ignored `.tmp/` runner copies were used, and the runner copies are removed after publication. No worktrees were created.

## Safety

| | |
|---|---|
| production_mutated | false (read-only, rolled back) |
| deployed / activated / TestFlight / Native | no / no / no / no |
| goal or phase edits | none |
| release pointer (`latest.*`) | unchanged |
| secrets or credentials in artifacts | none |
