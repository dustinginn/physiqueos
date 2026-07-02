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
