# Photo Intelligence Founder Case 2 — production-style holistic replay

Status: **HOLISTIC REPLAY — POST-REVEAL**  
Photo event date: 2026-09-19  
Historical Photo Briefing publication cutoff: `2026-09-20T17:51:47.391Z`

This replay does not change the frozen Case 2 blind result. Layer A remains the separately persisted photo-only PI result. Layer B combines it with independent canonical evidence that was both observed no later than the Sep 19 event and available before the actual Sep 20 briefing publication cutoff.

## Independent cutoff verification

The verification used the exact canonical production snapshot and exact stored Sep 19 Photo Event artifact committed from the private read-only production capture at `14deb4c98124c6c6ce043f1a9b90bf674fe8a082`, rather than the prose reveal in the decision.

The canonical records establish:

| Evidence | Observed/measured | Canonically available (`createdAt`) | Last update | Value used | Cutoff result |
|---|---:|---:|---:|---|---|
| Aug 15 DEXA | 2026-08-15 | `2026-08-15T19:00:05.436Z` | `2026-08-15T19:02:52.508Z` | 148.3 lb lean mass; 7.6% body fat | Eligible |
| Sep 12 DEXA | 2026-09-12 | `2026-09-13T02:08:43.147Z` | `2026-09-13T05:51:51.983Z` | 153.3 lb lean mass; 8.1% body fat | Eligible |

The stored Sep 19 Photo Event was generated at `2026-09-20T17:51:47.391Z` and its stored `supportingEvidence` already cites `Latest DEXA: 8.1% body fat`. Both DEXA records therefore satisfy observation-time and knowledge-time eligibility. From Aug 15 to Sep 12, DEXA measured `+5.0 lb` lean mass and a `+0.5` percentage-point body-fat change (7.6% to 8.1%).

This is stronger than relying on the event label “Sep 19”: the photo evidence itself was uploaded/confirmed on Sep 20, and the historical briefing was published on Sep 20. The implementation uses the actual publication timestamp as cutoff while requiring every included observation date to be no later than the Sep 19 photo event.

## Layer A — canonical photo-only result

- Visual observation: subtle upper-body fullness, strongest through the chest, with smaller possible shoulder and arm changes.
- Waist/midsection: broadly stable with no clear visual increase in softness.
- Overall visual magnitude: subtle.
- Visual reliability: moderate.
- Photos do not establish new muscle tissue, body-composition quantities, numerical guardrail compliance, or causation.

The DEXA does not alter any of those fields or raise PI visual confidence.

## Layer B — holistic synthesis

> Encouraging direction: the September photo presents a somewhat fuller chest, shoulders, and arms while your waist remains broadly similar and there is no clear visual increase in midsection softness. That combination is consistent with movement toward Build Lean Mass while respecting the body-fat guardrail, but the visible change is subtle—not enough for photos alone to establish muscle gain or a body-composition change. The arm-position and lighting differences make small upper-body comparisons less certain. Independent evidence converges with that photo-level direction: the September 12, 2026 DEXA measured +5.0 lb of lean-mass change and 8.1% body fat. That strengthens the overall interpretation without making the visual observation more certain: the photos did not measure tissue change, and neither source by itself proves what caused it.

Provenance remains explicit:

- PI observed the visual shape/fullness and waist stability from photos.
- DEXA measured lean mass and body-fat percentage.
- Photo Briefing Intelligence concluded that the independent evidence converges.

Machine artifact:

`agent-handoffs/photo-intelligence/founder-cases/case-2-2026-09-19-HOLISTIC-REPLAY-POST-REVEAL.json`

## Time-causal policy

The integration fails closed when availability is unknown and deterministically excludes:

- evidence canonically created after the briefing cutoff;
- a pre-cutoff measurement uploaded after the cutoff;
- evidence observed after the photo event, even if already available by publication;
- evidence observed after publication.

Convergence is evaluated rather than assumed. Aligned directional signals may strengthen only the holistic interpretation; divergent or mixed photo/measurement directions receive no confidence effect, and no measurement can raise the canonical visual-confidence field.

Existing stored Photo Briefings return before recomputation, preserving historical immutability unless the explicit regeneration path is separately authorized.
