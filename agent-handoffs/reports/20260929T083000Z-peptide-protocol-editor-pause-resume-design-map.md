# Peptide protocol editor redesign + canonical Pause/Resume — design and authority map

- **Task:** `peptide-protocol-native-ux-redesign-next-batch-20260929` (+ addendum `20260929T063000Z-weight-weekly-averages-goal-range-addendum.md`)
- **Agent:** claude · **Status:** design published; implementation starting. No Server deploy, no TestFlight upload.
- **Authority reverified:** Server/Web production `98534bf8` (deployment `ab7fe481`); Native Build 69 `efa65db1`.
- **How this was produced:** 8 parallel read-only audits of Server + Native + the real Founder record shapes (read-only production export, kept local), a completeness critic, and a 3-lens adversarial critique of the first draft. Four blockers and ~20 majors from the critique are folded in below.

## 1. Why the editor is complicated (root cause)

The only peptide write is a full-draft save whose `dosingStrategy` is a **titration generator**. Every non-custom save regenerates the entire dated `timeline` from `dosingStrategy.startDate`, so:
- the editor has to expose the generator (pattern, starting/target/step/hold/landing, final state) even to change today's dose;
- a naive "change dose" rewrites what the timeline says was taken on past dates (the old timeline survives only in `timelineHistory`, which no reader consults).

Reaching the editor takes 3 taps; changing only the dose on Retatrutide takes ~8 taps and 5 decisions through 24 control groups.

## 2. What is canonical today (verified)

| Record | Role for peptides |
|---|---|
| `executionItems` (type `peptide`) | **Authority.** `preferredSchedule`+`cadence` → which days/time (occurrence eligibility, computed per local date); `timeline` → the dose for a date; `dosingStrategy` → generator of the timeline; `timelineHistory` → archive; `executionRevision` → If-Match token; `reminderPreference`, `notes`, `timingContext`, `active`. |
| `reminders` (`protocol_reminder`) | Identity + history: `priorityId = reminder.id`, `completionHistory[]` (with the dose actually taken). Schedule is a synced projection. |
| `protocols` root | Category/name/goal links; `status` always `active`; `dose/doseHistory/schedule` are dead seed data; **no `protocolVersions` exist for peptides** (versionless legacy roots). Three readers require `status === 'active'`. |

Founder shapes: **Retatrutide** = structured `up_hold_down` plan from May 21 (7 dated phases, the ramp finished Aug 6, last phase open-ended = stable dose), Thursday 9:45 PM. **Tesamorelin** = single `stay` phase from May 24, Sun–Thu 9:45 PM. Both hydrate as `structured` today (verified by running the Server's own hydration locally).

There is **no pause for peptides** anywhere. The only pause path is supplement-only (protocol status + version chain, which peptides lack). `reminder.active=false` / `executionItem.active=false` mean other things and are overwritten by the next save.

## 3. Simplified user model (what the Founder sees)

One pushed screen per peptide (same destination as today; back label "Peptides"):

**Card** (rows are the affordance; tappable rows open a focused sheet):
- header: syringe badge · name · chip **Active** / **Paused**
- **Dose** — `2.5 mg` (Server-formatted) → sheet
- **Days** — `Thursday` / `Sun–Thu` / `Every day` → sheet (7 chips; "Repeat every N days instead" link)
- **Time** — `9:45 PM` → sheet (native wheel)
- **Next dose** — `Today · 9:45 PM` / `Thu, Oct 1 · 9:45 PM` / `Paused` (read-only)
- **Planned change** — `2.5 mg on Oct 8` (only when a future dose change exists)
- **Paused since** — `Sep 12` (only when paused)
- **Reminder** — inline toggle (saves immediately)
- **Notes** — one line or "Add notes" → sheet

Under the card: text button **Pause Retatrutide** (confirmation: "Upcoming doses and reminders stop until you resume. Your dose history is kept."), or when paused a primary **Resume Retatrutide** (one tap; result line "Resumed. Next dose Thu, Oct 1 · 9:45 PM.").

**Advanced · dose plan** (disclosure row, collapsed by default; summary "Keep this dose since May 24" / "Increase, hold, then decrease · finished Aug 6"): the plan editor with plain-language labels only ("How the dose changes": Keep this dose / Increase step by step / Decrease step by step / Increase, hold, then decrease; "Starting dose", "Peak dose", "Change by", "Hold, then decrease", "Final dose", "Ends"). Its primary action is **Start a new plan from today** (seeded with the current dose). Editing the historical parameters is allowed only with an explicit "Rewrites your dose history before today" confirmation. **Dose history** lists past phases (`2 mg · Aug 6 – Ongoing`). "Custom" is never offered (read-only "Manual plan" only when a record already is one).

Generator vocabulary (stay, titrate, phase, landing, strategy, hold-and-landing, final state) never appears in the routine path.

**Honest tap counts** (from the peptide screen; +2 from the Operating Plan landing): Change dose 4 (row, value, Save; 6–7 with the keyboard) · Change days 3 · Change time 3 · Reminder 1 · Notes 3+typing · Pause 2 · Resume 1. Today: 8+ taps / 5 decisions for a dose change.

**Founder render.** Retatrutide → Active · Dose <current> · Thursday · 9:45 PM · Next dose Thu, Oct 1 · Reminder on · Advanced collapsed ("Increase, hold, then decrease · finished Aug 6") · Dose history 7 entries. Tesamorelin → Active · Dose <current> · Sun–Thu · 9:45 PM · Next dose Today · 9:45 PM · Advanced collapsed ("Keep this dose since May 24").

## 4. Canonical semantics

### S1 — Editing today never rewrites the past (history-preserving timeline)
For any **strategy-bearing** save, the stored timeline becomes: `frozen phases before dosingStrategy.startDate` + `generated(dosingStrategy)`, composed in this order: (a) drop every existing phase with `start >= strategy.startDate`; (b) if the last remaining phase is open or ends on/after `strategy.startDate`, close it at `strategy.startDate − 1`; (c) append the generated phases; (d) validate the **composed** timeline; (e) archive the previous timeline to `timelineHistory` as today. Raw timeline "replace" saves (Web legacy execution editor) are unchanged. Hydration keeps the **full stored timeline** and compares `generated` only with the stored phases whose `start >= strategy.startDate`; a frozen phase overlapping `strategy.startDate` marks the record `legacy_custom`. Both Founder records hydrate unchanged. A strategy whose `startDate < today` is refused (`400 PEPTIDE_PLAN_REWRITES_HISTORY`) unless the draft carries `rewriteHistory: true` (only the Advanced editor sends it, after its confirmation).

### S2 — "Change dose" = keep this dose from a date
The simple sheet sends the existing save with `dosingStrategy = { pattern: 'stay', startingDose: X, unit, startDate: effectiveDate (today or a future date; never past) }`, everything else unchanged. With S1 this closes the current phase and opens a steady phase. Caption in the sheet when the record has a plan: "Your dose plan becomes a steady X mg from <date>. Doses already taken are kept." + "Planned changes on Oct 8 and Oct 22 will be removed." when future changes exist. For a record mid-plan, the sheet also offers **Only the next dose**, which records the amount actually taken on the next occurrence (Priority Detail "Took a different amount" → existing completion `dose`) without touching the plan. Days/Time/Reminder/Notes ride the existing `supportSchedule`/`reminderPreference`/`notes` fields; they never touch the dose timeline (past occurrences live in `completionHistory`).

### S3 — Pause / Resume = a dated suspension window on the execution item
- **Command** `operating-plan.peptide-lifecycle.change.v1` (`changePeptideLifecycle`), payload `{ protocolId, operation: 'pause'|'resume', effectiveDate?: 'today'|'tomorrow' (pause only, default today), reason? }`, **If-Match = executionRevision (contract-required)**, 412 `STALE_VERSION`, 409 `PEPTIDE_LIFECYCLE_NOT_ACTIVE` / `PEPTIDE_LIFECYCLE_NOT_PAUSED`, 404 when no execution. Result `{ status:'paused'|'resumed', protocolId, executionId, executionRevision, priorityId, lifecycle }`.
- **Record:** `executionItem.scheduleSuspensions: [{ pausedFrom:'YYYY-MM-DD', resumedOn:'YYYY-MM-DD'|null, pausedAt, resumedAt|null, reason|null, pausedExecutionRevision, resumedExecutionRevision|null }]`. Dates are the user's canonical local date (same resolution as Home/skip/supplement-lifecycle). Absent field ≡ `[]` everywhere. "Paused" ≡ last suspension has `resumedOn: null`. Nothing else is edited: `timeline`, `completionHistory`, `preferredSchedule`, `active`, `reminder.active`, `protocol.status` stay as they are. Pause/resume each bump `executionRevision`.
- **Enforcement (every site, not just one):** (1) `projectExecutionPriority` returns `occurrenceEligible:false`, `operationalState:'PAUSED'` for `pausedFrom <= d < (resumedOn ?? ∞)` → Home and the 7-day notification horizon drop it (explicit PAUSED early-return in `getExecutionBackedProtocolItems`); (2) **Priority Detail** explicit PAUSED branch: `status:'Paused'`, `completable:false`, `completionContext:null`, `executionContract.expectedVersion:null` (Build 69 derives completable from it), open-only `notificationAction`, `paused:true`, `pauseContext:{pausedFrom}`; Completed wins over Paused; (3) `nextDue`/`nextDueDate`/`nextDueTime` skip suspended dates and are `null` while paused; (4) completion write paths (`priority.complete.v1` port, Web `PriorityCompletionService`, previous-day reconcile) load the execution item and refuse a date inside a window (`422 PRIORITY_OCCURRENCE_PAUSED`); (5) previous-day Morning Check-In selection receives execution items and excludes `execution_paused` dates; (6) the daily briefing's focus projection receives execution items too.
- **Saves while paused are allowed** (pause → edit → resume works; a suspension can only be closed by `resume`). `scheduleSuspensions` enters `semantic()`/verify normalized to `[]` so a transition that loses it is rejected.
- **Boundary rule:** pause takes effect on `effectiveDate` (today by default; the Native confirmation offers "Starting tomorrow" when today's dose is still open so an already-taken dose can be logged first). Resume takes effect today; today's occurrence is eligible again (Overdue if the time passed; peptide doses cannot be skipped — complete it or leave it). Same-day pause+resume yields an empty window. The every-N-days grid is **not** re-anchored; the resume line shows the Server's next dose.
- **Plans during a pause — the plan is frozen, defined once, in the generator:** `generatePeptideDosingTimeline(strategy, { suspensions })` uses only **closed** windows with `pausedFrom > strategy.startDate`, chronologically and cumulatively; each shifts every generated phase **start** `>= pausedFrom` by `(resumedOn − pausedFrom)` days; the first phase is never shifted; `endDate`s are re-derived (next start − 1) so the phase containing the pause extends through it (no gap). Hydration passes the record's closed windows through the same rule, so a shifted timeline regenerates exactly, before and after any later Change dose (a plan authored after a pause ignores it; a plan authored during an open pause is not shifted — its dates tick). `stay` plans are unaffected. Custom (generator-less) timelines are literal dates: their future phases are skipped, not shifted. The resume transition calls the same generator + S1 composition and archives the pre-resume timeline.
- Protocol-level status stays `active` for peptides (versionless roots; active-only readers). Briefing/PI/Goals/You/Timeline readers key on protocol status and therefore keep treating a paused peptide as part of the plan; the briefing's Looking Ahead lists reminders by `reminder.active`, which a pause does not flip (documented, revisit if the Founder wants "paused" language in briefings).

### S4 — Read contract (additive only; Build 69 keeps decoding)
`operating-plan-peptide-support` adds: `lifecycle:{ state:'active'|'paused', since:date|null, history:[{state, effectiveDate, at, reason}] }`, `currentDose:{amount,unit}|null`, `currentDoseLabel`, `currentPhase:{startDate,endDate}|null`, `plannedChanges:[{startDate,dose,label}]`, `dosingHistory:[{startDate,endDate,dose,label}]` (past phases, newest first), `dosingMode`, `advancedPlan` (= structured ∧ pattern≠stay ∧ plannedChanges>0), `nextDueDate`, `nextDueTime`, `priorityId`, `executionRevision` (as today). `dosing` stays non-null; `state`/`pattern` enums closed; the existing `timeline` becomes the full stored timeline.
`operating-plan-protocol-domain`: `lifecycleState` **stays `active`** for peptides (Build 69 hides Edit when it reads `paused`); new `executionLifecycle:{state, since}` per method; `editDestination` always present.
`operating-plan` landing: peptide section subtitle `n active · m paused`, status `Paused` when all are paused (string chip; Build-69-safe).
`priority`: `paused`, `pauseContext`, and the Paused branch above.

### Deploy order and rollback
Server first; the new Native **feature-detects** (`lifecycle` and `currentDose` present → simple editor; otherwise the legacy editor) so it can never send a history-rewriting `stay` to the old Server. Rolling the Server back to `98534bf8` loses no data but silently un-pauses every paused peptide (occurrences, notifications and completions resume at once); the suspension record persists and re-deploying restores it. Any peptide edited with the new Change-dose or Resume logic reads as *Custom* on `98534bf8`; do not save it from Build 69/Web while rolled back. Rolling Native back to Build 69 with a peptide paused leaves no in-app resume (operator command only).

### Server-side safety notes
The new port lives in its own module (registered in one line) and persists through the existing helpers, so the still-green history guard stays green (no `records.put(` literals, no database-path files). The guard's second predicate has been red since the skip command shipped; recorded as pre-existing.

## 5. Build 69 roll-forwards in the same build (all Server-only fixes; confirmed by audit and adversarial verify)
- **Logged Today provenance:** `row.context = 'Apple Health'` (idempotent) when every presented Training line is Apple-Health-backed (Cardio always; Strength only when confirmed); no per-line suffix. Unconfirmed Strength + Cardio: no caption (today's behaviour; recorded as a product decision). Native unchanged (Build 69 renders the caption under the group).
- **Foam Rolling Mark Skipped:** two Server layers — eligibility excludes only the dose-aware `protocol_reminder` (weigh-in/photos/DEXA remain excluded by workflow; `supplement_reminder` stays excluded in this build, product decision to revisit); the recovery detail branch now computes `skippable/skipCommand` and renders a skipped occurrence as `Skipped`. Production confirmed: Foam Rolling's protocol is category `recovery`, status active. Native unchanged.
- **Weight Weekly Averages:** remove the six-week cap (`getWeeklyAverages .slice(-6)`) and the redundant projection cap; buckets already scope to the Goal window before aggregation. Native companion: key rows by the Server's `sortDate` (labels repeat across years) and request the bounded maximum for goal-scoped reads so Trend/History cover the same window. Founder acceptance: Build Lean Mass (Jul 19 → today) has weigh-ins in all 11 weeks (7, 7, 14, 10, 7, 7, 7, 6, 7, 5, 2 per week, read-only count), so Weekly Averages must list 11 weeks back to "Week of Jul 19", matching the Trend graph.

## 6. Test matrix (deterministic; Server + Native)
Dose change today / future date / on a phase-transition day / twice in one day; day-of-week change and time change keep the timeline; reminder on/off keeps timeline and history; pause (Home, horizon, Priority Detail, nextDue, completion refused, Morning Check-In excluded); resume (from `resumedOn`, no backfill, history untouched); pause → edit → resume (exactly two archives); historical titration preserved after a stable change (Retatrutide-shaped); stable after titration; open-ended; explicit end date; plan frozen across a pause (spanning a phase boundary; starting on a step day; two pauses; stay unaffected; plan authored after a pause reproduces); timezone/day boundary (pause at 23:30 local uses the local date); no retroactive occurrence mutation; `scheduleSuspensions` absent ≡ []; old-shape save preserves suspensions; registries (parity, manifest order, OpenAPI enum); Native decoders (new keys optional; Paused detail non-completable; legacy payload → legacy editor); notification withdrawal on pause; roll-forward cases per §5.

## 7. Not changing
protocol root fields; protocolVersions for peptides; supplements' lifecycle; auth/Face ID/session (Codex lane); photos; sleep; Build 69 accepted behaviour.
