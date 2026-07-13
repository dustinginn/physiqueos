# Intelligence Synchronization

## Purpose

PhysiqueOS should have one canonical intelligence pipeline.

The simulator exposes, debugs, and validates that pipeline. Production executes the same canonical pipeline and renders its outputs.

This document defines the permanent workflow for moving validated intelligence into shared canonical modules without creating a second production implementation.

## Core Rule

There is only one intelligence.

The simulator validates it.

Production renders it.

If production output differs from approved simulator output, treat the difference as a canonical pipeline integration or presentation bug unless a new simulator approval explicitly changed the behavior.

## Canonical Pipeline

Every intelligence feature should align to this contract:

```text
Raw Evidence
-> Canonical Evidence Objects
-> Canonical Structured Observations
-> Canonical Physiological Model
-> Canonical Narrative
-> Canonical Coaching Narrative
-> Presentation
```

The Presentation Layer should simply render outputs from the canonical pipeline.

That same pipeline should power:

- Simulator
- Daily Briefing
- Timeline
- Evidence Pages
- Chat
- Voice
- Weekly Review
- Monthly Review
- Notifications
- Future experiences

## Responsibility Boundary

Canonical engine modules own:

- evidence interpreters
- canonical evidence object creation
- structured observation generation
- persistent physiological modeling
- Narrative Engine behavior
- Coaching Engine behavior
- coaching language
- editorial judgment
- evidence reconciliation
- narrative prioritization

Simulator owns:

- pipeline inspection
- pipeline debugging
- stage-by-stage visualization
- golden reference cases
- Founder QA of engine behavior

Production owns:

- data collection
- state management
- persistence
- navigation
- UI rendering
- session flow
- evidence routing
- executing canonical intelligence
- displaying canonical coaching outputs

Production should not independently evolve intelligence or coaching quality. Coaching changes are designed, tested, approved through the simulator, and then extracted or promoted into shared canonical modules.

## Workflow

Every major AI feature should follow this sequence:

1. Design
2. Simulator iteration
3. Founder approval
4. Freeze
5. Synchronization pass
6. Production QA
7. Ship

Once simulator behavior is approved, it is frozen. Production synchronization should import or faithfully execute the canonical artifacts without modification.

Synchronization is a transitional step, not the long-term architecture. Whenever possible, move validated interpreter, reasoning, physiological modeling, and coaching logic into reusable canonical modules consumed equally by simulator and production.

## Canonical Artifacts

Every approved AI feature should have a canonical simulator artifact.

Examples include:

- Photo Interpreter
- Narrative Engine
- Daily Briefing
- Coach
- future evidence interpreters

Each canonical artifact should preserve:

- scenario id
- approved status
- evidence inputs
- structured observations or observation expectations
- narrative decisions
- current assessment
- projection
- user-facing coaching
- confidence and caveats
- forbidden implementation terminology

For Daily Briefing scenarios, preserve at minimum:

- Hero
- Interpretation
- Current Assessment
- Projection
- Coach's Insight

## Synchronization Verification

For every synchronized feature, verify:

- production executes the approved canonical module
- production receives the same canonical evidence objects
- structured observations match the approved simulator behavior
- the physiological model update matches the approved simulator behavior
- the Narrative Engine receives the same canonical normalized inputs
- the Coaching Engine produces substantially equivalent coaching
- editorial quality is preserved
- implementation terminology does not appear in user-facing copy
- important ideas are not lost
- new ideas are not introduced without approval
- confidence and caveats are preserved
- production UI displays the resulting coaching without truncation, simplification, or duplication

## Golden Scenarios

Approved Founder scenarios are golden reference cases.

Future synchronization passes should compare production output against these references. Differences are regressions unless intentionally approved.

Golden scenarios are not demo copy. They are product contracts.

They protect the separation of responsibilities:

- canonical engines decide what PhysiqueOS understands and says
- the simulator proves the engines behave correctly
- production proves it can faithfully render those canonical outputs

## Regression Policy

Treat these as regressions:

- production says less than the approved simulator when evidence quality supports richer coaching
- production adds implementation terminology such as provider names, parser state, fallback mode, or internal field names
- production drops a major approved idea
- production introduces unapproved coaching claims
- production uses fallback observations when richer approved observations are available
- production changes the dominant story without a simulator-approved reason

If a regression appears, fix synchronization first. Do not tune production coaching directly.

## Founder QA

Founder QA should validate the pipeline stage by stage:

- Was evidence collected correctly?
- Were canonical evidence objects built correctly?
- Were structured observations generated correctly?
- Was the physiological model updated correctly?
- Did the Narrative Engine reason correctly?
- Did the Coaching Engine produce the correct coaching narrative?
- Did the Presentation Layer render the approved coaching clearly?

Founder QA should not become a second coaching iteration loop. If coaching quality needs to change, return to the simulator and canonical engine modules.

If the canonical outputs are correct and production is wrong, fix presentation. If canonical outputs are wrong, fix the canonical engine. Do not tune production pages into a second intelligence stack.
