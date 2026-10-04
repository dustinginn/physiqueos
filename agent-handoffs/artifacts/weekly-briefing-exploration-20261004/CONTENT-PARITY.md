# Content parity and fixture boundary

## Canonical fixture

`WEEKLY-FIXTURE.json` is the one content authority for all six screens. Current Weekly content comes from the real Sep 20–26 V3 production-data preview:

- “Strong training week, but a quiet finish.”
- exact Result, Meaning, Action, Watch and Coach’s Take;
- 79% Confidence, prior 79, delta 0, held;
- all Confidence support, limiting, raise/lower, assumptions and next-evidence copy;
- seven lift bests and the Hack Squat 6-to-12-rep detail;
- 2639 kcal/day intake, 789 active kcal/day and exact target deltas;
- +1.7 lb/week four-week weight rate;
- Sep 12 DEXA, +5.0 lb lean mass, 8.1% body fat and 4.2 lb remaining;
- no selected photo evidence;
- the Thursday-through-Saturday nutrition coverage limitation;
- Home and Briefing History destinations and canonical-v3 provenance.

The mockups add presentation headings such as “Weekly command view” or chapter numbers, but do not replace, shorten or reinterpret canonical briefing fields.

## Recovery fixture-only fields

The following fields are synthetic values created only to prove that a future recurring Recovery section can hold the planned contract:

- Green status;
- 7h 24m average Sleep;
- +8 min against a 28-night baseline;
- five of six observed nights within a 45-minute window;
- continuity, stage-selection and training-association copy;
- Recovery meaning and action;
- six-of-seven coverage and closed-window freshness.

Each Recovery rendering visibly says that Recovery is absent from the current production Weekly projection, the values are not production data, `strategicEligible = false`, and `confidenceCoupling = none`.

## Automated validation

`validation.json` records per-screen checks at a 402-point iPhone width and 3× raster scale.

- Expected semantic fields per screen: 89.
- Present semantic fields per screen: 89.
- Missing fields: 0.
- Mismatches: 0.
- Extra semantic fields: 0.
- Recovery fixture boundary visible: true on all six screens.
- Canonical body-copy size: 13 pt on all six screens.
- Confidence ring geometry where used: 79.

The renderer fails if a field is absent, differs from the fixture, if the Recovery boundary disappears, if body copy drops below 13 pt, or if a displayed ring is not 79%.

