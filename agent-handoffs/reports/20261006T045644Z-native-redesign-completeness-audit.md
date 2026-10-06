# PhysiqueOS Native redesign completeness audit: full production surface inventory

- Task id: `native-redesign-completeness-audit-20261006`
- Prompt: `agent-handoffs/inbox/prompts/20261006T050500Z-native-redesign-completeness-audit.md` @ `5e5f4be1`
- Agent: Claude (Remote Control chat, high reasoning), **read-only audit**
- Native authority audited: `96e724a9f40f9178a16ea492958c3acd4b1b282e` (Build 88 = `7fce3b97` = `96e724a9` + build-number bump; delivery `43fda86b` VALID per `20261006T044525Z-build88-testflight-valid.md`)
- Production Server: `b7eb1e39` / deployment `6fa4e887` (not touched)
- Generated: 2026-10-06T04:56:44Z

Nothing was edited, committed, built, archived, uploaded or deployed. No source, Server, TestFlight or production state was touched. The Build 88 release lane, its branch and its archive were left alone. This report is published on its own and does **not** replace `latest.json` / `latest.md`, which still point at Build 88.

---

## OUTPUT 2: Executive answer (read this first)

**Is Build 88 the complete redesign? No.**

Build 88 is complete for the three families that were implemented:
- Batch 1: Home root, Goals, You.
- Batch 2: Log and Training Logger, including Workout Match.
- Batch 3: Evidence Hub, Timeline, Training, Activity, Nutrition, Weight, Progress Photos, DEXA, Add Evidence and generic Review.

Several other families have Founder-locked designs (all locked 2026-10-04, and the program was declared "DESIGN COMPLETE" in `P:20261004T220500Z`) with **no implementation commit**. They still render on the pre-redesign presentation, adapted to Dark / Mineral Light only through the shared appearance tokens from `5d727b37`:

1. **All Briefings:** Weekly, Midweek, Monthly, Photo, DEXA, Briefing Detail chrome and Briefing History.
2. **The entire Operating Plan family**, including the Peptide, Supplement, Recovery-support and Tracking editors.
3. **Priority Detail for every type except Foam Rolling.**
4. **Daily capture:** Morning Check-In, manual/backdated weight, and the Home Confidence sheet.
5. **Two Evidence verticals Batch 3 never covered:** Energy and Recovery/Sleep.
6. **Extensions:** Home Screen Widget, Live Activity / Dynamic Island, and Watch utility translations.

**Inventory size:** 96 production-reachable iPhone surface/state rows (Founder Production; rows #3-#5 are conditional states the Founder may rarely or never hit; row numbering has gaps), plus 11 Watch screens. Sandbox / dead / debug / test items are listed separately in the class G table and are not counted.

| Class | Meaning | iPhone count |
|---|---|---:|
| A | Redesigned + Founder accepted (physical) | 8 |
| B | Redesigned, in Build 88, physical acceptance pending | 33 |
| C | Intentionally retained | 6 |
| D | Partially redesigned (old child states inside a redesigned parent) | 10 |
| E | Not yet redesigned (locked design exists, no implementation) | 38 |
| F | Product/feature work, not redesign debt | 1 |
| **Total** | | **96** |

Watch (separate inventory): 11 screens. The shipping design is functionally accepted. A Founder-locked **utility visual translation** (Oct 4) is not implemented, so all 11 count as low-priority visual redesign debt. Three functional follow-ups are tracked separately and are not redesign debt.

### Surfaces that still need redesign (D + E)

Rows are numbered as in the master matrix.

- **Briefings (E):**
  - Briefing Detail chrome/states (#67)
  - Weekly (#68)
  - Midweek (#69)
  - Monthly (#70)
  - Photo event (#71)
  - DEXA event (#72)
  - Briefing History (#73)
- **Operating Plan (E):**
  - landing (#74)
  - strategy detail (#75)
  - strategy editors (#76)
  - protocol domain (#77)
  - Peptide execution (#78)
  - Peptide sheets and dose editor (#79)
  - Recovery support (#80)
  - Tracking (#81)
  - Tracking support (#82)
  - Supplement support (#83)
  - Supplement edit (#84)
  - Training builder unavailable state (#85)
- **Priority Detail (E):**
  - generic (#10)
  - peptide dose-aware and paused (#11)
  - supplement (#12)
  - Morning Weigh-In (#13)
  - Photos/DEXA evidence-driven (#14)
  - completed / skipped / terminal states and the Skip dialog (#15)
- **Daily capture (E):**
  - Morning Check-In (#16)
  - manual/backdated weight (#17)
  - Home Confidence sheet (#7)
- **Evidence (E):**
  - Energy root and charts (#61)
  - Energy weekly/daily sheets (#62)
  - Recovery root (#63)
  - Sleep Trends (#64)
  - Night Detail (#65)
  - All Nights sheet (#66)
- **Extensions (E):**
  - Widget small (#98)
  - Widget large (#99)
  - Live Activity Lock Screen (#100)
  - Dynamic Island (#101)
- **Partial (D):**
  - Today's Priorities tiles and the morning grouped card (#2)
  - older Home briefing cards (#3)
  - additional-goals card (#4)
  - no-goal Home hero fallback (#5)
  - Home loading/failed/notice states (#6)
  - Logger leftover states: load failure, toolbar Save & Leave, spinners, confetti colors (#33)
  - Workout Match in-flight/failed/terminal states and back label (#35)
  - DEXA PDF sheet (#55)
  - intake date sheet (#59)
  - Training Session supporting-media placeholder states (#41a)

### Surfaces that need only physical acceptance (B)

All 33 B rows in the matrix:
- the Home root corrections;
- Foam Rolling Priority Detail;
- every Log/Logger state;
- Workout Match (pending and resolved);
- every Batch 3 Evidence surface;
- intake and generic Review.

**Progress Photos** (#51-#53, #57) carries the specific outstanding acceptance item: real Founder media has never been validated. The Founder chose synthetic fixtures for review. That is acceptance debt, not redesign debt.

### Intentionally retained (C)

| # | Surface | Basis |
|---|---|---|
| 23 | Goal Detail legacy fallback layout and Goal Plan page | Cov G08 |
| 86 | Operating Plan status route | Cov O11 |
| 93 | DEXA to Apple Health writeback toggle plus Sep 12 validation controls on You | Cov Y09 |
| 95 | Founder device connection (pairing, reconnect, authority picker) | Cov Y07 |
| 96 | Sleep canary / validation / import plus Network Diagnostics | Cov Y08 |
| 97 | Training Reporting "Foundation" placeholders for 4 report ids | Locked as "intentional Foundation placeholders" (Cov E06) |

Training Reporting is a child of a B surface, so it is counted once, here.

The C basis for #23, #86, #93, #95 and #96 is the 2026-10-04 design-coverage audit's "do not redesign" class. The orchestrator adopted it and the Founder then accepted the final design batches on top of it. **No direct Founder quote** retaining these specific engineering surfaces was found; this is recorded conservatively.

### Previously suspected gaps

**Actually complete:**
- Goals root and all Goal subpages: physically accepted on Build 87.
- You / Settings / Appearance: physically accepted on Build 87.
- Log root and the entire Logger, including supersets, review/finish, recap and PR celebration.
- Workout Match (pending and resolved).
- All Evidence verticals in Batch 3 scope, including their Show All sheets.
- Evidence intake (generic, Photos, DEXA) and generic Review.
- The Progress Photos inspector.

**Confirmed NOT complete:**
- **Weekly/Monthly briefings.** Every briefing file is unchanged since before the redesign. Weekly's section order differs from the locked order: Body Composition is not under Weight, there is no Recovery section, and there is no Weight graph. The Coach card is a fixed dark-purple gradient in both appearances.
- **Energy.** Fully old, not "redesigned except the chart overlay": page, header, cards, both charts, both sheets and the loading/error states. Its content and hierarchy already match the locked layout; only the visual implementation is missing.

---

## Method

The inventory was derived from code, not from memory:

1. **Root and shell:** `PhysiqueOSApp`, `RootTabView` (5 tab stacks, tab-select Logger redirect, `onOpenURL` for widget and Live Activity, notification deep-link consumption), and `AppDestinationRouterView` (every `AppDestination` case, including authority-gated and fall-through branches).
2. **Presentations:** every `.sheet`, `.fullScreenCover`, `.confirmationDialog`, `.alert`, `NavigationLink(value:)` and nested `.navigationDestination` (grep across the app).
3. **Production push sources:** the Server-provided `destination` values from Home, Log and Evidence read models, priority notifications, evidence-review and briefing-ready notifications, Home widget routes, Live Activity URLs and App Intents.
4. **Grammar check per surface** against what the redesign actually uses:
   - `PhysiqueOSTheme.redesign*` with `LogType` / `LoggerType` (Batch 1/2);
   - the EvidenceKit / Workflow kit (Batch 3);
   - versus the legacy `background` / `surfaceElevated` / `textPrimary` / `accent`, `CardContainer`, `SectionHeading`, `PrimaryActionButton`, `StatusChip` and `PhysiqueOSTypography`.
   Dynamic color alone is **not** counted as redesign: the global appearance commit `5d727b37` made every legacy token adapt to Dark and Mineral Light.
5. **Git history:** `git log` per file between Build 86 (`cec8af20`) and `96e724a9`. Commit `cf00c234` (2026-09-30) is the bulk import of Native history into this tree; a file whose only history is that commit was never restyled.
6. **Acceptance evidence:** handoff reports and Founder prompts on `origin/main`. Only explicit Founder accept/lock statements were counted; tests passing was never treated as acceptance.
7. **Cross-check:** against the 2026-10-04 design-coverage matrix (`SURFACE-COVERAGE-MATRIX.tsv` in the `app-wide-redesign-coverage-audit-20261004` artifacts folder, 98 design groups).

Five read-only sub-audits ran in parallel: handoff evidence ledger; Home / Briefings / Priority; Goals / Operating Plan; Evidence; Log / You / Watch / Widget / Release seams. Load-bearing claims were spot-verified directly, including:
- the Build 87 acceptance quotes;
- the Workout Match `default: actionSection` fall-through;
- Energy's legacy `chartScrub`;
- Sandbox being selectable in Release;
- the Watch/Live Activity lock wording.

**Limitation:** no simulator rendering was performed. The shared Mac was under sustained load (≈12-15), and every conclusion here is decidable from source plus git history. Runtime-only inferences are marked "inferred".

**Prefix key:**
- `R:` = `agent-handoffs/reports/`
- `P:` = `agent-handoffs/inbox/prompts/`
- `Cov` = the 2026-10-04 design-coverage matrix row ids

**Appearance column key:**
- ✓ = redesigned target implemented and captured in that appearance (simulator review package or physical acceptance);
- ~ = legacy presentation that only adapts its colors through shared tokens;
- dark-only = platform dark-only surface.

---

## OUTPUT 1: Master surface matrix

### Home

| # | Surface | Production route | Source / view | Class | Redesign authority / evidence | Dark | Mineral | Physical acceptance | Notes / remaining action |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Home root, loaded state: header, journey field (trajectory, goal, phase, Guardrail, confidence ring), action + Latest Briefing strip, Today's Priorities card shell | Home tab | `HomeView`, `HomeHeaderView`, `HomeJourneyFieldView`, `HomeActionBriefingStrip`, `TodaysFocusCardView` shell | B | `c4a74ad0`; corrections `49733300` / `49e48f1e`; identifier fix `b1488c2e`. Build 87 physical: "Home: accepted except for exactly three small parity defects" (P:20261005T040000Z). Corrections accepted on simulator (P:20261005T045500Z) | ✓ | ✓ | Pending for the corrections (first shipped in Build 88) | Verify the briefing-tile truncation fix, "4 weeks" remaining, and the Phase 2 date line on device |
| 2 | Today's Priorities tiles and morning grouped session card | Home, inside #1 | `FocusTileView`, `SessionPriorityCardView` (`TodaysFocusCardView.swift:61-130`) | D | Card shell redesigned in `c4a74ad0`; tiles still use legacy `item.color.background` and `textPrimary` / `textMuted` (`FocusTileView.swift:93,109,113`); the grouped card is fully legacy (`surfaceElevated`, `IconBadge`, `StatusChip`) | ~ | ~ | n/a | P2: finish the tile internals and the grouped card against the Home lock |
| 3 | Older briefing cards (index ≥1) | Home, when more than one briefing card exists | `BriefingCardView` | D | Legacy `CardContainer` + `SectionHeading` eyebrow, which the locked Home explicitly removed from the latest tile | ~ | ~ | n/a | P2: either restyle or drop, since the locked Home shows one Latest Briefing button. Two presentations of the same concept appear on one page |
| 4 | Additional goals card (2+ goals) | Home, multi-goal only | `GoalsCardView` / `GoalRowView` | D | Legacy `CardContainer` + `SectionHeading("Your Goals")` | ~ | ~ | n/a | P2: conditional; the Founder currently has one primary goal (inferred) |
| 5 | No-goal hero fallback | Home, when `home.goals` is empty (future user) | `HomeHeroCardView` | D | Legacy `CardContainer` + `SectionHeading("Trajectory")` | ~ | ~ | n/a | P2: future-user path, and it overlaps Beta #5 (first-user setup) |
| 6 | Home loading / failed / reconnect, `LastKnownHomeNotice`, `NotificationsDisabledNotice`, completion-failure alert | Home states | `HomeView.swift:190-208, 339-381` | D | Legacy spinner tint, system 14pt text, `PrimaryActionButton`, `CardContainer` notice. Cov H04/H05 = "inherit locked Home" | ~ | ~ | n/a | P2: map to the locked Home state treatment. The alert is system-owned and fine |
| 7 | Home Confidence sheet (shared with Goal Detail legacy fallback) | Home confidence ring | `ConfidenceDetailSheet` | E | Locked in Final Design Batch 2 (R:20261004T212411Z; accepted P:20261004T213500Z); no implementation commit | ~ | ~ | n/a | P1: daily-capture family. The redesigned Home ring opens a legacy sheet |

### Priority Detail and daily capture

| # | Surface | Production route | Source / view | Class | Redesign authority / evidence | Dark | Mineral | Physical acceptance | Notes / remaining action |
|---|---|---|---|---|---|---|---|---|---|
| 9 | Priority Detail: Foam Rolling (all its states) | Home priority tile / notification → `priorityDetail` / `priorityOccurrence` | `PriorityDetailView.foamRollingContent` | B | Pilot `b65deb00`; "already accepted Foam Rolling Priority Detail implementation pilot" (P:20261004T210500Z) | ✓ | ✓ | Pending (no physical statement found) | Uses a private hex palette instead of the shared `redesign*` tokens, so a family implementation should migrate it. The no-sections fallback card is legacy |
| 10 | Priority Detail: generic / reminder | same | `PriorityDetailView` (non-Foam path) | E | Family locked (R:20261004T181549Z, P:20261004T193500Z); not implemented. Uses `background`, `screenTitle`, `CardContainer` + `SectionHeading`, legacy `PrimaryActionButton` | ~ | ~ | n/a | P1 |
| 11 | Priority Detail: peptide dose-aware, "Took a different amount?", paused peptide → "Go to …" | same | same | E | Locked, including the Tesamorelin single Preparation section; not implemented | ~ | ~ | n/a | P1. The paused card pushes legacy Operating Plan Peptide execution (#78) |
| 12 | Priority Detail: supplement | same | same | E | Locked; not implemented | ~ | ~ | n/a | P1 |
| 13 | Priority Detail: Morning Weigh-In (incl. completed related-weight card) | same | same | E | Locked; not implemented | ~ | ~ | n/a | P1. `morningWeightCard` is dead code because `morningCheckIn` is never assigned |
| 14 | Priority Detail: Progress Photos / DEXA evidence-driven | same | same | E | Locked; not implemented | ~ | ~ | n/a | P1. Open ledger delta: Native maps only `/check-in/morning` and the Foam setup href (`ProductionDailyDriverAPI.swift:1217-1223`), so these show no action button |
| 15 | Priority Detail: completed / skipped / failed / not-found, plus Mark Skipped `confirmationDialog` | same | same | E | Locked terminal templates (Cov P04); not implemented | ~ | ~ | n/a | P1 |
| 16 | Morning Check-In (weight, unfinished-priority dispositions, notes, reconciling) | Home tile / priority notification / Priority "Log Weight" → `checkIn(morning*)` | `MorningCheckInView` (`Logging/ManualWeighInView.swift:3-305`) | E | Locked in Final Design Batch 2; not implemented. Legacy `CardContainer`, `.borderedProminent` with `.orange`, `TextEditor` on `surfaceMuted` | ~ | ~ | n/a | **P1, highest frequency.** Evidence-recovery and briefing-reconciliation cards are Sandbox-only |
| 17 | Manual / backdated weight | Log "Log weight for another date"; intake Weight handoff → `manualWeighIn` | `ManualWeighInView` (:307-421) | E | Locked in Final Design Batch 2; not implemented | ~ | ~ | n/a | P1. A redesigned Log doorway and a redesigned intake both lead into a legacy form |

### Goals

| # | Surface | Production route | Source / view | Class | Redesign authority / evidence | Dark | Mineral | Physical acceptance | Notes / remaining action |
|---|---|---|---|---|---|---|---|---|---|
| 18 | Goals root (active field card, completed cards, Add Goal card) | Goals tab; You → Goals switches tab | `GoalsView` | A | `c4a74ad0`; "Goals root + all Goal subpages: ACCEPTED" (Build 87 physical, P:20261005T040000Z) | ✓ | ✓ | Done | Grammar note, not reopening: completed-card text and loading/failed states still use legacy tokens. The always-visible Add Goal card shows engineering copy "Founder Production is read-only." (`ProductionDailyDriverAPI.swift:407`), which belongs to Beta #5 |
| 19 | Active Goal Detail (Active Goal V3 sections) | `goalDetail` from Goals / Home journey | `GoalDetailView` (`ActiveGoalCurrentStateSections`) | A | As #18 | ✓ | ✓ | Done | Grammar note: `c4a74ad0` gave the canvas and card gradients redesign tokens; text, section headers, `GoalEvidenceCard` and `GoalNavigationButton` stay legacy. Accepted as is, so do not reopen |
| 20 | Completed Goal (Visible Abs, first/final photos) | `goalDetail` (completed) | `CompletedGoalDetailView` | A | As #18; photo tile intentionally not tap-to-expand (P:20261004T190501Z) | ✓ | ✓ | Done | — |
| 21 | Phase detail (current and completed) | `goalPhase` from the journey | `GoalPhaseDetailView` | A | As #18 | ✓ | ✓ | Done | Only the canvas changed (4 lines); the body is `CardContainer`. Accepted |
| 22 | Goal loading / unavailable / failed | Goal states | `GoalUnavailableView` | A | Included in the locked Goals package (Cov G05) and accepted with "all Goal subpages" | ✓ | ✓ | Done | Plain-text unavailable view |
| 23 | Goal Detail legacy fallback layout and Goal Plan page (+ Confidence sheet entry) | Only if V3 `currentState` fails to decode → `goalPlan` | `GoalDetailView.swift:91-114`, `GoalStrategyView` | C | Cov G08 "do not redesign" (adopted by orchestrator; no direct Founder quote) | ~ | ~ | n/a | Defensive fallback. Whether the Founder ever hits it is unverified (expected never) |

### Log / Logger / Workout Match

| # | Surface | Production route | Source / view | Class | Redesign authority / evidence | Dark | Mineral | Physical acceptance | Notes / remaining action |
|---|---|---|---|---|---|---|---|---|---|
| 24 | Log root: Compact Command Center, Logged Today 2×2, pending/processing bands, Sources disclosure, Upload card | Log tab | `LogView`, `LoggedTodayCardView`, `PendingEvidenceReviewsCardView`, `UploadCardView`, `TrainingLoggerCardView` | B | CP1 `b540b323`, tap fix `bb6a6584`; "Checkpoint 1 — Log root: accepted" (P:20261005T132000Z) | ✓ | ✓ | Pending | Tiles push Batch 3 pages (Training Day = "Training Today" incl. cardio lines; Activity Day; Nutrition Day; Weight) |
| 25 | Logger entry: no draft, saved workouts, Log Past Workout | `trainingLogger` (Log card, Log-tab redirect, widget, Live Activity) | `TrainingLoggerView` entry | B | CP3 `6d79f057`; CP3 accepted | ✓ | ✓ | Pending | — |
| 26 | Area selection, exercise picker (My Library / All / search), Create Exercise, Add Exercise mid-workout | inside Logger | `TrainingLoggerView` | B | CP3 `6d79f057` | ✓ | ✓ | Pending | — |
| 27 | Active workout set entry: all set types incl. timed, Done checkbox, exercise menu, rest preference menu, Save & Leave, sticky Finish | inside Logger | `TrainingLoggerView`, `TrainingRestPreferenceMenu` | B | CP2 `0d59b45e` (+ Done correction); CP2 accepted. Larger Done checkbox is a Founder retention | ✓ | ✓ | Pending | No phone rest timer by design; rest shows on the Live Activity and Watch |
| 28 | Supersets (labels, Superset / variant / substitute menus) | inside Logger | `TrainingLoggerView` | B | CP2 / L8; superset context `cd06bfea` | ✓ | ✓ | Pending | Menus are system menus |
| 29 | Workout Review, Final Confirmation, saving / still-saving / Retry, cancel and discard alerts | inside Logger | `TrainingLoggerView` | B | CP4 `7a422a98`; CP4 accepted | ✓ | ✓ | Pending | Alerts are system-owned |
| 30 | Workout Complete recap | inside Logger | `WorkoutCompleteConfirmation` | B | CP4; Watch-finish recap parity `cd06bfea` | ✓ | ✓ | Pending | — |
| 31 | New records (PR) card + confetti | inside Logger | `NewPerformanceRecordsCard`, `ConfettiBurst` | B | CP4; confetti one-time / Reduce Motion retained (P:20261005T132000Z) | ✓ | ✓ | Pending | Confetti colors use legacy chart tokens (P3, see #33) |
| 33 | Logger leftover states: load-failure text, toolbar "Save & Leave", loading spinners, confetti palette | inside Logger | `TrainingLoggerView.swift:52,59,74-75,1600,1755-1758` | D | Legacy `accent` / `PhysiqueOSTypography` / `textSecondary` | ~ | ~ | n/a | P3 polish. `actionCard` (:1694-1702) is dead code |
| 34 | Workout Match: pending candidates and resolved | Log pending band / review-ready notification → `evidenceReview` (workoutReconciliation) | `EvidenceReviewDetailView.workoutMatchScroll` | B | CP5 `79a1a33d`; "Checkpoint 5 — Workout Match L13: accepted" | ✓ | ✓ | Pending | — |
| 35 | Workout Match: confirming / refresh-required / still-processing / failed / dismissed states, plus "← Back" label | same | `EvidenceReviewDetailView.swift:272-276` → legacy `actionSection` (:585-716); back label :88-99 | D | `default: actionSection(for:)`, commented "keep their existing canonical presentation" (deliberate in code; no Founder retention quote found). Legacy `CardContainer` + `PrimaryActionButton` appear in the middle of a redesigned flow | ~ | ~ | n/a | P2: bundle with the Logger owner |

### Evidence

| # | Surface | Production route | Source / view | Class | Redesign authority / evidence | Dark | Mineral | Physical acceptance | Notes / remaining action |
|---|---|---|---|---|---|---|---|---|---|
| 37 | Evidence Hub | Evidence tab | `EvidenceView`, `EvidenceStreamRowView` | B | CP-A `b2440d37` / `ce5c7dd8`; reliability `9fa2428c`; "Checkpoint A … ACCEPTED and locked" (P:20261005T160000Z) | ✓ | ✓ | Pending | Health Metrics hidden; Timeline last |
| 38 | Timeline | Hub → `progressStream(timeline)` | `TimelineView` | B | CP-A | ✓ | ✓ | Pending | Rows not tappable (locked) |
| 39 | Training landing + Show All history sheet | Hub → `progressStream(training)` | `TrainingHistoryView`, `TrainingHistorySheet` | B | CP-B `7b1cd96e`, icons `8aa2d00b`, `fc693aeb`; "Checkpoint B … ACCEPTED and locked" (P:20261005T200000Z) | ✓ | ✓ | Pending | Disclosure row "Future protocol settings: Coming soon" (:240) |
| 40 | Training Day ("Training Today" from Log) | `trainingDay` | `TrainingDayView` | B | CP-B | ✓ | ✓ | Pending | — |
| 41 | Training Session detail (+ correction editor) | `trainingSession` | `TrainingSessionDetailView` | B | CP-B | ✓ | ✓ | Pending | — |
| 41a | Session supporting-media placeholder states (loading / retry / unavailable) and keyboard Done | inside #41 | `TrainingSupportingMediaImage` (:346-369), :44 | D | Legacy `ProgressView` + `PhysiqueOSTheme` | ~ | ~ | n/a | P3 |
| 42 | Exercise detail (performance records) | `trainingExercise` | `TrainingExerciseDetailView` | B | CP-B | ✓ | ✓ | Pending | Integrity: the "Training" breadcrumb pushes a new landing instead of popping |
| 43 | Training Library root / Area | `progressStream(training/library)`, `trainingLibraryArea` | `TrainingLibraryRootView`, `TrainingAreaView` | B | CP-B (all 10 areas) | ✓ | ✓ | Pending | — |
| 44 | Training Reporting (6 ids) + 2 sheets | `progressStream(training/reporting/*)` | `TrainingReportingView` | B | CP-B | ✓ | ✓ | Pending | Cardio / volume / frequency / consistency bodies are row #97 |
| 97 | Training Reporting "Foundation" placeholder bodies (cardio / volume / frequency / consistency) | inside #44 | `EvidencePlaceholder` (`TrainingReportingView.swift:55`) | C | Locked "including intentional Foundation placeholders" (Cov E06) | ✓ | ✓ | n/a | Product capability later; not redesign debt |
| 45 | Activity landing + Show All sheet | `progressStream(activity)` | `ActivityHistoryView` | B | CP-B | ✓ | ✓ | Pending | — |
| 46 | Activity Day | `activityDay` | `ActivityDayView` | B | CP-B | ✓ | ✓ | Pending | — |
| 47 | Nutrition landing + Show All sheet | `progressStream(nutrition)` | `NutritionHistoryView` | B | CP-C `5f6db645` / `5c296d9e`, macro `75160ae8`; "Checkpoint C … ACCEPTED and locked" | ✓ | ✓ | Pending | — |
| 48 | Nutrition Day | `nutritionDay` | `NutritionDayView` | B | CP-C | ✓ | ✓ | Pending | — |
| 49 | Nutrition Reporting (calories / macros / meals) + sheet | `progressStream(nutrition/reporting/*)` | `NutritionReportingView` + Row/Chart views | B | CP-C, incl. chart-gesture correction | ✓ | ✓ | Pending | — |
| 50 | Weight | `progressStream(weight)` | `WeightHistoryView` | B | CP-C | ✓ | ✓ | Pending | — |
| 51 | Progress Photos history | `progressStream(photos)` | `PhotosHistoryView` | B | CP-D `9d2d0e06`; "VISUALLY ACCEPTED and locked" (P:20261005T221500Z); A–E approved (P:20261006T001500Z) | ✓ | ✓ | **Pending: real Founder media never validated** | Acceptance debt, not redesign debt |
| 52 | Photo set detail (sheet and route) | Photos sheet / `photoSetDetail` | `PhotoEvidenceDetailSheet`, `PhotoSetDetailView` | B | CP-D | ✓ | ✓ | Pending (real media) | — |
| 53 | Photo inspector, Evidence (record chrome) | Photo set → full-screen | `PhotoInspectionViewer(chrome: .record)` | B | CP-D | ✓ | ✓ | Pending (real media) | The `.standard` chrome is used by Photo Briefing (#71) |
| 54 | DEXA history, trends, Since Prior Scan, writeback | `progressStream(dexa)` | `DEXAHistoryView`, `DEXAChartViews` | B | CP-D `9d2d0e06`, `ce9dd214`; DEXA lock `f208007c` | ✓ | ✓ | Pending | — |
| 55 | DEXA BodySpec PDF sheet | DEXA → `.sheet(item:)` | `DEXAPDFSheet` (`DEXAHistoryView.swift:616-653`) | D | Only history is `cf00c234`: system nav title, system Done, `PhysiqueOSTheme.background` | ~ | ~ | n/a | P2 / P3: small |
| 56 | Add Evidence: generic (screenshots, photos, PDFs, files, notes, manual) | Log Upload card → `evidenceIntake` (Founder Production) | `ProductionEvidenceUploadView` | B | CP-E `ce9dd214` / `44609af1`; A–E Founder-approved (P:20261006T001500Z) | ✓ | ✓ | Pending | Weight handoff opens the legacy `ManualWeighInView` (#17) |
| 57 | Add Evidence: Progress Photos intake | Home photos tile / `photoUpload` | `ProductionEvidenceUploadView(.progressPhotos)` | B | CP-E | ✓ | ✓ | Pending (real media) | — |
| 58 | Add Evidence: DEXA intake | `dexaUpload` | `ProductionEvidenceUploadView(.dexa)` | B | CP-E | ✓ | ✓ | Pending | — |
| 59 | Intake date sheet | intake date row | `WorkflowDateRow` (`EvidenceWorkflowKit.swift:688-710`) | D | Workflow tint/background, but a system nav bar and a Today button that is never disabled | ✓ partial | ✓ partial | n/a | P3 |
| 60 | Generic Evidence Review (Nutrition / DEXA / Photo / text / mixed; correct / confirm / dismiss + alert) | Log pending band / notification → `evidenceReview` | `EvidenceReviewDetailView` generic Workflow path | B | CP-E; macro `75160ae8` | ✓ | ✓ | Pending | Legacy header / items / DEXA body (:143-151, :320-578) is dead code |
| 61 | **Energy root + both charts** | Hub → `progressStream(energy)` | `EnergyHistoryView`, `EnergyChartViews` | E | Locked `1f8ba1b9` + correction `a21296ec` ("Founder approved the corrected Energy, Weight and Recovery designs", P:20261004T193501Z). No implementation; only history is `cf00c234`. Legacy back button, `IconBadge` header, `TrainingScopeSelectorView`, `CardContainer` cards, **legacy `.chartScrub`** (:105, :163) | ~ | ~ | n/a | P1 (+ the P0 gesture). Content and hierarchy already match the lock |
| 62 | Energy Weekly History and Recent Daily Show All sheets | Energy → sheets | `EnergyHistoryView.swift:204-280` | E | As #61 | ~ | ~ | n/a | P1. "Nutrition Day" link opens the Nutrition **landing** (web parity, label mismatch); back trail inside reads "‹ Evidence Hub" (inferred) |
| 63 | **Recovery root** (Last Night, See Trends, Recent Nights) | Hub → `progressStream(recovery)` | `RecoveryEvidenceView` | E | Locked (P:20261004T193501Z); not implemented. Last change `cec8af20` (sheet appearance fix only). Custom "← Evidence Hub", `CardContainer`, legacy scope selector | ~ | ~ | n/a | P1 |
| 64 | Sleep Trends (incl. Continuity) | Recovery → `progressStream(recovery/sleep/trends)` | `RecoverySleepTrendsView`, `SleepEvidenceCharts` | E | Locked; Continuity "lighter analytical point/line" is an open delta (Awake is still a `BarMark`) | ~ | ~ | n/a | P1 |
| 65 | Night Detail | Recovery / Trends / All Nights → night stream | `RecoverySleepNightView` | E | Locked; not implemented | ~ | ~ | n/a | P1. Back label hard-coded "Recovery" |
| 66 | All Nights sheet | Recovery / Trends → sheet | `RecoverySleepNightsSheet` | E | Locked; not implemented | ~ | ~ | n/a | P1 |

### Briefings

| # | Surface | Production route | Source / view | Class | Redesign authority / evidence | Dark | Mineral | Physical acceptance | Notes / remaining action |
|---|---|---|---|---|---|---|---|---|---|
| 67 | Briefing Detail chrome and states (Home / History pills, loading, unavailable, not-ready + Check Again, failed, revision banner) | Home strip, older cards, History, briefing-ready notification, Photos "Read Photo Briefing" → `briefingDetail` | `BriefingDetailView`, `BriefingPresentation.swift` | E | Recurring family locked (P:20261004T153500Z, P:20261004T183500Z); no Briefings commit since Build 86. Failed state is unstyled `Text` + `.borderedProminent` | ~ | ~ | n/a | P1 |
| 68 | Weekly | `briefingDetail` (weekly) | `WeeklyBriefingSections` | E | Locked (R:20261004T050702Z, R:20261004T055906Z). Current order Energy → Weight → Photos → Training → Body Comp vs locked Hero → Energy → Weight → Body Comp → Training → Recovery → …; no Weight graph; no Recovery; Coach finale fixed purple gradient `0x6D28D9→0x4338CA` in both appearances | ~ | ~ (finale not adaptive) | n/a | P1. Energy chart uses the legacy scrub (vertical swipe trap, P0) and its `selectedDate` readout is never read. Do not change content or order semantics; the lock is design-only, and Recovery enters only after the 14-night rule |
| 69 | Midweek | `briefingDetail` (midweek) | `MidweekBriefingSections` | E | Locked (R:20261004T042528Z, R:20261004T045100Z) | ~ | ~ | n/a | P1. Reuses `WeeklyEnergyCard`, so it inherits the gesture defect. A `recovery` module falls to `EmptyView`, which is correct while Sleep is withheld from Midweek |
| 70 | Monthly | `briefingDetail` (monthly) | `MonthlyBriefingSections` | E | Locked (R:20261004T152309Z + correction R:20261004T170000Z) | ~ | ~ | n/a | P1. Energy Evolution is intentionally static (no scrub), so the reports' "Monthly overlay" label is inaccurate |
| 71 | Photo event briefing (+ standard full-screen photo viewer) | `briefingDetail` (photo); Photos "Read Photo Briefing" | `PhotoBriefingSections`, `PhotoInspectionViewer(.standard)` | E | Locked (R:20261004T170000Z); paired Previous/Current viewer is an open ledger delta | ~ | ~ | n/a | P1 |
| 72 | DEXA event briefing | `briefingDetail` (dexa) | `DEXABriefingSections` | E | Locked (R:20261004T170000Z) | ~ | ~ | n/a | P1 |
| 73 | Briefing History | Detail pills; Home action tile (Server `briefing.list`) → `briefingList` | `BriefingHistoryView` | E | Locked in Final Design Batch 2; not implemented | ~ | ~ | n/a | P1 |

### You / Settings / Sources

| # | Surface | Production route | Source / view | Class | Redesign authority / evidence | Dark | Mineral | Physical acceptance | Notes / remaining action |
|---|---|---|---|---|---|---|---|---|---|
| 89 | You root | You tab | `YouPlaceholderView` | A | `c4a74ad0`; "You / Settings: ACCEPTED" (Build 87 physical); full-row tap fix `bb6a6584` accepted at CP1 | ✓ | ✓ | Done (tap fix pending on device) | Status card always says "Your system is connected." even in Sandbox / unpaired (copy correctness, not design) |
| 90 | Settings | You → `settings` | `SettingsView` | A | As #89 | ✓ | ✓ | Done | Holds only Appearance + build label |
| 91 | Appearance (System / Dark / Light) | Settings → `appearance` | `AppearanceView` | A | As #89; infrastructure `5d727b37` | ✓ | ✓ | Done | — |
| 93 | DEXA → Apple Health writeback toggle, opt-in alert, "Founder physical validation · Sep 12" Write/Delete + dialog | You root (Founder Production) | `YouPlaceholderView.swift:52-54, 62-88, 120-171` | C | Cov Y09 "do not redesign" (one-off validation); the locked You design says these do not become product Settings rows | ✓ container | ✓ container | n/a | Cleanup candidate: the validation harness is live in Release |
| 95 | Founder device connection: Native authority picker, pairing / recovery / reconnect / Disconnect (the only sign-out) | You → `founderServerConnection` | `FounderServerConnectionView` | C | Cov Y07 "do not redesign" (engineering surface) | ~ | ~ | n/a | **Release-seam finding:** the picker can switch to Sandbox in Release (see Release seams) |
| 96 | Sleep canary / validation / historical import; Network Diagnostics + JSON share | inside #95 (Founder Production) | `HealthKitSleep*`, `NetworkDiagnosticsSection` | C | Cov Y08 | ~ | ~ | n/a | Code says "remove when Sleep graduates"; Sleep graduated 2026-10-05, so this is a cleanup candidate |
| 98a | Profile, Data Sources / Apple Health detail, Sign Out / account, Notification settings | — (no route exists) | — | F | Designs locked but "DO NOT begin beta/account/settings architecture implementation yet" (P:20261004T195501Z); ledger: "deliberately unimplemented" | n/a | n/a | n/a | Beta Readiness (#4, #5), not a missing redesign of an existing surface |

### Operating Plan (incl. Peptides)

| # | Surface | Production route | Source / view | Class | Redesign authority / evidence | Dark | Mineral | Physical acceptance | Notes / remaining action |
|---|---|---|---|---|---|---|---|---|---|
| 74 | Operating Plan landing | You → `operatingPlan` | `OperatingPlanLandingView`, `OperatingPlanComponents` | E | Locked root (P:20261004T201500Z, artifact `89d05249`); whole family "LOCKED end to end" (P:20261004T203500Z). **0 commits in `Presentation/OperatingPlan` since Build 86; 0 `redesign*` uses** | ~ | ~ | n/a | P1. Title appears twice (system title + `OperatingPlanScreenHeader`); failed state has no retry |
| 75 | Strategy detail: Energy (read-only), Nutrition, Training, Coaching Updates | landing → `operatingPlanStrategy` | `OperatingPlanStrategyDetailView` | E | Locked (`89d05249`); Energy intentionally read-only (Founder) | ~ | ~ | n/a | P1. Energy phase history hard-coded empty (ledger delta) |
| 76 | Edit Strategy: Nutrition, Training, Coaching Updates (incl. Photos cadence + DEXA section) | detail → `operatingPlanStrategyEdit` | `OperatingPlanStrategyEditorView` | E | Locked edit verification (`be04cfa8`) | ~ | ~ | n/a | P1. Mutation-heavy; choice pills under 44pt; "Cancel" + system back may both show (unverified) |
| 77 | Protocol domain: Recovery / Peptide / Supplement roll-up | landing → `operatingPlanProtocolDomain` | `OperatingPlanProtocolDomainView` | E | Locked (`acafbd37`; P:20261004T195500Z) | ~ | ~ | n/a | P1. Manage / Edit / Pause / Restore are 12pt text buttons well under 44pt |
| 78 | **Peptide execution** (simple card / detail / in-place editor; Pause and rewrite-history confirmations; Advanced disclosure) | domain "Manage"; paused-peptide Priority → `operatingPlanPeptideExecution` | `OperatingPlanPeptideExecutionView` | E | Locked (Peptides family) | ~ | ~ | n/a | P1. Three presentations of one concept |
| 79 | **Peptide sheets** (dose / days / time / notes) + `PeptideDosePlanEditor` | sheets from #78 | `PeptideSupportSheets`, `PeptideDosePlanEditor` | E | Locked | ~ | ~ | n/a | P1 |
| 80 | Recovery (Foam Rolling) support + schedule editor | domain "Edit Support"; Foam Priority "Review Support" → `operatingPlanRecoverySupport` | `OperatingPlanRecoverySupportView`, `OperatingPlanSupportScheduleEditor` | E | Locked | ~ | ~ | n/a | P1. A redesigned Foam Priority Detail (#9) hands off into a legacy editor |
| 81 | Tracking | landing → `operatingPlanTracking` | `OperatingPlanTrackingView` | E | Locked (R:20261004T201405Z) | ~ | ~ | n/a | P1. Duplicate title |
| 82 | Tracking support (Morning Weigh-In schedule) | Tracking → `operatingPlanTrackingSupport` | `OperatingPlanTrackingSupportView` | E | Locked | ~ | ~ | n/a | P1 |
| 83 | Supplement support | domain → `operatingPlanSupplementSupport` | `OperatingPlanSupplementSupportView` | E | Locked | ~ | ~ | n/a | P1 |
| 84 | Supplement edit | domain "Edit Strategy" → `operatingPlanSupplementEdit` | `OperatingPlanSupplementEditorView` | E | Locked | ~ | ~ | n/a | P1 |
| 85 | Training builder, production unavailable state ("…legacy builder…") | Server href `/training/new` when no Training strategy → `operatingPlanTrainingStrategyBuilder` | `OperatingPlanTrainingProtocolBuilderView` | E | Locked conditional builder (Cov O04) | ~ | ~ | n/a | P2. Production shows only the unavailable message; the wizard is Sandbox-only |
| 86 | Operating Plan status route ("Status: …" dead-end card) | landing item with no href → `operatingPlanStatus` | inline in router (:199-210) | C | Cov O11 "do not redesign / unused" (no direct Founder quote) | ~ | ~ | n/a | Sub-audit found Server items with no href (Energy "Build Strategy", Recovery "Coming Soon") can reach it. Whether the Founder's live plan does is unverified |

### Recovery / Sleep

Recovery/Sleep Evidence rows are #63-#66 (all E, under Evidence). Foam Rolling Priority Detail is #9 (B) and Recovery support is #80 (E). Sleep in briefings is intentionally withheld from Midweek and gated by the 14-night rule for Weekly/Monthly; that is briefing semantics, not redesign debt.

### Widgets / Live Activity / deep-link destinations

| # | Surface | Production route | Source / view | Class | Redesign authority / evidence | Dark | Mineral | Physical acceptance | Notes / remaining action |
|---|---|---|---|---|---|---|---|---|---|
| 98 | Home Screen Widget, small (fresh / aging / stale / offline / waiting / unavailable / redacted) | Widget gallery; tap → Logger start/resume; Refresh intent | `HomeLoggedTodayWidgetView` (systemSmall) | E | Final widget design accepted, "program DESIGN COMPLETE" (P:20261004T220500Z). File last changed by the appearance-only commit `5d727b37`; purple-era `HomeWidgetPalette` (Training `0x9F7CFF`), SF Rounded | ~ | ~ | n/a | P2. Refresh hit-target delta (24/28pt) open |
| 99 | Home Screen Widget, large (rows link to Training Day / Nutrition / Activity Day / Weight, Start/Resume, Refresh) | as above | `HomeLoggedTodayWidgetView` (systemLarge) | E | As #98 | ~ | ~ | n/a | P2. Nutrition row lands on Nutrition history, not that day (Log's tile goes to the day) |
| 100 | Live Activity, Lock Screen (in progress / all sets complete / reviewing / finishing / saved / needs update / privacy) | ActivityKit; tap → `physiqueos-workout://open?session=` → Logger | `WorkoutLiveActivityViews` | E | Utility translation locked: "LIVE ACTIVITY … ACCEPTED AS-IS. No visual changes" refers to the **proposed translation** (P:20261004T150500Z, P:20261004T160500Z: teal current/action, green rest, amber needs-update). Shipping uses a fixed dark-purple `WorkoutActivityPalette`; no implementation since Phase 1 | dark-fixed | — | n/a | P3. Implementation estimated low-medium in the design report |
| 101 | Dynamic Island (expanded / compact / minimal) | ActivityKit | `WorkoutLiveActivityWidget` | E | As #100; Island stays system black | dark | n/a | n/a | P3 |
| — | Deep links: widget routes → Log stack; Live Activity URL → Logger (only if the draft exists on the selected authority); notifications (7 `priority.*`, `evidence.reviewReady`, `briefing.ready`) → Home stack; `CompleteWorkoutSetIntent` (no UI); `RefreshHomeWidgetTotalsIntent` | `RootTabView.onOpenURL`, `NotificationDeepLinkCoordinator` | — | routing (not counted) | Destinations: Logger (B), Training Day / Activity Day / Weight (B), Nutrition history (B), Priority Detail (B Foam / **E** others), Evidence Review (B), **Briefing Detail (E)** | — | — | — | Notification taps land on legacy Priority Detail and Briefing Detail for most types |

### Other iPhone

Nothing else is production-reachable. The router `default:` case → `DestinationPlaceholderView` ("Not implemented yet") is not reached by any audited Founder Production push (see G list).

### Watch (separate inventory)

Context:
- Watch V1 shipped with a Founder split-metrics design lock (R:20261002T061039Z) and was physically accepted through Builds 85/86.
- On 2026-10-04 the Founder also **locked a utility visual translation** for the Watch: dark/mineral token translation, typography, spacing and hierarchy, while keeping the current production metric icons and per-metric colors ("Watch = locked … Implementation has NOT started", P:20261004T160500Z).
- No Watch visual commit followed. Commits since Build 86 are functional only (`d43ad7cd`, `cd06bfea`).
- The Watch app is dark-only (`PhysiqueOSWatchApp.swift:11`).

| W# | Screen / state | Source | Current intended design? | Functional backlog | Visual redesign debt |
|---|---|---|---|---|---|
| W1 | Idle / "Prepare a workout on iPhone" / Phone unavailable + Refresh | `WatchWorkoutViews.swift:154-178` | Shipping V1 design, physically accepted | — | Locked utility translation not implemented (P3) |
| W2 | Orphan Health workout banner (End & Save / Discard) | :252-274 | yes | — | P3 |
| W3 | Prepared → Start | :215-249 | yes | — | P3 |
| W4 | Execution page: notices, context rows, LOAD/REPS tiles, rest, primary action | :277-477 | yes | **Complete Set gating:** enabled while the phone is on Review/Confirmation; the authority rejects the tap (`WatchWorkoutProjectionMapper.swift:18`). **Timed-set projection:** `valueText` never read, so timed sets show "—" | P3 |
| W5 | Workout Metrics (time, active/total cal, HR) | :655-711 | yes; production icons/colors are a Founder retention | — | P3 (icons/colors stay) |
| W6 | Daily Totals (fresh / as-of / offline / waiting) | :770-853 | yes; icons/colors retained | — | P3 |
| W7 | Finish confirmation | :513-573 | yes | — | P3 |
| W8 | Finishing (saving, bounded wait, Retry, PhysiqueOS / Apple Health legs) | :576-636 | yes | **Reply-before-side-effects** not implemented: reply is sent after mutation + publish + reconcile (`WatchWorkoutConnectivityBridge.swift:155-166`); pending latency evidence | P3 |
| W9 | Controls page (Pause/Resume, Finish, Cancel, Health start/save retry) | :854-948 | yes | — | P3 |
| W10 | Cancel confirmation | :950-970 | yes | — | P3 |
| W11 | Committed summary ("WORKOUT SAVED", metrics, Done) | :972-1038 | yes | "LB VOLUME" unit hard-coded | P3 |

`WatchWorkoutPreviewFixtures.swift` and `-watchFixture` are `#if DEBUG` only (class G).

### Class G: Sandbox / dead / debug / test (not production redesign scope)

| Item | Why G | Notes |
|---|---|---|
| Goal Edit wizard; Goal Transition A–E; Goal Protocol category editor; Phase Transition wizard | Sandbox-only (buttons hidden in Founder Production; Server ids not decodable; Phase Transition shows "not available in Native production") | Reachable in Release only if the Sandbox authority is selected |
| `EvidenceIntakeView` (fixture intake) + `DateField` sheet; `LocalEvidenceReviewView` + 2 picker sheets | Sandbox-only | Same caveat |
| `evidenceRecoveryUpload` → `DestinationPlaceholderView` in Founder Production | Only producer is `LoggingSandboxStore` | — |
| Router `default:` → `DestinationPlaceholderView` (e.g. `health-metrics`) | Hub hides Health Metrics; no Founder Production push found | Server destinations not decodable by Native fail decoding rather than reaching it (unverified per id) |
| `operatingPlanDexaAppointment` | Orphan: nothing pushes it; Founder Production copy points to Coaching Updates | — |
| `operatingPlanSupplementNew` (Add Supplement) | Sandbox-only button | — |
| Supporting-objective Goal page | Founder Production `fetchGoalDetail` never returns `supporting` | — |
| `SandboxFounderServerConnectionView` (Sandbox pairing, "Sandbox Weight Test") | Sandbox authority | Reachable via the picker |
| Dead code | `NextBestActionView`; `PriorityDetailView.morningWeightCard`; `TrainingLoggerView.actionCard`; legacy generic Evidence Review body; `TrainingLinkRow`; `PhotoPoseThumbnailStrip`; `ProductionBriefingAPI.fetchDEXAEvent` (no non-test caller); `WeeklyEnergyCard.selectedDate` readout | Removal candidates |
| DEBUG review harnesses | `AppearanceReviewLaunchConfiguration`; `-physiqueos.appearance-review.value`; `FoamRollingPriorityPilotLaunchConfiguration`; `-physiqueos.redesign-review`; `EvidenceReviewWorkflowFixture`; `-physiqueos.evidence-review.*`; `reviewProductionIntake`; `SyntheticProgressPhoto`; `LogReviewLaunchConfiguration`; `LoggerReviewSeam`; `NativePerformanceDiagnostics`; `WatchWorkoutPreviewFixtures` | All `#if DEBUG`, compiled out of Release (see seams) |

---

## Design artifact → shipping implementation coverage

Mapped against the 2026-10-04 coverage matrix and the later final design batches.

| Locked design family (authority) | Shipping implementation | Status |
|---|---|---|
| App shell / five-tab / appearance (S01-S08) | `5d727b37` + Batch 1 | Implemented |
| Home (H01) | `c4a74ad0`, `49733300`, `b1488c2e` | Implemented; conditional children D (#2-#6) |
| Home Confidence (H02, Final Batch 2) | none | **Locked, no implementation** |
| Goals (G01-G06) | `c4a74ad0` | Implemented, physically accepted |
| Log (L01-L03, L06) | CP1 `b540b323` | Implemented |
| Morning Check-In (L04), manual weight (L05) (Final Batch 2) | none | **Locked, no implementation** |
| Training Logger (U01) incl. Workout Match (E24) | CP2-CP5 | Implemented; Workout Match non-idle states D |
| Weekly / Midweek / Monthly / DEXA / Photo Briefings (B01-B05), viewers (B08) | none | **Locked, no implementation** |
| Briefing History (B06, Final Batch 2) | none | **Locked, no implementation** |
| Evidence Hub, Training, Nutrition, Activity, Weight, Photos, DEXA, Timeline (E01-E09, E11, E15-E18) | Batch 3 A-D | Implemented; DEXA PDF sheet D |
| Energy (E10) | none | **Locked, no implementation** (Batch 3 Claude scope was A-E without Energy; the Codex attempt that included it was rejected) |
| Recovery (E12-E14) | none | **Locked, no implementation** |
| Intake / Review (E20-E23, Final Batch 1) | Batch 3 E | Implemented |
| Priority Detail family (P01-P04) | Foam pilot only (`b65deb00`) | **Locked; one variant implemented** |
| Operating Plan (O01-O10) | none | **Locked, no implementation** |
| You / Settings / Appearance (Y01, Y02, Y05) | `c4a74ad0` | Implemented, physically accepted |
| Profile / Data Sources / Sign Out (Y03, Y04, Y06) | none, deliberately deferred | F (Beta Readiness) |
| Watch (U02 + Oct 4 utility translation) | V1 shipping; translation not implemented | Visual debt (P3) |
| Live Activity (U03 + translation) | Phase 1 shipping; translation not implemented | Visual debt (P3) |
| Home Screen Widget (U04, Final Batch 3) | none | **Locked, no implementation** |

**Code → design: shipping routes with no locked redesign.** None of the Founder-reachable surfaces lack a design decision. Every one maps to a locked target, a "do not redesign" decision (C), or a G class. These are the only production-reachable items without a locked visual target:
- the Operating Plan status route (#86);
- the Founder device-connection diagnostics (#95, #96);
- the DEXA validation controls (#93).

All four are C by the coverage audit.

**Locked design with no shipping route:**
- Profile, Data Sources / Apple Health detail and Sign Out (deferred, F).
- The paired Previous/Current photo comparison viewer: an open ledger delta, with no type in code.
- Priority Detail Photos/DEXA action destinations: an open ledger delta, unmapped hrefs.

---

## Navigation integrity findings

No changes were made; this is report only.

1. **Sandbox is selectable in Release, and a fresh install defaults to Sandbox.** `FounderServerConnectionView.swift:9-17` (segmented picker, no `#if DEBUG`) and `AppEnvironment.swift:692` (`load() ?? .sandbox`). This makes every Sandbox-only legacy surface (G list) reachable in a Release build by one tap from You → Founder device connection. It is not reachable during normal Founder Production use. This is not a DEBUG seam, so earlier "seams 0" scans did not cover it. Severity depends on Beta plans; it falls under Beta #5.
2. **Two presentations of one concept:**
   - Latest briefing tile (redesigned) vs older `BriefingCardView` (legacy) on the same Home page.
   - Home trajectory: `HomeJourneyFieldView` vs `HomeHeroCardView` vs `GoalsCardView`.
   - `ConfidenceDetailSheet` (legacy) opened from the redesigned Home ring.
   - Foam vs generic Priority Detail templates.
   - Peptide simple card / legacy detail / legacy editor.
   - DEXA scheduling: orphan DEXA appointment vs the Coaching Updates editor.
   - Evidence scope pickers (`EvidenceScopePicker` vs legacy `TrainingScopeSelectorView` on Energy/Recovery).
   - Chart gestures (`evidenceChartScrub` vs legacy `chartScrub` on Energy/Weekly/Midweek).
   - Date sheets (`WorkflowDateRow` vs `DateField`).
3. **Redesigned parent handing off into a legacy child:**
   - Log / intake → `ManualWeighInView`.
   - Home → Confidence sheet.
   - Foam Priority Detail → Recovery support.
   - Evidence Hub → Energy / Recovery.
   - Photos → Photo Briefing.
   - Notification taps → legacy Priority / Briefing Detail.
   - Workout Match → legacy action states.
4. **Sheet-local routers drop callbacks.** The nested `.navigationDestination` inside Show All sheets uses `AppDestinationRouterView(destination:)` with no-op `onNavigate` / `onReturnToLog` / `onReturnToHome`. A long chain (Training Reporting sheet → Exercise → "Training" breadcrumb → Related Goals → Goal Detail) gives a Goal Detail with no-op navigation (inferred). The Energy sheets also push full Nutrition / Activity landings inside the sheet.
5. **Back labels:**
   - Pages pushed from Energy (page or sheet) show "‹ Evidence Hub" (inferred from the back-trail code).
   - Night Detail always says "Recovery".
   - Exercise Detail's "Training" breadcrumb pushes rather than pops.
6. **Energy "Nutrition Day" link opens the Nutrition landing,** not the day. This mirrors the web on purpose, but the label overpromises. The widget Nutrition row also lands on history while Log's tile lands on the day.
7. **Production copy that reads as engineering:**
   - Goals Add Goal card "Founder Production is read-only.";
   - You "Your system is connected." shown regardless of pairing;
   - Training Builder "…legacy builder…";
   - Training "Future protocol settings: Coming soon".
8. **Orphans:** `operatingPlanDexaAppointment` (no pusher) and `NextBestActionView` (no call site).

## Release-seam audit

`DEBUG` is defined only in the project-level Debug configuration (`project.pbxproj:2505`), and no target overrides it. Every launch-argument read is inside `#if DEBUG` except the XCTest host check.

- **Compiled out of Release:**
  - appearance-review routes;
  - the appearance override;
  - the Foam pilot launch config;
  - the redesign-review Home / Log / Workout Match fixtures;
  - `EvidenceReviewWorkflowFixture`;
  - all `-physiqueos.evidence-review.*` seams;
  - `reviewProductionIntake`;
  - `SyntheticProgressPhoto` (Release Sandbox cannot render synthetic photos);
  - the Log and Logger review seams (types kept; reads return nil);
  - `NativePerformanceDiagnostics`;
  - Watch preview fixtures.
- **Present in Release, unreachable:** `HomeRedesignReviewFixture.json` is still in the app target's Resources phase (`generate_project.py:279`, `pbxproj:1887`). It is bundled but only read under DEBUG; tests use it. It is harmless but could move to the test bundle.
- **Present and reachable in Release (not DEBUG seams):**
  - the Sandbox authority picker and default (Navigation integrity finding 1);
  - DEXA "Founder physical validation · Sep 12" Write/Delete on You (Founder Production, when writeback is on);
  - Sleep canary / validation / historical import and Network Diagnostics (Founder Production).
  - None of these involve synthetic media or review fixtures. The Release Sandbox uses bundled fixture JSON reads only.

**Conclusion:** synthetic media, review fixtures, the appearance-review harness, the Evidence-review harness and Debug-only navigation cannot be reached in Release. The Sandbox authority and Founder validation/diagnostic tools can.

---

## OUTPUT 3: Redesign remainder (prioritized; grouping by shared ownership only, nothing implemented)

### P0: materially harms current Founder use

- **Legacy chart scrub overlay on Energy (#61, both charts) and the Weekly/Midweek Energy chart (#68, #69).** The shared `ChartScrubOverlay` uses a zero-distance `simultaneousGesture` that traps a vertical swipe starting on the chart. Batch 3 found and fixed this defect on Weight, Nutrition and DEXA using `evidenceChartScrub`. Weekly's readout (`selectedDate`) is also never displayed, so the gesture costs scroll and gives nothing.
- **Smallest isolated fix:** move these three charts to the fixed gesture arbitration. Files: `EnergyChartViews.swift`, `WeeklyBriefingSections.swift`, plus optionally `SharedUI/ChartInteraction.swift`. It can ride with either the Energy or the Briefings batch, or ship alone.

### P1: meaningful production family still old

1. **Briefings family** (#67-#73).
   - Files: `Presentation/Briefings/*`, `SharedUI/BriefingPresentation.swift`, `PhotoInspectionViewer` `.standard` chrome.
   - Design-only translation; preserve every canonical content, order and cadence semantic (Midweek shortest, Weekly richer, Monthly richest; Sleep withheld per the 14-night rule).
   - Largest remaining family. One owner. **Isolate** from other batches.
2. **Daily capture** (#16 Morning Check-In, #17 manual weight, #7 Confidence sheet).
   - Files: `Logging/ManualWeighInView.swift` (both views), `Home/ConfidenceDetailSheet.swift`.
   - Highest-frequency legacy surfaces. Small, and safe to bundle together.
3. **Priority Detail family** (#10-#15).
   - Files: `PriorityDetailView.swift`; migrate the Foam pilot palette onto shared tokens in the same pass.
   - Bundle-safe with item 2 (same Home-origin flows) **or** isolated. Touches completion/skip/dose semantics, so behavior-parity tests matter.
4. **Energy + Recovery/Sleep Evidence** (#61-#66), plus the DEXA PDF sheet (#55).
   - Owner: EvidenceKit. Files: `EnergyHistoryView`, `EnergyChartViews`, `RecoverySleepViews`, `SleepEvidenceCharts`, `SleepEvidencePresentation`, `DEXAHistoryView` (PDF sheet only).
   - Safe to bundle: it reuses the Batch 3 kit and checkpoint method.
   - The Recovery Continuity point/line change is a chart-behavior delta, so give it its own checkpoint.
5. **Operating Plan + Peptides** (#74-#85).
   - Files: all 17 files in `Presentation/OperatingPlan` plus the shared `CardContainer`-based components.
   - Mutation-heavy editors with optimistic-concurrency and history semantics. **Isolate**, and sequence after items 1-4.
   - Fix the sub-44pt action targets as part of the translation.

### P2: child / detail consistency

- Home conditional children (#2-#6). Owner: Home. Bundle with item 2 or item 3.
- Workout Match non-idle states and back label (#35). Owner: Logger/Evidence Review. Small; bundle with the P3 Logger leftovers.
- Home Screen Widget (#98, #99). Separate widget target with WidgetKit and privacy constraints. **Isolate.**
- Training builder production unavailable state (#85). Rides with item 5.

### P3: polish only

- Logger leftovers (#33).
- Intake date sheet (#59).
- Session media placeholders (#41a).
- Live Activity / Dynamic Island translation (#100, #101). Separate extension, isolated.
- Watch utility translation (W1-W11). Isolate. Sequence it alongside or after the Watch functional follow-ups (Complete Set gating, timed-set projection), because they share `WatchWorkoutViews.swift` and the projection mapper.

### Bundling summary

| Grouping | Contents | Notes |
|---|---|---|
| Safe to bundle | Daily capture + Home children; Energy + Recovery + DEXA PDF; Workout Match states + Logger leftovers | — |
| Keep isolated | Briefings; Operating Plan; Priority Detail; Widget; Live Activity; Watch | Priority Detail may join daily capture if behavior-parity coverage is strong |
| Independent first | P0 gesture fix | Tiny |

---

## OUTPUT 4: Beta Readiness separation

The GH beta backlog below is **future product work, not Build 88 redesign debt**. The titles are as given in the prompt; `gh` is not installed on this machine, so the issues were not re-read.

| Backlog item | Existing surface involved? | Effect on this audit |
|---|---|---|
| #2 First-class Steps evidence + dynamic Log composition | Yes: Log root (#24) and Logged Today tiles would change composition | The current Log root is redesigned (B). Steps is new capability (F-type), not missing redesign |
| #3 User-defined Priorities / Priority Library | Yes: Home priorities (#1, #2) and Priority Detail (#9-#15) | The remaining Priority Detail redesign (P1) is independent and should not wait on #3. #3 adds new surfaces |
| #4 Apple Health upstream-source compatibility | Partially: Data Sources / Apple Health detail is locked but deliberately unimplemented (#98a, F) | Counted as F, not redesign debt |
| #5 Goal creation, evidence onboarding & first-user setup | Yes: Goals Add Goal card (#18, "Founder Production is read-only."), Sandbox-only Goal transition flows (G), no-goal Home hero (#5, D), Sandbox default on fresh install (integrity finding 1), Profile / Sign Out (#98a, F) | The D item #5 (no-goal hero) is the only redesign-debt overlap. The rest is product work |

None of #2-#5 adds a missing redesign surface to Build 88. The only existing-surface overlaps are noted above.

---

## OUTPUT 5: Recommendation

**Multiple distinct redesign families remain. The program cannot be declared complete after Build 88 physical acceptance.**

Build 88 physical acceptance would close the **implemented** families: Home root corrections, Log/Logger/Workout Match, and Batch 3 Evidence, including real-media Progress Photos validation. After that, the remaining locked-but-unimplemented work splits into:

- **Four meaningful families (P1):**
  1. Briefings
  2. Operating Plan + Peptides
  3. Priority Detail + daily capture (Morning Check-In, manual weight, Confidence)
  4. Evidence remainder (Energy + Recovery/Sleep)
- **Three isolated extension translations (P2/P3):** Widget, Live Activity, Watch.
- **A handful of P2/P3 child-state cleanups.**

That is more than "one final batch". A conservative sequence:

1. **Build 88 physical acceptance** of the implemented families (Progress Photos real media first).
2. **P0 chart gesture fix** (tiny; can go into Build 89 with anything).
3. **Batch 4: daily capture + Priority Detail + Home children.** Highest daily frequency, shared Home-origin ownership.
4. **Batch 5: Evidence remainder** (Energy, Recovery/Sleep, DEXA PDF). Reuses the Batch 3 kit.
5. **Batch 6: Briefings.** Design-only; canonical semantics frozen.
6. **Batch 7: Operating Plan + Peptides.** Isolated, mutation-heavy.
7. **Extensions:** Widget, then Live Activity, then Watch, each isolated; Watch is coordinated with its functional follow-ups.

Once those are implemented and accepted, and no new route appears, the redesign program can be declared complete.

---

## Authority re-verification and shipping isolation

- **Audited Native SHA:** `96e724a9f40f9178a16ea492958c3acd4b1b282e` (worktree HEAD, clean). Build 88 = `7fce3b97` (bump only) per `latest.json` on main at audit time.
- **Server:** `b7eb1e39` / `6fa4e887`, taken from `latest.json` / the prompt and not re-queried. This audit has no Server dependency.
- **Mutations:** no source edits, commits to source branches, builds, simulator runs, TestFlight actions, Server work or production mutations.
- **Report-only publication:** this report is published as a single new file. It is not routed through the pointer publisher, so the Build 88 `latest.json` / `latest.md` pointers stay intact while Build 88 awaits Founder physical acceptance.
