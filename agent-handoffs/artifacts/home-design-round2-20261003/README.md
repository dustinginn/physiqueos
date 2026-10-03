# PhysiqueOS Home Round 2 — Founder review set

Open [comparison-board.html](comparison-board.html) for the complete unranked comparison. It includes the current Build 84 reference, both exact Founder-provided Round 1 anchors, three hybrid syntheses and three experimental directions.

Read [AUDIT.md](AUDIT.md) for the Build 84 light-appearance audit, semantic palette proposal, reuse/complexity notes and accessibility constraints. Read [CONTENT-PARITY.md](CONTENT-PARITY.md) for the immutable fixture and automated parity result.

## Source references

- [Exact Round 1 anchor A — light/card](screens/anchor-a-light.jpg)
- [Exact Round 1 anchor B — dark/open](screens/anchor-b-dark.jpg)
- [Current Build 84 reference — full](screens/current-full.png)
- [Current Build 84 reference — above fold](screens/current-above-fold.png)

## Round 2 rendered screens

| Direction | Full page | Above fold (402 × 874 pt) |
|---|---|---|
| Hybrid Dark | [full](screens/dark-full.png) | [above fold](screens/dark-above-fold.png) |
| Hybrid Light | [full](screens/light-full.png) | [above fold](screens/light-above-fold.png) |
| Hybrid Compact | [full](screens/compact-full.png) | [above fold](screens/compact-above-fold.png) |
| Experimental A — Trajectory Ribbon | [full](screens/ribbon-full.png) | [above fold](screens/ribbon-above-fold.png) |
| Experimental B — Mineral Mosaic | [full](screens/mineral-full.png) | [above fold](screens/mineral-above-fold.png) |
| Experimental C — Split Command | [full](screens/command-full.png) | [above fold](screens/command-above-fold.png) |

Additional comparison views:

- [Hybrid light/dark side by side](screens/hybrid-light-dark-side-by-side.png)
- [Complete board overview](screens/comparison-board-overview.png)
- [Immutable Founder fixture](FIXTURE.json)
- [Disposable renderer and parity validator](source/render-round2.mjs)

The render harness uses the same fixture for every concept. No shipping Native source, Server behavior, production content projection, API contract or TestFlight build was changed.
