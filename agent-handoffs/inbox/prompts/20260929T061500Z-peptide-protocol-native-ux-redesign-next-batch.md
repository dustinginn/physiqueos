Task id: peptide-protocol-native-ux-redesign-next-batch-20260929

Use the existing Claude Remote Control Native workflow. Founder will use Fable/high reasoning for this task.

CONTEXT

Build 69 is accepted for daily use. Do not cut a patch solely for its two small follow-ups; include them in this next substantive Native build.

Founder screenshots of the current Edit Support / peptide editor will be supplied directly to Claude. Treat them as the current UX evidence.

PRODUCT PROBLEM

The current peptide/support editor exposes too much protocol-generation machinery and takes too long to use.

Current UI exposes concepts such as:
- schedule frequency mode;
- day selection;
- time mode;
- start/end;
- pattern: stay / titrate up / titrate down / up-hold-down / custom;
- starting dose;
- target dose;
- step size;
- step interval;
- hold duration;
- landing dose;
- final state;
- reminder;
- notes.

This is technically expressive but not appropriate as the normal daily product experience.

Founder requirement:
Build a much easier, native-iOS-feeling protocol editor. Be smart about using standard iOS interaction patterns and controls. Preserve canonical protocol history and scheduling power underneath, but do not make the user operate the underlying state machine for routine changes.

PRIMARY PRODUCT MODEL

Normal mental model should be approximately:
- current dose;
- which days;
- time;
- start date where relevant;
- reminder;
- notes;
- active / paused.

Routine actions should be fast:
- change dose;
- change days;
- change time;
- pause protocol;
- resume protocol.

Advanced titration/history capability can remain available where genuinely needed, but it should not dominate the default editor.

PAUSE / RESUME

Design and implement first-class canonical pause/resume semantics.

Pause must:
- not end/delete the protocol;
- preserve all prior occurrences/history;
- stop future scheduled occurrences and notifications during the pause;
- record the pause boundary/history canonically;
- make status obvious in Priority/Support surfaces;
- not require inventing an end date.

Resume must:
- preserve the historical pause interval;
- establish future occurrences from the correct resume boundary;
- not backfill missed doses during pause;
- preserve protocol version/change history;
- allow schedule/dose adjustment at resume if product semantics support it cleanly.

Audit existing Server protocol/support authority before choosing representation. Do not fake pause purely in Native.

UX REDESIGN

Use native iOS conventions wherever they make the flow faster and clearer:
- compact forms;
- pickers/menus where appropriate;
- native date/time pickers;
- clear day-of-week selection;
- sheets for focused edits;
- disclosure/advanced section only where advanced titration is actually needed;
- prominent current state and primary actions.

Do not merely restyle the existing long form.
Reduce the number of decisions/screens required for the common case.

The user should not need to understand "landing dose", "step", "hold and landing", or a titration generator merely to update an ongoing weekly peptide.

Audit the existing real Founder Retatrutide and Tesamorelin protocol shapes and ensure the simpler UX can faithfully represent them without rewriting history.

If advanced titration remains:
- put it behind an explicit Advanced / planned titration affordance;
- explain it in user language;
- preserve existing canonical generated schedules/history;
- do not make advanced controls appear for a simple stable-dose protocol.

HISTORY / CORRECTNESS

Editing today must not rewrite what happened historically.

Define and test:
- dose change effective today/future;
- day-of-week change;
- time change;
- pause;
- resume;
- pause then edit then resume;
- protocol with historical titration;
- protocol currently at stable dose after earlier titration;
- open-ended protocol;
- explicit end date;
- reminder changes;
- timezone/day-boundary behavior;
- no retroactive occurrence mutation.

BUILD-69 ROLL-FORWARD ITEMS

Also include these small accepted follow-ups in this next Native build:

1. Logged Today Training provenance.
Current:
Strength Training · 50 min · Apple Health
2 Outdoor Walks · 32 min

Desired presentation:
Strength Training · 50 min
2 Outdoor Walks · 32 min · Apple Health

The Apple Health provenance should visually apply to the whole multi-line Training group, not imply only Strength came from Apple Health. Generalize for other strength/cardio combinations.

2. Mark Skipped missing on Foam Rolling.
Build 69 Founder test showed today's Foam Rolling Priority Detail had Mark Complete but no Mark Skipped.

Foam Rolling is intended to be an eligible ordinary scheduled reminder.
Trace:
Server skippable/skipCommand -> Native decode -> view model -> UI render.
Fix the actual break.
Do not broaden Skip to the intentionally excluded weigh-in/photos/DEXA/protocol items unless product semantics explicitly require it.

PRESERVE BUILD 69

Do not regress:
- Activity cross-device/partial-day behavior;
- Logged Today strength+cardio;
- active Logger shortcut;
- reconciliation notification timing/deep-link;
- Workout Complete records/confetti;
- Monthly cleanup.

SEPARATE AUTH LANE

Codex owns authentication/session resilience in a separate isolated workstream. Do not implement pairing-token/Face ID/session-renewal changes in this peptide task. Claude remains integrator only if/when a future explicit integration decision is made.

PROCESS

First audit current Server + Native protocol model and publish a concise design/authority map before invasive implementation if representation changes are needed.

Then implement the simplest coherent product, not a pile of local UI patches.

Any Server changes:
- separately identify;
- deterministic tests;
- no deployment without explicit Founder/ChatGPT authorization.

Native:
- deterministic tests;
- Release compile;
- fresh-context review;
- no TestFlight upload until accepted.

Do not start Photo magnitude or Sleep.

REPORT

Publish:
- current complexity/root cause;
- proposed simplified user model;
- canonical pause/resume semantics;
- before/after interaction flow;
- Server vs Native changes;
- candidate SHAs;
- tests/build/review;
- explicit Founder acceptance checklist.

Push-notify Founder when design is ready, candidate is ready, or whenever you stop/need input.

END TASK.
