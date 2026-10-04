# Monthly correction + DEXA / Photo briefing design exploration

Status: **Founder review ready; design-only**

Authority: `f05a79c4fe947b9edde5ee1b98ec96bd627685cb`

## Outcome

The accepted Monthly design now has only the two authorized corrections: redundant hero Goal/Phase tags are removed, and exact Strategic Summary / Coach's Take content now closes the evidence body immediately before Month Ahead. Monthly is ready to lock pending Founder confirmation.

DEXA and Photo were audited independently against Native Build 85 and current production Server contracts, then translated into the locked briefing family in dark and mineral light without being recast as recurring briefings. DEXA remains a quantitative measurement event; Photo remains an image-first evidence event. Recovery is absent from both.

## Review artifacts

- `agent-handoffs/artifacts/monthly-correction-dexa-photo-briefing-ui-20261004/README.md`
- `agent-handoffs/artifacts/monthly-correction-dexa-photo-briefing-ui-20261004/screens/monthly-corrected-dark-light.png`
- `agent-handoffs/artifacts/monthly-correction-dexa-photo-briefing-ui-20261004/screens/dexa-dark-light.png`
- `agent-handoffs/artifacts/monthly-correction-dexa-photo-briefing-ui-20261004/screens/photo-dark-light.png`
- `agent-handoffs/artifacts/monthly-correction-dexa-photo-briefing-ui-20261004/screens/event-family-dark.png`
- `agent-handoffs/artifacts/monthly-correction-dexa-photo-briefing-ui-20261004/screens/event-family-light.png`
- `agent-handoffs/artifacts/monthly-correction-dexa-photo-briefing-ui-20261004/PARITY-PROOF.md`
- `agent-handoffs/artifacts/monthly-correction-dexa-photo-briefing-ui-20261004/SOURCE-AUDIT.md`

Full individual PNGs and focused section PNGs are in the artifact `screens/` directory.

## Contract findings

- DEXA selected fixture preserves exact 63% Developing / Decreased -7 Confidence, exact scan values and units, every regional/supplemental comparison, static two-scan timeline, full interpretation, Coach actions, and replacement provenance.
- Photo selected fixture preserves exact event/session facts, all four pose summaries, three canonical comparisons, two interpretation paragraphs, Coach insight, next milestone, and its conditional absences.
- Build 85 Native intentionally omits Photo Confidence even though it can be persisted. The design follows Native.
- Build 85 Native already routes snapshot/comparison photos through the shared full-screen inspection viewer. The old nonfunctional expansion backlog note does not describe current Build 85.
- Safe actual Founder media was available only as an authenticated app-rendered asset. The concept uses truthful Jun 20 → Jun 27 Back Relaxed reference crops without retouching and does not falsely bind them to the synthetic Aug 16 → Aug 30 fixture.

## Validation

Automated render validation confirms 402 pt width, dark/light content parity, exact section order, DEXA-only Confidence, no Recovery in either event briefing, successful Founder-image loading, and the separate image-unavailable state. See `validation.json`.

## Scope confirmation

No shipping Native UI, Server behavior, production content projection, Recovery activation, build number, or TestFlight artifact changed.

