# PhysiqueOS Intelligence Engine

## 1. Purpose

PhysiqueOS is not merely a tracker.

It is an evidence-driven operating system for goal achievement.

The Intelligence Engine defines how PhysiqueOS transforms observed evidence into understanding, confidence, recommendations, and Home briefings.

This document sits above `docs/ALGORITHM.md`.

`docs/ALGORITHM.md` explains calculations.

`INTELLIGENCE_ENGINE.md` explains how PhysiqueOS thinks.

---

## 2. Core Philosophy

The product should not ask users to interpret raw health data alone.

Every new piece of evidence should help PhysiqueOS answer:

* What changed?
* Why does it matter?
* How certain are we?
* What should the user do next?

The goal is not to maximize charts, logs, or integrations.

The goal is to reduce uncertainty and help the user take the highest-leverage action toward the primary goal.

PhysiqueOS builds a personalized physiological model of the user.

That model should learn how the user responds to nutrition, training, recovery, sleep, protocols, medication, supplements, travel, and calibration events.

The core learning loop is:

```text
Evidence -> Interpretation -> Prediction -> Validation -> Model Improvement -> Better Predictions
```

Prediction is the core value proposition.

Evidence exists because it helps PhysiqueOS validate, challenge, or improve its understanding of the user's trajectory.

The Daily Briefing is the primary intelligence experience. It does not behave like a dashboard, report, checklist, or task manager. It explains the updated belief PhysiqueOS holds after reviewing the latest evidence, predictions, validation results, and uncertainty.

---

## 3. Intelligence Flow

```text
Evidence
  -> Normalization
  -> Repository Storage
  -> Analysis
  -> Prediction
  -> Validation
  -> Model Improvement
  -> Confidence Update
  -> Goal Evaluation
  -> Goal Progress
  -> Recommendation Ranking
  -> Daily Briefing
  -> Home Decision Surface
  -> User Action
  -> New Evidence
```

This loop is continuous.

PhysiqueOS becomes more useful as evidence accumulates, predictions are tested, and recommendations become more personalized.

Every loop should improve both the system and the user:

* PhysiqueOS learns the user's physiology.
* The user learns how their body responds.
* Future predictions become more accurate.
* Recommendations become more relevant.

---

## 4. Evidence

Evidence represents observed facts.

Examples:

* morning weight
* DEXA scan
* progress photo
* protocol change
* nutrition log
* sleep data
* activity data
* daily check-in

Evidence is not interpretation.

Evidence should preserve source metadata, provenance, timestamp, reliability, and whether each field was imported, manually entered, estimated, or computed.

Observed evidence should remain immutable except for explicit correction workflows.

---

## 5. Analysis

Analysis is generated interpretation.

It explains what changed, why it matters, how confidence changed, how Home changed, and what the recommendation is.

An Analysis record is created whenever meaningful new evidence enters PhysiqueOS.

Analysis is different from evidence:

* Evidence: "DEXA measured body fat at 10.7%."
* Analysis: "Body fat decreased materially, confidence increased because DEXA is a calibration source, and the next priority is preserving lean mass."

Analysis records should be immutable once created so users can revisit the reasoning that existed at a point in time.

---

## 6. Confidence

Confidence represents how well PhysiqueOS understands this individual in this context.

High confidence means PhysiqueOS has enough validated understanding to trust its current interpretation, predictions, and guidance.

Low confidence means the model needs more evidence, better calibration, or more validated predictions before it should speak with certainty.

Confidence may increase when:

* predictions match observed outcomes
* high-reliability evidence confirms the model
* evidence is recent enough for the goal
* behavior patterns are stable
* calibration events validate prior assumptions
* uncertainty meaningfully decreases

Confidence may decrease when:

* evidence conflicts
* evidence is stale
* predictions miss observed outcomes
* a new protocol changes context
* important data is missing

Confidence should never shame the user.

It describes the model, not the person.

Confidence should never increase simply because time passed.

Time matters only when it contains evidence that validates predictions, reveals stable patterns, or reduces uncertainty.

The Confidence Ring exists for the user. It should answer:

"How confident should I feel that continuing this plan will produce the expected outcome?"

---

## 7. Goal Graph

Goals form a dependency graph, not a flat checklist.

A primary goal may depend on supporting goals, constraints, and evidence requirements.

Example:

```text
Visible abs at rest
  depends on:
    maintain 8-9% body fat
    preserve lean mass
    manage water retention
    maintain adherence
    validate with DEXA/photos
```

The Goal Graph helps PhysiqueOS identify which supporting objective is currently limiting progress toward the primary goal.

Recommendations should optimize for the graph, not for isolated tasks.

Goal Evaluation is the canonical interpretation layer between evidence and goal progress.

```text
Evidence
  -> GoalEvaluationService
  -> GoalIntelligenceService
  -> HomeBriefingService
  -> Home
```

Goal Evaluation answers:

* what evidence supports the goal
* what evidence is missing
* what improved
* what has not improved
* what risks exist
* what increases confidence
* what decreases confidence
* what the user should do next

Progress percentage is only one compact representation of that evaluation. It is not the source of truth.

Founder Alpha goal status is derived from repository evidence through deterministic evaluations.

The first implementation is intentionally conservative:

* Visible Abs is qualitative and provisional. DEXA, weight trend, progress photo consistency, lean mass preservation, and protocol context can support the goal, but PhysiqueOS should not claim computer vision or visual scoring exists.
* Body fat status is anchored to DEXA calibration evidence.
* Lean mass status is anchored to DEXA lean mass and remains confidence-limited between scans.
* Projected finish should be a range only when enough evidence exists. Otherwise it should remain `Pending`.

---

## 8. Calibration Events

Calibration events are high-value evidence that can reset, validate, or challenge the physiological model.

Examples include:

* DEXA
* VO2 Max
* blood work
* RMR
* progress photos for visual goal validation

DEXA calibrates body composition estimates.

VO2 Max calibrates aerobic capacity.

Blood work calibrates internal health context.

RMR calibrates energy expenditure assumptions.

Progress photos visually validate appearance-based goals such as visible abs at rest.

Calibration events do not erase prior evidence.

They help PhysiqueOS reinterpret trends, update confidence, and improve future predictions.

---

## 9. Evidence Freshness

Different evidence types have different freshness windows.

Examples:

* Morning weight may become stale quickly for day-to-day decisions.
* DEXA remains valuable longer but should not be treated as current forever.
* Progress photos are useful for visual validation but need consistent context.
* Protocol changes are fresh when they alter current physiology or behavior.
* Sleep and activity are most useful when recent and repeated.

Freshness affects confidence and recommendation priority.

Stale evidence may still be historically useful, but it should not drive current decisions without context.

---

## 10. Recommendation Engine

The Recommendation Engine identifies the highest-leverage action for the primary goal.

Recommendations may ask the user to:

* take action
* add evidence
* maintain course
* avoid overreacting
* review a protocol
* calibrate with DEXA or photos
* resolve conflicting data

Every recommendation should be traceable back to evidence.

A recommendation should explain why it matters now.

---

## 11. Recommendation Priority

Recommendation priority should consider:

* relevance to the primary goal
* expected impact
* evidence reliability
* evidence freshness
* confidence change
* urgency
* reversibility
* user burden
* risk of overreaction

The top recommendation becomes the Next Best Action.

PhysiqueOS should prefer one clear action over a noisy list.

---

## 12. Home Briefing

Home is a decision surface, not a dashboard.

It should summarize the current state of the user's goal pursuit and answer:

* Where am I?
* What changed?
* How confident is the system?
* What matters most today?
* What should I do next?

Home should be composed from service-generated view models, not raw repositories or fixture files.

The UI should display understanding, not force the user to assemble it manually.

`HomeBriefingService` composes goal intelligence, daily focus, momentum, latest analysis, and navigation into the exact view model Home consumes. Home components should not calculate goal progress, infer freshness, or query repositories directly.

Home consumes compact output from Goal Intelligence: progress, confidence, concise summary, and trajectory metadata. It should never expose the internal evaluation structure. Goal Detail, Coach, Analysis, and Timeline can later use the richer `findings`, `recommendations`, `confidenceFactors`, and `missingEvidence` arrays from Goal Evaluation.

Daily Focus is generated from recurring evidence expectations, protocol schedules, and same-day completion evidence. It should keep stable habit/reminder labels while changing completion state and priority based on the day and context.

---

## 13. Daily Briefing

Daily Briefing is the primary Intelligence Engine expression.

It should answer:

"After reviewing everything that happened, what does PhysiqueOS now believe?"

The briefing should not become:

* a dashboard
* a report
* a checklist
* a task manager
* a statistics recap

It should create continuity:

what changed -> why it matters -> what PhysiqueOS now believes -> what the user should understand.

Evidence belongs in the briefing only when it justifies an updated belief, validates or challenges a prediction, explains uncertainty, or improves user understanding.

Execution belongs in Home, Notifications, and Priority Cards.

The detailed briefing specification lives in `docs/DAILY_BRIEFING.md`.

---

## 14. Latest Analysis

Latest Analysis lets users revisit the interpretation of recent evidence.

Home displays the current state.

Latest Analysis explains how the system arrived there.

It should preserve:

* the evidence considered
* the findings generated
* confidence before and after
* Home changes
* the recommendation at that time

This gives PhysiqueOS memory and accountability.

---

## 15. Computed vs Observed

Computed values must never overwrite observed evidence.

Observed evidence is source-of-truth input.

Computed values are derived interpretation.

Examples:

* A DEXA body fat percentage is observed evidence.
* A projected body fat trend is computed.
* A manual morning weight is observed evidence.
* A rolling weight trend is computed.
* A progress photo is observed evidence.
* A visual definition score is computed or assessed.

Computed values should remain traceable to the evidence and algorithm version that produced them.

---

## 16. Intelligence Principles

1. Evidence is observed input.

2. Analysis is generated interpretation.

3. Confidence describes how well PhysiqueOS understands the individual in context.

4. Goals are connected through dependencies.

5. Calibration events improve the model.

6. Freshness changes how evidence should be weighted.

7. Recommendations should optimize for the primary goal.

8. Every recommendation should be explainable and traceable.

9. The user should never have to decode raw data alone.

10. Every interaction should leave the user with more clarity.

---

11. Prediction is the product.

12. The Daily Briefing explains updated belief, not raw evidence.

---

## 17. North Star

PhysiqueOS should make the user feel less alone with their data.

After entering new evidence, the user should understand what changed, why it matters, how much to trust it, and what to do next.

The north star is clarity that compounds.

The longer PhysiqueOS knows the user, the better it should become at turning evidence into confident action.
