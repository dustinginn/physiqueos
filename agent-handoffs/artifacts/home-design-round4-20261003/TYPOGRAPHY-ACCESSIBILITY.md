# Round 4 typography and accessibility audit

All measurements below are iOS points in a 402 × 874 pt target, not image pixels. Plus Jakarta Sans remains the proposed family because the Founder considers the existing direction largely sound; no font-family migration is proposed.

## Track 1 — Structured Card Hybrid

Scale: 11 section/field labels, 12 metadata, 14 supporting body, 15 phase/row titles, 16 actions, 19 trajectory headline, 21 Goal title, 33 greeting name. The 79% ring value is 22 pt.

- Dynamic Type: section labels remain compact at standard sizes; at accessibility sizes, the hero becomes vertical, phase/status rows wrap, priorities become a one-column list, and the tab bar follows the system tab implementation.
- VoiceOver: greeting → trajectory/confidence → target/remaining → Morning Weight → Briefing → Goal summary → Phase 1 → Phase 2 → Guardrail → priorities → tabs.
- Targets: Morning Weight is 54 pt high; Briefing is 64 pt minimum; priority rows and the visible completion affordances are designed to be exposed as 44 pt minimum controls in Native.
- Contrast: light and dark pairs are intentionally different token mappings. Phase/state meaning is always also present as text and icon/shape.

## Track 2 — Editorial Timeline

Scale: 11 eyebrow/field labels, 12 metadata, 14 supporting body, 15 phase titles, 16 actions, 28 Goal title, 31 trajectory headline, 38 Goal progress and 46 confidence.

- The smallest essential type is 11 pt; long phase timing is 12 pt. This removes the sub-11 pt copy risk visible in the early editorial reference.
- Dynamic Type: the 79% masthead moves below the trajectory title; the two action tiles stack; the Guardrail rail becomes a full-width “applies throughout” region after the two phases; priority rows remain linear.
- VoiceOver: two phases are announced as a two-step journey. Guardrail follows the two-phase group with an accessibility label equivalent to “Guardrail, applies throughout,” so it cannot be mistaken for Phase 3.
- Contrast: light uses navy ink on warm neutral; dark uses near-white on ink/navy. Cyan, amber and green carry category/state distinctions only alongside exact labels.
- Targets: both action tiles are 76 pt minimum; priority rows are 62 pt minimum.

## Track 3 — Immersive Trajectory

Scale after the Round 4 legibility correction: 11 metric/section/state labels, 12 metadata and Phase 2 progress, 14 phase/body text, 16 action text, 26 trajectory headline, 32 confidence and 33 greeting name.

- The earlier 9–10 pt confidence/metric labels were raised to 11 pt. No essential Track 3 text is below 11 pt.
- Dynamic Type: the spatial field has a required linear fallback. It becomes trajectory/confidence → four metrics → Goal → Phase 1 → Phase 2/progress → persistent Guardrail. The large background ring becomes decoration and may crop without obscuring content.
- VoiceOver: the foreground confidence element announces `79% confidence`; the background ring is hidden as duplicate decoration. Phase 2 announces its progress immediately after its timing. Guardrail follows the phase group as a persistent constraint, not as a milestone.
- Contrast: dark text pairs use bright white/mint/cyan over deep teal/navy; mineral light uses navy ink over pale teal/mineral. The low-opacity background ring and subtle metric rules are decorative and do not carry meaning alone.
- Targets: the two action tiles are 78 pt minimum; priority controls retain 58–66 pt rows/tiles; system tabs remain practical targets.
- Motion: no motion is needed. If geometry is animated later, Reduce Motion must render the final 79% state without interpolation.

## Implementation caveats

These are design renders, not a substitute for Xcode Accessibility Inspector, device contrast sampling, Bold Text, Larger Text, Increase Contrast, Reduce Transparency or translated-string QA. A future implementation should use Dynamic Type text styles plus caps where display numerals would otherwise dominate, `ViewThatFits`/adaptive layouts for paired actions, and semantic accessibility containers matching the reading orders above.
