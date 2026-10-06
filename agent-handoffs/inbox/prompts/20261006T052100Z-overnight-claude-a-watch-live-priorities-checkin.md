PhysiqueOS Redesign Overnight Lane A — Watch + Live Activity + Priority Detail + Morning Check-In / Daily Capture

TASK TYPE

NEW Claude Remote Control chat.
Use High reasoning.

BASE

Start from exact shipped Build 88 source:
7fce3b9708c063f3c6b58571778c595012b5de6d

Build 88 is VALID in TestFlight.

Create/operate only in the single RC-provided worktree.
No EnterWorktree.
No secondary worktree.

CONCURRENCY

Claude B will independently redesign Briefings from the same Build 88 base.

Codex will independently perform Mac storage cleanup.

Do not touch Claude B's worktree/branch.
Do not touch Codex cleanup state.
Do not merge either lane overnight.
Do not update latest.json/latest.md away from Build 88.

GOAL

Implement the next high-priority redesign family:

1. Apple Watch — complete Founder-locked utility visual translation across all production Watch screens.
2. Live Activity / Dynamic Island — implement the locked redesign translation.
3. Priority Detail — implement the locked family for all production priority types/states, using the accepted Foam Rolling pilot as the proven starting point and migrating it onto shared redesign tokens.
4. Daily capture:
   - Morning Check-In;
   - manual/backdated weight;
   - Home Confidence sheet.
5. Include closely related Home child consistency only where necessary to make these flows coherent; do not broaden into unrelated Home redesign work.

IMPORTANT FUNCTIONAL WORK IN THIS LANE

The Watch lane must also address the already-known functional follow-ups because they share the same Watch presentation/projection ownership:

A. Review/Confirmation Complete Set gating:
- Watch must not offer an actionable Complete Set when the authoritative phone/session is in Review/Confirmation or another state where completion is invalid.
- Preserve authority on the phone/server side; UI gating is not a substitute for command rejection.

B. Timed-set projection:
- audit and fix the mapper so timed-set value/projection renders truthfully instead of "—" where canonical timed-set data exists.

C. Reply-before-side-effects / projection build efficiency:
- DO NOT blindly optimize.
- Use the Build 88 latency instrumentation and existing code path to determine whether a bounded safe improvement is justified.
- If real telemetry is unavailable, preserve instrumentation and report the candidate optimization rather than changing ordering speculatively.
- Never weaken persistence/reconciliation correctness for perceived speed.

LOCKED DESIGN AUTHORITY

Read the 2026-10-04 redesign artifacts, coverage matrix and locked review packages for:
Watch utility translation;
Live Activity / Dynamic Island;
Priority Detail family;
Final Design Batch 2 Daily Capture / Home Confidence;
accepted Foam Rolling Priority Detail pilot.

Do not invent a new visual direction.

WATCH SCOPE

Inventory and redesign all 11 production Watch screens identified by the completeness audit:
session unavailable/retry;
session ready/end/discard;
prepared/start;
execution;
workout metrics;
daily totals;
finish confirmation;
finishing/retry;
controls;
cancel confirmation;
committed summary.

Preserve intentionally retained Watch-specific icon/color semantics where the lock says to retain them.

Do not make Watch look like a miniature iPhone page. Use the locked Watch translation.

Ensure:
Dark/watch appearance;
Dynamic Type/accessibility where supported;
tap targets;
Digital Crown/scroll behavior;
state transitions;
offline/as-of states;
pause/resume;
Health start/save retry;
finish/cancel semantics.

LIVE ACTIVITY

Implement locked visual translation for:
Lock Screen Live Activity;
Dynamic Island compact/minimal/expanded states as applicable;
workout/session state;
timers/metrics;
privacy behavior;
deep-link route.

Preserve WidgetKit/ActivityKit semantics and Build 88 production routing.

PRIORITY DETAIL

Implement all production variants/states:
generic/reminder;
peptide dose-aware;
paused peptide;
supplement;
Morning Weigh-In;
Progress Photos evidence-driven;
DEXA evidence-driven;
completed;
skipped;
failed;
not found;
Mark Skipped confirmation.

Use the accepted Foam Rolling pilot as the behavioral/visual reference but migrate its private palette to the shared redesign token authority where appropriate.

Preserve:
dose-aware completion;
pause/resume semantics;
completion history;
skip behavior;
evidence-driven behavior;
notification/deep-link routes;
canonical server authority;
optimistic concurrency/versioning where present.

Do not fix unrelated missing Photos/DEXA action hrefs unless a locked route exists and the change is clearly presentation wiring; otherwise report it.

DAILY CAPTURE

Redesign:
Morning Check-In;
manual/backdated weight;
Home Confidence sheet.

Preserve all existing behavior:
weight entry;
date semantics;
unfinished-priority dispositions;
notes;
reconciliation;
failure/retry;
evidence/briefing reconciliation where production-reachable;
confidence explanation content;
navigation.

No engine changes.

PIXEL PARITY / REVIEW PROTOCOL

Use the same strict measured process that succeeded for Batch 3.

For each checkpoint:
locked reference;
real shipping SwiftUI;
Dark + Mineral Light for iPhone surfaces;
real Watch simulator for Watch;
real Live Activity/WidgetKit preview/simulator path;
matched device/scale;
measure geometry, typography, spacing, cards, controls, safe areas;
diff;
correct;
rerender.

Produce mobile-readable review boards.

OVERNIGHT REVIEW BEHAVIOR

Founder is asleep and explicitly authorizes the lane to continue through all checkpoints without waiting for intermediate approval.

Still publish checkpoint artifacts individually so Founder can inspect them in the morning.

Suggested checkpoints:
A1 Watch execution/core workout states;
A2 Watch utility/finish/summary states + functional gating/timed sets;
A3 Live Activity/Dynamic Island;
A4 Priority Detail family;
A5 Morning Check-In + manual weight + Confidence;
A6 integrated regression/final package.

Do not treat continuation as Founder visual acceptance. Mark every overnight checkpoint "ready for Founder review," not accepted.

TESTING

Add/update deterministic tests for:
Watch Complete Set gating;
timed-set projection;
Watch state rendering;
Priority Detail routing/states;
skip;
peptide dose-aware behavior;
Morning Check-In;
manual weight;
Confidence sheet;
Live Activity routes/states;
appearance/accessibility.

Run focused suites after each checkpoint.

At final:
full relevant Native unit suites;
full Watch tests;
relevant UI journeys;
generic Release compile with Watch + WidgetKit/Live Activity;
generator stability;
seam scan.

Do not bump build number.
Do not upload TestFlight.
Do not deploy Server.

OUTPUT

Publish:
exact lane SHA;
checkpoint review links;
before/after notes;
functional Watch findings;
tests;
known unresolved items;
integration map onto Build 88;
likely conflicts with Claude B.

Do not merge to release authority.

NOTIFICATION

Notify Founder if blocked or input is truly required.

At completion:
PhysiqueOS Overnight Lane A — Watch, Live Activity, Priorities and Daily Capture ready for Founder review.

STOP after complete review package and clean pushed candidate.

END TASK.