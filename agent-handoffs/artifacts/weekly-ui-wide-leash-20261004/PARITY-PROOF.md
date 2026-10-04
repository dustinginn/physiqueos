# Information-contract parity proof

The disposable renderer validates every concept against the unchanged Build 85 fixture `weekly_briefing_2026-08-23_2026-08-29` from Native authority `b8ee8690b194cb90086b62816b9a2c8c400dc026`.

## Automated gates

Each of A/B/C passed:

- all 86 expected semantic source fields present exactly once in the collected map;
- zero missing, mismatched, conflicting or unknown semantic fields;
- exact canonical production W-ID order;
- exact W-ID parent/component map shared by all concepts;
- all conditionally absent fixture sections still absent;
- Confidence score, band, movement and reason exact;
- Energy title, seven dates, two series and all 14 point values exact;
- exactly one Recovery fixture after W29 Training and before W33 Coach;
- explicit `FUTURE CONTRACT · FIXTURE ONLY` and `Confidence coupling: none` boundary;
- exact Coach's Take, What To Do, Into Next Week and revision provenance;
- Home and Briefing History navigation retained;
- 402 pt iPhone target width and 51 pt status safe-area treatment;
- 15 pt minimum narrative/body size in the rendered contract;
- Priority Muscle Groups left aligned and scan width validated;
- 25 visual quantitative marks mapped to canonical source keys with zero missing, altered or invented values.

## Render results

| Concept | Height | Semantic fields | Chart exact | Order exact | Quantitative provenance | Result |
|---|---:|---:|---|---|---|---|
| A Data Editorial | 4,288 pt | 86 | PASS | PASS | PASS | PASS |
| B Immersive Story | 4,802 pt | 86 | PASS | PASS | PASS | PASS |
| C Dense Analytical | 3,437 pt | 86 | PASS | PASS | PASS | PASS |

The complete machine-readable proof is `validation.json`; the reproducible harness is `source/render-and-validate.mjs`.

Parity is intentionally informational, not geometric. The large geometry changes are the assignment's purpose.
