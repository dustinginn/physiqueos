# Build 91 next batch: Operating Plan + DEXA routing (+ Peptides)

**Status: DESIGN READY. Implementation is on hold until the Founder's Build 90 workout review is in.**

## Translation and scope

- The family was Founder-locked end to end on 2026-10-04 in HTML harnesses: `89d05249`, `acafbd37`, `be04cfa8` and the finish-remaining package.
- This package translates those locks into **real SwiftUI** built from the app's own tokens and font (Plus Jakarta Sans).
- It uses the Priority-family tokens, because the locked Operating Plan boards share the Priority canvas (`#06121D` / `#F0EEE6`), not the `redesign*` canvas.
- Everything renders at the locked 402 pt width in Dark and Mineral Light.

## Boards

All boards are under `boards/`.

| Board | Content |
|---|---|
| `B91-OP-A1-dexa-routing-dark.png` | Next DEXA Scan states (scheduled, not scheduled, no Coaching Updates, load failed), plus the Coaching Updates editor opened at DEXA. Dark. |
| `B91-OP-A2-dexa-routing-mineral.png` | The same, in Mineral Light. |
| `B91-OP-A3-root-coaching.png` | The current Build 90 Operating Plan landing (simulator capture), the proposed root, and Coaching Updates detail. |
| `B91-OP-B-strategy.png` | Energy (read-only) and Nutrition strategy details. |
| `B91-OP-C-peptides.png` | Peptide domain (paused + active) and Retatrutide paused execution. |
| `B91-OP-D-tracking.png` | Tracking. |

**Renderer:** `Build91OperatingPlanDesignBoardTests` (appended to `PeptideScreenPresentationTests.swift`).
- The views are **test-target only**. The app target is unchanged.
- It is skipped unless `TEST_RUNNER_B91_BOARD_DIR` is set.

## DEXA appointment dead end: disposition and design (OP-A, first fix)

### Current behavior (verified at `32baf1d5`)

1. The Server Priority for DEXA carries href `/profile/operating-plan/execution/dexa`.
2. `ProductionDailyDriverAPI.destination(forActionHref:)` maps that href to `.operatingPlanDexaAppointment`.
3. In Founder Production, `OperatingPlanDexaAppointmentView` renders only `OperatingPlanUnavailableView("Manage your production DEXA schedule in Coaching Updates…")`. There is no action and no data. That is the dead end.

### Why it was believed to need the Server

The canonical DEXA schedule lives inside the **Coaching Updates** strategy (`CoachingUpdatesEditorReadModel.dexa`). Reading or editing it needs the Server-owned Coaching protocol id, and the Priority does not carry that id.

### Finding: the fix is Native-only

- The Server already gives Native that id.
- `OperatingPlanReadService.js:74` emits the Coaching Updates landing item with `href: getOperatingPlanStrategyHref("briefings", coaching.id)`.
- That item reaches Native as `.operatingPlanStrategy(strategyType: "briefings", strategyId: <id>)`, through the `operating-plan` resource Native already reads (`ProductionOperatingPlanAPI`).
- `coachingUpdatesAPI.fetchDetail(strategyId:)` then returns `editor.dexa`: `plannedDate`, `localTime`, `reminderPreferences`, `uploadReminder`, `preparationNote`, plus `dexaEventBriefingEnabled`.
- **No Server change, no new command, and no second write boundary are needed.**

### Design: production "Next DEXA Scan" page (replaces the dead end)

**Resolution:**
1. Read the `operating-plan` landing.
2. Take the single item whose destination is `operatingPlanStrategy("briefings", id)`.
3. Run `coachingUpdatesAPI.fetchDetail(id)`.
4. Render read-only from `editor.dexa`.

**States:**
- **Scheduled:** an appointment field showing date, time, Pacific Time and a relative day. Below it:
  - Reminders: 1 week / 1 day / morning of, and the upload reminder.
  - Preparation note.
  - DEXA Event briefing.
- **Not scheduled:** a "No DEXA scan scheduled" note, an optional "Last scan" row that links to Evidence → DEXA (from the existing DEXA history read), and a "Schedule DEXA Scan" button.
- **No active Coaching Updates:** the landing has no coaching item. Show an amber note and "Open Operating Plan". Never fabricate a record.
- **Load failed:** "Nothing was changed" and "Try Again".

**Actions:**
- **Edit DEXA Schedule** (primary) pushes the **existing** `operatingPlanStrategyEdit("briefings", id)` editor, opened at its DEXA section. The only new parameter is a Native scroll anchor.
- The Save is unchanged: the same atomic save, the same `expectedCurrentVersionId`, and a stale save still fails closed.
- **Open Coaching Updates** (secondary) opens the strategy detail.

**Coaching Updates detail (proposed addition, presentation only):** a "Scheduled Evidence" card with Next DEXA scan and Progress Photos cadence, read from the same detail payload. The Next DEXA row opens Next DEXA Scan.

**Back label:** the page shows the pushing page's title. From Priority that is the priority title, for example "DEXA tomorrow".

**Tests for implementation:**
- Map the landing to the coaching id (present, absent, and duplicate refusal).
- Pin each state's rendering.
- Assert the editor anchor scrolls to the DEXA section.
- Assert Save parity with the plain editor (same command payload).
- Priority journey: "View DEXA Appointment" → Next DEXA Scan → Edit → Save → back.
- Sandbox keeps its current editor.

**Optional later Server improvement (not required):** the Server could emit the Coaching strategy href directly on the DEXA Priority, which saves one read. This is deferred; nothing depends on it.

## Operating Plan checkpoints (proposed implementation order)

| CP | Scope | Boards | Behavior notes |
|---|---|---|---|
| **OP-A** | Root (one title, Try Again), Coaching Updates detail + editor DEXA anchor, **Next DEXA Scan** | A1–A3 | DEXA dead-end fix lands first |
| **OP-B** | Energy (read-only), Nutrition, Training details + both editors; Training builder unavailable copy | B | Editors keep the exact option sets, `expectedCurrentVersionId`, and the "This strategy was not saved. Refresh before retrying." error |
| **OP-C** | **Peptides**: domain (paused/active, 44 pt Manage/Resume), execution (Dose/Days/Time/Notes sheets, Reminder, Pause/Resume, Advanced plan, dose history); Recovery support; Supplement support/edit | C | Preserves Build 70 pause/resume semantics, `PEPTIDE_PLAN_REWRITES_HISTORY` refusal, Restore-only paused supplements |
| **OP-D** | Tracking + Tracking support | D | Completion stays evidence-owned (no manual check-off) |

## Peptides status

| Aspect | State |
|---|---|
| **Behavior** | Simplified editor + Pause/Resume shipped in Build 70 (Server `b94ab533` lineage, Native `754376c5`). Priority skip for peptides is live (Server `2d967e48`). |
| **Peptide Priority Detail** | Dose-aware and paused, redesigned in Build 89 (Lane A). Its "Go to …" opens the legacy peptide execution page (#78). |
| **Visual** | Domain, execution page, sheets and dose-plan editor are still legacy (#77–#79). They are designed (locked `acafbd37`) and the SwiftUI translation boards are in OP-C. |
| **Remaining feedback** | Earlier simplification feedback is reflected in the lock: one card per peptide, Manage + Resume, no separate history page, Advanced collapsed. No new Founder peptide feedback was found after Build 70. Re-check during tomorrow's review. |

## Not changed by this package

- No app-target source.
- No routes.
- No Server.
- No production data.
