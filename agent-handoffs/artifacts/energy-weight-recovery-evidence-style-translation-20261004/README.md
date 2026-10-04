# Energy, Weight + Recovery Evidence — Founder review

Status: **complete source-audited styling translation; pending Founder review; no shipping implementation**

Start with:

- `screens/review-index.png` — concise dark/mineral-light comparison page.
- `screens/energy-weight-recovery-coverage-board.png` — full dark board.
- `screens/energy-weight-recovery-coverage-board-light.png` — full mineral-light board.
- `validation.json` — machine-readable render, parity, semantic and safety validation.

## Review set

Ten templates cover every materially distinct current route/state family, each rendered in both appearances:

| Family | Templates | Coverage |
|---|---:|---|
| Energy | E1–E2 | full root, both existing charts, weekly history, daily history, five completeness states, current crosslinks, async/empty mapping |
| Weight | W1–W2 | complete one-page hierarchy, exact Goal-dependent summary labels, DEXA markers, rolling/weekly averages, inline history, sparse/pending/empty/async states |
| Recovery | R1–R6 | root, Recent Nights, data-source reconciliation, nightly trends, weekly trends, All Nights, staged detail, continuity, time in bed, additional sleep, provenance, recalculation/finality and absence/async states |

Individual dark PNGs are `screens/evidence-e1.png` through `screens/evidence-r6.png`; mineral-light variants use `-light.png`.

## Source authority and constraints

- Prompt authority: `fbd6dd35e4e0dbabe5834d309170dcd2e724398a`
- Native authority: `b8ee8690b194cb90086b62816b9a2c8c400dc026` (Build 85)
- Training, Nutrition and Activity Evidence: **locked**, unchanged.
- Energy, Weight and Recovery: one source-faithful visual direction, pending review.
- Shipping Native/Server source changes: **none**.

Energy has no day-detail route in Build 85; its daily history rows crosslink only to existing Nutrition and Activity roots. Weight is one page with inline disclosure and no detail/history route. Recovery has the only true nested hierarchy of the three: root → Trends / All Nights / Night Detail.

No Coming Soon, future-only destination, dead route, invented chart, Recovery Score, coaching or strategic Recovery activation is present.

## Supporting audit

- `SOURCE-AUDIT.md`
- `NAVIGATION-TREES.md`
- `ENERGY-COVERAGE-MATRIX.md`
- `WEIGHT-COVERAGE-MATRIX.md`
- `RECOVERY-COVERAGE-MATRIX.md`
- `TOKEN-COMPONENT-MAPPING.md`
- `IMPLEMENTATION-NOTES.md`
- `PARITY-SEMANTIC-VALIDATION.md`

