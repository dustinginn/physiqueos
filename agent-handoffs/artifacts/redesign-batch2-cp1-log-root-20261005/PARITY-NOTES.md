# Checkpoint 1 parity notes

## Method

- **Element edges:** measured with column and row color probes on the 3× PNGs, converted to points.
- **Colors:** sampled as mean RGB over 3 × 3 px.
- **Alignment:** the reference has a 59 pt status bar, while iOS 26 on the iPhone 17 Pro has a 62 pt safe area. Simulator content therefore sits 2.7 pt lower overall. That offset is removed before comparing.
- **Diff images:** each `boards/*` image ends with an amplified absolute difference.

## Geometry (pt): Dark and Mineral Light identical

| Element | Reference | Simulator | Δ |
|---|---|---|---|
| Training Logger field height | 95.7 | 95.7 | 0 |
| Field icon tile | x 333.0–366.7, y 203.7–242.0 | same | 0 |
| Diamond glyph | 13.7 × 13.3, centred | 12 pt SF `diamond.fill`, centred | ≤ 0.5 |
| Logged Today: Training / Nutrition tile height | 103.7 | 103.7 | 0 |
| Logged Today: Activity / Weight tile height | 73.7 | 73.7 | 0 |
| Tile column x | 16–198 / 205–386 | 16–197 / 205–386 | ≤ 0.3 |
| Gap from field to tiles | 41.3 | 42.0 | +0.7 (two device px of rounding) |
| Review band height | 133.7 | 134.3 | +0.6 (rounding) |
| Gap from band to quick actions | 9.3 | 9.3 | 0 |
| Quick action height | 59.7 | 59.7 | 0 |
| Plus glyph | 7.7 × 7.6, centre y 679.5 | 7.7 × 7.6, same centre | 0 |
| Upload glyph | 10.7 × 9 | 11.7 × 10 | ≤ 1 |
| Review action "→" extent | x 225–244.7 | x 225–244.7 | 0 |
| Hairline to Sources box | 45.0 | 45.0 | 0 |
| Expanded Sources box height | 90.7 | 90.7 | 0 |
| Sources row pitch | 28.0 / 29.0 | 28.7 / 29.0 | ≤ 0.7 |
| Text line widths (all measured lines) | | | ≤ 1 |

## Colors

Each region below was sampled in both images, in Dark and in Mineral Light. Every one matched exactly:

- the canvas;
- the Training Logger field and its icon tile;
- the Training, Nutrition, Activity and Weight tile tints;
- the teal, green, amber and cyan tile rules;
- the review band and its rule;
- both quick-action fills.

## Remaining differences, each explained

1. **Status bar and safe area.** iOS status bar and Dynamic Island; a constant 2.7 pt content offset.
2. **Tab bar.** The real iOS 26 floating Liquid Glass tab bar from the accepted Batch 1 shell, in place of the harness's flat HTML tab bar. Batch 2 does not change navigation chrome.
3. **Glyph baselines inside line boxes, ≤ 1.5 pt.** Line-box geometry matches CSS: half-leading is reproduced, and fixed line boxes are used for tighter display and label roles. CoreText places glyphs exactly at the font's ascender, which is 1.038 em. Chromium's text sits up to 1.5 pt higher in some roles. Both renderers use the byte-identical Plus Jakarta Sans file.
4. **Line breaking in two strings.** iOS's built-in orphan prevention keeps a single word off the last line:
   - "…them to / your history." where the reference has "…them to your / history.";
   - "Log weight for / another date" where the reference has "…another / date".

   Both strings fit the same width and take the same number of lines. Matching Chromium's greedy wrap exactly would need a UIKit-backed text view. If the Founder wants that, it is a contained follow-up.
5. **Icon identity.** The harness used text glyphs as placement stand-ins (◆ ＋ ⇧ ⌁ ⌄), per the locked utility rules. Production uses SF Symbols matched to the stand-ins' size and position: `diamond.fill`, `plus`, `shift`, `point.3.filled.connected.trianglepath.dotted` and `chevron.down`. The review action keeps the literal "→" from the design copy.
6. **Font rasterization.** CoreText and Skia antialias differently, so strokes can look a fraction lighter on device.
7. **Scrolled captures.** The iOS 26 scroll-edge effect tints the status-bar area. This is system behavior.

## States without a locked render

The empty, possible-duplicate, multiple-review, processing, loading and error states follow the locked hierarchy and the Compact Command Center implementation notes:

- **Empty:** keeps all four tiles with "Nothing logged yet". Sources is hidden when nothing is attributable.
- **Processing:** non-tappable teal band. A processing tile keeps its status line and drops out of Sources.
- **Loading:** header plus spinner.
- **Error:** header plus the exact "Log could not be loaded." There is no retry button; pull-to-refresh is the retry path, as before.
