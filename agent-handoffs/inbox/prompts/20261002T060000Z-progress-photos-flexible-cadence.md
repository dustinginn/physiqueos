Progress Photos cadence expansion — immediate next Native/Server build

TASK TYPE

Claude focused implementation and release.

Founder needs this before Saturday.

Do not wait for Apple Watch Phase 0.
Do not mix Watch work into this branch.
Do not broaden into app-wide UI polish yet.

READ FIRST

Current shipping Native authority:
reverify latest VALID build; expected Build 80 source 1783691debeea46d3e4e6b2f6e470abe032c4c74.

Durable backlog:
agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md

Relevant Progress Photos / settings / notification / Photo Event reports and source.

GH protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

FOUNDER FEEDBACK

In You/settings -> Progress Photos, cadence is currently locked to:
- Weekly
- Every 2 weeks

Founder needs a more general cadence immediately.

Desired product model:

Frequency unit:
- Weeks
- Months

Interval:
- every N units

Examples that MUST be representable:
- every 1 week;
- every 2 weeks;
- every 3 weeks;
- every 4 weeks;
- every 1 month;
- every 2 months;
- every 3 months.

UI should present this naturally, not as a giant list of hard-coded phrases.

Existing settings must remain:
- day/weekday selection where meaningful;
- specific time;
- Remind me about Progress Photos;
- Enable Photo Event briefing.

A. AUDIT CURRENT AUTHORITY

Audit exact current:
- Progress Photos cadence data model;
- Server contract/persistence;
- Native read/write model;
- settings UI;
- notification scheduling;
- Home reminders/Priority occurrence generation;
- Photo Event briefing trigger;
- Progress Photos evidence/session behavior;
- timezone/date math;
- existing Weekly / Every 2 weeks semantics;
- any web UI using the same setting.

Identify whether cadence is currently:
- enum;
- integer days/weeks;
- recurrence rule;
- server-owned schedule;
- Native-only preference.

Do not assume this is Native-only.

B. CANONICAL CADENCE MODEL

Prefer a durable, extensible model equivalent to:

{
  interval: Int,
  unit: "week" | "month"
}

with explicit scheduling fields as needed.

Constraints:
- interval >= 1;
- set a reasonable product max if necessary, but do not arbitrarily block 3 weeks or multi-month schedules;
- preserve timezone;
- preserve existing day/time semantics.

Backward compatibility:
- Weekly -> interval 1, week;
- Every 2 weeks -> interval 2, week.

Old persisted settings and old Native clients must continue to decode/fail soft.

If Server contract changes, make it additive/backward compatible where practical.

C. WEEK SEMANTICS

For week cadence:
- preserve current chosen weekday/specific-time behavior;
- every N weeks must anchor deterministically;
- changing cadence should define the next occurrence predictably;
- avoid drift from notification delivery time;
- timezone/DST safe.

Audit what anchor currently exists.

If an explicit cadence anchor/start date is required, add it deliberately rather than deriving from "last notification sent."

D. MONTH SEMANTICS

Define monthly behavior clearly.

Founder wants every N months.

Audit UI and choose the simplest predictable model:
- day-of-month anchored to the selected/saved schedule date;
OR
- nth weekday if current Progress Photos scheduling is weekday-based.

Do not invent complicated recurrence.

If day-of-month:
- define behavior for 29/30/31 in shorter months (recommend clamp to last valid day);
- preserve local specific time;
- DST/timezone safe.

If existing product semantics strongly favor weekday, document and implement the most consistent model.

E. UI

Replace the current hard-coded cadence menu with a compact Native control.

Preferred concept:
- "Every" [number] [Weeks / Months]

Examples:
Every 3 Weeks
Every 1 Month

Use current PhysiqueOS design language.

Avoid an enormous menu containing every possible combination.

Potential UI:
- interval stepper/picker;
- unit segmented/menu;
- summary text.

Keep it easy to change one-handed.

Use natural singular/plural:
1 Week
2 Weeks
1 Month
3 Months.

Do not redesign unrelated settings.

F. EXISTING USER MIGRATION

Founder currently has Every 2 weeks selected.

On upgrade:
- it must continue to mean every 2 weeks;
- reminder schedule must not unexpectedly fire immediately or shift;
- Photo Event cadence must remain consistent.

Changing to a new cadence should update future occurrences only.
Do not rewrite historical Progress Photo sessions, Photo Events, Briefings, or evidence.

G. NOTIFICATIONS / PRIORITIES

Ensure recurrence feeds every relevant downstream surface consistently:
- Progress Photos reminder notification;
- Home/Priority scheduling if applicable;
- Photo Event briefing trigger/eligibility if tied to cadence.

No duplicate notifications.
No missed occurrence due to old/new scheduler overlap.
Cancel/reconcile old scheduled notifications when cadence changes.

H. PHOTO EVENT BRIEFING

Audit semantics.

If Photo Event briefing is enabled:
- it should continue to occur after a completed scheduled photo session according to existing behavior;
- cadence expansion must not generate a Photo Event merely because a schedule date arrived unless that is already canonical behavior;
- no historical re-generation.

I. TEST MATRIX

At minimum:
- legacy Weekly decode -> 1 week;
- legacy Every 2 weeks -> 2 weeks;
- save/reload 3 weeks;
- save/reload 4 weeks;
- save/reload 1 month;
- save/reload 2 months;
- singular/plural labels;
- interval validation;
- weekday/time preservation for weekly;
- monthly anchor;
- Jan 31 -> Feb behavior;
- leap year;
- DST;
- timezone change;
- cadence edit before next occurrence;
- cadence edit on occurrence day;
- notification replacement/no duplicate;
- reminder disabled;
- Photo Event briefing disabled/enabled;
- old Native client compatibility if Server changes;
- no historical mutation.

J. SERVER / WEB

If Server owns cadence:
- implement/review/deploy backward-compatible contract;
- update web settings if it exposes the same control or ensure old web does not corrupt the new value;
- production deploy only after tests/review;
- verify live/ready/SHA parity.

If Native owns cadence:
- document why no Server change is needed.

K. BUILD / RELEASE

This is Founder-visible and time-sensitive.

After implementation/review:
- reverify latest Native uploaded build.
- If Build 80 is latest, use Build 81.
- Do not wait for Watch work.
- run focused Progress Photos/settings/notification tests;
- run appropriate Native regression/full suite based on touched scope;
- Release archive;
- preserve app + Widget extension signing/App Group/HealthKit entitlements;
- guarded upload;
- wait for VALID.

No browser login to Apple Developer/App Store Connect.
Stop on required Founder auth.

L. PHYSICAL ACCEPTANCE

Minimal checklist:
1. Existing Every 2 weeks loads correctly after update.
2. Change to Every 3 weeks; save/reopen -> retained.
3. Change to Every 1 month; save/reopen -> retained.
4. Set the cadence Founder actually wants before Saturday.
5. Specific time remains correct.
6. reminder toggle remains correct.
7. Photo Event briefing toggle remains correct.
8. no duplicate pending Progress Photos reminder.

M. ROADMAP UPDATE

Update durable backlog:
- Progress Photos flexible cadence shipped/pending acceptance;
- app-wide UI/design polish = next major maturity project after Watch daily-driver;
- Briefing Narrative + Confidence quality/tuning audit = next major strategic-quality project;
- do not treat either as implementation started yet.

N. REPORT

Publish:
agent-handoffs/reports/<timestamp>-progress-photos-flexible-cadence.md

Include:
- old/new contract;
- migration;
- recurrence math;
- UI;
- notification reconciliation;
- Photo Event behavior;
- tests/review;
- Server deploy if any;
- Native candidate/build/delivery/VALID;
- Founder acceptance;
- backlog update.

MANDATORY GH PROTOCOL

Before every stop:
- push implementation branch;
- publish checkpoint/final report to origin/main;
- update latest pointers;
- fetch/reverify main;
- re-read exact report;
- give exact main report commit SHA.

END TASK.
