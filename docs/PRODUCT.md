# PhysiqueOS Product

## Mission

PhysiqueOS is a personal health operating system that helps people make better health decisions by continuously reducing uncertainty.

Rather than asking users to interpret dozens of disconnected health metrics, PhysiqueOS synthesizes evidence from multiple sources into predictions, confidence, and actionable guidance.

Its purpose is simple:

Help people understand where they're headed and what they should do next.

---

# Vision

We believe the future of personal health is not more tracking.

It is better understanding.

Apple Health stores data.

Wearables collect data.

Nutrition apps organize data.

PhysiqueOS transforms health data into predictions, confidence, and recommendations.

Our goal is to become the intelligence layer that sits on top of every meaningful health input a user already has.

---

# Product Philosophy

Everything in PhysiqueOS exists to answer three questions:

1. Where am I headed?
2. How confident are we in that prediction?
3. What should I do next?

If a feature does not improve one of those three answers, it probably does not belong in the product.

---

# Physiological Model

PhysiqueOS is not simply collecting evidence.

It is continuously building a personalized physiological model of the user.

That model should explain how the individual responds to:

* nutrition
* training
* recovery
* sleep
* medication
* supplements
* travel
* protocols
* calibration events

Evidence improves the model.

The model produces predictions.

Future evidence validates or challenges those predictions.

This loop is the product:

```text
Evidence
  -> Interpretation
  -> Prediction
  -> Validation
  -> Model Improvement
  -> Better Predictions
```

The goal is not data collection.

The goal is understanding.

---

# Product Architecture

Every major screen answers a different question.

Home:

How am I doing today?

Daily Briefing:

What does PhysiqueOS now believe?

Goal Detail:

Tell me everything about this specific goal.

Goals Hub:

What am I working toward overall?

Progress:

What evidence do we have?

Profile:

How should PhysiqueOS work for me?

This separation of responsibilities is intentional.

Pages should complement one another rather than duplicate information.

---

# Core Principles

1. Confidence measures the certainty of our predictions—not the quality of the user.

2. Every recommendation explains why it matters.

3. Every piece of health information is treated as evidence.

4. We never ask users for data unless we can explain how it improves understanding or recommendations.

5. The Home screen should answer the user's most important questions in under fifteen seconds.

6. PhysiqueOS should reduce thinking, not create more of it.

7. The Intelligence Engine should become increasingly personalized by learning the individual rather than relying primarily on population averages.

---

# What PhysiqueOS Is

PhysiqueOS is a personal health operating system.

It continuously evaluates health evidence, updates predictions, measures confidence, and recommends the next best action to help users achieve meaningful health goals.

---

# What PhysiqueOS Is Not

PhysiqueOS is not:

* A calorie tracker
* A macro tracker
* A workout logger
* A reminder app
* A wearable dashboard
* A chatbot
* A repository for health data

Those products already exist.

PhysiqueOS exists to help people make better health decisions.

---

# Product Modules

The application is organized into modular experiences.

## Current Modules

* Home
* Timeline
* Goals
* Coach
* Profile

## Future Modules

* Nutrition
* Recovery
* Labs
* DEXA
* Progress Photos
* Supplements
* Protocols
* Reports
* Insights

Every module exists to improve progress toward the user's active goal.

No module should become an isolated product.

---

# Home

The Home screen is the daily operating surface.

It should feel calm, glanceable, and action-oriented. It should not become a dashboard or duplicate the full Daily Briefing.

Within fifteen seconds the user should understand:

1. Can I trust where I'm headed?
2. What should I do today?
3. How am I progressing toward my goals?
4. What changed since the last time I opened the app?

The Home screen should always surface the single highest-impact next action.

The Daily Briefing is the richer intelligence experience. It is not a dashboard, report, checklist, or task manager. It presents the Intelligence Engine's updated belief after reviewing the latest evidence, predictions, calibration status, uncertainty, and goal context.

---

# Plans

Users work toward a Plan.

Examples include:

* Summer Cut
* Lean Bulk
* Marathon Training
* Maintenance
* Longevity
* Vacation

A Plan defines the destination.

---

# Protocols

Plans contain one or more Protocols.

Protocols define recurring actions.

Examples include:

* GLP-1 schedule
* Supplement schedule
* Morning weigh-ins
* Protein targets
* Cardio
* Resistance training
* DEXA cadence
* Bloodwork cadence

Protocols influence recommendations and help determine the Next Best Action.

---

# Next Best Action

The Home screen always presents one recommendation.

That recommendation is determined using the user's:

* Active Plan
* Active Protocols
* Current evidence
* Prediction confidence
* Schedule
* Personal history

Every recommendation explains why it matters.

---

# Intelligence Engine

The Intelligence Engine powers every prediction, recommendation, and insight in PhysiqueOS.

Its logical architecture—including the Evidence Engine, Prediction Engine, Confidence Engine, Recommendation Engine, Learning Engine, and Insight Engine—is documented in **ARCHITECTURE.md**.

This separation allows the product to evolve independently of its implementation.

---

# Long-Term Vision

Over time, PhysiqueOS becomes a digital model of the individual.

Rather than simply storing health data, it learns how that specific person responds to nutrition, training, recovery, sleep, travel, medication, and lifestyle.

The product becomes more valuable because it continuously improves its understanding of one person.

Every prediction becomes more accurate.

Every recommendation becomes more personalized.

Every decision becomes more confident.

---

# Interpretation Principle

PhysiqueOS can use AI to help interpret evidence, but AI is not the product's source of truth.

The product principle is:

> AI interprets reality. PhysiqueOS decides what it means.

For example, a future visual model may describe progress-photo observations. Those observations become structured evidence. Goal evaluation, confidence, recommendations, and Daily Briefing guidance still flow through the Intelligence Engine.

This keeps the experience explainable, auditable, and grounded in evidence rather than opaque model output.

---

# Product Consistency Rules

Home, Daily Briefing, Goals, and Evidence Hub each have a distinct job.

* Home answers what matters now.
* Daily Briefing explains what PhysiqueOS now believes and what the user should understand.
* Goal Detail explains why a goal is progressing.
* Evidence Hub shows what evidence exists.

Avoid duplicating the same explanation across these surfaces. Prefer progressive disclosure: compact on Home, synthesized in Daily Briefing, goal-specific on Goal Detail, source-specific in Evidence Reports.

Every new workflow should preserve:

* repository boundaries
* service-generated view models
* semantic design-system surfaces
* traceability from recommendation back to evidence
