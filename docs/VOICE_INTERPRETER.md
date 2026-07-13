# PhysiqueOS Voice Interpreter

## Purpose

The Voice Interpreter is the evidence-intake branch of Voice Intelligence.

The microphone is the natural language interface to PhysiqueOS. It may receive evidence, questions, scenario simulations, goal updates, protocol updates, planning notes, corrections, or mixed intent.

The Voice Interpreter only owns the evidence path after Intent Routing has determined that part of the transcript should become canonical evidence.

Its job is to convert an existing transcript into the same canonical evidence objects produced by screenshots, PDFs, typed evidence, manual entry, API integrations, and future intake paths.

```text
Transcript
-> Entity Resolution
-> Intent Routing
-> Evidence Intent
-> Voice Interpreter
-> Canonical Evidence Objects
-> Evidence Reconciliation
-> Evidence Engine
-> Goal / Confidence Engine
-> Coaching Engine
-> Presentation
```

Speech recognition is outside this contract. The Voice Interpreter receives text that has already been transcribed.

Browser speech recognition is a live-preview enhancement only. It may show captions while the user is talking, but it is not the canonical transcript source for Founder Alpha voice logging.

The full voice intake path is:

```text
Microphone
-> Audio Capture
-> Optional Browser SpeechRecognition live preview
-> Transcription Provider
-> Transcript
-> Voice Interpreter
-> Canonical Evidence Objects
```

Audio capture is the source of truth. The recorded audio is sent to the configured server transcription provider after the user stops speaking. The final server transcript is the canonical input to the Voice Interpreter.

Audio capture and transcription are replaceable infrastructure. The Voice Interpreter must remain provider-agnostic and should never depend on whether a transcript came from OpenAI Speech-to-Text, Whisper, Apple Speech, Deepgram, AssemblyAI, manual fallback, or a future provider.

The transcript is provenance. Canonical evidence remains the source of truth.

## Voice Intelligence Boundary

Voice Intelligence owns:

- transcription
- entity resolution
- intent routing
- conversation state
- clarification
- dispatch

The Voice Interpreter owns evidence extraction only.

Non-evidence intents route elsewhere:

- questions route to query / read-model intelligence
- scenario simulations route to scenario analysis
- goal management routes to the Goal Engine
- protocol updates route to protocol management
- planning routes to upcoming events / reminders
- corrections route to evidence correction and reconciliation

The Voice Interpreter should not become a chatbot, query engine, scenario engine, goal manager, protocol manager, or presentation layer.

## Transcription Provider

The Mic Simulator uses a provider boundary:

```text
Audio Recording
-> TranscriptionProvider
-> Final Transcript
-> VoiceInterpreter
```

Founder Alpha defaults to OpenAI transcription when `OPENAI_API_KEY` is configured. The model can be changed with:

- `OPENAI_TRANSCRIPTION_MODEL`

If no server transcription provider is configured or the provider fails, the simulator may use the browser live-preview transcript as an editable fallback. Typed fallback is only the last resort when both server transcription and browser preview are unavailable.

Provider implementations must remain outside the Voice Interpreter. Swapping transcription providers should not require schema, interpreter, evidence, or downstream engine changes.

## Canonical Rule

The interpreter changes by modality.

The schema does not.

Voice evidence must normalize into existing canonical objects whenever possible:

- Morning Weigh-in
- TrainingSession
- NutritionDay
- ActivityDay
- Protocol Completion
- Protocol Update
- DEXAScan
- Health / Symptom
- Goal
- future canonical evidence objects

The Voice Interpreter must not create voice-specific schemas, repositories, reports, or downstream branches. The downstream engines should never need to know whether evidence came from voice.

## Boundary

The Voice Interpreter:

- identifies evidence intent inside the transcript
- extracts visible or stated facts
- resolves relative dates from the evidence date when possible
- creates canonical evidence objects
- preserves the original transcript as provenance
- preserves confidence and quality metadata

The Voice Interpreter does not:

- answer physiology questions
- run scenario simulations
- generate coaching
- update goals directly
- update protocols directly
- schedule reminders directly
- decide Daily Briefing materiality
- own clarification strategy
- write repositories
- create presentation copy

## Clarification

Clarification belongs to a separate Clarification Engine.

The interpreter produces the best canonical evidence possible from the transcript. The Clarification Engine then asks:

> What missing information would most improve this evidence?

Clarification questions are optional. Users can save “good enough” evidence, answer quick prompts, or keep speaking naturally.

Priority examples:

- Training: workout type, exercises, duration, sets/reps, weight, intensity
- Nutrition: meal contents, meal timing, portion size, preparation
- Symptoms: body location, duration, severity, trigger
- Morning weigh-in: morning confirmation only if ambiguous

## Conversation Flow

The simulator should demonstrate:

```text
Listening
-> Interpreting
-> Clarifying
-> Review
-> Saved
```

Review summarizes the canonical evidence that will be created. Actions should include:

- Looks good
- Edit
- Keep talking

## Corrections

Corrections modify pending evidence rather than creating duplicates.

Examples:

- “Actually...”
- “No wait...”
- “Yesterday.”
- “Make that 168.4.”

The transcript remains provenance. Canonical evidence remains the source of truth.

## Communication

Voice capture should use system language, not a personality.

Prefer:

- Workout detected.
- Morning weigh-in recorded.
- Evidence captured.
- Which exercises were performed?
- Duration?

Avoid:

- I found...
- I think...
- I need...

The engine reasons. The coach explains. The UI communicates.

The microphone should not feel like ChatGPT. It should feel like a coach-aware command surface for PhysiqueOS: the user speaks naturally, PhysiqueOS routes intent, and the canonical engines do their work.
