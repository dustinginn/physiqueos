# Confidence Architecture V2: Canonical Forecast Engine Foundation

> **Superseded historical architecture (deployment completed 2026-08-03).** The authoritative production description is [Confidence V2 current state](./CONFIDENCE_V2_CURRENT_STATE.md). Preserve this document for implementation history; do not use its pre-deployment or cutover language as current operating instructions.

Status: canonical architecture; production integration implemented, deployment pending  
Scope of this document: architecture, ownership, contracts, gaps, sequence, and runtimes  
Runtime effect: code integration only; no production deployment or Founder mutation

Implementation and deployment evidence is recorded in
`docs/CONFIDENCE_V2_PRODUCTION_INTEGRATION.md`.

The canonical score-free Interpretation contract and the PI V1 compatibility
inventory are specified in `docs/INTERPRETATION_ARCHITECTURE_V2.md`.
The versioned declarative definition of Goal success and its legacy adapter
foundation are specified in `docs/GOAL_CONTRACT_ARCHITECTURE_V2.md`.
The authorized Briefing-owned finalization boundary, canonical publisher
registry, immutable state propagation, and V1 publication audit are specified
in `docs/CONFIDENCE_PUBLICATION_ARCHITECTURE_V2.md`.

## Decision

Confidence is the current forecast that the active Goal will be achieved within
the planned timeline while respecting its guardrails if the current strategy
continues.

Confidence is not evidence quantity, an execution score, progress percentage,
motivation, a streak, or compliance. It belongs to the active Goal and evaluates
the current strategy, never the user.

This document defines the architecture every future Goal, briefing, dashboard,
recommendation, and coaching explanation must consume. It does not change the
current V1 calculation, persistence, publication, or presentation behavior.

## Permanent confidence principles

1. Confidence is a forecast, not a scorecard.
2. Confidence measures remaining uncertainty, not accumulated evidence.
3. Confidence belongs to the active Goal.
4. Confidence evaluates the current strategy, not the user.
5. Evidence has no intrinsic importance; the active Goal determines relevance.
6. Confidence moves conservatively.
7. Large movements require meaningful reductions in uncertainty.
8. Confidence is always explainable.
9. Confidence forecasts success within the planned timeline.
10. Confidence identifies the next evidence most likely to reduce uncertainty.

## Current architecture audit

### Executive finding

The repository currently contains two confidence paths:

- A persisted canonical PI V1 series, which is the preferred source when a
  valid Goal/phase snapshot exists.
- A non-persisted legacy overall-Goal read model, retained as presentation
  fallback when the canonical boundary is unavailable.

The PI path has strong identity, lineage, concurrency, and atomic-publication
mechanics. Its semantics are not yet the V2 forecast contract. It currently
describes confidence in an evidence-supported progress assessment, maps
Goal-specific domain states, applies fixed point tables, and limits movement by
assessment context. This makes it a useful migration foundation, not the final
Forecast Engine.

### Current ownership

| Concern | Current owner | Current behavior |
|---|---|---|
| Legacy calculation | `OverallGoalConfidenceReadService` and `HomeGoalTrajectoryService` | Computes an evidence-presence-oriented score at read time; not persisted. |
| PI domain reasoning | Cadence, DEXA, Photo, Energy, and Training reasoning/finalization services | Produce domain states, completeness, observations, claims, and reasoning. |
| Contributor semantics | `PIGoalConfidenceContributorMapper` | Converts domain states into supporting, neutral, conflicting, and limiting contributors. |
| Numeric calculation | `PIGoalConfidenceScoringService` | Applies a 50 anchor, fixed domain points, corroboration/contradiction adjustments, evidence ceilings, and context movement caps. |
| Assessment identity | `PIGoalConfidenceAssessmentService` and `PIGoalConfidenceAssessmentModel` | Creates immutable, validated, deterministically identified assessments. |
| Refresh orchestration | `PIGoalConfidenceRefreshService` | Normalizes triggers, resolves the prior, enforces cutoff/precedence/idempotency, scores, and requests persistence. |
| Canonical storage | Founder runtime store collections | Stores current snapshots, immutable history, and optional legacy continuity seeds. |
| Repository boundary | `GoalConfidenceRepository` | Reads the current snapshot/history/seed and permits writes only inside a staged Founder transaction. |
| Atomic persistence | `PIGoalConfidencePersistenceService` | Validates Goal/phase/state, expected revision/digest/snapshot, appends history, replaces the snapshot, and commits atomically. |
| Atomic briefing/event publication | PI cadence, DEXA, and Photo publication services | Can commit an artifact and its prepared confidence successor in one Founder unit of work. |
| Canonical reads | `PIGoalConfidenceReadService` | Reads the current series or the latest valid assessment at/before a cutoff. |
| Presentation read | `ActiveGoalConfidencePresentationReadService` | Validates snapshot/history identity and returns the canonical PI assessment; otherwise uses the legacy fallback. |
| User-facing translation | Briefing confidence presentation services and narrative composition | Translate canonical fields into screen-ready language; they do not own the canonical score. |
| UI | `ConfidenceRing`, `BriefingConfidenceAnchor`, `HomeConfidenceDetail`, briefing and Goal screens | Render supplied confidence values and explanations. |

### Current canonical data

The Founder runtime store owns three collections:

- `goalConfidenceSnapshots`: one current snapshot per Goal and phase boundary.
- `goalConfidenceHistory`: immutable assessment history and predecessor lineage.
- `goalConfidenceContinuitySeeds`: controlled legacy values used only to seed an
  initial PI series during reconciliation.

The snapshot points to a history record and current assessment. The history
record contains the complete assessment. The assessment includes Goal, phase,
operating state, assessment context, evidence cutoff, score and movement,
contributors, completeness, uncertainty, reasoning, provenance, and a
deterministic input fingerprint.

`PIGoalConfidencePersistenceService` is the canonical write boundary. It uses a
Founder Store unit of work and requires:

- a valid immutable assessment;
- expected Founder revision and semantic digest;
- expected current snapshot state;
- an explicit publication reason;
- explicit replacement authorization for successor/reconciliation writes;
- Goal, phase, and operating-state agreement;
- deterministic identity and predecessor consistency.

This write model should be preserved unless a later schema patch explicitly
replaces it.

### Current calculation pipeline

```text
Interpreted evidence / cadence window / event
  -> domain-specific PI reasoning
  -> domain states + completeness + observations + claims
  -> PIGoalConfidenceContributorMapper
  -> PIGoalConfidenceScoringService
  -> PIGoalConfidenceAssessmentService / AssessmentModel
  -> PIGoalConfidenceRefreshService
  -> prepared publication command or direct confidence publication
  -> Founder Store atomic transaction
  -> goalConfidenceHistory + goalConfidenceSnapshots
  -> PIGoalConfidenceReadService
  -> presentation read / briefing narrative
  -> UI
```

Current scoring details:

- calibration anchor: 50;
- fixed point tables for Energy, Training, Weight, Photos, DEXA, Recovery,
  Protocol, and Evidence Completeness;
- corroboration bonus for multiple supporting domains;
- contradiction adjustment when supporting and conflicting domains coexist;
- DEXA authority adjustment;
- completeness/authority ceilings;
- context-specific movement caps from 2 to 20 points;
- score range 0–100 with integer rounding.

The mapper and scorer currently accept only `build_lean_mass` +
`establish_maintenance` + `calibration`. The assessment model's semantic
definition is confidence in an evidence-supported progress assessment, not yet
the V2 probability-like forecast of Goal success within a timeline and
guardrails.

### Current update triggers

`PIGoalConfidenceRefreshService` defines these trigger identities:

- evidence confirmation;
- training performance update;
- Midweek assessment;
- Weekly assessment;
- Photo event;
- DEXA event;
- phase transition;
- controlled reconciliation.

Concrete preparation adapters currently exist for Midweek/Weekly, Photo, and
DEXA. Energy and Training also have durable lower-level work/finalization paths
with independent rollout gates and a bounded recovery worker. Some declared
refresh trigger identities are architectural vocabulary rather than uniformly
hosted production entry points.

Refresh behavior is conservative operationally:

- deterministic receipts make a trigger idempotent;
- stale cutoffs are rejected;
- higher-precedence contexts can supersede lower-precedence contexts;
- same/later-cutoff replacement requires semantic or completeness improvement;
- the prior comes from the canonical series or an explicitly authorized legacy
  continuity seed;
- publication conflicts fail closed.

### Publication interaction

Cadence, DEXA, and Photo lifecycles can prepare confidence without writing it,
embed the assessment identity in the artifact, and atomically publish both the
artifact and confidence state. Publication validates that the embedded
assessment ID equals the canonical publication command's assessment ID.

Monthly currently reads the latest canonical assessment at or before its cutoff
and publishes no new confidence command. Midweek and Weekly may prepare a
successor as part of cadence publication. Event publications can do the same for
DEXA and Photo artifacts.

### Briefing interaction

- Monthly selects a historical canonical assessment at/before the evidence
  cutoff and captures it in the immutable Monthly artifact.
- Midweek and Weekly resolve canonical active-Goal confidence and can publish a
  prepared successor with the cadence artifact.
- DEXA and Photo event lifecycles bind event narration to the matching canonical
  assessment identity.
- Briefing presentation services reshape assessment fields; briefing screens
  render `BriefingConfidenceAnchor`/`ConfidenceRing`.
- Daily Briefing renders a confidence ring from its supplied model but is not a
  canonical V2 calculator.

### Home and Goal interaction

`HomeBriefingService`, `GoalsHubScreen`, and phase-aware Goal preview services
first compute the legacy overall-Goal read model, then ask
`ActiveGoalConfidencePresentationReadService` for the canonical PI snapshot.
The canonical result wins when its Goal/phase/state boundary and history linkage
are valid. The legacy result remains a fallback.

This fallback prevents blank UI, but it means the product can still present a
non-persisted evidence-presence score with different semantics from the
canonical PI assessment.

### Current producers

- PI cadence confidence preparation (Midweek and Weekly).
- PI DEXA confidence preparation and DEXA event lifecycle.
- PI Photo confidence preparation and Photo event lifecycle.
- PI Energy confidence finalization.
- PI Training confidence finalization.
- Controlled reconciliation through the refresh/persistence contract.
- Legacy overall-Goal calculation for presentation fallback only.

### Current consumers

- Home briefing and Home confidence detail.
- Goals Hub and phase-aware Goal presentations.
- Midweek, Weekly, and Monthly briefing services/presentations.
- DEXA and Photo event briefing lifecycles.
- Daily Briefing presentation.
- Confidence ring/anchor components.
- Narrative assessment provenance through confidence assessment references.

## Canonical V2 engine architecture

### Ownership diagram

```text
                         owns success definition
                    +---------------------------+
                    |        Goal Engine        |
                    +-------------+-------------+
                                  |
                                  v
+----------------+      +---------+---------+      +----------------+
| Strategy Engine|----->| Interpretation    |<-----| Evidence Engine|
+-------+--------+      | Engine            |      +----------------+
        |               +---------+---------+
        v                         ^
+-------+--------+                |
| Execution Engine|---------------+
+----------------+                |
                                  | Goal timeline + expected trajectory
                                  v
                    +-------------+-------------+
                    |       Forecast Engine     |
                    +-------------+-------------+
                                  |
                         canonical forecast only
                                  v
                    +-------------+-------------+
                    |       Narrative Engine    |
                    +-------------+-------------+
                                  |
                    Briefings / Home / Goals / recommendations
```

No UI, briefing, or Narrative component may bypass these ownership boundaries
or calculate its own confidence.

### Data flow diagram

```text
Goal Contract ------------------------------+
  objectives, guardrails, timeline,         |
  trajectory, strategy hypothesis,          |
  evidence map, success criteria            |
                                             v
Strategy State ---> Execution State ---> Interpretation Request
                                             ^
Descriptive Evidence Capabilities -----------+
                                             |
                                             v
                                  Structured Interpretation
                                  - objective support/conflict
                                  - guardrail support/conflict
                                  - trajectory position
                                  - agreement/conflicts
                                  - remaining uncertainty
                                  - next decisive evidence candidates
                                             |
                                             v
                                      Forecast Engine
                                  Goal + Strategy + Execution
                                  + Interpretation + Timeline
                                             |
                                             v
                                      Forecast Assessment
                                  - confidence
                                  - movement
                                  - current forecast
                                  - explanation facts
                                  - remaining uncertainty
                                  - next decisive evidence
                                             |
                           +-----------------+-----------------+
                           v                                   v
                    Canonical persistence                 Narrative Engine
                    snapshot + history                    coaching language
                           |                                   |
                           +-----------------+-----------------+
                                             v
                                Every product consumer
```

## Engine responsibility matrix

| Engine | Owns | Produces | Must not do |
|---|---|---|---|
| Goal Engine | Objectives, guardrails, timeline, success criteria, expected trajectory, strategy hypothesis, relevant evidence map | Canonical Goal Contract | Calculate confidence; identify behavior by Goal name |
| Strategy Engine | Active strategy and current Training, Nutrition, Activity, Recovery, Supplements, Peptides, protocols, and coaching updates | Canonical Strategy State | Claim Goal success; calculate confidence |
| Execution Engine | Adherence, consistency, completion, execution quality | Canonical Execution State | Treat execution as outcome progress or Goal success |
| Evidence Engine | Interpretation of observations; quality, strength, timing, descriptive capabilities | Goal-agnostic Evidence Descriptors | Encode Goal relevance or universal evidence hierarchy; calculate confidence |
| Interpretation Engine | Reconciliation against Goal expectations; support, contradiction, agreement, trajectory position, guardrails, uncertainty | Structured Interpretation | Calculate confidence; write coaching prose |
| Forecast Engine | Forecast of Goal success under the current strategy and timeline | Canonical Forecast Assessment | Interpret raw evidence, own Goal definitions, or render UI |
| Narrative Engine | User-facing explanation and coaching recommendations | Briefing, Home, Goal, and recommendation language | Calculate or modify confidence |
| Persistence/Publication | Atomic identity, lineage, current snapshot, history, concurrency | Durable canonical forecast series | Recalculate semantics or contain presentation logic |
| Presentation/UI | Render canonical Narrative and Forecast outputs | View models and visual components | Calculate confidence or create screen-local variants |

## Canonical Goal Contract

Every Goal must expose this semantic contract. Field names may be refined in a
later schema patch, but ownership and meaning are fixed.

```text
GoalContract
  goalId
  contractVersion
  objectives[]
    objectiveId
    definition
    successCriteria[]
    expectedTrajectoryRef
  guardrails[]
    guardrailId
    definition
    acceptableRange or policy
    violationSeverity
    recoveryPolicy
  timeline
    start
    plannedCompletion
    checkpoints[]
  expectedTrajectories[]
    trajectoryId
    expectedChanges[]
    expectedObservationWindows[]
    naturalUncertaintyWindows[]
  strategyHypothesis
    statement
    assumptions[]
    expectedMechanisms[]
  relevantEvidenceMap[]
    question or contract dimension
    evidenceCapabilities[]
    relevance policy
    expected timing
  successCriteria[]
```

The Forecast Engine consumes this contract. It must never branch on a Goal name,
display label, or hard-coded Goal type. Goal-specific meaning belongs in the
contract.

### Objectives and guardrails

Objectives describe the outcomes the Goal is trying to achieve. Guardrails
describe conditions that must remain acceptable while achieving them. They are
evaluated independently.

Example:

- Objective: gain lean mass.
- Guardrail: maintain body fat within an acceptable range.

Strong Objective support cannot erase a material Guardrail violation. The
Interpretation Engine must return separate Objective and Guardrail conclusions;
the Forecast Engine must preserve that separation in the forecast and
explanation.

### Expected trajectory

Expected trajectory is Goal-owned. It defines:

- what should reasonably happen;
- when it should happen;
- when uncertainty should naturally decline;
- when measurable changes should reasonably appear;
- which quiet periods are expected and should not move confidence;
- when missing or contradictory evidence becomes meaningful.

This prevents early overreaction and gives the Interpretation Engine a semantic
reference other than “more evidence arrived.”

## Evidence model

The Evidence Engine exposes descriptive capabilities, never Goal-specific
importance.

Examples:

- DEXA: lean mass, fat mass, body-fat percentage, regional composition,
  objective body composition.
- Photos: visual composition, softness, muscularity, symmetry, presentation.
- Weight: body-weight trend and variability.
- Training: performance, strength progression, workload, breadth, durability.

Each evidence item must keep three independent dimensions:

### Evidence Strength

How objectively trustworthy the evidence is, including source reliability,
measurement validity, completeness, and quality.

### Evidence Relevance

How informative the evidence is for a specific question in the active Goal
Contract at the current point in its timeline.

### Evidence Agreement

Whether the evidence supports, contradicts, or is neutral relative to the
current strategy hypothesis, expected trajectory, Objective, or Guardrail.

Strength does not imply relevance. Relevance does not imply agreement. Agreement
does not imply strength. The architecture must never collapse these concepts
into one weight or contributor direction.

## Interpretation Engine specification

### Inputs

- Goal Contract;
- Strategy State;
- Execution State;
- descriptive Evidence Descriptors;
- current time and Goal timeline.

### Responsibilities

- determine whether evidence supports expectations;
- determine whether evidence contradicts expectations;
- reconcile conflicting evidence;
- distinguish execution from outcome evidence;
- evaluate progress relative to expected trajectory;
- evaluate every Objective independently;
- evaluate every Guardrail independently;
- identify what remains unknown and why;
- identify evidence candidates capable of resolving the uncertainty.

### Output

```text
StructuredInterpretation
  goalId
  strategyId or strategyRevision
  evaluatedAt
  evidenceCutoff
  objectiveConclusions[]
  guardrailConclusions[]
  trajectoryConclusion
  executionConclusion
  agreements[]
  contradictions[]
  unresolvedUncertainties[]
  decisiveEvidenceCandidates[]
  provenance
```

The output contains no confidence number and no user-facing prose.

## Forecast Engine specification

### Definition

The Forecast Engine answers:

> Given the active Goal Contract, the current strategy, observed execution, the
> structured interpretation, and time remaining, how likely is Goal success
> within the planned timeline without violating its guardrails if the current
> strategy continues?

### Inputs

- Goal Contract;
- Strategy State and stable strategy revision identity;
- Execution State;
- Structured Interpretation;
- timeline state and time remaining;
- prior canonical Forecast Assessment, when one exists;
- Starting Forecast context for a newly activated Goal.

### Canonical outputs

```text
ForecastAssessment
  goalId
  strategyRevision
  timeline
  confidence
  band
  movement
    direction
    magnitude
    delta
  currentForecast
  objectiveForecasts[]
  guardrailForecasts[]
  remainingUncertainty[]
  nextDecisiveEvidence
  explanationFacts[]
  priorForecastRef
  interpretationRef
  provenance
```

`explanationFacts` are structured facts for the Narrative Engine, not final
copy. `nextDecisiveEvidence` identifies the evidence most likely to reduce a
material uncertainty, not simply the next available evidence.

### Starting Forecast

A Goal must not start at a universal percentage. The Starting Forecast considers:

- Goal ambition;
- planned timeline;
- user history;
- previous Goal performance;
- execution history;
- physiological history;
- current baseline;
- strategy quality;
- missing-history uncertainty.

New users naturally start closer to neutral because uncertainty is higher.
Experienced users may start with a stronger forecast when relevant history
supports it. Historical execution can inform the forecast of whether the
strategy will be followed, but it is not itself proof of Goal success.

No Starting Forecast calculation is defined in this foundation patch.

### Movement policy

- Time alone never moves confidence.
- Evidence arrival alone never moves confidence.
- A single workout or weigh-in never moves confidence.
- Repeated semantically identical evidence never moves confidence.
- Small movement requires a defensible change in forecast or uncertainty.
- Large movement requires a meaningful reduction in uncertainty, material
  contradiction, authoritative calibration, strategy change, timeline change,
  or Guardrail event.
- Expected early quiet periods should hold confidence unless evidence materially
  diverges from the trajectory.

Exact thresholds and calculation rules belong to a later implementation patch.

## Narrative Engine contract

The Narrative Engine consumes a canonical Forecast Assessment and produces:

- confidence explanation;
- briefing language;
- Home explanation;
- Goal explanation;
- coaching recommendation language.

It may choose emphasis and voice. It may not recalculate confidence, alter
movement, hide Guardrail problems, substitute execution for outcome, or create a
screen-local forecast.

## Architectural invariants

Confidence must never:

- react to a single workout;
- react to a single weigh-in;
- react merely because additional evidence exists;
- reward evidence quantity;
- hide Guardrail violations behind Objective progress;
- calculate inside presentation;
- calculate independently inside multiple screens;
- become Goal-specific;
- depend on UI.

Additional invariants:

- one active Goal/strategy/timeline boundary has one canonical current forecast;
- immutable history preserves every published predecessor;
- consumers use the same assessment identity for the same cutoff;
- evidence is interpreted once and remains traceable to source;
- forecast calculation is deterministic for a canonical input contract;
- Narrative and UI can be replaced without changing forecast semantics;
- publication cannot silently publish an artifact with a different forecast
  identity from its embedded reference.

## Gap analysis

| Target capability | Current state | Gap |
|---|---|---|
| Confidence is Goal-success forecast | V1 semantic definition is confidence in an evidence-supported progress assessment | Introduce a versioned Forecast Assessment semantic contract. |
| Goal-generic engine | Mapper/scorer explicitly support one Goal, phase, and operating state | Move Goal-specific meaning into Goal Contract and evidence relevance policy. |
| Goal Contract | Goal records contain useful fields/phases but no complete reusable Objectives/Guardrails/Trajectory/Hypothesis/Evidence Map contract | Define an adapter/validator before any V2 scoring. |
| Strategy identity | Operating state and protocols exist across services | Establish a canonical versioned Strategy State and revision identity. |
| Execution separation | Protocol/execution signals are contributors in the same scoring model | Create Execution State and prevent it from being interpreted as Goal outcome. |
| Goal-agnostic Evidence Engine | Interpreters are largely descriptive, but confidence mapper embeds domain/Goal meaning | Introduce descriptive capability contracts and move relevance to Goal Contract evaluation. |
| Strength/Relevance/Agreement separation | Contributor strength, direction, completeness, and phase role are partially represented | Make all three independent first-class fields and remove collapsed fixed domain points. |
| Interpretation Engine | Mapping, reconciliation, reasoning, and scoring are coupled across contributor mapper/scorer/reasoning services | Produce a score-free Structured Interpretation first. |
| Objectives and Guardrails | Current domain states include guardrail-like Photo/Weight/DEXA semantics | Model independent Objective and Guardrail conclusions explicitly. |
| Expected trajectory | Phase trajectory exists mainly in Home/Goal services | Move expected trajectory into the Goal Contract and consume it before forecasting. |
| Starting Forecast | First score uses evidence score or controlled legacy seed; calibration anchor is 50 | Define history-aware, uncertainty-aware Starting Forecast semantics. |
| Remaining uncertainty | V1 stores unresolved uncertainty, largely derived from limiting contributors | Model uncertainty explicitly, including decisiveness and reducibility. |
| Next decisive evidence | Current copy can describe gaps, but canonical assessment has no single next-decisive-evidence contract | Add structured selection after Interpretation, before Narrative. |
| Conservative movement | Context caps and precedence exist | Replace context caps with forecast/uncertainty movement policy tied to meaningful semantic change. |
| Single canonical read | PI read is canonical when valid | Remove semantic legacy fallback after parity and rollout. |
| Persistence and lineage | Strong atomic snapshot/history/seed model exists | Reuse mechanics with a new assessment version; migration design required later. |
| Producers | Multiple adapters and lower-level finalizers exist | Route all triggers through one Interpretation -> Forecast orchestration contract. |
| Consumers | Most current surfaces can read canonical PI; some still prepare legacy fallback | Migrate every consumer to one Forecast read model before expanding UI. |
| Narrative ownership | Briefing presentation mostly consumes canonical fields | Formalize Narrative input and prohibit score calculation or explanation inference in screens. |

## Architectural risks

1. **Semantic migration risk.** Reusing V1 numeric history as if it were V2
   forecast history would create false continuity. V1 values require an explicit
   semantic bridge or a clean V2 starting forecast.
2. **Goal-name leakage.** The current mapper/scorer hard-code one Goal/phase. A
   superficial refactor could merely move those branches rather than introduce a
   real Goal Contract.
3. **Execution inflation.** Adherence is predictive context, but allowing it to
   substitute for outcome evidence would turn confidence into compliance.
4. **Evidence hierarchy leakage.** DEXA is authoritative for some questions, not
   universally. Global domain weights would violate Goal-owned relevance.
5. **Guardrail cancellation.** A single aggregate score can conceal a material
   Guardrail failure unless Objective and Guardrail forecasts remain explicit.
6. **Early overreaction.** Without expected trajectory windows, the forecast may
   punish the absence of outcomes that are not yet physiologically observable.
7. **Trigger inconsistency.** Energy/Training finalizers and cadence/event
   preparation currently use different orchestration shapes; V2 must converge
   without creating a second live series.
8. **Fallback ambiguity.** Keeping the legacy score indefinitely permits two
   meanings of confidence in production.
9. **Narrative drift.** If Narrative infers missing forecast facts, different
   surfaces can explain the same score differently.
10. **Migration blast radius.** Confidence is embedded in immutable briefing and
    event artifacts. Consumer migration must not rewrite historical artifacts.

## Recommended implementation sequence

Each step is a separate bounded patch. None is implemented by this document.

1. **Contract inventory and compatibility fixtures**
   - Freeze representative V1 assessment, snapshot, history, Goal, strategy,
     execution, and evidence fixtures.
   - Add read-only parity tests for current producers/consumers.

2. **Canonical Goal Contract**
   - Define versioned Objective, Guardrail, Timeline, Expected Trajectory,
     Strategy Hypothesis, Evidence Map, and Success Criteria contracts.
   - Add adapters from current Goal records; do not change persistence yet.

3. **Strategy and Execution contracts**
   - Define versioned Strategy State and Execution State.
   - Establish strategy revision identity and strict execution/outcome separation.

4. **Goal-agnostic Evidence Descriptors**
   - Define descriptive evidence capabilities and independent Strength metadata.
   - Preserve current interpreters and provenance; remove no production fields.

5. **Interpretation Engine contract**
   - Build score-free reconciliation with independent Objectives, Guardrails,
     trajectory, contradictions, and uncertainty.
   - Initially run only in fixtures/shadow diagnostics.

6. **Forecast Assessment model**
   - Define versioned V2 identity and output contract, including current forecast,
     uncertainty, and next decisive evidence.
   - Do not implement numeric calculation in the model patch.

7. **Starting Forecast and movement policy specification**
   - Define calibration inputs, conservative movement classes, trajectory timing,
     and large-movement evidence requirements.
   - Approve rules before coding the calculator.

8. **Forecast calculator in shadow mode**
   - Implement deterministic calculations behind a non-persisting diagnostic
     boundary.
   - Compare V1 and V2 semantics; do not expose V2 values to product surfaces.

9. **Persistence/publication versioning design**
   - Decide whether V2 reuses collections with version-discriminated records or
     introduces new collections.
   - Design continuity without treating V1 scores as V2 forecasts.
   - Only then authorize schema, migration, and publication changes.

10. **Single producer orchestration**
    - Route cadence, DEXA, Photo, Energy, Training, phase, and reconciliation
      triggers through one Interpretation -> Forecast preparation contract.
    - Preserve idempotency, cutoff precedence, and atomic publication.

11. **Canonical read migration**
    - Introduce one Forecast read model.
    - Migrate Home, Goals, briefings, events, and recommendations one consumer at
      a time; remove legacy fallback only after parity and observability gates.

12. **Narrative migration**
    - Make Narrative consume structured V2 explanation facts and next decisive
      evidence.
    - Prohibit surface-specific confidence interpretation.

13. **UI rollout**
    - After the engine is canonical, decide where confidence belongs.
    - Adding wheels, dashboards, or new briefing displays is intentionally last.

## Shadow Forecast runtime implementation

The canonical categorical Forecast runtime is isolated in
`src/domain/forecast`. It accepts only a versioned Goal Contract, a validated
Structured Interpretation, and optional Previous Forecast Context. Its input
boundary rejects raw evidence and unknown input fields. Goal-aware evidence
reconciliation remains exclusively owned by Interpretation.

The runtime produces immutable, versioned Forecast Assessments containing Goal,
Objective, Guardrail, trajectory, milestone, Confidence Band, direction,
conservative movement, structured explanation, uncertainty, and Next Decisive
Evidence semantics. It exposes no numeric confidence or probability and creates
no Narrative or presentation copy.

The explicitly invoked shadow runner has no production import, repository,
persistence command, publisher, briefing or Home consumer, renderer, artifact
writer, or notification dependency. Its optional diagnostic sink is bounded and
cannot be enabled by the production environment. Starting Forecast numeric
calibration, production Narrative integration, persistence, publication, and
consumer migration remain future patches.

## Shadow Narrative runtime implementation

The canonical Narrative shadow runtime is isolated in
`src/domain/narrative`. It accepts only a versioned Goal Contract and validated
Forecast Assessment. The Goal input is reduced to identity and semantic metadata;
Goal names, evidence mappings, expected trajectories, strategy records, and
execution records are not read.

The runtime translates Forecast-owned status, categorical Confidence Band,
movement, supporting and limiting factors, remaining uncertainty, and Next
Decisive Evidence into a versioned immutable Narrative Assessment. It also
selects one of five coaching directions without revising the Forecast. Reusable
templates are Goal-generic, unknown Forecast semantics remain untranslated, and
the output contains no JSX, HTML, briefing layout, publication metadata, numeric
confidence, or rendering state.

The Narrative shadow runner is explicitly invoked, has bounded development-only
diagnostics, and has no production import, persistence command, publisher,
Briefing or Home consumer, renderer, artifact writer, or notification dependency.
The complete Goal -> Interpretation -> Forecast -> Narrative reasoning pipeline
therefore exists in shadow mode; publication authorization and all production
consumers remain outside it.

## Foundation acceptance

Confidence V2 implementation may begin only when a later patch can answer all of
these questions without redesign:

- Which engine owns each input and output?
- How does a new Goal describe success without changing Forecast code?
- How are Objectives and Guardrails evaluated independently?
- How are Strength, Relevance, and Agreement kept separate?
- What structured output exists before any score is calculated?
- What makes a Starting Forecast different for a new versus experienced user?
- What semantic change is large enough to move confidence?
- Which evidence is most likely to reduce the current uncertainty?
- How does every consumer receive the same canonical forecast identity?
- How are V1 history and immutable briefing artifacts preserved during rollout?

This document answers the architecture. Later patches must define and validate
the contracts and calculations without weakening these boundaries.
