# PhysiqueOS Evidence

## Purpose

Evidence is the common language of PhysiqueOS.

Every meaningful interaction inside the operating system ultimately becomes evidence.

Evidence is what allows PhysiqueOS to understand the user, measure progress, update confidence, prioritize action, generate Daily Briefings, and improve over time.

The product does not exist to collect evidence for its own sake.

It exists to organize evidence around goals and transform that evidence into understanding.

AI interprets reality.

The Evidence Engine determines what that reality means.

This document defines how PhysiqueOS thinks about evidence at the product and architecture level.

It is not a database schema.

It is not an implementation document.

It is not an AI prompt.

It is the source of truth for how every future feature should treat evidence.

---

# What Is Evidence?

Evidence is any information that helps PhysiqueOS better understand the user or their progress toward a goal.

Evidence is not limited to structured data.

Evidence can be a measurement, a photo, a document, a note, a behavior, a completion event, a symptom, a context change, or a signal from another system.

Examples include:

* weight
* photos
* voice
* PDFs
* DEXA scans
* blood work
* meals
* workout history
* recovery
* sleep
* manual notes
* habits
* protocol completion
* symptoms
* stress
* travel
* medications
* peptides
* supplements
* future evidence types

Evidence is intentionally extensible.

PhysiqueOS should be able to understand new evidence types without changing the core product philosophy.

The question is not:

> Does this fit our current data model?

The question is:

> Can this help PhysiqueOS understand the user or their progress toward a goal?

If the answer is yes, it can become evidence.

---

# Evidence Principles

## Everything Meaningful Can Become Evidence

PhysiqueOS should treat meaningful user context as potentially useful.

A morning weight, a progress photo, a missed protocol, a note about travel, a poor night of sleep, or a completed recovery session may all help explain what is happening.

The product should expand the user's understanding of evidence without making them feel that everything must be tracked.

## Evidence Should Be Interpreted Once and Reused Everywhere

Evidence should not be reinterpreted separately by every screen, feature, or recommendation.

Once evidence is understood, that understanding should be reusable by:

* Home
* Daily Briefing
* Goals
* Goal Detail
* Evidence Hub
* Progress
* Priorities
* Recommendations
* Coach experiences
* future integrations

Interpretation should become a shared layer of understanding, not duplicated logic.

## Evidence Should Never Be Duplicated

PhysiqueOS should avoid creating multiple competing copies of the same fact.

If weight exists in Apple Health, a smart scale, a manual entry, and a spreadsheet, the system should resolve the relationship between those observations rather than pretending they are unrelated.

Evidence can have multiple sources.

It should not have multiple truths.

## Every Intake Path Must Produce The Same Canonical Objects

The downstream engines should never know whether evidence came from:

* screenshot
* PDF
* typed text
* voice
* manual entry
* API integration
* wearable import
* future ingestion tools

Every intake path must normalize into the same canonical evidence objects before reasoning begins.

Examples:

* Apple Fitness screenshot -> `ActivityDay` and/or `TrainingSession`
* Apple Health API workout -> `TrainingSession`
* Cronometer screenshot -> `NutritionDay`
* Cronometer API day -> `NutritionDay`
* BodySpec PDF -> `DEXAScan`
* BodySpec API import -> `DEXAScan`
* typed workout notes -> `TrainingSession`
* voice workout log -> `TrainingSession`

The interpreter changes by modality.

The canonical object does not.

If an API provides richer or cleaner data than a screenshot, that should improve completeness, confidence, and provenance. It should not create a parallel data shape.

## Evidence Should Improve Understanding Over Time

The value of evidence compounds.

One weight entry is a measurement.

A month of consistent weight entries is a trend.

Progress photos under comparable conditions become visual trajectory.

Repeated protocol completions become adherence evidence.

Evidence should make the operating system more personalized as history accumulates.

## Evidence Supports Goals

Evidence has no product meaning in isolation.

It gains meaning because it supports one or more goals.

The same weight entry can support fat loss, maintenance, muscle gain, or general health depending on the user's goal.

PhysiqueOS should always ask:

> What goal does this evidence help us understand?

## Evidence Should Reduce User Effort

The best evidence often comes from systems users already use.

PhysiqueOS should prefer:

1. APIs
2. passive sensors
3. voice
4. manual entry

Manual entry remains first-class evidence.

But manual effort should decrease as the operating system learns and integrations improve.

## Evidence Should Connect Previously Isolated Information

Modern health information is fragmented.

Weight lives in one place.

Nutrition lives somewhere else.

Workouts, recovery, photos, scans, labs, notes, and protocols are scattered across tools.

PhysiqueOS should connect these signals into one coherent model.

## Evidence Should Always Remain Explainable

Every recommendation, confidence change, priority, and briefing should be traceable back to evidence.

Users should be able to understand:

* what evidence was used
* where it came from
* how reliable it is
* what it supports
* why it changed the system's understanding

Trust grows when evidence remains visible and explainable.

---

# The Evidence Lifecycle

Evidence flows through PhysiqueOS as a loop.

```text
Reality

↓

Interpretation Layer

↓

Structured Evidence

↓

Evidence Engine

↓

Confidence Update

↓

Goals

↓

Objectives

↓

Protocols

↓

Priorities

↓

Daily Briefing

↓

Recommendations

↓

User

↓

New Evidence
```

---

# Canonical Evidence Storage Contract

After interpretation and reconciliation, Evidence Storage is the single source of truth for downstream engines.

Persist every canonical evidence object with:

* canonical fields
* object id
* evidence type
* observed timestamp/date
* captured/imported timestamp when available
* source metadata
* raw artifact references
* provenance
* confidence
* quality metadata
* reconciliation metadata
* child entities such as exercises, sets, meals, foods, nutrients, regional DEXA measurements, and activity references

Do not persist duplicate derived information that can always be recomputed from canonical evidence.

Examples of values that should usually be recomputed:

* chart series
* rolling averages
* projected finish windows
* current dashboard summaries
* Daily Briefing copy
* presentation-specific labels

Evidence Storage should preserve facts and traceability.

Engines should compute interpretation from those facts.

Presentation should render engine outputs.

---

# Diagnostics Modes

Diagnostics should explain the pipeline without changing intelligence.

The same evidence and engines must produce the same canonical outputs regardless of diagnostic mode.

## Developer Mode

Developer diagnostics may include:

* full pipeline stages
* raw extraction details
* canonical object inspection
* reconciliation decisions
* confidence transitions
* provenance inspection
* fallback reasons
* unresolved ambiguity

Developer Mode exists for simulator inspection, production debugging, and regression analysis.

## Production Mode

Production diagnostics should be concise and operational.

They should include:

* evidence entered
* canonical object counts
* reconciliation summary
* confidence summary
* unresolved ambiguity or limitations

They should not expose unnecessary implementation noise to product surfaces. User-facing coaching should never mention provider paths, parser internals, fallback labels, metadata mechanics, or diagnostic mode.

---

# Communication Principles

PhysiqueOS communicates what it understands, not how it arrived there.

The Intelligence Engine may internally reason about:

* EvidencePackages
* canonical objects
* interpreters
* parsing
* structured observations
* reconciliation
* confidence calculations
* repositories
* fallback logic

Those concepts should never appear in user-facing copy.

Instead, user-facing surfaces should communicate:

* current understanding
* evidence confidence
* available evidence
* uncertainty
* physiological interpretation
* recommended next evidence
* goal impact

Example:

Do not say:

> 2 foods detected but not fully parsed.

Prefer:

> PhysiqueOS confidently identified one food. Additional foods may be present and will be included as more complete evidence becomes available.

Likewise, avoid labels such as:

* Completeness: Partial
* structured entries
* evidence packages
* canonical objects
* fallback mode
* parser failed
* repository state
* reconciliation result

Prefer user-centered labels such as:

* Current understanding
* Evidence confidence
* Available evidence
* What changed
* What remains uncertain
* What to add next

The engine reasons.

The coach explains.

The UI communicates.

Implementation remains invisible.

Speak physiology, goals, progress, and understanding, not software.

---

# Failure Handling

When interpretation cannot fully complete, PhysiqueOS should prefer incomplete but trustworthy evidence over fabricated certainty.

Examples:

* unsupported screenshot
* corrupt PDF
* partial upload
* missing pages
* OCR ambiguity
* interpreter timeout
* unavailable provider

Required behavior:

1. Preserve the raw artifact.
2. Preserve provenance.
3. Record uncertainty honestly.
4. Avoid producing unsupported canonical values.
5. Allow future reprocessing.
6. Keep user-facing language implementation-agnostic.

If a canonical object cannot be trusted, store a limited evidence package or artifact reference rather than inventing structured data.

---

# Golden Regression Fixtures

The following fixture families are permanent regression targets for Evidence Intake:

* mixed upload: screenshots + PDF + typed evidence
* multiple DEXA upload
* duplicate DEXA reconciliation
* nutrition-only upload
* activity-only upload
* training-only upload
* typed evidence reconciliation
* duplicate workout reconciliation
* unsupported or partial evidence fallback

Future development should treat these as product contracts.

Improvements may expand the expected outputs, but they must not silently break canonical object counts, source attribution, provenance, confidence, quality metadata, or reconciliation behavior.

This loop never ends.

Every new observation can improve the model.

## Reality

Reality is what happened.

Examples:

* the user weighed in
* a DEXA scan was uploaded
* a progress photo was taken
* a protocol was completed
* sleep was poor
* travel disrupted routine
* training volume changed

Reality exists before PhysiqueOS understands it.

## Interpretation Layer

The Interpretation Layer translates raw inputs into structured evidence.

It can interpret:

* voice
* photos
* PDFs
* wearable streams
* text
* manual entries
* future modalities

Interpretation extracts, classifies, normalizes, and compares.

It does not decide coaching.

It does not make final recommendations.

It does not bypass the Evidence Engine.

## Structured Evidence

Structured evidence is reality after it has been organized into a form PhysiqueOS can reason about.

It preserves source context, timestamps, confidence, relationships, and relevance.

Structured evidence should remain traceable back to the original source.

## Evidence Engine

The Evidence Engine decides what structured evidence means.

It evaluates:

* reliability
* freshness
* relevance
* consistency
* agreement with other evidence
* relationship to goals
* confidence impact
* priority impact

The Evidence Engine is where evidence becomes understanding.

## Confidence Update

Confidence reflects PhysiqueOS's certainty in its understanding.

New evidence may increase confidence, decrease confidence, or leave confidence unchanged.

Confidence is never a judgment of the user.

It is a measurement of model certainty.

## Goals

Goals give evidence meaning.

Evidence should be evaluated according to the goals it supports.

A measurement is not inherently good or bad.

Its meaning depends on where the user is trying to go.

## Objectives

Objectives are supporting conditions that help a goal succeed.

Evidence may support an objective more directly than it supports the primary goal.

For example, protein intake may support lean-mass preservation, which supports visible abs.

## Protocols

Protocols are repeatable actions intended to support goals or objectives.

Protocol completion becomes evidence.

Protocol non-completion can also become evidence.

Protocols provide context for interpreting outcomes.

They should not silently overwrite observed evidence.

## Priorities

Priorities are the operating system's opinion about what matters now.

Evidence influences priorities by identifying missing, urgent, stale, or high-leverage actions.

Priorities should become quieter when evidence shows the user is already executing well.

## Daily Briefing

The Daily Briefing is the primary communication layer of the Evidence Engine.

It explains:

* what changed
* what matters
* why it matters
* what deserves attention
* what PhysiqueOS is still learning

The Daily Briefing should always be grounded in evidence.

## Recommendations

Recommendations emerge from evidence.

They should always be explainable.

The user should understand why PhysiqueOS suggested something and what evidence supports it.

## User

The user acts, ignores, corrects, completes, uploads, connects, or logs.

That response becomes new evidence.

The loop continues.

---

# Types of Evidence

PhysiqueOS should distinguish between existing evidence, new evidence, and discovered evidence.

## Existing Evidence

Existing evidence is already tracked elsewhere.

Examples:

* Apple Health
* Garmin
* Oura
* DEXA
* Cronometer
* MyFitnessPal
* workout apps
* historical photos
* blood work
* documents
* notes
* spreadsheets

Existing evidence should be connected, imported, summarized, or deferred.

PhysiqueOS should not make users manually recreate it unless no better path exists.

Existing evidence gives the model a head start.

## New Evidence

New evidence is created directly inside PhysiqueOS.

Examples:

* voice updates
* photos
* manual entries
* workout completion
* protocol completion
* journal entries
* daily check-ins

New evidence should be fast to create and immediately useful.

The user should understand why logging it matters.

## Discovered Evidence

Discovered evidence is information users often do not realize is valuable.

Examples:

* foam rolling
* mobility
* hydration
* travel
* stress
* mood
* alcohol
* recovery
* peptides
* supplements
* illness

PhysiqueOS should gently expand the user's understanding of what can influence their goals.

The product should not ask users to track everything.

It should teach which context matters for the user's specific goals and evidence patterns.

---

# Goals and Evidence

Evidence has no meaning in isolation.

Evidence gains meaning because it supports one or more goals.

Examples:

Daily weight may support:

* fat loss
* muscle gain
* general health
* maintenance
* performance fueling

Nutrition evidence may support:

* performance
* fat loss
* recovery
* marathon preparation
* lean-mass preservation

Progress photos may support:

* visible abs
* conditioning
* symmetry
* muscle retention
* posture

One piece of evidence may support multiple goals at the same time.

PhysiqueOS should preserve this relationship.

The system should be able to answer:

* Which goals does this evidence support?
* Which evidence supports this goal?
* Which evidence is missing?
* Which evidence is stale?
* Which evidence changed confidence?

Goal progress should never be scored directly from raw evidence.

Evidence should first be evaluated, interpreted, and connected to the goal model.

---

# Objectives

Goals often depend on supporting objectives.

Example:

Goal:

Visible abs

Supporting objectives:

* preserve lean mass
* maintain strength
* nutrition consistency
* progress photo consistency
* recovery management

Evidence may contribute to an objective rather than directly to the primary goal.

For example:

* protein evidence supports lean-mass preservation
* resistance training supports strength maintenance
* progress photos support visual confirmation
* sleep evidence supports recovery
* DEXA supports body-composition calibration

This matters because many goals are not achieved by optimizing one metric.

They are achieved by keeping multiple supporting objectives aligned.

PhysiqueOS should understand these relationships.

---

# Protocols

Protocols are collections of repeatable actions intended to support goals or objectives.

Examples:

* protein target
* daily weigh-ins
* weekly progress photos
* foam rolling
* medication schedule
* peptide schedule
* supplement routine
* training plan
* recovery protocol

Protocol completion itself becomes evidence.

So does skipped completion, delayed completion, unusual context, or user correction.

Protocols should help PhysiqueOS interpret outcomes.

Examples:

* a medication change may explain appetite changes
* a training block may explain weight fluctuation
* recovery work may explain improved readiness
* weekly photos may improve confidence in a visual goal

Protocols are context.

They do not directly override observed evidence.

---

# Interpretation

The Interpretation Layer extracts meaning from raw inputs.

It may process:

* voice
* photos
* PDFs
* wearables
* text
* future modalities

Interpretation should create structured evidence.

It should not make final coaching decisions.

It should not directly change UI copy.

It should not bypass the Evidence Engine.

Examples:

A voice note may become:

* recovery context
* travel context
* nutrition note
* protocol completion

A PDF may become:

* DEXA measurements
* lab results
* source metadata
* calibration evidence

A photo may become:

* progress photo evidence
* view
* pose
* capture conditions
* visual comparison context

AI can help interpret reality.

PhysiqueOS decides what that interpreted reality means.

---

# Confidence

Confidence reflects PhysiqueOS's certainty in its understanding.

Confidence is not user performance.

Confidence is not motivation.

Confidence is not moral judgment.

Confidence grows when relevant evidence accumulates and agrees.

Confidence may decrease when:

* evidence is stale
* sources conflict
* important evidence is missing
* context changes
* trends become inconsistent
* the model's prior expectations are wrong

Confidence exists internally even when it is not always surfaced.

The product should surface confidence only when doing so improves clarity.

When confidence is shown, it should explain:

* what increases confidence
* what limits confidence
* what evidence would improve confidence
* how confidence affects recommendations

---

# Recommendations

Recommendations emerge from evidence.

They should never appear disconnected from the user's goal, context, or history.

Early recommendations may be educational.

Examples:

* "Many people pursuing similar goals benefit from consistent progress photos."
* "A DEXA scan would improve body-composition confidence."
* "Protein evidence would help evaluate lean-mass preservation."

Later recommendations should become increasingly personal.

Examples:

* "Your weight is easiest to interpret when morning weigh-ins stay consistent."
* "Friday progress photos have become one of your strongest visual evidence streams."
* "When recovery notes are missing, today's training recommendation becomes less certain."

Recommendations should always be explainable.

Users should understand:

* what evidence prompted the recommendation
* what goal it supports
* why now
* what happens if they ignore it
* what evidence would change the recommendation

---

# Daily Briefing

The Daily Briefing is the primary communication layer of the Evidence Engine.

It is not a dashboard.

It is not a report.

It is the system explaining what the evidence means today.

The briefing should summarize:

* what changed
* what matters
* why it matters
* what deserves attention
* what PhysiqueOS is still learning

The Daily Briefing should separate:

* facts
* interpretation
* recommendations

Facts describe reality.

Interpretation explains reality.

Recommendations determine action.

Every Daily Briefing should be grounded in evidence.

If the briefing cannot trace its reasoning back to evidence, it should not say it.

---

# Design Principles

These principles should guide every future evidence-related decision.

## Everything Meaningful Becomes Evidence

If information helps PhysiqueOS understand the user or their goals, it can become evidence.

## Evidence Exists to Help Users Achieve Goals

Do not collect evidence because it is interesting.

Collect evidence because it improves understanding, confidence, or action.

## Evidence Should Be Connected Rather Than Siloed

Weight, photos, DEXA, nutrition, recovery, protocols, and notes should inform one another.

They should not become isolated modules.

## Evidence Should Reduce Manual Work

Evidence acquisition should move toward APIs, passive sensors, voice, and inference.

Manual entry should remain available, fast, and respected.

## Evidence Should Improve Understanding Before Generating Guidance

PhysiqueOS should organize evidence before coaching from it.

Understanding earns guidance.

## Never Collect Evidence Without Purpose

If PhysiqueOS cannot explain how evidence improves the model, it should not ask for it.

## Never Ask for Evidence That Can Be Inferred

Ask fewer, better questions.

Infer when reliable.

Confirm when necessary.

## Evidence Should Always Be Traceable Back to Its Source

Users should be able to understand where evidence came from and why it matters.

## Computed Values Should Never Overwrite Observed Evidence

Computed values explain evidence.

They do not replace evidence.

## The Operating System Should Become Smarter, Not More Complicated

More evidence should create more clarity.

It should not create more work.

---

# Future Evolution

The Evidence Engine should be durable for many years.

Future evidence types should integrate naturally without changing the core architecture.

New sensors, AI models, wearables, lab tests, health records, coaching workflows, and user inputs will continue to emerge.

The ontology should remain stable even as the modalities evolve.

PhysiqueOS should be able to support:

* new wearable signals
* richer photo interpretation
* voice-first logging
* passive recovery signals
* clinical documents
* coach annotations
* medication changes
* blood biomarkers
* nutrition APIs
* training platforms
* future health devices

The operating system should not need to reinvent itself for every new input.

Every new input should answer the same core questions:

* What happened?
* Where did it come from?
* How reliable is it?
* What goals does it support?
* What objectives does it affect?
* Does it change confidence?
* Does it change priorities?
* Does it change the Daily Briefing?
* Does it change what the user should do next?

If the Evidence Engine can answer those questions, PhysiqueOS can keep growing without becoming fragmented.

---

# North Star

Evidence succeeds when it disappears into understanding.

The user should not feel like they are feeding a database.

They should feel like every meaningful signal helps PhysiqueOS understand them better.

The long-term objective is simple:

> PhysiqueOS should turn the user's fragmented health reality into one coherent operating model for achieving their goals.
