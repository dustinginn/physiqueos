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
