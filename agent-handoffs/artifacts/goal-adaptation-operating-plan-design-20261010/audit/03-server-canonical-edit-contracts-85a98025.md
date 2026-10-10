# Server: canonical edit contracts for the Operating Plan and Goals (production `85a98025`)

Read-only audit of `git show 85a98025:<path>`. This is a condensed record; line references point at that commit.

## Two write channels

### Native command bus

- `POST /api/v1/native/commands` with body `{commandType, metadata, payload}`.
  - Headers: `Idempotency-Key` and `If-Match`; `commandId` is a UUIDv7.
- The allow-list is `NATIVE_WRITE_COMMANDS` (`src/application/native/NativeProductionContractService.js:30-62`). Any other type gets 400 `NATIVE_COMMAND_UNAVAILABLE`.
- A stale revision gets **412 `STALE_VERSION`**.
- 409 means one of: idempotency key reuse, duplicate successor, or peptide not-active/not-paused.

### Web server actions (Founder web)

- Goals, phases, Phase Review and goal transition are **Web-only**.

## Supported edits

| Domain | Command / action | Editable fields and validation | Writes |
|---|---|---|---|
| Goal plan | Web `prepareGoalEditReview` → `saveGoalEditChanges` (`goal_plan_update_v1`, 10-minute review token held in an in-process Map) | Sections: goal, target, timeline, successCriteria, guardrails, coachingPreferences.<br>`target.type` = numeric_change, numeric_absolute, …<br>`timeline.mode` = fixed_duration, target_date, event_date or open_ended.<br>`timeline.flexibility` = firm, adaptive or aspirational.<br>Target date must equal timeline date; keys must be unique; numeric_change needs an amount. | `goals`, patched in place (no revision history). No cascade: `unaffectedSystems` = phases, protocols, briefings, scheduling, … |
| Phases (non-operational) | Web `goal_phase_update_v1` | Name, purpose, future phases.<br>`timingMode` = fixed_duration, target_date or completion_criteria.<br>`transitionPolicy` = manual_review, evidence_review or automatic.<br>Changing the active phase's timing gives `PHASE_REVIEW_COORDINATOR_REQUIRED`. | `goals.phases` |
| Phase Review | Web, gated on an originating artifact `phaseReviewAuthorization` (approval token hash, expected store revision) | `selectedOutcome` = begin_next_phase or extend_current_phase.<br>Begin requires `caloricIntakeTarget` (500–10000) and `activityExpenditureTarget` (0–10000), whole kcal/day.<br>Extend uses 1, 2 or 3 weeks, or custom with `selectedReviewAt`. | decision, goal, phases, `phaseStrategies` (fixed cadence: weekly monitoring, monthly DEXA-anchored strategic review, `user_required`), `phaseExpectedTrajectories`, energy `protocolVersions` successor, forecast, confidence |
| **Energy** | **No edit command.** The read returns `intentionallyReadOnly: true`; the Web editor refuses energy. | The **only** writer is Phase Review Begin. | energy `protocols`/`protocolVersions`: `{mode, caloricIntakeTarget, activityExpenditureTarget, cadences, adjustmentAuthorization}` |
| Nutrition | `operating-plan.nutrition-strategy.save.v1` (expectedCurrentVersionId in the payload) | `proteinBasis` = body_weight or fixed_grams.<br>Ratio 0.5–2 g/lb; fixed 50–400 g.<br>carbs = performance, balanced or lower_carbohydrate.<br>fat = sustainable_minimum, balanced or higher_fat.<br>**No calorie or gram macro targets.** | successor `protocolVersions` (one per local day) |
| Training | `operating-plan.training-strategy.save.v1` | Areas: arms, core, lower_body, back, chest, shoulders.<br>Counts 0–7 each, total ≥ 1.<br>At least one priority.<br>Progression = conservative, moderate or aggressive. | successor version. No schedule or priority regeneration. |
| Activity | Web `activateActivityProtocol` (create only) | Daily `active_kcal` 100–5000; weekly = daily × 7. **No edit, no steps, no cardio.** | protocol |
| Recovery and Tracking | `operating-plan.recurring-support.save.v1` (If-Match required) | `supportSchedule{frequency daily/weekly/specific_days/every_x_days, daysOfWeek, intervalDays, timing morning/afternoon/evening/specific, specificTime, startDate, endDate}`, `reminderPreference` remind or none, `notes` ≤ 1000 | `executionItems` (revision counter), `reminders` |
| Peptides | `peptide-support.save.v1` and `peptide-lifecycle.change.v1` | Schedule, dosingStrategy (stay, titrate_up, titrate_down, up_hold_down, custom), reminder, notes, `rewriteHistory`.<br>Pause/resume, with pause starting today or tomorrow. | `executionItems` and `scheduleSuspensions` (priorities suppressed while paused) |
| Supplements | `supplement-support.save.v1`, `supplement-strategy.save.v1` (create/edit), `supplement-lifecycle.change.v1` | Dose amount and unit, schedule, reminder, notes; name, purpose, role, goal; pause/restore | executionItems; protocol status |
| Coaching Updates | `operating-plan.coaching-updates.save.v1` (one atomic write) | Midweek/weekly enabled, day and time.<br>Monthly enabled and time (day fixed at 1).<br>Photos: interval 1–12 weeks or months, week of month, day, time, reminder.<br>Photo and DEXA event briefings.<br>DEXA: date later than today, time, reminders (week before, day before, morning of), upload reminder, prep note.<br>**`notificationPreference` is fixed; daily is not permitted.** | briefings and photo successors, photo reminder, `execution_next_dexa`; scheduler and Home cadence re-resolved in the transaction |

## Goal contract as stored

- **Body-fat guardrail**
  - Stored as **free text**: `goal.guardrails[].text`, e.g. "Maintain approximately 8–9% body fat."
  - V3 regex-parses it into `allowed_range` with derived severity bands (pressured ≥ 0.5× span, breached ≥ 1.5× span).
  - A second, frozen copy is `phaseStrategies[].domains.guardrailResponse.acceptedBodyFatRange`. DEXA narratives prefer it, so it can **diverge from the goal text after a goal edit**.
  - **There is no firm/flexible flag on guardrails.** `timeline.flexibility` exists, but V3 does not read it.
- **Phase completion**
  - fixed_duration, target_date and completion_criteria exist.
  - **No hybrid mode.**
  - Review checkpoints are `phaseReviewMilestone` and trajectory milestones with a fixed cadence, changeable only by an extension or by moving the DEXA date.
- **Energy**
  - Intake and activity targets are stored separately.
  - Activity is compared against Apple Watch **move/active calories, which already include workouts** (±10% tolerance, narrative only).
  - Net balance exists only as *observed* evidence (intake − (DEXA RMR + active)), never as a target.
  - There is no "added activity above baseline" or steps target anywhere.
- **Not exposed**
  - `goal.edit.v1`, `goal.transition.v1` and `protocol.edit.v1` are defined but absent from the Native allow-list.
  - The goal transition is a hard-coded one-off (`goal_visible_abs_at_rest` → Build Lean Mass).

## What this means for Goal Adaptation

1. **One coordinated approval needs a new Server coordinator** (roadmap Phase C, `GoalAdaptationCommitCoordinator`). It must write in one transaction:
   - the goal revision;
   - the phase change;
   - a new energy version;
   - optionally successor versions for the other strategies.

   Today every strategy commits on its own, and goal and phase edits are Web-only.
2. **Energy editing within adaptation is new.** It needs a new energy successor writer. The intake and activity fields already exist; the proposed "net balance" and "added activity" are derived *inputs* that resolve into those two stored fields. Here `activityExpenditureTarget` = usual baseline + added.
3. **Two structured contract changes are needed:**
   - a structured guardrail (range, strictness, effective period), which the Phase 0 contract already drafts;
   - a hybrid completion mode, expressed as `completion_criteria` plus a time-limit review milestone.

   They must also resolve the double-source guardrail divergence.
4. **Concept-only** (no backend today):
   - steps and cardio targets;
   - weekly activity distribution;
   - training split, schedule, volume, intensity and variants beyond Build 92 variant selection;
   - sleep and rest targets;
   - nutrition consistency targets;
   - carb and fat grams;
   - notification preferences;
   - DEXA unscheduling;
   - monthly day-of-month.
