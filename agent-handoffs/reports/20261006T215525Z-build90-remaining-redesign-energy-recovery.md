# Build 90 remaining redesign: Energy and Recovery ready for Founder review

- **Task id:** `claude-build90-remaining-redesign-20261006`
- **Prompt:** `agent-handoffs/inbox/prompts/20261006T194500Z-claude-build90-remaining-redesign.md` @ `3b9d8bf0`
- **Agent:** Claude (Remote Control chat). This was a design / coverage lane.
- **Base authority:** shipped Build 89 `51399425` (VALID in TestFlight)
- **Design branch:** `claude/native-build90-remaining-redesign-20261006`, candidate `7e501714` (code `6e7269b0`) (pushed, **not merged**)
- **Review package:** `agent-handoffs/artifacts/build90-remaining-redesign-20261006/` on the design branch
- **Production Server:** unchanged, `b7eb1e39` / deployment `6fa4e887` (not touched)

**What was not done:** no build bump, no TestFlight, no Server change or deploy, no production mutation. No simulator was connected to Founder Production. The candidate is Native-only, presentation-only, and unmerged.

**STATUS:** Build 90 remaining redesign — Energy and Recovery ready for Founder review.

No additional family was designed. The audit shows Operating Plan / Peptides is one large family (about 17 surfaces and 85 states), so per the prompt this lane stops after Energy + Recovery and recommends the next batch below.

---

## 1. Updated Build 89 production-surface coverage matrix

The full matrix is `COVERAGE-MATRIX.md` in the package. Per-row file:line evidence is in three appendices:
- `appendix-home-priority-capture-briefings-widget.md`
- `appendix-evidence-log-children.md`
- `appendix-operating-plan-you.md`

Class key: **A** redesigned/accepted · **B** partial / mixed · **C** still old · **D** platform / no redesign · **E** obsolete / unreachable. DEBUG review routes are not counted.

| Family | Build 89 class |
|---|---|
| Home root; Goals; You / Settings / Appearance (incl. the new Watch appearance) | A (not reopened) |
| Priority Detail, every type and state | **A** (Lane A). The Skip dialog is system (D) |
| Morning Check-In (all child states), manual/backdated weight, Home Confidence sheet | **A** (Lane A) |
| Briefings: Detail states, Weekly, Midweek, Monthly, Photo, DEXA, History | **A** (Lane B). No legacy components remain. The Briefing vertical-swipe trap is gone |
| Watch W1–W11, Live Activity, Dynamic Island | **A** (Lane A) |
| Log, Logger, Workout Match idle/resolved, Evidence Hub / Timeline / Training / Activity / Nutrition / Weight / Photos / DEXA / intake / Review | A (not reopened; about 75 child surfaces, nearly all A) |
| **Energy** (root, both charts, both sheets, states) | **C**. Untouched since the bulk import; held the app's last two legacy `chartScrub` call sites |
| **Recovery / Sleep** (root, Trends, Night Detail, All Nights, states) | **C**. 24 `CardContainer` |
| Operating Plan / Peptides: landing, strategy details and editors, protocol domain, Peptide execution / dose editor / 4 sheets, Recovery support, Tracking, Supplements | **C**. Zero Build 89 diff |
| Operating Plan DEXA appointment page | **C, newly reachable** (see finding F1) |
| Home children: morning grouped session card, older briefing cards, additional-goals card, no-goal hero, loading/failed/reconnect/notices | **C** (untouched by Build 89) |
| Home Today's Priorities tile internals | **B** |
| Widget small/large | **B**. Build 89 only recolored Refresh. Still SF Rounded, a purple Training row, and 24/28 pt Refresh targets |
| Logger leftovers; Workout Match confirming / refresh-required / failed / Back-to-Log + "← Back" | **B** (unchanged) |
| Evidence residual children: session screenshot states, DEXA PDF sheet, intake date sheet, Hub system "Try Again" | **B** (unchanged) |
| Shared `DateField` picker sheet | **B** (legacy tint and background) |
| Photo Briefing single-photo viewer retry state | B (owned by the other Build 90 lane; not touched) |
| DEXA writeback toggle | B |
| Founder device connection, Network Diagnostics, Sep 12 validation controls | D (engineering) |
| Sleep canary / validation / historical import; Operating Plan status route; production Training builder; legacy peptide fallback; production Add Supplement; `DestinationPlaceholderView` | E |
| App-shell tab tint | B (minor: still the legacy purple accent) |

## 2. Energy review boards

These are on the design branch under `agent-handoffs/artifacts/build90-remaining-redesign-20261006/`:
- `energy-root-dark.png`, `energy-root-light.png`: full page vs locked E1 + correction E1.
- `energy-sheets-states-dark.png`, `energy-sheets-states-light.png`:
  - Weekly History sheet; Daily Energy History sheet (top, and the end with all five completeness tags);
  - a selected week; loading; failed + Try again; empty.
  - Compared against locked correction E2 / E3.

## 3. Recovery / Sleep review boards

These are in the same folder:
- `recovery-root-{dark,light}.png`: All Sleep full page, Build Lean Mass scope, and a selected night, vs R1.
- `recovery-trends-{dark,light}.png`: 1M full page with Stage Mix open, a selected night, and the 6M weekly view, vs R2 + R3 + correction R2.
- `recovery-night-{dark,light}.png`: a staged approximate-time night, and additional sleep with Source & Data expanded, vs R4 + R5 + correction R1.
- `recovery-sheet-states-{dark,light}.png`:
  - the All Nights sheet;
  - loading, failed, not available, no data;
  - Goal dates loading / failed / empty;
  - night not found;
  - night variants (updating, unstaged, recalculating).

## 4. Additional family boards

None. See §6.

## 5. Exact remaining redesign backlog after this lane

Assuming Energy + Recovery are accepted and implemented as boarded:

1. **Operating Plan / Peptides** (one family, locked Oct 4 end to end; about 3,650 view LOC across 13 files, about 17 surfaces and 85 states, 9 mutation commands unchanged):
   - landing;
   - Energy / Nutrition / Training / Coaching strategy details;
   - Nutrition / Training / Coaching editors;
   - protocol domain;
   - Peptide execution (simple card, Advanced, dose editor, Dose / Days / Time / Notes sheets);
   - Recovery (Foam Rolling) support + schedule editor;
   - Tracking + Morning Weigh-In support;
   - Supplement support and strategy edit;
   - the DEXA appointment page.
2. **Home children:**
   - morning grouped session card (daily);
   - Today's Priorities tile internals;
   - older briefing cards;
   - additional-goals card;
   - no-goal hero;
   - Home loading / failed / reconnect / notification notices.
3. **Widget** small/large to the locked Final Batch 3 spec: system type, teal Training row, ≥44 pt Refresh, spec teal / gradient values.
4. **Small residual children:**
   - Logger leftovers;
   - Workout Match non-idle states + back label;
   - Training session screenshot states;
   - DEXA PDF sheet;
   - intake date sheet and the shared `DateField` sheet;
   - Hub "Try Again";
   - app-shell tab tint.
5. **Engineering-copy cleanups** (not visual redesign):
   - Exercise not-found;
   - the Weight "fewer than two valid points" note;
   - "Future protocol settings: Coming soon";
   - "Your system is connected." shown unconditionally;
   - "…legacy builder…".

**Deferred, not redesign debt:** Profile / Data Sources / Sign Out (Beta Readiness), and the Sleep canary removal (engineering cleanup).

## 6. Recommended implementation batching

1. **Batch E+R (this candidate):** after Founder board approval, finish it on this branch.
   - Add focused UI coverage: chart tap/scrub/vertical scroll on Energy and Trends; Night back labels from Trends and All Nights.
   - Merge into the Build 90 integration with the other Build 90 lane.
   - Native-only. No Server change is needed.
2. **Batch OP (next):** Operating Plan / Peptides as one lane with four checkpoints.
   - **OP-A:** the kit, read surfaces and utility states, about 700 LOC. **Fix the DEXA appointment dead end first** (F1).
   - **OP-B:** recurring support (domain, Recovery support, Tracking support, Supplements), about 750 LOC.
   - **OP-C:** Peptides, about 1,250 LOC, the highest risk. It can split into its own lane after OP-A. Preserve schedules, pause/resume, dose-aware behavior and rewrite-history semantics exactly. The legacy fallback is unreachable and can be deleted.
   - **OP-D:** strategy editors, about 630 LOC.
   - **Founder decisions needed before OP:**
     1. Production "Add Supplement" is in the lock but hidden in Founder Production.
     2. "Rewrite your dose history?" and Advanced "Start a new plan from today" are not separately drawn in the lock.
     3. Energy phase history is designed but always empty from the Server.
3. **Batch H (small):** Home children, the shared `DateField` sheet and the app-shell tab tint. This is daily-visible, so it could precede OP if the Founder prefers frequency.
4. **Batch W + residuals:** Widget spec translation plus the Logger / Workout Match / Evidence residual children.

## 7. Technical / interaction findings

### Energy: technical audit

| Item | Details |
|---|---|
| Current files | `Presentation/Evidence/EnergyHistoryView.swift`, `EnergyChartViews.swift`, `EnergyHistoryViewModel.swift` |
| Canonical data | `energy` read resource → `EnergyReportReadModel` (`Networking/ProductionDailyDriverAPI.swift:2057`); Sandbox `FixtureEnergyAPI` + `EnergyEvidenceCalculator`. Values, completeness labels, week/day aggregation and `kcal` formatting are unchanged |
| Interactions | scope pills (Goal / phase / All) reload the report; 1M–All range filter; chart selection (previously legacy `chartScrub`, now tap + horizontal scrub); Weekly / Daily Show All sheets; conditional Nutrition Day / Activity links; pull to refresh and foreground refresh |
| Child states | loading, failed (now + Try again), empty, partial weeks, five day completeness states, selected week |
| Implementation files in the candidate | the same three files plus `WeightHistoryView.swift`. The shared Weight harness components moved from private to internal (no visual change); `WeightStatePanel` gained an optional action |
| Likely conflicts | `WeightHistoryView.swift` and `EvidenceKitComponents.swift` (a DEBUG-only scroll seam) if another lane edits Weight or EvidenceKit. `AppEnvironment.swift`: two DEBUG wrappers |
| Regression tests needed | Energy UI journey with sheets and links; chart arbitration (tap, horizontal scrub, vertical scroll starting on a chart); Release seams scan; existing `EnergyReadModelTests` |
| Server change | **None.** An as-of / stale indicator would need a new canonical field, so it was not designed |

### Recovery / Sleep: technical audit

| Item | Details |
|---|---|
| Current files | `Presentation/Evidence/RecoverySleepViews.swift`, `SleepEvidenceCharts.swift` (`SleepEvidencePresentation.swift`, `SleepAxisPolicy.swift` and the view models are unchanged) |
| Canonical data | `recovery-sleep`, `recovery-sleep-trends`, `recovery-sleep-nights`, `recovery-sleep-night` reads through `RecoverySleepAPI`; Goal windows from `RecoverySleepScopeStore`. Calculations, eligibility, `strategicUse` quarantine, the 14-night briefing rule, scope ranges, paging, the weekly threshold and provenance are untouched |
| Interactions | shared scope pills; range 2W–All; root chart night toggle → Open night; Trends selection; Continuity selection (new, per locked correction R2); Timeline inspect; Stage Mix and Source & Data disclosures; All Nights paging; night routes from root, Trends and All Nights |
| Child states | loading, failed (+ Try again), not available, no data, Goal dates loading / failed / empty, open-window updating, approximate clock times, staged / unstaged / recalculating night, additional sleep, Time in Bed absent, night not found, loading more |
| Likely conflicts | none with the other Build 90 lane (Logger, Watch, Photo viewer). The stage palette is local (`SleepPalette`); global `PhysiqueOSTheme.sleep*` tokens are untouched |
| Regression tests needed | the existing `RecoverySleepAcceptanceUITests` (identifiers preserved), plus new back-label assertions and chart arbitration |
| Server change | **None** |

### Findings

- **F1 (P1, new in Build 89): DEXA appointment dead end.**
  - Priority Detail's appointment-stage "View DEXA Appointment" now maps `/profile/operating-plan/execution/dexa` to `OperatingPlanDexaAppointmentView` (`ProductionDailyDriverAPI.swift:1227`).
  - In Founder Production that page is a legacy dead end: plain "Manage … in Coaching Updates" text with no link.
  - This matters with the Oct 9 DEXA appointment. Recommended fix: either a link to Coaching Updates, or keep the Priority mapping off until OP-A.
- **F2.** Removing Energy's `chartScrub` removes the **last** legacy vertical-swipe trap in the app. The definition in `SharedUI/ChartInteraction.swift` now has no callers.
- **F3. Navigation fixed in the candidate:**
  - Energy now registers in the back trail; its sheets carry their own trail.
  - Night Detail back reads its real parent.
  - The Energy weekly sheet gains Done.
- **F4. Still open, not in this lane's scope:**
  - Show All sheet-local routers drop navigation callbacks (Training Reporting → Exercise → … → Goal Detail no-ops).
  - Library breadcrumbs push instead of popping.
  - Energy "Nutrition Day" opens the Nutrition landing, not the day. This is kept for web parity, and the label overpromises.
- **F5.** Priority Detail and Morning Check-In crumbs always read "Home", even when reached from Operating Plan or from Priority "Log Weight".
- **F6.** Morning Check-In has no loading or read-failure presentation. A failed read only surfaces at Save.
- **F7. Release seam (unchanged):** the Sandbox authority is still selectable in Release, and a fresh install defaults to Sandbox.

## 8. Concurrency confirmation

The other active Build 90 Founder-changes lane owns four items:
- the Logger rest stopwatch #7;
- the guided iPhone → Watch handoff #8;
- the Photo Briefing expanded-viewer cleanup;
- Watch primary-button centering.

**None of their files were touched.** The candidate diff is limited to:
- `Presentation/Evidence/{EnergyHistoryView, EnergyChartViews, RecoverySleepViews, SleepEvidenceCharts, WeightHistoryView, EvidenceKitComponents}.swift`;
- `Networking/EnergyAPI.swift` (the DEBUG seam);
- `App/AppEnvironment.swift` (DEBUG wrappers);
- the package folder.

The Codex Training-progression branch and the Server were not touched.

## Validation

- **Unit:** the full `PhysiqueOSTests` suite ran on the candidate code: **2132 tests, 0 failures** (1 designed skip). Afterwards the home-screen-widget PNGs that the suite rewrites were restored.
- **UI:**
  - `EvidenceHubTimelineUITests`, `EvidenceTrainingNutritionWeightUITests` and `TrainingAcceptanceUITests` all passed. This includes the Weight scrub / scroll tests, and Energy is reached through TrainingAcceptance.
  - `RecoverySleepAcceptanceUITests` first failed 2 of 3. Both failures came from this lane's own change: the All Nights bar title, and a recalculating note that the test expects as a separate text. After the fix it passes **3/3**.
- **Release seams:** every `EnergyRecoveryRedesignReview` / review-scroll reference sits inside `#if DEBUG`, checked by a source scan of all six files. **A Release compile was not run:** the shared Mac's disk hit 100% (about 0.7 GB free, machine-wide) during that build, so the build products of this lane were deleted instead. Run a Release build before integration.
- **Machine:** load averaged about 140–400 for most of the lane. That was the shared-Mac exhaustion, not code; captures were retried where a frame was blank.
- **Production check:** read-only `doctl` (`physiqueos-final-cutover-config`) shows active deployment `6fa4e887`, web `PHYSIQUEOS_GIT_SHA` `b7eb1e39`, and health/live 200. Nothing changed.
