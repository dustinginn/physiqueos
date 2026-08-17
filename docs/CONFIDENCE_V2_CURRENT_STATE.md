# Confidence V2 current state

Status: authoritative production architecture  
Effective: 2026-08-03  
Supersedes: pre-deployment Confidence V2 architecture and cutover instructions

## Architecture

Confidence follows one canonical pipeline:

`Goal Contract -> Interpretation -> Forecast -> Narrative -> numeric projection -> canonical assessment -> authorized publication -> persistence -> current/historical reads -> rendering`

The Goal Contract defines success and guardrails. Interpretation converts evidence into score-free conclusions. Forecast projects the Goal outcome; Narrative explains that projection; the numeric projection is finalized into a canonical assessment. Only an authorized publisher may persist that assessment. Presentation read services supply current or historical canonical state to rendering surfaces; those surfaces do not recalculate or publish Confidence.

Confidence is a conservative ordinal Goal Forecast confidence index: the latest briefing-owned projection of Goal success under the current Strategy, planned timeline, Guardrails, and available evidence. It is not a statistically calibrated probability and it is not merely evidence or model certainty. Forecast owns Goal-outcome status; numeric Confidence remains a bounded projection of Forecast.

For quantitative Goals, the production Goal Contract carries a versioned progress context when canonical lineage can establish it: Goal baseline, current observation, cumulative progress, remaining gap, and phase-boundary progress. Forecast also receives explicit elapsed and remaining runway. An authorized Goal- or phase-owned Expected Trajectory supplies the response envelope. Missing baseline, unclear completion timing, or missing authorized trajectory remains uncertain; the runtime does not substitute the former broad `0 -> full target` optimistic fallback.

Range Guardrails preserve exact lower and upper membership. Deviation magnitude informs Forecast pressure without changing range truth. Forecast may expose downstream decision context that distinguishes Strategy adjustment capacity from emerging Goal-review pressure, but it neither chooses a Goal-specific lever nor revises a Goal Contract automatically.

## Publication ownership

The authorized publishers are exactly:

- Goal initialization
- Midweek
- Weekly
- Monthly
- DEXA Event
- Qualifying Photo Event

Daily, Energy, Training, Nutrition, Activity, Weight, Recovery, and raw evidence uploads are non-publishers. They may contribute evidence or narrative context, but they do not create, replace, or append canonical Confidence assessments.

## Canonical consumers

Home, Goals, and Daily consume the active Goal's persisted assessment through `ActiveGoalConfidencePresentationReadService`. Midweek, Weekly, Monthly, DEXA, qualifying Photo Event, and Briefing History consume canonical current or artifact-aligned historical presentation state. Consumers preserve assessment identity, percentage, band, prior percentage, delta, movement, canonical explanation, originating artifact, and source metadata. An absent matching assessment renders unavailable; it never produces a local or cross-Goal fallback.

## The briefing publication invariant

Every Confidence change the user sees must be explainable by a briefing. Briefings publish
user-facing Confidence; Goal initialization is the one documented exception — it seeds an
internal Forecast context for a newly active phase (a Starting Forecast) and must never
silently supersede user-facing Confidence on its own. `ConfidencePublisherRegistry.publishesUserFacingConfidence(publisherType)` encodes this as a denylist (only `goal_initialization` is excluded) rather than an allowlist, so records that predate the registry — no `publisherType` at all — stay trusted as user-facing, and a future briefing type is user-facing by default without a matching code change.

`CanonicalConfidenceReadService.getCurrentUserFacing({ goalId, phaseId })` is the shared
read boundary this guarantees: it prefers the active phase's own canonical pointer when that
pointer is itself user-facing, and otherwise falls back to `getLatestUserFacingConfidence`,
the most recently published user-facing assessment across the whole Goal. In practice this
means a newly active phase that has only had its Starting Forecast so far continues to show
the prior phase's last briefing-published Confidence — Home does not jump to the internal
Forecast value until an actual briefing publishes in the new phase. Nothing about this
selection rewrites or deletes the internal Starting Forecast record; it stays exactly as
persisted and remains directly readable through `getCurrent` by its own phase pointer.

This must hold for an arbitrary Goal, phase, and user, not only the Founder's current
transition — see `src/domain/confidence/ConfidencePublicationInvariant.test.js` and
`src/domain/presentation/coachingLanguageBoundary.test.js` for the generic (non-Founder)
regression coverage. See `docs/PERSONALITY.md`'s "Internal Reasoning vs. User-Facing
Coaching" section for the parallel rule that governs how this Confidence value — and every
other piece of PI reasoning — is described to the user in prose.

## Historical compatibility

`ConfidenceV1CompatibilityAdapter` and `MonthlyPersistedArtifactCompatibilityService` remain supported compatibility boundaries. Persisted V1 history is immutable and remains renderable; migration or re-publication is not required merely to display it.

## Phase Review relationship

The Goal/phase milestone owns Phase Review eligibility. A briefing type is only a carrier for an eligible review and does not own the milestone. The August 15 DEXA Phase Review path is production-ready. No synthetic publication is required to prepare or validate that path.

## Production status

Confidence V2, the phase architecture, and the milestone/eligibility path were deployed by 2026-08-03. Confidence changes from here should be driven by production evidence, not architectural tuning in anticipation of a review.

## Retirement boundaries

- Permanent compatibility: V1 adapters and immutable historical-artifact rendering.
- After August 15 candidates: synthetic August 15 previews, Weekly V4 preview, July Monthly inspector, and transition-only review scaffolding, after production evidence is retained.
- After iOS candidates: web-only compatibility or presentation shims whose consumers have been replaced and verified.
- Dead-code inventory: repository audit findings classified B-E, including old publishers, shadow wrappers, unused finalizer facades, deployment scripts, and cutover manifests.

These are retirement candidates, not authorization to remove them. Retirement requires a separate bounded audit and patch.
