# PhysiqueOS Algorithm

## Purpose

This document describes how the PhysiqueOS Intelligence Engine transforms health evidence into predictions, confidence, recommendations, and insights.

It intentionally describes algorithmic behavior rather than implementation details.

The mathematical models may evolve.

The decision-making process should remain stable.

---

# Core Objective

The purpose of the Intelligence Engine is **not** to collect data.

It is **not** to maximize integrations.

It is **not** to generate charts.

Its purpose is to continuously reduce uncertainty about a user's future health trajectory and identify the highest-impact next action.

Every algorithm should contribute toward that objective.

---

# Intelligence Loop

```text
Evidence

↓

Normalization

↓

Prediction

↓

Validation

↓

Confidence Update

↓

Recommendation

↓

Insight

↓

User Action

↓

New Evidence
```

This feedback loop never ends.

Every new piece of evidence should improve the personalized model.

The core learning loop can be summarized as:

```text
Evidence -> Interpretation -> Prediction -> Validation -> Model Improvement -> Better Predictions
```

PhysiqueOS should always know whether a new observation confirmed the current model, challenged it, or reduced uncertainty.

---

# Guiding Principles

1. Never claim more certainty than the evidence supports.

2. Prediction quality is more important than data quantity.

3. Confidence measures how well PhysiqueOS understands this individual in this context. Model certainty is the mechanism; user trust is the product.

4. Every recommendation must be explainable.

5. Every prediction should become more accurate over time.

6. The model should learn individuals rather than relying solely on population averages.

7. Additional evidence is valuable only if it meaningfully reduces uncertainty.

---

# Step 1 — Evidence Evaluation

Every incoming observation becomes an Evidence Event.

Each event is evaluated according to characteristics such as:

* source reliability
* timestamp
* recency
* expected variability
* historical consistency
* agreement with existing evidence
* relevance to the active goal

Evidence is never treated equally.

Different evidence contributes different amounts of information.

The objective is not to reward logging.

The objective is to determine how much each observation should influence the model.

---

# Step 2 — Prediction

The Prediction Engine estimates future outcomes.

Examples include:

* projected body fat
* projected weight
* projected lean mass
* goal completion date
* maintenance calories
* expected adherence

Predictions are probabilistic.

They represent the model's current best estimate given available evidence.

Every new Evidence Event may update one or more predictions.

---

# Step 3 — Validation

Whenever new evidence arrives, previous predictions are compared with reality.

Examples:

Prediction:

171.8 lb

Observed:

171.9 lb

Agreement:

Excellent

Prediction:

11.9% body fat

Observed:

12.8%

Agreement:

Low

Validation determines whether the model's assumptions should become stronger or weaker.

High-value calibration events receive special weight because they can validate or correct the model more strongly than routine evidence.

Examples include:

* DEXA
* VO2 Max
* blood work
* RMR

Progress photos can also calibrate visual goals, but they should validate appearance and trend confidence rather than overwrite physiological measurements.

---

# Step 4 — Confidence

Confidence measures how well PhysiqueOS understands the individual well enough to trust its predictions and guidance.

Confidence increases through:

* accurate historical predictions
* reliable evidence
* consistent evidence collection
* stable behavioral patterns
* repeated validation
* calibration events that confirm the model
* reduced uncertainty

Confidence decreases when observations consistently diverge from expectations.

Confidence never measures user effort or compliance.

Confidence should never increase because time passed.

Time only matters when it contains evidence that validates predictions, exposes stable patterns, or reduces uncertainty.

The user-facing Confidence Ring should answer:

**How confident should the user feel that continuing this plan will produce the expected outcome?**

---

# Step 5 — Personalization

The Learning Engine continuously builds a model of the individual.

Examples include:

* water retention
* sodium sensitivity
* travel behavior
* training adaptations
* sleep patterns
* medication response
* adherence tendencies
* seasonal variation

The objective is to replace generalized assumptions with individualized understanding.

---

# Step 6 — Recommendation

Every possible action is evaluated according to its expected value.

Potential actions may:

* improve trajectory
* reduce uncertainty
* increase confidence
* improve adherence
* prevent regression

Only the single highest-value recommendation becomes the Next Best Action.

---

# Step 7 — Insight Generation

Insights explain change.

Examples:

* Confidence increased because recent weigh-ins closely matched our predictions.

* Your projected completion date improved because adherence remained consistent.

* Confidence decreased because recent evidence differed from expected trends.

Insights should always answer:

**Why did something change?**

Daily Briefing is the richest form of insight generation.

It should not merely report metrics.

It should explain the updated belief PhysiqueOS holds after reviewing the latest evidence, predictions, validation results, and remaining uncertainty.

---

# Evidence Sources

The Intelligence Engine accepts evidence from many sources, including:

* Apple Health
* Apple Watch
* Oura
* Garmin
* WHOOP
* DEXA
* Nutrition
* Labs
* Progress Photos
* Manual Logging
* Future Integrations

No evidence source is mandatory.

The engine should remain useful even with minimal data.

More evidence should improve understanding—not become a requirement.

---

# Evidence Prioritization

The Intelligence Engine should estimate the information value of every available evidence stream.

Confidence is influenced by:

* quantity of evidence
* quality of evidence
* relevance to the active goal
* historical reliability

The engine should continually estimate:

* what is already known
* remaining uncertainty
* which additional evidence would most improve confidence

Future onboarding, reminders, and logging recommendations should all be driven by this prioritization.

---

# Inputs vs Outputs

The Intelligence Engine distinguishes between inputs and outputs.

Inputs help explain why outputs changed.

Examples of inputs include:

* Nutrition
* Training
* Protocols
* Medications
* Supplements
* Habits

Outputs determine progress toward goals.

Examples of outputs include:

* Weight
* DEXA
* Progress Photos
* Performance
* Recovery
* Health Metrics

Future reporting should increasingly connect these two domains.

---

# Adaptive Learning

The personalized model should continuously improve.

As evidence accumulates:

* uncertainty decreases
* predictions improve
* confidence becomes more accurate
* recommendations become increasingly personalized

The platform should become more valuable the longer it is used.

---

# Future Research

Potential future enhancements include:

* Bayesian confidence updating
* causal inference for interventions
* personalized physiological models
* multi-goal optimization
* seasonal behavior modeling
* habit prediction
* travel adaptation
* intervention effectiveness modeling
* adaptive protocol optimization

These concepts are experimental.

They should be validated using real-world outcomes before becoming part of the production Intelligence Engine.

---

# Interpretation Layer Boundary

Raw evidence may require interpretation before the Intelligence Engine can use it.

Examples:

* A progress photo may produce `VisualEvidence`.
* A DEXA PDF may produce parsed measurements.
* A voice note may produce structured context.
* A nutrition note may produce estimated intake context.

This interpretation step is not the same as goal evaluation.

The boundary is:

```text
Raw Evidence
  -> Interpreter
  -> Structured Evidence / VisualEvidence
  -> Goal Evaluation
  -> Goal Progress
  -> Trajectory
  -> Recommendations
```

Future AI belongs inside interpreters when it helps extract or describe evidence.

Deterministic services remain responsible for:

* confidence
* goal evaluation
* progress
* trajectory
* recommendations
* Home and Daily Briefing view models

Computed values must never overwrite observed evidence.

## Evidence Reporting vs Interpretation

Evidence Reports are not the Intelligence Engine itself.

Evidence Reports should expose:

* source records
* source quality
* trend visualizations
* history
* related goals
* integrations/data sources

They should not independently decide goal progress, confidence, or recommendations.

Those decisions belong to deterministic goal evaluation, confidence, action, and briefing services.
