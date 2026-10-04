# DEXA field-unit audit

The render does not apply a generic unit suffix. It displays the exact string values already projected by the canonical DEXA contract.

| Group | Metric | Unit semantics | Previous | Current | Delta |
|---|---|---|---:|---:|---:|
| Since Last Scan | DEXA Weight | lb | 177.0 lb | 179.4 lb | +2.4 lb |
| Since Last Scan | Body Fat | %; delta in percentage points | 9.0% | 9.4% | +0.4 pts |
| Since Last Scan | Fat Mass | lb | 15.9 lb | 16.9 lb | +1.0 lb |
| Since Last Scan | Lean Tissue | lb | 158.0 lb | 159.5 lb | +1.5 lb |
| Regional Fat Change | Arms | lb | 1.8 lb | 1.9 lb | +0.1 lb |
| Regional Fat Change | Legs | lb | 5.1 lb | 5.4 lb | +0.3 lb |
| Regional Fat Change | Trunk | lb | 7.6 lb | 8.1 lb | +0.5 lb |
| Regional Fat Change | Android | lb | 1.0 lb | 1.1 lb | +0.1 lb |
| Regional Fat Change | Gynoid | lb | 1.9 lb | 2.0 lb | +0.1 lb |
| Measured Lean Tissue Change | Arms | lb | 18.3 lb | 18.6 lb | +0.3 lb |
| Measured Lean Tissue Change | Legs | lb | 54.6 lb | 55.1 lb | +0.5 lb |
| Measured Lean Tissue Change | Trunk | lb | 72.9 lb | 73.7 lb | +0.8 lb |
| Measured Lean Tissue Change | Android | lb | 10.5 lb | 10.6 lb | +0.1 lb |
| Measured Lean Tissue Change | Gynoid | lb | 18.1 lb | 18.3 lb | +0.2 lb |
| Other Notable Changes | Visceral Fat | lb | 1.0 lb | 1.1 lb | +0.1 lb |
| Other Notable Changes | A:G Ratio | unitless | 1.41 | 1.43 | +0.02 |
| Other Notable Changes | RMR | cal/day | 2220 cal/day | 2240 cal/day | +20 cal/day |

## Presentation seam

Build 85 already receives these as field-specific strings. The future shipping correction belongs in the presentation components that render `DEXAComparisonMetric` and `DEXARegionalChangeMetric`: `comparisonGroup`, `regionalGroup`, `supplementalGroup`, and their `DEXAInlineComparisonRow` rows in `DEXABriefingSections.swift`. It must preserve the source strings rather than parsing and globally reformatting them.

VoiceOver should read the visible unit on previous, current and delta values. Body-fat delta should remain “percentage points,” not pounds or percent change. A:G Ratio should remain unitless.

