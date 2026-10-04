# Energy, Weight + Recovery Founder Correction

Focused acceptance package for prompt authority `854d24c4d3640385c654c582578492c8d9e766fc`.

This package corrects interaction parity without reopening the accepted visual direction:

- Energy keeps **Weekly History → Show All** and **Recent Daily Energy → Show All** as two separate modal history surfaces. Daily rows preserve their conditional **Nutrition Day** and **Activity** links.
- Weight reproduces Build 85 exactly: **Weekly Averages → Show All** and **Weight History → Show All** expand their own read-only lists inline on the root. The action becomes **Close**; no sheet or child route is introduced.
- Recovery contains the Night Detail timeline at phone width and replaces only the Continuity chart marks with a lighter two-panel point/line treatment. Values, range, missing-night gap, labels and read-only behavior stay unchanged.

## Review

Open [`review-index.html`](review-index.html) for the concise dark/mineral-light review page.

The eight focused product templates are in [`correction-board.html`](correction-board.html):

| ID | Surface | State |
|---|---|---|
| E1 | Energy | Root history sections, each with three-row preview and its own Show All |
| E2 | Energy | Weekly History modal sheet |
| E3 | Energy | Daily Energy History modal sheet with conditional context links |
| W1 | Weight | Both history disclosures collapsed |
| W2 | Weight | Weekly Averages expanded inline |
| W3 | Weight | Weight History expanded inline |
| R1 | Recovery | Night Detail with contained interactive timeline |
| R2 | Recovery | Trends with lighter Continuity visualization |

Rendered PNGs are in [`screens/`](screens/). [`continuity-before-after.html`](continuity-before-after.html) isolates the accepted Recovery visualization change.

## Verification

Run:

```sh
node agent-handoffs/artifacts/energy-weight-recovery-founder-correction-20261004/source/render-and-validate.mjs
```

The deterministic validator checks 8/8 templates in dark and mineral light, text parity, product-copy constraints, separate Energy destinations, exact Weight disclosure behavior, timeline containment, Recovery values and missing-night semantics. See [`validation.json`](validation.json) and [`VALIDATION.md`](VALIDATION.md).

No shipping source, server contract or product behavior was changed.
