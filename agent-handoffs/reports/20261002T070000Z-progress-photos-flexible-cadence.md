# Progress Photos flexible cadence — Every N Weeks / Months (final)

- Task id: `progress-photos-flexible-cadence-20261002`
- Prompt: `agent-handoffs/inbox/prompts/20261002T060000Z-progress-photos-flexible-cadence.md`
- Generated (UTC): 2026-10-02T07:05:00Z (checkpoint)
- Status: **checkpoint — Server 4ffde0f5 DEPLOYED and verified; Native Build 81 candidate 6a093251 final suite/archive/upload IN PROGRESS (disk at floor because of a concurrent lane)**

## Exact authority
| Item | Value |
|---|---|
| Repository | `dustinginn/physiqueos` |
| Production Server before | `2d967e48cb6a01e4a327934bbd81a405d3c26486` (deployment `421cae1a`, reverified ACTIVE, web+worker source SHA, branch head, ready) |
| **Production Server now** | **`4ffde0f5faf1832decfbc09d822088aeba0dca89`**, deployment **`faaf66bd-930f-46a2-9b8e-77e604c23a86` ACTIVE** (9/9) |
| Server branch | `claude/progress-photos-flexible-cadence-server-20261002`: `ff63d1fd` feature → `547cb064` review fixes → `6fdacd8c` test timeout → **`4ffde0f5`** re-review fixes; fast-forwarded onto `combined-app-platform-cutover` |
| Native base | Build 80 shipping source `1783691debeea46d3e4e6b2f6e470abe032c4c74` (reverified: release state 80, delivery `39ae9ddd` VALID, no later build report on main) |
| **Native candidate** | branch `claude/progress-photos-flexible-cadence-20261002`: `0cdf9810` feature → `a210fafa` review fixes → `e5434a01` baseline preview → **`6a0932517cbd8de165bf25c7637a2d2d6fea03dc`** Build 81 bump |
| Native build | 1.0 (81) — archive/upload pending at this checkpoint |

No Apple Watch work is in either branch. The Watch Phase 1A prompt on main says it will reconcile with any newer Progress Photos release.

## A. Audit — what the cadence actually was
- **Server-owned, not Native-only.** The canonical value is the active `photos` protocol version's `recurrence` (`protocol_recurrence_v1`: `frequency`, `interval`, `weekdays`, `timeOfDay`, `timezone`, `anchorDate`). It is projected into `executionItems/execution_progress_photos` (`cadence`, `preferredSchedule`) and `reminders/reminder_weekly_progress_photo_set` (`schedule`, `nextDueAt`).
- **Shape.** The recurrence already held an integer weekly interval with an explicit anchor (Founder: anchor 2026-07-25). The editor contract collapsed it to a two-value enum, `cadence: "weekly" | "weekly_interval_2"`. Build ≤80 decodes that as a strict Swift enum, so an unknown value fails the whole Coaching Updates detail and editor.
- **Surfaces.**
  - Native Coaching Updates editor (You → Operating Plan → Coaching Updates → Edit → Progress Photos), through `operating-plan-coaching-updates` and `operating-plan.coaching-updates.save.v1`.
  - Web Coaching Updates editor.
  - Legacy Web execution editor (`/profile/operating-plan/execution/execution_progress_photos`).
- **Home / Priority / notifications.** These are entirely Server-projected. `DailyFocusService.reminderAppliesToday` feeds Home, the 7-day `notificationOccurrences` horizon, previous-day and morning reconciliation. `PhotoPrioritySatisfactionService` handles completion. Native schedules local notifications only from the Server's occurrence dates/times (`PriorityNotificationScheduler`, identifiers `priority.scheduled.<priorityId>.<date>`), and stale identifiers are removed on reconcile. Native does no recurrence math in production; `PriorityOccurrenceCalculator` is sandbox-only.
- **Photo Event briefing.** It is triggered only by a confirmed, complete photo session in evidence review (`event_eligibility` → `briefing`), gated by the Coaching Updates `eventBriefings.photo` preference. It never reads cadence or schedule dates. **Unchanged.**
- **Pre-existing defects found:**
  1. Any save through either Coaching Updates editor (Web or Native) silently rewrote a 3+ week cadence to weekly. Unknown strings mapped to interval 1.
  2. A second photo-schedule save on the same day was rejected ("Successor effective date must follow the current version"), so the acceptance flow of several changes in one sitting would fail.
  3. Hydration `nextDueAt` was counted from the anchor, not today. It is not used for due logic.
  4. Native Coaching save did not reconcile notifications until the next Home read.
  5. Choosing a Specific time in Native showed 08:00 but sent no time unless touched.

## B–D. Canonical model and recurrence math
**Editor contract** (additive; `photos` in the `operating-plan-coaching-updates` read and the save draft):
```
cadenceInterval: 1...12          // product max 12 for both units
cadenceUnit: "week" | "month"
weekOfMonth: "first"|"second"|"third"|"fourth"|"last" | null   // months only
day, timeOfDay, specificTime, reminderEnabled                   // unchanged
cadence: "weekly" | "weekly_interval_2" | "custom"              // legacy, still emitted
nextOccurrenceDate, lastOccurrenceDate, cadenceChangeBaseline   // read-only
```
**Canonical recurrence.**
- Weeks: unchanged (`frequency: "weekly", interval N`).
- Months: new `frequency: "monthly", interval N, weekOfMonth, weekdays:[day]`.
- The reminder and execution projections carry `type/cadence/frequency: "monthly"`, `unit: "month"` and `weekOfMonth`. They drop `weekOfMonth` when switching back to weeks.

**Week semantics.**
- The chosen weekday and specific time are preserved.
- The schedule is on cycle when the weekday matches and `floor(days since anchor / 7) % N == 0`.
- Pure local calendar dates are used (UTC-midnight date keys), so there is no drift from delivery time and no DST drift. Tested across the Nov 1 and Mar 14 transitions.
- "Today" is evaluated in the schedule's timezone (tested with an LA vs New York instant).

**Month semantics — weekday of the month, deliberately not day of month.**
- The rule is "the first/second/third/fourth/last Saturday of every N months", anchored to the anchor month.
- Why: Progress Photos is weekday-based (Preferred day). The same weekday keeps photo conditions comparable. Every downstream weekday filter stays truthful (Home, notifications, satisfaction, store normalization that injects a weekday).
- `last` covers months with a fifth occurrence, so no 29/30/31 clamp is needed and no month is ever skipped.
- Tested:
  - Jan 31 2027 (last Sunday) → Feb 28.
  - Leap day Feb 29 2028 (last Tuesday), and the fourth Tuesday Feb 22 2028.
  - Fourth vs last in five-week Oct 2026.
  - Intervals 1, 2, 3 and 12 months.
  - A brute-force reviewer comparison (all ordinals × weekdays × intervals over 1,200 days): 0 mismatches.

**Changes are future-only and deterministic** (`resolveCadenceChangeAnchor`). The anchor is always set to the first new occurrence:
- Today stays the first occurrence only if it was already due under the previous schedule and still fits. Editing on the occurrence day keeps today; a change never makes today newly due.
- Weeks, when the last scheduled photo day still fits the weekday: first = the later of (last scheduled photo day + new interval) and the first matching weekday after today. Lengthening counts from the last photo day; shortening never pushes back an available day and never skips.
- Weekday change or monthly: the first matching day after today.
- A further change on the same day amends that day's version (audited `sameDayAmendments` with `previousRecurrence`). It is measured against the schedule in force before today, so change-then-revert restores the original anchor exactly.
- Interval-only, time-only, reminder-only and identical saves do not re-anchor and do not create a version.

Examples for the Founder's schedule (every 2 weeks Sat, anchor Jul 25, last Sep 19, next Oct 3), editing Thu Oct 1:

| New cadence | First date |
|---|---|
| Every 1 week | Oct 3 |
| Every 3 weeks | Oct 10 |
| Every 4 weeks | Oct 17 |
| Every 1 month, first Saturday | Oct 3 |
| Every 1 month, last Saturday | Oct 31 |
| Back to every 2 weeks the same day | Oct 3, then Oct 17 (original anchor restored) |

## F. Migration (existing Founder schedule)
- **No data migration.** Nothing is rewritten at deploy.
- Weekly recurrence identity hashes are byte-identical (test recomputes the legacy formula). The semantic digests omit `weekOfMonth` unless present, and weekly occurrence ids are unchanged.
- Build 80 keeps receiving `cadence: "weekly_interval_2"`; the new keys are additive and ignored.
- **Production evidence (read-only probe, candidate code on the Founder's real data, before deploy):**
  - stored: 3 photo versions, current effective 2026-09-17, weekly interval 2, Saturday, `10:00`, America/Los_Angeles, anchor 2026-07-25, no `weekOfMonth`; reminder active;
  - candidate editor read: `cadence weekly_interval_2, cadenceInterval 2, cadenceUnit week, next 2026-10-03, last 2026-09-19, specific 10:00, reminder on`, Photo Event briefing on;
  - Home notification horizon (photo occurrences) at clock offsets 0/7/14/21/28 days: `10-03`, none, `10-17`, none, `10-31`. That is exactly every 2 weeks, with no immediate or duplicate reminder;
  - one `READ ONLY` transaction, 12 SELECTs, 0 blocked, rolled back, write and network guards installed.
- **After deploy (same probe, live `4ffde0f5` runtime):** identical — store untouched (3 versions, interval 2, anchor 07-25, Saturday 10:00, reminder active), editor `weekly_interval_2 / 2 / week`, next 10-03, last 09-19, `cadenceChangeBaseline` = the current schedule, Photo Event on, horizon 10-03 / — / 10-17 / — / 10-31; 12 SELECTs, 0 blocked, rolled back.

**Old clients.**
- Build ≤80 against the new Server works unchanged while the cadence is Weekly or Every 2 weeks.
- After a 3+ week or monthly cadence is saved, Build ≤80 receives `cadence: "custom"` and fails closed: Coaching Updates cannot load there, so it can never show, and then save, the wrong schedule.
- A legacy draft carrying `custom` or an unknown value is rejected (`400 COACHING_UPDATES_INVALID`) instead of silently becoming weekly.
- Build 81 against an older Server decodes the legacy shape and refuses to send a non-legacy cadence.

## E. UI (Native)
In Progress Photos, the Weekly / Every 2 weeks menu is replaced by:
- **"Every 3 Weeks" with a − / + stepper** (1–12, one-handed);
- a **Weeks | Months** segmented control;
- **"On [Saturday]"** (weeks) or **"On the [First] [Saturday]"** (months);
- Preferred time / Specific time (unchanged);
- a summary such as "Every 3 weeks on Saturday" / "Every month on the first Saturday", with **"Next: …"**, or **"Starts …"** after a pattern change (a display-only preview mirroring the Server rule against the Server's `cadenceChangeBaseline`);
- the Remind me about Progress Photos and Enable Photo Event briefing toggles (unchanged).

Labels use natural singular/plural (1 Week, 2 Weeks, 1 Month, 3 Months). No other settings were redesigned. The Web Coaching Updates editor got the same Every [1–12] [Weeks/Months] + week-of-month fields. The legacy Web execution editor refuses (with a message) to save a cadence it cannot express, uses today as its effective date, and its previews resolve exactly as a save would. Simulator screenshots (sandbox fixture) are listed under artifacts.

## G. Notifications / Priorities
- Home, Priority and notification occurrences all come from the same Server recurrence. Interval > 1 and every weekday-anchored monthly schedule route through the anchored cycle; other "monthly" shapes keep their previous handling.
- After a successful Native save, `reconcileCanonicalPriorityNotifications()` runs immediately. The Server's new horizon replaces pending requests, and stale identifiers (old dates) are removed. Identifiers are keyed by priority id + date, so the same date never duplicates. The forced reminder title "Weekly Progress Photo Set" was deliberately **not** changed, because `slugify(title)` participates in priority identity and renaming it would re-key notifications.
- Reminder toggle: `reminder.active` drives Home and notifications as before (a disabled reminder projects no photo occurrence; tested).

## H. Photo Event briefing
Unchanged. It is still triggered only by a completed, confirmed photo session when enabled, never by a schedule date arriving. No historical regeneration. Protected history (photo sessions, evidence, reviews, briefings, completion histories, DEXA) is verified unchanged by the existing composite transition guard and new tests.

## I. Tests / review
**Server**
- New suite `ProgressPhotosFlexibleCadence.test.js` covers:
  - legacy decode, 3/4 weeks and 1/2/3 months, validation;
  - weekly identity byte-identical, singular/plural summaries;
  - week anchoring, DST, timezone;
  - monthly ordinal / last / Jan 31 → Feb / leap year;
  - change rules: before occurrence, on occurrence day, off-week, weekday/unit change;
  - review regressions, plus an exhaustive one-year all-pairs resolvability sweep;
  - Home monthly / 3-week prompting, reminder disabled, one notification occurrence per date, monthly satisfaction.
- `OperatingPlanProductionAcceptance` (production-shaped Native port + read + Home) adds:
  - existing Every 2 weeks loads unchanged;
  - a Build 80 legacy draft and an echoed new draft are no-ops;
  - unknown legacy and invalid new cadences are rejected without mutation;
  - 3 weeks save → readback/Home/notifications;
  - 1 month → back to 2 weeks with clean reminder state and a same-day audited amendment;
  - same-day revert restores the original;
  - monthly → every 2 weeks 19 days later.
- Full Server unit suite on `4ffde0f5`: **9,562 passed / 304 failed, identical failure set to the `2d967e48` baseline (9,533 / 304), 0 new.** The baseline failures are pre-existing (missing private Founder fixtures, evidence-review environment). An earlier run under load average ~45 had two 5 s timeouts, which passed in isolation; the cadence sweep test now has an explicit timeout.

**Native**
- Focused `OperatingPlanReadModelTests` + `FounderServerAPITests`: **317/317** on `e5434a01`. They cover:
  - legacy Weekly → 1 week and Every 2 weeks → 2 weeks;
  - new-shape decode and save/reload of 1/2/3/4 weeks and 1/2/3 months;
  - fail-closed validation, singular/plural, summary;
  - preview rule incl. same-day baseline, revert, shortening, stale next;
  - monthly day rule with month end / leap year;
  - production round-trip draft keys incl. legacy `cadence`;
  - flexible save.
- Full Native unit suite: `0cdf9810` and `a210fafa` 1,902 tests, 1 skipped, 1 failure each. Final full suite on the exact release SHA `6a093251`: pending (first attempt hit a transient simulator launch failure, "failed to launch com.physiqueos.native.dev / No such process", before any test ran; rerun pending disk). The only failure is the known pre-existing `PeptideSupportEditorViewModelTests.testSandboxChangeDoseKeepsHistoryAndPauseResumeWorkAgainstTheFixture` (also on Build 80).
- UI: a temporary, uncommitted XCUITest drove the sandbox editor (2 weeks → 3 weeks → Months/1 month) and captured screenshots; the file was restored. No UI-test change is committed.

**Release / review**
- Release verifier: `release configuration verified: version 1.0 (81), …`. The generator is deterministic (identical pbxproj sha on two runs).
- Independent reviews:
  - **Server:** 3 rounds. Round 1 found the shortening rejection/skip, Web preview mismatch, future effective date lockout, audit detail and other-monthly routing; all fixed. Round 2 found 2 P2s (shortening could push back an available day; same-day revert did not restore); both fixed. Round 3: **no P0/P1/P2**, with an 81,896-change sweep: 0 rejections, anchor == first occurrence, never past, never newly due today, same-day revert identity-equal.
  - **Native:** no blocking defects. The P2-level items (stale next date, preview rule parity, the Specific-time default) are fixed.

## J. Server deploy
- Authority reverified before deploy: `421cae1a` ACTIVE, web+worker `source_commit_hash` `2d967e48`, branch head `2d967e48`, ready.
- `4ffde0f5` is a fast-forward of `2d967e48`; pushed to `combined-app-platform-cutover` (remote head verified) → `apps update --spec` with exactly the 4 stamp lines (`PHYSIQUEOS_GIT_SHA` / `PHYSIQUEOS_BUILD_ID` on web + worker; rollback stamps untouched) → `create-deployment --force-rebuild` → **`faaf66bd` ACTIVE 9/9**.
- Parity: control-plane `source_commit_hash` web + worker = `4ffde0f5…`; `/api/v1/health/live` and `/ready` buildId `physiqueos-4ffde0f5-20261002`, ready; fresh web + worker log envelopes `gitSha` = `4ffde0f5…` (via a harmless 401 refresh). No schema migration.

## K. Build / release
In progress at this checkpoint: Build 81 from `6a093251` (release verifier passed). Archive + guarded upload pending disk ≥ floor.

## L. Founder physical acceptance (minimal)
After installing Build 81 from TestFlight: You → Operating Plan → Coaching Updates → Edit Coaching Updates → Progress Photos.
1. It shows **Every 2 Weeks**, Weeks selected, On Saturday, Specific time 10:00 AM, "Next: Oct 3, 2026" (or the next date after it), and both toggles unchanged.
2. Tap + → **Every 3 Weeks** → the summary shows "Starts Oct 10, 2026" → Save → reopen → retained (Next: Oct 10).
3. Weeks → **Months**, − to **Every 1 Month**, On the First Saturday → "Starts Oct 3, 2026" → Save → reopen → retained.
4. Set the cadence you actually want before Saturday and save. Several changes the same day are fine; a same-day revert restores the original dates.
5. Specific time still 10:00 AM (or your choice).
6. Remind me about Progress Photos is unchanged.
7. Enable Photo Event briefing is unchanged.
8. Settings → Notifications (or long-press Home → Priority): there is exactly one pending Progress Photos reminder, for the next scheduled date at your time, and no duplicate for the old date.

Note: once a 3+ week or monthly cadence is saved, an older build (≤80) cannot open Coaching Updates. It fails closed by design; use Build 81.

## M. Backlog
`agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md` updated:
- Progress Photos flexible cadence: shipped in Build 81 / Server `4ffde0f5`, pending acceptance.
- **App-wide UI/design polish:** the next major maturity project after the Watch daily-driver. Roadmap only; not started.
- **Briefing Narrative + Confidence quality/tuning audit:** the next major strategic-quality project. Roadmap only; not started.

## Disk / cleanup
- Free space was 23 GiB at start. It fell to 13 GiB mid-task because the concurrent Watch lane was building at the same time.
- No Native build or test was started below 15 GiB.
- Removed:
  - the uploaded, VALID Build 75–78 archives (Builds 79/80 kept);
  - the finished Build 79 lane's DerivedData;
  - stale `XcodeDistPipeline` temp folders;
  - this lane's private simulators, result bundles and baseline worktree.
- Recovered to 17 GiB before the final suite and archive. 

## Local-only / not pushed
- Read-only probe bundles and their outputs (contain no secrets; Founder schedule summary only) stay in the job temp directory and are not committed.
- Sandbox screenshots are synthetic fixture data.
- No private Founder data or credentials are committed.

## Rollback
- **Server:** push `2d967e48` to `combined-app-platform-cutover`, restore `PHYSIQUEOS_GIT_SHA`/`PHYSIQUEOS_BUILD_ID` (web + worker) to `2d967e48…` / `physiqueos-2d967e48-20261002`, then `create-deployment --force-rebuild`.
  - Data written by the new code stays readable by 2d967e48 for weekly cadences.
  - A saved **monthly** recurrence would make 2d967e48's Coaching Updates read throw (unsupported frequency) and its Home stop prompting photos. So before a Server rollback, set the cadence back to a weekly one with Build 81.
- **Native:** Build 80 remains installable from TestFlight. It fails closed (cannot open Coaching Updates) while a non-legacy cadence is saved.
