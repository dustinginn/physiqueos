# Peptide editor + Pause/Resume — Build 70 candidate status (code complete; Native suite + Release compile PENDING)

Task: `peptide-protocol-native-ux-redesign-next-batch-20260929` (+ Weight Weekly Averages addendum, same build).
Design/authority map (unchanged, read first): `agent-handoffs/reports/20260929T083000Z-peptide-protocol-editor-pause-resume-design-map.md`.

**Status honesty:** nothing is deployed, nothing is uploaded to TestFlight, production was never mutated. Server regression is complete. **Native full unit suite and Release compile have NOT run for this candidate** — the disk has ~14.0 GiB free, under the standing 15 GiB floor (`STANDING_DISK_SAFETY.md`); the remainder of the disk is Founder audio libraries/system files, so nothing was deleted. The Founder was push-notified to authorize running at ~14 GiB or free space. Native was verified by `swiftc -typecheck` (app + all test sources, Swift 6, 0 errors) only.

## Candidate SHAs (all pushed to `dustinginn/physiqueos`)
| Layer | Branch | SHA |
|---|---|---|
| Production baseline | (deployed) | Server `98534bf8`; Native Build 69 `efa65db1` |
| **Server candidate (combined)** | `claude/next-build-server-candidate-20260929` | **`b94ab533`** |
| ↳ peptide Pause/Resume + read contract | `claude/peptide-ux-server-20260929` | `cc440e16` |
| ↳ Weight Weekly Averages (full Goal range) | `claude/weight-weekly-20260929` | `31235b35` |
| ↳ Logged Today Apple Health provenance | `claude/log-provenance-20260929` | `438cba08` |
| ↳ Foam Rolling Mark Skipped | `claude/foam-skip-20260929` | `c7118c6a` |
| **Native candidate (Build 70)** | `claude/peptide-ux-native-20260929` | **`0e3a0da8`** |
| ↳ Native weight rows keyed by sortDate + limit 365 (merged) | `claude/native-weight-rows-20260929` | `7e843d74` |

Server combined diff vs `98534bf8`: 46 files, +3210/−178. Native diff vs `efa65db1`: 34 files, +4847/−380. Native `APP_BUILD_NUMBER` = 70 (generator deterministic; CFBundleVersion test literal updated). Recommended build number: **70**.

## 1. Complexity root cause
The only peptide write was the full-draft `operating-plan.peptide-support.save.v1`, whose `dosingStrategy` is a titration **generator**: every non-custom save regenerated the entire dated timeline from `dosingStrategy.startDate`. So the editor had to expose the generator (pattern, starting/target/step/hold/landing, final state) just to change today's dose, and a naive dose change rewrote what history said was taken on past dates. Authority is the execution item (`preferredSchedule`+`cadence`, `timeline`, `dosingStrategy`, `executionRevision`); the `protocol_reminder` is the identity/history anchor; peptide protocol roots are versionless legacy and `status` must stay `active`.

## 2. Simplified model
- **S1 history-preserving composition:** timeline = phases before `strategy.startDate` kept verbatim + generated phases from it; the phase containing the start is closed at start−1; old timeline archived to `timelineHistory`; composed timeline validated. Editing today never rewrites past phases; a past-dated strategy needs explicit `rewriteHistory` (refused otherwise with `PEPTIDE_PLAN_REWRITES_HISTORY`, effect-based so Days/Time/Reminder/Notes saves that carry an old strategy pass).
- **S2 Change dose** = a `stay` strategy from a chosen date (today or later); a steady plan's explicit end date survives.
- **S4 additive read keys** on peptide-support: `lifecycle`, `currentDose`/`currentDoseLabel`, `currentPhase`, `plannedChanges`, `dosingHistory`, `dosingMode`, `advancedPlan`, `nextDueDate/Time`, `priorityId`, `localDate`. Protocol-domain adds `executionLifecycle`; `lifecycleState` stays `active` for peptides. Existing keys/enums unchanged (Build 69 keeps decoding).
- **Native screen:** one pushed screen. Rows: Dose · Days · Time · Next dose · (Planned change) · Reminder (inline switch) · Notes; each tappable row opens a focused sheet (medium/large detent, Cancel/Save, server refusal shown in-sheet). Pause/Resume under the card. "Advanced · dose plan" is a collapsed disclosure (expanded only when future changes exist) holding the generator in plain language + dose history; "Custom" is never selectable. No generator vocabulary on the routine path. Legacy fallback (read-only detail + Build 69 form) when the Server lacks `lifecycle`/`executionRevision`.

## 3. Pause/Resume semantics (Server-canonical, not faked in Native)
- New command `operating-plan.peptide-lifecycle.change.v1` (`pause` | `resume`, optional `effectiveDate: today|tomorrow` for pause), If-Match = `executionRevision`; 412/409/404/422 mapped; registered in Phase3, NATIVE_WRITE_COMMANDS, manifest, OpenAPI, parity tests.
- State = `scheduleSuspensions: [{pausedFrom, resumedOn|null, pausedAt, resumedAt, reason, pausedExecutionRevision, resumedExecutionRevision}]` on the execution item. **Nothing else is edited or deleted** (timeline, completionHistory, preferredSchedule, `active`, reminder, protocol status). No backfill.
- Enforced at the single choke point `projectExecutionPriority` (`PAUSED`): Home, 7-day notification horizon (Native removes pending/delivered iOS requests), Priority Detail (Paused, non-completable, identity-only contract, open-only action), `nextDue`, completion write paths (`422 PRIORITY_OCCURRENCE_PAUSED`), previous-day check-in guard, Morning Check-In (`execution_paused`), briefing focus.
- Titration during a pause is **frozen, not skipped**: on resume the generator shifts phase boundaries on/after `pausedFrom` by the pause length; `stay` plans unaffected. Resume copy names the moved planned changes only when the dates actually moved.
- A pause starting tomorrow reads "Pauses Sep 30", keeps tonight's dose/next dose, offers "Cancel pause" (result "Pause canceled."). Saves are allowed while paused.

## 4. Before / after flow (routine actions)
Before: 8+ taps through a 24-control generator form. After: change dose 3 taps (row → value → Save); change days 3; change time 3; reminder 1 (inline switch); pause 2 (3 if choosing "Tomorrow"); resume 1; notes 3.

## 5. Build 69 roll-forwards (same build)
- **Logged Today provenance (Server-only):** `row.context = "Apple Health"` when every presented line is Apple-Health-backed; no per-line suffix; unconfirmed Strength + Cardio shows no caption.
- **Foam Rolling Mark Skipped (Server-only, two layers):** eligibility now covers `recovery_reminder`; execution-backed recovery Priority Detail computes `skippable/skipCommand` and renders a skipped occurrence as Skipped. Supplement reminders deliberately still excluded.
- **Weekly Averages:** removed the six-week cap (`getWeeklyAverages` `.slice(-6)` and the redundant `.slice(0,6)` in `projectNativeWeightRead`); windowing already precedes bucketing so partial first/last weeks and entry counts are correct. Diagnosed at the Server projection layer, not patched in Native. Native rows keyed by `sortDate` with request limit 365.

## 6. Server vs Native changes
Server: `PeptideDosingStrategyModel` (suspension-aware generator/hydration), `PeptideExecutionManagementService` (S1, rewrite guard, lifecycle transition), `PeptideLifecyclePort` (new), `ExecutionPriorityProjectionService`, `DailyFocusService`, `DailyBriefingService`, `PriorityDetailService` (paused branch, `doseAdjustable`), `PriorityCompletionService`/completion ports, `MorningPriorityReconciliationService`, `CoreNavigationReadService` (additive read + `localDate`), contract/registries/OpenAPI/docs, web screens tolerate the new fields.
Native: `PeptideSupportEditorViewModel`, rewritten `OperatingPlanPeptideExecutionView`, `PeptideSupportSheets`, `PeptideDosePlanEditor`, shared `PhysiqueOSDisclosureRow`, domain card "Manage"/Resume, `PeptideSupportAPI`/`ProductionCommandAPI` (lifecycle), paused Priority Detail + actual-amount completion (`doseAdjustable`-gated), notification withdrawal on pause, sandbox store/fixture parity.

## 7. Review outcome (three Native adversarial reviews at 9f71eeed + earlier Server reviews)
No blockers. Majors fixed in `0e3a0da8`: pending-pause labelling; retry/pull-to-refresh and honest post-write copy; 412/409 recovery now always re-reads (`fetchSupport` uses `.reload`, previously served a 90 s cached revision); failure copy names controls that exist; stale Advanced draft can no longer revert Days/Time/Reminder/Notes (Advanced sends only dosing); "Start a new plan" seeds a steady plan; Save buttons need a real change; Change dose keeps a steady plan's end date; simple editor no longer falls back when there is no dose today; "Took a different amount?" scoped to peptides via Server `doseAdjustable`, comma decimals, no first-frame disabled Mark Complete; delivered-banner orphan sweep limited to real horizons and today-or-later (Build 69 parity) with the original completed-cleanup wording restored; non-rewrite save idempotency signature byte-identical to Build 69; lenient additive decoding; Server now emits `localDate`.
Known minors left open (non-blocking): sandbox `pause` ignores "tomorrow" and sandbox Home never shows paused; Change-dose caption does not mention phases kept before a future start date; Menu/Dynamic-Type polish beyond what was fixed; legacy fallback still prints Server window strings; the Priority Detail "Only the next dose" hand-off is offered only when today's dose is open.

## 8. Tests / build
- Server candidate `b94ab533`: full regression **9315/9623 pass, 303 failures = identical to the production baseline (9178/9486, 303), 0 new.** Targeted new tests: lifecycle command/guards, S1 composition, projection PAUSED, detail paused/`doseAdjustable`, read keys incl. `localDate`, roll-forwards.
- Native `0e3a0da8`: `swiftc -typecheck` of app + all tests, 0 errors. Last full-class run before the review fixes was 229/229 (`9f71eeed` line). **Full xcodebuild unit suite, sandbox UI tests and Release configuration compile: NOT RUN (disk floor).** New/updated tests were added for pending pause, failure contexts, dose-only advanced save, legacy save, end-date carry, refresh-failure copy, lenient decoding, orphan sweep, comma decimals, `doseAdjustable` decode.
- Server production build of `b94ab533`: NOT RUN (disk floor).

## 9. Deploy order and rollback (not authorized; for review)
1. Server first (`b94ab533`), after Founder review: additive read keys + new command; Build 69 keeps working (legacy editor path).
2. Then Native Build 70 (feature-detects `lifecycle` + `executionRevision`).
Rollback caveats: rolling the Server back silently un-pauses any paused peptide (Server 98534bf8 ignores `scheduleSuspensions`); a record edited with the new composition can read as Custom on `98534bf8`; Build 69 Advanced past-phase edits are refused with `PEPTIDE_PLAN_REWRITES_HISTORY` on the new Server; a paused peptide has no in-app Resume on Build 69.

## 10. Founder acceptance checklist (on device, after Server deploy + Build 70 install)
1. Peptides → open Retatrutide → card shows Dose, Days, Time, Next dose, Reminder, Notes; Advanced collapsed with "Increase, hold, then decrease · finished Aug 6"; no generator wording.
2. Change dose: 3 taps; Dose history preserved (past phases unchanged); caption states the steady plan from the date.
3. Change Days / Time / Notes each in one sheet; Reminder switch saves inline.
4. Pause (Today): Home + notification horizon drop it, delivered banner disappears, Priority Detail reads Paused with no Mark Complete; history intact.
5. Pause (Tomorrow): chip "Pauses <date>", tonight's dose still offered; "Cancel pause" works.
6. Resume: next dose shown; planned titration changes moved by the pause length (if any).
7. Tesamorelin shape (Sun–Thu 9:45 PM) renders "Sun–Thu".
8. Peptide "Took a different amount?" appears only on peptide doses; untouched Mark Complete records the planned dose.
9. Logged Today: Apple Health caption on the whole Training group. Foam Rolling: Mark Skipped present.
10. Weight Evidence Weekly Averages: full selected Goal range (e.g. 11 weeks back to Jul 19), matching the trend graph.
11. Regression spot checks: Workout Complete PR celebration, Morning Check-In, briefing notifications, Face ID/pairing untouched (Codex lane).

## 11. Decisions / input needed
- **Disk floor:** authorize the Native full suite + Release compile + Server production build at ~14 GiB free, or free space to ≥15 GiB.
- Optional: should briefings say "paused" for a paused peptide? Should Mark Skipped extend to supplement reminders?

Safety: no secrets; no Founder dose values in the repo (synthetic numbers only); read-only production probes only; Codex's auth lane untouched.
