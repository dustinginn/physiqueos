# Source audit

## Authorities

- Prompt: `f05a79c4fe947b9edde5ee1b98ec96bd627685cb`
- Accepted Monthly design: `24261324e89163defcd3167369e29f8b26d03aab`
- Native Build 85: `b8ee8690b194cb90086f6f62816b9a2c8c400dc026`
- Production Server: `3c0f4aefddbb9a6886f6ad012443978303d47024`

The Native DEXA and Photo renderers, shared briefing-detail states, `BriefingReadModel`, production mapper, and Build 85 fixtures were audited independently. Production DEXA/Photo narrative services and the production Photo event screen were checked separately rather than treating Weekly or Monthly as a template.

## Monthly correction

The accepted Monthly fixture and every existing body component remain unchanged. Only the two authorized presentation differences are present:

1. the decorative Goal/Phase footer is absent beneath the hero;
2. exact `Coach's Take` / Strategic Summary copy now follows `What Changed` and immediately precedes `Month Ahead`.

The Goal and Phase remain in the data authority; they are not rendered redundantly in the hero.

## DEXA Build 85 contract

Native order is:

`Hero + exact Confidence → Snapshot → What Measurably Changed → Regional Fat Change → Measured Lean Tissue Change → Other Notable Changes → static Cut Timeline → What This Scan Means → Coach's Insight → conditional Phase Review → conditional Goal Completion Handoff → revision provenance`

The selected fixture does not earn Phase Review or Goal Completion Handoff, so both remain absent. The render keeps the exact 63% Developing / Decreased -7 Confidence semantic, four hero measurements, Aug 16 → Aug 30 deltas, regional/supplemental rows, static two-scan timeline, all interpretation paragraphs, Coach actions, and replacement-publication provenance. No interpolated DEXA point or fabricated measurement is present.

Shared loading states remain outside the loaded render: loading; unavailable; not-ready/404 with Check Again; failure with Try Again.

## Photo Build 85 contract

Native order is:

`Hero → This Session facts + capture grid → one mutually exclusive progress path (completion journey OR ordinary comparisons OR text-only) → What This Comparison Shows → Coach's Insight → conditional Completion Decision`

The selected fixture uses the ordinary comparison path and does not earn Completion Decision. Exact event date, session completion, no-same-day-weight state, conditions, four pose summaries, three Aug 16 → Aug 30 comparisons, two interpretation paragraphs, Coach insight, and October 31 DEXA milestone remain present.

Build 85 Native intentionally does not display Photo Confidence even though confidence can persist on the artifact. The design therefore contains no Photo Confidence ring. The current production web screen can display persisted Photo Confidence; this is a real cross-client presentation difference, not silently normalized here.

Build 85 Native has a shared full-screen photo inspection viewer and routes both snapshot and comparison tiles into it. The older “tap does nothing” backlog description is superseded by current Build 85 authority. Implementation should preserve this viewer behavior; the static design package does not claim a tap was executed.

Production photo media resolution remains authenticated and no-store. Missing media maps to the existing placeholder/unavailable seam; the focused failure-state render covers the visually distinct image-unavailable state without changing evidence behavior.

