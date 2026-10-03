# PhysiqueOS Home design audit

Date: 2026-10-03
Scope: Design exploration only; no shipping Native or Server implementation change.

## Authority inspected

- Native Build 84 source: `bcd92c74602695766c270fe6af052de45afece4b`
- Build 84 worktree: `dexa-healthkit-native-build84-20261003`
- Build 84 Home composition: `ios/PhysiqueOS/Presentation/Home/HomeView.swift`
- Home components: `HomeHeaderView.swift`, `HomeHeroCardView.swift`, `NextBestActionView.swift`, `BriefingCardView.swift`, `GoalRowView.swift`, `TodaysFocusCardView.swift`, `FocusTileView.swift`
- Shared visual authority: `SharedUI/PhysiqueOSTheme.swift`, `Typography.swift`, `CardContainer.swift`, `SectionHeading.swift`, `IconBadge.swift`, `StatusChip.swift`, `MetricRow.swift`, `ConfidenceRing.swift`
- Navigation authority: `RootTabView.swift`
- Home contract authority: `Contracts/HomeReadModel.swift`

The unchanged Build 84 target was also compiled and rendered on an iPhone 17 Pro simulator at 402 × 874 points. The simulator was disconnected from Founder Production and therefore displayed the checked-in sandbox fixture (`Alex`, `Lean Definition Goal`, older goals). That capture is retained only as Native geometry/rendering evidence. The comparison baseline recreates the same source hierarchy with current production-shaped Founder facts; it does not claim that the disconnected fixture is current Founder data.

## Current Home information contract

In loaded state, Home presents this exact hierarchy:

1. Time-sensitive greeting and Founder name, with a purple terminal period.
2. Conditional last-known-data notice.
3. Trajectory hero: section label, goal label, phase/headline, timeline/state, support line, confidence control, and optional projected-finish/days-remaining metrics.
4. One full-width next-best action.
5. Zero or more briefing cards: section label, View affordance, title, date, prompt.
6. Goals card. Founder Production currently uses the phase-trajectory form: Primary Goal, goal title, destination/target, every phase with status/timing/progress, and guardrail.
7. Conditional notification-disabled notice when a scheduleable priority would otherwise receive a reminder.
8. Today’s Priorities: each item’s title, secondary/schedule detail, status/badge when present, completion state and destination.
9. Five-tab navigation: Home, Goals, Log, Evidence, You.

No exploration removes any of these useful information roles. The Compact and Editorial directions change containment and vertical rhythm; the briefing remains visible and the complete Goal/priority detail remains in the scroll.

## Current palette from code

| Token | Value | Current Home use |
|---|---:|---|
| `background` | `#080D18` | Screen/background and tab field |
| `surfaceElevated` | `#141F31` | Briefing, Goal, priorities and general card surface |
| `trajectorySurface` | `#142D38` | Phase-trajectory hero |
| `surfaceMuted` | `#172235` | Secondary/tinted card content |
| `surfaceAccent` | `#20264A` | Accent-tinted surface |
| `textPrimary` | `#F3F6FB` | Primary text |
| `textSecondary` | `#CBD5E1` | Supporting text |
| `textMuted` | `#9AA8BA` | Dates, captions and low-emphasis metadata |
| `divider` | `#94A3B8` at 18% | Card borders, separators and tracks |
| `accent` | `#8B8CFF` | Brand, CTA, links, selected navigation, labels and some status/progress |
| `confidence` / `chartSuccess` | `#4ADE80` | Confidence and success/active trajectory |
| `chartEvidence` | `#60A5FA` | Evidence semantic |
| `chartEffort` | `#FBBF24` | Effort/completed phase semantic |
| `destructive` | `#EF4444` | Destructive/error semantic |

### Where purple is currently carrying meaning

| Role | Current examples | Audit |
|---|---|---|
| Brand/accent | Founder-name period, section headings, goal eyebrow | Strong and recognizable; preserve in conservative directions. |
| Interactive | Full primary action, View links, chevrons | Clear, but makes brand and interaction indistinguishable. |
| Selected/navigation | Selected Home tab | Works, but adds another default-purple role. |
| Status/progress | Guardrail treatment, session progress, default primary badges | Overloaded: status semantics compete with success/evidence/effort tokens already in the codebase. |
| Decorative/background | Icon badge tints, borders and accent surfaces | Repetition compounds the sense that nearly every emphasis is purple. |

Recommended semantic split for exploration—not an implementation decision:

- Purple: PhysiqueOS brand signature and sparing brand emphasis.
- Blue: navigation and primary interaction where a distinct interactive role improves parsing.
- Cyan/teal: evidence, measurement and informational trajectory context.
- Green: positive/active/on-track state.
- Amber: caution, time sensitivity, completed phase or guardrail attention, based on context.
- Red: destructive/error only.
- Neutral navy/ink: containers and hierarchy.

Color never becomes the only state signal: the screens retain labels such as `On track`, `Complete`, `Active`, `within range`, icons, shapes and progress geometry.

## Current Home typography inventory

The family is Plus Jakarta Sans, which is appropriate and retained in every direction. Current Home styles span too many nearly adjacent sizes and aggressive weights:

| Area | Actual size / weight |
|---|---|
| Header | greeting 17 medium; display name 34 bold |
| Section label | 11 bold, uppercase, 0.12 em tracking |
| Hero | eyebrow 10 heavy; headline 18 heavy; timeline 18 system bold; support 12 medium |
| Hero metrics | label 10 medium; value 14 heavy |
| Confidence | approximately 22 system bold + 8 system bold in a fixed 82 pt ring |
| Primary action | label 17 semibold; icon 16 system semibold; chevron 15 system bold |
| Briefing | link 11 bold; title 16 bold; date 11 semibold; prompt 13 medium |
| Goal compact styles | eyebrow 9 bold; title 15 semibold; range 12 medium; progress 18 bold; progress caption 7 bold; status 13 bold; status detail 9 bold |
| Goal trajectory heading | 20 black; destination/body 14 medium |
| Goal phase card | raw system 11 bold label; 16 heavy title; 10 heavy status; 10 medium timing; 11 bold/medium progress text; 19 system semibold icon |
| Guardrail | raw system 11 bold label; 16 heavy title; 12 semibold support |
| Priority tile | 10.5 semibold label; 10 medium subtitle; 9 heavy badge; raw system 10–11 status variants |
| Home notices/errors | raw system 12–14 semibold |

That is effectively a 7, 8, 9, 10, 10.5, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22 and 34 point scale, with medium, semibold, bold, heavy and black all represented.

### Proposed coherent Home scale

Use Plus Jakarta Sans with five functional text tiers and three primary weights:

- 11 pt / 600–700: eyebrow, status, metadata label.
- 13 pt / 500–600: supporting metadata and captions.
- 15 pt / 500–650: body and actionable row content.
- 18 pt / 650–750: card/hero title.
- 28–32 pt / 700–750: Founder name/display.

Compact may use 10 pt only for nonessential all-caps labels, with an accessibility-size fallback. Avoid new 7–9 pt essential copy. Use 500, 650 and 750 as the ordinary ladder; reserve 800 for rare display emphasis rather than repeating heavy/black across many nested levels.

## Design debt found directly in code

| Finding | Direct evidence | Why it makes polish harder |
|---|---|---|
| Typography fragmentation | `Typography.swift` defines many Home-only near-neighbor sizes; phase cards and notices also use raw `.system(size:)`. | Hierarchy changes require auditing token styles and one-off fonts separately; several raw sizes do not participate in the same scaling model. |
| Very small labels | Goal progress caption is 7 pt; goal/status/focus details range 9–10.5 pt. | Legibility and Dynamic Type resilience are weak, especially on dense cards. |
| Weight inflation | Heavy and black are used for multiple card titles, metric values, status labels and badges. | When almost everything is forceful, genuine hierarchy becomes flatter. |
| Mixed font systems | Plus Jakarta Sans tokens coexist with raw San Francisco `.system` calls in hero, phase cards, icons and notices. | Small visual mismatches accumulate and type audits cannot be completed through one token layer. |
| Spacing is locally encoded | Home stack is 10; cards use 14/16; components add many 2/6/8/10/12/14/15/16 values. | Similar relationships drift and global density adjustments become manual. |
| Radius drift | `CardContainer` 14; phase/guardrail 16; session priority 18; badge/icon 10; capsules elsewhere. | Surface hierarchy is not encoded semantically; nested cards can look equally important. |
| Nested-card vertical waste | Goals card contains 15–16 pt padded phase cards plus 12 pt gaps and a 14 pt guardrail gap. | The full Goal dominates the first scroll even though its model is inherently sequential and could use rows/timeline hierarchy. |
| Purple is the default emphasis | `accent` is used for brand, CTA, links, selected tab, labels, some progress/status and decorative tints. | Semantic parsing is weaker and purple feels more prevalent than the underlying identity requires. |
| Semantic tokens exist but are underused on Home | `chartEvidence`, `chartSuccess`, `chartEffort`, cyan/teal tokens already exist in `PhysiqueOSTheme`. | Home can gain clearer semantics without inventing a decorative rainbow or an unrelated palette. |
| Completion affordance needs a hit-area audit | Focus tiles draw a 22–24 pt visible completion circle. | The surrounding effective hit area is not visually obvious; implementation should guarantee at least 44 × 44 pt. |
| Alignment systems vary | Hero uses free HStack spacing; Goal phases use 42 pt icon columns; priority tiles use different grid/leading geometry. | Cross-section left edges and metadata baselines do not consistently reinforce the overall hierarchy. |
| State-specific Home styles are decentralized | Loading/error/stale/notification notices each introduce raw styling. | Future app-wide polish risks leaving rare but important states visually behind. |

## Exploration measurement

Measured from the rendered 402-point-wide harness, including all content and the tab bar:

| Direction | Full rendered height | Change vs current |
|---|---:|---:|
| Current Build 84 baseline | 1,345 pt | reference |
| Refined Current | 1,262 pt | −83 pt / −6% |
| Restrained Purple | 1,345 pt | 0 pt; palette-only study |
| Compact / Information Efficient | 1,009 pt | −336 pt / −25% |
| Modern Evolution | 1,346 pt | +2 pt / approximately 0% |
| Outside A — Editorial Timeline | 1,283 pt | −62 pt / −5% |
| Outside B — Clinical Daylight | 1,345 pt | 0 pt; alternate-theme study |

The Compact gain comes from one-line greeting, smaller confidence module, 48 pt action, compact briefing disclosure and timeline rows instead of nested phase cards. It does not come from deleting Goal phases, the guardrail, the briefing prompt or priorities. Outside A’s smaller gain is deliberate: it spends some of the recovered card padding on editorial breathing room.

## Accessibility implementation notes

- Above-the-fold exports are exactly 402 × 874 pt at 3× (1206 × 2622 px), matching the iPhone 17 Pro target and safe-area model.
- All proposed tappable rows/actions are designed at 44 pt minimum; completion circles should receive a 44 pt content shape even when the visible glyph is smaller.
- Every semantic color is paired with text/icon/geometry.
- No direction assumes that text will remain fixed at the screenshot size. Compact must switch to vertically expanding layouts at accessibility categories.
- The confidence ring can remain geometrically fixed if it exposes a complete spoken value and the adjacent text carries the same state; otherwise it needs a larger accessibility-size variant.
- Gradients, elevation and card boundaries are supportive—not the sole grouping mechanism.

## Feasibility boundary

These are rendered design studies, not compiled alternative Native screens. The structure is recreated from the real SwiftUI components and read model at the actual device geometry so implementation feasibility can be judged without mutating shipping Home. No direction is accepted or ranked. No Native behavior, Server behavior, API contract, TestFlight build or product identity was changed.
