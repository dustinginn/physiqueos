# Confidence V2 Explanation and Briefing Narrative Audit

Status: Founder review required before semantic implementation

Audit date: September 9, 2026

Production owner: `user_founder_001`

Production mutation performed: **none**

## Executive answer

### Why is the accepted August Monthly Confidence 62 / Moderate?

PI's accepted assessment is internally coherent. Build Lean Mass remained feasible and on its expected trajectory, Training progression was supportive across two independent weekly periods, and the overall evidence quality was adequate. Those facts justify retaining a Moderate assessment rather than treating the outlook as weak or deteriorating.

Confidence did not rise because the evidence did not become materially more conclusive. Agreement remained mixed, the Energy strategy was still being calibrated, Recovery evidence was insufficient, active guardrails still required observation, and the August 15 DEXA was a useful baseline rather than durable confirmation of the desired lean-mass outcome. Weight was present as monitoring context; Progress Photos did not enter the corrected Monthly Confidence descriptor set and therefore must not be described as a factor that moved or determined the score.

Confidence did not fall because the objective remained feasible, trajectory remained on path, evidence quality was adequate, repeated Training support remained intact, and no material contradiction was present. The correct movement was therefore `no_meaningful_change`, preserving the Weekly predecessor's 62 at 62.

The next evidence capable of materially resolving the principal uncertainty is a consistently prepared follow-up DEXA. It can compare the current lean-mass result with the August 15 starting baseline and test whether the response is durable while the body-fat/rate-of-gain guardrail remains under observation.

The live current snapshot on September 9 is a later Midweek assessment and is also 62 / Moderate. This audit uses the corrected August Monthly assessment for the requested narrative review while preserving the distinction between the historical Monthly artifact and today's current snapshot.

## Exact source and production lineage

| Item | Verified value |
| --- | --- |
| DigitalOcean app | `bf57cf56-48cc-4cd6-90e4-a23ee5381741` (`physiqueos-foundation-staging`) |
| Primary production origin | `https://physiqueos.dustinginn.com` |
| Active deployment | `7ed22d66-2a46-4707-b7fe-d2915376f21e` |
| Web source | `0259133ffd0b9638b915154c4226d884aded3e96` |
| Worker source | `0259133ffd0b9638b915154c4226d884aded3e96` |
| Maintained branch | `origin/combined-app-platform-cutover` |
| Audit parent | `0259133ffd0b9638b915154c4226d884aded3e96` |
| Audit branch | `audit/confidence-explanation-v2-20260909` |
| Fresh worktree | `C:\Users\dusti\Documents\GitHub\physiqueos\.worktrees\confidence-explanation-v2-20260909` |

`origin/combined-app-platform-cutover` and the audit worktree were both at the exact production source when the audit began. The current source includes the Nutrition, Training Logger/Library, DEXA correctness, app-wide performance, and Training identity reconciliation commits. No newer Native commit was present after the Training reconciliation parent. The separate dirty WP2-C checkout was not used or changed.

The app spec still carries stale `PHYSIQUEOS_GIT_SHA`/build metadata from an older manual-weight deployment. That is already-listed operations debt and is not treated as source authority; the DigitalOcean deployment component source above is the authoritative deployed commit.

## Read-only production facts

The corrected Monthly assessment is:

- assessment: `confidence_assessment_v2|47b1e317da1282b9b38e01843830ad71e1627ef1d6940635e9282f601006077e`
- artifact: `monthly_briefing_user_founder_001_202608`
- window: August 1–31, 2026, cutoff September 1 at `06:59:59.999Z`
- predecessor: `confidence_assessment_v2|6e1c1ad71c5c238565f0d8b1ae36ae46d0aadbe0a50110c06afdbec8b36ddd47`
- score: 62 → 62
- band: Moderate
- forecast: `forecast_uncertain`, direction `indeterminate`
- movement: `no_meaningful_change`, magnitude `none`
- semantic factors: trajectory on expected path, objective feasible, evidence quality adequate; agreement mixed, guardrails watched, strategy still calibrating
- durability: Training support repeated across two independent weekly periods; contradiction state `none`
- material uncertainties: direct outcome measurement pending, Energy calibration uncertain, Recovery evidence missing, and incomplete guardrail semantics
- next decisive evidence: `dexa_body_composition`, expected event `dexa_scan`, decision boundary the lean-mass objective
- corrected normalized inputs: 5 descriptors, 185 dependencies, 126 source evidence references

The defective 57 / Developing records remain in audit history and are not current. The current live snapshot is the September 6–8 Midweek assessment `confidence_assessment_v2|ca5f1613321217ec7a47c654d74f42c47672d7ec7e46c5841f863f315113ce4a`, also 62 / Moderate.

## Confidence surface inventory

| Surface | Route | Current display | Score source | Explanation source | Factor metadata available to renderer | Audit result |
| --- | --- | --- | --- | --- | --- | --- |
| Home Confidence card | `/` | ring with current score; tap opens detail | current canonical user-facing assessment, including prior-phase carry-forward rules | shared `buildConfidenceExplanationDetail`, presentation-generated from a subset of the canonical assessment | canonical metadata exists, but the adapter consumes movement, a raw narrative sentence, three uncertainty kinds, and DEXA next evidence only | incomplete explanation |
| Home Confidence detail | client-local sheet on `/` | band plus support/limit/next groups | same assessment as Home | presentation adapter | yes upstream; incompletely projected | primary audit target |
| Goals landing | `/goals` | `62% confidence` on active Goal | current canonical assessment | not shown | explanation exists in the read model but is discarded by the card | incomplete depth |
| Active Build Lean Mass Goal | `/goals/build-lean-mass` | `62% confidence · Moderate` | current canonical assessment | not rendered; service carries only the raw explanation string | rich canonical fields are not passed to a detail treatment | incomplete depth |
| Completed Visible Abs Goal | `/goals/visible-abs` | no historical Confidence | none | none | none | no current defect; a product decision is required before adding historical Confidence |
| Daily Briefing | `/briefing/daily` | current score, movement, one reason | latest canonical assessment; Daily is not a publisher | raw canonical published explanation | full current presentation object is present, but the screen shows one sentence | leaks generic/internal phrasing and omits factors |
| Weekly Briefing | `/briefings/weekly`, historical `/briefings/review/:id` | score, band, movement, one headline | artifact-scoped canonical assessment | `BriefingConfidenceAnchor` renders `primaryReason` | stored `supportingReasons`, `limitingReasons`, unresolved uncertainty and provenance are available but ignored | incomplete explanation |
| Midweek Briefing | historical `/briefings/review/:id` | score, band, movement, one headline | artifact-scoped canonical assessment | same anchor; known internal phrase replacement only | same as Weekly | incomplete and cadence nuance underused |
| Monthly Briefing | `/briefings/monthly/:artifactId` | score, band, movement, one headline in premium Hero | persisted artifact-scoped canonical assessment | same anchor | corrected artifact carries structured assessment/driver lineage, but premium presentation displays only the generic headline | most visible narrative gap |
| DEXA Event Briefing | `/briefings/dexa/:scanId`, historical review | event-scoped score, band, movement, headline | DEXA event assessment at its cutoff | same anchor | stored support/limit/uncertainty and DEXA identity are available but ignored by the anchor | incomplete event explanation |
| Photo Event Briefing | `/briefings/photo/:sessionId`, historical review | no Confidence UI | matched-only historical Confidence when available | not rendered | Aug 22 matched-only block exists, but support/limit/explanation fields are empty because the binding was built without its narrative assessment | temporal semantics correct; presentation absent |
| Briefing History cards | `/briefings/review` | no Confidence | none on list card | none | artifact data exists after navigation | acceptable unless the Founder requests summary Confidence on history cards |
| Goal progress/trajectory | active Goal page and Home Hero | score/band only outside Home detail | current canonical assessment | none | upstream metadata exists | intermediate explanation missing |
| Operating Plan / Strategy | `/profile/operating-plan` and nested Strategy routes | no Confidence | none | none | none | no Confidence surface discovered |
| You | `/profile` | no direct Confidence explanation | none | none | none | no Confidence surface discovered |

The codebase also contains preview/lab Confidence displays. They are not production Founder authority and are excluded from semantic acceptance.

## Canonical explanation inventory

### Persisted canonical truth

`canonical_confidence_assessment_v2` persists the following explanation-capable truth:

| Field | Meaning and use |
| --- | --- |
| `currentPercentage`, `priorPercentage`, `confidenceBand` | numeric result, predecessor result, and semantic band |
| `forecastStatus`, `forecastDirection` | semantic Goal outlook and direction |
| `movement`, `movementMagnitude` | canonical assessment transition |
| `priorAssessmentId` | exact predecessor identity |
| `forecastExplanationLineage.primarySupportingFactors` | canonical factor codes that support the assessment |
| `forecastExplanationLineage.primaryLimitingFactors` | canonical factor codes that limit the assessment |
| `forecastExplanationLineage.remainingUncertaintyKinds` | canonical uncertainty categories |
| `forecastExplanationLineage.movementRationale` | why semantic movement was or was not found |
| `narrativeExplanation` | publication-time prose plus movement/band rationale metadata; historical compatibility truth, not the only possible presentation |
| `remainingUncertainty.items` | kind, cause, question, materiality, reducibility, and affected conclusion lineage in the original forecast |
| `nextConfidenceBuildingEvidence` | status, capability, event type, uncertainty references, decision boundary, expected window, and why it is decisive |
| `evidenceDurability` | persistence, transition, contradiction state, independent periods, triggering/corroborating capabilities, named/reduced uncertainties, and signal lineage |
| `movementAudit` | bounded target, final delta, movement reason, cadence cap, durability inputs, and proxy-movement decision |
| `evidenceWindowId`, `sourceCutoff`, `publisherType`, `briefingArtifactId` | chronology and origin |
| `goalId`, `phaseId`, `goalContract`, `strategyRevision` | Goal/Phase/strategy scope |
| `sourceLineage.confidenceExplanationDrivers` | normalized strengthened/limited/changed/next driver snapshot added by the correction path |
| `sourceLineage.evidenceNormalization` | corrected Monthly descriptor capabilities, strengths, agreement, limitations, counts, and dependency fingerprint |
| `semanticContinuityFingerprint`, `reproducibility` | input/engine fingerprints sufficient to audit lineage and prevent accidental reinterpretation |
| `replacementLineage`, `idempotencyKey` | correction and publication ordering |

### Deterministically derivable

- numeric delta and movement label
- score/band headline
- factor category and safe Founder-facing wording from known factor/uncertainty codes
- whether a factor is supportive, limiting, contradictory, or merely uncertain
- whether an event assessment is current, historical, or matched-only
- a bounded priority order based on materiality, decision boundary, durability, and directness
- cadence-specific emphasis that does not change semantics
- the statement that 62 held because no material semantic transition occurred
- the statement that a follow-up DEXA matters because it targets the lean-mass objective's measurement uncertainty

### Presentation-only

- headings such as “What supports Confidence”
- sentence construction, compression, ordering, typography, and disclosure depth
- whether Home shows one sentence while a briefing shows four explanation blocks
- coaching phrasing such as “PI is still learning...”
- explanatory bridges that explicitly say uncertainty is not deterioration

### Missing or incomplete

- factor-level `sourceRefs` are empty in the corrected `confidenceExplanationDrivers`; factor codes are traceable to the assessment but not directly to specific evidence IDs
- there is no explicit persisted `newUncertaintyKeys` set; safe comparison requires predecessor loading and compatibility checks
- quality, agreement, and coverage details are not copied as full top-level objects into every assessment; their aggregate state survives as factor codes/uncertainties
- descriptor contribution roles are not normalized in every historical assessment; the corrected Monthly has the best lineage
- priority/rank is not explicit and must be deterministic, bounded presentation policy
- matched-only Photo binding drops the historical assessment's narrative/factor projection
- `forecast_no_meaningful_change` and `forecast_change_not_material` currently act as overlapping hold rationale vocabulary and need a presentation alias map

The lineage is sufficient to design the shared explanation model. It is not sufficient to claim that every factor has exact evidence-record provenance until source references are populated or deterministically resolved from the persisted interpretation lineage.

## Scoring and explanation call graph

```text
Canonical evidence and Goal/Phase state
  → ProductionConfidenceContextAdapter
      → bounded Evidence Descriptors + canonical Goal Contract
  → BriefingForecastFinalizer
      → InterpretationEngine
          → EvidenceReconciliationService
          → GoalEvaluationService (objective + guardrails)
          → StrategyValidationService
          → InterpretationUncertaintyService
          → EvidenceDurabilityService
      → ForecastEvaluationService
          → semantic forecast status/direction/band
          → supporting/limiting factor codes
          → next decisive evidence
      → ForecastMovementService
          → increase / decrease / no meaningful change
          → durability/contradiction/strategy-boundary rationale
      → NumericConfidenceProjectionService
          → bounded integer score and movement magnitude
      → NarrativeEngine
          → structured translated factors + publication-time prose
      → CanonicalConfidenceAssessmentModel
          → immutable assessment + lineage
      → authorized cadence/event publication
          → history + current snapshot + artifact binding
  → canonical read service
  → shared deterministic explanation adapter (proposed)
  → Home / Goal / Briefing / Event / Native presentation
```

Responsibility boundaries:

- Semantic band: `ForecastEvaluationService`, using objective, guardrail, strategy, agreement, quality, timeline, and material uncertainty.
- Numeric score: `NumericConfidenceProjectionService`, using band targets, predecessor, cadence ceilings, movement, and bounded-window context. Band targets are Very Low 22, Low 34, Developing 47, Moderate 62, High 78, Very High 90.
- Movement: `ForecastMovementService`, using semantic status/band changes, continuity fingerprints, strategy boundaries, durability, contradictions, duplicate evidence, same-period revisions, and uncertainty reduction.
- Explanation metadata: forecast factor codes, remaining uncertainty, next decisive evidence, durability, movement audit, and correction-owned driver lineage.
- Human-readable copy: `NarrativeEngine` at publication and presentation adapters at render. Copy must not become a second scoring engine.

No Founder render route should execute Interpretation, Forecast, Movement, Projection, or Narrative again. Rendering should read a persisted assessment and perform a bounded deterministic projection only.

## Score-to-narrative invariant

Every Founder-facing sentence must meet all of these conditions:

1. It maps to a persisted canonical factor, uncertainty, movement, durability, or next-evidence field.
2. It does not claim score movement from contextual evidence that did not enter the assessment.
3. It uses the assessment's predecessor and evidence cutoff; it does not reconstruct chronology independently.
4. `no_meaningful_change` cannot use strengthening/weakening language except to explain why a potential signal was insufficient to move the assessment.
5. Uncertainty wording cannot imply contradiction or deterioration.
6. Matched-only historical events must say they did not replace the current snapshot.
7. Missing or malformed factor metadata must degrade to a specific honest omission or a bounded “not enough lineage to explain this factor” state, never guessed prose.

## Factor-code dictionary

### Supporting and limiting semantic factors

| Canonical code family | Assessment role | Canonical meaning | Founder-facing translation policy |
| --- | --- | --- | --- |
| `objective_ahead:<id>` | support | required objective ahead of expected result | “The objective is ahead of its expected path.” |
| `objective_feasible:<id>` | support | objective remains attainable under current timeline/strategy | “The objective remains feasible.” |
| `objective_on_track` | historical compatibility support | measured objective consistent with trajectory | “Measured progress is consistent with the expected path.” |
| `objective_uncertain:<id>`, `objective_at_risk:<id>`, `objective_unlikely:<id>` | limit | outcome unresolved, at risk, or unlikely | Distinguish “not yet known” from “off track” and “unlikely.” |
| `guardrails_clear` | support | all evaluated guardrails clear | “The accepted boundaries remain clear.” |
| `guardrails_watch` | limit/monitor | a boundary requires observation, not a violation | “A guardrail still needs monitoring.” |
| `guardrails_pressured`, `guardrails_violated` | material limit/contradiction | boundary under pressure or crossed | Use concern language only for the exact canonical state. |
| `strategy_confirmed`, `strategy_directionally_supported` | support | expected responses support strategy | “The strategy is supported” with qualification when directional only. |
| `strategy_still_calibrating` | uncertainty/limit | strategy is not yet decidable | “PI is still learning whether the current strategy is producing the intended rate.” |
| `strategy_mixed`, `strategy_contradicted` | limit/contradiction | support and contradiction coexist, or strategy is contradicted | Explicit conflict language; never reuse for mere missing evidence. |
| `agreement_strong_convergence`, `agreement_moderate_convergence` | support | independent domains point together | “The available evidence points in the same direction.” |
| `agreement_mixed` | uncertainty/limit | signals do not yet converge | “The signals are mixed,” not “progress worsened.” |
| `agreement_conflicting` | contradiction | material conclusions conflict | Explicitly name conflict when source lineage permits. |
| `agreement_insufficient` | coverage/limit | too little comparable evidence to establish agreement | “There is not enough comparable evidence yet.” |
| `quality_robust`, `quality_adequate` | support | evidence is trustworthy/complete enough for the stated level | Translate quality into evidence trustworthiness, not outcome success. |
| `quality_limited`, `quality_insufficient` | coverage/limit | evidence quality cannot support stronger conclusions | State the missing coverage/comparison; do not imply bad progress. |
| `milestone_supported:<id>` | support | a planned checkpoint is supported | Name the checkpoint only when its label is resolved from canonical lineage. |
| `milestone_contradicted:<id>`, `milestone_overdue_unresolved:<id>` | material limit | checkpoint contradicted or overdue | Explicit status with no inferred cause. |
| `timeline_overdue`, `timeline_unknown`, `timeline_not_started` | limit/context | timeline itself constrains assessment | Plain timing language. |
| `attainability_ahead`, `attainability_on_expected_trajectory` | support | quantitative pace is at/above the authorized envelope | “The Goal remains on its expected path.” |
| `attainability_positive_but_behind`, `attainability_stalled`, `attainability_regressing` | limit | pace is below expectation, stalled, or reversing | Use increasingly direct concern language matching state. |
| `attainability_unassessable` and rationale variants | limit/coverage | authorized pace cannot be assessed | “There is not enough comparable outcome evidence to assess pace.” |

### Uncertainty kinds

| Kind | Meaning | Required Founder-facing distinction |
| --- | --- | --- |
| `measurement_pending` | direct outcome measurement absent | “Not confirmed yet,” not “outcome is failing.” |
| `energy_calibration_uncertain` | Energy evidence exists but Goal-relative direction is unresolved | Strategy calibration, not strategy failure. |
| `recovery_evidence_missing` | insufficient Recovery evidence | Evidence limitation, not deteriorating Recovery. |
| `coverage_limited` | incomplete observation window/domain coverage | Incomplete data, not contradiction. |
| `elapsed_time` | insufficient elapsed time | Especially important for Midweek restraint. |
| `comparison_missing` | no valid comparable predecessor | Baseline/first observation language. |
| `execution_ambiguous` | strategy exposure cannot be established | Cannot attribute the outcome to the strategy yet. |
| `attribution` | change exists but cause is unresolved | Avoid causal claims. |
| `measurement_precision` | measurement precision cannot decide the question | Avoid false specificity. |
| `goal_semantics_missing` | configured success/guardrail definition incomplete | Usually fail closed or translate only if Founder-actionable. |
| `unresolved_guardrail_risk` | a boundary question remains open | Monitoring language unless pressured/violated. |
| `signal_conflict` | interpreted conclusions actively conflict | This is contradiction; use conflict language. |

### Movement rationale codes

| Movement code | Direction | Founder-facing meaning |
| --- | --- | --- |
| `forecast_and_band_materially_strengthened` | increase | semantic forecast and band both strengthened |
| `proxy_support_repeated_increase` | increase | support repeated across independent periods and passed all safety gates |
| `proxy_support_sustained_increase` | increase | support remained durable across independent periods |
| `uncertainty_reduced_increase` | increase | a named material uncertainty was safely reduced |
| `forecast_and_band_materially_weakened` | decrease | semantic forecast/band materially weakened |
| `interpretation_semantics_unchanged` / `duplicate_evidence_no_change` | hold | same evidence semantics; no new information |
| `strategy_revision_boundary_hold` | hold | predecessor is across a strategy boundary and cannot support a directional claim |
| `historical_durability_unavailable_hold` | hold | predecessor lacks comparable V2 semantics |
| `material_contradiction_blocks_increase` | hold | support exists but a material contradiction prevents increase |
| `same_period_revision_no_new_durability` | hold | revision is not an independent evidence period |
| `proxy_support_emerging_hold` | hold | positive signal is preliminary/partial-period |
| `forecast_change_not_material` / correction alias `forecast_no_meaningful_change` | hold | differences did not cross the semantic movement boundary |

Magnitude does not independently determine prose. It qualifies a valid increase/decrease; `none` must be used for held assessments.

## Evidence-contribution truth for the corrected Monthly

| Domain | Corrected canonical input | Actual contribution | What Founder copy may say | What it must not say |
| --- | --- | --- | --- | --- |
| Training | moderate strength, supportive; 31 source evidence refs | entered reconciliation; repeated durability across two independent weekly periods; strongest domain support | Training progression repeatedly supported the plan | Training alone proved lean-mass gain or caused a score increase |
| Energy / Nutrition | high strength, indeterminate agreement; 64 refs | entered reconciliation; strategy direction remained unresolved; material calibration uncertainty | Energy data is present, but PI is still learning whether the strategy produces the intended rate | Energy is failing, or Energy strengthened Confidence |
| Weight | moderate strength, indeterminate agreement; 31 refs | entered reconciliation as monitoring/context; did not become a primary supporting factor | Weight helps monitor rate and guardrail context | Weight proves lean-mass progress or moved Confidence |
| DEXA | high strength, indeterminate for Monthly; 1 ref | informs objective/trajectory context and establishes the Aug 15 baseline; next comparable DEXA is decisive | Aug 15 is a useful baseline; a comparable follow-up can confirm durability | Aug 15 alone durably confirmed the Build Lean Mass outcome |
| Photos | absent from the corrected Monthly descriptor set | may remain briefing context but did not determine the corrected Confidence score | Photos can provide visual monitoring context only when the briefing's own provenance supports the statement | Photos raised/held/lowered 62, or directly confirmed lean mass |
| Recovery | insufficient strength, limited quality; 0 source evidence refs and explicit limitations | reduces coverage/quality and produces `recovery_evidence_missing` | Recovery evidence is insufficient | Recovery is poor or worsening |
| Goal trajectory | canonical Goal Contract + quantitative attainability | `attainability_on_expected_trajectory`; objective feasible | Goal remains feasible and on expected path | desired outcome is already confirmed |
| Strategy | canonical strategy hypothesis + descriptor response | `strategy_still_calibrating` | current strategy is still being calibrated | strategy is failing |
| Guardrails | canonical guardrail evaluation | `guardrails_watch`; incomplete guardrail semantics also remain | body-fat/rate-of-gain boundaries remain under observation | guardrail violated or clear |
| Agreement | derived across descriptors | `agreement_mixed` | evidence does not yet point strongly enough in one direction | signals materially conflict |
| Evidence quality | derived across coverage/provenance/time/comparison | `quality_adequate` | evidence is trustworthy enough for Moderate | evidence is robust or directly decisive |

## Why 62 held

The accepted Monthly did not create a semantic transition from its Weekly predecessor:

- forecast status remained `forecast_uncertain`
- band remained Moderate
- objective remained feasible and trajectory stayed on path
- Training support remained repeated, but did not gain a third independent period or a new durable transition
- no named uncertainty was reduced
- agreement remained mixed
- Energy and Recovery limitations remained
- direct outcome measurement remained pending
- contradiction state remained `none`

Therefore an increase would have fabricated a material improvement, while a decrease would have fabricated deterioration. `ForecastMovementService` returned no meaningful change and `NumericConfidenceProjectionService` correctly preserved 62.

## Next-decisive-evidence semantics

PI's next-evidence object is not a generic reminder. It includes the uncertainty being targeted, the evidence capability, expected event type, and decision boundary. For the accepted Monthly:

- capability: `dexa_body_composition`
- event: `dexa_scan`
- uncertainty: direct lean-mass outcome measurement pending
- decision boundary: the Build Lean Mass lean-mass objective
- why decisive: it can resolve the pending objective measurement

A follow-up DEXA is decisive only if preparation and comparison conditions are sufficiently consistent. It can show whether the apparent lean-mass response is durable and whether body fat remains inside the accepted guardrail. Weight, photos, routine Nutrition, and routine Recovery records remain useful inputs, but they are not interchangeable with that outcome test.

## Current-copy defects

1. **Held assessments lose their support on Home.** `buildConfidenceExplanationDetail` derives support from movement rationale. A 62→62 hold therefore often produces an empty “What supports Confidence” list even though trajectory, feasibility, quality, and Training durability are canonical.
2. **Briefings flatten rich reasoning to one generic sentence.** Weekly, Midweek, Monthly, and DEXA all use `BriefingConfidenceAnchor`, which ignores stored supporting reasons, limiting reasons, unresolved uncertainty, durability, and next evidence.
3. **The Monthly premium narrative does not explain 62.** The strongest briefing layout shows “Moderate / No change” and generic evidence-quality/mixed-signal copy, but does not say Training repeated, why 62 did not rise, why it did not fall, or why the follow-up DEXA matters.
4. **Canonical factor translation has known holes.** `NarrativeTemplates.factorText` does not normalize ID-suffixed objective codes or `attainability_*` codes. Production `confidenceExplanationDrivers.strengthenedBy` consequently contains null text for trajectory and objective feasibility.
5. **Home infers a capability from prose.** Training/Nutrition/Weight/Recovery/Activity support is detected by keyword scanning the narrative sentence instead of consuming structured factor and durability codes.
6. **Uncertainty translation is incomplete.** Home translates only `measurement_pending`, `energy_calibration_uncertain`, and `recovery_evidence_missing`; it silently drops coverage, elapsed time, comparison, attribution, execution ambiguity, guardrail risk, and conflict.
7. **Daily can expose internal phrasing.** It displays the raw canonical sentence and does not consistently apply the known prose translation used by briefing anchors.
8. **Goal surfaces discard available explanation.** Goals and active Goal show score/band only even though their read path has canonical explanation data.
9. **Photo Event Confidence is invisible.** The Aug 22 artifact is correctly matched-only and correctly did not update the snapshot, but the screen does not render the historical Confidence context.
10. **Matched-only Photo projection loses explanation metadata.** The binding calls the V2 block builder without a narrative assessment, producing null `primaryReason` and empty factor arrays.
11. **Factor-to-evidence trace is incomplete.** Corrected driver `sourceRefs` are empty. The adapter must not pretend a precise record caused a factor until that lineage is populated or resolved safely.
12. **The current invariant equates canonical prose with presentation prose.** `CanonicalConfidencePresentationInvariant` requires `primaryReason` and `presentationExplanation` to be identical. A richer deterministic presentation cannot safely evolve until the invariant validates semantic equivalence rather than literal string identity.
13. **Movement rationale vocabulary is duplicated.** Corrected source lineage uses `forecast_no_meaningful_change`, while the assessment narrative uses `forecast_change_not_material`. The presentation layer needs an explicit alias, not string guessing.
14. **Historical 57 copy is dangerous if selected by ID without authority checks.** The records are intentionally retained, so every current read must continue honoring snapshot and replacement ordering rather than choosing an arbitrary latest row with the Monthly artifact ID.

## Proposed shared explanation model

The recommended model is a read-time deterministic projection from the persisted canonical assessment. It does not rerun PI and does not persist arbitrary replacement prose as new canonical truth.

```js
{
  schemaVersion: "confidence_explanation_presentation_v1",
  assessment: {
    id, goalId, phaseId, publisherType, artifactId,
    sourceCutoff, evidenceWindowId,
    historical, matchedOnly, authoritativeSnapshotChanged
  },
  score: { current, prior, band },
  headline,
  summary,
  supportingFactors: [{
    code, role, text, priority, sourceRefs, lineageStatus
  }],
  limitingFactors: [{
    code, kind, text, priority, materiality,
    uncertaintyRefs, sourceRefs, isContradiction
  }],
  movementExplanation: {
    direction, magnitude, rationaleCode,
    prior, current, text
  },
  nextDecisiveEvidence: [{
    capability, eventType, decisionBoundary,
    uncertaintyRefs, expectedWindow, text
  }],
  evidenceContextNote,
  degradation: { status, missingLineage }
}
```

Projection rules:

- consume `forecastExplanationLineage`, `remainingUncertainty`, `evidenceDurability`, `movementAudit`, `nextConfidenceBuildingEvidence`, and correction-owned drivers directly
- normalize dynamic factor suffixes without losing the full canonical code
- rank direct objective/guardrail/contradiction factors above general quality context
- treat durability as explanation of support persistence, not automatically as movement
- retain an explicit `isContradiction` boundary
- retain event chronology and matched-only status in the DTO
- fail closed when source lineage is unavailable
- expose one DTO to web and Native; let surfaces choose depth, not semantics

## Proposed representative outputs for Founder review

These are read-only proposed presentations. They have not replaced persisted copy.

### Home concise output

> **62% · Moderate**
>
> The Goal remains feasible and on its expected path. Training is supportive, but Energy calibration, Recovery coverage, and direct body-composition confirmation are not conclusive yet.

Tap-for-detail proposal:

- **What supports Confidence:** Training progression has supported the plan across two independent weekly periods. The objective remains feasible and the Goal remains on its expected path. The available evidence is trustworthy enough for a Moderate assessment.
- **What limits Confidence:** The signals are mixed. PI is still learning whether the Energy strategy is producing the intended rate, and Recovery evidence is insufficient. The body-fat/rate-of-gain guardrail still requires observation. None of those statements means the Goal is deteriorating.
- **What changed:** Nothing material versus the predecessor; Confidence held 62→62.
- **What PI needs next:** A consistently prepared follow-up DEXA can test whether the lean-mass response is durable while the body-fat guardrail remains under observation.

### Monthly premium Confidence section

> **62% · Moderate · No meaningful change**
>
> PI still considers Build Lean Mass feasible and on its expected path. Training progression is the strongest supportive domain signal: it repeated across two independent weekly periods, and the overall evidence quality is adequate.
>
> Confidence held rather than rising because the evidence did not become materially more conclusive. Energy calibration remains uncertain, Recovery evidence remains insufficient, the signals remain mixed, and the August 15 DEXA is a useful starting baseline—not yet durable confirmation of the desired lean-mass outcome. Weight helps monitor the rate; photos may provide briefing context, but neither carried the Confidence assessment as decisive outcome proof.
>
> Confidence did not fall because no material contradiction emerged, the objective remained feasible, and the trajectory remained on path. A consistently prepared follow-up DEXA is the next major test: it can show whether the lean-mass response is durable and whether body fat remains inside the accepted guardrail.

### Weekly explanation for Aug 23–29

> **62% · Moderate · No meaningful change**
>
> Training supported the plan for a second independent week, while the objective remained feasible and the Goal stayed on its expected path. Confidence held because the broader evidence was still mixed: Energy calibration was unresolved, Recovery evidence was limited, and direct body-composition confirmation remained pending. A comparable follow-up DEXA remained the next decisive check.

### DEXA Event explanation for Aug 15

> **59% · Moderate · No meaningful change at this event**
>
> The August 15 DEXA provided trustworthy body-composition evidence, brought the available signals into moderate agreement, and showed measured progress consistent with the expected trajectory. It did not raise Confidence because it established the starting reference for the next decision rather than proving a durable Build Lean Mass response; strategy, guardrails, and Recovery coverage still required observation. This is the assessment matched to the August 15 event, not today's Confidence.

### Photo Event historical-context explanation for Aug 22

> **Historical context · 62% · Moderate**
>
> This Photo Event is paired with the Confidence assessment that existed at its August 22 cutoff. The matched-only event did not publish a successor assessment and did not replace current Confidence. Because the artifact does not retain complete factor lineage for the photos, it should not claim that the photos moved the score.

## Sentence-to-factor mapping

| Proposed sentence or clause | Canonical mapping |
| --- | --- |
| “Goal remains feasible” | `objective_feasible:<objectiveId>` |
| “on its expected path” | `attainability_on_expected_trajectory` |
| “Training ... across two independent weekly periods” | `evidenceDurability.persistence=repeated`, `independentPeriodCount=2`, capability `training_progression`, contradiction `none` |
| “evidence quality is adequate / trustworthy enough for Moderate” | `quality_adequate`, `confidenceBand=moderate` |
| “signals remain mixed” | `agreement_mixed` |
| “Energy calibration remains uncertain” | `remainingUncertainty.kind=energy_calibration_uncertain`, descriptor agreement `indeterminate` |
| “Recovery evidence remains insufficient” | `recovery_evidence_missing`; Recovery descriptor strength `insufficient`, quality `limited` |
| “guardrail requires observation” | `guardrails_watch`; never mapped to `pressured` or `violated` |
| “August 15 DEXA is a starting baseline, not durable confirmation” | Monthly `measurement_pending`, DEXA capability in normalized lineage, next DEXA decision boundary, and no later comparable DEXA in the window |
| “Weight helps monitor the rate” | `body_weight_trend` descriptor with `indeterminate` agreement; no primary support factor |
| “photos may provide briefing context, but did not carry the assessment” | Photo capability absent from corrected Monthly descriptor set |
| “nothing material changed / held 62→62” | prior/current 62, movement `no_meaningful_change`, magnitude `none`, rationale `forecast_change_not_material` |
| “did not fall because no material contradiction emerged” | `evidenceDurability.contradictionState=none`, objective feasible, attainability on path |
| “follow-up DEXA is next major test” | `nextConfidenceBuildingEvidence.evidenceCapability=dexa_body_composition`, `expectedEventType=dexa_scan`, lean-mass objective decision boundary |
| “matched-only event did not replace current Confidence” | Photo `confidenceMode=matched-only`, `authoritativeSnapshotChanged=false`, matched assessment publisher Weekly |

## Historical replay results

Nineteen V2 assessments were enumerated read-only from production.

| Example | Canonical result | Proposed-copy result |
| --- | --- | --- |
| Corrected August Monthly | 62→62, Moderate, no meaningful change | explains support, limits, hold, and next DEXA without movement fabrication |
| Aug 23–29 Weekly predecessor | 62→62, Moderate, no meaningful change | explains second-period Training support while preserving the hold |
| Valid prior increase | Aug 9–15 Weekly, 59→60, small increase | may say Confidence increased because sustained Training support and directionally supported strategy passed the movement gates; it must retain mixed signals and pending direct measurement |
| Valid prior decrease | none found | do not manufacture an example; the 62→57 decreases are defective audit history only |
| Aug 15 DEXA Event | 59→59, Moderate, held | describes trustworthy/on-track event evidence without claiming a current-snapshot replacement |
| Aug 22 Photo Event | matched to Aug 16–22 Weekly at 62, `authoritativeSnapshotChanged=false` | historical-context disclosure only; no photo-caused movement claim |

The historical replay also found duplicate and same-period hold cases. The shared adapter must explain those as “no new independent evidence,” not as stable physiology.

## Score-integrity result

The proposed explanation architecture requires no score, band, movement, predecessor, Goal/Phase chronology, or evidence-window change. The corrected Monthly remains exactly:

- score 62
- band Moderate
- predecessor 62 / Moderate Weekly
- movement no meaningful change
- defective 57 / Developing records retained as non-authoritative audit history

If implementation changes any of those facts, implementation must stop.

## Performance validation and implications

Authenticated read-only custom-domain requests were measured from the running DigitalOcean web component. Each route was fetched twice with a unique audit query and `Cache-Control: no-cache`; elapsed time covers the complete HTML response, not browser hydration. All responses were HTTP 200.

| Surface | First ms | Repeat ms | HTML bytes | Under 3 s |
| --- | ---: | ---: | ---: | --- |
| Home | 1,640 | 1,014 | 63,900 | yes |
| Goals | 1,004 | 850 | 27,791 | yes |
| Active Goal | 427 | 167 | 61,990 | yes |
| Daily | 1,203 | 994 | 14,836 | yes |
| Weekly | 983 | 1,111 | 75,566 | yes |
| Midweek | 188 | 132 | 64,812 | yes |
| Monthly | 233 | 200 | 97,971 | yes |
| DEXA Event | 449 | 354 | 133,587 | yes |
| Photo Event | 281 | 292 | 58,617 | yes |
| Briefing History | 1,212 | 764 | 56,508 | yes |
| Operating Plan | 264 | 71 | 57,615 | yes |
| Home Confidence detail | 0 added backend requests | client-local | no added response | yes by construction |

The proposed adapter should be a pure bounded projection over an assessment already loaded by the route. It should add no provider read, no PI rerun, no server-component waterfall, and only a small bounded serialized factor DTO. Request-local memoization may deduplicate the projection if a page renders the same assessment more than once; no long-lived cache is required.

## Native and API implications

The application has an internal `confidence.v1` read model backed by `resolveActiveGoalConfidencePresentation`, but no current public Native Confidence route was discovered under `/api/v1/native`. Native Weight APIs and sandbox APIs remain separate.

Recommended post-approval contract:

- expose the same versioned explanation DTO produced for web
- return canonical IDs, cutoff, historical/matched-only flags, and bounded structured factors
- keep copy projection server-owned or contract-owned; do not reproduce factor interpretation or movement logic in Swift
- permit Native to choose layout depth while preserving text/semantic roles
- scope every read to the authenticated owner and existing Founder/sandbox authority boundary
- add no sandbox data mutation and no cross-owner fallback

The audit made no Native, sandbox, auth, worker, Weight, outbox, or API-integration change.

## Founder decisions required

Implementation should not begin until the Founder decides:

1. Approve or revise the proposed four-question explanation model: support, limits, movement, next decisive evidence.
2. Approve the Home one-sentence compression and tap-for-detail depth.
3. Approve the Monthly premium wording, especially the distinction between Training support, Weight monitoring, and Photo context that did not enter the corrected descriptor set.
4. Approve explicit “did not rise” and “did not fall” paragraphs for held Monthly assessments.
5. Approve the DEXA Event historical disclaimer and the Photo Event matched-only disclaimer.
6. Decide whether active Goal detail should add an intermediate explanation section now or only link to the shared detail.
7. Decide whether completed Goals and Briefing History cards should remain free of Confidence or show explicitly historical summaries.
8. Decide whether `goal_semantics_missing` should remain hidden when not Founder-actionable or appear as a plain-language “some guardrail thresholds are not fully specified” note.
9. Approve fail-closed behavior when factor-level source references are missing.
10. Approve a source-owned artifact correction only if changing persisted historical briefing copy is desired; otherwise prefer render-time deterministic projection while preserving immutable artifacts.

## Implementation after approval

Recommended narrow batches:

1. Add one shared typed explanation projection and complete code/uncertainty translation, including dynamic objective/attainability codes and rationale aliases.
2. Make canonical assessment readers expose all required structured fields without extra provider reads.
3. Replace Home's movement/prose keyword inference with structured factors and durability.
4. Integrate the shared model into Weekly, Midweek, Monthly, and DEXA briefing treatments with cadence-specific depth only.
5. Add Goal-detail presentation and explicit Photo matched-only historical context.
6. Version the DTO for future Native consumption without duplicating reasoning.
7. Add semantic regression coverage for held/increase/decrease, uncertainty versus contradiction, next evidence, chronology, malformed lineage, and matched-only events.
8. Only if the Founder approves changing already-persisted prose, use the established source-owned correction/replacement lifecycle. Never append a fake successor assessment merely to change words.

Post-approval validation should include focused Confidence, Home, Goal, Weekly, Midweek, Monthly, DEXA Event, Photo Event, Phase 3/4/5, migration safety, production build, ESLint, `git diff --check`, focused secret scan, deployed custom-domain timings, and Native isolation checks.

## Audit-stage validation and change scope

Completed in this audit stage:

- verified the exact active DigitalOcean deployment and source parent
- fetched and verified maintained-branch ancestry
- preserved the ongoing Native and unrelated WP2-C workstreams
- enumerated production Confidence surfaces and source call paths
- inspected all canonical assessment/explanation fields and factor generation
- replayed all 19 persisted V2 production assessments read-only
- inspected corrected Monthly normalization lineage and event bindings read-only
- benchmarked 11 authenticated custom-domain routes plus the client-local detail interaction
- confirmed no database pool wait during the production state audit
- created this documentation-only review artifact

Focused baseline test run on the exact production parent:

- 10 Confidence/narrative/Home/briefing/event files executed
- 8 files passed; 88 of 91 tests passed
- `NarrativeEngine.test.js` has two parent-baseline expectation failures because the current engine now emits `attainability_quantitative_progress_unavailable` and selects `monitor_closely` where the older tests expect no limiting factor and `stay_the_course`
- `confidenceExplanationPresentation.test.js` has one environment-dependent failure because the clean worktree does not contain untracked `private/founder/runtime-store.json`
- this documentation-only artifact cannot cause any of those failures; no test was weakened or changed

Not performed by design:

- no score change
- no canonical assessment or briefing mutation
- no historical regeneration
- no source implementation
- no deployment or maintained-branch push
- no Native/sandbox write
- no paid service or infrastructure change

Incremental infrastructure cost: **$0**.
