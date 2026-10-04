# Nutrition + Activity Evidence Founder correction — complete

Date: 2026-10-04 16:52 UTC
Status: **focused correction ready for Founder confirmation; both families ready to lock if accepted; implementation not started**

## Authority

- Prompt authority: `edb8faca934666dfdb6bcaa233cd62410a6021a3`
- Accepted styling source: `8de163506d6e996328e60d510199562cdeb8dffb`
- Exact Native source audited: `b8ee8690b194cb90086b62816b9a2c8c400dc026` (Build 85)
- Work branch: `codex/nutrition-activity-evidence-founder-correction`
- Artifact commit: `8e6bd94bb029fe23f7a259de872a7a3f98ea8034`
- Focused artifact root: `agent-handoffs/artifacts/nutrition-activity-evidence-founder-correction-20261004/`

## Correction outcome

The accepted typography, palette, surfaces, metric treatment, and row language are unchanged.

Nutrition root now ends with `Recent Nutrition History`, exactly three newest-first canonical rows, and `Show All >`. Each preview row retains date, calories, macro summary, meal count, and Nutrition Day drill-down. Show All retains the existing full Recent Nutrition History destination. Preview and full history use the same `[NutritionDayRecord]` source.

Activity root now includes the current four informational Activity Areas, current Linked Training Context, then `Recent Activity History`, exactly three newest-first canonical rows, and `Show All >`. Rows retain current protocol/value detail and Activity Day drill-down. Show All retains the existing full history destination. Preview and full history use the same `[ActivityDayRecord]` source.

Nutrition keeps all three functional Reporting destinations: Calories, Macros, Meals. The duplicate/non-navigating Nutrition Areas block is hidden because its three current labels duplicate Reporting and its remaining rows are future-only placeholders without current Native destinations. No valid Nutrition Day field, report, aggregation, or provenance is removed.

Activity keeps its four current informational metrics and Linked Training Context because they are real evidence, not dead navigation. Activity still has no Reporting block, chart, workout list, or invented destination.

## Source audit clarification

Build 85 Native already exposes Recent History correctly on both roots with `historyPreviewLimit = 3`, Show All sheets, and day drill-down. The issue was confined to the accepted design harness: N1/A1 separated the lower root sections into other templates and made them absent from the root viewport. No shipping-source defect was found or changed.

## Focused review artifacts

Start here:

- `agent-handoffs/artifacts/nutrition-activity-evidence-founder-correction-20261004/README.md`
- `agent-handoffs/artifacts/nutrition-activity-evidence-founder-correction-20261004/screens/before-after-history-placeholders.png`

Corrected roots:

- Nutrition dark: `screens/nutrition-root-corrected.png`
- Nutrition mineral light: `screens/nutrition-root-corrected-light.png`
- Activity dark: `screens/activity-root-corrected.png`
- Activity mineral light: `screens/activity-root-corrected-light.png`

Focused history crops:

- Nutrition: `screens/nutrition-recent-history-root.png` and `-light`
- Activity: `screens/activity-recent-history-root.png` and `-light`

Continuity proof for the unchanged full Nutrition history is also included as `screens/nutrition-full-history.png` and `-light`; the existing Activity full-history screen remains unchanged.

## Validation

Automated focused validation passed in both appearances:

- Nutrition root history rows: exactly 3;
- Activity root history rows: exactly 3;
- both Show All affordances present;
- both existing full-history destinations present;
- Nutrition Calories/Macros/Meals reports preserved;
- current Activity Areas and Linked Training Context preserved;
- user-facing future-placeholder text: 0;
- dead/future-only Nutrition navigation: 0;
- Activity Reporting destinations/charts: 0;
- horizontal overflow: 0;
- runtime errors: 0;
- dark/light root and history text parity: exact;
- overall `validation.json`: `pass: true`.

Semantic rules remain unchanged: Nutrition aggregation/provenance, Activity metrics, HealthKit behavior, Cooldown non-Cardio classification, canonical Run/Stair Stepper Cardio identity, and Training Evidence lock.

## Shipping isolation

No shipping Native or Server source changed. No evidence contract, aggregation rule, HealthKit behavior, navigation authority, historical record, Cardio policy, build number, or TestFlight state changed. This commit contains design harness, rendered PNG, validation, documentation, and backlog status only.

## Next action / stop reason

Stop for Founder confirmation of the four corrected root renders and concise before/after board. If accepted, Nutrition Evidence and Activity Evidence are ready to lock.
