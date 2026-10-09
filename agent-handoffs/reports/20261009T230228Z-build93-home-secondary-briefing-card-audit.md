# Build 93 Home secondary briefing card audit

**Task:** `20261009-codex-build93-home-secondary-briefing-card-audit`  
**Staged authority:** `97cbaf2c21e3a9f381750021296c9bf579128f30`  
**Audited Native release candidate:** `9d0a206908fc3c4a64976e9cc3840e23cab0ba55`  
**Audited deployed Server source:** `e03f6768627f49175c476208eca79c99ae3d5ee9`  
**Scope:** read-only source, history, design-acceptance and test-evidence audit. No product source, fixture, release pointer, production data, deployment or TestFlight state changed.

## Decision

The secondary **Midweek Briefing** card is **not an approved redesigned Home component**. It is the pre-redesign `BriefingCardView` composition, lightly adapted to the new appearance by changing its paper and ink color tokens. Its legacy structure remains: `CardContainer`, a separate purple `SectionHeading` eyebrow with `View →`, the generic `brain.head.profile` evidence badge, the older briefing typography hierarchy and a 14 pt card radius.

The primary DEXA tile is the approved redesigned component. It uses `HomeActionBriefingStrip`: the compact 42% tile, `doc.text.fill`, teal semantic treatment, 18 pt radius, title/date stack and one trailing arrow, with no briefing eyebrow.

The current hierarchy is correct and should be preserved:

1. the active event briefing (DEXA) is first and occupies the compact primary slot beside the next-best action;
2. the current cadence briefing (Midweek) follows as a full-width secondary card immediately below;
3. goals and Today's Priorities continue after the briefing stack.

The two-briefing state was **not visually covered or accepted during the locked Home design review**. The accepted Home fixture and Dark/Mineral captures contain exactly one briefing and therefore exercise only the compact primary tile. Server contract tests do cover two simultaneous briefing identities and event-first ordering, but that is behavioral coverage, not visual acceptance of the secondary card.

## Exact runtime trace

### Selection and order are Server-owned

`HomeBriefingService` independently resolves:

- `activeEventSelection` with the event artifact available; and
- `currentCadenceSelection` with the event artifact deliberately removed.

It maps those slots and calls `dedupeHomeBriefingCards([presentedEventBriefing, presentedCadenceBriefing])`. The array is therefore event-first, cadence-second, with first occurrence winning if identities ever collide. For the Founder state in the screenshot, that produces:

| Index | Source slot | Copy | Destination |
|---|---|---|---|
| 0 | active DEXA event | `Event Briefing` / `DEXA Analysis Ready` | exact DEXA briefing artifact |
| 1 | current Midweek cadence | `Midweek Briefing` / `Midweek Briefing Ready` / `Review the week so far.` | exact Midweek briefing artifact |

`HomeBriefingRoutingService` promotes an active event without consuming or replacing the valid cadence selection. Its cadence rules then select the current Midweek artifact for the expected Midweek window. The screenshot's text is fixed Server projection copy from `mapBriefingCard`; Native does not invent or rewrite it.

The Server test `HomeBriefingAvailability.test.js` verifies that an active event and a current cadence briefing remain separate and that the final `briefingCards` order is `[event.id, weekly.id]`. The same slot logic is parameterized for Midweek and Monthly. It also verifies defensive deduplication while preserving event-first order.

### Native preserves the array and the hierarchy

`ProductionDailyDriverAPI.readModel` maps `briefingCards` in received order. It changes only each card's destination to the canonical Native artifact route, `.briefingDetail(briefingId: card.id)`; it does not sort, filter or rewrite card copy.

`HomeView` renders:

- `home.briefingCards.first` through `HomeActionBriefingStrip`; then
- every `home.briefingCards.dropFirst()` through `BriefingCardView` directly below the strip.

This is why DEXA is the compact tile and Midweek is the full-width card. The Founder's preferred placement is deterministic source behavior, not an incidental layout.

Production does not apply the one-card sandbox projection. `HomeViewModel` replaces cards with `latestForHome` only when `appliesSandboxProjections` is true; production retains the Server's multi-card array.

## Component provenance and visual parity

### Primary tile: approved redesign

`HomeActionBriefingStrip` entered with the locked Home redesign at `c4a74ad0855a0500e42a90a81d6f4a871e5cc3c5`. It currently has:

- 58/42 action-to-briefing width split and 104 pt height;
- 18 pt continuous radius;
- `doc.text.fill` inside a teal backplate;
- redesign paper, ink, secondary ink and teal tokens;
- 14 pt heavy title with up to three lines and an 11 pt date;
- a single teal trailing arrow;
- no section eyebrow (`HomeBriefingTileLayout.showsSectionEyebrow == false`);
- stable `home.latestBriefing` accessibility identity and button semantics only when navigable.

The physical-parity correction `49e48f1eab3bc6ff22ca6c4bc24b3a9955b0fcc7` explicitly preserved the tile's dimensions, icon and arrow, removed the redundant purple briefing eyebrow, and allowed realistic Weekly/Midweek titles to occupy three lines. The accepted primary state is visible in the [Dark capture](../artifacts/build87-home-physical-parity-corrections-20261005/screens/home-dark.png) and [Mineral Light capture](../artifacts/build87-home-physical-parity-corrections-20261005/screens/home-light.png).

### Secondary card: legacy composition with token recoloring

`BriefingCardView.swift` originated in `cf00c234beddb97bd93296509a81d646186284b0` and still declares that it mirrors the old web `LatestAnalysisCard.jsx` / `HomeBriefingCardStack`. It was not modified by the locked Home redesign commit.

Its current structure is:

- legacy `CardContainer(padding: .sm)` with 14 pt radius and generic divider;
- legacy `SectionHeading(card.sectionLabel)` with purple accent and a separate `View →` action;
- generic `IconBadge(systemImage: "brain.head.profile", color: .evidence)`;
- legacy `briefingTitle`, `briefingTimestamp`, `briefingPrompt` and `briefingViewLink` tokens;
- title and timestamp sharing one horizontal row;
- whole-card button behavior when a destination exists;
- combined accessibility children, unique `home.briefing.<artifact-id>` identity and conditional button trait.

The entire diff from its original import to `9d0a2069` consists of:

- the unique older-card accessibility identifier added in `b1488c2ef0e63f7886342913d9735136dd3b12fb`; and
- paper/title/timestamp/prompt colors switched to redesign tokens in `33f27e865ad215bb3852c26f802e7bce052beed4`.

No structural redesign replaced the eyebrow, icon, geometry, typography relationship or action treatment. The typography tokens do scale via the shared `@ScaledMetric` modifier, but this card has no accepted large-Dynamic-Type layout adaptation for its title/date HStack.

## Acceptance and coverage audit

### What was accepted

- The Batch 1 Home report says the Dark and Mineral captures were explicitly approved after final Founder corrections.
- The Batch 1 parity matrix describes one action/briefing treatment and the explicit removal of the redundant purple briefing eyebrow.
- The Build 87 physical-parity report verifies the compact tile with realistic long Weekly copy in Dark and Mineral Light.
- The bundled `HomeRedesignReviewFixture.json` contains exactly one `briefingCards` entry. `HomeReadModelTests.testRedesignReviewFixturePreservesLockedHomeInformationContract` explicitly asserts `briefingCards.count == 1`.

Those artifacts validate the primary tile only.

### What was not accepted

No grounded design artifact, Founder acceptance capture or UI test was found that renders an event briefing and cadence briefing together on Home. In particular:

- the authoritative redesign-completeness audit classifies `BriefingCardView` for cards at index ≥1 as **Class D / legacy**, with Dark and Mineral marked token-adapted rather than redesigned and physical acceptance `n/a`;
- the Briefings redesign report explicitly says, “No Home changes. The accepted Home Latest Briefing strip and older-card behavior are untouched”;
- the final redesign closeout keeps H05, “Additional-goal, no-goal and older-briefing states,” at **PARTIAL** and directs those still-emitted internals onto the accepted Home family while preserving content and behavior;
- `BriefingReadModelTests.testHomeBriefingCardSharesExactIdentityWithHistoryAndDetail` checks only `briefingCards.first` under the sandbox one-card projection;
- the approved Build 93 twelve-test UI matrix covers Home priority layout/Dynamic Type, Morning/DEXA routes, Logger, widget, root navigation and Recovery, but includes no two-briefing Home visual test.

The Build 93 release gates remain valid for their approved scope; they should not be retroactively described as visual acceptance of this unexercised state.

## Recommended visual correction — preserve placement and behavior

Use the existing accepted Home visual grammar to restyle the full-width secondary card. Do not change Server selection, array order, copy, destination, event relevance, cadence windows or the card's position.

Recommended minimal translation:

1. Keep the full-width card directly below `HomeActionBriefingStrip`; do not collapse it into the primary row and do not drop it.
2. Replace the legacy `CardContainer` / `SectionHeading` composition with a supporting briefing card using the primary tile's 18 pt radius, redesign paper/ink/secondary-ink and teal semantic edge/action treatment.
3. Replace the generic brain/evidence badge with the accepted `doc.text.fill` briefing icon and teal backplate so both cards read as one family.
4. Preserve “Midweek Briefing” as cadence information, but render it as a quiet inline micro-label within the card rather than the detached purple legacy section heading.
5. Keep `Midweek Briefing Ready`, `Review the week so far.` and the Server timestamp unchanged. Stack cadence, title, prompt and date so title/date do not compete in one HStack at large text sizes.
6. Use one teal trailing chevron/arrow and retain the entire card as the tap target; remove the redundant separate `View →` affordance.
7. Retain the exact `.briefingDetail(briefingId:)` navigation and unique `home.briefing.<id>` identity. Add an explicit accessibility label/hint with cadence, title, prompt and date in a stable reading order; keep button semantics conditional on a destination.
8. Verify Dark and Mineral Light, accessibility Dynamic Type, VoiceOver reading order, Reduce Motion neutrality, long localization/copy, and 2+ secondary cards. The full-width hierarchy and Server order must not change.

This is a translation onto an already accepted family, not a new design concept. If the Founder wants to approve the precise cadence-label weight or icon before implementation, that can be done from one bounded two-state comparison; no broader Home redesign is needed.

## Proposed implementation and verification envelope (not executed)

The smallest safe future candidate should be Native-only and limited to the secondary Home briefing presentation plus focused fixtures/tests:

- add a source-shaped Home review fixture containing DEXA first and Midweek second;
- unit-test production decoding preserves both order and exact artifact destinations;
- unit-test the secondary card's unique accessibility identity and copy/date presentation;
- UI-test the two-briefing Home state in Dark and Mineral Light;
- repeat that state at an accessibility Dynamic Type size and assert no overlap/truncation and a full-card effective tap target;
- tap the secondary card and verify the exact Midweek artifact opens while the primary DEXA route remains unchanged;
- run the focused Home/unit tests and a generic Release compile; no Server deployment or data write is required.

Rollback is one Native presentation commit: revert the supporting-card restyle. Because the recommendation does not touch the payload, Server ordering, artifact identity or destination mapping, rollback restores the current visual only and cannot change Founder briefing data.

## Audit result

`PLACEMENT_PRESERVE` · `EVENT_FIRST_ORDER_VERIFIED` · `SECONDARY_IS_LEGACY_STRUCTURE` · `TOKEN_RECOLOR_ONLY` · `TWO_BRIEFING_VISUAL_ACCEPTANCE_ABSENT` · `SERVER_BEHAVIOR_TESTED` · `NATIVE_VISUAL_COVERAGE_GAP` · `NO_IMPLEMENTATION` · `NO_PRODUCTION_WRITE` · `NO_RELEASE_CHANGE`
