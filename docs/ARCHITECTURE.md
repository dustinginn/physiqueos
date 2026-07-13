# PhysiqueOS Architecture

## Purpose

PhysiqueOS is built around a single Intelligence Engine.

Unlike traditional health applications, PhysiqueOS does not treat features as independent products.

Every screen, prediction, recommendation, insight, notification, and future interface is powered by the same underlying intelligence.

The user interface is simply one way of interacting with that intelligence.

---

# Scope

This document describes the logical architecture of PhysiqueOS.

It explains how information flows through the platform.

It does **not** describe the application's folder structure or implementation details.

Implementation details belong in code.

This document describes the system that the code is intended to represent.

---

# High-Level Architecture

The target architecture is one canonical intelligence pipeline:

```text
Raw Evidence
-> Canonical Evidence Objects
-> Canonical Interpreter Layer
-> Canonical Structured Observations
-> Canonical Physiological Model
-> Canonical Narrative / Reasoning Engine
-> Canonical Coaching Engine
-> Presentation Layer
```

The simulator exposes and debugs this pipeline. Production executes the same pipeline and renders its outputs. Daily Briefing, Evidence Pages, Timeline, Chat, Voice, Weekly Review, Monthly Review, notifications, and future experiences should all consume the same canonical outputs rather than reimplementing interpretation, reasoning, or coaching.

Legacy shorthand for the feedback loop:

```
Evidence Sources

↓

Evidence Engine

↓

Goal Engine

↓

Prediction Engine

↓

Confidence Engine

↓

Recommendation Engine

↓

Insight Engine

↓

Presentation Layer

↓

New Evidence
```

This creates a continuous feedback loop.

Every new piece of evidence improves future predictions.

Every prediction improves future recommendations.

Every recommendation generates new evidence.

The Intelligence Engine maintains a personalized physiological model of the user.

Evidence does not merely fill charts. It tests the model.

The canonical learning loop is:

```text
Evidence -> Interpretation -> Prediction -> Validation -> Model Improvement -> Better Predictions
```

Predictions are hypotheses about the user's future trajectory. New evidence either validates those hypotheses, challenges them, or reduces uncertainty.

---

# Core Principle

PhysiqueOS is an intelligence platform.

The interface is simply a window into that intelligence.

The platform's core asset is its evolving understanding of the individual.

As the system learns, the user should also learn how their body responds to nutrition, training, recovery, sleep, protocols, medications, travel, and calibration events.

Every improvement to the Intelligence Engine benefits:

* Consumers
* Coaches
* Providers
* Future AI Assistants
* Future APIs

without rewriting business logic.

---

# Architectural Rules

Evidence always flows toward the Intelligence Engine.

Recommendations always flow away from it.

The user interface never creates intelligence.

It only:

* displays the current state
* collects new evidence
* requests actions

This separation allows every future interface to share the exact same intelligence.

## Presentation Communication Boundary

The Presentation Layer renders understanding, not implementation mechanics.

Internal concepts such as EvidencePackages, canonical objects, interpreters, parsing, structured observations, reconciliation, confidence calculations, repositories, provider paths, and fallback logic belong inside the intelligence and diagnostic layers. They should not appear in user-facing copy.

User-facing surfaces should speak in terms of current understanding, evidence confidence, available evidence, uncertainty, physiology, goal impact, and recommended next evidence.

The engine reasons. The coach explains. The UI communicates.

## Canonical Intelligence and Simulator

The simulator is not a separate implementation of PhysiqueOS intelligence.

The simulator is the debugger, inspector, and visualization layer for the canonical intelligence pipeline. Production must execute the same canonical modules rather than independently rewriting coaching, prompt behavior, narrative prioritization, physiological modeling, or evidence reconciliation.

The boundary is:

* canonical engine modules own interpreters, canonical evidence objects, structured observations, physiological modeling, Narrative Engine behavior, coaching language, evidence reconciliation, and editorial judgment
* simulator owns inspection, debugging, pipeline visualization, golden scenario validation, and Founder QA of engine behavior
* production owns evidence collection, persistence, routing, navigation, UI rendering, session flow, and execution of the canonical pipeline

Every major AI feature should move through:

```text
Design -> Simulator iteration -> Founder approval -> Freeze -> Synchronization pass -> Production QA -> Ship
```

Approved simulator outputs are golden reference cases. Production differences should be treated as canonical pipeline integration regressions unless the simulator has approved a new behavior.

See `docs/INTELLIGENCE_SYNCHRONIZATION.md` for the synchronization contract.

## Engine Contracts

Every engine boundary must have a clear input and output contract:

* Raw Evidence -> Canonical Evidence Objects
* Canonical Evidence Objects -> Canonical Structured Observations
* Canonical Structured Observations -> Canonical Physiological Model
* Canonical Physiological Model -> Canonical Narrative
* Canonical Narrative -> Canonical Coaching Narrative
* Canonical Coaching Narrative -> Presentation

The Narrative Engine should never know where evidence originated. It should never care whether evidence came from an API, screenshot, PDF, manual entry, voice, typed text, or a future integration. Every source must normalize into the same canonical evidence model before reasoning begins.

Production QA should validate contracts in order:

1. Was evidence extracted correctly?
2. Were canonical evidence objects built correctly?
3. Were structured observations generated correctly?
4. Was the physiological model updated correctly?
5. Did the Narrative Engine reason correctly?
6. Did the Coaching Engine produce the correct coaching narrative?
7. Did the Presentation Layer render that narrative correctly?

If the canonical outputs are correct and production still looks wrong, the defect is a presentation bug. If the canonical outputs differ from the approved simulator reference, the defect is an engine or integration bug.

---

# Evidence Engine

## Responsibility

Collect and normalize every source of health evidence.

Examples include:

* Weight
* Apple Health
* Apple Watch
* Oura
* Garmin
* WHOOP
* Nutrition
* DEXA
* Labs
* Sleep
* Progress Photos
* Workouts
* Medication adherence
* Manual entries

Every input becomes an Evidence Event.

Evidence is evaluated for:

* source
* timestamp
* reliability
* completeness
* relationships to existing evidence

The Evidence Engine never makes predictions.

Its responsibility is establishing facts.

---

# Voice Intelligence

Voice Intelligence is a first-class evidence intake subsystem.

Voice is not an AI chatbot. It is a low-friction way for users to tell PhysiqueOS what happened.

The Voice Intelligence boundary is:

```text
Natural Speech
-> Transcription
-> Entity Resolution
-> Intent Routing
-> Parallel Evidence Interpreters
-> Evidence Merge
-> Clarification Ranking
-> Conversation State
-> Canonical Evidence
```

Voice Intelligence ends at Canonical Evidence.

Goal Impact Analysis, Narrative Intelligence, Predictions, Priorities, Recommendations, Coaching, and Daily Briefing belong to the broader Intelligence Engine.

Voice must not create voice-only schemas, repositories, or downstream reasoning paths. It should produce the same canonical evidence objects as screenshots, PDFs, typed evidence, manual entry, APIs, and future integrations. Transcript remains provenance. Canonical evidence remains the source of truth.

See `docs/VOICE_INTELLIGENCE.md` for the authoritative Voice Intelligence specification.

---

# Goal Engine

## Responsibility

Maintain the user's current objective.

The Goal Engine defines:

* active goal
* success criteria
* milestones
* constraints
* expected timeline

Examples:

* Reach 10% body fat
* Maintain weight
* Gain lean mass
* Complete a marathon
* Improve VO₂ Max

Every prediction is evaluated relative to the active goal.

Only one primary goal is active at a time.

Narrative Intelligence sits downstream of goal-relative truth and persistent physiological assessment. It selects what should be communicated without reinterpreting evidence or changing the Goal Engine's conclusions. See `docs/NARRATIVE_INTELLIGENCE.md` for the canonical system boundary, Conversation State, story selection, cadence, and transition-conversation contract.

---

# Prediction Engine

## Responsibility

Estimate future outcomes.

Examples include:

* Projected body fat
* Projected weight
* Projected lean mass
* Goal completion date
* Maintenance calories
* Expected adherence
* Future confidence

Predictions are probabilistic.

They continuously update as new evidence arrives.

Prediction is the core product of PhysiqueOS.

Predictions should be treated as model claims that future evidence can validate or challenge.

Calibration events such as DEXA, VO2 Max, blood work, and RMR should carry special weight because they can correct the physiological model rather than simply add another data point.

---

# Confidence Engine

## Responsibility

Estimate how well PhysiqueOS understands the individual well enough to trust its own predictions and guidance.

Confidence is **not** a measure of user compliance.

Confidence is **not** determined by the amount of data collected.

Confidence is earned through:

* evidence reliability
* historical prediction accuracy
* behavioral stability
* repeated validation
* model consistency

Confidence should increase when uncertainty decreases.

Confidence should never increase because time passed.

It is earned through prediction accuracy, evidence quality, evidence consistency, calibration events, adherence context, model stability, and uncertainty reduction.

The user-facing Confidence Ring should answer:

"How confident should this user feel that continuing this plan will produce the expected outcome?"

---

# Recommendation Engine

## Responsibility

Determine the single highest-impact next action.

The Recommendation Engine always produces one primary recommendation.

Recommendations consider:

* active goal
* active protocols
* current evidence
* prediction confidence
* user history
* expected impact
* schedule
* current context

Every recommendation should explain **why** it exists.

---

# Learning Engine

## Responsibility

Continuously personalize the Intelligence Engine.

The Learning Engine discovers patterns such as:

* water retention
* sodium response
* workout response
* adherence habits
* travel behavior
* sleep trends
* seasonal trends
* behavioral consistency

The objective is personalization.

The Intelligence Engine should become more accurate over time.

---

# Insight Engine

## Responsibility

Explain changes.

The Daily Briefing is the primary expression of the Insight Engine.

It should not behave like a dashboard, report, checklist, or task manager.

It should answer:

"After reviewing everything that happened, what does PhysiqueOS now believe?"

Examples:

Confidence increased because recent weigh-ins matched predictions.

Confidence decreased because weight diverged from the expected trajectory.

Recommendations changed because your recovery improved.

Insights should always be:

* concise
* transparent
* actionable

---

# Plans

A Plan represents a long-term objective.

Examples:

* Summer Cut
* Maintenance
* Lean Bulk
* Marathon Training
* Longevity

A user has one active Plan.

Plans define the destination.

---

# Protocols

Protocols define how the Plan is executed.

Examples:

* GLP-1 schedule
* Supplement schedule
* Protein target
* Weigh-in schedule
* Workout program
* DEXA cadence
* Bloodwork cadence

Protocols influence recommendations.

Protocols also determine which evidence the engine expects to receive.

---

# Evidence Sources

Evidence Sources provide information to the Intelligence Engine.

Examples include:

* Apple Health
* Apple Watch
* Oura
* Garmin
* WHOOP
* MacroFactor
* DEXA
* Smart Scale
* Manual Logging
* Future Integrations

Evidence Sources should never be mandatory.

The platform should remain useful with minimal evidence.

Additional evidence increases confidence—it should never be a requirement.

---

# Presentation Layer

Different products consume the same Intelligence Engine.

## Consumer App

Displays:

* Trajectory
* Confidence
* Next Best Action
* Momentum
* Goals
* Insights

## Coach Platform

Displays:

* Client summaries
* Confidence
* Trajectory
* Intervention suggestions
* Protocol management

## Provider Platform

Displays:

* Population overview
* Patient prioritization
* Clinical insights
* Care pathway support

Each interface presents the same intelligence differently.

The Intelligence Engine remains unchanged.

---

# Long-Term Vision

The long-term objective is to build a digital twin for every user.

Over time, PhysiqueOS should understand an individual's physiology well enough to predict outcomes using that person's own historical behavior rather than relying primarily on generalized population averages.

Every new piece of evidence should improve the model.

Every prediction should become more reliable.

Every recommendation should become more personalized.

The Intelligence Engine should become increasingly accurate for each individual throughout their lifetime.

---

# Interpretation Layer

The Interpretation Layer sits between raw Evidence Sources and the deterministic Intelligence Engine.

Its responsibility is to convert messy inputs into structured interpretation objects that the rest of PhysiqueOS can reason about.

Examples:

* Progress photos become `VisualEvidence`.
* Free-text notes become structured facts and context.
* Voice notes become transcript-backed evidence.
* PDFs become confirmed measurements and report fields.

The Interpretation Layer may eventually use AI, computer vision, OCR, speech recognition, or other models.

However:

* AI interprets reality.
* PhysiqueOS decides what it means.
* Interpreters do not score goals.
* Interpreters do not generate final recommendations.
* Interpreters do not bypass repositories or services.
* Interpreted output must remain traceable to source evidence.

Screens should consume application services, not interpreters directly.

This keeps future AI replaceable while preserving the deterministic product architecture.

---

# Presentation Governance

Application screens should be composed from shared primitives and application services.

Default presentation flow:

```text
Repositories
  -> Domain records
  -> Interpretation / evaluation services
  -> Application briefing/report services
  -> View models
  -> UI components
```

Screens should not:

* query repositories directly when an application service exists
* interpret raw evidence
* define custom design-system surfaces for common patterns
* duplicate drawer, modal, chart, or navigation behavior

Evidence pages use the shared Evidence Report pattern:

```text
Title
Related Goals
Summary
Interactive reporting
Historical reporting
Underlying evidence
Data Sources / Integrations
```

The floating bottom navigation is global app chrome. Long pages must include enough bottom padding for it, and modals must appear above it.
