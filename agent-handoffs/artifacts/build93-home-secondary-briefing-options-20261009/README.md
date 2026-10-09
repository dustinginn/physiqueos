# Build 93 Home secondary briefing — two design options

Design-only review artifacts for the full-width Midweek Briefing card that appears below the primary DEXA tile.

Both options preserve:

- the accepted Home hierarchy and surrounding components;
- active event first, cadence briefing second;
- `DEXA Analysis Ready`, `Oct 9`, `Midweek Briefing`, `Midweek Briefing Ready`, `Review the week so far.` and `Oct 7`;
- whole-card navigation semantics and the exact briefing destination contract;
- 402 pt iPhone width, Dark and Mineral Light appearances.

The released Native candidate `9d0a2069` was not modified. The review source reuses the accepted Home capture above and below the bounded action/briefing region, then renders the authentic two-briefing fixture and proposed card inside that region.

## Option A — Family Card

- [Dark](screens/option-a-dark.png)
- [Mineral Light](screens/option-a-light.png)
- [Dark, 135% type stress](screens/option-a-dark-large.png)
- [Mineral Light, 135% type stress](screens/option-a-light-large.png)

The conservative family translation: full-size teal document icon, paper surface, teal hairline, integrated arrow and 18 pt radius. It is unmistakably related to the primary DEXA tile.

## Option B — Editorial Rail

- [Dark](screens/option-b-dark.png)
- [Mineral Light](screens/option-b-light.png)
- [Dark, 135% type stress](screens/option-b-dark-large.png)
- [Mineral Light, 135% type stress](screens/option-b-light-large.png)

The more editorial supporting treatment: teal cadence rail, compact document marker, inline date, stronger title and a ruled prompt. It remains clearly secondary to DEXA without returning to the legacy purple eyebrow, brain badge or `View →` treatment.

## Review board and reproducibility

- [Complete comparison board](comparison-board.png)
- Design source: `source/options.html`
- Renderer: `source/render-screens.mjs`

The renderer uses the local bundled Playwright runtime and Chrome. Every individual capture is a 3x browser render:

- default: 402 × 1,018 pt → 1,206 × 3,057 px;
- type stress: 402 × 1,086 pt → 1,206 × 3,261 px.

Measured on the final render:

- all eight screens: 402 pt wide;
- default secondary cards: 366 × 116 pt;
- 135% type-stress secondary cards: 366 × 152 pt;
- horizontal overflow: 0;
- vertical overflow: 0.

No Xcode build, Server change, production write, deployment, archive, TestFlight action or release-pointer change was performed.
