> Read-only sub-audit of shipped Build 89 `51399425`, produced in this lane. Where it mentions "another lane editing" Energy/Weight/EnergyAPI/AppEnvironment in the worktree, that was this lane's own in-progress Energy/Recovery candidate; all citations are against `51399425`.

# Build 89 audit: Evidence / Log / Workout Match child surfaces

Tree: Build 89 shipped source `51399425` (worktree `native-build90-remaining-redesign-20261006`). This was a read-only audit: nothing was edited, built or run.

**Tree-integrity note.** While this audit ran, another session was editing this worktree. `EnergyHistoryView.swift`, `EnergyChartViews.swift`, `WeightHistoryView.swift`, `EnergyAPI.swift` and `AppEnvironment.swift` showed as modified, not committed. Every Weight and Energy citation below comes from `git show 51399425:<path>`, not from the working copy. All other cited files match `51399425` exactly.

## 0. What Build 89 changed in this scope

`git diff --stat 96e724a9 51399425 -- ios` touches only these files in the Evidence / Log / Logger scope:

| File | Change | Effect on this scope |
|---|---|---|
| `Presentation/Training/TrainingSessionDetailView.swift` (+63) | New read-only "Performance Records" section (`4cfc3aa7`), `:182-229`, in EvidenceKit grammar | New A surface. Shifts later lines by about 60 |
| `Presentation/TrainingLogger/TrainingLoggerView.swift` (+162) | Suggested-area selection card extracted (`1162682a`); field value font 12→16/600 (Option B, `80c815de`) | Shifts later lines by +101. No leftover state was touched |
| `Presentation/Evidence/EvidenceKit.swift` (4) | Calories macro amber → green (`be94de5b`) | Token only |
| `Presentation/Evidence/EvidenceKitComponents.swift` (2) | `EvidenceHorizontalScrubGesture` made non-private | None |
| `SharedUI/DateField.swift` (+18) | New `.capture` label style for ManualWeighIn | The picker **sheet** itself is unchanged |
| `Presentation/Logging/ManualWeighInView.swift` | Redesigned to the capture family (Lane A, `97028dbc`) | Intake → Weight handoff now lands on a redesigned page |
| `Presentation/Briefings/PhotoBriefingSections.swift` | Lane B Photo Briefing; adds `PhotoComparisonViewer` fullScreenCover | Owned by another lane (§3) |

These files were **not touched** in Build 89: `EvidenceReviewDetailView.swift`, `DEXAHistoryView.swift`, `EvidenceWorkflowKit.swift`, `EvidenceHeaderView.swift`, `EvidenceRecordComponents.swift`, `TrainingHistoryView.swift`, `TrainingReportingView.swift`, `TrainingExerciseDetailView.swift`, `TrainingLibraryHeaderView.swift`, all Activity/Nutrition/Photos/Timeline/Hub views, `ProgressPhotoTile.swift`, `PhotoInspectionViewer.swift`, `RecoverySleepViews.swift`, `AppDestinationRouterView.swift`.

## 1. D-row re-check

| Row | Build 88 finding | Build 89 status | Evidence (51399425) |
|---|---|---|---|
| **#33** Logger leftovers | Legacy accent / Typography / textSecondary in load-failure, toolbar, spinners, confetti; dead `actionCard` | **NOT FIXED** (lines moved +101) | `TrainingLoggerView.swift:153`, `:160`: `ProgressView().tint(PhysiqueOSTheme.accent)` (loading and nil-VM). `:174-176`: "Save & Leave" uses `PhysiqueOSTypography.caption12Semibold` + `PhysiqueOSTheme.accent`. `:1816-1820` `failure()`: `cardBody14Medium` + `textSecondary`. `:1661` confetti palette: `chartSuccess, accent, chartEvidence, chartEffort`. `:1753-1768` `actionCard`: `CardContainer` / `IconBadge` / Typography, no call site (dead). The supporting-asset spinner `:1337` already uses `redesignAmber` (fine) |
| **#35** Workout Match non-idle states + back label | `default: actionSection(for:)` → legacy cards; "← Back" in legacy typography | **NOT FIXED** (file untouched) | `EvidenceReviewDetailView.swift:272-276` still routes `default` to `actionSection`. Reachable legacy branches, all `CardContainer` + `ProgressView().tint(accent)` + `PhysiqueOSTypography`, with system `Button`s or `PrimaryActionButton`: confirming `:629-634`, refreshRequired `:666-673`, failed `:674-678`, and completionActions `:682-698` (reached for `.accepted` when a review loads as `committing`, see `:117-119`). Back label `:88-99`: `arrow.left` + `PhysiqueOSTypography.label14Heavy` + `PhysiqueOSTheme.textSecondary`. `.stillProcessing` (`:659-665`) is not set by the reconciliation path, so it is unreachable for Workout Match |
| **#41a** Session supporting media + keyboard Done | Legacy `ProgressView` / Typography | **NOT FIXED** (lines moved about +60) | `TrainingSessionDetailView.swift:406-430` `TrainingSupportingMediaImage`: loading `:415` `ProgressView().tint(PhysiqueOSTheme.accent)`; failed `:418-420` is a plain system `Button("Retry screenshot")` (app-tint accent); unavailable `:422-424` uses `caption12Medium` + `textMuted`. Keyboard Done `:39-45` uses `PhysiqueOSTypography.label14Heavy`. The keyboard Done is effectively Sandbox-only, because Founder Production hides the correction editor (`:265-269`) |
| **#55** DEXA PDF sheet | System nav title, system Done, legacy background | **NOT FIXED** (file untouched) | `DEXAHistoryView.swift:72-74` presents it. `:616-633` `DEXAPDFSheet`: `.background(PhysiqueOSTheme.background)`, `.navigationTitle("BodySpec Report")`, system `Button("Done")` as `.confirmationAction`. `:643` PDFView background is `UIColor(PhysiqueOSTheme.background)` |
| **#59** Intake date sheet | Workflow tint/background, but a system nav bar and a never-disabled Today button | **NOT FIXED** (file untouched) | `EvidenceWorkflowKit.swift:688-710`: `.tint(WorkflowColor.teal)` and `.background(WorkflowColor.bg)` (redesign), but `.navigationTitle("Date")` + system toolbar. Today (`:697-701`) has no `.disabled`, whereas `DateField.swift:91` does disable it. Build 89's `DateField(style: .capture)` changed only the label (`DateField.swift:37-47`); its sheet (`:78-100`) is still fully legacy (`PhysiqueOSTheme.accent` tint, `PhysiqueOSTheme.background`). That sheet now opens from the redesigned ManualWeighIn (`ManualWeighInView.swift:775`) |

**Result: Build 89 fixed none of the five D rows.** The Build 89 lanes (A = Watch/LA/Priority/Capture, B = Briefings, Codex = small Logger fixes) did not target them.

## 2. Child-surface inventory (production-reachable, Founder Production unless noted)

Classes:
- **A** = redesign grammar.
- **B** = mixed / partial.
- **C** = still legacy.
- **D** = platform-owned (system menu, alert, picker, share).
- **E** = unreachable or dead.

`#if DEBUG` seams are excluded.

### 2.1 Evidence Hub (`EvidenceView.swift`)
| Surface | file:line | Grammar | Class |
|---|---|---|---|
| Loading state card | `EvidenceView.swift:66` → `EvidenceHeaderView.swift:221-261` | EvidenceLockedStyle | A |
| Failure card + "Try Again" | `:67-73` | Card is A; button is system `.buttonStyle(.bordered).tint(S.ink)` | **B** |
| Refresh-failed inline notice | `:77-82` | Locked style | A |
| Pull-to-refresh | `:48` | System | D |

### 2.2 Timeline (`TimelineView.swift`)
| Surface | file:line | Grammar | Class |
|---|---|---|---|
| Custom back "‹ Evidence Hub" | `:42-43` | Locked (hard-coded, but correct: Timeline is only reachable from the Hub) | A |
| Loading / failure / empty / "Showing N of M" | `:63`, `:65`, `:75-78`, `:90` | `EvidenceStateCard` | A |

### 2.3 Training landing (`TrainingHistoryView.swift`)
| Surface | file:line | Grammar | Class |
|---|---|---|---|
| Loading / failure panels | `:53-56` | `EvidenceStatePanel` | A |
| Latest-day inline expand + empty copy | `:80-130` | EvidenceKit | A |
| Reporting disclosure | `:165-190` | EvidenceKit (`EvidenceKitDisclosureRow` `:381-422`) | A |
| Current Protocol disclosure | `:224-246` | EvidenceKit. Copy row "Future protocol settings: Coming soon" `:240` | A (copy debt) |
| Recent History "Show All" sheet | present `:217-219`; `TrainingHistorySheet` `:251-298` | Locked custom Done + principal title on flat bar | A (router defect, §4) |
| Related Goals pills | `:71`, `:637-662` | EvidenceKit | A |
| `TrainingLinkRow` | `:515-557` | Legacy Typography / `surfaceElevated` | **E** (no call site) |
| `TrainingSectionHeaderView` / `TrainingCompactActionLabel` / `TrainingScopeSelectorView` | `:427`, `:455`, `:559` | Legacy | Not used by any in-scope page; consumed only by Energy/Recovery (rows #61-66, outside this scope) |

### 2.4 Training Day / Session / Exercise / Library / Reporting
| Surface | file:line | Grammar | Class |
|---|---|---|---|
| Training Day loading / failure / empty | `TrainingDayView.swift:41-45` | EvidenceStatePanel | A |
| Session loading / failure / not-found | `TrainingSessionDetailView.swift:60-64` | EvidenceStatePanel | A |
| **New** Performance Records section | `TrainingSessionDetailView.swift:180-229` | EvidenceSection `.analytical` | A |
| Session correction section (Production copy) | `:263-269` | EvidenceKit | A |
| Session correction editor + keyboard Done (Sandbox only) | `:270-330`, `:39-45` | Editor is EvidenceKit; Done uses legacy Typography | B (Sandbox-only) |
| Supporting screenshots: loading / retry / unavailable | `:406-430` | Legacy | **C** (#41a) |
| Exercise loading / failure / not-found | `TrainingExerciseDetailView.swift:60-64` | EvidenceStatePanel. The not-found detail reads "Not-found stays separate from empty benchmark or history." (engineering copy, shipped) | A (copy debt) |
| Exercise inline empties | `:95`, `:189`, `:230`, `:271` | EvidenceKit | A |
| Library root / Area loading, failure, not-found | `TrainingLibraryRootView.swift:48-50`; `TrainingAreaView.swift:63-67` | EvidenceStatePanel | A |
| Breadcrumb chips (Library / Area / Exercise) | `TrainingLibraryHeaderView.swift:16-30` | EvidenceKit visuals | A visuals; navigation defect (§4) |
| Reporting loading / failure / not-found | `TrainingReportingView.swift:43-47` | EvidenceStatePanel | A |
| Foundation placeholder (4 report ids) | `:55-57` | `EvidencePlaceholder` | A (row #97, intentional) |
| Resistance status-group sheet | `:31-33` → `:286-298` → `TrainingReportListSheet` `:300-365` | Locked | A (router defect) |
| Analysis sheet | `:34-36` → `:278-284` → same list sheet | Locked | A (router defect) |
| History empty "Training days will appear here." | `:232` | EvidenceKit | A |

### 2.5 Activity
| Surface | file:line | Grammar | Class |
|---|---|---|---|
| Landing loading / failure | `ActivityHistoryView.swift:77-80` | EvidenceStatePanel | A |
| Energy-anomaly warning | `:131` (`EvidenceDailyWarning`) | Daily kit | A |
| Inline empties | `:143`, `:178` | Daily kit | A |
| Show All sheet | `:192-194` → `ActivityHistorySheet` `:228-279` | Locked custom Done | A (router defect) |
| Activity Day loading / failure / empty / warning | `ActivityDayView.swift:53-58`, `:69` | EvidenceStatePanel / daily | A |
| Linked Training empty | `ActivityHistoryView.swift:206` | Daily kit | A |

### 2.6 Nutrition
| Surface | file:line | Grammar | Class |
|---|---|---|---|
| Landing loading / failure | `NutritionHistoryView.swift:65-68` | EvidenceStatePanel | A |
| Inline empties | `:120`, `:172` | Daily kit | A |
| Show All sheet | `:186-188` → `NutritionHistorySheet` `:194-243` | Locked | A (router defect) |
| Nutrition Day loading / failure / empty | `NutritionDayView.swift:37-42` | EvidenceStatePanel | A |
| Reporting loading / failure / not-found | `NutritionReportingView.swift:74-78` | EvidenceStatePanel | A |
| Meal metric selector menu | `NutritionReportingView.swift:359-377` | System `Menu`; label is a locked capsule | A label / D menu |
| 6 "Show All" list sheets (Weekly Averages ×2, Recent Daily Calories/Macros, Weekly Meal Summary, Recurring Meals, Recent Meal History) | `:214-344` via `rowsSection` `:392-417` → `NutritionReportListSheet` `NutritionReportingRowViews.swift:233-276` | Locked | A (router defect `:271`) |
| Section empty lines | `NutritionReportingView.swift:401-404` | Daily kit | A |
| Chart insufficient history | `NutritionReportingChartViews.swift:55` | Daily kit | A |
| `NutritionReportDailyCaloriesSheet` / `NutritionReportDailyMacrosSheet` | `NutritionReportingRowViews.swift:279-305` | Locked | **E** (no call site) |

### 2.7 Weight (from `git show 51399425`)
| Surface | file:line | Grammar | Class |
|---|---|---|---|
| Loading / failure `WeightStatePanel` | `WeightHistoryView.swift:54-57`, `:316-342` | Locked panel, but loading uses system `ProgressView().tint(m.c.accent)` (`:326`), not the locked ring spinner the other families use | **B** (minor) |
| Weekly averages empty / inline expand ("Show All"/"Close") | `:145-152` | Weight kit | A |
| Trend insufficient-history state | `:365-374` | Weight kit. Copy "Shown when the trend has fewer than two valid points." reads like spec text | A (copy debt) |
| Chart scrub | `:443` `.evidenceChartScrub` | Redesign gesture | A |
| (No sheets or alerts on Weight) | — | — | — |

### 2.8 Progress Photos
| Surface | file:line | Grammar | Class |
|---|---|---|---|
| Landing loading / failure | `PhotosHistoryView.swift:70-73` | EvidenceStateCard | A |
| Inline empties | `:161`, `:184` | Record kit | A |
| Photo Briefing pending card | `:218-235` | RecordCard + RecordSpinner | A |
| "Read Photo Briefing" link | `:245-256` | Record primary action | A (destination is the other lane, §3) |
| Photo-set sheet | `:62-64` → `PhotoEvidenceDetailSheet` `:360-398` | Locked "Photo Set" title + Close | A |
| Tile media loading / retry / unavailable (`.record`) | `SharedUI/ProgressPhotoTile.swift:214-280` | RecordSpinner / RecordRetryLabel | A |
| `PhotoPoseThumbnailStrip` (would render legacy `.standard` tiles, `ProgressPhotoTile.swift:47-176`) | `PhotosHistoryView.swift:405-422` | Legacy via `.standard` | **E** (no call site) |
| Set-detail loading / failure / empty ×2 | `PhotoSetDetailView.swift:59-78` | EvidenceStateCard | A |
| Inspector fullScreenCover (`.record` chrome) incl. loading / failed / unavailable | `PhotoSetDetailView.swift:41` → `PhotoInspectionViewer.swift:52-54`, `:127-135`, `:348-366`, `:432-447` | Record chrome | A |
| `.photoSetDetail` pushed route | `AppDestinationRouterView.swift:131-132` | Has no `evidencePageChrome`, so it would show the system back button | **B/E**: no Native pusher found, reachable only from a server-coded destination (`AppDestinationCoding.swift:123`) |

### 2.9 DEXA
| Surface | file:line | Grammar | Class |
|---|---|---|---|
| Loading / failure | `DEXAHistoryView.swift:80-83` | EvidenceStateCard | A |
| Latest scan empty + source-media message | `:154-163` | Record kit | A |
| "View BodySpec PDF" / "Loading PDF…" | `:172-184`, `:592-599` | Record action | A |
| DEXA → Apple Health card + Retry | `:218-250` | Record kit | A |
| History empty | `:481` | Record kit | A |
| Chart insufficient history | `DEXAChartViews.swift:34` | Record kit | A |
| **BodySpec PDF sheet** | `:72-74`, `:616-649` | Legacy / system | **C** (#55) |

### 2.10 Intake (Founder Production `ProductionEvidenceUploadView`)
| Surface | file:line | Grammar | Class |
|---|---|---|---|
| Workflow chrome "‹ Add Evidence" | `:212` | Workflow | A |
| PhotosPicker | `:213-222` | System | D |
| File importer | `:243-251` | System | D |
| Attachment "Remove" context menu | `:528-530` | System | D |
| Type picker / session-condition selects | `:537`, `:1275`, `:1287` → `EvidenceWorkflowKit.swift:431-465` | System `Menu`, Workflow label | A label / D menu |
| **Date row → date sheet** | `:353`, `:428` → `EvidenceWorkflowKit.swift:666-710` | Mixed | **B** (#59) |
| Attachment loading spinner | `:498` | WorkflowSpinner | A |
| Classifying / uploading / processing / accepted / confirmed / failed | `:719-790` | WorkflowStateRow | A |
| Staged-upload progress | `:1197`, `:1216` | WorkflowProgress | A |
| Weight handoff → ManualWeighInView | `:376` | Now capture-family (Build 89). Its `DateField` sheet is still legacy (`DateField.swift:78-100`) | B (outside Evidence scope) |
| Sandbox `EvidenceIntakeView` / `LocalEvidenceReviewView` (+ alerts, menus, ExercisePicker / TrainingAreaPicker sheets) | Router `:79-101` | Fully legacy (58 / 59 legacy tokens, 0 redesign) | C, Sandbox-only. Reachable in Release only through the You → authority picker (Build 88 integrity finding 1) |

### 2.11 Generic Evidence Review (`EvidenceReviewDetailView.swift`)
| Surface | file:line | Grammar | Class |
|---|---|---|---|
| Workflow chrome "‹ Back" | `:1312` | Workflow | A |
| Loading / failed / not-found | `:1318-1332` | WorkflowStateRow | A |
| Hero, items, all action states, correction form | `:1334-1345`, `:1553-1610` | Workflow | A |
| Dismiss confirmation alert | `:50-61` | System | D |
| Legacy `content` branches (loading / failed / notFound / generic loaded), legacy header / items / `dexaMeasurementCard` | `:122-160`, `:320-578`, `:719+` | Legacy | **E** (only `workoutMatchScroll` renders `content`, and only once a reconciliation review has loaded) |

### 2.12 Workout Match
| Surface | file:line | Grammar | Class |
|---|---|---|---|
| Header, Apple Health card, candidates | `:163-238` | Logger redesign | A |
| Pending actions | `:240-264` | Logger redesign | A |
| Resolved (in-session) | `:265-271`, `:296-330` | Logger redesign | A |
| Back label "← Back" | `:88-99` | Legacy | **C** |
| Confirming | `:629-634` | Legacy | **C** |
| Refresh required | `:666-673` | Legacy | **C** |
| Failed + "Try Again" | `:674-678` | Legacy | **C** |
| Accepted / Confirmed completion ("Back to Log") | `:682-698` | Legacy | **C** |
| Still processing; legacy idle candidate buttons `:590-603` | — | Legacy | E (not reachable for Workout Match) |
| Loading / failure before the review loads | Generic Workflow `:1318-1332` (route `:1299-1301` falls to `.generic` until loaded) | Workflow | A |

### 2.13 Logger (in-scope leftovers only; see #33)
The loading and nil-VM spinners, "Save & Leave", the load-failure text and the confetti palette are **C**. `actionCard` is **E**. The Logger's discard alert (`:223-234`), the menus (`:1086-1115`, `TrainingRestPreferenceMenu` `:824`), the PhotosPicker and the file importer are **D**.

## 3. Progress Photos expanded Photo Briefing viewer (other lane, status only)

- **Owner and state.** Lane B (`c3c5966b`, final `156808fa`) is "FOUNDER VISUAL APPROVED", with physical acceptance pending.
- **Paired viewer.** Build 89 added a new paired Previous/Current `PhotoComparisonViewer`, presented as `.fullScreenCover` at `PhotoBriefingSections.swift:42-44` (struct at `:820`).
- **Single-photo inspector.** It still uses `PhotoInspectionViewer`'s `.standard` chrome (`PhotoBriefingSections.swift:41`). That chrome was not touched in Build 89 and keeps legacy `PhysiqueOSTypography` / `PhysiqueOSTheme.accent` and a white `ProgressView` (`PhotoInspectionViewer.swift:277-286`, `:337`, `:355`, `:452-456`).

Not analyzed further.

## 4. Navigation-integrity defects still present in Build 89

1. **Sheet-local routers drop callbacks (still present).** Every Show-All sheet's nested router is `AppDestinationRouterView(destination: $0)`, which uses the defaults: no-op `onNavigate`, `onReturnToLog` and `onReturnToHome` (`AppDestinationRouterView.swift:22-25`). The sites are:
   - `TrainingHistoryView.swift:293`
   - `TrainingReportingView.swift:361`
   - `ActivityHistoryView.swift:274`
   - `NutritionHistoryView.swift:238`
   - `NutritionReportingRowViews.swift:271`
   - Energy daily sheet `EnergyHistoryView.swift:276` (at `51399425`)

   **Reachable dead end.** Training Reporting → status-group sheet → Exercise → "Training" breadcrumb (pushes a full landing inside the sheet) → Related Goals → `GoalDetailView(onNavigate: no-op)`. Its Edit, phase, transition and plan buttons (`GoalDetailView.swift:134`, `:181`, `:219`, `:415-418`) do nothing.
2. **Back labels.**
   - **Night Detail is hard-coded "Recovery"** (`RecoverySleepViews.swift:952`). It is wrong when the page is opened from Sleep Trends or from inside the All Nights sheet (`:358-361`), where dismiss returns to the sheet list. Still present.
   - **Energy pages.** Energy has its own legacy "← Evidence Hub" (`EnergyHistoryView.swift:47-58`) and never registers in the `EvidenceBackTrail`. So a Nutrition or Activity landing pushed from Energy's day rows (on the page, or in the daily sheet) shows "‹ Evidence Hub" instead of "‹ Energy". This is inferred from `EvidenceKit.swift:426-446` + `EvidenceKitComponents.swift:25-28`.
   - **Energy daily sheet pollutes the shared trail.** It does not set `.environment(\.evidenceBackTrail, nil)`, unlike every redesigned sheet. Pages pushed inside it register into the Evidence tab's shared trail. Still present.
   - **Workout Match.** It still shows legacy "← Back" (`EvidenceReviewDetailView.swift:88-99`).
   - **Minor.** Pages pushed inside the redesigned sheets show the generic "‹ Back", because each sheet sets the trail to nil.
3. **Energy "Nutrition Day" opens the Nutrition landing, not the day** (still present). See `EnergyHistoryView.swift:372-374` at `51399425`: `NavigationLink(value: .progressStream(streamId: "nutrition"))` with the label "Nutrition Day". This is web parity on purpose (comment `:362-368`), but the label overpromises. The Energy weekly sheet (`:240-257`) also has no Done button, and neither Energy sheet uses redesign grammar.
4. **Exercise detail "Training" breadcrumb pushes rather than pops** (still present). `TrainingLibraryHeaderView.swift:18-19` is `NavigationLink(value: crumb.destination)`, so it pushes a second Training landing. The same applies to the Library root breadcrumb (`TrainingLibraryRootView.swift:54-56`) and to Area breadcrumbs.
5. **Failure states have no retry, except the Hub.** All `EvidenceStatePanel(kind: .failure(message, nil))` and `EvidenceStateCard(.message)` failures on Training, Activity, Nutrition, Photos and DEXA offer no Retry, and these pages have no `.refreshable`. They recover only by navigating away and back, or by foregrounding (Training landing `:46`). This is functional, not grammar.

## 5. Counts (this scope)

| Class | Count |
|---|---|
| C (still legacy, reachable) | 3 families |
| B (mixed) | 4 |
| E (dead) | 6 |
| A | Everything else |

C families:
- Workout Match back + 4 action states (#35)
- Session supporting media (#41a)
- DEXA PDF sheet (#55)

The Logger leftovers (#33) are C as well.

B items:
- Hub Try Again button
- Weight loading spinner
- Intake date sheet (#59)
- ManualWeighIn `DateField` sheet, out of scope but reachable from intake

E items:
- `TrainingLinkRow`
- Two Nutrition daily sheets
- `PhotoPoseThumbnailStrip`
- Legacy generic-review branches
- Logger `actionCard`
