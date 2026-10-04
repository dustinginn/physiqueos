# Parity proof

`source/render-and-validate.mjs` renders 9 surfaces in dark and mineral light and fails closed on:

- any screen width other than 402 pt;
- any dark/light text mismatch;
- missing active Goal destination, Confidence, composition values, Guardrail, Training, turning points or exact Coach's Take;
- incorrect active Goal section order;
- missing completed Goal recap, milestones, final composition, outcome, achieved-by list or unlocked relationship;
- incorrect first/final photo role/date labels;
- Guardrail presentation that fails to say it is not Phase 3 and applies across the Goal;
- missing loading, error, empty/read-only or unavailable state.

Current result: **PASS**

- screens: 18
- dark/light content parity: exact per surface
- active order: Hero → Your Journey → Body Composition → Training Progress → Evidence Turning Points → Coach's Take, with Guardrail retained as a separate cross-phase band between composition and training
- photo roles: Beginning front relaxed · May 24; Completion front relaxed · Jul 18
- shipping changes: false

The validator intentionally treats redacted photo pixels as presentation-only substitution. It requires the canonical authenticated production media role labels and records the accepted static `ProgressPhotoTile` behavior on Goals.
