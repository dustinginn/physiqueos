# PhysiqueOS Information Architecture

PhysiqueOS screens should each have one primary responsibility.

Avoid duplicating information across destinations. When a detail does not help the user make a fast decision on Home, move it deeper.

---

## Home

Purpose: daily cockpit.

Home is the smallest, fastest, most glanceable screen in PhysiqueOS.

It should answer only:

* Am I on track?
* What matters most today?

Home should not explain every calculation, expose raw evidence, or become a dashboard.

---

## Confidence

Purpose: explain why the system believes what it believes.

Confidence is the system's evidence report. It explains trust, not goals.

Future sections:

* Confidence score
* Evidence quality
* Evidence freshness
* Evidence timeline
* Calibration events
* Missing evidence
* What would increase confidence

Confidence should help the user understand model certainty without turning uncertainty into self-judgment.

---

## Goal Detail

Purpose: explain why each goal is progressing.

Goal Detail explains progress. It should be powered by GoalEvaluation records rather than duplicating interpretation logic.

Future sections:

* Goal summary
* Current evaluation
* Supporting findings
* Evidence used
* Progress photos
* DEXA history
* Weight trend
* Recommendations
* Milestones

Goal Detail is where Home's compact goal progress becomes understandable.

---

## Progress

Purpose: chronological evidence timeline.

Progress answers:

> What has happened?

It contains:

* Weight
* Photos
* DEXA
* Daily check-ins
* Protocols
* Analyses

Progress should organize observed history. It should not become the primary recommendation surface.

---

## Coach

Purpose: decision support.

Coach answers:

> What should I do next?

It contains recommendations, planning, strategy, and tradeoff explanations.

Coach consumes intelligence. It does not display raw evidence as its primary job.

---

## Design Principle

Every screen should have one primary responsibility.

Every screen also has a limited information budget. Information should only appear on a screen when it directly supports that screen's responsibility.

Do not add information to Home simply because it exists. Home should orient the user and then progressively disclose deeper context through taps.

Product hierarchy:

1. Primary Goal
2. Supporting Objectives
3. Today's Priorities
4. Notifications
5. Evidence
6. Coach

Each level should become progressively more detailed.

Home is for fast daily orientation.

Confidence is for trust.

Goal Detail is for progress explanation.

Progress is for history.

Coach is for decisions.

When in doubt, move information deeper rather than adding it to Home.
