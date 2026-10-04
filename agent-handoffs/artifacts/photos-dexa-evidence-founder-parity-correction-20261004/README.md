# Progress Photos + DEXA Evidence founder parity correction

Status: ready for Founder review. Evidence Hub and Timeline remain locked and are not reopened. No shipping code changed.

## Review boards

- Primary: [`screens/photos-dexa-primary-mobile-review-board.png`](screens/photos-dexa-primary-mobile-review-board.png)
- Photos: [`screens/photos-focused-review-board.png`](screens/photos-focused-review-board.png)
- DEXA: [`screens/dexa-focused-review-board.png`](screens/dexa-focused-review-board.png)
- Inspectable board: [`review-board.html`](review-board.html)

## Direct coverage

Photos has six paired dark/mineral-light states: production root, Uploaded Photos expanded, paired Gallery detail, Source History expanded, full-screen inspection, and media loading/failure/unavailable/fallback.

DEXA has ten paired states: exact full root order, all five Core Trends graphs, and collapsed/expanded states for each of Supplemental Metrics, Regional Lean, Regional Fat and Scan History.

The primary composite contains all 16 pairs. Focused boards contain only their named family.

## What changed from the prior design harness

- Restored the `Progress Photos` identity and production visual hierarchy.
- Restored the 92 × 118 Latest Photo Set thumbnail module and clear Open gallery affordance.
- Restored the full-width, high-prominence Read Photo Briefing action.
- Restored thumbnail-based Uploaded Photos cards with Show All/Close and View actions.
- Restored paired Previous/Current pose imagery as the primary Gallery composition, followed in order by Interpretation, Capture Conditions, Source History and Previous/Next pose controls.
- Separated the paired Evidence comparison composition from single-image full-screen inspection.
- Replaced the generic DEXA expansion proof with every independent disclosure in both states.
- Proved all 17 DEXA graphs: five Core Trends, two Supplemental, five Regional Lean and five Regional Fat.
- Removed all source-audit commentary from product UI.

## Validation

Run:

```sh
node agent-handoffs/artifacts/photos-dexa-evidence-founder-parity-correction-20261004/source/render-and-validate.mjs
```

`validation.json` records 16 direct templates, 32 individual product renders, three review boards, two full coverage boards, exact theme-text parity, zero horizontal/card overflow, zero runtime errors, structural assertions and image hashes.
