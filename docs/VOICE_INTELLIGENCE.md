# PhysiqueOS Voice Intelligence

## Purpose

Voice is not an AI chatbot.

Voice is the natural language interface to PhysiqueOS.

Users should not have to choose modes, categories, or schemas before speaking. They simply tell PhysiqueOS what they want to log, ask, correct, plan, or change.

The purpose of Voice Intelligence is to transform natural speech into the correct PhysiqueOS action: canonical evidence when the user is reporting evidence, a routed question when the user is asking about their physiology, a planned event when the user is describing the future, a correction when the user is revising prior evidence, or an update request when the user is changing goals or protocol intent.

The experience may feel conversational, but the system's job is not conversation for its own sake. Its job is to listen, resolve meaning, route intent, ask only valuable follow-up questions, dispatch to the correct canonical engine, and preserve durable evidence in the same canonical model used by every other intake path.

---

## Core Principle

Voice is an intent-first interface.

When the intent is evidence intake, voice is another evidence modality and must converge into the same canonical evidence objects as screenshots, PDFs, typed evidence, manual entry, APIs, and future integrations.

When the intent is not evidence intake, voice should route the request to the appropriate PhysiqueOS intelligence capability without becoming a generic chat system.

The downstream Intelligence Engine should never need to know whether evidence or an instruction came from voice except for provenance, confidence, and completeness.

Transcript is provenance.

Canonical evidence, canonical goals, canonical protocols, canonical plans, and canonical intelligence outputs remain the sources of truth.

---

## Intelligence Pipeline

Voice Intelligence follows this intent-first pipeline:

```text
Narrative
-> Transcription
-> Entity Resolution
-> Intent Routing
-> Intent Dispatch
```

For evidence intents, dispatch continues through:

```text
Parallel Evidence Interpreters
-> Evidence Merge
-> Clarification Ranking
-> Conversation State
-> Canonical Evidence
```

For non-evidence intents, dispatch routes to the appropriate canonical engine:

```text
Question
-> Query / Read Model
-> Intelligence Response
```

```text
Scenario Simulation
-> Scenario Engine
-> Projection / Tradeoff Analysis
```

```text
Goal Management
-> Goal Engine
-> Canonical Goal Update Request
```

```text
Protocol Update
-> Protocol Engine
-> Canonical Protocol Update Request
```

```text
Planning / Reminder
-> Planning Engine
-> Canonical Upcoming Event / Reminder
```

```text
Correction
-> Evidence Correction
-> Canonical Evidence Reconciliation
```

Voice Intelligence owns transcription, entity resolution, intent routing, conversation state, clarification, and dispatch.

Voice Intelligence ends at Canonical Evidence or a routed canonical request. Goal Impact Analysis, Narrative Intelligence, Priorities, Predictions, Recommendations, Coaching, Daily Briefing, Query responses, Scenario simulations, Goal changes, Protocol changes, and Planning behavior belong to the broader PhysiqueOS Intelligence Engine. Voice supplies the user's intent and trustworthy normalized inputs; the Intelligence Engine determines what they mean.

---

## Design Principles

### 1. Voice Exists To Route Intent

Voice is for understanding what the user is trying to accomplish in natural language.

It is not for simulating a chatbot relationship.

The experience can be warm, clear, and responsive, but its architectural purpose is intent routing and canonical dispatch.

Evidence capture remains the most important V1 intent, but it is not the only long-term intent.

### 2. Goals Are The North Star

Every interpretation, clarification, and recommendation should ultimately improve goal achievement.

The same transcript may matter differently depending on the active goal.

"I walked four miles" can be routine movement for one user, recovery evidence for another, and event preparation evidence for a third.

### 3. Users Tell Stories

Users do not naturally speak in schemas.

They say things like:

```text
I worked out today. It was shoulders. I did shoulder press, lateral raises, and front raises.
```

The engine extracts evidence from the story.

The user should not have to think about evidence types, schemas, required fields, or object names.

### 4. Intent First, Categories Second

Users rarely think:

```text
I am now logging nutrition.
```

They simply explain what happened.

The engine decides whether the transcript contains evidence, questions, simulations, training, nutrition, weight, symptoms, protocol changes, upcoming events, goals, corrections, or multiple intents at once.

### 5. Clarification Is Expensive

Every clarification interrupts the user.

Only ask when the answer materially improves evidence quality, confidence, or goal relevance.

Do not ask because a schema field is empty.

Ask because the answer changes the quality of PhysiqueOS's understanding.

### 6. Good / Better / Best

Voice should distinguish between sufficient evidence and perfect evidence.

**Good**

Enough information to save trustworthy evidence.

**Better**

Additional information that improves coaching confidence.

**Best**

Rich metadata that enables deeper long-term analysis.

Do not keep asking after Good unless the expected value of the answer justifies the interruption.

### 7. Confidence Belongs To The Engine

Users should not be asked to manage confidence.

They should provide evidence.

The engine should evaluate source quality, transcript certainty, entity resolution certainty, interpretation confidence, and remaining ambiguity internally.

### 8. The Engine Should Specialize

Voice should not become one giant interpreter or one giant chatbot.

Voice routes evidence to specialized interpreters, routes questions to query/analysis engines, routes simulations to scenario engines, routes corrections to evidence correction, and routes goal/protocol/planning requests to their canonical owners.

Specialization keeps the system easier to improve, test, and extend.

### 9. Users Teach PhysiqueOS

Corrections are training signals.

If a user says "Tessa Moreland" and later confirms "Tesamorelin," that correction should improve future entity resolution.

User language is preserved in provenance. Canonical names are used internally.

### 10. The App Should Feel Like A Coach Remembering Your Life

Voice should feel like a low-friction way to teach PhysiqueOS what happened, ask about what PhysiqueOS understands, and update intent when life changes.

The long-term experience should feel continuous, personal, and remembered.

It should not feel like chatting with a generic assistant or filling out a dynamic form.

### 11. Intent, Not Chat

Voice should not create an open-ended AI conversation.

No assistant personality.

No generic chat surface.

No "I think" or "I found."

The user speaks intent. PhysiqueOS routes intent.

The response should feel like a coach who already knows the user's goals, history, and context, not like a general-purpose assistant.

---

## Intent Classes

Voice Intelligence should recognize at least these intent classes:

* Evidence Intake
* Question
* Scenario Simulation
* Goal Management
* Protocol Update
* Planning / Reminder
* Correction
* Mixed Intent

Examples:

```text
I weighed 166.8 this morning.
```

Intent:

```text
Evidence Intake -> MorningWeight
```

```text
How am I trending?
```

Intent:

```text
Question -> Query / Physiological Model
```

```text
What if I reduced calories by 200?
```

Intent:

```text
Scenario Simulation -> Scenario Engine
```

```text
I want to maintain instead of cut.
```

Intent:

```text
Goal Management -> Goal Engine
```

```text
Increase my protein target.
```

Intent:

```text
Protocol Update -> Protocol Engine
```

```text
Vacation starts Friday.
```

Intent:

```text
Planning -> Upcoming Event
```

```text
Actually that workout was yesterday.
```

Intent:

```text
Correction -> Evidence Correction
```

Mixed intent is normal. A single transcript may contain evidence, a question, a correction, and a protocol update. Intent Routing should identify every represented intent and dispatch each to the correct canonical owner.

---

## Parallel Interpreter Architecture

A single transcript may contain multiple evidence objects.

Voice should identify the evidence represented in the transcript and route each piece to the appropriate interpreter.

Examples of specialized interpreters:

* Morning Weight Interpreter
* Training Interpreter
* Nutrition Interpreter
* Activity Interpreter
* Protocol Interpreter
* Goal Interpreter
* Upcoming Event Interpreter
* Observation Interpreter
* Symptom Interpreter
* Performance Interpreter

Future interpreters can be added without changing the overall architecture.

Example:

```text
I weighed 166.4 this morning, trained shoulders, and scheduled a DEXA for July 18.
```

This may produce:

```text
MorningWeight
TrainingSession
UpcomingEvent
```

The transcript is one artifact.

The evidence may be many canonical objects.

---

## Entity Resolution

Voice requires a dedicated Entity Resolution layer.

Its responsibility is to resolve natural language into canonical entities while preserving the user's original language as provenance.

Examples:

```text
Tessa Moreland
-> Tesamorelin
```

```text
Reda TrueTide
-> Retatrutide
```

```text
Front Rows
-> canonical exercise candidate
```

Entity Resolution may use:

* known aliases
* phonetic similarity
* active protocol bias
* exercise ontology
* medication and supplement history
* nutrition history
* training history
* user corrections
* confidence scores

Entity Resolution should not erase specificity.

If a user says "Iso-Lateral High Row," the canonical exercise should preserve that specificity while organizing it into the broader taxonomy.

The engine normalizes meaning.

It does not flatten the user's evidence.

---

## Intent Routing

Intent should be detected before clarification.

The engine should first ask:

```text
What is the user trying to tell PhysiqueOS?
```

Not:

```text
Which schema field is missing?
```

Examples:

```text
I trained chest today.
```

Intent:

```text
Training
```

Highest-value clarification:

```text
What exercises did you perform?
```

Not:

```text
What type of workout was this?
```

```text
I went for a run.
```

Intent:

```text
Cardio
```

Potential clarification:

```text
Distance, duration, pace, or perceived effort.
```

Not:

```text
Which exercises?
```

```text
I weighed 168.2 this morning.
```

Intent:

```text
MorningWeight
```

No clarification is required if date and value are clear.

---

## Conversation Engine

The Conversation Engine owns clarification strategy.

Clarifications should never blindly fill empty schema fields.

Every clarification must:

* target an existing evidence object
* increase confidence or usefulness
* justify its interruption cost
* be asked one question at a time

After every answer, the engine should:

1. update the pending evidence
2. recompute confidence
3. recompute the clarification ranking
4. either ask the next highest-value question or save

Clarification ranking should maximize information gain.

Examples:

```text
I trained chest.
```

Ask:

```text
What exercises did you perform?
```

```text
I ate breakfast.
```

Ask:

```text
What foods did you eat?
```

```text
I ran four miles.
```

Do not ask for exercises. The activity is already known.

---

## Evidence Merge

Voice can create partial objects that need to merge with existing evidence.

Examples:

* voice workout details enrich an Apple Fitness strength workout
* voice nutrition note enriches a NutritionDay
* voice correction enriches a historical TrainingSession
* voice observation adds context to the Persistent Narrative

Merging should preserve provenance.

Original evidence remains.

Voice evidence becomes additional provenance.

Canonical understanding becomes richer.

---

## Evidence Lifetime

Not all voice evidence has the same lifetime.

The system should classify evidence lifetime so it can preserve the right information for the right duration.

### Permanent

Permanent evidence becomes part of long-term history.

Examples:

* Goals
* Weights
* DEXAs
* Progress photos
* Training
* Nutrition

### Active

Active evidence matters while it remains upcoming or currently relevant.

Examples:

* Upcoming events
* Travel
* Scheduled DEXAs
* Competitions
* Protocol reminders

### Ephemeral

Ephemeral evidence may matter today but does not necessarily need to become permanent history.

Examples:

* skipped cardio
* missed medication
* daily protocol completion

### Persistent Narrative

Some evidence accumulates as lived context.

Examples:

* observations
* symptoms
* recurring patterns
* subjective experiences

These become part of long-term coaching memory when they help explain physiology, behavior, adherence, or goal progress.

---

## Canonical Evidence Contract

Voice must not create voice-only schemas or repositories.

Every voice output should normalize into the same canonical contracts used by other modalities.

Examples:

* Morning weight becomes `MorningWeight`
* Strength training becomes `TrainingSession`
* Nutrition becomes `NutritionDay`
* Activity becomes `ActivityDay`
* Progress photos remain `ProgressPhotoSet`
* DEXA references remain `DEXAScan`
* Goal updates become canonical goal evidence
* Protocol updates become canonical protocol evidence

Differences between input modalities should be limited to:

* provenance
* confidence
* completeness
* source artifacts

---

## User-Facing Communication

Voice surfaces should never expose implementation details.

Avoid user-facing terms such as:

* parser
* schema
* canonical object
* interpreter
* repository
* fallback
* reconciliation
* structured entries

Prefer:

* evidence captured
* current understanding
* confidence
* more detail would help
* ready to save
* workout detected
* meal identified

The engine reasons.

The coach explains.

The UI communicates.

---

## Long-Term Vision

Voice should become the lowest-friction way to teach PhysiqueOS.

It should support quick evidence capture, natural corrections, rich historical backfill, protocol updates, observations, and multi-intent notes without forcing the user into forms.

The destination is not a chatbot.

The destination is a lifelong physiological database that can be updated naturally through speech.

The user speaks life.

PhysiqueOS captures evidence.

The Intelligence Engine turns that evidence into better coaching.
