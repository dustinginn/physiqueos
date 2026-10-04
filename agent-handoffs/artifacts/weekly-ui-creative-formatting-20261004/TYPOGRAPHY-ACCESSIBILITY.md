# Typography and accessibility audit

## Scale used in the disposable harness

- Integrated-lead headline: 25–34 pt by direction.
- Section headings: 20 pt.
- Energy emphasis: 27–32 pt.
- Weight metric: 28 pt.
- Body and narrative: 15 pt with approximately 1.42 line height.
- Secondary/supporting text: 12 pt.
- Eyebrows: 11 pt.
- Compact labels and Confidence caption: 10 pt.

No long-form body content is centered. No body text is reduced to fit page height.

## Priority Muscle Groups correction

The rejected centered/narrow treatment is removed in all six renders. Each group is a full-width, left-aligned scan row. The exact group, status and comparable-exercise count remain present. Semantic color is paired with the group/status text and is never the only state cue.

## Dynamic Type feasibility

The layouts use ordinary vertical flow and no fixed page height. At larger type sizes:

- hero Confidence can stack ring and explanation vertically;
- strategy and metric grids can collapse to one column;
- Energy bars remain independent of text flow;
- Training modules can grow vertically;
- Priority rows can move the status sentence below the group label without changing order or semantics;
- Coach actions remain ordered vertical rows.

No screenshot-only truncation, text clipping or internal scrolling is used.

## Other accessibility checks

- VoiceOver follows the frozen DOM/W-ID order in all directions.
- Confidence is expressed with score, band, movement and reason, not ring color alone.
- Chart has a seven-day accessible summary; production chart-scrub behavior remains unchanged in shipping code.
- Existing navigation retains its two practical 42 pt high controls in the harness and remains a shipping concern for final implementation to reach the preferred 44 pt effective target.
- Dark and mineral-light palettes maintain strong text/surface separation; secondary content remains visibly distinct from labels.
- Recovery says future contract and fixture only in text and does not rely on its cyan treatment.
