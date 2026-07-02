# PhysiqueOS Product Principles

These principles guide every product decision.

When choosing between two approaches, these principles take precedence over personal preference.

---

# 1. Goals Over Metrics

Users do not care about calories, heart rate, sleep score, or body weight by themselves.

They care about achieving meaningful outcomes.

Every metric exists only because it helps users reach a goal.

Never optimize for collecting more data.

Optimize for helping users make better decisions.

---

# 2. Data Must Lead to Action

Information without action creates noise.

Every insight should answer one question:

"What should I do next?"

If data cannot influence a decision, question whether it belongs.

---

# 3. Simplicity Wins

The simplest experience that accomplishes the goal is usually the correct one.

Avoid unnecessary settings.

Avoid unnecessary screens.

Avoid unnecessary interactions.

Complexity should never be exposed unless it creates meaningful value.

---

# 4. Progressive Disclosure

Users should never feel overwhelmed.

Show only the information needed to make the next decision.

Additional detail should always be available but never required.

The interface should become deeper only as curiosity increases.

---

# 5. Consistency Builds Trust

Every screen should feel familiar.

Every interaction should behave predictably.

Every recommendation should follow the same reasoning process.

Consistency reduces cognitive load.

---

# 6. Predictions Over History

Most health apps explain what already happened.

PhysiqueOS focuses on what is likely to happen next.

Historical data is valuable because it improves future predictions.

Prediction is the product.

PhysiqueOS should use evidence to build, test, and refine a personalized physiological model.

The loop is:

Evidence -> Interpretation -> Prediction -> Validation -> Model Improvement -> Better Predictions.

Evidence is only valuable when it improves understanding, validates or challenges a prediction, or reduces uncertainty about the user's path to their goal.

---

# 7. Coach, Don't Judge

Users are building long-term habits.

The product should encourage consistency rather than perfection.

Celebrate progress.

Normalize setbacks.

Always help users recover rather than making them feel guilty.

---

# 8. Confidence Matters

Every prediction has uncertainty.

Whenever possible, communicate confidence alongside recommendations.

Users should understand:

* what PhysiqueOS believes
* why it believes it
* how confidence could improve

Trust grows through transparency.

Confidence represents how well PhysiqueOS understands this individual in this context.

It is earned through prediction accuracy, evidence quality, evidence consistency, calibration events, adherence context, model stability, and uncertainty reduction.

Confidence should never increase simply because time passed.

The Confidence Ring exists for the user. It should answer:

"How confident should I feel that continuing this plan will produce the expected outcome?"

---

# 9. Build Systems, Not Screens

Reusable systems scale.

One-off implementations create technical debt.

Whenever possible:

Build primitives.

Compose components.

Assemble screens.

Avoid page-specific solutions.

---

# 10. Reuse Before Creating

Before introducing a new:

Component

Card

Animation

Interaction

Typography style

Color

Spacing value

Ask:

Can an existing pattern solve this?

Reuse should always be preferred over invention.

---

# 11. Calm Interfaces Win

The interface should never compete for attention.

Whitespace is intentional.

Animation is purposeful.

Color communicates meaning.

Visual hierarchy should make important information obvious without requiring effort.

---

# 12. Every Pixel Should Earn Its Place

Every element should have a reason to exist.

If removing something makes the experience better, remove it.

The best interface is rarely the one with the most features.

It is the one with the least unnecessary complexity.

---

# 13. Minimize User Effort

Every tap is friction.

Every form is friction.

Every required field is friction.

PhysiqueOS should always strive to request the least amount of user effort while producing the greatest possible intelligence.

Whenever possible:

Infer rather than ask.

Aggregate rather than duplicate.

Learn over time rather than forcing setup.

---

# 14. Evidence Has Value

Not every piece of evidence contributes equally.

The Intelligence Engine should understand which additional evidence would most reduce uncertainty for a specific goal.

Rather than asking users for more data, PhysiqueOS should recommend the highest-value next evidence.

Examples:

* Upload a DEXA
* Add weekly progress photos
* Connect Apple Health
* Track protein intake

Evidence requests should always balance:

User effort

versus

Expected confidence gained.

---

# 15. Respect Existing Workflows

PhysiqueOS is not intended to replace specialized tracking applications.

Users should continue using whatever apps they already enjoy.

Examples:

Apple Health

Cronometer

Garmin

BodySpec

Strong

Hevy

WHOOP

Oura

PhysiqueOS aggregates those evidence streams instead of competing with them.

---

# 16. Evidence Explains Goals

Evidence supports goals.

Goals consume evidence.

Every evidence report should make the relationship visible through related goals, source context, and reporting that helps users inspect the underlying facts. Home and Daily Briefing explain meaning; Evidence Hub shows the evidence itself.

---

# 17. One Action Engine

The product should surface one highest-value action for the current moment.

The action may come from time, protocols, missing evidence, confidence gaps, or the operating plan. When the action is complete, the next one may surface. When nothing meaningful remains, PhysiqueOS should get quiet rather than inventing work.

---

# 18. Daily Briefing Explains Belief

The Daily Briefing is not a dashboard, report, checklist, or task manager.

It is the primary expression of the Intelligence Engine.

It should answer:

"After reviewing everything that happened, what does PhysiqueOS now believe?"

Evidence exists in the briefing only to justify updated beliefs.

The briefing should create continuity:

what changed -> why it matters -> what PhysiqueOS now believes -> what the user should understand.

Execution belongs in Home, Notifications, and Priority Cards.

---

# 19. User And System Learn Together

PhysiqueOS learns the user's physiology over time.

The user should also learn how their own body responds to nutrition, training, recovery, sleep, protocols, travel, and calibration events.

Low confidence early in onboarding is not a product failure.

It is scientific honesty.

The product should make uncertainty feel understandable, temporary, and useful.

---

# Decision Filter

Before shipping any feature, ask:

Does this help users achieve their goal?

Does it reduce cognitive load?

Does it improve decision making?

Does it increase trust?

Can it be reused?

Is it simpler than the alternative?

If the answer to several of these questions is "no", reconsider the solution.
