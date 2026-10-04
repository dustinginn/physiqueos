# Midweek parity proof

`source/render-and-validate.mjs` renders the artifact and fails closed on semantic, order, chart, quantitative, conditional, Recovery-boundary or accessibility drift.

## Passed current-production gates

- **61 / 61** rendered semantic fields exact.
- Missing / mismatched / extra / conflicting: **0 / 0 / 0 / 0**.
- Midweek-specific M-ID production order: **exact**.
- Navigation: **Home → Briefing History**, exact.
- Confidence: score, band, movement, direction, delta, label and reason exact; one surface only; ring geometry exactly 79%.
- Narrative V3 placement: Result `M04`, Meaning `M05`, Confidence `M03`, Action `M20`, Watch `M21`.
- Energy graph: one grouped-bar chart, two canonical dates, two canonical series, four exact bar values, exact accessibility summary.
- Quantitative source marks: **23**, zero missing, mismatched or invented.
- Current conditional state exact: Body Composition present; Priority Muscle Groups, Training Watch, Biggest Takeaway, revision and production Recovery absent.
- Legacy contract-ineligible strings absent.

## Recovery boundary gate

Recovery is currently `included=false` in the production contract. The separate approved future fixture appears exactly once after Training and before Still Unresolved / Coach's Take, carries **FUTURE CONTRACT · FIXTURE ONLY**, preserves the planned Midweek values exactly and declares **Confidence coupling: none**.

## Accessibility gate

- 402 pt iPhone target at 3× rendering.
- 44 pt navigation targets.
- Narrative/long-form copy is at least 15 pt and left-aligned.
- Energy chart retains a complete accessibility label.
- Semantic state is paired with text and geometry rather than color alone.
- DOM/VoiceOver order matches canonical Midweek order.

Machine-readable result: `validation.json` (`pass: true`).
