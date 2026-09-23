// One formatter for every HealthKit-backed Activity/Nutrition Evidence
// summary string (headline `value`, `detail`, Activity Areas, Evidence
// timeline rows). Real HealthKit daily totals are binary floating-point
// sums (e.g. 2405.5120239257812 calories, 782.1669999999962 active cal);
// interpolating them raw leaks that precision straight into user-facing
// text, which is exactly what Build 53 surfaced on the Evidence Reports.
//
// This deliberately mirrors the Native metric cards' formatter
// (`String(Int(value.rounded()))` in ActivityReadModel/NutritionMacroGridView)
// so headline and cards can never disagree: a whole number, no thousands
// separator. Math.round is round-half-up, which equals Swift's default
// `.rounded()` (toNearestOrAwayFromZero) for the non-negative inputs these
// surfaces carry. It is NOT the Log screen's Intl formatter ("2,406"), on
// purpose -- the cards don't use a separator either.
//
// Presentation only: callers keep passing the untouched canonical number
// through on their numeric fields; only the display string is rounded.
export function formatWholeNumber(value) {
  return Number.isFinite(value) ? String(Math.round(value)) : null;
}
