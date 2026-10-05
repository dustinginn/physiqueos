# Batch 2 · Checkpoint 1: Log root (Compact Command Center)

**Founder review needed before Checkpoint 2 begins.**

Start with **`primary-mobile-review-board.png`**. It shows the locked reference beside the real iPhone 17 Pro simulator, Dark first, then Mineral Light.

## Exact authority

| Item | Value |
|---|---|
| Native implementation | `b540b323f4af4a79b20a9b61e2f7b03d46532ae3` on branch `claude/redesign-batch2-log-logger-20261005`, base Build 87 `f66c7fc6` |
| You/Settings tap-target addendum (separate commit) | `bb6a6584274be62b95d74bb273ff1af3585b4fa0` |
| Server D1 candidate (**not deployed**) | `c7c99347a520d13fd344fe89b6b1398877cdd255` on branch `claude/log-sources-provenance-server-20261005`, on top of production `27dad44a` |
| Locked Log reference | `agent-handoffs/artifacts/selected-home-log-exploration-20261004/` (`ec425a96`) |
| Locked density and Sources refinement | `agent-handoffs/artifacts/briefing-light-log-density-final-polish-20261004/` (`97807d50`, `6029bbfa`) |
| Exact reference files | `screens/log-command-density-{dark,light}-full.png`, `screens/log-sources-collapsed-{dark,light}.png`, `screens/log-sources-{dark,light}.png` |

## Contents

- **`primary-mobile-review-board.png`**: the reference full page next to the simulator top, plus the scrolled bottom with Sources collapsed and expanded, in both appearances.
- **`boards/loaded-top-{dark,light}.png`**: the reference, the simulator, and an amplified difference image, with the reference aligned on its content top.
- **`boards/sources-{collapsed,expanded}-{dark,light}.png`**: the same three-panel comparison against the locked Sources crops, aligned on the hairline.
- **`states-board.png`**: empty, possible-duplicate plus multiple reviews, processing, loading and error, in both appearances.
- **`screens/`**: every full-resolution simulator capture at 1206 × 2622, 3×.
- **`you-settings-hit-target/`**: You, Settings and Appearance after the addendum fix. They are pixel-identical to Build 87.
- **`PARITY-NOTES.md`**: measurements and the remaining differences.

## How captures were made

- **Shipping code:** captures use the shipping SwiftUI `LogView` on a dedicated iPhone 17 Pro simulator (iOS 27.0), with the status bar fixed at 1:05.
- **Data:** a DEBUG-only deterministic fixture reproduces the locked `LOG-DENSE-FIXTURE.json` through the production read-model shape, including typed provenance.
- **Launch flags:** `-physiqueos.redesign-review`, `-physiqueos.log-review.state`, `.sources` and `.scroll`.
- **Release builds:** the DEBUG seams compile out.
