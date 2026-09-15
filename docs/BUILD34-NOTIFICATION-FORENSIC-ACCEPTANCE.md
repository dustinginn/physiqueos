# Build 34 notification-only forensic acceptance — September 15, 2026

## Outcome

**Classification A: proven production notification-adapter defect**, with a
related stale-removal consequence. This supersedes the earlier conclusion that
Build 35 needed diagnostics but no additional scheduling-path correction.
Physical delivery remains unproven; the incident's actual device request history
is not recoverable from server evidence.

Shipped authority examined: `757294441e0ca6a9986119d55a21745223dd6d92`.
Native candidate before correction: `28fe7c37bedcf70d48dd8547519714e7f894b733`.
Server candidate unchanged: `f88fa541b5805c38e72a0ae7ba2d1a82bd8ecf30`.
Production authority unchanged: `2d0d8818db9e6b6f911348c3d0c93df400c0c63c`.
No deployment, production mutation, build bump, archive or upload occurred.

## Exact shipped pipeline and stopping point

Line references below refer to the shipped commit, not today's corrected file.

| Stage | Input / decision | Exact Build 34 output |
| --- | --- | --- |
| Production read | `ProductionHomeAPI.fetchHome`, ProductionDailyDriverAPI.swift:91, reads `home` through the authenticated typed envelope | The supplied wire row contains the correct action and `12:21` |
| Private wire decoder | `ProductionHomeAPI.Priority`, lines 271–294, has no `notificationAction` field | Swift ignores that wire key |
| Occurrence adapter | `readOnlyOccurrence`, lines 296–326, also does not forward an action | Correct reminder/date/execution/completion state; `notificationAction` defaults to nil |
| Home state | Production HomeViewModel does not apply sandbox projections | The nil action remains nil |
| Invocation | HomeView.swift:66–68 and 74–76 await load, Goal/Briefing prefetch, then sync; active-scene change loads then sync | Scheduling is Home-read driven, not Priority-detail driven |
| Authorization | HomeView.swift:119 requests alert/sound/badge; scheduler lines 52–53 permits authorized/provisional only | Denied/not-determined returns without adding or removing requests |
| Plan | Scheduler lines 116–120 requires a nonnil action, time, parseable date and future instant | The real production occurrence stops at the first guard; no request |
| Removal | Scheduler lines 125–127 subtract desired IDs from existing scheduled IDs; line 59 submits removal | An already-pending future request would be removed because the adapter stripped its action |
| Add | Scheduler lines 64–71 awaits add and captures errors | No add is reached for the actual production-adapted row |

The same omission existed in `ProductionPriorityAPI.Payload` and its occurrence
mapping. That reader does not itself schedule notifications. Priority-detail
navigation cannot restore the Home action or create the missing request.
The server's known Recovery/peptide workflow inconsistency is separate: Native
category selection uses classification, not the ignored workflow string.

## Lower-level request behavior when an action is actually supplied

The exact shipped scheduler/category/delegate sources were preserved unchanged in
a disposable isolated app harness. This distinguishes a working notification
center handoff from the broken production adapter; it is not an assertion that
the unmodified shipped production app scheduled the incident request.

- ID: `priority.scheduled.reminder_foam_roll_daily.2026-09-15`.
- Canonical incident trigger: September 15, 2026, 12:21 PDT = `19:21:00Z`.
- Category: `priority.specializedWorkflow`, with no blind Complete/Snooze actions.
- Title is the occurrence title; body is subtitle or the accepted open-priority
  fallback; default sound; userInfo carries reminder/date/destination and HH:mm.
- `nextDueAt` is not required or inspected. Null does not block scheduling.
- Raw owner/reminder timezones are not consumed by this Native read contract.
  The caller defaults to `Calendar.current`; the scheduler explicitly assigns
  that calendar's timezone to trigger date components. A Pacific device/calendar
  resolves 12:21 to 19:21Z. An independently different device timezone remains a
  contract assumption, not evidence that null caused this incident.
- Dayparts must already be resolved to HH:mm by the server. Native rejects raw
  daypart words rather than inventing a clock time.
- Root app `.task` injects the retained delegate and registers all four categories.
  Parent/child `.task` ordering provides no explicit registration barrier, though
  all categories were observed before add in the isolated experiment. Apple
  documents that an unknown category still displays without custom actions; it
  is not a proven cause of missing presentation.
- Foreground delegate returns banner/sound/list. Provisional authorization may
  deliver quietly. General authorized status does not prove banners, lock screen,
  sounds or Focus presentation availability.

## Every relevant removal/replacement path

An exact-commit inventory found one pending-removal call: scheduler sync line 59.
There are no remove-all-pending or delivered-removal calls in the shipped product.

1. Same valid future occurrence on another Home load/refresh/active-scene read:
   same-ID add replaces in place; no explicit removal.
2. Completed occurrence: remove scheduled and one-hour snoozed IDs.
3. Absent occurrence, missing action/time, invalid date/time or expired fire time:
   remove an existing scheduled ID through desired-set subtraction.
4. Snooze: distinct `priority.snoozed.*` ID, one-hour interval, local-only add;
   ordinary scheduled stale cleanup does not remove unrelated snoozes.
5. Default tap/open or Priority navigation: no direct removal. Notification
   completion calls the existing canonical completion API; later Home sync
   performs cancellation. Background scene change itself has no removal call.
6. Evidence Review-ready adds a distinct fallback request; it does not remove
   priority requests.

Thus identical valid, pre-deadline inputs survive two refreshes, detail navigation
and background/resume. **Actual Build 34 production Home refresh does not retain
the action**, so that counterfactual survival must not be reported as shipped
production success. A schedule save invalidates Home caches but is not itself a
local scheduling call; acceptance must verify pending state after a fresh Home
read, before backgrounding. No new schedule state/subsystem was introduced.

## Additional proven ordering hazard and bounded correction

Home rendered its canonical state before awaiting unrelated Goal/Briefing reads.
Those reads use normal 15-second request timeouts, with sequential Goal hub/detail
reads. If Home loads at 12:20:50 and prefetch takes 30 seconds, the later sync's
strict future guard skips 12:21. This is a deterministic deadline counterexample,
not proof of the actual incident's prefetch latency.

Build 35 now decodes and forwards the optional canonical action in both production
adapters. Unknown classifications still fail closed; no Swift domain semantics or
fallback schedules were added. Home uses a tested load/reconcile/prefetch sequence
so notification handoff precedes speculative prefetch. Scheduler eligibility,
trigger calculation, categories, snooze and stale-set rules are unchanged.

## Real Simulator experiment

Existing iPhone 17 Pro Simulator, iOS 26.5 (23F77), arm64; separate task-owned
bundle `com.physiqueos.notificationforensics34`, not the Founder app container.
Original app root category/delegate setup was retained; root content alone was
replaced with sanitized test controls. No production network requests occurred.

- Authorization granted locally to the isolated app; authorization, alerts, lock
  screen and Notification Center all reported enabled/authorized.
- Categories were enumerated before add, including specialized workflow.
- Exact shipped scheduler submitted the stable ID with no captured add errors.
- A future whole-minute HH:mm used the same calendar-trigger path: 15:56 PDT,
  `2026-09-15T22:56:00Z`, explicit America/Los_Angeles timezone.
- Pending captures after add and two real sync refreshes contained exactly that
  ID/category/trigger. Background captures at 22:53:23Z and 22:55:08Z retained it.
- After background fire, captures at 22:56:30Z and 22:56:35Z had no pending
  request and contained the exact ID in `deliveredNotifications`.
- This proves notification-center delivery classification in Simulator. Banner
  visibility on the physical iOS 27 iPhone is not proven by these captures.

Source SHA-256 checks matched the shipped git objects byte-for-byte:
Scheduler `62acafd3e7214cb8a0929f088b48a2de3d62996c8fb946de212b2a6c7725b984`;
Categories `09bd8f52583940ad4ccc0d48aa8f2a94a075c216ae0e70c7211abe99e251fac6`.

Evidence is retained under
`/private/tmp/physiqueos-build34-notification-forensics.EWmw0c`:
real-center-observations.json, exact-commit tests/results, corrected-candidate
tests/results and unsigned build logs. These are engineering artifacts, not a
new product notification subsystem or private production fixture.

## Build 34 → prior Build 35 notification changes

- Scheduler journal/add-error/snooze-error reporting: diagnostics only; plan,
  times, categories, authorization gate and cancellation semantics unchanged.
- Diagnostics capture: pending + delivered + registered categories + timestamp,
  device timezone and retained replacement/removal reasons; local-first readonly
  capture then fresh Home enrichment.
- Founder settings connection screen: explicit diagnostics button; ineffective
  Home long-press removed. Existing Founder scope retained.
- Production API invalidation/in-flight generation correction: freshness/cache
  behavior, not a changed scheduling algorithm.
- Server Recovery workflow correction: action-contract taxonomy only; canonical
  `12:21` unchanged, peptide specialized behavior retained.
- No other notification authorization/trigger/category/delegate/removal change
  existed in the prior candidate. The newly discovered adapter/ordering fixes are
  actual scheduling-path corrections made on top, not edits to shipped authority.

## Physical Settings inspection before the next cycle

Final focused validation: exact shipped scheduler/production-adapter forensic
tests **19/19**; corrected candidate API/notification/diagnostic/link suites
**173/173**; affected Home and reachable-diagnostics UI journeys **2/2**.
Debug test build and unsigned generic arm64 Release build passed. Release metadata
remains 1.0 (34); deterministic project generation produced no project diff.
An initially introduced async XCTest autoclosure assertion did not compile; it
was corrected before the successful final candidate invocation. The unrelated
existing mutable `bytes` warning remains. Unrelated exhaustive suites were not
rerun or claimed to validate this new correction. Diff/signature scans passed;
the server and preserved forensic script remained unchanged.

Inspect Settings → Notifications → PhysiqueOS: Allow Notifications, Lock Screen,
Notification Center, Banners, Sounds, and immediate versus Scheduled Summary
delivery. Inspect the active Focus app allow/silence list and automatic schedules;
check device timezone. Record the settings first; change only a setting that is
inconsistent with the intended test, not blindly. Focus is not established as the
incident cause. Active Focus suppression itself is not exposed by the app's
notification-settings snapshot.

Apple references:
[category behavior](https://developer.apple.com/documentation/usernotifications/unmutablenotificationcontent/categoryidentifier),
[notification settings](https://support.apple.com/guide/iphone/change-notification-settings-iph7c3d96bab/ios),
[Focus app controls](https://support.apple.com/guide/iphone/allow-or-silence-notifications-for-a-focus-iph21d43af5b/ios).

No Apple account reauthentication was needed. Native remains 1.0 (34). Build 35
and production remain unshipped/unmodified respectively. Physical request state,
delivery and actions must still be proven using the reachable Build 35 diagnostics.
