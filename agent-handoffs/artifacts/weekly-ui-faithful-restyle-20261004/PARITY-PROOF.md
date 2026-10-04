# Deterministic parity proof

The baseline, faithful dark and faithful mineral-light screens are produced by one renderer. Dark/light differences are CSS theme tokens only. The faithful renders add only `R-FUTURE`.

The validator fails on any of these conditions:

- a canonical displayed string, metric or label is missing, changed, duplicated with a conflicting value or newly introduced;
- the ordered production W-ID sequence differs after removing `R-FUTURE`;
- a production W-ID changes parent or source-component mapping;
- W15 is absent, moved outside Energy, changes type/title/series, or any of its fourteen marks changes date/value/series;
- a fixture-absent conditional component appears;
- Home or Briefing History is removed or renamed;
- Recovery appears zero or more than one time, is outside the approved seam, lacks a fixture-only boundary, or carries Confidence semantics.

Result from `validation.json`:

- Build 85 baseline: PASS — 85 exact semantic fields, exact sequence, exact graph.
- Faithful dark: PASS — 85 exact semantic fields, exact sequence/parentage, exact graph, one valid `R-FUTURE`.
- Faithful mineral light: PASS — 85 exact semantic fields, exact sequence/parentage, exact graph, one valid `R-FUTURE`.
- Full production-only parent mapping: identical in baseline, dark and mineral light.
- Recovery Confidence coupling: absent.

This proves the rendered fixture. It does not change or activate production logic.
