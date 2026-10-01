Workout Logger Live Activities — Phase 1 shipping implementation

READ FIRST

Authority final report:
agent-handoffs/reports/20261001T193109Z-workout-logger-session-authority-foundation.md

Visual prototype Founder revision:
agent-handoffs/reports/20261001T164355Z-workout-live-activities-visual-prototype-founder-revision-1.md

Discovery:
agent-handoffs/reports/20261001T055845Z-workout-logger-live-activities-discovery-plan.md

Standing reporting protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

BASE AUTHORITY

Build from:
claude/workout-logger-session-authority-on-build76-20261001
SHA 2b41dc48

This is the validated TrainingSessionAuthority integrated with shipped Build 76.

Do not rebuild or replace the authority architecture without a new blocking finding and explicit review.

FOUNDER APPROVAL

Founder approves proceeding to shipping Phase 1.

Founder-approved visual direction:
- Lock Screen is the primary full Live Activity.
- Dynamic Island compact/minimal/expanded supported.
- expanded Dynamic Island follows the accepted visual prototype.
- large rest clock.
- trailing Complete Set action.
- maximum two context rows.

LOCKED PRODUCT DECISIONS

1. Rest default:
- Stopwatch is the initial/default rest mode.
- Countdown remains selectable.
- Off remains selectable.
- user must be able to choose mode.
- Countdown duration must be configurable.
- no per-second persistence.

2. Prefilled values:
- Complete Set confirms/records the values currently displayed in the authoritative set.
- If the user needs different reps/load/time, tapping into Logger to edit first is acceptable.
- no direct rep/load +/- controls in Phase 1.

3. Single-set exercises:
- after completing the only set, transition directly to Completed + Up Next.

4. Supersets:
- use superset ROUND/UNIT-aware progression, not naive per-exercise final-set semantics.
- the Live Activity should preserve A/B progression through the round.
- Up Next should represent the correct partner/next unit context.
- do not show Completed + Up Next mid-round merely because one member exhausted its own set count.
- unequal-size supersets need deterministic unit-aware behavior.
- maximum two context rows remains invariant.

5. Context rows:
Normal = Previous + Current.
Final ordinary exercise set = Current + Up Next.
Immediately after final ordinary exercise completion = Completed + Up Next.
Maximum two rows.

6. Complete Set:
- interactive Day-1 feature where platform supports it.
- uses TrainingSessionAuthority typed completeSet operation.
- mutationId unique per user action.
- expectedRevision from rendered projection.
- stale/duplicate/rejected operations fail safely.
- no Finish/Cancel adjacent to it.

7. Deep link:
- tapping Live Activity opens the active Workout Logger.
- where practical, route to current exercise/set context using existing navigation architecture.
- no parallel navigation system.

8. Privacy:
- use the prototype's redacted presentation when system privacy/redaction requires it.
- do not expose unrelated physique/health data.
- exercise/set/load/reps are the only workout-specific lock-screen details needed.

A. REVERIFY BASE / MACHINE

Before coding:
- reverify 2b41dc48 exact branch/head;
- reverify Build 76 latest shipped authority;
- reverify free disk >=15 GiB;
- reverify no conflicting active Native release work.

The cleanup report established ~25 GiB free. Respect 15 GiB floor throughout.

B. SUPSERSET PROJECTION HARDENING FIRST

Before ActivityKit UI, update and test TrainingSessionLiveProjection to implement the Founder-approved round/unit-aware superset semantics.

Do not alter core authority mutation API unless necessary.

Define deterministic behavior for:
- equal-size A/B supersets;
- unequal-size A/B supersets;
- current partner within round;
- completed partner + next partner;
- final round;
- transition out of superset to next ordinary exercise;
- one member exhausted before the other;
- previous/current/up-next roles;
- completion target identity.

Maximum two rows.

Add projection tests first.

Fresh review this semantic change before Widget work.

C. REST PREFERENCE UI

Implement a minimal user-facing rest preference control in Workout Logger/settings context appropriate to existing UX.

Support:
- Stopwatch
- Countdown
- Off
- Countdown duration when Countdown selected

Initial/default:
Stopwatch.

Persist via the accepted rest preference boundary.

Avoid overbuilding per-exercise overrides now.
Architecture may retain future per-exercise capability.

The active session should resolve the current preference consistently.

Changing preference during an active workout:
define whether it applies to the next completed set or immediately transforms current rest.
Preferred conservative behavior: next rest interval unless a clear existing UI affordance makes immediate conversion intuitive.
Document behavior.

D. ACTIVITYKIT SHARED CONTRACT

Add shared ActivityKit model in a location compilable by app + extension.

Define WorkoutActivityAttributes:
immutable minimum only.

Define ContentState:
dynamic projection needed by UI.

Do not put full workout history in state.

Include:
- schema/version;
- session id;
- revision;
- phase;
- session label;
- startedAt;
- progress;
- context layout/rows max 2;
- set/exercise identity required for Complete Set intent;
- expectedRevision;
- rest mode/startedAt/endsAt;
- completion/saving state;
- redaction-safe information.

Keep encoded payload under ActivityKit limit with tests.

E. WIDGET EXTENSION

Generator-driven.

Add Widget Extension target for Workout Live Activity.

Follow Build 76 generator rules:
- add new lists/IDs after current Recovery/Sleep and session-authority blocks;
- no renumbering existing IDs;
- regenerate project;
- inspect additions-only project diff.

Add:
- WidgetKit
- ActivityKit
- SwiftUI
- appropriate deployment target
- NSSupportsLiveActivities / required plist entries
- bundle identifier per discovery recommendation, but do not invent Apple account state.

Do NOT use App Group unless proven necessary.

F. SIGNING / APP ID

Do not open/login to Apple Developer or App Store Connect in browser.

Use Xcode automatic signing / existing project signing path.

If the new extension requires Apple account re-auth, 2FA, manual App ID creation or provisioning that Xcode cannot automatically complete:
STOP and report exact Founder action.

Do not work around signing.

G. APP-SIDE COORDINATOR

Implement WorkoutLiveActivityCoordinator or equivalent.

Responsibilities:
- start one activity when an active live workout starts/resumes;
- update from TrainingSessionAuthority projection changes;
- no duplicate activities per session;
- end on cancel/discard/committed completion;
- handle Save & Leave according to product semantics: likely keep activity if workout remains active/paused only if useful; decide and document based on authority phase;
- reconcile existing ActivityKit activities on app launch;
- remove/end orphan activities;
- recover after app relaunch;
- stale-date handling;
- authorization disabled -> no-op, workout unaffected;
- device without Dynamic Island -> Lock Screen still works;
- never make ActivityKit authoritative.

Use local updates only.
No APNs/push.

H. LIVE ACTIVITY UI

Implement accepted visual direction from prototype.

LOCK SCREEN:
- workout header/session label;
- progress + elapsed workout;
- max two context rows;
- large lower-left rest Stopwatch/Countdown;
- trailing Complete Set;
- Rest Off uses useful lower-left workout context/elapsed, no empty rest placeholder.

Normal:
Previous + Current.

Final ordinary exercise:
Current + Up Next.

Post-final:
Completed + Up Next.

Superset:
round/unit-aware context from hardened projection.

DYNAMIC ISLAND:
Compact:
- workout glyph/context + elapsed or rest clock.
Minimal:
- unmistakable workout/rest indicator.
Expanded:
- accepted max-two-row semantics;
- large/clear rest clock;
- Complete Set where supported and safe;
- no tiny overloaded metrics.

Use system font/SF Symbols.

I. SYSTEM TIMER RENDERING

Use system date/timer rendering where supported:
- workout elapsed from startedAt;
- Stopwatch from rest.startedAt;
- Countdown from rest.endsAt.

No per-second coordinator updates.

Countdown reaching zero:
- visual expiry only;
- does not auto-complete or advance;
- activity remains coherent.

J. COMPLETE SET LIVEACTIVITYINTENT

Implement the supported interactive intent.

It must call the same accepted TrainingSessionAuthority mutation semantics:
- exact session;
- exact exercise/set target;
- expectedRevision;
- unique mutationId;
- explicit complete end state.

Handle:
- applied;
- unchanged;
- duplicate;
- stale revision;
- session ended;
- wrong phase;
- invalid set values;
- persistence failure.

After success:
- authority persists/publishes;
- rest starts automatically;
- projection advances;
- Live Activity updates.

Do not create a second mutation implementation.

Authentication/locked-device behavior must be verified on physical device before final acceptance.

K. TAP TO OPEN

Implement widgetURL/deep link into active Workout Logger.

If exact current set routing is safe, include identifiers.
Otherwise route to active workout root rather than inventing brittle navigation.

L. SAVING / COMPLETION

When workout Finish begins:
- phase reflects finishing/saving;
- Complete Set disabled/absent;
- Live Activity shows saving state if transition is visible long enough.

After durable commit:
- show short-lived Workout Saved state if system behavior permits;
- target dismissal roughly 15 minutes unless HIG/API behavior recommends shorter;
- do not retain indefinitely.

Cancel/discard:
end promptly.

M. PRIVACY / REDACTION

Implement redacted state:
- generic Workout label;
- elapsed/progress/rest may remain if appropriate;
- no exercise names/load/reps.

Respect system privacy behavior.
Do not build custom authentication.

N. TESTS

Unit:
- Activity attributes/content encoding;
- payload under limit;
- projection mapping;
- all two-row states;
- superset round/unit cases;
- Stopwatch/Countdown/Off;
- preference default Stopwatch;
- countdown duration;
- coordinator start/update/end;
- duplicate prevention;
- launch reconciliation;
- orphan cleanup;
- authorization disabled;
- stale;
- intent applied/duplicate/stale/rejected;
- relaunch;
- saving/completed;
- privacy redaction;
- unknown enums fail safe;
- deep-link construction.

Snapshots/previews:
- Lock Screen states;
- Dynamic Island compact/minimal/expanded;
- long names;
- Dynamic Type;
- privacy.

Existing:
- TrainingSessionAuthority;
- TrainingLogger;
- Server parity;
- Sleep Build 76 regressions;
- project generator;
- release verifier.

O. PHYSICAL DEVICE ACCEPTANCE

Before calling Phase 1 accepted, test on Founder's physical iPhone:
- Live Activity appears on Lock Screen;
- Dynamic Island compact/minimal/expanded;
- Complete Set while locked;
- duplicate rapid tap safety;
- Stopwatch starts/resets after completion;
- Countdown variant;
- Off;
- final-set transition;
- post-final transition;
- superset progression;
- tap-to-open Logger;
- app foreground/background;
- force quit/relaunch behavior as platform permits;
- finish/saved/end;
- ActivityKit disabled path if practical.

Do not fabricate physical-device acceptance.

P. BUILD / TESTFLIGHT

First produce simulator/previews/screenshots from the shipping implementation and compare to approved prototype.

If visual parity and code review are clean:
- Release compile;
- extension signing/archive validation.

Before TestFlight:
- publish checkpoint with shipping screenshots and signing status.
- If no Founder visual changes are needed and signing succeeds, this task is authorized to select the next available build number and upload through Xcode/release tooling.
- Never browser-login.
- wait for VALID.

If extension signing requires Founder interaction, stop before upload.

Q. PR CELEBRATION FIX

There is a separate reviewed candidate:
codex/workout-pr-celebration-lifecycle-fix-20261001
SHA 69cad804e2ac7d74ed98914e1601f2e7863dadc3

Do NOT automatically merge it into this Live Activity implementation.

Keep workstreams isolated unless a later explicit integration task authorizes combining them.

R. STRATEGIC / SERVER

No Server changes expected.
No HealthKit Sleep changes.
No V3/Briefing changes.

S. REPORT

Publish:
agent-handoffs/reports/<timestamp>-workout-live-activities-phase1-implementation.md

Include:
- exact base/candidate;
- superset semantics;
- rest preference UI/default;
- extension/project/signing;
- coordinator;
- intent safety;
- UI/screenshots;
- tests;
- physical-device status;
- TestFlight status;
- blockers;
- exact Founder acceptance checklist.

Publish GH before every stop.

END TASK.
