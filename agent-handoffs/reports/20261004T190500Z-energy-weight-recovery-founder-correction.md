# Energy, Weight + Recovery founder correction — ready for confirmation

Date: 2026-10-04 18:17 UTC  
Status: **focused correction complete; ready for Founder confirmation; implementation not started**

## Authority

- Prompt authority: `854d24c4d3640385c654c582578492c8d9e766fc`
- Accepted design authority: `fbd6dd35e4e0dbabe5834d309170dcd2e724398a`
- Exact Native source audited: `b8ee8690b194cb90086b62816b9a2c8c400dc026` (Build 85)
- Work branch: `codex/energy-weight-recovery-founder-correction`
- Artifact commit: `a21296ec4fb6f13d639d294d120218d2aedc7d33`
- Artifact root: `agent-handoffs/artifacts/energy-weight-recovery-founder-correction-20261004/`

## Outcome

The accepted Energy, Weight and Recovery design direction is unchanged. This package corrects only the interaction-parity and visualization issues identified by Founder review.

Energy now keeps Weekly History and Recent Daily Energy as distinct root sections, each with its own three-row preview and Show All action. The actions open separate Weekly History and Daily Energy History sheets. Daily rows retain their production-conditional Nutrition Day and Activity links. No route-audit explanation appears in product UI.

Weight was re-audited against exact Build 85 source. Weekly Averages → Show All and Weight History → Show All do not navigate and do not open sheets. Each toggles its own read-only list inline on the root, replaces its three-row preview with all rows and changes the action to Close. The correction renders collapsed, Weekly-expanded and History-expanded states explicitly.

Recovery keeps the accepted hierarchy and content. Night Detail’s interactive timeline is now fully contained at phone width. Continuity alone changes visual treatment: two separately scaled thin point/line series replace the heavy bar treatment while preserving every canonical value, the missing-night gap, range controls, units and read-only semantics.

## Concise review

Start here:

- `agent-handoffs/artifacts/energy-weight-recovery-founder-correction-20261004/screens/review-index.png`
- interactive/local review: `review-index.html`
- dark focused board: `screens/correction-coverage-board.png`
- mineral-light focused board: `screens/correction-coverage-board-light.png`
- Continuity comparison: `screens/continuity-before-after.png`

Individual dark/mineral-light renders are `screens/correction-e1.png` through `correction-r2.png`, with `-light` counterparts.

Source and handoff documents:

- `SOURCE-PROOF.md`
- `INTERACTION-MATRIX.md`
- `IMPLEMENTATION-DELTA-REVIEW.md`
- `VALIDATION.md`
- `validation.json`

## Focused coverage

| Family | Templates | States |
|---|---:|---|
| Energy | 3 | root with both history affordances; Weekly sheet; Daily sheet with conditional links |
| Weight | 3 | both collapsed; Weekly expanded inline; History expanded inline |
| Recovery | 2 | contained Night Detail timeline; lighter Continuity trends |

All eight templates are rendered in dark and mineral light with identical content.

## Validation

Automated validation passed:

- 8/8 focused templates in both appearances;
- 16 individual phone renders plus boards, previews, comparison and review index (22 PNGs);
- exact dark/light text parity;
- missing, extra and duplicate templates: 0;
- horizontal overflow and card overflow: 0;
- Night Detail timeline containment passed in both appearances;
- separate Energy sheet and context-link assertions passed;
- exact inline Weight disclosure assertions passed;
- exact Night Detail stage totals and Continuity selected values/gap assertions passed;
- forbidden Recovery Score, strategic activation, invented Energy route and audit-copy assertions passed.

## Implementation delta ledger

The canonical ledger was reviewed and one genuine delta was appended: Build 85 Continuity currently uses wide Awake bars and standalone longest-sleep points, while the accepted target requires thin point/line series. Implementation must preserve the exact rows, conversions, axes, accessibility meaning and unavailable-night gaps.

Energy and Weight corrections match behavior already shipping and do not create new implementation gaps. The timeline issue was isolated to the design harness geometry, not proven as a shipping defect.

## Shipping isolation

No shipping Native or Server source changed. No API contract, aggregation, Energy calculation, Weight calculation/DEXA behavior, HealthKit semantics, sleep reconciliation/provenance, navigation authority, build number or TestFlight state changed.

## Next action / stop reason

Founder confirms the focused dark/mineral-light correction package. All requested corrections, exact interaction audit, ledger review and deterministic render validation are complete, so this work stops at confirmation readiness as requested.
