# PhysiqueOS Product Decisions

This document records significant product and architectural decisions.

The purpose is to preserve intent, avoid repeating past debates, and provide context for future development.

These decisions should outlive individual implementations.

---

# Decision Format

Every new decision should include:

* Date
* Decision
* Reason
* Status

Optional:

* Alternatives Considered

Status should be one of:

* Accepted
* Experimental
* Superseded
* Rejected

New decisions should be appended rather than rewriting historical ones whenever practical.

---

## 2026-06-27

### Decision

PhysiqueOS is a personal health operating system, not a tracking application.

### Reason

Health data already exists across many products.

Our value is understanding that data, reducing uncertainty, and helping users make better decisions.

### Status

Accepted

---

## 2026-06-27

### Decision

The Home screen is a daily briefing, not a dashboard.

### Reason

Users should immediately understand:

* Am I on track?
* What should I do next?
* What changed?

The Home experience should take less than fifteen seconds to understand.

### Status

Accepted

---

## 2026-06-27

### Decision

Confidence measures model certainty, not user performance.

### Reason

Confidence represents how strongly PhysiqueOS believes its own prediction based on available evidence and historical validation.

Users should never feel judged by the confidence score.

### Status

Accepted

---

## 2026-06-27

### Decision

Confidence increases through validation, not simply additional data.

### Reason

A user who provides fewer but consistently accurate evidence sources should be able to achieve very high confidence.

The model earns confidence by repeatedly predicting reality correctly.

More integrations may accelerate learning but should never be required.

### Status

Accepted

---

## 2026-06-27

### Decision

Every health input is treated as evidence.

### Reason

Apple Watch, Oura, DEXA, nutrition logs, labs, photos, and weigh-ins are all evidence sources.

PhysiqueOS evaluates evidence rather than rewarding logging behavior.

### Status

Accepted

---

## 2026-06-27

### Decision

The Home screen always presents a single Next Best Action.

### Reason

Reducing cognitive load improves adherence.

Users should never wonder what to do next.

The Recommendation Engine determines the highest-impact action available.

### Status

Accepted

---

## 2026-06-27

### Decision

Plans contain Protocols.

### Reason

Users think in terms of goals and plans.

The system executes those plans through structured protocols such as medications, weigh-ins, workouts, nutrition targets, supplements, and recurring health tasks.

Protocols dynamically influence recommendations and expected evidence.

### Status

Accepted

---

## 2026-06-27

### Decision

Reminders are protocol-driven, not time-driven.

### Reason

PhysiqueOS should not become another reminder application.

Notifications exist to reinforce adherence to an active protocol and explain why today's action matters.

### Status

Accepted

---

## 2026-06-27

### Decision

The same Intelligence Engine powers consumers, coaches, and providers.

### Reason

Different user types require different interfaces, not different intelligence.

Consumers receive guidance.

Coaches receive client insights.

Providers receive clinical decision support.

### Status

Accepted

---

## 2026-06-27

### Decision

Every request for additional evidence must explain its benefit.

### Reason

The application should never ask users to connect a device or log data without explaining how it improves confidence, recommendations, or predictions.

### Status

Accepted

---

## 2026-06-28

### Decision

Prediction is the product.

### Reason

Metrics, wearables, nutrition logs, DEXA scans, laboratory results, and other health data exist only because they improve predictions and recommendations.

PhysiqueOS should optimize for predictive accuracy rather than collecting the greatest amount of data.

### Status

Accepted

---

## 2026-06-28

### Decision

Build systems, not screens.

### Reason

Reusable primitives improve consistency, maintainability, and development speed.

Screens should be assembled from reusable components instead of containing page-specific implementations.

### Status

Accepted

---

## 2026-06-28

### Decision

Information should be progressively disclosed.

### Reason

Users should immediately understand what matters most.

Additional detail should be available as users explore deeper into the application.

Reducing cognitive load improves understanding and long-term adherence.

### Status

Accepted

---

## 2026-06-28

### Decision

The Intelligence Engine is platform-independent.

### Reason

The same intelligence should power mobile apps, web applications, coach dashboards, provider portals, APIs, and future AI experiences.

Presentation layers may change.

The Intelligence Engine should remain consistent.

### Status

Accepted

---

## 2026-06-28

### Decision

Every recommendation must be explainable.

### Reason

Users should understand why PhysiqueOS is recommending an action.

Transparent reasoning builds trust and improves long-term engagement.

Recommendations should never feel arbitrary.

### Status

Accepted

---

## 2026-07-02

### Decision

PhysiqueOS builds a personalized physiological model.

### Reason

The product is not merely collecting evidence or summarizing metrics.

Evidence exists to help PhysiqueOS interpret the user's current state, predict what is likely to happen next, validate those predictions, improve the model, and make better future predictions.

The canonical learning loop is:

Evidence -> Interpretation -> Prediction -> Validation -> Model Improvement -> Better Predictions.

### Status

Accepted

---

## 2026-07-02

### Decision

Confidence represents earned understanding of the individual.

### Reason

Confidence is not a reward, adherence score, or passive function of time.

It is earned through prediction accuracy, evidence quality, evidence consistency, calibration events, adherence context, model stability, and uncertainty reduction.

The user-facing Confidence Ring should answer:

"How confident should this user feel that continuing this plan will produce the expected outcome?"

### Status

Accepted

---

## 2026-07-02

### Decision

Daily Briefing explains updated belief, not raw evidence.

### Reason

The Daily Briefing is the primary expression of the Intelligence Engine.

It should answer:

"After reviewing everything that happened, what does PhysiqueOS now believe?"

Home, Notifications, and Priority Cards handle execution. Daily Briefing explains meaning, prediction, validation, confidence, uncertainty, and what the user should understand.

### Status

Accepted
