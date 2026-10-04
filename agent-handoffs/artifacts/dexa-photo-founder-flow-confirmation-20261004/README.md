# DEXA + Photo Event Founder-flow confirmation

Status: **review ready; implementation not started**

This disposable design harness keeps the accepted DEXA and Photo visual language while correcting the DEXA information regressions and making the entire production Photo Event flow and intended expansion behavior inspectable.

## Fast review

- [Comparison board](comparison-board.html)
- [DEXA units — dark/light](screens/dexa-units-dark-light.png)
- [DEXA full phase breakdown — dark/light](screens/dexa-phase-breakdown-dark-light.png)
- [DEXA reductive vs restored](screens/dexa-before-after-restoration.png)
- [Photo full flow — dark/light](screens/photo-flow-dark-light.png)
- [Photo interaction states — dark](screens/photo-interaction-states-dark.png)
- [Photo interaction states — mineral light](screens/photo-interaction-states-light.png)
- [Photo flow landmarks](screens/photo-flow-map-dark.png)

Individual full-resolution PNGs are under [`screens/`](screens/).

## What is authoritative

- Assignment/prompt: `e5f303aff07e830be25f7a397e21f84ce6257fba`
- Build 85 Native audit: `b8ee8690b194cb90086f6f62816b9a2c8c400dc026`
- Production Server contract audit: `3c0f4aefddbb9a6886f6ad012443978303d47024`
- Photo contract: `src/fixtures/briefingFamilyV3/photoEventArtifact.json`
- DEXA contract: Build 85 `ios/PhysiqueOS/Resources/BriefingsFixture.json` plus `DEXABriefingSections.swift`

The neutral figures are explicitly prototype filler pixels. No Founder photos are embedded, and no claim is inferred from those pixels. Every label, date, metric, paragraph, mapping and section shown around them comes from the current production-shaped contract.

## Validation result

- DEXA unit rows: 17/17
- DEXA phase metrics: 4/4
- Photo sections: 5/5 in exact order
- Session poses: 5/5
- Matched comparisons: 5/5
- Canonical text substitutions: 0
- Intentional pixel substitutions: filler images only
- Dark/mineral-light text parity: pass
- Shipping source changes: none

See [PARITY-PROOF.md](PARITY-PROOF.md), [SOURCE-BEHAVIOR-AUDIT.md](SOURCE-BEHAVIOR-AUDIT.md), and [VIEWER-FEASIBILITY.md](VIEWER-FEASIBILITY.md).

