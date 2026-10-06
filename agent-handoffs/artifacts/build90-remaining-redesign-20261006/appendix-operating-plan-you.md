> Read-only sub-audit of shipped Build 89 `51399425`, produced in this lane. Where it mentions "another lane editing" Energy/Weight/EnergyAPI/AppEnvironment in the worktree, that was this lane's own in-progress Energy/Recovery candidate; all citations are against `51399425`.

# Operating Plan / Peptides and You / Settings: Build 89 residual audit

- **Mode:** read-only. Nothing was edited, built, committed or run.
- **Tree:** `51399425` (Build 89 shipped source) (this lane's worktree). Source paths below are relative to `ios/PhysiqueOS/`.
- **Baseline:** the Build 88 audit (`build88-audit.md`, rows #74-#86 and #89-#98a, the class G list and the navigation-integrity section).

**Class key used in this report (the caller's key, not the Build 88 report's letters):**
- **A** redesigned.
- **B** partially redesigned or mixed.
- **C** still old grammar.
- **D** intentionally platform-specific; no redesign.
- **E** obsolete or unreachable in Founder Production.

**Grammar terms:**
- "Legacy" means `PhysiqueOSTheme.background / surfaceElevated / surfaceMuted / textPrimary / textSecondary / textMuted / accent / destructive` plus the shared `CardContainer`, `IconBadge`, `StatusChip`, `SectionHeading` and `PrimaryActionButton`.
- "Redesign" means one of the newer token families in `SharedUI/PhysiqueOSTheme.swift`:
  - `redesign*` (26 tokens): Home, You and Log;
  - `priority*` (16, new in Build 89): Priority Detail;
  - `capture*` (17, new in Build 89): Morning Check-In and weight;
  - the Evidence kit (`EvidencePalette` / `EvidenceTextStyle`).

---

## 0. Locked design authorities (located in git)

All of these commits are on `origin/main`. None of them are ancestors of the Build 89 branch HEAD, because the artifacts live only on main and the claude/build86-report branches. Read them with `git show origin/main:<path>`.

| # | Commit | Artifact folder | What it locks | Board / screen files |
|---|---|---|---|---|
| 1 | `89d05249` (2026-10-04 11:41, "design: translate Operating Plan surfaces") | `agent-handoffs/artifacts/operating-plan-ui-style-translation-20261004/` | Root plus Energy, Nutrition and Training strategy **detail**. Founder accepted and locked these per the backlog: "Operating Plan root and three strategy details accepted". Coverage O01-O04. | `screens/operating-plan-mobile-review.png` (primary), `operating-plan-family-board.png`, `root-{dark,light,dark-light}.png`, `energy-{dark,light,dark-light}.png`, `nutrition-{…}.png`, `training-{…}.png`; `comparison-board.html`, `operating-plan-harness.html`, `OPERATING-PLAN-AUTHORITY.json`, `NAVIGATION-ACTION-MATRIX.md`, `SOURCE-AUDIT.md`, `PARITY-PROOF.md`, `validation.json` |
| 2 | `be04cfa8` (12:12, "verify Operating Plan edit strategy flows") | `agent-handoffs/artifacts/operating-plan-edit-strategy-verification-20261004/` | Edit Strategy for Nutrition and Training; Energy has no editor (negative proof); Training validation error. There is no success screen because Native dismisses on save. | `screens/operating-plan-edit-mobile-review.png` (primary), `energy-no-editor-dark-light.png`, `nutrition-{dark,light}.png`, `nutrition-edit-dark-light.png`, `training-{dark,light}.png`, `training-edit-dark-light.png`, `training-error-{dark,light}.png`, `training-validation-error-dark-light.png`; `edit-strategy-harness.html`, `EDIT-FLOW-AUTHORITY.json`, `MUTATION-PARITY-MATRIX.md` |
| 3 | `4c18f370` (12:43, "translate next operating plan domains"), with the SHA fix `acafbd37` (12:45, which touched only `NEXT-THREE-AUTHORITY.json` and `validation.json`) | `agent-handoffs/artifacts/operating-plan-next-three-domains-ui-style-translation-20261004/` | Recovery, Peptides and Supplements: domain overviews; Foam Rolling detail and inline edit; Peptide Manage (Retatrutide advanced, Tesamorelin simple, paused); Dose / Days / Time / Notes sheets; Pause confirmation (Today/Tomorrow); Supplement domain (active and paused), Support detail and edit, Strategy edit and **Add Supplement create**. Backlog: "Recovery, Peptides and Supplements accepted and locked". The legacy peptide fallback is explicitly **not** a current Founder state (COVERAGE-MATRIX.md:31). | `boards/operating-plan-next-three-mobile-review.png` (primary), `boards/peptides-review.png`, `boards/peptide-actions-review.png`, `boards/recovery-review.png`, `boards/supplements-review.png`; `screens/peptide-{domain,reta,tesa,paused,pause,dose,days,time,notes}-{dark,light,dark-light}.png`, `recovery-{domain,detail,edit}-…png`, `supplement-{domain,support,support-edit,strategy,add}-…png`; `operating-plan-next-three-harness.html`, `NEXT-THREE-AUTHORITY.json`, `ACTION-MUTATION-MATRIX.md`, `COVERAGE-MATRIX.md` |
| 4 | `a6c830db` (13:18, "complete remaining Operating Plan surfaces"; identical content to `ab1f22bb` on `codex/operating-plan-finish-remaining`) | `agent-handoffs/artifacts/operating-plan-finish-remaining-20261004/` + report `agent-handoffs/reports/20261004T201405Z-operating-plan-finish-remaining.md` (this is "R:20261004T201405Z") | Tracking root and Morning Weigh-In Support editor; Coaching Updates detail and full composite editor; Progress Photos monthly cadence; **Founder Production DEXA appointment unavailable state**; root tail (Tracking → Coaching). These were "ready for review" at commit time. They were locked by prompt `agent-handoffs/inbox/prompts/20261004T203500Z-app-wide-redesign-coverage-audit.md:9`: "Founder has accepted the final Tracking and Coaching Updates package. Treat the entire Operating Plan design family as LOCKED end to end." | `boards/operating-plan-remaining-mobile-review.png` (primary), `boards/tracking-review.png`, `boards/coaching-updates-review.png`, `boards/dexa-current-state-review.png`; `screens/root-remainder-…png`, `tracking-root-…png`, `tracking-edit-…png`, `coaching-detail-…png`, `coaching-edit-…png`, `coaching-photos-monthly-…png`, `dexa-production-unavailable-…png`; `operating-plan-remaining-harness.html`, `REMAINING-AUTHORITY.json` |
| 5 | `33352cc7` ("audit: map remaining app-wide redesign coverage") | `agent-handoffs/artifacts/app-wide-redesign-coverage-audit-20261004/SURFACE-COVERAGE-MATRIX.tsv` | Rows O01-O11 and Y01-Y09. O01-O10 are "A / Founder-locked". **O11 `operatingPlanStatus` is "D: no current Founder Production landing row or action resolves here".** Y07, Y08 and Y09 are "D" (engineering, validation and diagnostic tools). | — |

Related authority for Peptide Priority, not this family: `agent-handoffs/artifacts/priority-detail-ui-style-translation-20261004/` (LOCK-RECORD.md, Tesamorelin preparation consolidation) also changed in `89d05249`.

Design gaps in the locked set that an implementer must resolve, not invent:
- (a) The **"Rewrite your dose history?"** confirmation and the Advanced "Start a new plan from today" branch are not separately rendered. Only the Pause confirmation is.
- (b) **Supplement Pause/Restore** is drawn as a direct action. Native has no confirmation, which matches the design.
- (c) **Energy phase history** is in the design, but Native production always sends `energyPhaseHistory: []` (`Networking/OperatingPlanCanonicalStrategyAPI.swift:22,73`). This is a ledger delta.
- (d) **Add Supplement** is in the locked design, but Native hides it in Founder Production (see 1.15).
- (e) Standard loading, error and retry states are "inherited from the locked system", not drawn.

---

## 1. Operating Plan family (Build 89 tree)

Data authority and wiring:
- Every Founder Production read goes through `ProductionNativeAPI.readResource(<resource>)`.
- Every write is a Production command guarded by `NativeProductWriteGuard.authorize(.operatingPlan, in: .founderProduction)`.
- Any `operating-plan.*` command invalidates about 20 resources: home, priority, morning-check-in, all operating-plan-*, training-*, dexa, photos and briefing* (`Networking/FounderServerAPI.swift:1407-1419`).
- Sandbox reads and writes go to `OperatingPlanSandboxStore`.

LOC means the view file or region size. "States" counts distinct visual states, not code paths.

### 1.1 Landing (root): **C**
- **Route:** You tab → "Operating Plan" row (`Presentation/You/YouPlaceholderView.swift:26`) → `AppDestination.operatingPlan` → `AppDestinationRouterView.swift:177`.
- **Source:** `Presentation/OperatingPlan/OperatingPlanLandingView.swift:9-111`, plus shared `OperatingPlanComponents.swift:60-239` (Section, Row, FieldRow, ScreenHeader, UnavailableView, EditorErrorBanner, ChoicePill).
- **Grammar:**
  - Legacy throughout: `CardContainer` rows, `IconBadge`, `StatusChip(.muted)`, `PhysiqueOSTheme.accent`. There are 0 `redesign*` uses.
  - The title appears twice: the system inline title "Operating Plan" (:39) and the header "Your Operating Plan" (:54-58).
  - The failed state ("Operating Plan could not be loaded.") has **no retry button**; pull-to-refresh only (:26-29).
  - It is the only Operating Plan surface with `.refreshable` plus foreground refresh.
- **Data:** read `operating-plan` (`Networking/ProductionDailyDriverAPI.swift:755-790`). Sections are Server-ordered (`src/application/plan/OperatingPlanReadService.js:66-76`): Energy, Nutrition, Training, Recovery, Peptides, Supplements, Tracking, conditional Coaching Updates. Each item carries a Server-encoded `AppDestination`. An item with no href falls back to `native.operating-plan.status` (OperatingPlanReadService.js:84-92).
- **Mutations:** none. "Add Supplement" is gated by `permitsProductWrites`, which is `self == .sandbox` (`App/AppEnvironment.swift:51`), so it is hidden in Founder Production.
- **Scope:** 111 LOC plus 239 shared. States: loading, failed, loaded; per row: navigable (chevron), status chip, or non-interactive. About 5.

### 1.2 Strategy detail (Energy / Nutrition / Training / Coaching Updates): **C**
- **Route:** landing row → `.operatingPlanStrategy(strategyType:strategyId:)` → router :179.
- **Source:** `OperatingPlanStrategyDetailView.swift:12-206`.
- **Grammar:**
  - Legacy `OperatingPlanScreenHeader` and `CardContainer` field rows; `PrimaryActionButton` "Edit Strategy" / "Edit Coaching Updates".
  - Custom back button "← Operating Plan" (`navigationBarBackButtonHidden` + leading toolbar, :60-71).
  - The Energy Phase History card exists (:165-205) but is never shown in production because history is always empty.
- **Data:**
  - Nutrition: `nutritionStrategyAPI.fetchDetail` → `operating-plan-nutrition-strategy`.
  - Training: `trainingStrategyAPI` → `operating-plan-training-strategy`.
  - Energy: `energyStrategyAPI` → `operating-plan-energy-strategy`.
  - Coaching: `coachingUpdatesAPI` → `operating-plan-coaching-updates`.
  - Each fails closed with "This strategy couldn't be loaded. Pull to refresh or try again." and offers no retry button.
- **Mutations:** none. Energy is intentionally read-only (no edit destination).
- **Scope:** 206 LOC. States: loading, failed, loaded × 4 strategy types (Energy has no edit button). About 6.

### 1.3 Strategy editors (Nutrition / Training / Coaching Updates composite): **C**, with platform controls
- **Route:** detail "Edit …" → `.operatingPlanStrategyEdit` → router :181.
- **Source:** `OperatingPlanStrategyEditorView.swift`:
  - wrapper :9-37;
  - `NutritionStrategyEditor` :40-188;
  - `TrainingStrategyEditor` :190-330;
  - `CoachingUpdatesEditor` :332-613;
  - `FlowPills` :615-630.
- **Grammar:**
  - Legacy sections and cards.
  - `OperatingPlanChoicePill` **without** a minimum height, so targets are under 44pt (:66, 93, 103, 249, 626).
  - Native `Stepper`, `Picker`, `Toggle`, `DatePicker` and `TextField` are embedded; these are D sub-elements.
  - The wrapper adds a leading "Cancel" but does **not** hide the system back button, so both show. This was confirmed from code (the Build 88 audit marked it unverified).
- **Data:**
  - Nutrition editor: `operating-plan-nutrition-strategy`.
  - Training editor: `operating-plan-training-strategy`.
  - Coaching: `operating-plan-coaching-updates`. It refuses to save a monthly Photos cadence to an old Server (:494-497).
- **Mutations:**
  - `operating-plan.nutrition-strategy.save.v1`;
  - `operating-plan.training-strategy.save.v1`;
  - `operating-plan.coaching-updates.save.v1`, one atomic save across Midweek, Weekly, Monthly, Photos and reminder, DEXA and Notifications, with current-version concurrency.
- **Scope:** 630 LOC.
  - Nutrition: loading, failed, edit, error. About 4.
  - Training: loading, failed, edit, validation error, save error. About 5.
  - Coaching: loading, failed, edit, saving, error, plus Photos weekly vs monthly (week-of-month and specific time) and a DEXA section. About 7.
  - Total about 16.

### 1.4 Protocol domain (Recovery / Peptides / Supplements roll-up): **C**
- **Route:** landing Recovery, Peptide or Supplement row (`/profile/protocols/:id`) → `.operatingPlanProtocolDomain(protocolId:)` → router :183.
- **Source:** `OperatingPlanProtocolDomainView.swift:17-279`.
- **Grammar:**
  - Legacy method cards: IconBadge, FieldRows (Support / Current Dose / Schedule), a "Paused" chip or bell icon.
  - **Actions are 12pt text buttons**, well under 44pt (:132-165): Manage, Resume, Edit Support, Edit Strategy, Pause, Restore.
  - Custom back "← Operating Plan".
  - **No `.refreshable`.**
- **Data:** `operatingPlanProtocolDomainAPI.fetchDomain` → `operating-plan-protocol-domain`.
- **Mutations:**
  - Peptide **Resume**: fetch `operating-plan-peptide-support` revision, then `operating-plan.peptide-lifecycle.change.v1` (:198-223), then reconcile notifications.
  - Supplement **Pause/Restore**: `operating-plan.supplement-lifecycle.change.v1` (:235-269), **with no confirmation**.
- **Scope:** 279 LOC. States: loading, failed, loaded × category {recovery, peptide active, peptide paused, supplement active, supplement paused}, lifecycle-in-flight, lifecycle error. About 8.

### 1.5 Peptide execution ("Manage"): **C**, with D dialogs and E fallback
- **Routes in Founder Production:**
  - domain "Manage" (Server `native.operating-plan.protocol.peptide`, `src/application/core/CoreNavigationReadService.js:1136`) → `.operatingPlanPeptideExecution` → router :185;
  - **paused-peptide Priority** occurrence (`Networking/ProductionDailyDriverAPI.swift:1137-1140`, pausedDestination) from the Build 89 **redesigned** Priority Detail (`Presentation/Home/PriorityDetailView.swift:227-235, 462`). This is a redesigned parent handing off to a legacy child.
- **Source:** `OperatingPlanPeptideExecutionView.swift` (587 LOC). Its logic lives in `PeptideSupportEditorViewModel.swift` (837 LOC; logic only, no view code).

| Sub-surface | Lines | Class | Notes |
|---|---|---|---|
| Simple screen: header + card with Dose / Days / Time rows (44pt rows, chevrons), Next dose, Planned change, Paused since, Reminder `Toggle`, Notes row | :136-262 | C | Legacy CardContainer and FieldRow; this is the "simple card" (S4). Rows and toggles meet 44pt. |
| Loading / failed + "Try again" | :105-131 | C | The only Operating Plan surface with an explicit retry. |
| Pause: inline "Starting Today/Tomorrow" `Menu` card (only when today has a scheduled dose) + "Pause <name>" text button + **confirmationDialog** "Pause <name>?" | :266-341 (dialog :318) | C card / **D** dialog | The dialog is the system action sheet. The design rendered a Pause confirmation board with Today/Tomorrow; Native splits that between the inline menu and the system dialog. |
| Resume `PrimaryActionButton` (paused state) + result message (posts an a11y announcement) | :266-341 | C | — |
| **Advanced · dose plan** disclosure (`PhysiqueOSDisclosureRow`) → `PeptideDosePlanEditor` + "Start a new plan from today" / "Save changes to this plan" / "Save plan" | :351-465 | C | The branches are custom pattern, manual plan, rewrites-history and in-place. |
| **"Rewrite your dose history?"** confirmationDialog | :417 | **D** | Not rendered in the locked package. |
| Dose history (3 lines, then Show all / Show less) | :467-490 | C | — |
| **Legacy fallback**: `legacyDetail` + in-place `legacyEditor` (schedule editor, dose plan editor, reminder pills, notes, "Edit plan" / "Save plan", toolbar "Cancel") | :493-587 | **E** | Used only when `supportsSimpleEditor == false` (`Networking/PeptideSupportAPI.swift:97-99`: `lifecycle != nil && executionRevision != nil`). The current Server always emits both (`CoreNavigationReadService.js:383-392`). The locked package says it is "not a current Founder state". Deletion candidate. |

- **Data:** `peptideSupportAPI.fetchSupport` → `operating-plan-peptide-support`.
- **Mutations:** all go through the view model:
  - `operating-plan.peptide-support.save.v1` (dose change with effective date or scope, days, time, notes, reminder, Advanced save with or without a history rewrite);
  - `operating-plan.peptide-lifecycle.change.v1` (pause today/tomorrow, resume).
  - Each is followed by priority-notification reconciliation.
- **Scope:** 587 LOC view. States:
  - simple active (with or without today's dose);
  - paused;
  - saving;
  - error;
  - result;
  - Advanced collapsed / expanded × {custom, manual-clean, rewrite, rewrite-dirty, in-place-dirty};
  - history collapsed / expanded;
  - 2 dialogs;
  - legacy detail / editor (E).
  - About 14 production states.

### 1.6 Peptide sheets + PeptideDosePlanEditor: **C**, with D pickers
- **Route:** `.sheet(item:)` from 1.5 (:68).
- **Source:** `PeptideSupportSheets.swift`:
  - shared chrome `PeptideEditorSheet` :13-56 (NavigationStack, Cancel/Save toolbar, `.medium/.large` detents, interactive dismiss disabled while saving);
  - `PeptideChangeDoseSheet` :93-276;
  - `PeptideDaysSheet` :279-373;
  - `PeptideTimeSheet` :375-436 (wheel `DatePicker`, D);
  - `PeptideNotesSheet` :438-477.
- `PeptideDosePlanEditor.swift:12-182` covers the pattern pills, starting dose (Stepper + unit TextField + start `DateField`), peak, change-by, hold-then-decrease, and ends (Ongoing or a date).
- **Grammar:** legacy background, text and accents; choice pills at 44pt here; `DateField` uses its `.standard` style (Build 89 added a `.capture` style that is not used here).
- **Cross-family handoff:** Change Dose with "Only the next dose" dismisses the sheet and pushes `.priorityOccurrence` (:257-263). That lands in the Build 89 redesigned Priority Detail.
- **Data and mutations:** as 1.5.
- **Scope:** 477 + 182 LOC. States:
  - Dose: amount / unit; Start = Today / Next dose / Pick date (DateField); scope from-date-on / only-next-dose; caption; past-date warning; saving; error.
  - Days: weekday chips or every-N-days stepper.
  - Time: wheel.
  - Notes: text.
  - Dose plan editor: 5 sections, with conditional hold and ends date.
  - About 14.

### 1.7 Recovery (Foam Rolling) support + shared schedule editor: **C**
- **Routes:**
  - domain "Edit Support" (Server `native.operating-plan.protocol.recovery`) → `.operatingPlanRecoverySupport(executionId:)` → router :187;
  - **Foam Priority "Review Support"** via the audited href map `"/profile/operating-plan/execution/execution_foam_roll"` (`ProductionDailyDriverAPI.swift:1219-1221`), from the redesigned Priority Detail. Redesigned parent → legacy child.
- **Source:**
  - `OperatingPlanRecoverySupportView.swift:18-193`: detail plus an **inline** editor toggled by `isEditing`. The toolbar flips "← Support" to "× Cancel".
  - `OperatingPlanSupportScheduleEditor.swift:5-203`: `Picker` frequency and weekday, weekday chips, interval `Stepper`, timing `Picker`, `DatePicker` time, `DateField` start and end, "Until changed / Choose date" pills under 44pt (:82, 85). It also hosts the `OperatingPlanDateValues` helpers.
- **Grammar:**
  - Legacy cards.
  - Reminder choice pills are under 44pt (`OperatingPlanRecoverySupportView.swift:128`).
  - No `.refreshable`, although the copy says "Pull to refresh".
- **Data:** `recurringSupportAPI.fetchSupport(executionId:)` → `operating-plan-recurring-support`.
- **Mutations:** `operating-plan.recurring-support.save.v1` (schedule, reminder preference and notes, with `expectedRevision`), then reconcile notifications.
- **Scope:** 193 + 203 LOC. States: loading, failed, detail, edit, × frequency {daily, weekly, specific days, every N}, × timing {named, specific}, end date on or off, error. About 8.

### 1.8 Tracking + Tracking support (Morning Weigh-In): **C**
- **Route:**
  - landing Tracking row (`/profile/operating-plan/tracking`) → `.operatingPlanTracking` → router :189;
  - "Edit Support" → `.operatingPlanTrackingSupport(executionId:)` → router :191.
- **Source:** `OperatingPlanTrackingView.swift`: `OperatingPlanTrackingView` :9-97 and `OperatingPlanTrackingSupportView` :99-215. The support view reuses `OperatingPlanSupportScheduleEditor`.
- **Grammar:**
  - Legacy.
  - Duplicate title: system "Tracking" plus header "Tracking".
  - Reminder pills under 44pt (:126).
  - The support editor uses the system back button. There is no explicit Cancel, unlike Recovery.
- **Data:** `recurringSupportAPI.fetchSupport(executionId: "execution_morning_weigh_in")` (hard-coded id, :17).
- **Mutations:** `operating-plan.recurring-support.save.v1`. Completion stays evidence-owned; there is no Mark Complete, which matches the design.
- **Scope:** 215 LOC. States: root loading / failed / loaded; support loading / failed / edit / error. About 6.

### 1.9 Supplement support (detail + inline edit): **C**, conditional
- **Route:** domain method edit (Server `native.operating-plan.protocol.supplement.support`) → `.operatingPlanSupplementSupport(protocolId:)` → router :193. It is reachable only if the Founder has an active supplement protocol.
- **Source:** `OperatingPlanSupplementSupportView.swift:3-159`.
- **Grammar:** legacy; amount and unit `TextField`s; reminder pills under 44pt (:108).
- **Data:** `supplementSupportAPI.fetchSupport` → `operating-plan-supplement-support`.
- **Mutations:** `operating-plan.supplement-support.save.v1`.
- **Scope:** 159 LOC. About 5 states.

### 1.10 Supplement strategy edit (and create): **C** for Edit, **E** for New in production
- **Route:**
  - domain "Edit Strategy" → `.operatingPlanSupplementEdit(protocolId:)` → router :197;
  - `.operatingPlanSupplementNew` (router :195) is pushed only by the landing "Add Supplement" button, which is Sandbox-only.
- **Source:** `OperatingPlanSupplementEditorView.swift:10-167`. It has Name, Purpose and Role `TextField`s, Goal pills under 44pt (:62), a Start Date `DateField` (create only), and a Cancel toolbar that hides the system back button.
- **Data:** `supplementStrategyAPI.fetchEditor(protocolId:)` → `operating-plan-supplement-strategy-editor`. The production API already supports `protocolId: nil` create mode.
- **Mutations:** `operating-plan.supplement-strategy.save.v1` (edit, or create).
- **Scope:** 167 LOC. About 5 states.
- **Delta:** the locked design includes Add Supplement, but Native hides it in production even though the create plumbing exists. This needs a Founder decision.

### 1.11 Training builder (production unavailable state): **E**, with an engineering-copy defect
- **Route:** Server href `/training/new` when there is no Training protocol → `.operatingPlanTrainingStrategyBuilder` → router :213.
- **Source:** `OperatingPlanTrainingProtocolBuilderView.swift:9-21`. Production shows only `OperatingPlanUnavailableView("Training creation is not available through this legacy builder. …")`.
- **Reachability:** the Founder has an active Training protocol, so this is unreachable today.
- The Sandbox 11-step wizard (:30-292) and `ProtocolBuilderShell.swift` (155 LOC, shared with the Goals Sandbox wizards) are class G.
- **Scope:** 1 production state.

### 1.12 Operating Plan status route: **E**
- **Route:** `native.operating-plan.status` is the Server fallback for an item with no href (OperatingPlanReadService.js:84-92). The only producers are Energy with no strategy ("Build Strategy") and Recovery with no protocols ("Coming Soon"). The Founder has both configured, so it is unreachable for the Founder.
- **Source:** inline in `Presentation/Root/AppDestinationRouterView.swift:199-210` (OperatingPlanScreenHeader + a single "Status" field card). It is not designed; coverage O11 marks it "D / unused".
- **Scope:** 12 LOC, 1 state.

### 1.13 DEXA appointment (Founder Production unavailable): **C**, and **NEWLY REACHABLE in Build 89**
- **Route:**
  - Build 89 commit `5f5df553` ("locked Priority Detail family") added `"/profile/operating-plan/execution/dexa": .operatingPlanDexaAppointment` to `ProductionDailyDriverAPI.destination(forActionHref:)` (:1227).
  - The Server's DEXA Priority sends that href for its pre-scan "View DEXA Appointment" action (`src/domain/services/PriorityDetailService.js:984-986`).
  - So a **scheduled DEXA Priority** in Founder Production now pushes this route from the redesigned Priority Detail.
  - The Build 88 audit listed it as an orphan; it no longer is. This matters given the pending Oct 9 DEXA deadline.
- **Source:** `OperatingPlanDexaAppointmentView.swift:11-38`. Production renders only the plain text "Manage your production DEXA schedule in Coaching Updates, where Progress Photos and DEXA are saved together."
  - The text has **no link or button to Coaching Updates**: it is a dead end.
  - It has a legacy background and a system title "Next DEXA Scan".
- The Sandbox detail and editor (:40-216) are class G.
- **Design:** locked as `dexa-production-unavailable-*.png` (folder #4). The usability gap is recorded as an implementation delta.
- **Scope:** about 30 LOC production, 1 state. The fix is small: add a "Open Coaching Updates" action.

### 1.14 Alerts, dialogs and sheets inventory (Operating Plan family)

| Modal | Where | Class |
|---|---|---|
| `.sheet(item:)` Dose / Days / Time / Notes | PeptideExecution :68 | C (custom chrome on NavigationStack) |
| confirmationDialog "Pause <name>?" | :318 | D |
| confirmationDialog "Rewrite your dose history?" | :417 | D (not rendered in the locked design) |
| `Menu` Starting Today/Tomorrow | :285-300 | D control in a C card |
| `Menu` Start date (Today / Next dose / Pick a date…) | PeptideSupportSheets ~:215-230 | D control |
| `DateField` sheets (shared) | dose plan, schedule editor, supplement create, dose sheet | Shared; `.standard` style is legacy |
| Supplement Pause/Restore | domain :158-163 | No dialog |
| Inline-edit Cancel toggles (Recovery, legacy peptide) | toolbars | C |

No `.alert` is used anywhere in Presentation/OperatingPlan.

### 1.15 Release and test facts relevant to the redesign
- **UI tests:** there are no `operatingPlan.*` accessibility identifiers referenced by any UI test (`ios/PhysiqueOSUITests`). The only Operating Plan-adjacent UI test is `FoamRollingPriorityDetailUITests.swift`.
- **Unit tests:** `OperatingPlanReadModelTests` (1023 lines), `PeptideSupportEditorViewModelTests` (626) and `PeptideScreenPresentationTests` (262) cover logic and presentation helpers. A presentation rewrite leaves those mostly intact.
- **Token kits:** Build 89 added new per-family kits (`priority*`, `capture*`, `DateField.Style.capture`). The Operating Plan design says it is in the "locked dark/mineral system" shared with Priority Detail, so the `priority*` / `redesign*` tokens are the natural base. There is no Operating Plan kit yet.

---

## 2. Did Build 89 change Presentation/OperatingPlan?

**No.**
- `git log 96e724a9..51399425 -- '*OperatingPlan*' '*Peptide*'` returns **0 commits**.
- The diff stat for those paths is empty.
- The Operating Plan read and write networking, `OperatingPlanReadModel`, `AppDestination` and the router Operating Plan cases are also unchanged.

Build 89 changes that **touch the family indirectly**:
1. `5f5df553` (Priority Detail family, `ProductionDailyDriverAPI.swift` +8/-?) makes `destination(forActionHref:)` internal and adds `/evidence/photos`, `/evidence/dexa` and **`/profile/operating-plan/execution/dexa` → `.operatingPlanDexaAppointment`** (see 1.13).
2. The redesigned Priority Detail (Build 89) now hands off to three legacy Operating Plan children:
   - Foam → Recovery support;
   - paused peptide → Peptide Manage;
   - DEXA → DEXA appointment.
3. `SharedUI/DateField.swift` gained an opt-in `.capture` style. Operating Plan still uses `.standard`, so its visuals are unchanged.
4. `PhysiqueOSTheme.swift` gained the `priority*` and `capture*` tokens and Watch appearance persistence. The legacy tokens Operating Plan uses are unchanged. Appearance "Light" was renamed "Mineral Light".

Operating Plan therefore renders identically in Build 88 and Build 89.

---

## 3. You / Settings / Sources residuals

| Surface | Route | Source | Grammar | Class | Data / mutations | Notes |
|---|---|---|---|---|---|---|
| **You root** | You tab root | `Presentation/You/YouPlaceholderView.swift:6-178` | Redesign (`redesign*` ×48, `RedesignPageHeader`, `YouNavigationRow` 60pt rows) | **A** | None (navigation only) | **Copy defect persists:** "Your system is connected." (:98) and its check mark are unconditional, even in Sandbox or unpaired. The AUTHORITY and MODE metrics are correct. The status card uses hard-coded hex values (0xF7FBFA, a 0x0B6F69→0x112750 gradient) rather than tokens. The Build 89 diff only touched Settings and Appearance (Watch). |
| **Settings** | You → `.settings` (router :217) | `YouPlaceholderView.swift:212-255` | Redesign | **A** | None | The Appearance row detail now reads "iPhone X · Watch Y". There is a build label. |
| **Appearance: iPhone** (System / Dark / Mineral Light) | Settings → `.appearance` (router :219) | :257-280, `AppearanceOptionCard` :340-373 | Redesign | **A** | Local `AppAppearanceStore` (UserDefaults `physiqueos.appearance.preference.v1`) | Accepted in Build 87. |
| **Appearance: Apple Watch** (Dark / Mineral Light), **new in Build 89, Lane A `cb64e771`** | same page | :281-303, `WatchAppearancePreview` :396-416 | Redesign (same card grammar; miniature preview with hard-coded hex) | **A** (Lane A boards Founder-approved; physical acceptance pending) | `AppAppearanceStore.selectWatch` → `physiqueos.appearance.watch.v1`, pushed to the Watch on next connect (note :297) | — |
| **DEXA → Apple Health writeback** toggle + state label + "Retry writeback" | You root, Founder Production only (:52-54) | :129-157 + `.alert` opt-in :62-69 | Redesign surface (`redesignPaper/Ink/Teal`), with a system `Toggle`, `.bordered` button and system `.alert` | **B** | `dexaHealthKitWritebackCoordinator.enable / disable / reconcilePermanent` (HealthKit write authorization) | The locked You design moves end-user writeback status to **Data Sources** (Y04, which is deferred under Beta Readiness). So it is placed in an interim location. |
| **"Founder physical validation · Sep 12"** Write / Delete + confirmationDialog | You root, when writeback is enabled | :158-171 + dialog :70-88, `DEXAValidationAction` :432-441 | Redesign-tinted, with system `.borderedProminent` / `.bordered` buttons and a system dialog | **D now → E candidate** | `runPhysicalValidation(action: write/delete)`; writes or deletes HealthKit samples | A one-off validation harness that is live in Release (Cov Y09 "do not redesign"). Remove once the Founder confirms the Sep 12 validation is closed. |
| **Founder device connection**: authority picker + production pairing / recovery / reconnect / Disconnect | You → "Founder device connection" (:40-49) → `.founderServerConnection` (router :215) | `FounderServerConnectionView.swift:4-42` (picker), `ProductionFounderConnectionView` :363-~520 | Legacy (`OperatingPlanScreenHeader`, `StatusChip`, `SecureField`, `PrimaryActionButton`; 27 legacy tokens) | **D** (Cov Y07 "do not redesign") | Pairing, session recovery and revoke through `FounderServerAPI` | **Release seam persists:** the segmented `Picker("Native authority")` (:9-17) can switch to Sandbox in Release, and a fresh install still defaults to Sandbox (`App/AppEnvironment.swift:692`, `?? .sandbox`). The You row is styled in the redesign while the destination is legacy. |
| **Sleep canary + Sleep historical validation + historical Sleep import** | nested in the connected production view (:438) | `HealthKitSleepCanaryView.swift` (70), `HealthKitSleepValidationSection.swift` (73), `HealthKitSleepHistoricalEvidenceSection.swift` (37) | Legacy | **E** | HealthKit Sleep authorization, a 30-night read and a "Jul 6–Oct 6" historical import | The code says "TEMPORARY… Remove this view when Sleep itself graduates". Sleep→V3 graduation went LIVE on 2026-10-05 (Server `403ca549`). This is now obsolete and a removal candidate (the Founder should confirm the historical import is done). |
| **Network Diagnostics** + JSON `ShareLink` export | nested (:447), shown whether connected or not | `NetworkDiagnosticsSection.swift` (56) | Legacy | **D** (keep; engineering) | Local command-attempt log export | — |
| Sandbox connection ("Sandbox Weight Test") | picker → Sandbox | `FounderServerConnectionView.swift:44-360` | Legacy | G (Sandbox) | Sandbox Server pairing and weight test | Reachable in Release only through the picker. |
| Profile, Data Sources / Apple Health, Sign Out, Notifications | none | none | — | F (Beta Readiness, deliberately deferred) | — | Unchanged from Build 88 #98a. |

---

## 4. Other utility and secondary surfaces reachable in Founder Production

| Surface | Route | Source | Class | Finding |
|---|---|---|---|---|
| `DestinationPlaceholderView` ("Not implemented yet" + monospaced destination id, title "Coming Soon") | router `default:` (:221-222) and the production branch of `.evidenceRecoveryUpload` (:97-100) | `Presentation/Root/DestinationPlaceholderView.swift:9-29` (legacy) | **E** | `evidenceRecoveryUpload` producers are `LoggingSandboxStore` only. The Server has no `native.evidence-recovery-upload` producer (searched `src`). No Founder Production push hits `default:` (Health Metrics hidden). It is a safety net that would show engineering text if hit. Consider an honest "unavailable" in the redesign style, or make it DEBUG-assert. |
| Operating Plan status route | see 1.12 | router :199-210 | **E** | — |
| DEXA appointment production state | see 1.13 | — | **C, live** | The only *newly* reachable legacy utility surface in Build 89. |
| Training builder production state | see 1.11 | — | **E** | Copy says "legacy builder". |
| Tab bar | `RootTabView.swift` `.tint(PhysiqueOSTheme.accent)` | — | B (shell) | The tab bar tint is still the legacy accent (`0x8B8CFF` / `0x7655DC`), not `redesignPurple`. This is minor app-shell polish. |
| Peptide legacy detail and editor | see 1.5 | — | **E** | Compatibility path for pre-S4 Servers only. |

Nothing else production-reachable was found beyond the Build 88 list. Notification deep links, the Widget and the Live Activity all route to Priority, Briefing or Logger, which were redesigned in Build 89 or covered elsewhere.

---

## 5. Batching recommendation: Operating Plan / Peptides

**Assessment:** this is one design family with one shared kit, but it is **too large for one checkpoint**. Its size is comparable to Evidence Batch 3.
- **View code to rewrite:** about 3,650 LOC across 13 files:
  - landing 111, components 239, detail 206, editors 630, domain 279, peptide 587, sheets 477, dose plan 182, recovery 193, schedule editor 203, tracking 215, supplement support 159, supplement editor 167;
  - plus about 30 LOC of production DEXA and status states.
- **Logic left untouched:** about 2,800 LOC (`PeptideSupportEditorViewModel` 837, Sandbox store 686, read model 1328).
- **Surfaces:** about 17 production surfaces and about 85 distinct visual states.
- **Mutation commands:** 9 (nutrition, training, coaching, recurring-support, peptide-support, peptide-lifecycle, supplement-support, supplement-strategy, supplement-lifecycle). None change. This is a presentation-only rewrite over stable view models and APIs.
- **Testing:** there is no existing UI-test coverage for Operating Plan identifiers, so each checkpoint needs new UI and route tests plus dark/light screenshot proof against the boards.

**Recommended: one lane, four checkpoints, in this order:**

1. **OP-A: kit + read surfaces (about 700 LOC).**
   - The Operating Plan kit: header with no duplicate system title, section, row, field row, 44pt choice pill, editor chrome with a single Cancel/back, error banner, and an unavailable view with Retry.
   - Landing (with a retry).
   - Strategy detail ×4.
   - Tracking root.
   - Utility states:
     - DEXA appointment production state with an **"Open Coaching Updates" action**. This is now live from DEXA Priority and should be fixed first.
     - Status route.
     - Builder copy.
   - Boards: folders #1 and #4.
2. **OP-B: recurring support (about 750 LOC).**
   - Protocol domain (44pt actions).
   - Recovery support with the shared `OperatingPlanSupportScheduleEditor`.
   - Tracking support.
   - Supplement support and Supplement strategy edit, plus the Add Supplement decision.
   - This closes the Foam Priority → Recovery handoff.
   - Boards: #3 recovery and supplements, #4 tracking-edit.
3. **OP-C: Peptides (about 1,250 LOC, the highest risk).**
   - Manage simple screen.
   - Pause and Resume, with the Today/Tomorrow menu and dialog.
   - Advanced disclosure plus `PeptideDosePlanEditor`.
   - Dose history.
   - The 4 sheets.
   - Delete the legacy fallback (E).
   - Closes the paused-peptide Priority handoff.
   - Get a Founder answer on the undrawn "Rewrite history" dialog first.
   - Boards: #3 peptides and peptide-actions.
4. **OP-D: strategy editors (about 630 LOC).**
   - Nutrition, Training (with validation error), and the Coaching Updates composite (Photos weekly / monthly, DEXA, Notifications).
   - These are rarely used and form-heavy, so they come last.
   - Boards: #2 and #4 coaching-edit and photos-monthly.

**Estimate:** about 4 checkpoint-days of Claude lane time (OP-C is the largest). If parallel lanes are wanted, OP-C (Peptides) is the only piece large and self-contained enough to split off after OP-A lands the kit. OP-B and OP-D can share a lane.

**Fold-in cleanups from the You area** (small and independent; can ride with OP-A or a separate hygiene commit):
- remove the Sleep canary, validation and import (E);
- retire the Sep 12 DEXA validation controls after Founder confirmation;
- fix the unconditional "Your system is connected." copy;
- decide whether to `#if DEBUG` the Release authority picker and default (Beta item).
