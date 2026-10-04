# Validation

Result: **PASS**.

## Deterministic checks

- 8 expected focused templates found: Energy 3, Weight 3, Recovery 2.
- 16 product renders generated: every template in dark and mineral light.
- Dark/light text content is identical for all eight templates.
- No horizontal board overflow or screen-card overflow.
- Night Detail timeline is contained in both themes; all 14 chart nodes remain inside the timeline plot.
- Energy root contains two distinct history sections and exactly two Show All actions.
- Weekly and Daily Energy history remain separate sheets.
- Daily Energy History covers both links, Activity-only and Nutrition-only variants.
- No explanatory audit copy about the absent Energy day-detail route appears in product UI.
- Weight collapsed state contains two Show All controls; W2 and W3 are inline disclosures rather than sheets.
- Night Detail stage totals remain 59m / 4h 12m / 1h 18m / 20m.
- Continuity preserves Oct 1 values of 34m awake and 1h 33m longest continuous sleep plus the Sep 21 gap.
- No Recovery Score or strategic Recovery activation appears.
- No shipping source or server contract changed.

Machine-readable results and SHA-256 hashes for all 22 PNG outputs are in [`validation.json`](validation.json).

## Visual QA

Manually inspected:

- concise review index;
- dark and mineral-light correction boards;
- Energy root and both sheet types;
- Weight collapsed and each independent expanded state;
- Recovery Night Detail timeline at phone width;
- mineral-light Continuity trends;
- Continuity before/after comparison.

The timeline, axis labels and legend remain within the card. The lighter Continuity treatment remains legible in both themes, uses separate units/scales and does not obscure the missing-night gap.
