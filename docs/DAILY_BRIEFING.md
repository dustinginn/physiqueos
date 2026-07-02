# Daily Briefing Specification

## Purpose

The Daily Briefing is the primary intelligence experience inside PhysiqueOS.

It is not a dashboard.

It is not a report.

It is not a checklist.

It is not a task manager.

The Daily Briefing answers:

> After reviewing everything that happened, what does PhysiqueOS now believe?

Evidence appears in the briefing only when it justifies a belief update, prediction, uncertainty change, or coaching insight.

---

## Product Philosophy

PhysiqueOS builds a personalized physiological model.

Every briefing should express the current state of that model:

```text
Evidence -> Interpretation -> Prediction -> Validation -> Model Improvement -> Better Predictions
```

The briefing should make the user feel that PhysiqueOS has reviewed the whole picture before speaking.

It should help the user understand:

* what changed
* why it matters
* what PhysiqueOS now believes
* what remains uncertain
* what to expect next
* which evidence would improve confidence

Execution belongs elsewhere.

Home, Notifications, and Priority Cards handle tasks. The Daily Briefing explains meaning.

---

## Inputs

A Daily Briefing may use:

* latest evidence
* historical evidence
* prior predictions
* prediction validation results
* calibration events
* goal evaluations
* confidence factors
* protocol context
* adherence context
* operating plan context
* unresolved uncertainty
* unfinished or completed priorities

The briefing should synthesize these inputs. It should not list them all.

---

## Output Standard

A strong briefing is:

* interpretive
* specific to the user's goal
* grounded in evidence
* clear about uncertainty
* emotionally steady
* predictive
* concise but information-dense
* non-repetitive
* useful without opening another screen

The user should finish the briefing able to answer:

1. What changed?
2. What does it mean?
3. What does PhysiqueOS now believe?
4. What should I understand before executing today?

---

## Section Structure

### 1. Opening Assessment

Begin with the current belief update.

This should feel like a coach's concise assessment after reviewing the user's evidence.

It should not start with a raw metric unless the metric is the meaningful change.

Example:

"Your cut still looks on track. The latest evidence supports continued fat loss without a meaningful signal that lean-mass preservation is breaking down."

### 2. What Changed

Identify only meaningful deltas since the last briefing.

Facts belong here only when they explain why the model changed or did not change.

Avoid metric dumps.

Good:

* Weight held the recent low instead of rebounding.
* The latest front photo added visual evidence under consistent conditions.
* Yesterday's protocol completion removed an adherence uncertainty.

Poor:

* Weight: 167.3 lb.
* Calories: 2,015.
* Steps: 12,041.

### 3. What This Validates Or Challenges

Compare new evidence against prior expectations.

This is where PhysiqueOS demonstrates learning.

Examples:

* "Holding the low validates the current rate of loss more than it signals a plateau."
* "The new photo supports the direction of the weight trend, but lighting and pose still limit visual certainty."
* "The missed recovery protocol does not change trajectory yet, but it adds a small adherence risk if repeated."

### 4. Current Model Belief

State what PhysiqueOS now believes about the user's trajectory.

This should connect physiology, behavior, and goal progress.

It may include:

* likely direction
* likely mechanism
* whether the plan is still working
* whether anything meaningful changed
* what the model is watching

This section should not duplicate the opening. It should explain the reasoning behind it.

### 5. Goal Outlook

Translate the model belief into goal progress.

Use goal language, not metric language.

Examples:

* "Visible abs at rest remains the primary endpoint, and current evidence continues to support that path."
* "Maintenance is not the next aggressive target. It is the stabilization phase after the cut."
* "Lean mass remains confidence-limited until the next scan, but no evidence currently suggests a major preservation issue."

When enough evidence exists, include projections as ranges rather than false precision.

Predictions must be traceable to evidence.

### 6. Confidence Update

Explain whether confidence increased, decreased, or remained stable.

Confidence is earned through:

* prediction accuracy
* evidence quality
* evidence consistency
* calibration events
* adherence context
* model stability
* uncertainty reduction

Confidence should never increase because time passed.

Low confidence should be framed as scientific honesty, especially during onboarding or a new goal phase.

### 7. What To Understand Today

Teach the user one useful thing about their body, goal, or current phase.

This should create shared learning:

* PhysiqueOS learns the user.
* The user learns themselves.

Examples:

* "At this phase of the cut, visual changes may become more informative than day-to-day scale movement."
* "A short-term weight hold after a new low is more consistent with stabilization than failed progress."
* "Recovery evidence matters more now because the margin for aggressive cutting is smaller."

### 8. Execution Handoff

Briefly name the highest-leverage focus for the day, then hand execution back to Home or Today's Priorities.

This section should not become a checklist.

Good:

"The important thing today is to keep the plan boring: complete the scheduled protocol, hit the nutrition range, and avoid reacting to normal scale noise."

Poor:

* Morning Weight
* Protein Goal
* Close Activity Ring
* Sleep 8+ Hours

### 9. What Would Improve Confidence

Identify the single most useful next evidence source or calibration event.

This should explain why the evidence matters.

Examples:

* "The next DEXA would validate whether the visual and weight trends are preserving lean mass."
* "A matching front photo next Friday would improve confidence in visual trend interpretation."
* "A week of protein evidence would clarify whether lean-mass preservation risk is nutritional or simply unknown."

### 10. Coach's Closing Insight

End with a concise synthesis.

This should integrate evidence, interpretation, prediction, confidence, and direction.

It should feel human, specific, and earned.

It should never be generic praise.

---

## Anti-Patterns

Do not:

* repeat the same conclusion across sections
* list evidence without explaining its meaning
* turn the briefing into Today's Priorities
* overstate certainty
* estimate exact body fat from photos
* shame the user
* provide generic bodybuilding commentary
* use confidence as a reward
* imply progress because time passed
* add facts that do not change understanding

---

## Relationship To Other Surfaces

Home answers:

* Am I on track?
* What matters most today?

Daily Briefing answers:

* What does PhysiqueOS now believe?
* Why?

Goals answer:

* What am I trying to accomplish?
* Why is this goal progressing?

Evidence Hub answers:

* Show me the underlying evidence.

You answers:

* How should PhysiqueOS work for me?

Coach answers:

* What strategic decision should I make next?

The Daily Briefing may reference these surfaces, but it should not duplicate them.

---

## Quality Bar

A Daily Briefing is ready when it feels like PhysiqueOS has become more intelligent because new evidence arrived.

It should leave the user feeling:

* informed
* calm
* motivated
* confident in the plan
* clear about uncertainty
* ready to execute

If the user only learns a list of metrics, the briefing failed.

If the user understands what PhysiqueOS now believes and why, the briefing succeeded.
