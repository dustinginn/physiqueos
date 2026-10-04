# Implementation, accessibility, and regression notes

Status: design-only. No shipping implementation is included or authorized.

## Feasibility

Estimated complexity: **medium**. Most work is view-local styling plus reusable read-only Evidence primitives. Nutrition Reporting chart styling is the densest area; Activity is mostly surface/typography translation.

Implementation should preserve the existing view models, routes, ordering, and calculators. Do not reconstruct Nutrition totals from visible meals, and do not calculate Activity totals in view code.

## Accessibility

- Preserve Dynamic Type wrapping without truncating nutrient names, protocol status, source, or the partial-day anomaly.
- Navigation/disclosure controls remain at least 44pt; informational Areas keep no false button trait.
- VoiceOver order follows visual order. Read metric grids row-major and announce units.
- Source/provisional/confirmed meaning uses explicit text, never color alone.
- Charts retain accessible series/selected-point summaries and range controls.
- Read-only Evidence rows must not announce editable fields, toggles, or Logger Done actions.
- Dark/mineral-light contrast must be checked at normal and increased contrast.

## Regression plan

1. Snapshot both appearances for N1–N8 and A1–A7 at standard and large Dynamic Type.
2. Assert corrected Nutrition root order: latest day, three functional Reporting routes, then exactly three Recent History rows; assert no future-only Areas block, preview-row day navigation, and Show All sheet navigation.
3. Assert Nutrition Day five-total order and the two distinct no-meal messages.
4. Assert all Nutrition reporting sections and current chart controls remain reachable in source order.
5. Test a structured-meal day and Apple Health totals-only day; confirm no displayed duplicate total and no fabricated meal.
6. Assert Activity root order, four informational Areas, non-navigating linked context, exactly three Recent History rows, and Show All sheet/day navigation.
7. Assert the eight Activity Day metrics remain in exact production order.
8. Test partial Apple Health day with exact pending/anomaly copy and complete day without the warning.
9. Assert no Activity reporting destination exists and no Area obtains a chevron/button action.
10. Assert no Activity styling changes canonical Training workout classification: Cooldown non-Cardio; Run/Stair Stepper Cardio.
11. Run route/state tests for loading, failure, not-found, section-empty, and all-history scopes.

## Semantic implementation risks

- Summing source summaries or meals into a second Nutrition total.
- Treating Apple Health totals-only as missing/invalid because meal detail is absent.
- Styling Activity's workout/non-workout attribution as additive to active calories.
- Turning informational Areas or linked Training context into unsupported routes.
- Inventing Activity charts to match Nutrition's richer reporting hierarchy.
- Making Evidence history look editable by reusing Logger set/row controls.
- Reintroducing duplicate/future-only Nutrition Areas or any dead chevron while cleaning up root composition.
