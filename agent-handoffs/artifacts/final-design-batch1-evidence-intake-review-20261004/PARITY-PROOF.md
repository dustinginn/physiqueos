# Parity proof

## Automated proof

`source/render-and-validate.mjs` renders every authority-listed surface at 402 pt in dark and Mineral Light and fails on:

- missing required current labels, fields or actions;
- content differences between appearances;
- width drift;
- horizontal overflow;
- interactive buttons or navigation controls below 44 pt.

Latest result: PASS. See `validation.json`.

## Content and semantic proof

- 20 material source/state surfaces × 2 appearances = 40 full-resolution screens.
- Both appearances use the same DOM, geometry, text, field ordering and action set. Only token values change.
- Generic domain order, Manual field order, Progress Photos pose/session order, DEXA units/order and Evidence Review status/action mapping are source-derived.
- Current read/mutation boundaries are unchanged: direct manual upsert, staged photos, asynchronous intake, full-replace DEXA correction, version-protected confirm/dismiss and uncertain-acceptance readback.
- Source/provenance remains visible per item. Status is always text/shape plus color.
- No Evidence Hub, locked Evidence detail/reporting page, Photo/DEXA briefing, media viewer or workout reconciliation design was changed.

## No invention checks

- no generic Other intake;
- no production DEXA manual intake;
- no Progress Photos pose correction inside Evidence Review;
- no retry on initial Review load failure/not-found;
- no included/excluded editing control;
- no delete or canonical-history mutation on intake;
- no duplicate confirm/dismiss retry after uncertain acceptance;
- no Coming Soon or engineering diagnostics.
