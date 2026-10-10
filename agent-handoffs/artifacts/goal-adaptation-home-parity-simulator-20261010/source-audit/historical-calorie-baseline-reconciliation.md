# Historical calorie baseline: reconciliation (prompt `eb644ed4`)

## Evidence used

None of this is new production access.

| Evidence | Source | Coverage | Used for |
|---|---|---|---|
| Visible Abs cut, May 24 – Jul 18: **2,062 kcal average on 10 logged days** | Founder's Nutrition Evidence Period Summary, as reported in the prompt | 10 of 56 days (18%) | Shown with a warning. **Not used for calories.** |
| Cut final month, DEXA Jun 20 → Jul 18: fat −5.6 lb, lean +1.3 lb, weight −4.3 lb. Intake 1,990 on 9 of 28 days; activity 1,062 on 14 of 28 days | Oct 10 read-only snapshot¹ | intake 32% | **Pace only.** Weight fell about 1.1 lb/week while lean mass held. |
| Build Lean Mass, Jul 18 – Oct 9: three scan-to-scan months | Oct 10 read-only snapshot¹ | intake 27/28, 28/28 and 27/27 days | **Maintenance** |

¹ `src/domain/goalAdaptation/fixtures/founderLeanMassGolden.js` on the Phase B branch (`99f11ae6`). These are sanitized per-period aggregates from the 2026-10-10 read-only extraction (Server `85a98025`). They match the Founder's screenshots: weekly intake mostly 2,300–3,028 with 6–7 logged days a week.

The Build Lean Mass months in detail:

| Months | Mean logged intake | Fat | Lean | Activity |
|---|---|---|---|---|
| Jul 18 – Aug 15 | 2,349 | 0 | +0.8 | 980 |
| Aug 15 – Sep 12 | 2,714 | +1.4 | +5.0 | 880 |
| Sep 12 – Oct 9 | 2,568 | +3.2 | +1.3 | 832 |

## Reconciliation

**Maintenance in logged calories** = mean logged intake − energy stored per day.

- **Stored energy** = (fat lb × 4,250 + lean lb × 830) ÷ days. These are the dormant Phase B policy densities, still provisional.
- **Whole 12 weeks** (82 of 83 days logged):
  - 2,546 logged − (4.6 × 4,250 + 7.1 × 830) ÷ 83 = 2,546 − 307 = **≈ 2,240 a day**
  - measured at the activity actually recorded, about **900 a day**
- **By month:** 2,325 · 2,353 · 2,024, so the range is **2,020–2,350**.
  - Each month carries about ±160 a day of DEXA measurement error (fat ±1.0 lb, lean ±1.5 lb per scan).
  - That is why the months differ.
- **Cross-check:** you gained 11.6 lb (fat +4.6, lean +7.1) while eating about 2,546. Maintenance therefore has to be below every month's intake, and it is.
  - The approved 2,500 target against 2,240 is a planned +260.
  - The DEXA-measured surplus at 2,546 logged is +307.
  - These are consistent.

**Why the earlier 2,117 differed.** It is Phase B `calibrateEnergy` output on the same three months (`GoalAdaptationPhaseB.test.js:27`), with two choices this design does not make:

1. **Re-scaled to an 800 activity goal:** it subtracted each month's recorded activity (980 / 880 / 832) and added 800.
2. **Recency weighting** (56-day half-life): this pulled the result toward the lowest month (2,024).

The simulator presented it as a personal value without explaining either choice. **2,117 is retired from the simulator.**

**Why the cut sets pace but not calories.** Only 10 of 56 days were logged, and 9 of 28 in the final month. Both are below the 70% coverage rule, so no cut-wide intake or maintenance can be inferred. The DEXA outcome (fat −5.6 lb in 4 weeks, lean held, about 1.1 lb/week) is measured, so it is used only to judge pace.

## Resulting targets (scenario A, leaning)

| Case | Eat | Move | Expected loss |
|---|---|---|---|
| Default, −450 a day, +100 extra activity | 2,240 − 450 + 100 = **1,890** | 900 + 100 = **1,000** | ≈ 0.6–1.3 lb/week |
| Founder case, −500 a day, +100 extra activity | **1,840** | **1,000** | ≈ 0.7–1.4 lb/week |

- Both are about the pace of the cut's final month.
- The floor is 1,700 (25% below 2,240).
- The approved Move goal of 800 stays until a change is approved. Usual activity (900) comes from the same 12 weeks as maintenance, so the two match.

## What remains hypothetical

1. **Energy densities** (fat 4,250 and lean 830 kcal/lb) are provisional policy, not personal measurements. A 5 lb DEXA lean change in one month is likely partly water and glycogen.
2. **The snapshot is not live:** it is from Oct 10. The real app must recompute from the current store, through `EnergyEvidenceService` and dexaScans, before showing any numbers.
3. **Usual activity and the 1:1 rule:** usual activity (900) is the recorded mean over the period. The 1:1 rule treats extra wearable activity as fully burned, which is approved policy, not a measurement.
4. **The weekly simulation's "true maintenance"** (set to 2,240) only plays out simulated weeks. Its weekly outcomes, Quick Calibration offers and completion timing are simulated.
5. **Scenarios B and C** remain illustrative users without records.
