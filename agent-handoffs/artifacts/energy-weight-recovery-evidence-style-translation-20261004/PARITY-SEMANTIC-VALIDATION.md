# Parity and semantic validation

Automated output: `validation.json`.

## Render validation

- 10 expected templates found: Energy 2, Weight 2, Recovery 6.
- 20 individual phone renders produced, one dark and one mineral-light per template.
- two full coverage boards, two previews and one review index produced (25 PNGs total).
- dark/light text parity: exact across all 10 templates.
- missing/duplicate/extra templates: 0.
- horizontal page or phone overflow: 0.
- browser runtime errors: 0.

## Semantic assertions

Passed:

- exact Energy summary labels present;
- intake, active calories and estimated expenditure remain distinct;
- all five Energy completeness labels represented;
- Weight DEXA treatment visible and exact Goal-dependent labels documented;
- Weight remains one page with no invented route;
- Recovery Recent Nights/All Nights remain discoverable;
- Recovery timeline, stages and continuity represented;
- counted and corroborating sources explicitly non-additive;
- no Recovery Score or strategic Recovery copy;
- no Coming Soon, future feature or roadmap copy.

## Safety/isolation assertions

All false, as required:

- shipping source changed;
- Energy or Weight calculation invented;
- Recovery Score invented;
- strategic Recovery activated;
- sleep provenance changed;
- DEXA markers removed;
- Evidence history made editable;
- roadmap placeholder shown.

The HTML harness uses representative values only to exercise current visual contracts. The implementation authority remains the audited Native/Server read models; no representative value changes a production calculation.

