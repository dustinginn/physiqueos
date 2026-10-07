# Build 91 Evidence visual system: options for Founder review

**Design-only package.** Real SwiftUI captures of the shipping Evidence pages, with a DEBUG-only design fixture. There is no production implementation, no build bump, no TestFlight upload and no Server change.

| | |
|---|---|
| Base | Build 90 Native `32baf1d5` (integration `8fab4fcb`) |
| Branch | `claude/build91-evidence-visual-system-20261007` |
| Candidate | see `CANDIDATE.txt` / the main report |
| Data | Sandbox fixture authority plus the existing DEBUG Evidence review seams. Photos use synthetic mannequins (`-physiqueos.evidence-review.synthetic-photos`), so no Founder media appears. |
| Device | iPhone 17 Pro simulator, iOS 27. Captures are 1206×2622 (@3x) |

## How to read the boards

1. **Start here:** `boards/B91-00-category-map.png`. It shows all nine destinations with the real Hub icon tile in Mineral Light and Dark for Build 90 and for Options A, B and C, plus each accent family, its hex values and the rationale.
2. **Compare boards:** `B91-compare-NN-<page>.png`. Each shows Build 90 | A | B | C side by side: Mineral rows first, then Dark rows, with the top frame and one scrolled frame.
3. **Per-option boards:** `B91-<A|B|C>-NN-<page>.png`. Each shows one page under one option, with every captured frame (top / middle / end) in Mineral Light, then Dark.

Page numbering: 01 Hub, 02 Training, 03 Nutrition, 04 Weight, 05 Energy, 06 Recovery / Sleep, 07 Progress Photos, 08 Timeline, 09 Activity (mini), 10 DEXA (mini).

`boards/` holds every board. 190 raw 1206×2622 frames back the boards (`<option>-<appearance>-<page>-<frame>`, `base` = Build 90). They are not committed, for size, and are reproducible with the arguments below.

The audit, shared surface rules, icon sources, the three category maps, semantic-color preservation and the accessibility tables are in **`DESIGN-SYSTEM.md`**.

## Reproduce

Run a Debug build with these launch arguments:

```
-physiqueos.native.authority-selection.v1 sandbox
-physiqueos.evidence-review -physiqueos.evidence-review.synthetic-photos
-physiqueos.b91.evidence-system a|b|c        # omit for Build 90
-physiqueos.appearance-review.value light|dark
-physiqueos.appearance-review.route evidence | evidence-timeline | evidence:stream=<training|activity|nutrition|weight|energy|recovery|photos|dexa>
-physiqueos.evidence-review.scroll bottom|<0…1>   # optional scroll anchor
```

Release builds compile none of the `-physiqueos.b91.*` code (`#if DEBUG`).
