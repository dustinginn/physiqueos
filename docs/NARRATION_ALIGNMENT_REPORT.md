# PhysiqueOS Narration Alignment Report

## Status

This report reconciles the intended PhysiqueOS Narrative Voice with the current Narrative Intelligence architecture, Daily Briefing implementation, goal evaluation, daily focus, briefing persistence, freshness, and Home presentation paths.

It is an architecture and narration review. It does not specify UI and is not an implementation plan for rebuilding the Daily Briefing.

## 1. Narrative Voice

### The narrator's identity

PhysiqueOS speaks as one elite, longitudinal coach. The narrator has reviewed the complete evidence picture, remembers the current chapter, understands what the user is trying to accomplish, and knows which truths matter now. It is calm enough not to narrate every fluctuation and decisive enough to speak clearly when the evidence changes the story.

The narrator is:

- context-rich, but concise
- analytical before prescriptive
- confident in proportion to evidence
- attentive to relationships across evidence domains
- restrained with praise, concern, and interruption
- continuous across surfaces and time
- anticipatory without pretending certainty
- curious only when an answer can improve understanding or decisions

### How the narrator thinks

Before speaking, the narrator asks:

1. What does the authoritative assessment say is true?
2. What changed since the last meaningful conversation?
3. Which change matters most to the active goal and current phase?
4. Does it advance, resolve, or interrupt the current chapter?
5. What evidence best explains that story?
6. What belongs in analysis, and what belongs in coaching?
7. What can wait without harming understanding or execution?
8. Is a statement useful, or is silence more intelligent?

The narrator connects evidence semantically. Weight, training, nutrition, activity, photos, DEXA, recovery, and protocol adherence are not independent feeds. Their relationship is the story. Agreement increases explanatory strength; disagreement creates a question or uncertainty, not permission to choose the most convenient signal.

### How the narrator speaks

The voice is professional, direct, human, and economical. It uses goal language before metric language, explains causality, distinguishes observation from inference, and makes uncertainty useful. It teaches the user how their body is responding without lecturing them.

It sounds like the same coach in a one-line notification and a monthly reflection. Surface bandwidth changes the depth, not the identity, truth, priority, or emotional posture.

Celebration is specific and earned. Concern is proportionate and actionable. Projection is framed as a likely path, not a promise. Recommendations explain why they matter. When nothing meaningful changed, the narrator may say so briefly or remain silent.

### What the narrator avoids

- metric recitation without meaning
- generic AI-summary phrases
- filling a template because a section exists
- copy variation masquerading as narrative novelty
- overclaiming from a single weigh-in, workout, or photo
- recommendations inside analytical interpretation
- praise without evidence
- motivational intensity unsupported by the moment
- medical diagnosis or clinician impersonation
- scientific jargon used to signal authority
- repeated advice after a topic has resolved
- multiple competing primary stories
- exposing repositories, interpreters, confidence machinery, or other implementation language

### What the narrator is not

| Comparison | Difference |
| --- | --- |
| Dashboard | A dashboard presents available facts. The narrator selects and explains the one story that matters. |
| AI summary | A generic summary compresses inputs. The narrator remembers prior conversations, ranks significance, defers noise, and advances a goal-scoped relationship. |
| Physician | A physician diagnoses and treats disease. PhysiqueOS communicates evidence-backed coaching within product scope and preserves appropriate clinical boundaries. |
| Scientist | A scientist primarily investigates and reports findings. PhysiqueOS uses scientific honesty but translates findings into personally relevant understanding and coaching. |
| Motivational speaker | A motivational speaker optimizes emotional energy. PhysiqueOS optimizes sound decisions, earned confidence, and sustainable execution. |

## 2. Briefing card responsibilities

Every section has one job. If content answers another section's question, it belongs elsewhere or should be omitted.

### Hero — “What is today's story?”

One dominant narrative, expressed as a concise claim and implication. It should reflect the highest-value story selected by Narrative Intelligence, not a static physiological status or a list of new evidence.

### Current Snapshot — “Where do I stand?”

The minimum present-state orientation needed to understand the story: current goal position, trajectory, confidence, and phase-relevant state. It reports the assessment without explaining the evidence chain.

### Progress — “How has the objective trend developed?”

The goal-relative trajectory across the appropriate time horizon. It distinguishes an objective trend from daily noise and does not duplicate today's event.

### Goal-Relevant Anchor Evidence — “What are the most relevant anchor measurements for my current goal?”

Stable, high-value calibration and reference measurements selected because they anchor the active goal. Examples include DEXA body composition for a cut or performance baselines for a strength goal. This is not an all-evidence inventory.

### Interpretation — “What happened, and how do the evidence streams relate?”

An analytical explanation of the selected story. It connects observations, agreement, disagreement, confidence, and limitations. It stops before advice or future priorities.

### Coach's Insight — “What does this mean, what should we do, and what matters next?”

The coaching synthesis. It may celebrate, challenge, prioritize, project, recommend, or prepare a transition. It is the only briefing section authorized to cross from explanation into coaching direction.

### Projection

The standalone Projection section should be removed from the intended information architecture. Projection remains an authoritative Goal/Prediction Engine output. When narratively relevant, its meaning belongs in Coach's Insight; detailed forecast inspection belongs on goal-specific surfaces. Removing the card does not remove projection truth.

## 3. Interpretation versus Coach's Insight

This is an architectural boundary, not an editorial preference.

| Interpretation owns | Coach's Insight owns |
| --- | --- |
| Connecting evidence | Selecting current focus |
| Explaining what changed | Recommending an action |
| Explaining agreement or conflict | Celebrating or challenging |
| Reducing uncertainty | Projecting what is likely next |
| Stating limitations | Preparing a transition |
| Explaining confidence changes | Asking for commitment or reflection |

Interpretation must not recommend, celebrate, prescribe, project, discuss future priorities, or change a protocol. Coach's Insight must not invent physiological meaning or strengthen confidence. It consumes the completed interpretation plus authoritative actions, predictions, and transition inputs.

A useful test is removal: after removing Coach's Insight, the reader should still understand what happened and why. After removing Interpretation, Coach's Insight may remain directionally useful but should visibly lack its supporting explanation.

## 4. Cadence

### Daily

A scheduled Daily Briefing primarily reflects the previous completed day. Saturday reviews Friday; Sunday reviews Saturday. Routine weigh-ins, training, nutrition, and activity normally enter the next scheduled briefing rather than interrupting the current conversation.

Daily narration is concise. It selects one story from the completed evidence window, uses today's state only for necessary orientation, and avoids treating partial current-day evidence as a completed pattern.

### Weekly

The Weekly Briefing reviews the previous completed week. Patterns lead: execution consistency, energy-balance strategy, training response, recovery, evidence agreement, wins, and emerging issues. It recommends fine-tuning only when the pattern warrants it.

Weekly is not seven Daily Briefings concatenated. It resolves or advances weekly threads and gives isolated daily noise the weight it earned in the larger pattern.

### Monthly

The Monthly Briefing reviews the previous completed month and is the most robust scheduled conversation. Story evolution leads: what PhysiqueOS believed at the start, what evidence changed that belief, what was learned about the user, how strategy performed, and what chapter is opening next.

Monthly is not a longer weekly recap. Its unit of meaning is adaptation and relationship evolution, not weekly compliance.

### Cadence boundary rule

Evidence windows should be explicit, closed, and traceable. A briefing declares its period, time zone, included evidence, excluded late arrivals, and previous narrative checkpoint. Historical evidence may update history and persistent assessment, but should not be misrepresented as evidence from the current narration window.

## 5. Event Briefings

High-value evidence may interrupt scheduled cadence because waiting would make the coaching relationship feel inattentive or delay a consequential conversation.

Initial interrupt types:

- DEXA
- Progress Photos
- Goal Completion
- Major Goal Change

An Event Briefing has its own immutable narrative event identity, trigger, assessment version, evidence references, dominant story, Conversation State transition, and consumption state. It is not a regenerated Daily Briefing with a different headline.

The Home screen should surface one active coaching conversation. Selection should consider consequence, recency, unread/consumption state, and continuity. A new Event Briefing normally supersedes the scheduled card until consumed or resolved; it does not create a second competing coach card.

The next scheduled briefing must know the event was already narrated and consumed. It may continue the chapter, explain a next-day implication, or remain brief. It must not replay the event analysis as new.

“Consumed” should mean that the user meaningfully opened or completed the relevant coaching conversation, not merely that generation succeeded. Generated, surfaced, opened, consumed, superseded, and resolved are distinct states.

## 6. Dynamic evidence hierarchy

Narrative Intelligence builds a story; it does not populate fixed evidence slots.

Default leadership by context:

- Normal daily: the most goal-relevant change across weight, training, and the combined nutrition/activity execution strategy
- Photo event or photo-led weekly: specific visual change leads
- DEXA event: the body-composition calibration and its cross-domain implications lead
- Weekly: repeated patterns and evidence agreement/disagreement lead
- Monthly: change in the longitudinal coaching story leads

The hierarchy is dynamic, not absolute. A material sustained performance decline can outrank an ordinary new low. A major safety or goal risk can outrank a photo event. Leadership is determined by authoritative materiality, goal impact, novelty, urgency, continuity, and confidence.

### Training during a cut

Training is interpreted as evidence about lean-mass preservation, recovery, and fatigue tolerance:

- **PR:** strong performance signal; meaningful when comparable and contextualized, but not proof of new lean tissue.
- **Stable performance:** positive preservation/recovery evidence, often worthy of quiet reinforcement rather than a headline.
- **Stalled progression:** expected or neutral when performance is stable during a late cut; not automatically a problem.
- **Isolated decline:** a watch item with recovery context, not a trend.
- **Sustained decline:** an emerging preservation/recovery risk when comparable sessions and supporting context confirm persistence.

### Nutrition and activity

Nutrition and activity are narrated together as execution of the energy-balance strategy. When both match the operating plan and outcomes remain aligned, they support the story without demanding extended commentary. They become narratively prominent when their relationship explains an outcome, exposes a repeated mismatch, changes recovery demand, or requires a coaching decision.

### Photos

Photo narration should identify specific, supportable anatomical observations and comparison limitations: waist contour, abdominal definition, lower-back or flank change, regional symmetry, posing, lighting, framing, and comparable conditions. “Photos support progress” is insufficient because it hides both the observation and its limitations.

### DEXA

DEXA deserves the richest evidence interpretation. Interpretation should connect body-fat percentage, fat mass, lean tissue, regional fat, android fat, visceral fat, RMR, training, photos, weight trend, and the active goal where those fields are present and valid. It must distinguish measurement from inference and stop before recommendations; Coach's Insight owns the response.

## 7. Conversation continuity

The canonical Conversation State defined in `docs/NARRATIVE_INTELLIGENCE.md` should govern every narration surface. In addition to chapter, open threads, deferred topics, and recent semantic fingerprints, alignment requires explicit event and cadence memory:

- narration event IDs and evidence-window IDs
- surfaced, opened, consumed, superseded, and resolved timestamps
- claims already explained
- questions asked and responses received
- topics resolved and their resolution basis
- authoritative evidence expected to resolve open topics
- current chapter momentum
- transition-conversation stage
- last completed daily, weekly, and monthly windows

Continuity is semantic. Changing words does not make a repeated claim new. A next-day briefing continues an event by describing what follows from it, not by summarizing it again.

## 8. Current implementation gaps

### Voice and narrative ownership

- `DailyNarrativeEngineService` contains useful story selection and continuity behavior, but it also contains hardcoded surface-ready narration and a Founder-specific primary goal label.
- Story choices are a small imperative branch set rather than a general candidate/ranking model.
- Narrative tone is encoded in scattered copy and filters rather than a reusable product-wide voice contract.

### Briefing assembly

- `DailyBriefingService` owns narrative novelty, briefing memory, celebrations, watch items, recommendations, interpretation, coaching, projection, editorial filtering, evidence reconciliation, and view-model assembly. Domain narration and presentation responsibilities are mixed.
- Interpretation and Coach's Insight are not cleanly separated. Some narrative story outputs and photo interpreter fields combine analytical and coaching language.
- A standalone projection object remains part of the returned briefing.
- The current response contains more sections than the intended six-question information architecture, creating overlap opportunities.

### Temporal behavior

- Freshness is primarily latest-evidence driven, so routine evidence can make the current briefing stale and trigger regeneration instead of waiting for the next scheduled closed window.
- Photo upload currently generates a Daily Briefing directly. There is no first-class Event Briefing domain model.
- Daily, weekly, and monthly narration windows are not represented as distinct first-class cadence types.

### Continuity and consumption

- `briefingMemory` is embedded in the latest Daily Briefing instead of residing in surface-independent Conversation State.
- Memory records prior headlines, themes, recommendations, and novelty, but not robust open-thread resolution, event consumption, cadence checkpoints, or cross-surface conversation history.
- The repository stores generated briefings, but the reviewed path does not expose a complete generated/surfaced/opened/consumed/resolved lifecycle.
- Home maps one Daily Briefing card, but does not arbitrate among first-class coaching conversations.

### Evidence hierarchy

- Photo-led narration exists, including a golden Founder scenario, but dynamic cross-domain candidate ranking is incomplete.
- Training performance has begun entering the briefing, but the full PR/stable/stalled/isolated-decline/sustained-decline narrative taxonomy is not yet an explicit contract.
- Nutrition and activity do not yet consistently enter narration as one energy-balance execution strategy.
- DEXA interpretation is distributed across progress, snapshot, projection, evidence, and watch-item helpers rather than assembled as one rich analytical story.

### Documentation conflict

- `docs/DAILY_BRIEFING.md` describes a ten-section briefing with Goal Outlook, Confidence Update, Execution Handoff, and a Coach's Closing Insight. The intended architecture now has six responsibilities, Goal-Relevant Anchor Evidence, a stricter Interpretation/Coach boundary, and no standalone Projection card.
- That document should be revised only when implementation planning begins; this review records the conflict without changing its current specification.

## 9. Components likely to change later

This is a responsibility forecast, not an instruction to implement now.

- Narrative Intelligence domain service: candidate generation, ranking, deferral, cadence, branches, and state transitions
- Conversation State model and repository
- Narrative event/decision model with audit trace
- Briefing cadence and evidence-window service
- Event Briefing model, repository, and service
- Coaching conversation arbitration for Home
- Consumption/read-state service independent of generation
- Daily/Weekly/Monthly narrative adapters
- `DailyNarrativeEngineService`, likely absorbed or narrowed into the canonical engine
- `DailyBriefingService`, narrowed toward cadence orchestration and presentation adaptation
- `DailyBriefingFreshnessService`, replaced or extended with closed-window and event semantics
- `DailyBriefingRepository`, separated from conversation state and event lifecycle
- `HomeBriefingService`, changed from Daily Briefing mapping to active-conversation selection
- photo ingestion action, changed from Daily Briefing regeneration to an Event Briefing trigger
- DEXA ingestion paths, similarly routed through event narration
- training-performance narrative signal adapter
- product-wide narration renderer/voice policy shared by notifications, goals, evidence pages, chat, and future voice
- `docs/DAILY_BRIEFING.md`, aligned after the architecture is accepted

Goal evaluation and evidence interpretation should not move into Narrative Intelligence.

## 10. Narration audit model

Every narration event should expose an internal trace sufficient to answer “Why did the coach say this now?”

```text
NarrationTrace
  identity
    traceId
    narrativeDecisionId
    conversationStateVersionBefore / After
    engineVersion
    generatedAt

  context
    userId
    activeGoalId / version / phase
    cadence: mini | daily | event | weekly | monthly | transition
    surfaceRequest
    timezone
    evidenceWindow: start / end / closedAt
    triggerType / triggerId

  authority
    physiologicalAssessmentId / version
    goalEvaluationIds
    recommendationIds
    predictionIds
    canonicalClaimIds
    canonicalEvidenceIds

  candidates[]
    candidateId / storyClass
    claimIds
    eligibility and exclusion reasons
    ranking dimensions and score breakdown
    continuity relationship
    repetition fingerprint and cost
    selected | supporting | deferred | suppressed
    reconsideration condition

  decision
    primaryStoryId
    supportingStoryIds
    interpretationClaimIds
    coachActionIds
    emotionalPosture
    depth
    branchDecision
    transitionStage

  renderingConstraints
    confidence language ceiling
    prohibited claims
    surface bandwidth
    voice policy version

  continuity
    prior chapter / next chapter
    opened / advanced / reinforced / resolved threads
    previously narrated event IDs
    repetition decision

  lifecycle
    persistedAt
    surfacedAt
    openedAt
    consumedAt
    supersededAt
    resolvedAt
```

The trace stores IDs and decision rationale, not a second mutable copy of physiological truth. Rendered copy should retain a reference to its trace and source Narrative Decision.

## 11. Recommended implementation order

1. Ratify the Narrative Voice, six section responsibilities, cadence semantics, and Interpretation/Coach boundary.
2. Define versioned contracts for authoritative assessment input, Narrative Decision, Conversation State, narration trace, and evidence windows.
3. Add characterization tests around current narrative output, persistence, freshness, photo triggers, Home mapping, and continuity before migration.
4. Establish Conversation State and narration lifecycle independently from Daily Briefing persistence.
5. Implement candidate generation, ranking, deferral, repetition control, and trace output in simulator-canonical Narrative Intelligence.
6. Implement scheduled closed windows for daily, weekly, and monthly cadence.
7. Implement first-class Event Briefings and consumption semantics, beginning with photos and DEXA.
8. Add Home active-conversation arbitration.
9. Separate analytical Interpretation from Coach's Insight at the semantic output layer.
10. Adapt Daily Briefing to the six responsibilities and remove the standalone Projection presentation.
11. Extend the same decisions and voice renderer to goal pages, evidence pages, notifications, and future conversational surfaces.
12. Add goal-completion and major-goal-change events, then staged transition conversations.
13. Align `docs/DAILY_BRIEFING.md` and retire obsolete briefing-specific narrative rules only after production parity is verified.

## Narration walkthroughs

These examples describe semantic narration, not production copy. “Interpretation” remains analytical; “Coach's Insight” owns response and direction.

### Ordinary weigh-in day

- **Current chapter:** Establishing whether the cut's recent direction remains stable.
- **Primary story:** One routine weigh-in did not materially change the trend.
- **Dominant evidence:** Previous day's morning weight relative to the rolling trend.
- **Supporting evidence:** Recent comparable weights and the last anchor assessment.
- **Interpretation:** The value sits within expected short-term variation and neither confirms a new acceleration nor establishes a stall.
- **Coach's Insight:** Keep the current plan unchanged and let repeated observations determine whether the chapter advances.
- **Intentionally omitted:** Full nutrition, activity, protocol, DEXA, and photo recaps that add no new explanation.
- **Depth and cadence:** Concise scheduled daily narration; routine evidence is acknowledged without manufacturing novelty.

### Weight plus training plus nutrition plus activity day

- **Current chapter:** Testing whether consistent execution is producing the expected response.
- **Primary story:** The energy-balance strategy was executed as intended while training remained supported.
- **Dominant evidence:** Previous day's combined nutrition/activity execution relative to plan.
- **Supporting evidence:** Weight trend and comparable training performance.
- **Interpretation:** Intake and activity jointly matched the intended deficit strategy; stable training and a non-contradictory weight trend make the day coherent, though one day cannot establish outcome causality.
- **Coach's Insight:** Reinforce the repeatable pattern; no fine-tuning is warranted.
- **Intentionally omitted:** Separate praise for calories, activity, and every workout set; unrelated protocol details.
- **Depth and cadence:** Standard daily depth because several streams explain one story, not four stories.

### PR during a cut

- **Current chapter:** Protecting performance and lean mass while fat loss continues.
- **Primary story:** A comparable PR is a strong sign that the cut has not suppressed performance in this movement.
- **Dominant evidence:** Canonical exercise history establishing a valid PR.
- **Supporting evidence:** Recovery context, recent training stability, weight trajectory, and goal phase.
- **Interpretation:** Performance exceeded the comparable historical best despite the energy deficit. This supports recovery and preservation confidence but does not prove lean-tissue gain.
- **Coach's Insight:** Celebrate the specific achievement and preserve the conditions that enabled it; avoid using one PR to justify more aggressive cutting.
- **Intentionally omitted:** Unrelated exercises, generic physique claims, and claims of muscle gain.
- **Depth and cadence:** Daily if discovered in the closed prior-day window; major only if the PR materially changes the training chapter.

### Stalled progression

- **Current chapter:** Maintaining productive training through the middle or late cut.
- **Primary story:** Load progression has paused, but performance has not declined.
- **Dominant evidence:** Several comparable sessions with stable load, reps, effort, and volume.
- **Supporting evidence:** Current deficit phase, recovery, and absence of sustained regression.
- **Interpretation:** The exercise is stable rather than progressing. During a cut, stability can remain consistent with preservation; the evidence does not yet indicate deterioration.
- **Coach's Insight:** Keep technique and effort consistent and monitor rather than forcing progression or changing the plan prematurely.
- **Intentionally omitted:** A plateau alarm, speculative recovery causes, and unrelated physique progress.
- **Depth and cadence:** Best suited to weekly pattern narration unless it resolves an already active training thread.

### Sustained training decline

- **Current chapter:** Watching recovery margin and lean-mass preservation late in the cut.
- **Primary story:** Comparable performance has declined across repeated sessions and now deserves intervention.
- **Dominant evidence:** Sustained multi-session reduction in load, reps, or volume at comparable effort.
- **Supporting evidence:** Recovery, sleep, nutrition/activity strategy, weight-loss pace, symptoms, and phase.
- **Interpretation:** The decline is persistent rather than isolated. Its timing alongside the available recovery and energy evidence raises a credible fatigue or preservation concern; causality remains bounded by missing evidence.
- **Coach's Insight:** Prioritize the authoritative recovery or plan adjustment, explain the expected benefit, and define what evidence should show improvement.
- **Intentionally omitted:** Celebration, distant projections, and certainty about muscle loss without calibration evidence.
- **Depth and cadence:** Major Coaching Event if material and decision-changing; otherwise the dominant weekly story.

### Weekly briefing with photos

- **Current chapter:** Confirming whether late-cut changes are visible while performance remains protected.
- **Primary story:** Specific visual changes align—or fail to align—with the week's physiological and execution pattern.
- **Dominant evidence:** Comparable progress photos with anatomical observations.
- **Supporting evidence:** Weekly weight trend, training performance, nutrition/activity execution, recovery, and latest DEXA anchor.
- **Interpretation:** Name the observed anatomical differences and limitations, then explain how the weekly streams agree or conflict. Photos refine the visual-goal assessment without estimating exact body fat.
- **Coach's Insight:** Celebrate an earned visual change or frame the unresolved question; reinforce or adjust the authoritative weekly focus.
- **Intentionally omitted:** Daily metric recaps, non-comparable photo claims, and standalone projection detail.
- **Depth and cadence:** Rich weekly synthesis because photos provide a goal-proximal anchor for the completed week.

### Weekly briefing without photos

- **Current chapter:** Evaluating whether execution and performance continue to support the cut.
- **Primary story:** The week's pattern is clear enough—or remains limited—without a new visual calibration.
- **Dominant evidence:** Weekly weight, training, and combined nutrition/activity patterns.
- **Supporting evidence:** Recovery, protocol adherence, and the most recent photo/DEXA anchors clearly labeled as historical context.
- **Interpretation:** Explain pattern agreement and what cannot be confirmed visually this week.
- **Coach's Insight:** Reinforce the plan or identify one fine-tuning action; name the value of the next comparable photo only if it would resolve active uncertainty.
- **Intentionally omitted:** Pretending old photos are new, day-by-day summaries, and criticism for missing optional evidence.
- **Depth and cadence:** Normal weekly depth, calibrated downward where anchor evidence is absent.

### Monthly briefing

- **Current chapter:** The month's opening thesis and how it evolved.
- **Primary story:** The most important change in PhysiqueOS's understanding of the user's goal trajectory.
- **Dominant evidence:** Month-level change in persistent assessment and resolved narrative chapters.
- **Supporting evidence:** DEXA/photos where available, weight and training patterns, execution strategy, recovery, prediction calibration, and user responses.
- **Interpretation:** Reconstruct what was believed, which evidence confirmed or challenged it, and what was learned about individual response. Separate stable findings from unresolved uncertainty.
- **Coach's Insight:** Define the next chapter, celebrate durable wins, address the highest-leverage concern, and prepare transition discussion if warranted.
- **Intentionally omitted:** Exhaustive weekly recaps, every PR, every weigh-in, and already resolved minor deviations.
- **Depth and cadence:** Most robust scheduled narration because its purpose is model and relationship evolution, not routine status.

### Same-day photo briefing

- **Current chapter:** Awaiting visual confirmation of the current goal trajectory.
- **Primary story:** The new photos provide a specific visual update worth discussing now.
- **Dominant evidence:** Newly interpreted comparable photos.
- **Supporting evidence:** Weight trend, last DEXA anchor, training, and comparison-quality limitations.
- **Interpretation:** Describe specific anatomical changes or lack of change, comparison confidence, and agreement with other streams. Stop before response.
- **Coach's Insight:** Celebrate, contextualize, or identify the next focus; avoid changing the plan unless an authoritative recommendation supports it.
- **Intentionally omitted:** Routine same-day incomplete evidence and generic “photos support progress” language.
- **Depth and cadence:** Immediate Event Briefing because photos are high-value, goal-proximal evidence.

### Same-day DEXA briefing

- **Current chapter:** Calibrating whether the cut is losing fat while preserving lean tissue.
- **Primary story:** The scan materially updates body-composition understanding.
- **Dominant evidence:** New canonical DEXA measurements and validated change from the comparable prior scan.
- **Supporting evidence:** Fat mass, lean tissue, regional/android/visceral fat, RMR, weight trend, training performance, photos, and current goal.
- **Interpretation:** Explain the complete measurement pattern, agreement and conflict across domains, measurement limits, and what confidence changed. Do not recommend.
- **Coach's Insight:** State what the result means for the current plan, celebrate or address concern, and introduce transition readiness if authoritative criteria support it.
- **Intentionally omitted:** Unrelated routine evidence, medical diagnosis, and false precision beyond the scan/model contract.
- **Depth and cadence:** Rich immediate Event Briefing because DEXA is a high-value calibration event.

### Next-day briefing after an Event Briefing

- **Current chapter:** Continuing the photo or DEXA chapter already discussed.
- **Primary story:** The ordinary next-day evidence either supports the event's implication or adds nothing material.
- **Dominant evidence:** Previous day's routine closed window, evaluated against the already-consumed event decision.
- **Supporting evidence:** Event conclusion by reference, not replayed analysis.
- **Interpretation:** Explain only the new relationship—for example, the next weigh-in is consistent with the scan/photo story but does not independently strengthen it much.
- **Coach's Insight:** Continue the agreed focus or remain brief; acknowledge that the event already established the chapter.
- **Intentionally omitted:** Repeating anatomical observations, scan metrics, celebration, or recommendations already consumed.
- **Depth and cadence:** Short Daily Briefing because continuity is more intelligent than repetition.

### Late-cut transition readiness

- **Current chapter:** Determining whether the cut's success criteria and sustainability support moving toward maintenance.
- **Primary story:** A future goal is becoming relevant, but transition remains a user-confirmed decision.
- **Dominant evidence:** Authoritative multi-dimensional transition assessment, not body-fat percentage alone.
- **Supporting evidence:** Physiological confidence, goal progress, evidence quality, user-defined visual success, performance/preservation, recovery, sustainability, and prior user preferences.
- **Interpretation:** Explain which readiness dimensions are satisfied, which remain uncertain, and why the evidence suggests the conversation is timely.
- **Coach's Insight:** Open an evolution branch: reflect on success and sustainability, present the likely next phase, and ask whether the user is ready to explore transition. Do not create or activate a goal.
- **Intentionally omitted:** Automatic goal completion, an imposed maintenance plan, and transition certainty without user confirmation.
- **Depth and cadence:** Goal Transition Conversation, potentially introduced gradually in weekly/monthly narration before explicit confirmation.

## Alignment conclusion

The intended voice is coherent with the first-class Narrative Intelligence architecture: Goal and assessment systems determine truth; Narrative Intelligence selects, sequences, and voices that truth; Coaching owns decisions; surfaces express one continuous relationship at different bandwidths.

The current implementation contains strong early forms of evidence-aware storytelling, photo leadership, novelty handling, and briefing memory. Its principal limitation is not lack of copy. It is that narration, coaching, continuity, cadence, event handling, and presentation remain coupled to the Daily Briefing. The next implementation phase should establish semantic narrative contracts and durable conversation state before redesigning any card or hardcoding additional narration.
