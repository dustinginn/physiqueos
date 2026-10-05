# Checkpoint D: parity notes (Progress Photos + DEXA)

## Authority

| Item | Source |
|---|---|
| Design | `47ed6d1a`, `photos-dexa-evidence-founder-parity-correction-20261004`: P1–P6, D1–D10, `source/evidence.css`, 360-px SF Pro phone |
| Since Prior Scan | Final correction in `f208007c` (`you-settings-profile-ui-design-20261004`, D1 and `EVIDENCE-LOCK-RECORD.md`) |
| Lock | Evidence family LOCKED |
| Implementation | A new `record` family in EvidenceKit: 360 → 402 scale, SF Pro, the exact `evidence.css` dark and Mineral Light tokens |
| Accepted A/B/C | Untouched |

## Method

The method is the same as A, B and C:

1. Measure the locked HTML with Chrome DOM boxes (`getBoundingClientRect`).
2. Render the shipping SwiftUI on an iPhone 17 Pro simulator, in Dark and Mineral Light.
3. Align the reference and simulator on the navigation rule. Photo Set sheets align on the sheet's own rule.
4. Compare row runs: page runs, plus a row-median mode for text inside cards.
5. Correct, then re-render.

Every reference run sits 1.0 pt below the matching simulator run, because of the harness's 1-px phone border. This is an anchor bias; the residuals below have it removed. Dark and Mineral Light measure identically, to the tenth.

## Measured residuals (simulator − reference, pt)

| Surface | Result |
|---|---|
| P1 header (mark, eyebrow, title, subtitle) | ±0.3 |
| P1 Viewing Goal | ±0.3 |
| P1 Latest Photo Set column (eyebrow, tag, date) | ≤ 0.4 |
| P3/P4 Photo Set (eyebrow, title, subtitle, paired tiles, dates, roles, Interpretation, Capture Conditions, Source History) | ≤ 1.4 |
| P5 inspector (rule to photo viewport) | 16.0 pt vs 15.6 pt |
| D1 header and Viewing Goal | ±0.3 |
| D1 Latest Scan → Apple Health → five headline metrics | ≤ 0.5 |
| D9/D10 Scan History rows | +0.6 to +1.3 |
| Since Prior Scan | Built from the correction's own geometry. Card padding 14, title → columns 13, three equal columns with 1-px separators, labels 9 px with 0.06 em tracking, values 16 px |

Notes on the P3/P4 Photo Set:

- The title needed a measured CoreText correction: a draw-only −1 pt offset plus 1 pt more box.
- Its sheet sits below the status bar as an iOS sheet.

Notes on wrapping:

- **`Show All`.** The shrink row mirrors CSS `flex-shrink` and `min-width: auto`, so `Show All` wraps where Chrome wraps it.
- **`LATEST PHOTO SET`.** CSS letter-spacing also follows the last glyph, so the eyebrow overflows by about 2.5 px and wraps to `LATEST PHOTO / SET` beside `4 / views`.
- **Greedy breaking.** iOS balances short labels, so this one is laid out greedily, word by word, as Chrome does.

## Truthful differences (data, not layout)

- **Phase pills.** Sandbox has a second row of Goal-phase pills (Establish Maintenance, Lean Mass Build). It is kept, as in A/B/C, and pushes the sections below it down.
- **Optional weight line.** The production structure includes it (`No same-day weight`, `177.1 lb`). The locked parity matrix lists it; the fixture art omits it.
- **Uploaded Photos in Build Lean Mass scope.** There are 2 truthful sets, not 5.
- **Interpretation bullets.** They are Server-owned text, shown verbatim (`… against Aug 16.`).
- **DEXA Sandbox data.**
  - There is no source PDF media, so `View BodySpec PDF` is shown only where a media id exists, which is Production.
  - The source label is `BodySpec PDF`, RMR is `2240 kcal/day`, and the deltas are `+0.2 pts / +0.5 lb / +0.8 lb`.
- **DEXA → Apple Health.** This is Production's writeback coordinator. The card's state text is the canonical coordinator label (`Saved` for `.current`), not the design's illustrative `Current`. Sandbox shows the card only through the Debug review seam.
- **Since Prior Scan title.** It uses the page's 15/800 section-title style, so it matches Latest Scan and Core Trends on the same page. The correction harness renders all type at weight 500. The columns use the correction's own 500 weight.

## Interpretation decisions (structure preserved)

- **Core Trends** is always open with all five charts (D2). D1's single chart is the harness abbreviation.
- **Expanded graphs** in Supplemental and both Regional sections are standalone chart blocks after the section's rows, as in D4/D6/D8. They are followed by the 17-px section gap.
- **Scan History** uses the D9/D10 scan cards, which carry the PDF action. D1's two-column rows are the harness abbreviation.
- **Chart copy and colors** follow the design:
  - one note, "Structured values extracted from BodySpec reports.";
  - Body Fat, Lean, Total, RMR and Regional Lean in green;
  - Fat Mass, Supplemental and Regional Fat in amber;
  - a blue ringed dot on the selected scan.
- **Chart fields** keep the locked path insets (18/76 top, 14/76 bottom, 5/300 x).
- **Photo tiles** show no corner zoom glyph, per locked P3. The tile is still a button, with an "Opens the photo full screen to zoom" hint.
- **Photo Set sheet** keeps the system grabber and the large detent (production behavior).
- **Photo dates** are long (`Aug 16, 2026`). The canonical `comparedAgainst` label (`Aug 16`) takes the current capture's year, or the year before if it would fall after the capture. Non-date labels show verbatim.

## Gesture fix

DEXA charts use the B/C `evidenceChartScrub`:

- a tap selects the nearest scan;
- a horizontal-only UIKit pan scrubs;
- a vertical swipe that starts on a chart scrolls the page.

The old zero-distance drag overlay no longer applies to DEXA. Energy and the Weekly/Monthly Briefings still use it; they stay as follow-ups for their owning families.
