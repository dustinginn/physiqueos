# Interpretation Architecture V2: Canonical Contract and Compatibility Fixtures

> **Superseded historical architecture (deployment completed 2026-08-03).** The authoritative production description is [Confidence V2 current state](./CONFIDENCE_V2_CURRENT_STATE.md). Preserve this design record; do not use its shadow-runtime or pre-deployment language as current operating instructions.

Status: canonical target architecture; isolated shadow runtime implemented  
Scope: architecture, contracts, V1 audit, compatibility fixtures, gaps, and shadow runtime  
Runtime effect: explicit read-only shadow invocation only; no production consumer

## Decision

The canonical Interpretation Engine explains what happened in relation to the
active Goal, its expected trajectory, its current strategy hypothesis, and its
guardrails. It reconciles Goal-aware evidence into structured, score-free
conclusions.

Interpretation does not predict what happens next. It does not calculate Goal
confidence, choose a confidence value, or decide confidence movement. Those are
Forecast responsibilities. Interpretation does not generate coaching or other
user-facing prose. That is a Narrative responsibility.

The permanent boundary is:

```text
Interpretation: What happened, relative to expectations, and what remains unknown?
Forecast:       Given that interpretation, what is likely to happen next?
Narrative:      How should those canonical conclusions be explained to the user?
```

This contract extends the target architecture in
`docs/CONFIDENCE_ARCHITECTURE_V2.md`. It does not replace or modify the current
PI V1 assessment contract.

The complete versioned Goal input consumed by this engine is specified in
`docs/GOAL_CONTRACT_ARCHITECTURE_V2.md`.
Publication of the Forecast produced downstream is governed by
`docs/CONFIDENCE_PUBLICATION_ARCHITECTURE_V2.md`.

## Naming boundary

PhysiqueOS already uses “interpreter” for ingestion services that turn messy
inputs into canonical descriptive evidence, such as photo, PDF, screenshot,
text, and voice interpreters. Those services remain in the Goal-agnostic
Evidence layer.

The canonical Interpretation Engine defined here is a later Goal-aware layer.
It consumes normalized evidence; it does not parse uploads, perform OCR, or
canonicalize source records.

```text
Source interpreter / evidence normalization
  -> descriptive canonical evidence
  -> Goal-aware Interpretation Engine
  -> Structured Interpretation
```

Code and documentation must preserve this distinction even if final service
names use more specific qualifiers.

## Canonical responsibility

Interpretation owns exactly these questions:

- What happened during the applicable observation window?
- Did the observed result match the Goal-owned expected trajectory?
- Did the active strategy hypothesis receive support or contradiction?
- Were every Objective and every Guardrail evaluated independently?
- How strong, relevant, and mutually consistent is the evidence?
- What cannot yet be concluded?
- Which future evidence event is most likely to resolve the important
  uncertainty?

Interpretation may create concise internal diagnostic statements. Those
statements describe a conclusion or uncertainty and are not coaching,
motivation, recommendations, headings, or screen-ready copy.

Interpretation does not own:

- Goal definitions, timelines, Objectives, Guardrails, or success criteria;
- the strategy hypothesis or execution record;
- evidence ingestion, correction, or canonicalization;
- confidence or any other 0–100 score;
- confidence bands, movement, caps, anchors, or forecast probabilities;
- recommendations or strategy changes;
- user-facing coaching or briefing prose;
- persistence, publication, presentation, or rendering.

## Canonical pipeline

```text
Goal Contract
  |
  v
Expected Trajectory
  |
  v
Strategy Hypothesis
  |
  v
Execution State
  |
  v
Goal-agnostic Evidence Descriptors
  |
  v
Evidence Normalization for the evaluation window
  |
  v
Evidence Reconciliation
  |  - Strength
  |  - Goal-derived Relevance
  |  - Agreement with the hypothesis / expectations
  v
Structured Interpretation (score-free)
  |  - Objective Status
  |  - Guardrail Status
  |  - Strategy Validation
  |  - Evidence Agreement and Quality
  |  - Remaining Uncertainty
  |  - Next Decisive Evidence
  v
Forecast Engine
  |
  v
Narrative Engine
  |
  v
Presentation
```

This order is canonical. Forecast must not reach around Structured
Interpretation to reinterpret evidence. Narrative and Presentation must not
reconcile evidence independently.

## Input contract

The future Interpretation Engine receives immutable, cutoff-bounded inputs.
The names below specify semantics, not a runtime schema introduced by this
patch.

| Input | Required content | Owner | Interpretation use |
|---|---|---|---|
| Goal Contract | Goal identity, Objectives, Guardrails, timeline, expected trajectory, success criteria, evidence map | Goal Engine | Defines what matters and what “expected” means. |
| Strategy Hypothesis | Strategy identity/version, intended mechanism, expected signals, falsifiers, calibration state | Strategy Engine | Defines the proposition being evaluated. |
| Execution State | Opportunity, completion, consistency, deviations, quality, and applicable time window | Execution Engine | Distinguishes strategy failure from non-execution or insufficient exposure. |
| Evidence Descriptors | Canonical identity, observation time, measurement capability, quality, uncertainty, provenance, and corrections | Evidence Engine | Supplies descriptive facts without Goal-specific importance. |
| Evaluation Context | cutoff, window, event/cadence context, prior interpretation reference, current time | Interpretation orchestration | Bounds causality, chronology, and comparison. |

Interpretation must fail closed or return an explicit unevaluable result when a
required Goal or strategy semantic is absent. It must not infer those semantics
from a Goal display name, JSX, briefing cadence, or a hard-coded universal
evidence table.

## Structured Interpretation specification

### Canonical output

The following is an implementation-agnostic contract. It intentionally has no
score, probability, forecast band, movement, recommendation, or presentation
copy.

```text
StructuredInterpretation {
  contractVersion
  id
  goalRef { goalId, goalContractVersion }
  strategyRef { strategyId, strategyVersion, hypothesisId }
  evaluationContext {
    type
    windowStart
    evidenceCutoff
    interpretedAt
    priorInterpretationId?
  }

  objectiveEvaluation {
    aggregateStatus
    conclusions[] {
      objectiveId
      status
      expectationRef
      observedResult
      elapsedTimeAdequacy
      evidenceRefs[]
      rationale
    }
  }

  guardrailEvaluation {
    aggregateStatus
    conclusions[] {
      guardrailId
      status
      thresholdRef
      observedResult
      evidenceRefs[]
      rationale
    }
  }

  strategyValidation {
    status
    hypothesisRef
    executionAdequacy
    supportingConclusionRefs[]
    contradictingConclusionRefs[]
    rationale
  }

  evidenceReconciliation {
    items[] {
      evidenceRef
      conclusionRef
      strength
      relevance
      agreement
      temporalApplicability
      independenceGroup?
      limitations[]
    }
    agreementStatus
    quality {
      status
      coverage
      provenanceIntegrity
      temporalAdequacy
      comparisonAdequacy
      limitations[]
      rationale
    }
    reconciledConclusions[]
    contradictions[]
  }

  remainingUncertainty {
    status
    items[] {
      id
      kind
      question
      cause
      affectedConclusionRefs[]
      reducibility
      materiality
      rationale
    }
    summary
  }

  nextDecisiveEvidence {
    status
    evidenceCapability
    expectedEventType
    expectedWindow?
    uncertaintyRefs[]
    decisionBoundary
    whyDecisive
  }

  interpretationSummary {
    outcome
    expectationMatch
    strategyResult
    guardrailResult
    evidenceResult
    uncertaintyResult
  }

  provenance {
    goalContractFingerprint
    strategyFingerprint
    executionRefs[]
    evidenceRefs[]
    sourceObservationIds[]
    sourceClaimIds[]
    inputFingerprint
    engineVersion
  }
}
```

`rationale`, `summary`, and other textual fields are bounded internal semantic
statements. Narrative must translate them rather than render them verbatim.

### Required status vocabularies

#### Objective Status

| Value | Meaning |
|---|---|
| `ahead` | Observed Objective progress is meaningfully ahead of the expected trajectory for elapsed time. |
| `on_track` | Observed Objective progress is consistent with the expected range. |
| `uncertain` | The Objective cannot yet be evaluated reliably. |
| `behind` | Observed Objective progress is below the expected trajectory without directly falsifying it. |
| `contradicted` | Reliable evidence directly conflicts with the Objective’s expected direction or success criteria. |

#### Guardrail Status

| Value | Meaning |
|---|---|
| `clear` | Available relevant evidence shows no meaningful pressure on the Guardrail. |
| `watch` | Early or weak signals warrant observation but do not establish material pressure. |
| `pressured` | Reliable evidence shows the Guardrail approaching or repeatedly challenging its boundary. |
| `violated` | The Goal-owned threshold or categorical safety condition has been crossed. |

#### Strategy Validation

| Value | Meaning |
|---|---|
| `confirmed` | Adequate execution and sufficiently strong, relevant, convergent evidence support the strategy hypothesis across the required window. |
| `directionally_supported` | Evidence points in the hypothesized direction but is not yet sufficient for confirmation. |
| `still_calibrating` | Exposure, elapsed time, execution, or decisive evidence is not yet sufficient to test the hypothesis fairly. |
| `mixed` | Material supporting and contradicting conclusions coexist without a decisive resolution. |
| `contradicted` | Adequate execution and sufficiently strong, relevant evidence oppose a material part of the strategy hypothesis. |

#### Evidence Agreement

| Value | Meaning |
|---|---|
| `strong_convergence` | Multiple materially independent, strong, relevant sources support the same conclusion with no material contradiction. |
| `moderate_convergence` | Relevant sources generally agree, but independence, strength, coverage, or time is bounded. |
| `mixed` | Support and neutral/limiting evidence coexist, or signals vary without direct incompatibility. |
| `conflicting` | Material relevant evidence supports incompatible conclusions. |
| `insufficient` | Too little relevant evidence exists to assess agreement. |

Aggregate Objective status must be derived by a documented Goal Contract rule,
not by averaging Objective statuses. Aggregate Guardrail status is the most
material applicable Guardrail condition; an explicit `violated` result cannot
be averaged away.

## Evidence Reconciliation model

Every evidence-to-conclusion relationship is evaluated along three independent
dimensions. No dimension is a substitute for another, and they must not be
collapsed into one contributor weight or score.

### Evidence Strength

Strength describes how trustworthy the evidence is for the claim it is capable
of making. It is Goal-agnostic. It includes:

- measurement validity and source authority;
- data quality and provenance integrity;
- comparison integrity and repeatability;
- sample size, coverage, and temporal stability;
- known limitations and correction state.

A DEXA may be strong for measured body composition and irrelevant to a Goal
question about a specific skill. A photo may be weaker for precise composition
change but still relevant to a visual Guardrail. Strength alone never determines
importance.

The initial descriptive vocabulary should be `authoritative`, `high`,
`moderate`, `low`, and `insufficient`, with capability-specific criteria owned
by Evidence contracts rather than a global evidence hierarchy.

### Evidence Relevance

Relevance describes how informative the evidence capability is for a specific
Objective, Guardrail, expected trajectory checkpoint, or strategy falsifier.
It is derived from the active Goal Contract and strategy hypothesis.

The initial vocabulary should be `decisive`, `material`, `supporting_context`,
`not_applicable`, and `unknown`. Relevance is evaluated per conclusion, so one
evidence record may be material to a Guardrail and only contextual to an
Objective.

Relevance must never be inferred from evidence type alone or from current Goal
names such as `build_lean_mass`.

### Evidence Agreement

Per-item agreement describes the relationship to the tested expectation or
hypothesis: `supports`, `contradicts`, `neutral`, or `indeterminate`.

Aggregate Evidence Agreement uses the required five-value vocabulary above.
Aggregation must account for:

- shared lineage, so the same source cannot masquerade as corroboration;
- whether sources measure independent capabilities;
- time alignment and applicable evaluation windows;
- the conclusion each source is actually capable of supporting;
- unresolved corrections or superseded records;
- Objective and Guardrail separation.

### Reconciliation order

1. Validate Goal, strategy, execution, cutoff, and evidence identity.
2. Bind each evidence capability to applicable Goal expectations through the
   Goal evidence map.
3. Assess Strength without Goal context.
4. Assess Relevance for each bound Objective, Guardrail, or hypothesis clause.
5. Classify per-item Agreement.
6. Deduplicate shared lineage and group materially dependent signals.
7. Reconcile conclusions inside each Objective and Guardrail independently.
8. Reconcile strategy validation only after checking execution adequacy.
9. Record contradictions without resolving them through a numeric average.
10. Derive aggregate agreement and evidence quality.
11. Identify every material remaining uncertainty.
12. Select the next decisive evidence from the unresolved decision boundary.

No single evidence type dominates universally. A Goal Contract may designate a
capability as decisive for one boundary, but that designation is contextual and
traceable.

## Evidence Quality

Evidence Quality describes whether the available evidence can support the
Structured Interpretation. It is not Goal confidence and is not a disguised
forecast.

It must remain categorical and decomposed. The initial `status` vocabulary is
`robust`, `adequate`, `limited`, and `insufficient`. The object must also expose
coverage, provenance integrity, temporal adequacy, comparison adequacy, and
limitations so a consumer never has to infer why quality is bounded.

High Evidence Quality can coexist with a contradicted strategy. Low Evidence
Quality can coexist with encouraging observations. Neither state determines a
Goal-confidence value.

## Strategy Validation model

Strategy Validation tests the active, versioned hypothesis; it does not grade
the user and is not equivalent to Objective progress.

Evaluation order:

1. Confirm the strategy hypothesis and expected observable signals are present.
2. Evaluate whether adequate opportunity and elapsed time existed.
3. Evaluate execution adequacy separately from outcome.
4. Reconcile observations against the hypothesis and its falsifiers.
5. Preserve material contradictions.
6. Select one of the five canonical states.

Important distinctions:

- Well-executed strategy + weak outcome evidence may be `still_calibrating`.
- Well-executed strategy + conflicting outcomes may be `mixed` or
  `contradicted`.
- Poor execution cannot prove the strategy false; it usually leaves the test
  unevaluable or still calibrating.
- Objective progress can be on track while the current strategy remains only
  directionally supported if causal attribution is weak.
- A strategy may work for the Objective while pressuring a Guardrail.

Interpretation reports these facts. Forecast later decides what they imply for
future Goal success if the strategy continues.

## Objective and Guardrail evaluation

Objectives and Guardrails are parallel, independent evaluation tracks.

```text
                    +-> Objective evaluation ----+
Goal-aware evidence |                            |-> Structured Interpretation
                    +-> Guardrail evaluation ----+
```

Each conclusion must reference its Goal Contract definition, expected window or
threshold, evidence, and rationale. Objective success must never offset,
compensate for, or suppress a Guardrail violation.

Example:

```text
Objective Status: ahead
  Lean-mass response is ahead of the expected checkpoint.

Guardrail Status: violated
  Body-fat increase crossed the Goal-owned maximum boundary.

Strategy Validation: mixed
  The strategy supports the Objective but fails an explicit constraint.
```

The Forecast Engine must receive both conclusions. It may not replace them with
a blended “mostly positive” interpretation.

## Remaining Uncertainty model

Every Structured Interpretation must explicitly state what is not known. An
empty uncertainty set is valid only when all material decision boundaries have
been evaluated with adequate evidence; it must not be the default for missing
data.

Canonical uncertainty kinds should include:

- `elapsed_time`: too little time has passed for the expected adaptation;
- `measurement_pending`: a required objective measurement has not occurred;
- `comparison_missing`: no valid baseline or follow-up exists;
- `coverage_limited`: the observation window is incomplete;
- `execution_ambiguous`: actual exposure to the strategy cannot be established;
- `signal_conflict`: relevant evidence supports incompatible conclusions;
- `attribution`: change occurred but cannot be attributed to the strategy;
- `measurement_precision`: the evidence capability cannot support the desired
  precision;
- `goal_semantics_missing`: a required expectation or boundary is undefined.

Each uncertainty names the affected conclusion, cause, materiality, and whether
future evidence can reduce it. The summary is an internal factual statement,
for example: “Training performance improved, but physiological adaptation
remains unconfirmed.” Narrative owns any eventual user-facing expression.

Interpretation must never convert absence of evidence into evidence of absence.

## Next Decisive Evidence model

`nextDecisiveEvidence` identifies the single future evidence capability or
event most likely to resolve the most material reducible uncertainty. It is an
Interpretation output because selection depends on the reconciled evidence and
the unresolved decision boundary.

Selection priority:

1. The evidence can distinguish between the live competing conclusions.
2. It is relevant to the most material Objective or Guardrail uncertainty.
3. It is feasible within the Goal timeline and evidence cadence.
4. It adds an independent capability rather than duplicating existing lineage.
5. It has sufficient expected Strength for the decision boundary.

Examples include the next DEXA, a valid progress-photo comparison, a sustained
maintenance-weight trend, four additional weeks of training response, or
recovery stabilization. The output specifies why the event is decisive; it
does not tell the user what to do. Forecast may cite it, and Narrative may turn
it into briefing coaching later.

When no feasible evidence can resolve the uncertainty, return `status:
unavailable` with the unresolved boundary. Do not manufacture a next step.

## Interpretation Summary

`interpretationSummary` is a compact internal index of canonical conclusions.
It is designed for deterministic Forecast and Narrative consumption. It must:

- reference detailed conclusion identities rather than replace them;
- distinguish observation, expectation match, strategy result, Guardrail
  result, evidence result, and uncertainty;
- contain no score or probability;
- contain no recommendation, encouragement, celebration, or second-person
  coaching;
- remain independent of cadence and presentation layout.

Forecast consumes the full Structured Interpretation, not only the summary.
Narrative may select from the summary but cannot change the underlying statuses.

## Architectural invariants

Interpretation must never:

- calculate confidence or emit Goal-confidence scores;
- emit forecast probabilities, confidence bands, or confidence movement;
- produce user-facing coaching or presentation copy;
- own or mutate Goal, strategy, execution, or evidence records;
- depend on Goal display names or a closed list of Goal names;
- assume a universal evidence hierarchy;
- collapse Strength, Relevance, and Agreement into one score;
- average away a Guardrail violation;
- depend on JSX, UI components, briefing layouts, or screen routes;
- persist or publish an artifact as a side effect of interpretation.

Forecast must never reinterpret evidence, reclassify Objective or Guardrail
status, or select a different next decisive evidence event from raw evidence.

Narrative must never reconcile evidence, calculate confidence, or revise a
canonical status for editorial convenience.

Presentation must render supplied view models and must not infer physiology,
strategy validation, evidence agreement, or uncertainty.

Only Interpretation owns Goal-aware evidence reconciliation.

## PI V1 current implementation audit

### Executive finding

PI V1 has no single score-free Interpretation boundary. Interpretation is
distributed across evidence/event reasoning services, cadence preparation,
`PIGoalConfidenceContributorMapper`, `PIGoalConfidenceScoringService`, the
assessment model, and Narrative/Presentation services. As a result, evidence
meaning, confidence calculation, and user-facing explanation are coupled.

The current persisted assessment and publication mechanics are strong and must
remain stable during migration. The semantic split, not the durability model,
is the immediate gap.

### Where interpretation occurs

| Current component | Interpretation currently performed | Coupling / limitation |
|---|---|---|
| Source interpreters under `src/domain/interpreters` | Parse photo, PDF, screenshot, text, and voice inputs into evidence | Correctly upstream and mostly Goal-agnostic; this is evidence normalization, not the new Goal-aware engine. |
| PI cadence and shadow reasoning services | Create observations, claims, coverage, limitations, domain states, and editorial candidates for Daily/Midweek/Weekly contexts | Cadence ownership fragments evaluation windows and can leak briefing semantics into reasoning. |
| `PIPhotoConfidenceReasoningService` | Classifies visual evidence as supporting, conflicting, limiting, inconclusive, or neutral; maps it to a Photo status | Regex classification reads narrative text; visual interpretation, Goal-aware guardrail meaning, and confidence vocabulary are coupled. |
| `PIDEXAConfidenceReasoningService` | Classifies DEXA as baseline, confirming, contradicting, or inconclusive | Hard-codes lean/body-fat rules and reads a narrative Guardrail status; evidence capability and Goal-specific meaning are not cleanly separated. |
| `PIGoalConfidenceContributorMapper` | Converts domain states into direction, strength, reason, phase role, authority, and score influence; deduplicates shared lineage | Supports only `build_lean_mass` + `establish_maintenance` + `calibration`; Strength, Relevance, Agreement, copy, and scoring eligibility are bundled. |
| `PIGoalConfidenceScoringService` | Reconciles domains, detects support/conflict, applies authority/completeness rules, chooses uncertainty, primary reason, phase interpretation, and coaching implication | Interpretation and confidence are inseparable; fixed domain points determine both meaning and score. Goal/phase/state are hard-coded. |
| `PIGoalConfidenceAssessmentModel` | Persists contributors, reason, uncertainty, completeness, phase interpretation, coaching implication, and reasoning beside the score | Durable V1 contract mixes interpretation, forecast-like score, and narrative-ready language. |
| `ActiveGoalConfidencePresentationReadService` | Splits contributors by direction and exposes `primaryReason` as explanation | Mostly adaptation, but it treats score-owned V1 reasoning as presentation-ready. Legacy fallback has different semantics. |
| `BriefingGoalConfidencePresentationService` | Bounds reasons and uncertainty; composes Midweek and Monthly explanations from cadence signals and contributor presence | Owns Goal-aware conclusions such as DEXA baseline meaning, training direction, “too soon,” and next DEXA significance. This is presentation-owned reasoning. |
| `MonthlyNarrativeCompositionService` | Independently states baseline versus proof, training significance, early uncertainty, energy/weight balance, and next measurement | Duplicates canonical interpretation inside Monthly editorial composition. |
| `WeeklyNarrativeService` and briefing editorial services | Compose synthesis, uncertainty, Goal meaning, and in some paths completion conclusions | Narrative sometimes interprets evidence directly instead of translating a canonical conclusion. |

### Current PI V1 assessment contract

`PIGoalConfidenceAssessmentModel` defines:

- schema/model version `pi_goal_confidence_assessment_v1`;
- assessment type `goal_progress_confidence`;
- deterministic identity and input fingerprint;
- Goal, phase, operating state, context, evidence cutoff, and PI version;
- `score` with current, band, prior, delta, movement, and prior provenance;
- `primaryReason`;
- contributors with domain, direction, strength, confidence, completeness,
  reason, lineage, affected-score flag, and user-facing flag;
- `unresolvedUncertainty` and `evidenceCompleteness`;
- `phaseAwareInterpretation` and `coachingImplication`;
- reasoning observations/claims, limitations, contradictions, domain
  interpretations, and authoritative measurement;
- canonical evidence and decision-result provenance.

The persisted snapshot/history contract and all consumers of these fields are
V1 compatibility obligations. This patch does not reinterpret or rewrite them.

### Current interpretation-to-score coupling

`PIGoalConfidenceContributorMapper` contains Goal-specific status tables for
Energy, Training, Weight, Photos, DEXA, Recovery, and Protocol. Each table row
simultaneously assigns:

- an agreement-like direction;
- evidence strength;
- a reason string;
- implicit phase relevance;
- whether the contributor influences the score.

`PIGoalConfidenceScoringService` then:

- starts from a 50 calibration anchor;
- maps statuses to fixed points;
- derives corroboration and contradiction adjustments;
- gives DEXA an authority adjustment;
- applies completeness/authority ceilings;
- caps movement by assessment context;
- derives uncertainty from limiting contributors;
- creates the primary reason and coaching implication.

This makes it impossible to consume a canonical score-free interpretation
before scoring. It also treats an evidence domain as a proxy for Goal relevance.

### Goal-specific and evidence-specific assumptions

Current hard-coded assumptions include:

- the only supported boundary is Build Lean Mass / Establish Maintenance /
  Calibration;
- near-maintenance Energy is supporting and persistent deficit is conflicting;
- Training breadth and status have fixed point meanings;
- Weight direction has a fixed meaning modified by Photo softness;
- Photos represent a body-composition Guardrail;
- DEXA is a universal authoritative anchor inside the supported phase;
- Recovery and Protocol are low-weight enabling context;
- evidence completeness produces both direction and points;
- cadence type determines allowable score movement.

These may be valid for the current Founder Goal, but they belong in Goal,
strategy, evidence-capability, Interpretation, or Forecast contracts—not in one
universal confidence mapper.

### Duplicated and presentation-owned reasoning

Examples that require future consolidation include:

- DEXA baseline semantics in DEXA reasoning, the confidence contributor,
  Monthly confidence explanation, and Monthly narrative composition;
- “too early to confirm muscle gain” in Monthly presentation/composition rather
  than a canonical elapsed-time uncertainty;
- Photo softness and Guardrail meaning in Photo reasoning and Weight mapping;
- training constructiveness in cadence PI claims, contributor mapping, score
  reasons, and briefing prose;
- next DEXA/next month significance in presentation copy rather than a canonical
  next-decisive-evidence output;
- evidence conflict in contributor directions, score adjustments, reason
  selection, and narrative synthesis;
- Goal completion conclusions composed directly in Weekly narrative paths.

The target is one Structured Interpretation with deterministic adapters, not
new duplicate reasoning beside the old paths.

## Compatibility inventory

### Boundaries that must remain stable

| Boundary | Current contract | Migration rule |
|---|---|---|
| Assessment object | `pi_goal_confidence_assessment_v1` | Remains byte/semantic compatible until an explicitly versioned Forecast assessment migration. |
| Assessment identity | Deterministic ID over Goal/phase/state/context/cutoff/version/fingerprint | Do not change identity inputs or regenerate history. |
| Current/history storage | `goalConfidenceSnapshots`, `goalConfidenceHistory`, continuity seeds | No schema or persistence change in Interpretation patches. |
| Refresh/publication | `PIGoalConfidenceRefreshService` and prepared atomic publication commands | V2 shadow interpretation cannot write through this boundary. |
| Canonical reads | `PIGoalConfidenceReadService` | Continue returning V1 assessments unchanged. |
| Presentation read | `ActiveGoalConfidencePresentationReadService` plus legacy fallback | Preserve selection, score values, and fallback behavior during shadowing. |
| Briefing capture | V1 assessment-derived immutable confidence blocks | Historical and new V1 artifacts remain unchanged until a separate consumer migration. |
| UI view models | score, band, movement, reasons, uncertainty, assessment identity | No rendering or copy changes in Interpretation work. |

### Existing compatibility fixtures

`src/fixtures/piGoalConfidenceAssessmentFixtures.js` already freezes these V1
contract scenarios:

- initial, increased, held, and decreased assessments;
- strong Training with incomplete Energy;
- persistent deficit with falling Weight;
- near-maintenance with stable Training and Photos;
- improving Training with conflicting Photos;
- isolated PR with limited evidence;
- authoritative DEXA support and contradiction;
- Midweek partial and Weekly closed windows;
- Photo and DEXA events;
- contributor and source-reference ordering variations;
- legacy score-44 prior provenance.

Those fixtures preserve V1 normalization, identity, ordering, lineage, and
score semantics. They are compatibility inputs; they are not examples of the
final V2 Interpretation schema.

### Interpretation outputs already available in V1

| V2 concept | V1 source | Compatibility assessment |
|---|---|---|
| Evidence identity/provenance | contributor evidence refs, observation IDs, claim IDs, assessment provenance | Strong reusable lineage, but relationships to specific Objective/Guardrail conclusions need adapters. |
| Evidence Strength | contributor `strength` and `confidence` | Partially available; currently assigned together with Goal-specific direction. |
| Evidence Agreement | contributor `direction`, contradictions, domain interpretations | Partial proxy; `limiting` conflates quality/coverage with agreement. |
| Evidence Quality | completeness, contributor confidence, limitations | Distributed; no decomposed aggregate quality object. |
| Remaining Uncertainty | `unresolvedUncertainty`, reasoning limitations | Available as strings, usually derived only from limiting contributors. |
| Strategy context | Goal, phase, operating state, PI decision reference | Identity exists; versioned hypothesis and falsifiers do not. |
| Evaluation context | context type, cadence/event/window IDs, cutoff | Strong reusable boundary. |
| Deduplication trace | mapper `merged`/`suppressed` trace during scoring | Useful diagnostic, not persisted as the full reconciliation model. |

### Outputs requiring adapters or new Goal semantics

- per-Objective and aggregate Objective Status;
- per-Guardrail and aggregate Guardrail Status;
- five-state Strategy Validation;
- Goal-derived Evidence Relevance per conclusion;
- canonical aggregate Evidence Agreement;
- decomposed Evidence Quality;
- execution adequacy for hypothesis testing;
- uncertainty identity, type, materiality, and reducibility;
- canonical Next Decisive Evidence;
- a score-free Interpretation Summary;
- versioned Goal Contract, expected trajectory, and strategy-hypothesis
  references.

These cannot be reliably reconstructed from V1 score or presentation prose.
Adapters must return `unknown`/`unevaluable` where semantics are missing rather
than inventing precision.

### Temporary compatibility layers

1. **V1 fixture loader**
   validates unchanged canonical V1 assessments and snapshots.
2. **V1-to-Interpretation input adapter**
   exposes lineage, context, descriptive status, and limitations to shadow
   fixtures without treating the V1 score as evidence.
3. **Goal Contract fixture adapter**
   supplies explicit Founder Goal Objectives, Guardrails, trajectory, and
   evidence mappings only in fixtures until the Goal Contract is canonical.
4. **Strategy/Execution fixture adapters**
   make hypothesis and exposure explicit; they do not read presentation prose.
5. **Shadow Interpretation runner**
   emits Structured Interpretation to diagnostics/tests only, with no Founder
   write and no briefing/UI consumer.
6. **Parity reporter**
   compares identity, source selection, and semantic direction while explicitly
   not requiring V2 statuses to reproduce a V1 point total.
7. **V1 publication adapter**
   remains the only production writer during coexistence. Structured
   Interpretation must not be converted into a V1 score by hidden rules.
8. **Future Forecast adapter**
   will consume Structured Interpretation and create a separately versioned
   assessment. It is outside this patch.

Compatibility adapters are temporary anti-corruption layers. They must be
versioned, deterministic, one-directional, and removable. They must never make
V1 score semantics part of the V2 Interpretation contract.

## Compatibility fixture specification

The first implementation patch after this document should add read-only fixture
coverage in these groups. This document defines the fixtures; it does not add
runtime models or tests.

| Fixture group | Minimum cases | Required assertions |
|---|---|---|
| V1 contract preservation | Every existing `PI_GOAL_CONFIDENCE_CONTRACT_SCENARIOS` case | Canonical V1 normalization, ID, fingerprint, score, movement, contributor ordering, and provenance remain unchanged. |
| Objective/Guardrail independence | Objective ahead + Guardrail violated; Objective uncertain + Guardrail clear; multiple Guardrails | No compensation or averaging; all conclusions remain addressable. |
| Strategy versus progress | executed/supporting, executed/conflicting, under-executed, insufficient elapsed time, progress without attribution | Correct five-state strategy result independent of Objective status. |
| Strength/Relevance separation | strong irrelevant DEXA; weaker material Photo Guardrail; relevant low-quality evidence | No universal dominance; each dimension remains present. |
| Agreement | strong convergence, moderate convergence, mixed, conflicting, insufficient | Shared lineage does not count as independent convergence. |
| DEXA baseline | authoritative baseline without follow-up | Strong evidence capability, high Goal relevance, neutral/indeterminate progress agreement, Objective uncertain, next DEXA candidate. |
| Early training response | constructive performance before physiological confirmation | Directional strategy support, bounded Objective conclusion, explicit elapsed-time/attribution uncertainty. |
| Photo limitations | comparison with pose/quality limitations | Quality limitation is not automatically contradiction. |
| Evidence correction | superseded or corrected source | Only active canonical evidence contributes; provenance preserves correction lineage. |
| Next decisive evidence | pending DEXA, more photos, sustained trend, more training exposure, recovery stabilization | Selected event traces to a material reducible uncertainty and decision boundary. |
| Determinism | reordered evidence, reordered references, repeated invocation | Stable output identity and semantic equivalence. |
| Missing contracts | missing Goal expectation, Guardrail threshold, strategy hypothesis, or execution window | Explicit unevaluable/unknown result; no Goal-name or presentation inference. |

Fixture expected values must be semantic and score-free. No fixture should
assert a V2 confidence value, and the shadow runner must be incapable of
publishing.

## Gap analysis

| Required capability | Current state | Gap |
|---|---|---|
| Single Interpretation owner | Distributed across reasoning, mapper, scorer, and narrative | No score-free orchestration or canonical result. |
| Goal Contract | Goal/phase objects and protocol expectations exist | No versioned universal Objectives, Guardrails, trajectory, evidence map, and success-criteria contract. |
| Strategy hypothesis | Implied in phase/protocol and PI reasoning | No explicit versioned hypothesis, expected signals, or falsifiers. |
| Execution adequacy | Execution/adherence data exist in several services | Not bound to interpretation as opportunity/exposure versus outcome. |
| Goal-agnostic Strength | Partial evidence confidence/authority fields | Confidence mapper assigns Strength alongside Goal meaning. |
| Goal-derived Relevance | `phaseRole` and fixed domain tables | Hard-coded to one Goal/phase/state and evidence domains. |
| Independent Agreement | contributor direction and contradictions | `limiting` mixes quality and agreement; no conclusion-level reconciliation. |
| Objective evaluation | Implied by progress reasoning and narratives | No per-Objective canonical statuses. |
| Guardrail evaluation | Photo/Weight/DEXA language and some narrative fields | No independent, Goal-owned threshold conclusions. |
| Strategy Validation | Implicit in confidence reasons | No canonical five-state result separate from progress. |
| Evidence Quality | completeness, confidence, limitations | No decomposed categorical aggregate. |
| Remaining Uncertainty | V1 strings | No typed, material, reducible uncertainty model. |
| Next Decisive Evidence | Often embedded in briefing prose | No canonical structured selection. |
| Interpretation Summary | Narrative summaries and assessment reasons | Current summaries are cadence/presentation coupled. |
| Compatibility | Strong V1 fixture and persistence foundation | Missing V2 semantic fixtures and read-only shadow adapters. |

## Recommended implementation sequence

Every step is a separate bounded patch. None is implemented here.

1. **Freeze V1 compatibility fixtures**
   - Promote the existing assessment scenarios into explicit compatibility
     tests for assessment, snapshot/history read, briefing capture, and
     presentation reads.
   - Record current values and identities without changing them.

2. **Define the versioned Goal Contract model**
   - Add Objectives, Guardrails, expected trajectory, success criteria, and
     evidence-capability mappings.
   - Begin with fixtures and validation; do not change confidence consumers.

3. **Define Strategy Hypothesis and Execution State contracts**
   - Make expected signals, falsifiers, calibration state, exposure, and
     execution adequacy explicit.
   - Adapt existing protocol/execution data read-only.

4. **Define Goal-agnostic Evidence Descriptor capabilities**
   - Separate measurement Strength and limitations from Goal relevance.
   - Preserve all canonical evidence identities and correction lineage.

5. **Implement the Structured Interpretation model only**
   - Add enums, validation, deterministic identity, provenance, and fixture
     builders.
   - Add no scorer, repository, publication command, or UI integration.

6. **Implement Evidence Reconciliation in fixture/shadow mode**
   - Bind evidence to Goal expectations and produce independent Strength,
     Relevance, and Agreement.
   - Cover shared lineage, conflicts, corrections, and missing semantics.

7. **Implement Objective, Guardrail, and Strategy evaluators**
   - Preserve separate conclusions and add typed uncertainty.
   - Select Next Decisive Evidence from unresolved decision boundaries.

8. **Run read-only V1/V2 compatibility diagnostics**
   - Compare source cutoffs, evidence lineage, direction, and explanation
     coverage.
   - Do not compare or publish confidence values.

9. **Remove interpretation from the future Forecast calculation path**
   - Make Forecast consume only Structured Interpretation plus Goal timeline
     and prior forecast state.
   - This requires a separate Forecast contract and calculation patch.

10. **Migrate Narrative consumers**
    - Replace presentation-owned DEXA baseline, early-time, conflict, and
      next-evidence reasoning with translations of canonical fields.
    - Preserve rendered output under explicit parity fixtures before rollout.

11. **Introduce versioned persistence/publication only after acceptance**
    - Design a new Forecast assessment version and coexistence policy.
    - Preserve immutable V1 history and artifact lineage; never rewrite it.

12. **Retire temporary adapters last**
    - Remove V1 fallback and duplicated reasoning only after producer,
      persistence, artifact, Narrative, and UI parity is demonstrated.

## Architectural risks

1. **Interpretation becomes a renamed scorer.** A numeric field, implicit
   weight, ordered status, or “quality score” would recreate the coupling this
   contract removes.
2. **Goal names replace Goal semantics.** Branching on `build_lean_mass` rather
   than a versioned Objective/Guardrail/evidence map prevents reuse.
3. **Evidence type becomes universal authority.** DEXA, Photos, Training, or
   Weight can be decisive only for a particular capability and Goal boundary.
4. **Guardrails are blended into progress.** Averaging a violation with strong
   Objective progress destroys a core safety invariant.
5. **Execution and strategy validity are conflated.** Inadequate exposure must
   not falsify a strategy, and adherence must not prove outcomes.
6. **V1 score leaks into V2 input.** Using the existing score as evidence would
   make V2 circular and preserve V1 semantics invisibly.
7. **Presentation prose becomes a migration source.** Current copy contains
   useful reasoning but is not canonical evidence and cannot safely seed V2
   conclusions.
8. **Shadow mode writes accidentally.** Interpretation diagnostics must have no
   repository or publication capability.
9. **Fixture parity is defined as score parity.** V2 Interpretation is
   score-free; compatibility means unchanged V1 behavior plus traceable V2
   semantics, not recreating fixed points.
10. **Historical artifacts are reinterpreted.** Persisted V1 assessments and
    briefings must retain the semantics and lineage under which they were
    published.
11. **Internal rationale is rendered verbatim.** Diagnostic text is not
    user-facing coaching and must pass through Narrative.
12. **Next decisive evidence becomes a recommendation.** Interpretation
    identifies a resolving capability; Coaching decides whether and how to act.

## Shadow runtime implementation

The first runtime patch is isolated in `src/domain/interpretation`. It provides
the versioned Structured Interpretation model, deterministic Interpretation
Engine, Goal-aware evidence reconciliation, Objective and Guardrail evaluation,
Strategy Validation, structured uncertainty, Next Decisive Evidence, temporary
PI V1 input adapters, and an explicitly invoked shadow runner.

The shadow package has no production import, persistence adapter, publication
command, briefing consumer, Home consumer, presentation adapter, renderer, or
artifact writer. Its optional comparison diagnostic sink is bounded and cannot
be enabled by the production environment. Forecast remains unimplemented.

## Runtime safety confirmation

The architecture phase introduced no runtime effect. The subsequent shadow
runtime adds score-free calculation behind an explicit invocation boundary but
introduces no schema migration, persistence, publication, briefing, Home,
rendering, confidence, Forecast, or UI change. PI V1 remains the only production
confidence behavior. No artifact or Founder data is modified by the shadow
implementation.
