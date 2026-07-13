# PhysiqueOS Narrative Intelligence

## Status and purpose

This document defines the long-term operating philosophy and system boundary for Narrative Intelligence as a first-class PhysiqueOS intelligence system.

Narrative Intelligence sits after goal-relative physiological assessment and before every user-facing communication surface. It determines what is worth communicating now, how the current communication continues the coaching relationship, and which valid truths should be deferred. It does not determine physiological truth and it does not reinterpret evidence.

This is an architecture contract, not an implementation plan or a UI specification.

## Canonical position

```text
Evidence
  -> Canonical Evidence Objects
  -> Evidence Interpreters
  -> Structured Observations
  -> Goal Engine
  -> Persistent Physiological Assessment
  -> Narrative Intelligence
  -> Communication Surfaces
```

Communication surfaces include Daily Briefing, Home, notifications, goal pages, evidence pages, weekly and monthly reflections, chat, and voice. The Daily Briefing is the highest-bandwidth expression of Narrative Intelligence, not the owner of narrative reasoning.

Simulator intelligence remains canonical. The simulator should expose and debug the same Narrative Intelligence inputs, state transitions, candidate ranking, and outputs that production executes.

## Authority boundary

The Goal Engine and persistent assessment layer determine what is true:

- physiological state and trajectory
- goal progress and phase
- confidence and uncertainty
- protocol adherence
- risks and opportunities
- projections and transition prerequisites
- the evidence supporting each claim

Narrative Intelligence determines what should be communicated:

- today's dominant story
- supporting truths and evidence references
- coaching emphasis and depth
- celebration, concern, or curiosity
- which valid topics to defer
- continuity with prior conversations
- coaching cadence
- whether a conversation branch should begin
- when transition readiness deserves discussion

Narrative Intelligence may rank, select, frame, sequence, and suppress supplied claims. It must never recalculate a metric, infer a new physiological claim, change confidence, override goal status, or turn weak evidence into a stronger conclusion. If an input cannot support a claim, Narrative Intelligence must not manufacture it.

The Coaching Engine remains responsible for decisions and prescribed actions. Narrative Intelligence may emphasize an authoritative recommendation and decide when it deserves discussion; it must not independently invent or optimize the recommendation.

## Current-state review

Narrative Intelligence already exists in partial form:

- `GoalEvaluationService` produces goal-relative findings, confidence, projections, missing evidence, and recommendations.
- `DailyNarrativeEngineService` selects several daily story forms, creates a hero, chooses a coaching theme, and carries a small continuity object.
- `DailyBriefingService` reconciles daily evidence, calculates novelty, reads and updates briefing memory, selects celebrations and watch items, applies editorial judgment, filters repetition, and assembles the presentation model.
- `DailyFocusService` determines time- and schedule-sensitive priorities; these are action inputs, not narrative truth.
- Product and personality documentation define surface purpose and communication tone, but do not yet define durable conversation state or cross-surface narrative governance.

Responsibilities are therefore mixed in three ways:

1. Story selection and continuity are partly in `DailyNarrativeEngineService` and partly in `DailyBriefingService`.
2. Narrative memory is stored as briefing-specific memory, which makes the Daily Briefing the accidental owner of a relationship that should span surfaces and time scales.
3. Briefing assembly contains both domain editorial judgment and presentation shaping. This makes other surfaces likely to reproduce or bypass narrative decisions.

The target architecture should extract these responsibilities conceptually into Narrative Intelligence. This document does not prescribe a migration sequence.

## Inputs

Narrative Intelligence consumes authoritative, structured inputs rather than raw evidence:

- active goal identity, success definition, constraints, and goal phase
- persistent physiological assessment, including trajectory and stability
- authoritative confidence and uncertainty
- goal progress, milestones, risks, opportunities, and projections
- protocol adherence and execution assessment
- authoritative recommendations and priorities from their owning engines
- evidence-backed findings with canonical evidence references
- evidence recency, quality, completeness, and whether a finding is genuinely new
- prior Conversation State
- communication context: surface, cadence, available bandwidth, and trigger
- explicit user responses, confirmations, and preferences

Historical evidence may update persistent assessment and long-running conversation state, but it does not automatically become today's story. A narrative event requires a meaningful change in understanding, a due conversation, or a surface-appropriate continuation.

## Outputs

Narrative Intelligence produces a surface-independent Narrative Decision:

- one primary story and its story class
- the authoritative claim being communicated
- ranked supporting claims and canonical evidence references
- confidence/uncertainty language constraints inherited from the assessment
- coaching emphasis and emotional posture
- selected authoritative action, if one is relevant
- deferred candidates with reasons and reconsideration conditions
- recommended cadence and communication depth
- optional conversation branch decision
- continuity cues linking this story to prior chapters
- Conversation State updates
- transition-conversation status, when relevant
- trace data explaining candidate eligibility, ranking, selection, suppression, and deferral

The output is semantic, not final UI copy. A communication adapter may shorten or format it for a surface, but may not change the chosen truth, priority, confidence, or action.

## Conversation State

Conversation State represents the ongoing coaching relationship. It is internal, durable, goal-aware, and independent of any single briefing or surface.

```text
ConversationState
  identity
    state version
    user
    active goal and goal version
    goal phase
    updated at

  current chapter
    primary story class
    thesis / authoritative claim reference
    opened at
    momentum: opening | developing | reinforcing | resolving | resolved
    supporting claim references
    resolution conditions

  active coaching theme
    theme
    reason
    intensity
    first raised / last raised
    next eligible discussion

  open threads[]
    type: celebration | concern | curiosity | commitment | transition
    authoritative claim references
    status
    question or uncertainty
    evidence or user response needed
    expiry / resolution conditions

  recent communications[]
    surface and cadence
    story class and semantic fingerprint
    claims and evidence references used
    theme and action discussed
    user response, if any

  deferred topics[]
    candidate reference
    deferral reason
    reconsider when
    priority ceiling / expiry

  transition readiness
    assessment status supplied by owning engines
    readiness dimensions
    discussion stage
    user confirmation status

  cadence
    last mini, daily, major, weekly, monthly, and transition events
    fatigue / repetition indicators
```

Conversation State stores references to authoritative assessments and claims, not copied physiological truth. When the assessment changes, stale narrative threads are closed or revised explicitly; history is not rewritten.

State updates should be deterministic and auditable. Every change should identify the Narrative Decision that caused it. Goal changes should close the prior goal chapter while preserving history and start a new goal-scoped chapter without pretending continuity did not exist.

## Story candidate model

A story candidate is an evidence-backed communication opportunity derived from authoritative assessment output. Each candidate should contain:

- story class
- authoritative claim and evidence references
- goal relevance
- materiality
- novelty since last communication
- confidence and uncertainty constraints
- urgency and time sensitivity
- actionability or decision impact
- continuity relationship to the current chapter
- emotional posture: neutral, celebration, concern, or curiosity
- eligibility window and resolution conditions
- collision information for overlapping candidates

Candidate generation may recognize narrative patterns, but it cannot produce new physiological conclusions. For example, it may recognize that an authoritative risk is newly material; it may not independently decide that a plateau exists from raw weights.

## Selecting one dominant story

Every Daily Briefing has one dominant narrative. Other content must support, qualify, or remain subordinate to it.

Eligibility is evaluated before ranking. A candidate is ineligible when its claim is unsupported, stale without a continuity reason, inappropriate for the surface, already resolved, below its confidence threshold, or blocked by a higher-authority uncertainty constraint.

Eligible candidates are ranked in this order of concern:

1. **Safety or emerging material risk** — a trusted assessment says the current course may cause harm, goal failure, or material regression.
2. **Decision-changing transition** — the current phase or plan may need to change, including readiness to begin a goal-transition conversation.
3. **Required behavior change or commitment** — execution is materially affecting the goal and an authoritative action exists.
4. **Breakthrough or meaningful state change** — a milestone, plateau resolution, preservation result, or other change materially updates the goal story.
5. **Evidence confirmation or confidence change** — new evidence strengthens, weakens, or meaningfully qualifies the current assessment.
6. **Protocol success or execution reinforcement** — adherence is working and reinforcement improves continued execution.
7. **Celebration** — genuine progress deserves recognition even when it does not change the plan.
8. **Continuity** — no new event outranks the current chapter, so the coach advances or responsibly holds the existing story.

Story classes such as execution, confidence, breakthrough, plateau, preservation, emerging risk, transition, celebration, evidence confirmation, behavior change, and protocol success are classifications, not a permanently fixed priority list. Ranking within and across classes should use:

- severity and consequence
- goal impact
- whether a decision changes today
- magnitude and durability of the assessment change
- confidence appropriate to the claim
- novelty
- time sensitivity
- continuity value
- unresolved-thread value
- repetition cost
- surface fit

Risk does not always win merely because it exists; it wins when authoritative assessment marks it material and communication is timely. Celebration does not disappear behind endless optimization. When candidates are close, prefer the one that advances an unresolved high-value conversation rather than starting a disconnected topic.

Supporting stories must explain or substantiate the dominant story. Unrelated truths are deferred, not compressed into an omnibus briefing.

## Deferral and repetition

Deferral is an explicit narrative decision, not data loss. A deferred topic records why it was omitted and what should make it eligible again: new evidence, increased materiality, a cadence boundary, resolution of the current chapter, or a requested user discussion.

Repetition is appropriate when:

- an unresolved action remains materially important
- the user has not answered a necessary question
- new evidence advances the same chapter
- reinforcement is part of the current goal phase
- risk remains both material and actionable

Repetition should be suppressed when the semantic claim, evidence, action, and context have not changed and no response is due. Copy variation alone does not create novelty.

## Conversation continuity

Each narrative decision should relate to the current chapter in one of five ways:

- **Open** a chapter because a meaningful new story displaces the prior one.
- **Develop** it with new evidence, a response, or a changed implication.
- **Reinforce** it when repetition has coaching value.
- **Resolve** it when authoritative conditions or explicit user input settle the issue.
- **Hold** it quietly when nothing useful needs to be said.

An open thread must specify what could resolve it. Resolution may come from authoritative evidence, elapsed protocol time, a user answer, execution of an action, or a goal/phase change. Natural endings should be recorded so resolved topics do not repeatedly return as novelty.

The engine should compare semantic fingerprints—claim, evidence, implication, action, and thread—not just rendered sentences. This makes months of communication feel continuous across surfaces without relying on copy matching.

## Narrative evolution by goal phase

Goal phase is authoritative input. Narrative Intelligence changes emphasis gradually by adjusting candidate priors and cadence; it never changes the underlying assessment.

### Early cut

Emphasize consistency, establishing trustworthy baselines, reducing uncertainty, and learning how the user responds. Avoid over-celebrating noise or forecasting with unwarranted precision.

### Middle cut

Emphasize execution, reinforcement, trend confirmation, useful personalization, and whether the plan is producing the expected response.

### Late cut

Emphasize preservation, recovery, confidence appropriate to evidence quality, sustainability, success-definition alignment, and gradual transition preparation.

### Maintenance

Emphasize stabilization, sustainability, range tolerance, identity and habit durability, and early detection of drift without treating normal variation as failure.

### Lean bulk

Emphasize productive gain, training performance, recovery, sufficient intake, restraint against excessive gain, and periodic calibration of whether gain quality remains acceptable.

Phase evolution should use hysteresis: a stable phase assessment, repeated supporting signals, or an explicit goal event is required before the narrative posture shifts. A single noisy observation must not abruptly change the relationship's tone.

## Coaching cadence and depth

Cadence is selected from communication need, not merely the passage of time.

### Mini Briefing

A compact acknowledgment for a narrow, timely update. Use when one new fact deserves context but does not change the current chapter, plan, or confidence materially.

### Daily Briefing

The standard high-bandwidth daily expression. Use when the user opens the daily surface or a scheduled daily decision is due. It communicates one dominant story, its support, and any relevant authoritative action. A no-change day may responsibly continue or hold the current chapter.

### Major Coaching Event

Use when a material risk, breakthrough, plan-changing assessment, confidence discontinuity, or urgent decision should interrupt normal cadence. Major does not mean verbose; it means consequential.

### Weekly Reflection

Use at a weekly boundary when enough evidence exists to synthesize execution, response, unresolved threads, and the next week's emphasis. It should integrate daily chapters rather than replay them.

### Monthly Reflection

Use at a monthly or meaningful calibration boundary to examine longer-term adaptation, prediction calibration, strategy effectiveness, and whether the broader goal story is evolving.

### Goal Transition Conversation

Use when transition readiness is sufficiently supported to begin an explicit, staged conversation. It is not an automatic goal change and must culminate in user confirmation before Goal Builder takes over.

Cadences can coexist only when their jobs differ. A major event may replace that day's dominant story; a weekly reflection should not cause the Daily Briefing to repeat the same synthesis separately.

## Conversation branches

Narrative Intelligence may decide that a question is more valuable than another declaration. It produces a branch decision and rationale, not UI.

- **Curiosity** — ask for context that could explain an authoritative uncertainty or improve personalization.
- **Confirmation** — verify that an inferred preference, constraint, or interpretation matches the user's lived experience.
- **Commitment** — invite an explicit choice when an authoritative action requires user ownership.
- **Evolution** — explore changing priorities, sustainability, or a possible next goal when the current chapter is maturing.
- **Reflection** — ask the user to interpret experience, tradeoffs, or what made execution succeed or fail.

A branch is appropriate only when the answer can change assessment inputs, coaching decisions, personalization, or the next conversation. The engine should know the question's purpose, expected answer type, owning consumer, expiry, and how the response resolves or advances a thread. It should not ask for information already present in canonical evidence or use questions as decorative engagement.

Branch frequency should respect conversation fatigue. One unresolved high-value question normally outranks several low-value questions.

## Transition readiness

Transition readiness is a conversation threshold, not a body-fat threshold and not permission to create a goal.

The authoritative input should combine:

- physiological confidence and stability
- progress against the active goal and its full success criteria
- evidence quality, recency, and agreement
- user-defined success, including visual or performance outcomes where applicable
- sustainability, recovery, and execution burden
- unresolved risks or preservation concerns
- explicit user preference and confirmation

Narrative Intelligence decides when this body of truth is mature enough to discuss. It should stage the conversation:

1. **Not relevant** — remain focused on the active goal.
2. **Emerging** — gently introduce that a future decision is approaching.
3. **Explore** — open an evolution branch about success, sustainability, and preferences.
4. **Ready for confirmation** — summarize the authoritative case and ask whether the user wants to transition.
5. **Confirmed** — hand off explicit intent and authoritative context to Goal Builder.
6. **Deferred** — preserve the current goal and record why the user chose not to transition.

Narrative Intelligence never activates, edits, or constructs the new goal. Goal Builder owns creation; the Goal Engine owns the resulting truth.

## Surface governance

All surfaces consume the same Narrative Decision and Conversation State, scoped to their bandwidth:

- Home previews the dominant story and action.
- Daily Briefing gives the fullest daily explanation.
- Notifications communicate only timely, interruption-worthy fragments.
- Goal pages show goal-specific chapter context and transition status.
- Evidence pages explain how the selected canonical evidence supports an existing claim; they do not generate a competing story.
- Weekly and monthly reflections operate at their respective time horizons.
- Chat and voice may continue an approved branch, but cannot create a separate narrative truth.

A surface may omit detail. It may not select a contradictory dominant story, strengthen certainty, create a new recommendation, or mutate Conversation State without a recognized narrative event.

## Auditability and integrity

Every Narrative Decision should be explainable through a trace:

- assessment version and goal context consumed
- candidates considered
- eligibility decisions
- ranking factors
- selected dominant story
- supporting and deferred topics
- confidence language constraints
- prior state read and next state written
- branch and cadence decisions
- canonical claim and evidence references

Narrative history is append-oriented. Corrections create new canonical evidence and a new assessment; subsequent narrative may explicitly correct the story, but prior communications remain historical records of what was known then.

## Documentation ownership

This dedicated document should be the canonical specification because Narrative Intelligence spans algorithm, product behavior, personality, and multiple presentation surfaces.

- `ARCHITECTURE.md` should locate the system and link here for its contract.
- `ALGORITHM.md` should describe narrative selection as a downstream step after authoritative assessment and link here for ranking and state semantics.
- `PRODUCT.md` should define each surface's question and bandwidth without duplicating engine mechanics.
- `PERSONALITY.md` should govern wording, tone, transparency, and emotional posture after a Narrative Decision has been made.

Detailed rules should not be copied across those documents. This file owns Narrative Intelligence boundaries, state, selection, continuity, cadence, branches, and transition-conversation readiness.

## Architectural invariants

1. The Goal Engine determines truth; Narrative Intelligence communicates it.
2. Narrative Intelligence never consumes raw source-specific evidence as a reasoning shortcut.
3. One communication event has one dominant story.
4. Valid but lower-priority truths are deferred explicitly, not silently lost.
5. Conversation State belongs to the coaching relationship, not to the Daily Briefing.
6. Surfaces adapt bandwidth, not truth or priority.
7. Coaching actions come from the engines that own decisions.
8. Transition discussion precedes and remains separate from goal creation.
9. Narrative history is auditable and is not rewritten after evidence corrections.
10. Simulator and production execute the same narrative intelligence.
