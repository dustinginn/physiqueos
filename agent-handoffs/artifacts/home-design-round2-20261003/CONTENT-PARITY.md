# Round 2 content-parity proof

Authority: `FIXTURE.json`, derived from the current Founder Home projection and preserved unchanged across every Round 2 concept.

The disposable renderer validates 52 semantic fields before accepting screenshots. The validation covers greeting/name, complete trajectory and confidence semantics, next action, briefing type/title/date/prompt, complete Goal/phase/guardrail data, all priority titles/details, and all five navigation destinations.

Result for every rendered concept:

| Concept | Required fields | Mismatches |
|---|---:|---:|
| Current Build 84 reference | 52 | 0 |
| Hybrid Dark | 52 | 0 |
| Hybrid Light | 52 | 0 |
| Hybrid Compact | 52 | 0 |
| Experimental A — Trajectory Ribbon | 52 | 0 |
| Experimental B — Mineral Mosaic | 52 | 0 |
| Experimental C — Split Command | 52 | 0 |

`79%` is always presented as **confidence**, matching `SharedUI/ConfidenceRing.swift`; the Round 1 `MODERATE` caption is not propagated.

The Latest Briefing preview text remains in the fixture but is intentionally placed behind the visible action in Round 2. The briefing type, title and date remain on Home. This is progressive disclosure, not deletion or a production semantic change.

## Measured vertical footprint

Measured at 402 pt wide, including complete content and tab bar:

| Concept | Full height | Change vs current |
|---|---:|---:|
| Current Build 84 reference | 1,284.7 pt | reference |
| Hybrid Dark | 1,161.9 pt | −122.8 pt / −9.6% |
| Hybrid Light | 1,164.9 pt | −119.8 pt / −9.3% |
| Hybrid Compact | 941.9 pt | −342.8 pt / −26.7% |
| Experimental A — Trajectory Ribbon | 1,251.9 pt | −32.8 pt / −2.6% |
| Experimental B — Mineral Mosaic | 1,175.9 pt | −108.8 pt / −8.5% |
| Experimental C — Split Command | 1,160.4 pt | −124.3 pt / −9.7% |

The Compact gain comes from a one-line greeting, smaller confidence module, tighter action/Briefing rows and line-based Goal phases. No canonical Goal phase, guardrail, priority, metric or destination is removed.
