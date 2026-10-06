> Read-only sub-audit of shipped Build 89 `51399425`, produced in this lane. Where it mentions "another lane editing" Energy/Weight/EnergyAPI/AppEnvironment in the worktree, that was this lane's own in-progress Energy/Recovery candidate; all citations are against `51399425`.

# Build 89 re-classification: Home children, Priority Detail, Daily capture, Briefings, Widget, Live Activity, Watch

- Tree audited: **exact Build 89 source `51399425`**. Counts and line numbers come from `git archive 51399425 ios/PhysiqueOS`, not the working tree: another lane is editing `EnergyHistoryView.swift` and `WeightHistoryView.swift` in the worktree.
- Baseline: Build 88 audit (`96e724a9`) rows #1-#17, #67-#73, #98-#101, W1-W11.
- Build 88 to 89 changes in scope: Lane A `5f5df553` (Priority Detail family), `97028dbc` (daily capture), `461b3651` + `3d112478` + `1ef4cca2` (Live Activity), `cb64e771` + `7932f963` (Watch). Lane B `ad8a561a`, `c3c5966b`, `511bc4b2`, `00fcbc29`, `156808fa` (Briefings). Widget `0ff73019` (micro-fix). Home child views were not touched; `HomeView.swift` only gained a `#if DEBUG` Confidence review seam.
- Read-only. Nothing was edited, built, run or committed.
- DEBUG-only review seams (`FoamRollingPriorityPilotLaunchConfiguration`/`PriorityFamilyReviewFixtures`, `DailyCaptureReviewFixture`, `ConfidenceReviewFixture`, `BriefingReviewLaunchConfiguration`, RootTabView review routes) are all `#if DEBUG` and are **not** counted as production.

**Class key (this audit):**

| Class | Meaning |
|---|---|
| A | Redesigned in Build 89 or earlier |
| B | Partial / mixed grammar; legacy child elements named with file:line |
| C | Still old presentation |
| D | Intentionally platform-specific; no redesign needed |
| E | Obsolete or unreachable |

**Grammar test.** A surface counts as redesigned when it uses one of these:
- `PhysiqueOSTheme.redesign*`, `priority*` or `capture*` tokens;
- the BriefingPalette / BriefingPresentation kit;
- the EvidenceKit / Workflow kit;
- the Lane A `WorkoutActivityTheme` or Watch tokens.

**Note on `PhysiqueOSTypography`.** The Priority Detail family's locked styles (`priorityDetail*`) are defined inside this enum, so the enum alone does not signal legacy grammar.

---

## 1. Executive summary

- **Priority Detail (#9-#15):** now **A** for every type and state.
  - Foam, generic, peptide dose-aware, paused, supplement, Morning Weigh-In (open and completed), Photos/DEXA evidence, completed, skipped, setup-required, not-found and failed.
  - Every type and state uses one `priority*` token template.
  - The Build 88 Foam private hex palette and the legacy no-sections fallback card are gone.
- **Daily capture (#16, #17, #7):** now **A**.
  - Morning Check-In (every child state), manual/backdated weight and the Home Confidence sheet are on `capture*` tokens.
  - **Residual:** the shared `DateField` picker *sheet* is still legacy-tinted (B).
- **Briefings (#67-#73):** now **A**.
  - Detail chrome and states, Weekly, Midweek, Monthly, Photo, DEXA and History are on the BriefingPresentation kit.
  - Zero `PhysiqueOSTheme`, `CardContainer` or legacy-component references remain in any Briefing file.
  - `WeeklyEnergyCard` is now only a label-helper `enum` (`WeeklyBriefingSections.swift:262`), not a view.
  - Legacy `chartScrub` now survives only in Energy (`EnergyChartViews.swift:105,163`, excluded family) plus its definition (`ChartInteraction.swift:86`).
- **Home root children (#2-#6):** **unchanged by Build 89.** They are still mixed (B) or old (C):
  - the Today's Priorities tile internals;
  - the morning grouped session card;
  - older briefing cards;
  - the additional-goals card;
  - the no-goal hero;
  - loading / failed / reconnect / notices.
- **Widget (#98, #99):** Build 89 changed only the Refresh glyph color (purple to the teal action accent). The widget remains **B** against the locked widget VISUAL-SPEC (deltas listed below).
- **Live Activity / Dynamic Island (#100, #101) and Watch (W1-W11):** **A**.
- **New production-reachable legacy handoff, introduced by Build 89 routing:**
  - Priority Detail (DEXA, appointment stage) shows "View DEXA Appointment".
  - That button maps `/profile/operating-plan/execution/dexa` to `.operatingPlanDexaAppointment` (`ProductionDailyDriverAPI.swift:1227`). The Server emits this href at `src/domain/services/PriorityDetailService.js:986`.
  - It lands on `OperatingPlanDexaAppointmentView`. In Founder Production that view is a legacy dead end: `PhysiqueOSTheme.background`, the system nav title "Next DEXA Scan", and a plain `OperatingPlanUnavailableView` text, "Manage your production DEXA schedule in Coaching Updates…", with no link (`OperatingPlanDexaAppointmentView.swift:19-20,34`; `OperatingPlanComponents.swift:184-192`).
  - This route was an orphan in Build 88. The view belongs to the excluded Operating Plan family, but the handoff starts from a redesigned A surface.

---

## 2. Home root children

| # | Surface | Route | Source file:line | Class | Evidence | Notes |
|---|---|---|---|---|---|---|
| 1 | Home root, loaded (header, journey field, action + Latest Briefing strip, Today's Priorities card shell) | Home tab | `HomeView.swift:214-310`; `HomeJourneyFieldView.swift` (incl. `HomeActionBriefingStrip` :321); `TodaysFocusCardView.swift:20-58` | A | `redesignCanvas` (:37), `redesignPaper`/`redesignRule`/`redesignPurple` shell. Build 89 diff: one copy trim at `HomeJourneyFieldView.swift:301-303` (" to goal target") and a `#if DEBUG` Confidence seam at `HomeView.swift:103-108` | Reference only |
| 2a | Today's Priorities **tiles** | Home → inside #1 | `FocusTileView.swift:65-160` | **B** | Shell A; tile internals legacy: `item.color.background` fill :93; `PhysiqueOSTheme.textPrimary` :109,:118; `textMuted` :113; legacy `PhysiqueOSTypography.focusLabel/focusSubtitle/focusBadge` :108,:112,:122; `StatusChip(text: actionLabel, color: .effort)` :133; completion circle `surfaceElevated` :153 | Unchanged since `c4a74ad0`; no Build 89 commit |
| 2b | Morning **grouped session card** (`SessionPriorityCardView`) | Home, when an item has `sessionItems` (Morning Check-In group) | `TodaysFocusCardView.swift:61-130` | **C** | Fully legacy: `IconBadge` :73; `textPrimary` :77,:95,:117; `textSecondary` :81; `StatusChip("Completed"/"Continue")` :86; `textMuted` :92,:102; `accent` progress capsule :110; `surfaceElevated` card :123 | Daily-frequency surface; opens the A Morning Check-In |
| 2c | Today's Priorities header labels | inside #1 | `TodaysFocusCardView.swift:23-30` | A (minor) | `redesignPurple` color but raw `.font(.system(size: 11, weight: .bold))`, not a redesign type token | Cosmetic only |
| 3 | Older briefing cards (index ≥1) | Home, `briefingCards.count > 1` | `HomeView.swift:247-255` → `BriefingCardView.swift:4-40` | **C** | `CardContainer` :10; `SectionHeading(card.sectionLabel)` :12; `accent` link :19; `IconBadge(brain.head.profile)` :23; `textPrimary/textSecondary` :28,:33,:38 | Now hands off to a fully redesigned Briefing Detail (A), so the old card sits next to the redesigned Latest Briefing tile |
| 4 | Additional goals card (2+ goals) | Home, `goals.count > 1` | `HomeView.swift:257-259` → `GoalRowView.swift:313-330` (`GoalsCardView`), rows :28-120 | **C** | `CardContainer` :318; `SectionHeading("Your Goals")` :320; `IconBadge` :42; `accent` :48; `textPrimary/Secondary/Muted` :52-:62,:106-:116 | Conditional; the Founder has one primary goal (inferred) |
| 5 | No-goal hero fallback | Home, `home.goals` empty | `HomeView.swift:233-239` → `HomeHeroCardView.swift:7-105` | **C** | `CardContainer` :12 (`surfaceElevated` :16); `SectionHeading("Trajectory")` :19; `IconBadge` :24; `accent` :27,:104; `textPrimary/Secondary` :32,:41,:82,:85 | Future-user path; still opens the A Confidence sheet |
| 6a | Home loading | Home | `HomeView.swift:195-198` | **C** | `ProgressView().tint(PhysiqueOSTheme.accent)` (purple) | — |
| 6b | Home failed | Home | `HomeView.swift:199-203` | **C** | Raw `Text` `.font(.system(14))` + `textSecondary`; no retry control | — |
| 6c | Reconnect required | Home | `HomeView.swift:204-213` | **C** | `textSecondary` + legacy `PrimaryActionButton("Reconnect this iPhone")` :210 | Pushes `FounderServerConnectionView` (retained C in Build 88 #95) |
| 6d | `NotificationsDisabledNotice` | Home, notifications denied | `HomeView.swift:345-361` | **C** | `CardContainer(padding: .sm)` :347; `textSecondary` :351,:354; `PhysiqueOSTypography.caption12Medium` :353 | — |
| 6e | `LastKnownHomeNotice` | Home, showing cached Home | `HomeView.swift:363-385` | **C** | `ProgressView().tint(textSecondary)` :374-376; `textSecondary` :382 | — |
| 6f | Priority completion-failure alert | Home tile completion error | `HomeView.swift:89` | D | System `.alert` | Fine as system |
| — | Notification deep links → Priority Detail / Briefing Detail | `RootTabView.onOpenURL`, notification coordinator | — | routing | Both destinations are now A | The Build 88 navigation-integrity item "notification taps land on legacy Priority / Briefing Detail" is **resolved** |

---

## 3. Priority Detail family (#9-#15)

All variants render through one template. Chrome is `PriorityDetailView.swift:31-125`:
- `priorityCanvas`;
- the "‹ Home" crumb and `priorityRule` divider;
- nav bar and tab bar hidden.

The template is `PriorityDetailPresentation.template` at `PriorityReadModel.swift:226-241`.

| # | Surface / state | Route | Source file:line | Class | Evidence | Notes |
|---|---|---|---|---|---|---|
| 9 | Foam Rolling (open / setup-required / complete / skipped) | Home tile / notification → `priorityDetail` / `priorityOccurrence` | `PriorityDetailView.swift:226-241` (`.continueAction`, id `priorityDetail.reviewSupport`), sections :493-530 | A | `priority*` tokens + `PriorityDetailButton(.navy)`; the Build 88 private palette is gone (`foamRollingContent` removed) | "View Support" hands off to `OperatingPlanRecoverySupportView` (excluded family; legacy `CardContainer` ×2, `PrimaryActionButton` ×2) |
| 10 | Generic / reminder (manual Mark Complete) | same | `:252-298` `completionControls`, sections :493-530 | A | `PriorityDetailButton("Mark Complete", .navy)` :272; plain "Mark Skipped" in `priorityMuted` :277-282 | — |
| 10a | No-sections fallback ("What") | Sandbox/cached payload without `detailSections` | `:553-564` | A | Reuses `sectionView` + `priorityRule` | — |
| 11 | Peptide dose-aware: "Took a different amount?" editor (unchanged / changed / invalid caption) | same | `:301-345` | A | `prioritySurfaceRaised→prioritySurface` gradient, `priorityAmber` invalid caption | `NumericEditField` well with `priorityCanvas`/`priorityRule` |
| 11a | Paused peptide notice + "Go to <peptide>" | same, `occurrence.paused` | `:350-382` | A | `priorityAmber` notice, `PriorityDetailButton(.amber)` | Handoff to `OperatingPlanPeptideExecutionView` (excluded family, legacy: `CardContainer` ×5, `PrimaryActionButton` ×6, `StatusChip`, `IconBadge`) |
| 12 | Supplement | same | template `.manual` / `.continueAction` | A | Same template as #10 | — |
| 13 | Morning Weigh-In, open ("Evidence-driven", "Log Weight") and completed ("Occurrence weight", "View Weight") | same | `:435-488` `morningEvidenceCard` + `miniButton` | A | `priorityTeal`/`priorityNavy` gradient, `priorityDetailMetric` | "Log Weight" → Morning Check-In (A). "View Weight" → Weight Evidence (Batch 3). The Build 88 dead `morningWeightCard` is removed |
| 14a | Progress Photos evidence-driven (banner + "Upload Photos") | same; Server href `/evidence/photos` | `:406-430` `evidenceBanner`; action :222-229; mapping `ProductionDailyDriverAPI.swift:1224-1226` | A | `priorityEvidenceStart/End` banner, `PriorityDetailButton(.evidence)` | The Build 88 ledger delta (Photos/DEXA showed no action button) is **fixed**: `.photoUpload` → `ProductionEvidenceUploadView` (Batch 3, A) |
| 14b | DEXA evidence-driven, upload stage ("Upload DEXA Results") | same; href `/evidence/dexa` | same | A | as above → `.dexaUpload` → `ProductionEvidenceUploadView` (A) | — |
| 14c | **DEXA appointment stage ("View DEXA Appointment")** | same; href `/profile/operating-plan/execution/dexa` (Server `PriorityDetailService.js:986`) | Priority `:222-229` (A) → `ProductionDailyDriverAPI.swift:1227` → `AppDestinationRouterView.swift:211-212` → `OperatingPlanDexaAppointmentView.swift:17-36` | **Target is C** | Founder Production branch :19-20 renders `OperatingPlanUnavailableView` (`OperatingPlanComponents.swift:184-192`: `PhysiqueOSTypography.cardBody14Medium` + `textSecondary`) on `PhysiqueOSTheme.background` :34 with system `.navigationTitle("Next DEXA Scan")` :35 | **New in Build 89:** a production-reachable legacy dead end. The text names Coaching Updates but gives no link. The view is in the excluded Operating Plan family; flag to that owner or change the Priority mapping |
| 15a | Completed terminal row | same | `:217-220`, `:385-402` | A | `priorityGreen` row | — |
| 15b | Skipped terminal row | same | `:213-216` | A | `prioritySurface` row | — |
| 15c | Mark Skipped `confirmationDialog` | same, `priority.skippable` | `:284-297` | D | System confirmation dialog; copy from `skipConfirmationMessage` :622-626 | Intentionally system |
| 15d | Loading | same | `:82-85` | A | `ProgressView().tint(priorityTeal)` | — |
| 15e | Not found (`.loaded(nil)`) | same | `:86-87` → `:568-606` `unavailablePage` | A | `priorityRed` glyph, `priorityDetailErrorTitle`, "Try Again" `.navy` | — |
| 15f | Failed load / failed complete / failed skip / stale version | same | VM `PriorityDetailViewModel.swift:276,302,332,379` → `unavailablePage` | A | Same locked unavailable page | — |
| 15g | No action (`.noAction`) | same | `:244-245` | A | Header + sections only | — |

**Priority navigation notes (not legacy grammar):**
- The crumb is hard-coded "‹ Home" (`PriorityDetailView.swift:107`). Priority Detail is also pushed from the Operating Plan peptide "Open next dose" flow (`PeptideSupportSheets.swift:160-163`, You stack). There the crumb says Home but pops back to the Peptide page.
- Morning Check-In's crumb is "Home" (`ManualWeighInView.swift:305`). When it is reached from Priority Detail "Log Weight", it pops back to Priority Detail.

---

## 4. Daily capture (#7, #16, #17)

| # | Surface / state | Route | Source file:line | Class | Evidence | Notes |
|---|---|---|---|---|---|---|
| 16 | Morning Check-In shell (crumb, hero "Good morning" / "Weigh-in complete") | `checkIn(morning…)` from Home tile, priority notification, Priority "Log Weight" | `Logging/ManualWeighInView.swift:243-379` | A | `captureCanvas` :358, `CaptureCrumb` :305, `CaptureHero` :308-312; capture kit :1-240 (`CaptureType`, `captureSurface`, `captureInputWell`, `CapturePrimaryButton`, `CaptureMessage`) | Lane A `97028dbc` |
| 16a | Yesterday's unfinished priorities: Completed / Skipped / Add note dispositions | same | `:322-330`, `:429-465` | A | `captureTeal` selected, `captureInput`, `captureRule` | — |
| 16b | Per-priority optional note (`TextEditor`) | same | `:467-489` | A | `captureInput` well, `CaptureType.note`; Build 88's `TextEditor` on `surfaceMuted` is gone | — |
| 16c | Weight field (74 pt well) | same | `:382-399` | A | `captureInputWell(minHeight: 74)`, `captureInk` | — |
| 16d | Validation / error messages ("Choose an outcome…", "Enter a valid weight.", context/occurrence failures, network error) | same | `:336-339`, `CaptureMessage` :201-240; tones :225-228 | A | `captureRed` error tone | — |
| 16e | Reconciling ("accepted and is still reconciling") | same | `:658-660`; tone `.processing` :378-379 | A | `captureAmber` processing tone | — |
| 16f | Submitting ("Saving…") | same | `:340` | A | `CapturePrimaryButton(enabled: false)` | — |
| 16g | Complete panel + "Return Home" | same | `:316-319`, `:401-425` | A | `captureGreen`, `captureSurface` | — |
| 16h | Production read loading / read failure | same | `:371` (`productionCheckIn = try? await …`) | A (state gap) | No loading or failed presentation: the field is simply empty, and a read failure shows only on save ("Today's check-in context could not be loaded.") | Behavior gap, not legacy grammar |
| 16i | Sandbox-only cards: evidence recovery, briefing reconciliation, Recovery Evidence form | Sandbox authority only (`showsSandboxCards` :281-286) | `:491-576` | E (prod) / A | Restyled with capture tokens anyway; Recovery form uses system `Picker(.menu)` | Not production |
| 17 | Manual / backdated weight (Date measured, Weight, Unit menu, Save, Return to Log) | Log "Log weight for another date" (`UploadCardView.swift:25`); intake Weight handoff (`ProductionEvidenceUploadView.swift:104`) → `.manualWeighIn` | `ManualWeighInView.swift:673-893` | A | `captureCanvas`, `CaptureCrumb("Log")`, `captureSurface`, `captureInputWell`, Unit `Menu` well :779-795, `CaptureMessage` error/processing/success, `CaptureSecondaryButton("Return to Log")` | Existing-value load failure shows an error `CaptureMessage` (:869-873) |
| 17a | `DateField` capture well (`style: .capture`) | inside #17 | `SharedUI/DateField.swift:37-47` | A | `captureFont(CaptureType.field)`, `captureInk`, `captureInputWell()` | Additive style from `3d112478` |
| 17b | **`DateField` picker sheet** (graphical DatePicker, Today, Done) | tap the date well in #17; also every other `DateField` host (Operating Plan editors, Sandbox intake, You manual date) | `SharedUI/DateField.swift:78-102` | **B** | Kept on purpose as the shared system sheet ("Manual weight keeps the shared DateField sheet", `3d112478`), but still legacy-tinted: `.tint(PhysiqueOSTheme.accent)` :82 (purple `0x8B8CFF`/`0x7655DC`) and `.background(PhysiqueOSTheme.background)` :84 (`0x080D18`/`0xF0EEE6`) vs `captureCanvas` (`0x06131E`/`0xEFEEE7`); system nav title | Graphical picker is platform (D-like); only the tint and background are legacy. The standard (non-capture) label style :48-70 is legacy but used only by excluded or Sandbox hosts |
| 7 | Home Confidence sheet (also opened from Goal Detail legacy fallback) | Home confidence ring (`HomeView.swift:98-102`); `GoalDetailView.swift:111` | `Home/ConfidenceDetailSheet.swift:12-195` | A | `captureSurface` + `presentationBackground` :76-77, `capturePurple` eyebrow :86, `ConfidenceSheetRing` :176-190 on capture tokens; detents medium/large | Build 88's "redesigned ring opens legacy sheet" is **resolved** |

---

## 5. Briefings (#67-#73)

The Briefing files contain **no** `PhysiqueOSTheme`, `CardContainer`, `SectionHeading`, `PrimaryActionButton`, `StatusChip`, `IconBadge` or `chartScrub` (verified by grep on `51399425`). They use:
- `BriefingPalette`;
- `.briefingText(.j(…))`;
- the BriefingPresentation kit (`SharedUI/BriefingPresentation.swift`, `BriefingSection`, `BriefingStateView`, `BriefingHeroField`, `BriefingCoachFinale`, `BriefingRevisionBanner`, …).

The one `SectionHeading`/`StatusChip` hit in `BriefingPresentation.swift:11` is a doc comment.

| # | Surface / state | Route | Source file:line | Class | Evidence | Notes |
|---|---|---|---|---|---|---|
| 67a | Detail chrome (Home / History pills, page canvas, no nav bar) | Home strip, older cards, History, `briefing.ready` notification, Photos "Read Photo Briefing", Goal Detail coach take → `briefingDetail` | `Briefings/BriefingDetailView.swift:38-66`, `:183-203`; `BriefingDetailPreHeroNavigation` (`BriefingPresentation.swift:683`) | A | `BriefingPalette.standard.page` | — |
| 67b | Loading | same | `BriefingDetailView.swift:104-105` → `BriefingStateView` (`BriefingPresentation.swift:1332-1388`) | A | `ProgressView().tint(c.cyan)` | — |
| 67c | Unavailable (`loaded(nil)`) | same | `:113-114` | A | `BriefingStateView(.glyph("▦"))` | — |
| 67d | Not ready + Check Again (404) | same | `:115-122` | A | `BriefingStateView` with action | — |
| 67e | Failed + Try Again | same | `:123-130` | A | `BriefingStateView(.glyph("!"))`; Build 88's unstyled `Text` + `.borderedProminent` is gone | — |
| 67f | Revision banner | same, `revisionProvenance` present | `:109-111` → `BriefingRevisionBanner` (`BriefingPresentation.swift:1858`) | A | Kit component | — |
| 67g | Loaded artifact whose cadence payload is absent, or `.daily` cadence | same (edge) | `BriefingDetailView.swift:150-174` (`if let weekly…`, `case .daily: EmptyView()` :172) | E (edge) | Renders only the nav pills with an empty body, no state message | Not legacy grammar; only reached if mapping yields a cadence without a payload (`BriefingCadenceBody.route` → `.none`) |
| 68 | Weekly | `briefingDetail` (weekly) | `WeeklyBriefingSections.swift` (314 lines) | A | Lane B `ad8a561a`, `00fcbc29`; Energy chart = `BriefingEnergyBars` with `EvidenceHorizontalScrubGesture` (`BriefingPresentation.swift:1216-1330`, gesture :1301-1302) | `WeeklyEnergyCard` is now a label-only `enum` (:262), used for finding labels :196-197; no legacy view or scrub |
| 69 | Midweek | `briefingDetail` (midweek) | `MidweekBriefingSections.swift` | A | `ad8a561a`, `828ddb6b`, `00fcbc29`; `default: EmptyView()` :140 for unknown modules (correct; Recovery withheld) | — |
| 70 | Monthly | `briefingDetail` (monthly) | `MonthlyBriefingSections.swift` | A | `c3c5966b` | Goal Milestone "View Goal Completion ›" → Goals (Batch 1) |
| 71 | Photo event briefing | `briefingDetail` (photo); Photos "Read Photo Briefing" (`PhotosHistoryView.swift:246`) | `PhotoBriefingSections.swift:18-350` | A | `c3c5966b`; `BriefingEvent*` kit | — |
| 71a | Photo viewer: paired Previous / Current comparison (`PhotoComparisonViewer`) | tap a comparison pane (:167) → `.fullScreenCover` :42-44 | `PhotoBriefingSections.swift:806-1034` | A (status only; owned by another lane) | Briefing-kit styled (`briefingText`, `BriefingEventPalette.teal`), synchronized zoom `BriefingPairedZoomView` | New in Build 89; closes the Build 88 ledger delta "paired viewer" |
| 71b | Photo viewer: standard single-photo inspection | `.photoInspection($inspection)` :41 | `SharedUI/PhotoInspectionViewer.swift` (last changed `9d2d0e06`, Batch 3) | A (status only; owned by another lane) | Batch 3 viewer; residual legacy tint in its unavailable/retry state: `PhysiqueOSTypography.caption12Semibold` :452 and "Try again" `.foregroundStyle(PhysiqueOSTheme.accent)` :456 | Minor; owned by the viewer lane |
| 72 | DEXA event briefing | `briefingDetail` (dexa) | `DEXABriefingSections.swift` | A | `511bc4b2`, `08408b81`, `00fcbc29`, `156808fa` | Handoff action :195 → Server destination |
| 73 | Briefing History (loading / failed / empty / loaded rows) | Detail pills; Home action tile → `briefingList` | `BriefingHistoryView.swift:1-270` | A | `BriefingHistoryPalette`; loading `ProgressView().tint(BriefingHistoryPalette.teal)` :138; states :136-160; type accents :88-93 | Row glyph uses raw `.font(.system…)` :232 (kit-colored; cosmetic) |
| — | Legacy `chartScrub` anywhere | — | Definition `SharedUI/ChartInteraction.swift:86`; uses only `Evidence/EnergyChartViews.swift:105,163` | (excluded) | Energy is outside this audit; no Briefing uses it | Build 88 P0 vertical-swipe trap on Weekly/Midweek is **resolved** |

---

## 6. Widget extension (#98, #99)

The widget source is `ios/PhysiqueOSShared/HomeLoggedTodayWidgetView.swift` (523 lines), with `ios/PhysiqueOSLiveActivity/HomeLoggedTodayWidget.swift`.

**Build 89 change:** only `0ff73019` "fix(widget): match refresh to logger accent".
- The Refresh glyph moved from `palette.accent` (purple `0x9F7CFF`/`0x7255DC`) to `palette.refreshAccent = actionAccent` (teal `0x20BDB2`/`0x0B817F`) at :107 and :169.
- The action gradient now references `actionAccent` (:497, :510).
- `HomeWidgetPalette` is now internal rather than private (for tests).
- Nothing else changed. The file history is otherwise `5d727b37` (appearance), `745fb22d`, `82040143` (V1).

| # | Surface | Route | Source file:line | Class | Evidence (vs locked `final-design-batch3-home-widget-closeout-20261004/VISUAL-SPEC.md` on main) | Notes |
|---|---|---|---|---|---|---|
| 98 | Widget small (fresh / aging / stale / offline / waiting / unavailable / redacted) | Widget; whole-widget URL → Logger; Refresh intent | `HomeLoggedTodayWidgetView.swift:91-140` + states :140-150, :410-432 | **B** | Already on the widget-owned Dark/Mineral palette (container, text, secondary, nutrition, activity, weight values match the spec). Remaining deltas: (1) **SF Rounded** throughout (`design: .rounded`, e.g. :95, :99, :126, :129) vs spec "SF/system typography"; (2) Refresh hit target 24 pt (:108) vs spec ≥44 pt (open accessibility delta); (3) teal/action values `0x20BDB2→0x123D61` (:491, :497) vs spec teal `#3AD6C6`, gradient `#149E9B→#174B78` (dark); (4) title 15 pt vs spec small primary metric 23 pt (inferred from spec typography list); (5) no decorative trajectory arc found (inferred) | Spec deltas are source-vs-spec; no render was done |
| 99 | Widget large (rows → Training Day / Nutrition / Activity Day / Weight; Start/Resume; Refresh) | Widget | `:78-89`, rows :230-400 | **B** | As #98, plus: **Training row still purple** (`palette.training` :240 = `0x9F7CFF` dark :493 / `0x7255DC` light :506) vs spec "Teal anchors interaction and Training"; Refresh 28 pt (:170) vs ≥44 pt; divider solid `0x203441`/`0xCAD4CF` (:490, :503) vs spec rgba | Nutrition row still lands on Nutrition history, not the day (Build 88 nav note) |

---

## 7. Live Activity / Dynamic Island and Watch (confirmation only)

| # | Surface | Source | Class | Evidence |
|---|---|---|---|---|
| 100 | Live Activity Lock Screen (all states) | `PhysiqueOSShared/WorkoutLiveActivityViews.swift` | A | `461b3651` locked translation: teal current/action, green rest, amber needs-update; Lock Screen follows system appearance via `WorkoutActivityTheme.of(colorScheme)` (:192-198, :359-361); `3d112478` switched to sRGB colors and system faces (ActivityKit encoder crash fix), with `WorkoutActivityPalette` teal `0x3BD2CA` (:59-69); `1ef4cca2` stopwatch glyph |
| 101 | Dynamic Island (expanded / compact / minimal) | `PhysiqueOSLiveActivity/WorkoutLiveActivityWidget.swift` | A | Same commit; Island stays system black (doc :18) |
| W1-W11 | Watch, all screens | `PhysiqueOSWatch/WatchWorkoutViews.swift` | A | `cb64e771` locked utility translation, Jakarta, Dark + Mineral palettes; independent Watch appearance (`PhysiqueOSWatchApp.swift:12`, `WatchWorkoutStore.swift:273-330`); `7932f963` Option A clock capsule (Founder approved). Functional items: Complete Set gating and timed-set `durationText` also landed in `cb64e771` |

---

## 8. Production-reachable legacy child states in these families (action list)

| Priority | Item | Location |
|---|---|---|
| P1 (new) | Priority DEXA appointment-stage "View DEXA Appointment" lands on a legacy dead-end page in Founder Production | `ProductionDailyDriverAPI.swift:1227`; `OperatingPlanDexaAppointmentView.swift:19-20,34-35` |
| P1 (daily) | Morning grouped session card on Home | `TodaysFocusCardView.swift:61-130` (C) |
| P2 | Today's Priorities tile internals | `FocusTileView.swift:93,108-122,133,153` (B) |
| P2 | Older Home briefing cards | `BriefingCardView.swift:10-38` (C) |
| P2 | Home loading / failed / reconnect / notices | `HomeView.swift:195-213,345-385` (C) |
| P2 | `DateField` picker sheet legacy tint and background | `SharedUI/DateField.swift:82,84` (B) |
| P2 | Widget small/large vs locked spec (Rounded type, purple Training, 24/28 pt Refresh, gradient values) | `HomeLoggedTodayWidgetView.swift` (B) |
| P3 (conditional) | Additional-goals card; no-goal hero | `GoalRowView.swift:313-330`; `HomeHeroCardView.swift` (C) |
| P3 | Photo inspection viewer retry tint (other lane) | `PhotoInspectionViewer.swift:452,456` |
| P3 | Priority / Morning Check-In crumb labels fixed to "Home" regardless of origin | `PriorityDetailView.swift:107`; `ManualWeighInView.swift:305` |
| Edge | Briefing cadence without payload renders an empty body | `BriefingDetailView.swift:150-174` |

**Handoffs from A surfaces into excluded legacy families** (owned by the Operating Plan agent):
- Foam "View Support" → `OperatingPlanRecoverySupportView`.
- Paused peptide "Go to …" → `OperatingPlanPeptideExecutionView`.
- DEXA appointment → `OperatingPlanDexaAppointmentView` (above).

---

## 9. Legacy component grep (entire `ios/PhysiqueOS`, exact `51399425` tree)

**Method:**
- Swift files only.
- Lines whose trimmed text starts with `//` are excluded, so doc comments such as `BriefingPresentation.swift:11`, `ActivityDayView.swift:16`, `TrainingDayView.swift:13` and the `Contracts/*ReadModel.swift` comments do not count.
- `chartScrub` matches the legacy modifier, not `evidenceChartScrub`.
- `PhysiqueOSTypography` is shown with the count of redesign-era `priorityDetail*` styles in parentheses. Batch 1 Goals surfaces also use this enum, so it is a weak legacy signal by itself. `CardContainer` / `SectionHeading` / `PrimaryActionButton` / `StatusChip` / `IconBadge` / `chartScrub` / `.borderedProminent` are the strong signals.

| File | Scope | CardContainer | SectionHeading | PrimaryActionButton | StatusChip | IconBadge | chartScrub | .borderedProminent | PhysiqueOSTypography (of which redesign-era priorityDetail*) |
|---|---|---|---|---|---|---|---|---|---|
| `Presentation/Evidence/RecoverySleepViews.swift` | excluded family (Energy/Recovery/Sleep/OpPlan) | 24 | 0 | 0 | 0 | 0 | 0 | 0 | 68 |
| `Presentation/Evidence/EvidenceReviewDetailView.swift` | in scope / other | 8 | 0 | 5 | 0 | 0 | 0 | 0 | 44 |
| `Presentation/OperatingPlan/OperatingPlanPeptideExecutionView.swift` | excluded family (Energy/Recovery/Sleep/OpPlan) | 5 | 0 | 6 | 1 | 1 | 0 | 0 | 15 |
| `Presentation/Logging/EvidenceIntakeView.swift` | in scope / other | 8 | 0 | 1 | 0 | 0 | 0 | 1 | 35 |
| `Presentation/OperatingPlan/OperatingPlanStrategyEditorView.swift` | excluded family (Energy/Recovery/Sleep/OpPlan) | 7 | 0 | 3 | 0 | 0 | 0 | 0 | 20 |
| `Presentation/You/FounderServerConnectionView.swift` | in scope / other | 3 | 0 | 4 | 2 | 0 | 0 | 0 | 19 |
| `Presentation/OperatingPlan/OperatingPlanDexaAppointmentView.swift` | excluded family (Energy/Recovery/Sleep/OpPlan) | 6 | 0 | 2 | 0 | 0 | 0 | 0 | 11 |
| `Presentation/Evidence/EnergyHistoryView.swift` | excluded family (Energy/Recovery/Sleep/OpPlan) | 4 | 0 | 0 | 0 | 1 | 0 | 0 | 20 |
| `Presentation/OperatingPlan/PeptideSupportSheets.swift` | excluded family (Energy/Recovery/Sleep/OpPlan) | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 10 |
| `Presentation/OperatingPlan/PeptideDosePlanEditor.swift` | excluded family (Energy/Recovery/Sleep/OpPlan) | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 10 |
| `Presentation/OperatingPlan/OperatingPlanStrategyDetailView.swift` | excluded family (Energy/Recovery/Sleep/OpPlan) | 3 | 0 | 1 | 1 | 0 | 0 | 0 | 4 |
| `Presentation/OperatingPlan/OperatingPlanSupplementSupportView.swift` | excluded family (Energy/Recovery/Sleep/OpPlan) | 3 | 0 | 2 | 0 | 0 | 0 | 0 | 1 |
| `Presentation/Logging/LocalEvidenceReviewView.swift` | in scope / other | 0 | 0 | 2 | 0 | 1 | 0 | 1 | 47 |
| `Presentation/Home/GoalRowView.swift` | in scope / other | 1 | 1 | 0 | 0 | 2 | 0 | 0 | 11 |
| `Presentation/OperatingPlan/OperatingPlanComponents.swift` | excluded family (Energy/Recovery/Sleep/OpPlan) | 1 | 1 | 0 | 1 | 1 | 0 | 0 | 10 |
| `Presentation/OperatingPlan/OperatingPlanTrackingView.swift` | excluded family (Energy/Recovery/Sleep/OpPlan) | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 4 |
| `Presentation/OperatingPlan/OperatingPlanSupplementEditorView.swift` | excluded family (Energy/Recovery/Sleep/OpPlan) | 3 | 0 | 1 | 0 | 0 | 0 | 0 | 4 |
| `Presentation/OperatingPlan/OperatingPlanRecoverySupportView.swift` | excluded family (Energy/Recovery/Sleep/OpPlan) | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 1 |
| `Presentation/OperatingPlan/OperatingPlanProtocolDomainView.swift` | excluded family (Energy/Recovery/Sleep/OpPlan) | 1 | 0 | 0 | 1 | 1 | 0 | 0 | 8 |
| `Presentation/Goals/PhaseTransitionView.swift` | in scope / other | 1 | 0 | 2 | 0 | 0 | 0 | 0 | 6 |
| `Presentation/Home/BriefingCardView.swift` | in scope / other | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 4 |
| `Presentation/Goals/GoalTransitionFinalReviewView.swift` | in scope / other | 1 | 0 | 2 | 0 | 0 | 0 | 0 | 4 |
| `Presentation/You/HealthKitSleepValidationSection.swift` | in scope / other | 1 | 0 | 2 | 0 | 0 | 0 | 0 | 4 |
| `Presentation/Home/HomeHeroCardView.swift` | in scope / other | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 3 |
| `Presentation/Goals/GoalsView.swift` | in scope / other | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 12 |
| `Presentation/Goals/GoalEditWizardView.swift` | in scope / other | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 11 |
| `Presentation/OperatingPlan/ProtocolBuilderShell.swift` | excluded family (Energy/Recovery/Sleep/OpPlan) | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 11 |
| `Presentation/Evidence/EnergyChartViews.swift` | excluded family (Energy/Recovery/Sleep/OpPlan) | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 7 |
| `Presentation/Goals/GoalPhaseDetailView.swift` | in scope / other | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 6 |
| `Presentation/TrainingLogger/TrainingLoggerView.swift` | in scope / other | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 4 |
| `Presentation/You/HealthKitSleepHistoricalEvidenceSection.swift` | in scope / other | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 4 |
| `Presentation/You/HealthKitSleepCanaryView.swift` | in scope / other | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 3 |
| `Presentation/Home/HomeView.swift` | in scope / other | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 1 |
| `Presentation/Home/TodaysFocusCardView.swift` | in scope / other | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| `Presentation/Goals/GoalDetailView.swift` | in scope / other | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 91 |
| `Presentation/Goals/CompletedGoalDetailView.swift` | in scope / other | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 19 |
| `Presentation/Goals/GoalStrategyView.swift` | in scope / other | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 10 |
| `Presentation/OperatingPlan/OperatingPlanSupportScheduleEditor.swift` | excluded family (Energy/Recovery/Sleep/OpPlan) | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 7 |
| `Presentation/Home/FocusTileView.swift` | in scope / other | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 3 |
| `Presentation/You/NetworkDiagnosticsSection.swift` | in scope / other | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| `SharedUI/MetricRow.swift` | in scope / other | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 2 |
| `SharedUI/PrimaryActionButton.swift` | component definition | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 1 |
| `SharedUI/SectionHeading.swift` | component definition | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| `SharedUI/StatusChip.swift` | component definition | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 1 |
| `SharedUI/ChartInteraction.swift` | component definition | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| `SharedUI/CardContainer.swift` | component definition | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `SharedUI/IconBadge.swift` | component definition | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| `Presentation/Goals/GoalProtocolCategoryEditorView.swift` | in scope / other | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| `Presentation/Root/AppDestinationRouterView.swift` | in scope / other | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `Presentation/You/YouPlaceholderView.swift` | in scope / other | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| `Presentation/Home/PriorityDetailView.swift` | in scope / other | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 29 (21) |
| `Presentation/OperatingPlan/OperatingPlanTrainingProtocolBuilderView.swift` | excluded family (Energy/Recovery/Sleep/OpPlan) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 15 |
| `Presentation/Goals/GoalTransitionWizardView.swift` | in scope / other | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 |
| `Presentation/Goals/GoalProtocolTransitionView.swift` | in scope / other | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| `Presentation/Training/TrainingHistoryView.swift` | in scope / other | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| `SharedUI/PhotoInspectionViewer.swift` | in scope / other | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 6 |
| `SharedUI/ProgressPhotoTile.swift` | in scope / other | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| `SharedUI/Typography.swift` | component definition | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| `Presentation/Evidence/SleepEvidenceCharts.swift` | excluded family (Energy/Recovery/Sleep/OpPlan) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| `SharedUI/ConfidenceRing.swift` | in scope / other | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| `Presentation/Training/TrainingSessionDetailView.swift` | in scope / other | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| `SharedUI/EvidenceScopeAttributionChip.swift` | in scope / other | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `SharedUI/DateField.swift` | in scope / other | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `Presentation/Home/NextBestActionView.swift` | in scope / other | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `Presentation/Home/HomeHeaderView.swift` | in scope / other | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `Presentation/OperatingPlan/OperatingPlanLandingView.swift` | excluded family (Energy/Recovery/Sleep/OpPlan) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| **TOTAL (66 files)** | | 109 | 5 | 45 | 10 | 15 | 3 | 3 | 657 (21) |

**Reading the table:**
- **Zero strong-signal legacy hits** remain in any of these:
  - `Presentation/Briefings/*`;
  - `SharedUI/BriefingPresentation.swift`;
  - `Presentation/Home/PriorityDetailView.swift`;
  - `Presentation/Home/ConfidenceDetailSheet.swift`;
  - `Presentation/Logging/ManualWeighInView.swift`.
- **In-scope files still carrying strong legacy components:**
  - `Home/TodaysFocusCardView.swift`: `StatusChip` 1, `IconBadge` 1. This is the grouped session card.
  - `Home/FocusTileView.swift`: `StatusChip` 1.
  - `Home/BriefingCardView.swift`: `CardContainer`, `SectionHeading`, `IconBadge`.
  - `Home/GoalRowView.swift`: `CardContainer`, `SectionHeading`, `IconBadge` ×2.
  - `Home/HomeHeroCardView.swift`: `CardContainer`, `SectionHeading`, `IconBadge`.
  - `Home/HomeView.swift`: `CardContainer` (notice), `PrimaryActionButton` (reconnect).
- **Outside this audit's families but production- or Sandbox-reachable** (for the coordinator):
  - `Evidence/EvidenceReviewDetailView.swift` (`CardContainer` 8, `PrimaryActionButton` 5). The Build 88 audit called the legacy generic body dead code; verify.
  - `Logging/EvidenceIntakeView.swift` and `LocalEvidenceReviewView.swift` (Sandbox).
  - `You/FounderServerConnectionView.swift` and the `HealthKitSleep*`/`NetworkDiagnostics` sections (retained C in Build 88).
  - `Goals/PhaseTransitionView.swift`, `GoalTransitionFinalReviewView.swift`, `GoalEditWizardView.swift`, `GoalProtocolCategoryEditorView.swift` (Sandbox).
  - `Goals/GoalPhaseDetailView.swift`, `GoalStrategyView.swift`, `GoalDetailView.swift` (1 `CardContainer` each), `CompletedGoalDetailView.swift` (1 `PrimaryActionButton`).
  - `TrainingLogger/TrainingLoggerView.swift` (`CardContainer` + `IconBadge`; the Build 88 #33 leftovers).
  - `Root/AppDestinationRouterView.swift:203` (`operatingPlanStatus` `CardContainer`, retained C #86).
  - `SharedUI/MetricRow.swift` (`IconBadge`).
  - `You/YouPlaceholderView.swift:167` (`.borderedProminent` in the retained Sep 12 DEXA validation controls, #93).
- **Excluded families** (Energy / Recovery / Sleep / Operating Plan) still hold most remaining usages: `RecoverySleepViews.swift` has `CardContainer` ×24; the Operating Plan files have 45 `CardContainer` and 20 `PrimaryActionButton` between them; Energy has `CardContainer` ×4, `IconBadge` and the only 2 legacy `chartScrub` call sites.
