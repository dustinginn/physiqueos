# Nutrition + Activity Evidence — focused Founder correction

Status: **accepted styling preserved; focused correction ready for confirmation; implementation not started**

## Review first

- [Before/after board](screens/before-after-history-placeholders.png)
- [Nutrition root — dark](screens/nutrition-root-corrected.png)
- [Nutrition root — mineral light](screens/nutrition-root-corrected-light.png)
- [Activity root — dark](screens/activity-root-corrected.png)
- [Activity root — mineral light](screens/activity-root-corrected-light.png)
- [Existing full Nutrition history — dark](screens/nutrition-full-history.png)
- [Existing full Nutrition history — mineral light](screens/nutrition-full-history-light.png)

Focused root-section crops:

- `screens/nutrition-recent-history-root.png` and `-light`
- `screens/activity-recent-history-root.png` and `-light`

## Corrected behavior

- Nutrition root now ends with exactly three canonical Recent Nutrition History rows plus `Show All >`. Rows open Nutrition Day; Show All opens the already-designed full Recent Nutrition History page.
- Activity root now includes the four current informational Activity Areas, current Linked Training Context, then exactly three canonical Recent Activity History rows plus `Show All >`. Rows open Activity Day; Show All opens the already-designed full history page.
- Nutrition retains only the functional Calories, Macros, and Meals Reporting destinations. The duplicate/non-navigating Nutrition Areas block and its future-only placeholders are absent.
- Activity still has no Reporting block or invented chart. Its current Activity Areas remain because they are real values, not dead navigation.
- The root previews and full history pages use the same canonical source collections.

## Authority

- Prompt authority: `edb8faca934666dfdb6bcaa233cd62410a6021a3`
- Build 85 Native authority: `b8ee8690b194cb90086b62816b9a2c8c400dc026`
- Accepted styling source: `8de163506d6e996328e60d510199562cdeb8dffb`
- Design harness/documentation only; no shipping Native or Server code changed

Automated focused validation: [validation.json](validation.json).
