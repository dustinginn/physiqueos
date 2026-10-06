# Checkpoint A parity notes

## Method

- Real Debug app, dedicated iPhone 17 Pro simulator (iOS 27.0), status bar pinned to 9:41. Deterministic data comes from the DEBUG-only `-physiqueos.evidence-review` seam, which is absent from Release (verified: the flag string does not appear in the Release binary).
- The locked harness renders a 360 px phone in SF Pro (`-apple-system`). The reference was scaled ×402/360 to the device's 402 pt width, and both images were aligned on the 1 px navigation rule.
- Measurement used ink-run profiles per column band (vertical) and per row band (horizontal), in points. The scripts are in `source/`.
- The process ran three render/measure/correct rounds.

## Audit before coding (locked design vs Build 87 vs Codex)

| | Build 87 shipping | Codex CP-A (rejected) | Locked H1/T1 |
|---|---|---|---|
| Typeface | Plus Jakarta Sans | Plus Jakarta Sans | **SF Pro** |
| Hub header | "Evidence Hub" title, no mark | Square tile mark | 38 px **circular** ◇ mark, YOUR RECORD eyebrow |
| Rows | Bordered cards, SF Symbol circles | Flat rows, lettered tiles | Flat ruled rows, 30 px r9 lettered tiles, accent › |
| Order | Timeline before Recovery, Health Metrics "Coming soon" | Timeline synthesized + appended | Recovery → Timeline last, no Health Metrics |
| Timeline | Card per event, date right-aligned | Rail broken: events zig-zag horizontally (stack centering) | One left rail at x 6 px, 8 px toned node + 4 px 14 % halo, type · date eyebrow |
| Footer | Centered "Showing N of M" | Hidden under the tab bar | Left-aligned 9 px muted note |

Verdict: Codex restyled the production Hub (Jakarta font, square mark) and broke the Timeline composition. It did not transform either surface to the locked design.

## Results (Δ = simulator − reference, pt, relative to the nav rule)

### Hub (Dark and Mineral Light measured identically)

- Eyebrow −0.3 (Mineral −0.6), title −0.3, subtitle 0.0, "Recently Used" title 0.0, "All Evidence" title −0.7.
- Row rules:
  - reference: 139.7 / 196.7 / 254.7 / 305.0 / 362.0 / 418.7 / 475.7 / 532.7 / 589.7;
  - simulator: 140.3 / 196.3 / 253.7 / 305.0 / 361.0 / 418.0 / 475.3 / 532.3 / 589.3;
  - max |Δ| 1.0, row pitch 57.1 pt in both.
- Horizontal positions (reference / simulator):

  | Element | Reference | Simulator |
  |---|---|---|
  | Outer margin | 18.0 | 18.0 |
  | Mark | 18.0–60.3 | 18.0–60.3 |
  | Title x | 74.0 | 74.3 |
  | Nav title | 170.7–232.0 | 170.7–231.7 |
  | Row tile | 31.3 | 31.3 |
  | Row label x | 66.0 | 66.3 |
  | Chevron | 376.7 | 377.0 |

### Timeline (Dark and Mineral Light)

- All 30 measured text runs (header plus 8 events × type/title/detail plus footer) are within ±1.0.
- Rail segments: 60.3 (reference) vs 60.0 (simulator), event pitch 65.4.
- Node box 23.0–39.7 in both; event text x 52.7 in both.
- Back label x 20.7 in both (after a 3.7 pt correction).

### States (S1)

- Card height 119.6 in both; spinner 24.7 in both, copy within 0.4.
- Canonical copy per surface:
  - "Loading Evidence…";
  - "Evidence could not be loaded.";
  - "Loading Timeline…";
  - "No Timeline entries yet.";
  - "Timeline could not be loaded.";
  - Sandbox: "Timeline is not available in Sandbox."

### Corrections made between rounds

1. Back label wrapped inside the toolbar item: fixed with intrinsic sizing.
2. Back label sat 3.7 pt left: corrected.
3. A trial +1 pt glyph nudge proved to be an anchoring artifact and was reverted. Instead, the title line box is compensated by 1 pt, because CoreText lays SF Pro Display 1 pt taller than Chrome in the 30.45 px box.
4. Section titles sat 1.0 pt high in their 18 px line box: corrected with a 1 pt draw-only offset (layout unchanged).

## Remaining differences (not geometry defects)

1. **System chrome.** iOS places the navigation rule at 116 pt, while the harness's 29 + 48 px status/nav bar maps to 86 pt. All content is therefore 30 pt lower on the page in absolute terms, with identical spacing below the rule. The floating Liquid Glass tab bar overlays the lower rows; the frameless harness has none. The nav title and back label are flat, with no glass capsule, matching the harness. The system status bar glyphs differ.
2. **Truthful data.**
   - Activity's summary keeps the canonical family `Latest · <metric>` ("612 active cal"); the harness abstracted it to "Aug 30".
   - In Sandbox, Recently Used is device-local, and there is no Timeline stream, so no Timeline row is shown. Nothing is synthesized.
   - Timeline node colors follow the Server tone, mapped to the locked palette:

     | Server tone | Locked color |
     |---|---|
     | primary | violet |
     | success | green |
     | evidence | blue |
     | effort / warning | amber |
     | danger | red |
     | surface | lime accent |

     The fixture picks tones that reproduce the reference colors. Real Server tones may color some event types differently from the harness's representative assignment. For example, the Server sends DEXA as success → green.
3. **Rasterization.** CoreText vs Chrome glyph widths differ by ≤1.5% (subtitle 272 vs 275 pt wide), with sub-pixel antialiasing differences.

## Behavior and accessibility preserved

- Server stream order, summaries and destinations are unchanged.
- Timeline:
  - rows are read-only (the UI test asserts no buttons);
  - no filters or Load More;
  - newest-first Server order;
  - `Showing N of M` only when `hasMore`.
- Stable identities:
  - `evidence.stream.<id>`;
  - `evidence.hub.{recentlyUsed,all,loading,failure}`;
  - `evidence.header.<title>`;
  - `evidence.timeline.{events,event.<id>,count,back,empty,failure,loading}`.
- Accessibility labels:
  - Row labels are kept verbatim (`"Weight. Latest: 179.4 lb"`), which existing UI journeys depend on.
  - Each event reads as one element: type, date, title and detail. The rail and node are hidden from VoiceOver.
- Touch and text:
  - Rows are full-width and 57 pt tall; the back control is ≥44 pt.
  - All type scales with Dynamic Type (verified at AX Large).
