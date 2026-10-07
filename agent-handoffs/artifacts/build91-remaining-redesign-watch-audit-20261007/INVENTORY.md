# Build 91: exact remaining redesign inventory

- **Audited source:** Build 90 Native `32baf1d5`. That is integration `8fab4fcb` plus the bump.
- **Baseline audit:** `20261006T045644Z-native-redesign-completeness-audit.md`, taken at Build 88 (`96e724a9`). Row numbers (#n) below come from that report.
- **Method:** I started from the real route table, not from backlog names:
  - every `AppDestination` case (`Contracts/AppDestination.swift`) and its `AppDestinationRouterView` branch;
  - every presentation file changed between `96e724a9` and `32baf1d5` (`git diff --stat`, 54 files);
  - a zero-diff check on every file the Build 88 audit had marked D or E.
- **Live checks:** the Operating Plan landing route was captured on the simulator. The DEXA appointment path was traced from the Server read model (`OperatingPlanReadService.js`) through Native routing.

## Summary

| Class | Families / rows | Count |
|---|---|---:|
| 1. Redesigned and shipped (Builds 87–90) | Home root, Goals, You/Settings, Log/Logger/Workout Match, Batch 3 Evidence, Briefings, Priority Detail family, daily capture, Energy, Recovery/Sleep, Watch, Live Activity / Dynamic Island | 65 iPhone rows + 11 Watch |
| 2. Redesigned (locked) but not implemented | **Operating Plan family incl. Peptides (#74–#85)**; Home Screen Widget (#98–#99) | 14 |
| 3. Not yet redesigned (no current-generation treatment) | Home conditional children (#2–#6); Workout Match non-idle states (#35); DEXA PDF sheet (#55); intake date sheet (#59); session media placeholders (#41a); Logger leftovers (#33); **new: production "Next DEXA Scan" page** (designed in this package) | 11 |
| 4. Intentionally legacy / deferred | #23, #86, #93, #95, #96, #97 (C) and #98a Profile/Data Sources/Sign Out (F, Beta); Sandbox-only G surfaces | 7 + G |
| 5. Dead end / bug (behavior fix, not visual) | DEXA appointment dead end; sub-44 pt Operating Plan actions; duplicate OP title + no retry; Training builder "legacy builder" copy; Energy phase history hard-coded empty; Watch Mineral bottom bar; Sandbox selectable in Release; sheet-local routers; Exercise "Training" breadcrumb | 9 |

**Exact answer: one large family remains, Operating Plan with Peptides.** Behind it are one isolated extension (the Home Screen Widget) and a short tail of P2/P3 child states. The Evidence visual-color system is a new Founder direction owned by the parallel Claude A lane (prompt `20261007T033000Z`). It is not counted here.

## 1. Redesigned and shipped

| Family | Rows | Shipped in | Evidence |
|---|---|---|---|
| Home root, Goals, You / Settings / Appearance | #1, #18–#22, #89–#91 | B87 / B88 | Batch 1 |
| Log root, Logger, Supersets, Review, Recap, PR, Workout Match (pending/resolved) | #24–#31, #34 | B88 | Batch 2 CP1–CP5 |
| Evidence Hub, Timeline, Training, Activity, Nutrition, Weight, Photos, DEXA, intake, generic Review | #37–#54, #56–#58, #60 | B88 | Batch 3 A–E |
| **Briefings**: Detail chrome/states, Weekly, Midweek, Monthly, Photo, DEXA, History | #67–#73 | **B89** | Lane B `156808fa`; files fully rewritten (`Presentation/Briefings/*`, `BriefingPresentation.swift` +2036 lines) |
| **Priority Detail family** (generic, peptide dose-aware/paused, supplement, Weigh-In, Photos/DEXA, terminal + Skip) | #9–#15 | **B89** | Lane A `5f5df553` (`PriorityDetailView` +943/−) |
| **Daily capture**: Morning Check-In, manual/backdated weight, Home Confidence sheet | #16, #17, #7 | **B89** | Lane A `97028dbc` (`ManualWeighInView`, `ConfidenceDetailSheet`) |
| **Energy** root, charts, sheets; **Recovery / Sleep** root, Trends, Night Detail, All Nights | #61–#66 | **B90** | Claude B `8c3172e1`; legacy `chartScrub` has zero callers |
| **Watch** utility translation + independent Mineral Light + centered actions | W1–W11 | B89 / **B90** | Lane A `cb64e771`, clock capsule `f3579d87`, centered actions `a14eb4c4` |
| **Live Activity** Lock Screen + **Dynamic Island** | #100, #101 | **B89** | `461b3651` + `1ef4cca2` |
| Training Session performance records card (new) | inside #41 | B90 | Codex progression lane |

## 2. Redesigned (Founder-locked) but not implemented

| # | Surface | Route | Source | Locked design | Notes |
|---|---|---|---|---|---|
| 74 | Operating Plan landing | You → `operatingPlan` | `OperatingPlanLandingView` | `89d05249` | **0 commits in `Presentation/OperatingPlan` since before Build 86** (the 17 files have no diff between B88 and B90). Duplicate title confirmed in capture; failed state has no retry |
| 75 | Strategy detail: Energy (read-only), Nutrition, Training, Coaching Updates | `operatingPlanStrategy` | `OperatingPlanStrategyDetailView` | `89d05249` (Coaching Updates: finish-remaining package) | Energy phase history hard-coded `[]` (Server projection gap, ledger) |
| 76 | Edit Strategy: Nutrition, Training, Coaching Updates | `operatingPlanStrategyEdit` | `OperatingPlanStrategyEditorView` | `be04cfa8` | Mutation-heavy; one atomic Save |
| 77 | Protocol domain (Recovery / Peptides / Supplements) | `operatingPlanProtocolDomain` | `OperatingPlanProtocolDomainView` | `acafbd37` | Manage / Edit / Pause / Restore are 12 pt text buttons |
| 78 | **Peptide execution** (card, detail, editor, Pause/Resume, rewrite-history confirm, Advanced) | domain "Manage"; paused-peptide Priority | `OperatingPlanPeptideExecutionView` | `acafbd37` peptides boards | Build 70 pause/resume + simplification behavior is live; only the visual translation is missing |
| 79 | **Peptide sheets** (dose/days/time/notes) + `PeptideDosePlanEditor` | sheets from #78 | `PeptideSupportSheets`, `PeptideDosePlanEditor` | `acafbd37` | |
| 80 | Recovery (Foam Rolling) support + schedule editor | domain; Foam Priority "Review Support" | `OperatingPlanRecoverySupportView`, `OperatingPlanSupportScheduleEditor` | `acafbd37` | A redesigned Foam Priority Detail hands off into this legacy editor |
| 81 | Tracking | `operatingPlanTracking` | `OperatingPlanTrackingView` | finish-remaining | Duplicate title |
| 82 | Tracking support (Morning Weigh-In schedule) | `operatingPlanTrackingSupport` | `OperatingPlanTrackingSupportView` | finish-remaining | |
| 83 | Supplement support | `operatingPlanSupplementSupport` | `OperatingPlanSupplementSupportView` | `acafbd37` | |
| 84 | Supplement edit | `operatingPlanSupplementEdit` | `OperatingPlanSupplementEditorView` | `acafbd37` | |
| 85 | Training builder, production unavailable state | Server `/training/new` when no Training strategy | `OperatingPlanTrainingProtocolBuilderView` | Cov O04 | Engineering copy "…legacy builder…" |
| 98, 99 | Home Screen Widget small / large | WidgetKit | `HomeLoggedTodayWidgetView` | Final Batch 3 | B89 changed only the refresh accent (`refreshAccent` = action teal). The purple Training token and SF Rounded remain. Isolated extension |

## 3. Not yet redesigned (child / conditional states; zero diff since Build 88)

| # | Surface | Source (unchanged since B88) | Priority |
|---|---|---|---|
| 2 | Today's Priorities tile internals + morning grouped session card | `FocusTileView`, `TodaysFocusCardView` | P2 |
| 3 | Older Home briefing cards (index ≥1) | `BriefingCardView` | P2 (or drop) |
| 4 | Additional goals card (2+ goals) | `GoalsCardView` / `GoalRowView` | P2, conditional |
| 5 | No-goal hero fallback | `HomeHeroCardView` | P2, future user (Beta #5) |
| 6 | Home loading / failed / notices | `HomeView` (6-line change only) | P2 |
| 35 | Workout Match confirming / refresh-required / processing / failed / dismissed + "← Back" | `EvidenceReviewDetailView` `default: actionSection` | P2 |
| 55 | DEXA BodySpec PDF sheet | `DEXAHistoryView` `DEXAPDFSheet` | P3 |
| 59 | Intake date sheet | `EvidenceWorkflowKit` `WorkflowDateRow` | P3 |
| 41a | Session supporting-media placeholders | `TrainingSessionDetailView` (only the PR card changed) | P3 |
| 33 | Logger leftovers (load-failure text, toolbar Save & Leave, spinners, confetti palette) | `TrainingLoggerView` (B90 changes were clock/handoff, not these) | P3 |
| new | **Production "Next DEXA Scan" page** | `OperatingPlanDexaAppointmentView` shows only an unavailable message in Founder Production | **P1, part of OP-A** (designed in this package) |

## 4. Intentionally legacy / deferred (unchanged decisions)

These remain as classified in the Build 88 audit:

- **#23** Goal Detail V3-decode fallback and Goal Plan.
- **#86** Operating Plan status route. The Server emits it for href-less items such as "Recovery · Coming Soon", which the Founder's plan does not hit.
- **#93** DEXA writeback validation controls.
- **#95** Founder device connection.
- **#96** Sleep canary / validation / Network Diagnostics. Cleanup candidate: Sleep graduated on 2026-10-05.
- **#97** Training Reporting placeholders.
- **#98a** Profile / Data Sources / Sign Out. This is Beta work and is not covered by any redesign.

Sandbox-only class G surfaces are not in scope.

## 5. Dead end / bug: behavior fix rather than visual redesign

| Item | Where | Disposition |
|---|---|---|
| **DEXA appointment dead end** | Priority "View DEXA Appointment" (`ProductionDailyDriverAPI` maps `/profile/operating-plan/execution/dexa` to `.operatingPlanDexaAppointment`). In Founder Production `OperatingPlanDexaAppointmentView` renders only "Manage your production DEXA schedule in Coaching Updates…" with no action | **OP-A first fix**: Native-only resolution, see `OPERATING-PLAN-BATCH-DESIGN.md` §DEXA |
| Sub-44 pt OP actions | `OperatingPlanProtocolDomainView` Manage / Edit / Pause / Restore | Fixed by the OP-C translation (boards show 44 pt+ controls) |
| Duplicate title, failed state with no retry | `OperatingPlanLandingView`, `OperatingPlanTrackingView` | Fixed by the OP-A/OP-D translation |
| Training builder engineering copy | #85 | Copy-only, rides OP-B |
| Energy phase history `[]` | `OperatingPlanStrategyDetailView` (ledger delta) | Needs a Server projection, so it is **out of Build 91** unless authorized; the design renders no fabricated history |
| **Watch Mineral Light bottom bar** | `WatchPanelPage` | See `WATCH-MINERAL-FOOTER.md` |
| Sandbox selectable in Release; fresh install defaults to Sandbox | `FounderServerConnectionView`, `AppEnvironment` | Beta #5. Unchanged since B88 and not redesign |
| Sheet-local routers drop callbacks; Exercise "Training" breadcrumb pushes | Evidence sheets, `TrainingExerciseDetailView` | Unchanged since B88. Small navigation fixes; can ride any Evidence batch (coordinate with Claude A) |
