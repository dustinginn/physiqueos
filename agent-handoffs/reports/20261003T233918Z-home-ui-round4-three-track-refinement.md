# Home UI Exploration Round 4 — three-track refinement

Date: 2026-10-03  
Status: **Ready for Founder review; no track accepted or ranked**  
Repository: `dustinginn/physiqueos`  
Artifact commit: `8a4d22eeceda4de6df317253e16da2b9e0bfaadc`

## Authority and reference roles

- Round 4 prompt authority: `76820607fcb60819d26b1236bba967baece8b7ea`
- Native Build 84 source authority: `bcd92c74602695766c270fe6af052de45afece4b`
- Home composition authority: `ios/PhysiqueOS/Presentation/Home/HomeView.swift`
- Shared visual authority: `SharedUI/PhysiqueOSTheme.swift`, `Typography.swift`, `CardContainer.swift`, `SectionHeading.swift`, `IconBadge.swift`, `StatusChip.swift`, `MetricRow.swift`, `ConfidenceRing.swift`
- Navigation authority: `RootTabView.swift`
- [Track 1 reference](../artifacts/home-design-round4-20261003/screens/reference-track1.jpg): exact attached three-up set; the third/light screen is the locked structural authority and the first/second screens inform dark continuity.
- [Track 2 reference](../artifacts/home-design-round4-20261003/screens/reference-track2.jpg): exact attached open-canvas editorial screen.
- [Track 3 reference](../artifacts/home-design-round4-20261003/screens/reference-track3.jpg): exact attached immersive trajectory screen.
- [Immutable fixture](../artifacts/home-design-round4-20261003/FIXTURE.json): one production-derived Home projection used by all six screens.

## Founder review artifacts

- [Review index](../artifacts/home-design-round4-20261003/README.md)
- [Complete side-by-side comparison board](../artifacts/home-design-round4-20261003/comparison-board.html)
- [Track 1 light/dark pair](../artifacts/home-design-round4-20261003/screens/track1-side-by-side.png)
- [Track 2 light/dark pair](../artifacts/home-design-round4-20261003/screens/track2-side-by-side.png)
- [Track 3 dark/mineral-light pair](../artifacts/home-design-round4-20261003/screens/track3-side-by-side.png)
- [All dark tracks](../artifacts/home-design-round4-20261003/screens/dark-tracks-triptych.png)
- [Full board overview](../artifacts/home-design-round4-20261003/screens/comparison-board-overview.png)
- [Content-parity and geometry proof](../artifacts/home-design-round4-20261003/CONTENT-PARITY.md)
- [Typography/accessibility audit](../artifacts/home-design-round4-20261003/TYPOGRAPHY-ACCESSIBILITY.md)
- [Implementation/reuse/Log readiness notes](../artifacts/home-design-round4-20261003/IMPLEMENTATION-NOTES.md)

The review index links all six full-page renders and all six exact 402 × 874 pt above-the-fold captures. Screenshots are 3× PNGs for phone/Remote Control inspection.

## Exact content parity

The renderer validates 52 exact semantic fields for each candidate: greeting/name; trajectory label, goal label, headline, state, support line and confidence; target/remaining; Morning Weight action; Briefing type/title/date/prompt; Goal identity/date/progress/destination; Phase 1 and Phase 2 labels/titles/statuses/timing/progress; Guardrail and observation; all three priorities/details/states/open count; and five navigation labels.

Result: **52/52 fields present, zero mismatches across all six candidates.** The Briefing prompt remains in the fixture and is progressively disclosed; no visible narrative preview is introduced. `79% confidence` remains exact and no confidence band is invented.

## Track 1 — Structured Card Hybrid

### Locked Light

The Founder-selected third/light structure is retained: edge-to-edge trajectory field, Morning Weight, report-icon Briefing, compact Goal and priority controls in the required order. Phase 1 uses amber, Phase 2 green and Guardrail cyan so the three concepts no longer share maintenance color language. Full height: 1,179.9 pt.

### Matching Dark

A true dark counterpart preserves identical sequence and geometry. Its trajectory field extends to the page edges rather than reverting to a floating card. Purple is brand punctuation; blue, teal, green, amber and cyan own functional roles. Full height: 1,177.9 pt.

Guardrail remains an independent row in both candidates. Implementation complexity: **Medium**.

## Track 2 — Editorial Timeline

The light and dark candidates preserve the open-canvas editorial masthead, large 79% confidence type, paired Weight/Briefing actions and two-step Phase 1 → Phase 2 story.

Guardrail is no longer a third node. A cyan bracket/parallel rail spans the two phase rows and is read after the two-phase group in the proposed VoiceOver order. Both candidates are 1,097.8 pt tall. Implementation complexity: **High**.

The dark candidate is deliberately remapped to navy/charcoal, teal evidence, green active state and amber completed state rather than being a mechanical inversion.

## Track 3 — Immersive Trajectory

The dark candidate retains the compact teal/navy field and spatial phase map. `+5.8 of 10 lb` now lives directly inside the Phase 2 cluster. Guardrail is a separate cyan embedded constraint band beneath the two-node journey. The minimum essential type is now 11 pt, with Phase 2 progress and metadata at 12 pt.

The mineral-light candidate is included because it preserves the immersive field, ring geometry and warm/non-white atmosphere rather than becoming a generic light dashboard. Both candidates are 1,080.2 pt tall. Implementation complexity: **Very High**.

### Confidence geometry verification

The foreground confidence wheel and the large background geometry each use an explicit conic 79/21 split. The renderer asserts two geometry marks per Track 3 screen and requires each to equal `79`. Result: **four Track 3 meter assertions passed**. The visible 21% gap is present in dark and mineral-light renders.

## Typography and accessibility

- Track 1: 11 / 12 / 14 / 15 / 16 / 19 / 21 / 33 pt core scale; 22 pt ring value.
- Track 2: 11 / 12 / 14 / 15 / 16 pt body hierarchy with 28 pt Goal, 31 pt trajectory, 38 pt Goal progress and 46 pt confidence.
- Track 3: 11 pt minimum metric/section/state labels, 12 pt metadata/progress, 14 pt phase/body, 16 pt actions, 26 pt trajectory, 32 pt confidence and 33 pt greeting name.
- All actions/rows are designed around at least 44 pt practical targets; the primary actions are 54–78 pt tall.
- Color is paired with phase/status text, icon/shape and spatial treatment.
- Dynamic Type fallbacks are documented: paired elements stack, editorial/immersive spatial relationships linearize, and Guardrail retains “applies throughout” semantics.
- VoiceOver order is explicitly documented per track; Track 3’s decorative background ring is hidden from VoiceOver to avoid duplicate confidence announcements.

This is a rendered design audit, not device certification. Xcode Accessibility Inspector, Larger Text, Bold Text, Increase Contrast, Reduce Transparency, translated strings and device color sampling were not run because no shipping implementation exists.

## Light/dark feasibility

Track 1 has the strongest direct light/dark component parity. Track 2 also translates coherently but needs adaptive editorial layout behavior. Track 3 dark remains primary; mineral light is visually viable but needs the most device/contrast validation.

The Build 84 app remains dark-only in practice: the root forces dark appearance, theme values are fixed, global tint is shared, and UIKit bridges, charts, Briefing, system controls, widgets, Live Activities and Watch still require coordinated appearance work. Home-only light remains Medium complexity; true app-wide light remains High complexity. No theme implementation was made.

## Log translation readiness — next step only

- Track 1: **Strong enough to test next.** Banner, actions, section headings, semantic rows and priority controls carry naturally. Watch card density as Log states multiply.
- Track 2: **Promising enough to test next.** Open history rows and typographic value hierarchy fit Log. Guard against recreating cards for dense evidence states.
- Track 3: **Conditional.** Reuse summary-field and metric primitives selectively; a page-wide immersive geometry could compete with logging and history scanning.

No Log mockup or Log shipping work was created.

## Validation actually run

- Headless Chromium render at 402 × 874 pt and 3× device scale for all six candidates.
- 52-field parity assertion for each candidate: **312/312 comparisons passed; zero mismatches**.
- Confidence-geometry count/value assertions: Track 1 one `79` ring each; Track 2 no visual meter; Track 3 two `79` rings each.
- Visual inspection of all three light/dark pair sheets and all three dark above-fold captures.
- Standalone render and browser validation of the six-variant in-conversation carousel.
- Repository diff/status review confirming only `agent-handoffs` artifacts/backlog/report are changed.

Not run: Xcode build, unit/UI tests, simulator app tour, Accessibility Inspector, Server tests, TestFlight, deployment or production mutation. These are intentionally outside a design-only preview task.

## Shipping isolation and backlog

- No shipping Native source, behavior or canonical projection changed.
- No global token or light-mode implementation changed.
- No Server behavior changed.
- No build number changed and no TestFlight build was created.
- Build 85 Watch work was not touched.
- The durable backlog now says **Home Round 4 — three-track refinement ready for Founder review** and accepts no track.
- The only local-only deliverable is the thread-scoped in-conversation carousel; all durable review artifacts are in the artifact commit above.

Safe next step: Founder review of the six Round 4 candidates and explicit selection, combination or rejection. Stop condition reached after verified publication to `origin/main`.
