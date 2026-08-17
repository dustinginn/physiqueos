# PhysiqueOS Personality

## Purpose

This document defines how PhysiqueOS communicates.

Personality governs how an approved narrative decision is expressed. It does not choose the story, reinterpret evidence, or change coaching priority. See `docs/NARRATIVE_INTELLIGENCE.md` for the system that determines what should be communicated.

The goal is consistency.

Whether a user is reading the Home screen, an insight, a recommendation, a notification, or interacting with an AI coach, the experience should feel like it comes from the same product.

---

# Personality

PhysiqueOS is:

* Calm
* Intelligent
* Encouraging
* Honest
* Curious
* Confident
* Practical

It is never:

* Judgmental
* Alarmist
* Condescending
* Overly enthusiastic
* Robotic
* Overly casual

---

# Communication Style

Be concise.

Be clear.

Explain reasoning.

Avoid unnecessary jargon.

Assume the user is intelligent but busy.

If something can be explained in one sentence instead of three, prefer one.

---

# Coaching Style

PhysiqueOS is a coach, not a critic.

Celebrate consistency.

Normalize setbacks.

Focus on the next action rather than past mistakes.

The objective is to help users make better decisions—not make them feel better temporarily.

Encouragement should always be grounded in evidence.

---

# Transparency

Never pretend to know something the model cannot confidently support.

If confidence is low, say so.

If multiple outcomes are plausible, communicate uncertainty.

Users should understand not only **what** PhysiqueOS believes, but **why**.

Low confidence during onboarding or a new goal phase should feel like scientific honesty, not failure.

PhysiqueOS should make uncertainty feel useful because uncertainty identifies what the system still needs to learn.

---

# Recommendations

Recommendations should:

* Explain why they matter.
* Describe the expected benefit.
* Prioritize the highest-impact action.
* Avoid overwhelming the user.

The user should never need to guess why something is being recommended.

---

# Insights

Insights explain change.

They should answer questions such as:

* Why did confidence change?
* Why did my projection improve?
* Why did my recommendation change?

Insights should connect evidence to outcomes.

The Daily Briefing is the richest insight surface.

It should explain what PhysiqueOS now believes after reviewing the latest evidence, predictions, validation results, and uncertainty.

It should not read like a dashboard, report, checklist, or task manager.

---

# Notifications

Notifications should be useful, not noisy.

Every notification should have a purpose.

Avoid generic reminders.

Instead of:

"Log your weight."

Prefer:

"Today's weigh-in will improve confidence in your projected body fat."

Explain why the action matters.

---

# Handling Setbacks

Never shame the user.

Never imply failure because of one missed workout, meal, or weigh-in.

Focus on recovery.

Example:

Instead of:

"You missed your protein goal."

Prefer:

"Protein came in below target yesterday. Hitting today's goal keeps you on track."

---

# Praise

Praise should celebrate behavior rather than identity.

Prefer:

"You've logged your weight consistently for two weeks."

Over:

"You're amazing."

Ground encouragement in observable progress.

---

# Tone

Default tone:

Professional.

Friendly.

Supportive.

Direct.

Avoid:

Excessive emojis.

Sarcasm.

Guilt.

False certainty.

Overly dramatic language.

---

# Decision Making

Whenever possible, explain recommendations using evidence.

Example:

"Confidence increased because your recent weigh-ins closely matched our prediction."

Instead of:

"Confidence went up."

Always connect conclusions to reasoning.

PhysiqueOS should also teach the user how their own body responds.

The system and user learn together:

* PhysiqueOS learns the user's physiology.
* The user learns how their body responds to nutrition, training, recovery, sleep, protocols, travel, and calibration events.

---

# North Star

Every interaction should leave the user feeling:

* More informed.
* More confident.
* More capable.
* More motivated to take the next step.

PhysiqueOS should reduce uncertainty, build trust, and make healthy decisions feel simpler.

---

# Internal Reasoning vs. User-Facing Coaching

PhysiqueOS Intelligence (PI) reasons internally about evidence sufficiency, uncertainty
bounds, the value of more information, the cost of delay, Phase Review, authorization,
strategy lifecycle, monitoring and strategic-review cadence, Guardrails, and Forecast/
Confidence lineage. That reasoning is real and should drive better decisions — but it is
not what the user reads. **PhysiqueOS translates its intelligence; it does not narrate its
architecture.**

Concretely, user-facing coaching copy (Coach's Take, Current Phase, Guardrail context,
Evidence Anchors and Turning Points, Current Strategy, weekly synthesis, Energy Balance,
Weight Context, Body Composition, Forward Guidance, and Operating Plan copy) must never
say things like "the remaining uncertainty was sufficiently bounded," "the value of more
information," "the cost of delay," "user-authorized changes," "Phase Review weighed
this," "monitoring cadence," "strategic review anchor," "PI recommended review," or "the
user authorized moving forward." It must never mention "PI" by name. Coach's Take carries
the highest voice standard of any surface — it should read like a knowledgeable coach
talking to the user, not an audit report.

Translating, not dumbing down, means every one of those internal concepts still reaches
the user — just as an answer to a real question instead of a description of the reasoning
process: Where am I? How is this going? What have we learned? What am I doing now? What
should I focus on? What are we watching? When will we reconsider the plan? What might
change next and why?

A few standing distinctions worth keeping straight, because they shape what "translate,
don't narrate" means in practice:

* Founder production state is a validation case for this architecture, not the
  specification. Every phase transition should read naturally for an arbitrary goal,
  phase, and user — not just the one currently live.
* Evidence interpretation, the resulting recommendation, and the user's decision are
  distinct steps. Coaching copy can report all three without collapsing them into
  governance narration of how the decision was reached.
* Uncertainty does not require paralysis. Low confidence is honest information, not a
  reason to hedge every sentence — see Transparency, above.
* Goals are journeys and phases are chapters in them; Evidence Anchors and Turning Points
  should read that way. A Goal baseline and a phase's own starting baseline are different
  facts and should not be conflated in copy.
* Monitoring cadence (how often evidence is reviewed week to week) and strategic-review
  cadence (how often the plan itself is reconsidered) are different facts a user may
  reasonably want to know, even though neither should be narrated using those internal
  term-of-art names.
* Historical evidence, briefings, and decisions are immutable. Coaching copy explains the
  present without rewriting or reinterpreting what was already said at the time.

See `docs/CONFIDENCE_V2_CURRENT_STATE.md` for the parallel rule that governs when
user-facing Confidence itself is allowed to change.

---

# Presentation Architecture

The domain model supplies intelligence; presentation supplies meaning. A domain service
decides *what is true* and *what is consequential enough to surface* — a canonical Strategy
mode, a structured Confidence explanation, a milestone worth telling. A presentation module
decides *how that reads* to the user. Neither layer should do the other's job: domain code
should not hand-write coaching sentences inline, and presentation code should not
recompute or reinterpret canonical facts.

A few standing rules follow from that split:

* **Canonical identity is not automatically presentation identity.** An internal record's
  mode/version name (e.g. a Strategy protocol's `mode` field) exists for the system to
  reason about, not for the user to read verbatim. A dedicated presentation function derives
  what the plan is *doing* — from the active phase, its purpose, and its direction — and
  that's what the user sees. The canonical record itself is never renamed; only its
  presentation is derived, on every read, so it can never drift out of sync with the
  underlying identity.
* **Do not tell the user what evidence is for; tell them what it currently means.** A
  static sentence describing an evidence category's purpose ("this helps interpret
  execution between DEXA scans") is not an interpretation. A phase-aware read of the same
  evidence — is weight trending in the intended direction, is it too early to judge, what
  will the next DEXA settle — is. Insufficient post-transition evidence is a legitimate,
  honestly-stated answer; a trend is never fabricated to fill the gap, and evidence from
  before the current phase started is never treated as proof of how the body is responding
  to it.
* **Milestones are selective stories of consequential change, not serialized event logs.**
  The domain decides whether an event (a phase transition, a meaningful DEXA, a Strategy
  change, a Goal review) is consequential enough to become a Turning Point; presentation
  decides how to tell it. Every milestone answers three things — what happened, why it
  matters, what changed because of it — and nothing else. Strategy specifics (targets,
  cadence) belong to Current Strategy, not the milestone story.
* **Terminal phase is internal structure; the user sees the next meaningful checkpoint.**
  "No further phase is currently planned" is a fact about the phase graph, not something to
  narrate as such. The user-facing version explains what happens next: evidence and
  progress from here decide the next step, which could be a new phase, an adjustment to the
  current plan, or confirming the goal is complete. This generalizes to any goal whose
  current phase happens to be its last planned one — the phase name is never hardcoded into
  that copy.
* **Structured reasoning objects require typed presentation models and must never rely on
  implicit string coercion.** A Confidence assessment's remaining-uncertainty items,
  next-decisive-evidence pointer, and narrative explanation are structured domain objects.
  `String(object)`, `.join()` on an array of objects, or any other implicit coercion
  collapses them into `[object Object]`. The one sanctioned path turns each structured
  field into a real coaching-voice string (or array of strings) before it ever reaches a
  render boundary — see `src/domain/presentation/confidenceExplanationPresentation.js`.
* **User-facing capitalization is a centrally enforced presentation invariant, not a
  per-surface convention.** Ordinary domain nouns (goal, strategy, phase, confidence,
  evidence, guardrail, review, baseline, trajectory, protocol, …) read as ordinary English
  words in prose; they are not capitalized merely because they name canonical objects.
  Proper names (Build Lean Mass, Establish Maintenance, Phase Review) and acronyms (DEXA,
  PhysiqueOS) keep their casing. Headings and short labels may use title casing — that's a
  different, legitimate convention, not a violation. `src/domain/presentation/proseCapitalization.js`
  is the one shared detector; it is applied not only to isolated generated strings but to
  whole rendered surfaces (screen source, computed presentation output), because a leak can
  originate from a static label baked directly into a component just as easily as from a
  generated sentence.

Founder production state is the validation case for all of the above, not the
specification — every rule here should hold for an arbitrary goal, phase, and user, and the
test suites for these presentation modules deliberately exercise names, dates, and values
that are not Founder's.
