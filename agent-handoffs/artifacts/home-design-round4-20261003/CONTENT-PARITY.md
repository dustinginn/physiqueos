# Round 4 immutable content-parity proof

Every Round 4 candidate is generated from the same production-derived [FIXTURE.json](FIXTURE.json). The disposable renderer checks 52 exact semantic fields before accepting a screenshot.

| Candidate | Required fields | Mismatches | Confidence geometry marks |
|---|---:|---:|---|
| Track 1 Locked Light | 52 | 0 | 79% ring |
| Track 1 Matching Dark | 52 | 0 | 79% ring |
| Track 2 Editorial Light | 52 | 0 | large `79% confidence` type; no visual meter |
| Track 2 Editorial Dark | 52 | 0 | large `79% confidence` type; no visual meter |
| Track 3 Immersive Dark | 52 | 0 | foreground 79% ring + background 79% ring |
| Track 3 Immersive Mineral Light | 52 | 0 | foreground 79% ring + background 79% ring |

The fixture preserves the exact greeting/name, Goal identity, `79% confidence`, target, remaining, progress, destination, Phase 1, Phase 2, Guardrail, Briefing title/type/date/prompt, priority names/details/states/open count, and navigation labels.

The Briefing prompt stays in the fixture and is progressively disclosed behind the Briefing action. It is not replaced, summarized or shown as narrative preview. No confidence band such as “Moderate” is invented.

## Geometry verification

Track 1’s visible ring and both Track 3 rings use an explicit 79/21 conic split. The renderer asserts each `data-confidence-geometry` value is exactly `79` and asserts the expected meter count: one in each Track 1 screen, none in Track 2, and two in each Track 3 screen.

Track 3’s `+5.8 of 10 lb` field is inside the Phase 2 content cluster in the DOM and visual layout. Guardrail is a separate persistent constraint region rather than a phase node in Tracks 2 and 3.

## Full-height measurements

Measured at the actual 402 pt target width, including complete content and tab bar:

| Candidate | Full height | Content below first 874 pt viewport |
|---|---:|---:|
| Track 1 Locked Light | 1,179.9 pt | 305.9 pt |
| Track 1 Matching Dark | 1,177.9 pt | 303.9 pt |
| Track 2 Editorial Light | 1,097.8 pt | 223.8 pt |
| Track 2 Editorial Dark | 1,097.8 pt | 223.8 pt |
| Track 3 Immersive Dark | 1,080.2 pt | 206.2 pt |
| Track 3 Immersive Mineral Light | 1,080.2 pt | 206.2 pt |

No information was removed to achieve the shorter Tracks 2 and 3. Their reduction comes from open-canvas grouping, a side-by-side action pair, a two-step phase story, and spatial integration of trajectory/goal information.

The machine-readable evidence is in [validation.json](validation.json).
