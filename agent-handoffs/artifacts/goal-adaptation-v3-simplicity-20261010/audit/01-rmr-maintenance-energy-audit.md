# Audit: RMR, maintenance/TDEE and energy calibration

This is a read-only source audit via `git show`. Commits examined:

- Server production `85a98025`
- Server dormant candidate `99f11ae6` (Phase B; not production and not an ancestor of production)
- Native Build 94 `49829781`

## Summary

- **RMR exists only as the BodySpec DEXA report value.**
  - Parsed by `PdfInterpreter.js:191-223` or entered by hand (`DexaPdfIntakeService.js:99`). Stored per scan as `restingMetabolicRate` (`dexaScan.js:39-42`), with no provenance type or ±.
  - Used in production: `EnergyDailyReconciliationService.js:119-152` computes `expenditure = DEXA RMR + HealthKit active (move_calories)` and `balance = intake − expenditure`.
  - Wrapped per window by `CadenceEnergyAssessmentService.js` (`latest_eligible_rmr_for_window` or `historical_rmr_by_day`).
  - Callers: Weekly, Midweek, Monthly, Photo Event, V3 period evidence, the PI energy confidence and observations services, Energy Evidence and Progress reporting.
- **No RMR equation exists anywhere.** No Mifflin, Harris-Benedict, Katch-McArdle or Cunningham code, and no lean-mass formula.
  - RMR changes only when a new scan arrives and is constant between scans.
  - The BodySpec value is itself a lean-mass-based estimate, but the code labels it `sourceType: "dexa"`; the UI says "Estimated RMR".
- **HealthKit basal energy is not ingested.**
  - The iPhone reads `activeEnergyBurned` and the Activity Summary only.
  - The Watch reads basal energy for live workout display only and never sends it.
  - The server has no basal field.
- **There is no maintenance/TDEE estimate in production.**
  - The `maintenance_calibration` and `estimated_maintenance` names are labels only.
  - The copy "Intake adjusted gradually from weekly signals" has no implementation.
  - `PICalibrationEnergyStateResolver` classifies the RMR+active balance as deficit, near_maintenance or surplus; it does not estimate maintenance.
  - `CadenceEnergyObservationsV3.js:378-401` raises `estimate_vs_outcome_tension`, which is diagnostic and narrative only.
- **An outcome-based maintenance estimator exists only on dormant `99f11ae6`.** `EnergyCalibrationV1.js` computes intake − stored energy from scan or weight periods, with a ± band and confidence. It is not persisted and has no production caller.
- **There is no profile data for a provisional RMR.**
  - The user model has `dateOfBirth`, `sex` and `height`, but date of birth and sex are null.
  - Height is 76 in, from seed data only. There are no database columns and no onboarding.
  - Native does not read HealthKit characteristics, height or body mass.
  - Weight comes from weigh-ins; lean mass comes from DEXA only.
- **Apple HealthKit is the only wearable source.**
  - Activity is `move_calories`, daily total including workouts.
  - Manual, voice and screenshot activity entry exist at a lower source rank.
  - No Fitbit, Garmin, Whoop, Strava or Health Connect connector exists, and there is no connector abstraction.
  - Source-neutral pieces: the canonical `activity_day` and the `wearable_estimate` measurement type.
- **Targets and estimates are kept apart.**
  - Approved targets: energy protocol `effectiveStrategy.caloricIntakeTarget` and `activityExpenditureTarget`. They are written only by Phase Review, with `adjustmentAuthorization: user_required` and `automaticAdjustmentAllowed: false`.
  - Estimates live in the assessment objects.
  - The legacy `nutritionContext.estimatedDaily*` fields blur the line, because they are used as targets.

## Capability status

| Capability | Production | Dormant `99f11ae6` | Missing |
|---|---|---|---|
| DEXA-report RMR, stored and editable | ✔ | | |
| Expenditure = DEXA RMR + active | ✔ | | |
| RMR provenance type (measured, DEXA-report, equation, calibrated) | | | ✘ |
| Equation or lean-mass RMR | | | ✘ |
| RMR updated between scans | | | ✘ |
| RMR ± uncertainty | Categorical flags only | | ✘ |
| HealthKit basal energy | Watch live display only | | ✘ |
| Maintenance/TDEE estimate | | ✔ (shadow) | ✘ in production |
| Outcome-based maintenance calibration | Tension flag only | ✔ | ✘ in production |
| Age, sex and height profile | Model fields only | | ✘ (collection and storage) |
| Fitbit or other connectors | | | ✘ |
| Manual activity entry | ✔ | | |
| User-authorised intake and activity targets | ✔ | | |
