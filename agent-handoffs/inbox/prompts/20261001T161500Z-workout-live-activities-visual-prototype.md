Workout Logger Live Activities — parallel visual prototype/mockup lane

READ FIRST

Discovery:
agent-handoffs/reports/20261001T055845Z-workout-logger-live-activities-discovery-plan.md

Claude architecture task:
agent-handoffs/inbox/prompts/20261001T160000Z-workout-logger-session-authority-foundation.md

Standing reporting protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

TASK TYPE

VISUAL PROTOTYPE / MOCKUP ONLY.

Claude is concurrently implementing the authoritative TrainingSessionAuthority, completedAt, rest-state model and future Live Activity projection.

Do not compete with or preempt Claude's architecture.

Use synthetic fixture states based on the Founder-approved product semantics below.

Nothing from this task is shipping authority until reconciled against Claude's final architecture.

Do NOT:
- modify Server;
- modify production;
- upload TestFlight;
- activate entitlements/signing;
- create a real App ID;
- alter the shipping Workout Logger authority;
- implement real LiveActivityIntent mutation;
- touch HealthKit Sleep;
- merge into production Native authority.

PURPOSE

Founder wants to SEE the Workout Logger Live Activity before shipping implementation.

Create high-fidelity iOS Live Activity visual prototypes for:
- Lock Screen;
- Dynamic Island compact;
- Dynamic Island minimal;
- Dynamic Island expanded.

Prefer real SwiftUI/WidgetKit/ActivityKit preview or Simulator-rendered prototype if it can be done without signing/provisioning changes.

If a real extension target would trigger signing/App-ID requirements, use a non-shipping preview/prototype target or SwiftUI preview harness instead. Do not change Apple account configuration.

FOUNDER PRODUCT DIRECTION

Day-1 intended behavior after architecture is ready:
- Complete Set is intended as an interactive Live Activity action if safe/supported.
- Rest tracking automatically starts when a set is completed.
- Rest Mode supports Stopwatch, Countdown and Off.
- Founder personally prefers Stopwatch.
- Previous completed set + Current set are the normal primary context.
- Maximum approximately two set/context rows; do not create a miniature Workout Logger.
- If Current is the final set of an exercise, show useful Up Next exercise context without making the screen muddy.
- Immediately after final-set completion, Completed + Up Next should be easy to understand.
- Direct reps/load editing from Lock Screen is not required for Day 1; tapping into the active Logger is acceptable.
- Complete Set should be visually evaluated in the mockup.
- Workout elapsed time remains useful.
- Rest state may become visually dominant while active.
- No Server/push architecture for Phase 1.

A. DESIGN STATES

Create synthetic deterministic states at minimum:

1. Normal workout / Stopwatch active
- Previous set
- Current set
- current exercise
- workout elapsed
- rest stopwatch
- Complete Set action

2. Normal workout / Countdown active
- same context
- countdown visually clear
- Complete Set action

3. Rest Off
- Previous + Current
- workout elapsed
- no empty rest placeholder

4. Final set of exercise
- Previous
- Current/final set
- compact Up Next exercise cue
- avoid a third full row

5. Immediately after final set completed
- Completed final set
- Up Next exercise + Set 1 context
- newly started Stopwatch state

6. Superset
- clearly communicate current member / partner or next context without overcrowding

7. Timed set
- e.g. 45-second target

8. Bodyweight set
- e.g. BW × reps

9. All programmed sets complete / Finish when ready

10. Saving / finishing

11. Saved/completed short-lived state

12. Privacy-redacted
- generic Workout
- elapsed/progress/rest as appropriate
- no exercise/load/reps strings

13. Stale/error-safe state if visually relevant

B. LOCK SCREEN

Explore a polished maximum-height-conscious layout.

Priorities:
1. exercise/set context;
2. rest Stopwatch/Countdown when active;
3. Complete Set;
4. workout elapsed/progress;
5. Up Next only when contextually useful.

Test whether Previous + Current + Up Next is too much.

Preferred rule to explore:
- normal = Previous + Current;
- final current set = Previous + Current plus one compact Up Next line;
- after final completion = Completed + Up Next.

Do not force all three full rows.

C. COMPLETE SET BUTTON

Mock the real supported interaction affordance.

It must:
- look intentional but not dominate the whole activity;
- be large enough to tap;
- avoid accidental proximity to destructive actions;
- never include Finish/Cancel beside it.

Do not implement real mutation.

Evaluate whether Lock Screen button placement works better:
- full-width bottom action;
- trailing compact action;
- another HIG-compliant arrangement.

Expanded Dynamic Island may use an action if supported in the visual prototype.

Compact/minimal regions should not attempt tiny action buttons.

D. STOPWATCH / COUNTDOWN

Stopwatch is important to Founder.

Explore visual hierarchy for:
STOPWATCH / REST 1:47 and counting upward.

Countdown:
REST 1:13 remaining.

Use absolute-time/system timer rendering in prototype where possible.

No per-second app state updates.

Do not create a proprietary rest score.

E. DYNAMIC ISLAND

Produce:

Compact:
- useful workout indicator + elapsed/rest timer;
- when rest active, rest time likely dominates trailing region.

Minimal:
- one unmistakable workout/rest indicator;
- no tiny unreadable set details.

Expanded:
- current exercise;
- current set target;
- previous/completed context if space permits;
- rest state;
- workout elapsed;
- Complete Set action if platform presentation supports it;
- Up Next on final-set transition.

Keep within HIG dimensions.

F. VISUAL LANGUAGE

Use PhysiqueOS visual language while respecting system Live Activity constraints.

Prefer:
- SF/system font as discovery recommended;
- existing PhysiqueOS dark aesthetic;
- restrained accent;
- SF Symbols;
- clear typography hierarchy;
- no bundled custom font in prototype.

Do not simply reproduce the in-app Workout Logger card.

G. FIXTURE MODEL

Define a prototype-only fixture projection based on the architecture prompt's intended fields:
- sessionId;
- sessionLabel;
- startedAt;
- phase;
- previous completed set;
- current set;
- current exercise;
- isFinalSetOfExercise;
- next exercise / first-set context;
- progress;
- rest mode;
- rest startedAt;
- rest endsAt;
- completion/saving state;
- privacy mode.

This is provisional.

When Claude publishes its final architecture report, compare the prototype fixture field-for-field against Claude's actual projection and report differences.

Do not force Claude to match Codex's mockup model.

H. SCREENSHOTS

Capture a concise Founder-review set.

At minimum:
1. Lock Screen — normal Stopwatch
2. Lock Screen — Countdown
3. Lock Screen — final set + Up Next
4. Lock Screen — post-final-set Completed + Up Next
5. Lock Screen — privacy redacted
6. Dynamic Island compact — workout
7. Dynamic Island compact — rest
8. Dynamic Island minimal
9. Dynamic Island expanded — normal
10. Dynamic Island expanded — rest/final-set context
11. Finish/saving state if materially different

If possible, include side-by-side or clearly named alternatives for any unresolved density question, especially:
- Previous + Current vs Current + Up Next;
- Complete Set button placement.

Use synthetic values only.

I. INTERACTION MOCKUP

For Founder review, visually demonstrate:
- Complete Set;
- tap activity opens Logger;
- no direct rep +/- initially.

If prototype harness can simulate state transitions safely:
Normal -> tap mock Complete -> rest resets -> next set
Final set -> tap mock Complete -> Completed + Up Next
This is prototype-local only.

J. ACCESSIBILITY / PRIVACY

Check:
- Dynamic Type pressure;
- VoiceOver labels conceptually;
- contrast;
- 44pt action target where applicable;
- long exercise names;
- long load/reps strings;
- no reliance on color only.

K. PLATFORM ACCURACY

Use the discovery report's verified Apple constraints.

Do not invent unsupported compact/minimal interactions.

If preview tooling differs from physical Live Activity rendering, label the limitation.

L. NO SIGNING BLOCKER

Do not create or register:
com.physiqueos.native.dev.WorkoutActivity

Do not trigger provisioning.

If a Widget Extension is necessary just to render previews and Xcode attempts provisioning, stop that approach and use a non-shipping preview harness.

M. VALIDATION

At minimum:
- prototype compiles;
- all fixture states render;
- no >160pt Lock Screen overflow;
- long names do not break layout;
- timer variants render;
- privacy state contains no exercise/load/reps;
- compact/minimal remain legible;
- no production authority or shipping target changed.

N. CONVERGENCE WITH CLAUDE

If Claude's session-authority report becomes available during this task:
- read it;
- compare final projection/rest semantics to prototype fixture;
- adapt mockup only where necessary;
- do not modify Claude architecture.

If Claude is not finished:
- publish the mockup report anyway;
- clearly mark projection reconciliation pending.

O. OUTPUT

Publish:
agent-handoffs/reports/<timestamp>-workout-live-activities-visual-prototype.md

Include:
- prototype branch/SHA;
- exact base;
- implementation method (preview harness vs other);
- screenshot paths;
- fixture states;
- Lock Screen hierarchy;
- Dynamic Island hierarchy;
- Complete Set placement alternatives;
- Stopwatch/Countdown presentation;
- accessibility/privacy;
- platform limitations;
- Claude projection reconciliation status;
- specific Founder visual decisions needed;
- explicit NON-SHIPPING status.

Publish GH before every stop.

END TASK.
