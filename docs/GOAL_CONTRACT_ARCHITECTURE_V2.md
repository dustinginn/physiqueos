# Goal Contract Architecture V2: Canonical Contract and Compatibility Foundation

> **Superseded historical architecture (deployment completed 2026-08-03).** The authoritative production description is [Confidence V2 current state](./CONFIDENCE_V2_CURRENT_STATE.md). Preserve this design record; do not use its implementation-not-started or cutover language as current operating instructions.

Status: canonical target architecture; implementation not started  
Scope: architecture, contracts, current-state audit, compatibility, gaps, and sequence only  
Runtime effect: none

## Decision

The versioned canonical Goal Contract is the sole authoritative definition of
what Goal success means. It declaratively exposes every semantic needed by the
Interpretation and Forecast engines without requiring either engine to know a
Goal name, display title, route, briefing, or UI component.

```text
Goal Contract:   What does success require, by when, within which constraints?
Interpretation:  What happened relative to that contract?
Forecast:        Is contract-compliant success still likely if the strategy continues?
Narrative:       How should the canonical conclusions be explained?
```

The Goal Contract defines success. It does not evaluate evidence, calculate
confidence, forecast an outcome, generate narrative, or perform a lifecycle
transition.

This specification extends:

- `docs/CONFIDENCE_ARCHITECTURE_V2.md`, the Forecast Engine foundation; and
- `docs/INTERPRETATION_ARCHITECTURE_V2.md`, the score-free Interpretation
  contract.

It does not replace the current Goal model, Goal Planning input, authored Goal
phases, activation workflow, transition workflow, or PI V1 contracts.

The authorized publication boundary for Forecast assessments derived from this
contract is specified in `docs/CONFIDENCE_PUBLICATION_ARCHITECTURE_V2.md`.

## Canonical ownership

| Concern | Canonical owner | Goal Contract role |
|---|---|---|
| Goal identity and category | Goal Engine | Declares stable identity, version, and semantic category. |
| Objectives and success | Goal Engine | Declares desired outcomes and completion requirements. |
| Guardrails | Goal Engine | Declares constraints that success must respect. |
| Timeline and expected trajectory | Goal Engine | Declares the evaluation horizon and reasonable progress shape. |
| Strategy hypothesis | Goal Engine with a versioned Strategy reference | Declares why the selected strategy is expected to satisfy this Goal. The Strategy Engine still owns the executable strategy state. |
| Evidence relevance | Goal Engine | Maps evidence capabilities to specific Objectives, Guardrails, hypothesis clauses, and milestones. |
| Milestones | Goal Engine | Declares forecast checkpoints where particular uncertainty should reduce. |
| Lifecycle definition | Goal Engine | Declares valid states and contract-version behavior; lifecycle services execute transitions. |
| Evidence facts and Strength | Evidence Engine | Not owned or changed by the Goal Contract. |
| Evidence reconciliation | Interpretation Engine | Consumes the Goal Contract without redefining it. |
| Goal confidence and feasibility | Forecast Engine | Consumes the Goal Contract without Goal-specific branches. |
| User-facing language | Narrative Engine | Translates canonical fields without changing their meaning. |

## End-to-end contract diagram

```text
Goal authoring / transition / planning
  |
  v
Versioned Canonical Goal Contract
  |-- Identity + category
  |-- Objectives
  |-- Guardrails
  |-- Timeline
  |-- Expected trajectory
  |-- Strategy hypothesis
  |-- Relevant evidence map
  |-- Success criteria
  |-- Milestones
  |-- Completion rules
  |-- Lifecycle + Forecast metadata
  |
  +--------------------+--------------------+
  |                    |                    |
  v                    v                    v
Interpretation      Forecast             Narrative
(what happened)     (what happens next)  (explanation only)
  |                    |
  +---------> Structured Interpretation
                         |
                         v
                 Forecast Assessment
```

The data-flow direction is one-way. Interpretation and Forecast may reference a
Goal Contract version; neither may write meaning back into it.

## Canonical Goal Contract specification

The following is an implementation-agnostic semantic contract. Field names may
be refined in a later model patch. This document introduces no runtime schema.

```text
GoalContract {
  contractVersion
  contractId
  goal {
    goalId
    goalVersion
    ownerId
    category
    semanticPurpose
    displayMetadata?
    sourceLineage
  }

  lifecycle {
    state
    stateEffectiveAt
    priorState?
    pauseContext?
    terminalContext?
  }

  objectives[] ObjectiveContract
  guardrails[] GuardrailContract
  timeline TimelineContract
  expectedTrajectory ExpectedTrajectoryContract
  strategyHypothesis StrategyHypothesisContract
  relevantEvidence EvidenceRelevanceContract
  successCriteria SuccessCriteriaContract
  milestones[] GoalMilestoneContract
  completionRules CompletionRulesContract
  forecastMetadata ForecastMetadataContract

  provenance {
    sourceType
    sourceIds[]
    sourceRevision?
    createdAt
    effectiveAt
    supersedesContractId?
    fieldProvenance
    missingMetadata[]
    inferredMetadata[]
    inputFingerprint
  }
}
```

### Contract identity and versioning

- `goalId` identifies the Goal instance across its lifetime.
- `goalVersion` identifies the accepted semantic definition of that Goal.
- `contractVersion` identifies the Goal Contract schema/semantic vocabulary.
- `contractId` is deterministic over Goal identity, Goal version, contract
  version, and canonical input fingerprint.
- Any material change to success meaning—Objective, Guardrail, timeline,
  trajectory, hypothesis, evidence relevance, milestone, or completion
  rule—creates a new Goal version/contract rather than mutating historical
  meaning.
- Presentation-only changes do not create a new semantic version.
- Interpretations and Forecast assessments reference the exact contract ID they
  consumed.
- Completed, superseded, and abandoned Goals retain their final effective
  contract for historical interpretation and artifact lineage.

The current repository's revision and timestamps may support compatibility
fingerprints, but they are not yet a canonical semantic Goal version.

### Goal category

Category is descriptive taxonomy, not behavior dispatch. Initial categories may
include body composition, performance, health marker, behavior, skill, event,
and composite. Engines must evaluate the declared subcontracts and may not
branch on the category or display name to invent missing behavior.

Category can help validate that required capabilities are present. It cannot
serve as a substitute for Objectives, Guardrails, or evidence mappings.

## Objective Contract

Objectives describe what the Goal is attempting to accomplish. Every Goal has
at least one explicit Objective.

```text
ObjectiveContract {
  objectiveId
  description
  measurement {
    metricOrCapability
    measurementSourceRefs[]
    unit?
    aggregation?
    comparisonBasis?
  }
  target {
    type
    desiredDirection
    value?
    range?
    changeAmount?
    qualitativeCriterion?
  }
  completionThreshold
  partialCompletion {
    allowed
    evaluationMode
    thresholdsOrBands[]
    effectOnGoalCompletion
  }
  importance
  required
  associatedEvidenceMapRefs[]
  trajectoryRef
  successCriterionRefs[]
}
```

### Required Objective semantics

| Field | Rule |
|---|---|
| Identifier | Stable and unique inside the Goal version. |
| Description | Internal semantic description; not screen copy. |
| Measurable target | Numeric, range, event, consistency, or explicit qualitative criterion. “Improve” alone is insufficient. |
| Measurement source | References an evidence capability, not a UI upload flow or evidence record ID. |
| Desired direction | Increase, decrease, maintain, reach range, complete event, satisfy criterion, or remain within bounds. |
| Completion threshold | Explicit predicate that Interpretation can evaluate and Forecast can predict. |
| Partial completion | Declares whether progress below the terminal threshold has semantic meaning and how it affects overall completion. |
| Importance | `required`, `primary`, or `secondary`; never a numeric confidence weight. |
| Associated evidence | References entries in the Goal-owned relevance map. |

Interpretation evaluates observed Objective status against this contract.
Forecast predicts whether the Objective is likely to meet its threshold within
the timeline. Neither engine defines the target.

Multiple Objectives remain individually addressable. Overall success uses the
explicit Success Criteria composition rule; it is never an undocumented
average.

## Guardrail Contract

Guardrails are first-class constraints. They are not secondary Objectives and
cannot be satisfied by exceeding an Objective.

```text
GuardrailContract {
  guardrailId
  description
  monitoredMetricOrCapability
  measurementSourceRefs[]
  evaluationWindow
  warningThreshold
  violationThreshold
  recoveryThreshold?
  associatedEvidenceMapRefs[]
  consequence {
    interpretationEffect
    forecastConstraint
    completionEffect
    strategyReviewRequirement
    safetyEscalation?
  }
  required
}
```

### Threshold requirements

- Warning and violation thresholds must be machine-evaluable predicates or an
  explicit categorical criterion.
- A text such as “keep gain gradual” is useful authoring intent but is not a
  complete canonical Guardrail until its metric, window, and thresholds are
  specified.
- `recoveryThreshold` may differ from the violation threshold to prevent
  oscillating state.
- The consequence declares what a violation means; Interpretation does not
  invent the consequence.
- Safety consequences must remain explicit and cannot be downgraded by
  Forecast or Narrative.

```text
Objective: lean-mass target ahead
Guardrail: body-fat boundary violated

Valid Goal result: Objective ahead + Guardrail violated
Invalid Goal result: “Mostly successful” because the values averaged out
```

Objective success never offsets a Guardrail warning, pressure, or violation.

## Timeline Contract

Timeline declares dates and duration; it does not judge whether observed
progress is appropriate or whether completion is feasible.

```text
TimelineContract {
  mode
  startDate
  targetCompletionDate?
  expectedDuration?
  eventDate?
  flexibility
  activePhaseRef?
  phaseRefs[]
  asOf {
    date
    elapsedDuration
    remainingDuration?
    calculationConvention
  }
}
```

Required semantics:

- start date;
- target completion date or explicit open-ended/event mode;
- expected duration when applicable;
- current phase reference, if the Goal is phased;
- mechanically derived elapsed and remaining time at the evaluation `asOf`;
- date arithmetic convention and timezone.

Elapsed and remaining time are descriptive derivations. Interpretation uses
them with Expected Trajectory to determine where progress should reasonably be.
Forecast uses them to evaluate remaining feasibility. Timeline does neither.

Pause intervals must be represented explicitly so elapsed exposure can be
distinguished from wall-clock time. A pause does not silently rewrite the
original target date.

## Expected Trajectory Contract

Expected Trajectory is Goal-owned. It defines how progress and uncertainty may
reasonably evolve without asserting that the outcome has occurred.

```text
ExpectedTrajectoryContract {
  trajectoryId
  mode
  baselines[]
  segments[] {
    segmentId
    phaseRef?
    startBoundary
    endBoundary
    purpose
    expectedResponseWindow
    expectedObjectiveRanges[]
    expectedGuardrailRanges[]
    evidenceExpectation
    measurableChangeExpectation
    uncertaintyExpectation
    prematureConclusionRules[]
  }
  deviationPolicy
}
```

The contract supports:

- early calibration periods where a strategy is being learned rather than
  judged as successful or failed;
- latency between execution and physiological/performance response;
- expected response windows for each Objective;
- uncertainty reduction as time and decisive evidence accumulate;
- reasonable progress ranges rather than one perfect line;
- expected milestone timing and evidence availability;
- explicit periods where little measurable change should be expected;
- rules identifying when a conclusion would be premature.

Expected Trajectory is not a Forecast. It describes a reasonable reference
envelope. Interpretation locates observations relative to that envelope;
Forecast predicts future contract satisfaction.

## Strategy Hypothesis Contract

The Goal Contract declares why the accepted strategy is expected to produce
contract-compliant success. The Strategy Engine continues to own executable
protocols, versions, and current strategy state.

```text
StrategyHypothesisContract {
  hypothesisId
  strategyRef { strategyId, strategyVersion }
  statement
  mechanism
  assumptions[] {
    assumptionId
    statement
    statusAtAcceptance
    confirmationRequirement?
  }
  expectedResponses[] {
    responseId
    capability
    directionOrRange
    expectedWindow
    objectiveOrGuardrailRefs[]
  }
  validationConditions[]
  falsificationConditions[]
  calibrationRequirements[]
  expectedValidationTimeline
  requiredExecutionExposure
}
```

The hypothesis separates:

- known premises;
- assumptions requiring future confirmation;
- expected physiological or performance responses;
- the time required before those responses can fairly be evaluated;
- conditions that support the hypothesis;
- conditions that contradict it;
- execution exposure required to make the test meaningful.

Interpretation evaluates this hypothesis. Forecast evaluates whether the
hypothesis and remaining timeline support future success. The Goal Contract
does not decide either result.

When the executable strategy changes materially, the Goal may remain the same
but the strategy hypothesis version changes. Historical Interpretations retain
the hypothesis reference they evaluated.

## Relevant Evidence Contract

Evidence objects remain Goal-agnostic. The Goal Contract maps descriptive
evidence capabilities to the particular questions for which they are relevant.

```text
EvidenceRelevanceContract {
  mapVersion
  entries[] {
    evidenceMapId
    evidenceCapability
    appliesTo {
      objectiveRefs[]
      guardrailRefs[]
      hypothesisRefs[]
      milestoneRefs[]
    }
    role
    questionAnswered
    expectedCadenceOrWindow?
    comparisonRequirement?
    minimumCapabilityRequirements?
    missingEvidenceMeaning
  }
}
```

Canonical roles:

| Role | Meaning |
|---|---|
| `primary` | Capable of directly deciding a required Objective, Guardrail, or completion boundary. |
| `supporting` | Materially informs the conclusion but normally cannot decide it alone. |
| `monitoring` | Watches a constraint, safety condition, or early deviation. |
| `informational` | Provides explanatory context without determining success. |
| `not_relevant` | Explicitly excluded for the referenced question. |

Role is assigned per question. DEXA can be primary for measured body composition,
supporting for another Objective, and not relevant to a skill Goal. Photos can
monitor one Guardrail while supporting a qualitative Objective. No evidence
type has universal rank.

`minimumCapabilityRequirements` constrain whether a record can answer the
question—for example, a valid comparison baseline or sufficient observation
window. They do not calculate Evidence Strength; the Evidence Engine owns the
actual descriptive quality.

`missingEvidenceMeaning` distinguishes expected cadence gaps from material
missing evidence. Absence of a weekly DEXA is not automatically uncertainty if
the contract expects monthly measurement.

## Success Criteria Contract

Success must be explicit and compositionally complete.

```text
SuccessCriteriaContract {
  objectiveRequirements[] {
    objectiveRef
    requiredStatusOrThreshold
    required
  }
  guardrailRequirements[] {
    guardrailRef
    maximumAcceptableState
    required
  }
  timelineRequirement
  completionTolerance {
    objectiveTolerance?
    timingTolerance?
    measurementTolerance?
  }
  acceptableUncertainty {
    maximumMaterialUnknowns
    permittedKinds[]
    prohibitedKinds[]
    requiredEvidenceCapabilities[]
  }
  compositionRule
  failureConditions[]
}
```

Required rules:

- Every required Objective has a completion requirement.
- Every required Guardrail has a maximum acceptable state.
- Timeline requirements say whether late completion, an adaptive date, or an
  event window is acceptable.
- Tolerances are explicit; consumers cannot invent “close enough.”
- Acceptable uncertainty is defined by material question and evidence
  capability, not merely by a confidence score.
- Failure conditions distinguish temporary underperformance, infeasibility,
  safety failure, terminal deadline failure, and user-authorized abandonment.
- `compositionRule` explains how multiple Objectives combine and may not allow
  Objective performance to cancel a Guardrail violation.

Interpretation evaluates facts against these declared criteria. Forecast
predicts whether they are likely to be met. Only the contract defines them.

## Goal Milestone Contract

Goal Milestones are canonical Forecast checkpoints, not reminders, tasks,
celebrations, or UI cards. They identify moments when evidence should materially
reduce a known uncertainty.

```text
GoalMilestoneContract {
  milestoneId
  description
  timing {
    mode
    expectedDateOrWindow?
    phaseRef?
    triggerCondition?
  }
  expectedEvidence[] {
    evidenceMapRef
    expectedCapability
    expectedAvailability
  }
  purpose
  objectiveRefs[]
  guardrailRefs[]
  hypothesisRefs[]
  uncertaintyExpectedToReduce[]
  decisionBoundary
  required
}
```

Milestone properties:

- It is tied to a decision boundary, not just a calendar date.
- Its expected evidence comes from the relevance map.
- It states which uncertainty should reduce if evidence arrives.
- Missing evidence is interpreted relative to expected timing.
- Reaching a milestone does not itself prove progress or trigger completion.
- A phase boundary may coincide with a milestone, but phases and milestones are
  not interchangeable.

Example checkpoint sets:

```text
Build Lean Mass
  1. Maintenance calibration complete
  2. First DEXA validation
  3. Mid-Goal evaluation
  4. Final assessment

Visible Abs
  1. Initial fat-loss confirmation
  2. Visual milestone
  3. DEXA confirmation
  4. Goal completion assessment
```

Interpretation uses milestones to understand what evidence should reasonably
exist at an evaluation cutoff. Forecast uses them to structure remaining
uncertainty. Scheduling may use the timing, but reminders cannot become the
canonical milestone record.

## Completion Rules Contract

Completion Rules convert satisfied Success Criteria into lifecycle eligibility;
they do not execute completion.

```text
CompletionRulesContract {
  evaluationMode
  requiredSuccessCriteriaRefs[]
  userConfirmation {
    required
    confirmationAuthority?
    confirmationEvidenceRequirement?
  }
  automaticCompletionAllowed
  reviewRequirement
  evidenceCutoffPolicy
  terminalArtifactRequirement?
  transitionEligibilityRule
  reopenPolicy
}
```

The default safety posture is explicit review and user confirmation where the
Goal definition requires subjective acceptance or a material lifecycle change.
An `automaticCompletionAllowed` flag declares eligibility only; a separately
authorized lifecycle service owns the transition.

Completion rules must distinguish:

- evidence supports completion;
- completion is eligible for review;
- required user confirmation is present;
- the Goal lifecycle was actually transitioned;
- the next Goal or strategy is eligible to activate.

No briefing, narrative, or presentation component may complete a Goal by
rendering completion language.

## Forecast Metadata Contract

Forecast metadata provides Goal-owned evaluation configuration without
calculating or biasing a confidence value.

```text
ForecastMetadataContract {
  forecastQuestion
  evaluationCadence
  forecastHorizon
  checkpointRefs[]
  requiredInterpretationFields[]
  materialUncertaintyDefinitions[]
  staleContractPolicy
  priorForecastContinuityPolicy
  unsupportedStatePolicy
}
```

It may state the forecast question, horizon, cadence, required checkpoint
coverage, and what uncertainty is material. It must not contain:

- a starting score;
- a Goal-specific point table;
- confidence movement values or caps;
- evidence weights;
- a predetermined confidence band;
- Narrative or UI presentation instructions.

## Goal lifecycle specification

Canonical lifecycle states:

| State | Meaning | Contract behavior |
|---|---|---|
| `draft` | Goal semantics are being authored and are not yet accepted. | Contract may be incomplete and is not eligible for production Interpretation or Forecast. |
| `planned` | Complete contract is accepted for future activation. | Version is valid and immutable; timeline activation fields may remain prospective. |
| `active` | Goal is the current evaluation target. | Interpretation and Forecast consume the effective contract version. |
| `paused` | Execution/evaluation is intentionally suspended. | Contract remains valid; pause interval is recorded and timeline consequences are explicit. |
| `completed` | Completion rules were satisfied and the authorized lifecycle transition occurred. | Final contract/version and completion evidence remain immutable. |
| `superseded` | A successor Goal replaces this Goal without representing failure. | Prior contract remains valid historically and references the successor lineage. |
| `abandoned` | The Goal was intentionally ended before completion. | Contract remains valid historically with explicit abandonment authority/reason. |

### Lifecycle transition rules

```text
draft -> planned -> active <-> paused -> completed
                         |          |
                         +---------> superseded
                         +---------> abandoned
```

- A lifecycle state change is an event on the Goal instance, not a rewrite of
  its historical contract.
- A semantic edit creates a new Goal Contract version effective from the
  accepted change.
- Historical Interpretations, Forecasts, briefings, and evidence relationships
  keep their original Goal Contract reference.
- Planned activation must verify that the contract is complete; Goal Contract
  validation does not perform activation.
- Pause/resume records must preserve exposure and date effects explicitly.
- Completed, superseded, and abandoned contracts remain readable forever.
- `archived` in current V1 data requires compatibility mapping with provenance;
  an adapter must not guess whether it means superseded or abandoned.

## Permanent architectural invariants

Goals and Goal Contracts must never:

- calculate confidence or forecast probability;
- interpret or reconcile evidence;
- generate Narrative, coaching, or recommendations;
- own Presentation behavior;
- depend on routes, screens, JSX, UI, or briefing layouts;
- mutate evidence, strategy execution, or Forecast state;
- encode success only in a display name;
- silently change historical success meaning.

Interpretation must never define Goal success, thresholds, expected trajectory,
evidence relevance, milestone purpose, or completion rules.

Forecast must never infer Goal intent, branch on Goal name, invent a Guardrail,
or relax a Success Criterion.

Narrative must never reinterpret, combine, weaken, or strengthen Goal
definitions.

Presentation must never infer completion, Goal category behavior, or evidence
importance.

Only the versioned Goal Contract defines success.

## Existing Goal implementation audit

### Executive finding

The current repository has several useful but overlapping Goal contracts:

- a permissive production Goal record;
- a separate legacy UI/mock Goal model;
- strict authored Goal phases;
- `goal_planning_v1` for editable plans;
- transition drafts and transition-created Goal records;
- Goal evaluation, trajectory, confidence, PI, briefing, and completion services
  that embed Goal-specific meaning.

No single versioned object currently declares Objectives, Guardrails, timeline,
trajectory, hypothesis, evidence relevance, milestones, success composition,
and completion rules together. Downstream services therefore infer meaning from
Goal IDs, `type`, `metricKey`, title text, operating state, and cadence context.

### Current Goal definitions

| Current contract | Useful fields | Architectural limitation |
|---|---|---|
| `src/domain/models/goal.js` | Identity, owner, title, type, primary/status, dates, values/ranges, unit, metric key, source/provenance | Permissive spread-based model; no versioned semantic contract, Objectives, complete Guardrails, trajectory, hypothesis, evidence map, milestones, or completion composition. It still contains a legacy `confidence` field. |
| `src/models/goal.js` | Quantifiable/habit/streak/milestone mock model with values, confidence, trend, status, and next action | Separate vocabulary from the production domain model; combines Goal, evaluation, prediction, and presentation concerns. |
| `src/domain/models/goalPlanningInput.js` | Versioned target/timeline, success criteria, guardrails, current state, planning signals, proposed stages, source context, read-only legacy adapters | Strong authoring foundation, but it is an editable planning input rather than accepted lifecycle semantics. It lacks canonical Objective arrays, thresholds/consequences, trajectory, hypothesis, evidence map, milestones, completion rules, and Forecast metadata. |
| `src/domain/models/goalPhase.js` and `authoredGoalPhase.js` | Strict identity, ownership, order/status, timing, success criteria, Guardrails, transition policy, timestamps | Phase contract is sound but phase criteria are permissive payloads; phases cannot substitute for overall Goal semantics or Forecast milestones. |
| Goal transition draft/services | Primary Objective intent, opening approach, accepted Guardrails, progress-measure roles, operating state, protocol review, source Goal lineage | Richest current semantic source, but values are workflow-shaped and some thresholds remain prose/null. Draft acceptance and activation do not create a versioned Goal Contract. |
| Goal Plan Update / Phase Persistence | Atomic Founder writes, stale protection, review tokens, protected roots, exact diff validation | Strong mutation safety. These workflows intentionally preserve activation, phases, protocols, evidence, and artifacts; they do not own a canonical Goal Contract. |
| Goal repository | List/get/save/update permissive Goal records | No contract validation or semantic version selection at repository boundary. |

### Live Founder Goal inventory

The read-only production snapshot contains:

- completed `goal_visible_abs_at_rest` with transition/completion lineage;
- active supporting body-fat and lean-mass Goal records from the older model;
- an active transition-created Build Lean Mass Goal with target, timeline,
  accepted Guardrails, progress-measure roles, calibration context, two authored
  phases, and source-transition lineage.

For the active Build Lean Mass Goal, compatibility can directly preserve:

- stable Goal ID, title, type, owner/status, and transition lineage;
- a numeric-change target of 10 lb lean mass by 2026-10-31;
- timeline start 2026-07-19, planned Phase 1 review 2026-08-15, and target date 2026-10-31;
- accepted Goal-level Guardrail intent for body fat, gradual gain, recovery, and
  sustained strength;
- accepted outcome, predictive, and explanatory evidence roles;
- calibration known/unknown statements;
- active Establish Maintenance and upcoming Lean Mass Build phases with timing,
  criteria, and transition policies.

The Goal does not yet canonically provide:

- a semantic Goal version or deterministic contract ID;
- complete machine-evaluable Guardrail warning/violation thresholds;
- a versioned strategy hypothesis with validation/falsification clauses;
- expected trajectory ranges and premature-conclusion rules;
- canonical Forecast milestones;
- Goal-level success composition and acceptable uncertainty;
- complete completion/failure/reopen rules;
- Forecast metadata.

Those missing fields must remain missing in compatibility output unless an
approved, versioned mapping supplies them. They must not be inferred from “Build
Lean Mass,” phase names, or Narrative prose.

### Goal-specific assumptions and name dependencies

Representative current dependencies include:

| Component | Current dependency |
|---|---|
| `GoalEvaluationService` | Branches on three Founder Goal IDs or `metricKey`; embeds Visible Abs, body-fat, and lean-mass thresholds, findings, progress, confidence factors, projections, recommendations, and completion state. |
| `PIDecisionCadenceContextService` | Infers semantic Goal type from `type` plus title regexes such as lean mass/build, fat loss/cut/visible abs, maintenance/calibration, and performance. |
| `PIGoalConfidenceContributorMapper` and `PIGoalConfidenceScoringService` | Support only Build Lean Mass / Establish Maintenance / Calibration and embed Goal-specific evidence meaning and score points. |
| `PIBodyFatGuardrailService` and `PICalibrationEnergyStateResolver` | Gate behavior on semantic Goal/phase/state values rather than a Goal Contract. |
| `BuildLeanMassGoalPresentationService` and `PhaseAwareActiveGoalPreviewService` | Select or reject Goals by `type === "build_lean_mass"`. |
| `CompletedGoalPreviewService`, `PhotoGoalConfirmationService`, and Photo completion flows | Hard-code Visible Abs Goal ID, confirmation purpose, visual criterion, and completion behavior. |
| `DailyBriefingService` and `DailyNarrativeEngineService` | Retain a Visible Abs primary Goal ID/label in selection and Narrative paths. |
| `MonthlyBriefingPreviewService` | Selects the active Build Lean Mass Goal by type and constructs Goal transition/start/phase stories from workflow fields. |
| `DEXAEventNarrativeService` and DEXA/Photo screens | Infer fat-loss versus lean-mass behavior, Guardrail meaning, and completion language. |
| Home and Goals surfaces | Gate legacy/canonical confidence, reminders, presentation, and routes using Goal type/ID. |
| Protocol builders and links | Several flows bind explicitly to Visible Abs Goal ID or Goal-specific protocol assumptions. |

Repository-wide search currently finds Goal-specific strings across services,
routes, tests, fixtures, and presentation. The number itself is not a migration
contract; it demonstrates that adapters and staged consumer migration are
required rather than a flag-day model replacement.

### Interpretation dependencies

Goal meaning is currently interpreted in:

- `GoalEvaluationService` through ID/metric branches and embedded evidence
  evaluation;
- PI cadence context through title/type semantic inference;
- PI body-fat Guardrail, calibration Energy, cross-domain claim, DEXA, and Photo
  reasoning services;
- `PIGoalConfidenceContributorMapper`, which assigns relevance-like roles and
  directions;
- briefing composition that decides baseline, early response, completion, and
  next-evidence meaning.

The V2 Interpretation Engine cannot become Goal-generic until those semantics
are available from a validated Goal Contract.

### Confidence dependencies

Current confidence paths depend on:

- active Goal identity/type and active phase;
- hard-coded Build Lean Mass / Establish Maintenance / Calibration support;
- Goal-specific domain point tables and Guardrail assumptions;
- legacy Goal evaluation confidence and Home trajectory calculations;
- Goal/phase/state agreement at persistence/publication boundaries;
- presentation fallback when a canonical PI assessment is unavailable.

Compatibility must preserve all V1 scores and read-selection behavior. The Goal
Contract adapter is not authorized to change or feed production scoring.

### Briefing and Narrative dependencies

Daily, Midweek, Weekly, Monthly, DEXA Event, and Photo Event paths consume Goal
identity, target, active phase, operating state, completion state, and confidence
in different shapes. Several paths also define Goal-specific interpretation or
completion language directly.

Existing persisted briefing artifacts capture the semantics available at their
generation time. They must not be rewritten or reinterpreted when Goal
Contracts are introduced.

### Publication, activation, and transition dependencies

- Goal transition activation atomically completes the source Goal, creates the
  target Goal, preserves evidence/protocol/artifact lineage, and establishes
  source/target metadata.
- Goal Plan Update and Goal Phase Persistence use Founder Store units of work,
  review tokens, source revisions/fingerprints, protected collections, and
  fail-closed validation.
- PI confidence/event/cadence publication validates Goal/phase/state identity
  when committing assessments and artifacts.
- Completion services distinguish recommendation, user confirmation, and
  actual transition in Goal-specific ways.

A future Goal Contract must integrate through read-only adapters first. It must
not bypass or weaken these mutation and publication boundaries.

## Compatibility foundation

### Compatibility policy

Adapters expose current accepted meaning without changing source records.

Every adapted field has one provenance state:

| State | Meaning |
|---|---|
| `direct` | Exact field exists in the accepted source record. |
| `derived` | Mechanically computed without semantic judgment, such as elapsed days from explicit dates. |
| `mapped` | Deterministic vocabulary translation from an explicit legacy value. |
| `inferred_review_required` | Plausible semantic translation that cannot become canonical without explicit approval. |
| `missing` | Required information is unavailable and remains unknown. |

No adapter may use title text, route, JSX, briefing prose, a confidence score,
or current observed evidence to fill missing Goal intent.

### Adapter inventory

| Adapter | Source | Safe output | Must remain missing or review-required |
|---|---|---|---|
| Permissive Goal adapter | `src/domain/models/goal.js` records | Identity, owner, type/category mapping, primary/status, explicit dates, metric/value/range, source lineage | Semantic version, full Objective predicate, Guardrails, trajectory, hypothesis, milestones, completion composition. |
| Goal Planning adapter | `goal_planning_v1` | Purpose, target, timeline, criteria, Guardrail intent, proposed stages, current-state context | Accepted lifecycle authority, contract effective version, complete evidence map, hypothesis, milestones, completion rules. |
| Transition-created Goal adapter | Active production Goal | Explicit target/timeline, accepted Guardrail text, progress-measure roles, calibration context, phases, transition lineage | Missing thresholds, response ranges, falsifiers, milestone decision boundaries, acceptable uncertainty, completion rules. |
| Authored Phase adapter | `GoalPhase` collection | Phase identity/order/status/timing/criteria/Guardrails/transition policy | Overall Goal success, milestones, Expected Trajectory, phase readiness evaluation. |
| Supporting Goal adapter | body-fat and lean-mass legacy records | Explicit range/metric/unit/status and relationship when explicitly linked | Whether record is a Guardrail, Objective, or independent Goal unless accepted mapping says so. |
| Completed Visible Abs adapter | completed Goal plus completion/transition lineage | Historical identity, dates, terminal state, successor lineage, recorded confirmation metadata | Retroactive reconstruction of all success/Guardrail rules from narrative or evidence. |
| Strategy adapter | accepted protocols, operating state, transition data | Strategy identity/version references, explicit expectations and known/unknown statements | Causal hypothesis clauses or falsifiers not explicitly declared. |
| Evidence-role adapter | `progressMeasurement` roles | Capability reference, outcome/predictive/explanatory role, importance, explanation | Automatic Primary/Supporting/Monitoring mapping where semantics are ambiguous. |
| Lifecycle adapter | active/paused/completed/archived and transition metadata | Direct states and known transition lineage | `archived` -> superseded/abandoned choice without explicit terminal context. |
| Forecast compatibility adapter | Goal Contract diagnostic projection | Contract completeness and missing metadata only | Confidence value, starting score, movement, or V1 scoring input. |

### Current-to-canonical mapping rules

1. Preserve source IDs and accepted values exactly.
2. Normalize only explicit vocabulary with a versioned mapping table.
3. Derive date arithmetic only from explicit dates and a declared convention.
4. Treat phase success criteria and Goal Guardrail prose as intent unless they
   contain complete evaluable predicates.
5. Keep phase and milestone concepts separate.
6. Keep supporting Goal records independent unless an accepted Goal relationship
   maps them into the contract.
7. Preserve Goal transition and completion lineage; never replay lifecycle
   operations.
8. Expose missing required fields and contract completeness diagnostics.
9. Prohibit publication, Goal writes, confidence refresh, artifact generation,
   and presentation consumption from compatibility adapters.
10. Require explicit review before an inferred field becomes part of an
    accepted Goal Contract version.

### Missing metadata inventory

The existing contracts generally lack:

- canonical Goal semantic version and contract fingerprint;
- Objective-specific measurement and completion predicates;
- partial-completion composition rules;
- Guardrail warning, violation, recovery, and consequence semantics;
- pause-aware timeline exposure;
- expected response ranges and latency windows;
- uncertainty-reduction trajectory;
- explicit strategy assumptions, validation, and falsification clauses;
- question-specific evidence relevance;
- Forecast milestones and decision boundaries;
- acceptable uncertainty at completion;
- failure, supersession, abandonment, and reopen rules;
- Goal-generic Forecast metadata.

### Compatibility fixtures

The first model implementation should define read-only fixtures for:

| Fixture group | Required cases | Assertions |
|---|---|---|
| Legacy Goal | numeric absolute, target range, qualitative metric, missing target/date, archived | Direct fields preserved; missing semantics stay missing; no title inference. |
| Planning input | numeric change, event, behavior, qualitative, open-ended, staged | Target/timeline/criteria preserved; planning source is not treated as lifecycle acceptance. |
| Active Build Lean Mass | current production-shaped target, timeline, four Guardrail intents, evidence roles, two phases | Stable mapping and complete missing-metadata report; no confidence or evidence interpretation. |
| Completed Visible Abs | completion plus transition lineage | Historical terminal state preserved without retroactive rule fabrication. |
| Objective/Guardrail independence | Objective target plus violated Guardrail definition | Separate definitions and success composition. |
| Timeline | fixed duration, target date, event date, pause interval, open-ended | Deterministic elapsed/remaining derivation; no feasibility judgment. |
| Trajectory | calibration, response latency, plateau-expected window, milestone response | Premature-conclusion rules remain explicit and score-free. |
| Strategy hypothesis | confirmed assumptions, pending assumptions, validation/falsification, insufficient exposure | Declarative hypothesis only; no interpreted state. |
| Evidence relevance | same capability with different roles across two Goals | No universal evidence hierarchy or category/name dispatch. |
| Milestones | date-based, phase-based, condition-based, missing expected evidence | Checkpoints identify uncertainty; never become reminders or completion events. |
| Lifecycle | every canonical state and valid transition lineage | Contract versions remain readable and historically stable. |
| Determinism | reordered source collections and repeated adaptation | Stable semantic output, provenance, and fingerprint. |
| Unsafe inference | Goal title implies behavior but contract fields are absent | Adapter returns missing/review-required; Interpretation and Forecast remain blocked. |

Compatibility fixture tests must also freeze existing Goal, activation,
transition, plan-update, phase-persistence, confidence, and briefing behavior.
No fixture may authorize production mutation.

## Gap analysis

| Required capability | Current state | Gap |
|---|---|---|
| Versioned Goal identity | IDs, revisions, timestamps, transition lineage | No semantic Goal version or contract ID. |
| Declarative Objectives | Target and progress-measure fields | No complete Objective array with measurement, thresholds, partial behavior, and importance. |
| First-class Guardrails | Goal/phase Guardrail arrays and PI body-fat logic | Mostly prose/null thresholds; consequences and recovery rules absent. |
| Timeline | Goal target/timeline plus strict phase timing | No canonical pause-aware as-of contract across Goal and phases. |
| Expected Trajectory | Phase timing and Home trajectory calculations | No Goal-owned response ranges, latency, uncertainty reduction, or premature-conclusion rules. |
| Strategy Hypothesis | Opening calibration approach, protocols, known/unknown statements | No versioned mechanism, assumptions, validation/falsification, exposure, or response windows. |
| Relevant Evidence | `progressMeasurement` roles and Goal-linked evidence | Roles are workflow-shaped; no question-specific relevance map. |
| Success Criteria | Planning/phase criteria and Goal-specific completion logic | No Goal-level composition, tolerance, acceptable uncertainty, or explicit failure rules. |
| Forecast Milestones | Phases, appointments, reminders, narrative milestones | No canonical uncertainty-reduction checkpoints; current concepts must not be conflated. |
| Completion Rules | Visible Abs confirmation and atomic transition behavior | Goal-specific and distributed; no declarative general contract. |
| Lifecycle | active/paused/completed/archived plus transition metadata | Missing planned/superseded/abandoned distinctions and version behavior. |
| Goal-generic Interpretation | PI semantic context and evaluation services | Name/type/ID/metric-specific reasoning remains downstream. |
| Goal-generic Forecast | V1 scorer and legacy confidence | Hard-coded Goal/phase/state and evidence point semantics. |
| Compatibility | Planning and implicit-phase adapters exist | No full Goal Contract adapter, completeness diagnostic, or fixture suite. |

## Recommended migration roadmap

Each step is a separate bounded patch. None is implemented here.

1. **Freeze current compatibility behavior**
   - Capture production-shaped Goal, transition, phase, planning, evaluation,
     confidence, briefing, and lifecycle fixtures.
   - Assert no score, publication, activation, transition, or rendering changes.

2. **Implement Goal Contract model and validation only**
   - Add versioned identity, subcontracts, provenance states, completeness
     diagnostics, deterministic normalization, and fixture builders.
   - Add no repository or production consumer.

3. **Implement read-only legacy adapters**
   - Adapt permissive Goal, `goal_planning_v1`, transition-created Goal, phases,
     supporting Goals, and strategy references.
   - Return missing/review-required metadata explicitly.

4. **Author accepted Goal Contract fixtures**
   - Define complete representative Build Lean Mass and Visible Abs contracts as
     fixtures only, with explicit human/product acceptance of every inferred
     semantic.
   - Do not derive them from current briefing prose.

5. **Add Goal Contract completeness diagnostics**
   - Report which fields block Interpretation, Forecast, milestone evaluation,
     and completion evaluation.
   - Run read-only and outside publication paths.

6. **Bind Structured Interpretation fixtures**
   - Replace Goal-name logic in Interpretation fixtures with Goal Contract
     references.
   - Preserve the PI V1 production path unchanged.

7. **Define Strategy and Evidence capability adapters**
   - Connect versioned strategy state and Goal-agnostic Evidence descriptors to
     the contract references without moving ownership.

8. **Run shadow Goal-generic Interpretation**
   - Compare evidence lineage and semantic conclusions against accepted
     fixtures.
   - No Founder write, artifact generation, score, Narrative, or UI consumer.

9. **Implement the separate Forecast contract**
   - Consume complete Goal Contract + Structured Interpretation + prior Forecast
     state.
   - Add calculations only in a separately authorized patch.

10. **Migrate Narrative and briefing reasoning**
    - Translate canonical Goal, Interpretation, and Forecast fields while
      preserving existing rendered output under parity fixtures.

11. **Integrate Goal authoring and version acceptance**
    - Extend Goal creation/edit/transition review to accept a complete contract
      version through existing protected atomic workflows.
    - This is a future mutation/schema/migration design, not part of this patch.

12. **Migrate persistence and publication explicitly**
    - Preserve historical Goal versions, V1 confidence, briefing artifacts,
      completion records, and transition lineage.
    - Use separately approved migrations and versioned read policies.

13. **Remove Goal-name branches last**
    - Retire hard-coded evaluation, confidence, briefing, and presentation
      behavior only after every production consumer has accepted contract
      parity and fallback safety.

## Architectural risks

1. **The contract becomes a new monolith.** It declares semantics but must not
   absorb Interpretation, Forecast, Strategy execution, Narrative, or UI state.
2. **Goal names remain hidden dispatch keys.** An adapter that turns “Build Lean
   Mass” into thresholds or evidence roles without explicit metadata preserves
   the existing problem invisibly.
3. **Planning intent is mistaken for accepted lifecycle truth.** Proposed stages
   and engine recommendations require explicit acceptance before canonical use.
4. **Guardrail prose is treated as executable.** “Maintain recovery” or “gain
   gradually” lacks a metric, window, thresholds, and consequence.
5. **Phases become milestones.** A phase structures strategy/execution; a
   milestone marks an uncertainty-reduction checkpoint. They can coincide but
   are not the same record.
6. **Milestones become reminders.** Scheduling is a consumer and cannot own or
   satisfy a Forecast checkpoint.
7. **Category becomes behavior.** Category is taxonomy; downstream engines must
   consume declarative subcontracts.
8. **Evidence roles become universal hierarchy.** Relevance is per Goal question
   and does not alter Goal-agnostic Evidence Strength.
9. **A Goal version changes historical meaning.** Immutable artifacts and
   assessments must retain the contract version originally consumed.
10. **Adapter inference becomes permanent.** Every inferred field needs
    provenance, review status, and a removal/migration path.
11. **Forecast logic leaks into metadata.** Starting scores, point weights,
    movement caps, or confidence bands are prohibited in the Goal Contract.
12. **Completion eligibility executes completion.** The Goal Contract declares
    rules; an authorized lifecycle service performs the state transition.
13. **Archived state is guessed.** Existing `archived` records cannot be mapped
    to superseded or abandoned without explicit context.
14. **Compatibility changes V1.** Goal Contract shadow work must not feed current
    evaluation, confidence, publication, briefing, Home, or UI paths.
15. **Live Founder semantics are fabricated from evidence.** Observed outcomes
    cannot be used to retroactively define what the Goal was supposed to mean.

## Runtime safety confirmation

This patch is documentation only. It introduces no runtime model, schema,
migration, repository, Goal mutation, Goal activation, Goal transition,
confidence calculation, persistence, publication, briefing, Home, Narrative,
Forecast, presentation, rendering, UI, artifact, or Founder-data change.

Current V1 Goals, phases, planning, activation, transition, confidence,
publication, briefings, and rendering remain the only production behavior.
