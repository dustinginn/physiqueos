# Weekly/Midweek final section alignment and mineral-light translation

Date: 2026-10-04 UTC  
Status: **FOUR-RENDER REVIEW SET READY — AWAITING FOUNDER LOCK CONFIRMATION**

## Authorities

- Assignment authority: `f01c03002071f92f2742c1679eaa6bdebd1abc2f`
- Accepted dark-pair authority: `2599068c327111b7f3622cfc1918d4df07f7f789`
- Native Build 85: `b8ee8690b194cb90086b62816b9a2c8c400dc026`
- Production Server: `3c0f4aefddbb9a6886f6ad012443978303d47024`
- Recovery prototype authority: `1bfa92ef874c3c96f05b23a9d3cbdfb956384156`
- Locked mineral-light appearance authority: selected Home/Log dark + mineral-light system recorded in `agent-handoffs/backlog/20261003-app-wide-ui-design-polish-home-exploration.md`

## Weekly section-order correction

Weekly Body Composition moved from after Recovery to directly below Weight. Final order:

1. Hero / Confidence
2. Energy
3. Weight
4. Body Composition
5. Training
6. Recovery
7. Biggest Takeaway
8. What To Do
9. Into Next Week
10. revision/provenance

Midweek already had Body Composition directly below Weight and remains structurally unchanged. Photos and Still Unresolved remain absent.

Computed structure/geometry signatures prove every accepted Midweek dark section is unchanged. They also prove every Weekly dark section is unchanged internally; only Body Composition's position moved.

## Mineral-light translation

The light appearances preserve the exact accepted dark geometry and apply only mineral-light tokens:

- page `#F1F1E9`;
- primary ink `#102638`;
- secondary `#4E6470`;
- muted `#576B73`;
- purple `#684AC7`;
- semantic green `#0B6B4D`, blue `#0E607A`, amber `#875400`, cyan `#0D6670`;
- pale teal/mineral hero field;
- pale mineral/lilac Coach finale;
- high-contrast mineral Recovery plot.

All light text/accent tokens audited against the page field meet or exceed 4.5:1. Full mapping: `agent-handoffs/artifacts/weekly-midweek-light-translation-final-20261004/LIGHT-TOKEN-MAPPING.md`.

## Artifacts

Root: `agent-handoffs/artifacts/weekly-midweek-light-translation-final-20261004/`

Full renders:

- `screens/weekly-dark-full.png`
- `screens/weekly-light-full.png`
- `screens/midweek-dark-full.png`
- `screens/midweek-light-full.png`

Boards:

- `screens/weekly-dark-light.png`
- `screens/midweek-dark-light.png`
- `screens/recurring-family-four-up.png`

Focused comparisons:

- `screens/weekly-hero-dark-light.png`
- `screens/midweek-hero-dark-light.png`
- `screens/weekly-weight-body-composition-dark-light.png`
- `screens/midweek-weight-body-composition-dark-light.png`
- `screens/weekly-recovery-dark-light.png`
- `screens/midweek-recovery-dark-light.png`
- `screens/weekly-finale-dark-light.png`
- `screens/midweek-finale-dark-light.png`

Proof:

- `PARITY-PROOF.md`
- `validation.json`
- `family-final.html`

## Parity validation

Passed for all four renders:

- exact canonical semantic fields; zero missing, mismatched or extra;
- exact required section order;
- Weekly Body Composition directly below Weight;
- unchanged Midweek dark structure;
- Photos absent;
- Still Unresolved absent;
- exact Energy graph marks, labels and data;
- exact Recovery nightly points, baseline, labels, status and fixture boundary;
- exact Confidence, Body Composition, Biggest Takeaway, What To Do, cadence close, navigation and provenance;
- dark/light visible text, semantics, section geometry and page height identical per cadence;
- only appearance tokens differ.

Weekly is 3,969 points tall in both appearances. Midweek is 3,014 points tall in both appearances. Both render at 402 points / 3×.

## Accessibility

- navigation targets remain 44 points;
- narrative copy remains at least 15 points;
- mineral-light primary, secondary, muted and semantic accents all clear 4.5:1 on the page field;
- Energy bars preserve labels and series legend;
- Recovery preserves line/points, dashed baseline, status text, foam row and complete VoiceOver summary;
- Dynamic Type feasibility and VoiceOver order are unchanged because geometry and DOM order are identical across appearances.

## Shipping isolation

No shipping Native UI changed. No Server behavior or canonical projection changed. No theme implementation was added. Recovery was not activated. No policy, build number or TestFlight state changed.

## Lock state

These renders are ready for review. Weekly dark + mineral light and Midweek dark + mineral light are **not** marked locked until the Founder explicitly accepts this final set.
