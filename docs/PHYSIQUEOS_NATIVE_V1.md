# PhysiqueOS Native V1

## Purpose

PhysiqueOS Native V1 exists to deliver the current PhysiqueOS experience
through a native iPhone application.

The web application is behaviorally mature and remains the product reference.
Native V1 should preserve its established product semantics, system boundaries,
navigation model, and information architecture. The objective is not feature
parity for its own sake. It is to express the same product through a faster,
more reliable, and more deeply integrated iPhone experience.

Native V1 is not a redesign proposal or a technical implementation plan. It is
the product specification against which future native decisions should be
evaluated. The immediate audience is the person using PhysiqueOS every day.
Broader release concerns should not displace the quality, trust, and continuity
of that daily experience.

The current behavioral baseline and native ownership boundary are recorded in
[PRE_IOS_READINESS_CHECKPOINT.md](./PRE_IOS_READINESS_CHECKPOINT.md). The
logical intelligence architecture remains defined by
[ARCHITECTURE.md](./ARCHITECTURE.md).

## Core philosophy

Native V1 preserves the principles that already govern PhysiqueOS:

- Strategy and Execution remain separate. Strategy defines why and what the
  plan intends to accomplish. Execution defines how that strategy operates in
  practice.
- Evidence is authoritative. Conclusions, confidence, recommendations, and
  briefings must remain traceable to evidence.
- Progress Intelligence interprets evidence but never fabricates it. It may
  explain patterns, assess uncertainty, and surface implications without
  becoming an independent source of fact.
- Native capabilities reduce friction rather than changing the product's
  workflows or meaning.
- User trust is more important than automation. The product should prefer an
  honest limitation or visible uncertainty over an unexplained assumption.
- Every meaningful conclusion should be explainable through the evidence and
  reasoning that support it.
- Stable identities matter. A record does not become a different workout,
  Goal, protocol, or Execution item merely because it moves between devices,
  sources, or stages of completion.
- PhysiqueOS should minimize user effort while preserving evidence quality and
  historical integrity.
- Specialized applications may remain the preferred place for data entry.
  PhysiqueOS should reconcile their evidence instead of creating unnecessary
  parallel workflows.

These principles extend the product rules in
[PRINCIPLES.md](./PRINCIPLES.md). Native convenience does not override them.

## What remains unchanged

The primary product surfaces retain their current responsibilities:

- **Home** remains the daily cockpit. It answers whether the user is on track
  and what matters now without becoming a dashboard.
- **Goals** remains the destination for the active objective, its phases,
  progress, completed achievements, and supporting evidence.
- **Operating Plan** remains the canonical home for active Strategy and
  Execution.
- **Log** remains the universal evidence-capture entry point.
- **Evidence** remains the place to inspect what happened, where information
  came from, and how it relates to Goals.
- **Progress Intelligence** remains the shared interpretation of evidence,
  trajectory, confidence, decisions, and cross-domain meaning.
- **You** remains the control center for Goals, Operating Plan, integrations,
  and personal configuration.

The bottom-level mental model remains:

```text
Home -> Goals -> Log -> Evidence -> You
```

Operating Plan remains reachable through You and through relevant contextual
handoffs. Progress Intelligence appears through the surfaces that consume its
shared conclusions; it does not require a separate competing navigation model.

Navigation labels may use native controls, but their meaning and destination
ownership remain fundamentally unchanged. Native V1 should preserve the
information budget and progressive-disclosure rules in
[INFORMATION_ARCHITECTURE.md](../INFORMATION_ARCHITECTURE.md).

## What becomes native

Native capabilities should make established workflows feel immediate and
dependable:

- Navigation uses native structure and transitions.
- Contextual work may use native sheets when a full-page transition adds
  unnecessary distance.
- Haptics may confirm meaningful actions and state changes.
- Camera and photo-picker access reduce friction in evidence capture.
- Notifications can enter the exact action that needs attention.
- Background refresh can keep appropriate read models and imported evidence
  current.
- Apple Health can contribute supported evidence through the canonical intake
  path.
- Temporary local work can remain available when connectivity is interrupted.
- Native controls, pickers, and transitions can replace browser-shaped
  interaction where the product meaning remains the same.

These capabilities improve speed, continuity, and platform fit. They do not
introduce a second workflow, a second source of truth, or a native-only version
of PhysiqueOS intelligence.

## Core system boundaries

### Strategy

Strategy owns planning intent: why a protocol exists, what it is intended to
support, and how it relates to the active Goal. It does not own operational
completion or evidence.

### Execution

Execution owns operational state: cadence, schedule, dose, timing, reminders,
priority, notes, and phased implementation where applicable. Existing
Execution records retain stable identity through edits, hydration, and
device-to-device continuity.

### Evidence

Evidence owns the factual record. It preserves source, time, provenance,
identity, corrections, reconciliation, and historical continuity. Raw imports
and user submissions become canonical only through the established evidence
boundary.

### Progress Intelligence

Progress Intelligence reads canonical evidence in Goal and phase context. It
produces observations, claims, confidence, assessments, and narrative
candidates without rewriting source evidence or assuming ownership of
operational state.

The product loop remains:

```text
Evidence -> Interpretation -> Prediction -> Validation
-> Model Improvement -> Better Predictions
```

### Briefings

Briefings are cadence-appropriate expressions of shared intelligence. They
explain what PhysiqueOS now believes, why it matters, and what the user should
understand. They do not create a separate narrative truth and do not replace
Home or notifications as execution surfaces.

Current cadence and Home precedence remain governed by
[NARRATIVE_SCHEDULE.md](./NARRATIVE_SCHEDULE.md). Native presentation should
consume the same authoritative artifacts rather than independently generating
briefing behavior.

These boundaries are product boundaries, not web conventions. They should
remain stable across web, native, and future interfaces.

## Data ownership

Native V1 follows one canonical ownership model:

- Evidence remains authoritative for observed facts.
- Imported data never bypasses Evidence.
- Duplicate prevention and deterministic reconciliation remain mandatory.
- Corrections preserve provenance and historical continuity.
- Execution owns operational state.
- Strategy owns planning intent.
- Goals own objective, phase, transition, and evaluation context.
- Progress Intelligence remains read-only with respect to Evidence, Strategy,
  Execution, and Goal state.
- Presentation labels do not become lifecycle authority.
- Native local state may support responsiveness and recovery, but it does not
  define a parallel persistence contract.

The same event should not become multiple canonical records merely because it
was observed through more than one source or enriched later. Identity,
provenance, and reconciliation rules remain shared product behavior.

## Apple Health philosophy

HealthKit contributes evidence. It does not replace the PhysiqueOS Evidence
system and does not become an independent source of product truth.

Supported workouts, activity, weight, and other imported records should enter
the existing canonical intake and reconciliation flow. PhysiqueOS remains
responsible for identity, deduplication, provenance, corrections, Goal context,
and downstream interpretation.

An imported Strength Training session may initially contain only the
information available from Apple Health. The user should be able to enrich that
same workout with movements, sets, reps, and load. Import and enrichment must
continue to represent one stable workout identity. Missing movement detail is
context to complete, not evidence that a second workout occurred.

Apple Health integration should respect existing workflows: it reduces manual
effort while leaving specialized workout, nutrition, wearable, and health
applications free to remain useful sources.

## Training Logger philosophy

Training Logger is one product, not a separate Live Workout model. Live/in-gym
logging and retrospective entry are two capture modes that converge on the same
exercise-occurrence, set, execution-context, reconciliation, and final
`TrainingSession` architecture. Mode may affect time context and incremental
durability, but it must not create parallel workout semantics or client-specific
session types.

The production web Training Logger at `/log/training` is now the accepted
pre-iOS implementation. The isolated `/preview/training-logger` route remains
available as a memory-only interaction reference and never mutates a confirmed
`TrainingSession`. Production reuses that accepted interaction model while
routing history, progression, Apple evidence, Evidence Review, and confirmation
through canonical PhysiqueOS owners.

In live mode, a workout can begin with a stable identity and accumulate
movements, sets, reps, load, and relevant context throughout training. Saving
progress preserves the current session; it does not submit a new workout. Final
submission completes the canonical workout without breaking its identity or its
link to an earlier Apple Health import. Retrospective mode builds the same
structure around a required past date and reaches the same reconciliation and
evidence boundary. Manual retrospective capture must not fabricate an exact
start time when the user does not know one; reconciled Apple Health or uploaded
screenshot evidence may later supply better-supported timing metadata.

Training Logger's future `Suggested Today` intelligence should learn primarily
from actual confirmed workout evidence and TrainingSession history. Goal and
Training Strategy schedules describe intent and may provide context, but they
must not become the behavioral source of truth when observed training rhythm
differs from the plan.

On web, the non-canonical working draft is recoverable from local browser
storage. Loaded Training history and Goal context are deliberately excluded
from the persisted recovery payload and are rehydrated from current canonical
reads. Evidence packages and pending Evidence Reviews remain server-owned.
Clearing browser storage or moving devices does not provide recovery; native
work should replace this bounded web mechanism with durable, encrypted local
state and synchronization without changing canonical identity.

This is a native expression of the stable identity and incremental persistence
requirements established at the pre-iOS checkpoint, not a new workout system.

### Shared Training occurrence contract

Web, native, imports, review, correction, reporting, and future live logging
must share one Training hierarchy:

```text
Canonical Exercise -> optional execution Variant -> Sets
```

The canonical exercise is the durable movement identity. A Variant describes
how that movement was executed on one exercise occurrence, such as `Static
Hold`, `3-Second Pause`, or `Slow Eccentric`; it does not create a second
exercise-library identity. In V1, an occurrence Variant applies to all of that
occurrence's sets. Set-level Variants are intentionally outside the contract.

Typed evidence may declare `Variant: <freeform value>` immediately beneath an
exercise heading. Meaningful user wording and punctuation should be preserved,
and the Variant must not leak to a later exercise. Parenthetical headings may
be interpreted as Variants only when the parenthetical is not already part of
a known canonical exercise identity and the base movement can be resolved
safely. Ambiguous input remains reviewable rather than being silently recast.

Exercise relationship context is independent. An occurrence may be ordinary
or have a Variant and may separately be standalone or participate in a
Superset. Review, correction, reprocessing, persistence, and downstream
briefings must preserve both dimensions. Historical and performance
comparisons require the same canonical exercise, Variant, and relevant
relationship context. The Training Library remains unified by canonical
exercise and presents Variant as secondary occurrence or record metadata.

Future native capture and live-workout interfaces should write this contract
directly instead of defining client-specific Variant semantics.

### Adaptive progression guidance

Training Logger progression guidance is helpful, optional, and relative to the
active Goal and phase rather than a universal plateau threshold. The shared
production recommendation service uses a conservative fallback hierarchy:
Goal/phase expectation, then sufficiently supported user-wide actual cadence,
then sufficiently supported movement-specific cadence. Only canonical
exercise occurrences with matching Variant and Superset comparison context
participate. Insufficient evidence produces no synthetic recommendation;
precise load or repetition targets appear only when historical increments
support them. A user may apply, modify, or ignore a recommendation; guidance
does not become evidence and does not block logging.

### Workout evidence reconciliation

Apple Health acquisition is an adapter into evidence reconciliation, not the
owner of detailed strength structure. An Apple workout supplies an evidence
shell while PhysiqueOS owns exercises, occurrence identities, sets, Variants,
and relationship groups. Reconciliation should preserve meaningful source
metadata such as authoritative timing, duration, and active calories through
Evidence Review. Strong matches may be offered directly; ambiguous matches
require explicit selection; and the user may continue when no match is
available.

Production web capture pairs a detailed Training Logger draft with zero, one,
or many Apple Health screenshots through the universal Evidence Intake
interpreter. The adapter normalizes each visible Apple workout into the same
reconciliation shape intended for HealthKit: source workout identity, source
artifact references, date, workout type, supported timing, duration, calories,
provenance, and consumed state. Missing or ambiguous values remain null. Native
iOS replaces screenshot acquisition with direct HealthKit access without
changing reconciliation or the canonical `TrainingSession` contract.

Reconciliation accepts a batch of normalized Apple workout evidence, not only
one source session. A single user flow may link strength evidence to the
detailed `TrainingSession` while proposing separate cardio workout or activity
records for other accepted evidence in the same batch. One reconciliation flow
therefore does not imply one canonical record, and non-strength evidence must
not be flattened into strength-session detail.

Apple workout matching follows an explicit candidate pipeline: relevant date,
eligible workout type, unlinked/unconsumed source workouts, then ranking and
user confirmation where ambiguity remains. Each normalized source workout has
a durable source identifier and consumption owner. Once consumed by a
canonical record, it is ineligible for every other record; duplicate prevention
belongs in the reconciliation model rather than presentation-only filtering.

Both acquisition paths terminate at the same platform-independent contract:

```text
Web Apple Health screenshots -> evidence interpretation -> normalized Apple workout evidence
Native HealthKit             -> normalized Apple workout evidence
Normalized Apple workout evidence -> shared reconciliation -> canonical owner proposals
```

Manual retrospective logging continues to require a date without fabricating
an exact start time. Apple source timing may enrich matched evidence later.
Suggested Today should learn primarily from confirmed workout evidence and
history, not planned Goal or Training schedule intent.

### Production web Training Logger boundary

The production flow is:

```text
Log -> Training Logger -> Start Workout | Log Past Workout
-> detailed draft -> Workout Review -> optional Apple screenshot batch
-> normalized reconciliation -> canonical Evidence Review -> confirmation
```

The draft owns interaction-only state such as Done toggles. The proposed
TrainingSession contains final exercises and sets, canonical exercise IDs,
stable exercise-occurrence IDs, occurrence Variants, Superset relationship
groups, workout date, legitimate timing, and source provenance. Logger mode is
optional provenance and never partitions Training history.

The real Evidence Review lifecycle is the only authorization boundary for the
canonical write. It presents the detailed strength proposal as workout date,
exercise count, and set count rather than requiring another set-by-set review.
Matched Apple duration/calories/linkage and additional workout proposals remain
visible. Confirmation uses the existing atomic canonical evidence coordinator,
then the normal Training Library, performance-event, Progress Intelligence,
reporting, briefing, and Goal-evaluation pipelines.

Candidate filtering happens before presentation. Only relevant, eligible,
unconsumed Apple source workouts can be selected; source identity is checked
again while staging Evidence Review to prevent a race or duplicate link.
Ambiguous strength matches require explicit selection, and no match never
blocks a valid detailed log. Cardio workouts remain separate canonical
TrainingSession workout records under existing ownership. Walking is presented
as optional activity/workout evidence and is excluded by default because the
current product has no accepted rule to create every Walking workout
automatically.

`Suggested Today` is emitted only when confirmed Training history contains a
repeated same-day rhythm with a conservative evidence minimum. Planned Goal or
Training schedule intent is not an input to this behavior. When history is
insufficient, production shows no suggestion.

### Production exercise selection and draft semantics

Normal Training Logger selection is user-history-first. It lists unique
canonical exercise identities found in confirmed canonical TrainingSessions,
then applies the selected training-area filter. Variant and Superset context do
not create additional picker identities. The explicit **Add new exercise** path
may search the broader canonical registry; choosing an existing movement keeps
that canonical identity, and confirmation of its first legitimate session makes
it part of the normal performed-history list later. Internal registry IDs,
taxonomy enums, and missing metadata must never be rendered as picker copy.

Web draft recovery is intentional and reversible:

- **Leave workout** saves the recoverable local draft and exits to Log.
- **Resume workout** explicitly restores that draft.
- **Cancel workout** requires confirmation and removes only the local draft.

### Production Logger QA mutation boundary

Use these classifications when validating production without creating fake
Founder evidence:

| Stage | Class | Persistence behavior |
| --- | --- | --- |
| Open Logger through set editing, Done, Variant, Superset, progression choice, Finish, and Workout Review | A — local draft | Browser-local draft only; no server Evidence write. |
| Continue without Apple screenshots and enter no-match reconciliation | B — transient server | Reads canonical evidence and computes candidates; saves no package or review. |
| Select screenshot files before submission | A — local draft | Browser file selection only. |
| Choose **Add Apple Health evidence** | C — persistent non-canonical staging | Uploads artifacts, interprets them, and saves the interpreted EvidencePackage even if the flow is abandoned. |
| Select a strength match or include/exclude additional evidence | A — local draft | Reconciliation choices remain in the recoverable draft; uploaded source artifacts/package already exist when screenshots were submitted. |
| Choose **Continue to Evidence Review** | C + D — package and Evidence Review staging | Saves the final Logger EvidencePackage and creates a pending Evidence Review record. |
| View the pending Evidence Review | D — Evidence Review staging | Reads the staged review; canonical Training history is still unchanged. |
| Confirm the Evidence Review | E — canonical mutation | The atomic confirmation pipeline creates/reconciles the detailed TrainingSession and any included cardio/other records. Apple source linkage becomes consumed here. |

Therefore, no-screenshot production testing may safely continue through the
no-match reconciliation screen, but fake data must not proceed through
**Continue to Evidence Review**. Screenshot-based testing stops earlier:
submitting screenshots already persists source artifacts and an interpreted
EvidencePackage, so only legitimate evidence should be submitted.

## Notification philosophy

Notifications exist to reduce navigation.

When a notification represents an action, opening it should lead directly to
the appropriate destination and context. Examples include:

- a Nutrition action opening the relevant logging experience;
- a workout action opening the planned or in-progress session;
- a DEXA reminder opening its scheduling or evidence workflow;
- a protocol reminder opening the relevant Execution action.

Notifications should not duplicate briefings, create a second task system, or
invent urgency. Their content and destination should reflect canonical
Strategy, Execution, Evidence, Goal, and briefing state.

## Offline-first behavior

Native interaction should feel immediate whenever practical, including during
temporary connectivity loss.

The user should be able to continue appropriate in-progress work, especially
evidence capture and live workout activity. Temporary local work should retain
stable identity, preserve ordering, and synchronize cleanly when connectivity
returns. Synchronization should not silently duplicate records or overwrite a
newer authoritative state.

Offline-first describes the desired experience, not permission to introduce a
second source of truth. Canonical ownership, conflict handling, and provenance
remain visible product responsibilities.

## Native design philosophy

The current web interface already represents the desired product experience.
Native V1 should preserve its information architecture, hierarchy, language,
and calm visual character.

Changes should occur primarily at the interaction layer:

- sheets may replace selected full-page transitions;
- native pickers may replace browser controls;
- swipe actions may support clear, reversible contextual actions;
- animation may clarify continuity and state change;
- haptics may confirm meaningful completion;
- native navigation may shorten common paths.

These are refinements to established workflows. They are not reasons to
reorganize major screens, broaden Home, duplicate information, or redefine the
roles of Goals, Operating Plan, Log, Evidence, Progress Intelligence, and You.

The semantic design rules in [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) remain the
visual reference. Native components may express those rules through platform
controls without copying browser implementation details.

## Native V1 milestones

The milestones describe product capability in deliberate layers. They do not
set delivery dates or prescribe an engineering approach.

### Milestone 1: Native shell

- Native project foundation
- Shared design-system expression
- Primary navigation
- Light and dark themes
- Typography
- Empty states for the established product destinations

### Milestone 2: Shared product surfaces

- Home
- Goals
- Operating Plan
- Log
- Evidence
- Progress Intelligence presentation
- You
- Shared briefings and contextual detail

The surfaces should preserve established read models, actions, hierarchy, and
progressive disclosure.

### Milestone 3: Apple Health integration

- Supported HealthKit permissions
- Canonical import into Evidence
- Deterministic duplicate prevention
- Stable workout matching
- Import status and understandable recovery
- Enrichment of imported Strength Training sessions

### Milestone 4: Live workout workflow

- Stable in-progress workout identity
- Incremental movement and set saving
- Interruption recovery
- Offline continuity where practical
- Canonical final submission
- Reconciliation with an existing imported session

### Milestone 5: Notifications

- Native permission management
- Protocol, workout, Nutrition, and DEXA action routing
- Direct contextual deep links
- Consistency with canonical Execution and Goal state

### Milestone 6: Native polish

- Purposeful transitions and animation
- Haptic feedback
- Native sheets, pickers, and contextual actions
- Background refresh
- Accessibility and platform consistency
- Performance and reliability refinement through daily use

## Deferred work

The following work is intentionally deferred until substantial personal daily
use reveals a real need:

- widgets;
- Siri and App Intents;
- public-release onboarding, support, and operational optimization;
- advanced sharing and export experiences;
- community or social features;
- broad settings redesign;
- historical protocol browsing improvements;
- speculative integrations without a demonstrated daily-use benefit;
- major information-architecture or screen redesign.

Deferral is a product choice, not a rejection of future value. These decisions
should be informed by observed friction, repeated use, and evidence of benefit
rather than platform novelty or imagined public-release requirements.

## Success criteria

Native V1 is successful when:

- it supports dependable personal daily use;
- established workflows remain stable and understandable;
- common logging is fast;
- Apple Health evidence imports reliably and reconciles deterministically;
- evidence remains trustworthy and traceable;
- live workouts feel continuous, resilient, and free of duplicates;
- Strategy and Execution remain clearly separated;
- notifications shorten the path to appropriate actions;
- temporary connectivity loss does not make the product feel fragile;
- the application feels native without becoming a different product;
- the user can understand what PhysiqueOS believes and why;
- the native experience earns trust over months of real-world use.

Success is continuity with less friction. Native V1 should make PhysiqueOS
faster and more dependable while preserving the product that the web
application has already established.
