# PhysiqueOS Design-to-Implementation Delta Ledger

Purpose: preserve every implementation-relevant discovery made during UI/design exploration so accepted mockups do not silently depend on behavior, data, navigation, or plumbing that shipping code does not yet provide.

This ledger is NOT the general product backlog. It contains deltas discovered while translating/locking the new PhysiqueOS design system.

## Rules

Every Codex/Claude design task must review this ledger before stopping.

If design/source audit discovers a difference between:
- accepted target behavior and shipping behavior;
- target data presentation and current projection/mapping;
- target interaction and current interaction;
- required media behavior and current media behavior;
- accessibility target and current implementation;
- a likely shipping defect exposed during source audit;

append it here.

Classify each entry:

REQUIRED FOR DESIGN IMPLEMENTATION
The locked design cannot be implemented faithfully without this change.

LIKELY SHIPPING DEFECT
Current behavior appears wrong independently of redesign.

FOUNDER DECISION
Source/design exposes a product choice that must be decided before implementation.

ARCHITECTURAL CONTEXT
Important implementation context, but not itself a requested change.

RESOLVED / OBSOLETE
Previously tracked issue proven fixed or no longer applicable.

For each entry include:
- surface;
- classification;
- discovery source/report/commit;
- current shipping behavior;
- accepted/required target;
- implementation implication;
- acceptance test;
- status.

Do not silently fix these during design-only tasks.

## Open implementation deltas

### Home Screen Widget — refresh action hit target

Classification: REQUIRED FOR DESIGN IMPLEMENTATION / ACCESSIBILITY

Discovery:
Final Design Batch 3 Home Screen Widget source audit against Native Build 85.
Report: `agent-handoffs/reports/20261004T213658Z-final-design-batch3-home-screen-widget.md`

Current Build 85 behavior:
The independent widget refresh action has a `24 × 24 pt` frame in `systemSmall` and a `28 × 28 pt` frame in `systemLarge`. Its accessibility label is correct, but its effective hit region is smaller than the practical 44 pt target used by the locked design system. The small widget's Start/Resume behavior remains safe because the whole small widget owns that workout deep link; this delta is only the separate refresh control.

Accepted/required target:
Keep the same refresh behavior and compact visible glyph while providing an effective target of at least 44 × 44 pt in both supported widget families. Do not add a new control or enlarge the header visually.

Implementation implication:
Use padding/content shape/layout that expands the interactive region without crowding or overlapping the freshness label. Reverify WidgetKit interaction routing so the refresh AppIntent/link remains distinct from the small widget's whole-widget workout URL.

Acceptance:
On `systemSmall` and `systemLarge`, the visible refresh glyph remains compact, the effective target is at least 44 × 44 pt, VoiceOver announces “Refresh totals in PhysiqueOS,” and tapping it never triggers Start/Resume or a metric destination.

Status: OPEN.

### Operating Plan Energy — production phase-history projection

Classification: REQUIRED FOR DESIGN IMPLEMENTATION

Discovery:
Operating Plan Build 85 Native/Server source audit under the Founder rule that Phase 1 strategy history must remain distinct after Phase 2 begins.
Report: `agent-handoffs/reports/20261004T193500Z-operating-plan-ui-style-translation.md`

Current Build 85 behavior:
The Server can resolve an Energy Strategy for a Goal/phase/as-of date through `resolveOperatingPlanEnergyStrategyAt`, and the Native sandbox fixture plus `OperatingPlanStrategyDetailView` support `energyPhaseHistory`. The bounded Founder-production `operating-plan-energy-strategy` response projects only the active protocol. `EnergyStrategyDetail.readModel` then hardcodes `energyPhaseHistory: []`. Production therefore cannot display the preserved Phase 1 Maintenance Calibration strategy beside the active Phase 2 strategy.

Accepted/required target:
When a new phase establishes a new Energy Strategy, the current detail must keep the active phase strategy first and expose earlier phase-owned strategy snapshots as read-only history. Historical values must remain their original values; they must not be collapsed into or rewritten as the active strategy.

Implementation implication:
Extend the bounded Energy detail projection with canonical prior phase strategy snapshots (stable phase identity, order, effective dates, intake/activity targets, review cadence and current/completed state). Reuse the existing Native history model/view or replace it with an equivalent typed contract. Do not infer history from current targets in Native.

Acceptance:
After a Phase 1 → Phase 2 transition, Founder Production Energy detail shows exactly one active Phase 2 strategy and the unchanged Phase 1 snapshot below it. No edit action appears. Re-reading, app relaunch and a later Phase 2 strategy revision preserve the original Phase 1 values. A Goal with no prior Energy Strategy shows no empty history shell.

Status: OPEN.

### Priority Detail — Progress Photos and DEXA action destinations

Classification: REQUIRED FOR DESIGN IMPLEMENTATION / LIKELY SHIPPING DEFECT

Discovery:
Priority Detail family source audit against Build 85 Native and current production Server.
Report: `agent-handoffs/reports/20261004T181549Z-priority-detail-ui-style-translation.md`

Current Build 85 behavior:
The Server's Priority Detail contract publishes non-completable actions for:
- Progress Photos: `Upload Photos` → `/evidence/photos`;
- DEXA pre-appointment: `View DEXA Appointment` → `/profile/operating-plan/execution/dexa`;
- DEXA after appointment: `Upload DEXA Results` → `/evidence/dexa`.

Native decodes the label/href, but `ProductionPriorityAPI.destination(forActionHref:)` maps only `/check-in/morning`. Paused peptide has a separate execution-projection fallback. For Progress Photos and DEXA, `continueActionDestination` is therefore nil and `PriorityDetailView.actionSection` renders no action.

Accepted target:
Preserve each Server-owned evidence/appointment action on its Priority Detail surface and navigate to the existing Native upload/evidence/Operating Plan destination. Do not add manual completion for evidence-driven priorities.

Implementation implication:
Prefer a typed `action.destination` in the Native contract, or add narrow mappings for the three verified hrefs. Do not create a general web-href router.

Acceptance:
Open each Progress Photos/DEXA stage through an exact occurrence route. The canonical action is visible, has a 44 pt target, opens the correct Native destination, keeps the occurrence date, and never shows Mark Complete. Morning Check-In and paused peptide routing remain unchanged.

Status: OPEN.

### Operating Plan DEXA appointment — Founder Production destination is unavailable

Classification: REQUIRED FOR DESIGN IMPLEMENTATION / LIKELY SHIPPING DEFECT

Discovery:
Final Operating Plan source audit after Supplements, including every current Native Build 85 route.
Report: `agent-handoffs/reports/20261004T201405Z-operating-plan-finish-remaining.md`

Current Build 85 behavior:
`AppDestination.operatingPlanDexaAppointment` routes to `OperatingPlanDexaAppointmentView`. The screen has a complete detail/editor only in Sandbox. Under Founder Production it always renders: “Manage your production DEXA schedule in Coaching Updates, where Progress Photos and DEXA are saved together.” The separately tracked Priority Detail gap publishes `View DEXA Appointment` for the DEXA occurrence, so merely adding the missing href mapping would currently lead Founder Production into a terminal unavailable screen.

Accepted/required target:
The DEXA Priority action must reach a usable production schedule experience backed by the same canonical DEXA state already edited atomically inside Coaching Updates. Do not create a second DEXA record, independent write boundary or conflicting reminder owner.

Implementation implication:
Either route the action to the existing production Coaching Updates editor with the DEXA section focused, or add a bounded standalone Founder Production read/write that delegates to the same canonical composite ownership and concurrency fences. Preserve the current DEXA fields, future-date validation, reminders, upload reminder, preparation note and event-briefing semantics.

Acceptance:
From an exact DEXA priority occurrence, tap `View DEXA Appointment`. A usable production DEXA schedule opens immediately; changing it persists once to the canonical shared state, reads back identically in Coaching Updates, preserves all concurrency checks and never creates a second appointment/reminder record. The Sandbox flow remains unchanged.

Status: OPEN.

### Photo Briefing — paired Previous/Current comparison viewer

Classification: REQUIRED FOR DESIGN IMPLEMENTATION

Discovery:
DEXA + Photo Founder-flow confirmation.
Main report commit: e49c97e6f53ce843fcbfdad5364903f47124c01b
Report: agent-handoffs/reports/20261004T164725Z-dexa-photo-founder-flow-confirmation.md

Current Build 85 behavior:
PhotoInspectionViewer opens one selected image at a time. A historical comparison passes Previous then Current as two items, but the user views one image and swipes to the other.

Existing single-image viewer already supports:
- full-screen inspection;
- pinch zoom;
- momentum pan;
- double-tap zoom;
- up to 6x;
- aspect fit;
- paging;
- dismiss;
- retry/failure;
- reset.

Accepted target:
Tapping a comparison in What Visibly Changed opens a dedicated simultaneous Previous/Current comparison viewer:
- both matched images visible side-by-side;
- pose title;
- Previous/Current labels;
- dates;
- synchronized zoom/pan as primary behavior;
- reset on dismiss/reopen;
- paired loading/failure semantics;
- accessible paired relationship.

Implementation implication:
Add comparison-specific viewer request/model and simultaneous two-image composition. Prefer one zoomable viewport containing the aligned pair so synchronized transform is inherent.

Acceptance:
From What Visibly Changed, tap any matched pose. Both correct matched photos open together. Pinch/pan keeps comparison aligned. Labels/dates remain correct. Dismiss/reopen resets. VoiceOver identifies pose and both dates.

Status: OPEN.

### Apple Watch Logger — timed-set duration projection mapping

Classification: LIKELY SHIPPING DEFECT / REQUIRED IF TIMED SETS ARE SHOWN ON WATCH

Discovery:
Utility-surface Watch/Live Activity/Logger design audit.
Utility report commit/package: 29d2fe1fcd343e4da077b020a120c1e2f14f37ea

Current audited behavior:
Timed-set duration reaches the shared workout projection but the Watch mapper drops the duration. Watch cannot truthfully render the intended timed-set value and the design harness used an honest em dash rather than inventing data.

Target:
When a canonical timed set is available to Watch, preserve/map its duration through the Watch presentation model and display the real duration using current workout semantics.

Implementation implication:
Audit shared projection -> Watch mapper -> Watch row model. Add duration mapping without changing canonical Logger semantics.

Acceptance:
Start/restore a workout containing a timed set. Watch receives and displays the exact canonical duration. No fabricated fallback. Ordinary weighted/bodyweight set rows remain unchanged.

Status: OPEN; reverify against implementation authority before patching.

### Apple Watch Workout — phone-started session never records HealthKit / false HEALTH ON

Classification: LIKELY SHIPPING DEFECT + FOUNDER DECISION

Discovery:
Live workout HealthKit/Watch audit against Build 85 Native `b8ee8690b194cb90086b62816b9a2c8c400dc026`.
Report: `agent-handoffs/reports/20261004T202256Z-live-workout-healthkit-watch-audit.md`

Current Build 85 behavior:
The Watch starts its `HKWorkoutSession` only after a Watch `startPreparedWorkout` command on a phone Ready-for-Watch plan is acknowledged (`WatchWorkoutStore.swift:706-718`). A live session started on iPhone reaches the Watch as `.active`. The Watch shows the full workout UI and accepts Complete Set, but never starts HealthKit, and Ready for Watch disappears after the first completed set. Workout Metrics then shows TIME (phone anchors) with Active/Total Calories and Heart Rate as "—". The phone stamps `watchHealthSaveState = nil` because `watchStartedAt == nil`. The Watch header says `IPHONE UNAVAILABLE · HEALTH ON` and the idle text says "Health may continue" without consulting `health.lifecycle`.

Target:
The locked Watch Metrics design shows real HealthKit metrics and truthful Health status. The original Watch plan required an already-active session to offer Resume Workout on Watch.

Implementation implication:
For an active/paused session with no live, stored or saved Watch workout, offer "Record with Apple Health" (or auto-start, per Founder decision) and add one idempotent Watch→phone command that stamps `watchStartedAt`, so the finish/Health-save leg runs. Derive the Health status text from the lifecycle. Late-start trusted correlation versus the 120 s policy is a separate Founder decision; do not silently widen trust.

Acceptance:
A phone-started session, then Watch Record with Apple Health, gives exactly one PhysiqueOS HealthKit workout with HR/energy populating, and finish saves and reports it once. With no session the Watch never claims HEALTH ON. A Watch-started session is unchanged. Test seam: an injectable Watch health controller.

Status: FIXED IN BUILD 86 CANDIDATE (unreleased) — Native `claude/native-watch-healthkit-build86-20261004` at `4f78fce663fb16c3cc6930b3b8e576a328defcbe`; report `agent-handoffs/reports/20261004T232105Z-build86-watch-healthkit-candidate.md`. Automatic exactly-once start (prompt-directed); trust boundary unchanged. Carried unchanged into combined Build 86 head `cec8af20a6121bb66ecca3ba9f667d91774a891c` (`agent-handoffs/reports/20261005T003623Z-build86-final-integration.md`). Close only after physical-device acceptance. Shipped in TestFlight Build 86 (`cec8af20`, delivery `e70f2604-0f97-45fb-a720-fd695d23d0c4`, VALID; `agent-handoffs/reports/20261005T010919Z-build86-testflight-valid.md`); still release-gated on physical-device acceptance.

### Apple Watch Logger — activation refresh disables Complete Set

Classification: LIKELY SHIPPING DEFECT (latency)

Discovery:
Same audit and report as above.

Current Build 85 behavior:
Every Watch scene activation, reachability-true transition and activation-complete issues a read-only `refreshProjection` through the single-flight command gate (`WatchWorkoutStore.swift:245-250,458-478,1047-1066`). That sets `isMutationPending`, so Complete Set (`WatchWorkoutViews.swift:463`) is disabled until the phone replies. Phone-originated changes reach the Watch only through `updateApplicationContext`.

Target:
Complete Set is available as soon as the Watch holds a current, reachable projection. A read-only refresh never blocks set execution.

Implementation implication:
Separate refresh from the mutation gate, or exclude it from the enablement predicate, or skip redundant activation refreshes. Optionally push phone-originated projections over the message lane while reachable, after timing instrumentation.

Acceptance:
With a reachable active projection, a display activation does not disable Complete Set. A tap during a refresh is delivered once. A stale race yields one refresh and no lost tap.

Status: FIXED IN BUILD 86 CANDIDATE (unreleased; refresh has its own lane, stale Complete Set re-sent once for the same set, latency trace added) — `4f78fce6`; report `agent-handoffs/reports/20261004T232105Z-build86-watch-healthkit-candidate.md`. Immediate phone→Watch push deferred pending on-device measurement. Carried unchanged into combined Build 86 head `cec8af20`. Close only after physical-device acceptance (including 10–15 ft). Shipped in TestFlight Build 86 (`cec8af20`, delivery `e70f2604-0f97-45fb-a720-fd695d23d0c4`, VALID; `agent-handoffs/reports/20261005T010919Z-build86-testflight-valid.md`); still release-gated on physical-device acceptance.

### Workout presentation — unconfirmed HealthKit candidate replaces the Logger session window

Classification: RESOLVED / OBSOLETE (was LIKELY SHIPPING DEFECT, Server)

Discovery:
Build 86 Part A read-only reconciliation audit of Server `3c0f4aef` for the 2026-10-04 workout (late-started Apple Traditional Strength Training vs the PhysiqueOS Logger session; production review: 55% `possible_match`).
Report: `agent-handoffs/reports/20261004T232105Z-build86-watch-healthkit-candidate.md`

Current behavior:
Even an unconfirmed (55%) candidate link replaces the Logger session's displayed start/end/duration/calories with the HealthKit workout's (shorter, late) window (`HealthKitWorkoutPresentationService.js:119-172`, `ProgressReportingService.js:3042-3080`, `TrainingNavigationReadService.js:428-441`, `LoggedTodayService.js:41`). The presentation path does not read Founder-unlinked state, so it appears to persist after "No match". Stored records are not mutated.

Target:
The structured Logger session keeps its own window unless a link is confirmed; a Founder "No match" removes any candidate presentation.

Implementation implication:
Server presentation reads link resolution state (confirmed only) before substituting HealthKit timing/energy; add tests for pending, confirmed and unlinked candidates.

Acceptance:
A pending or rejected candidate never changes the Logger session's displayed window; a confirmed link shows the agreed presentation; no record mutation.

Status: RESOLVED — Server `51c459c410b268f35e6388eeb17f0b6ed7eb548c` deployed (deployment `07714249-04c8-4d7b-9f36-09e5ead1cdee`, ACTIVE, web+worker source and log gitSha verified, /ready 9/9). `projectHealthKitStrengthWorkoutPresentationBySession` resolves confirmed links only; pending/possible/No-match/none keep the Logger presentation. No record, link, claim or review mutated. Report `agent-handoffs/reports/20261005T003623Z-build86-final-integration.md`.

### Workout presentation — confirmed link with a late or partial Apple workout replaces the Logger window

Classification: RESOLVED / OBSOLETE (was FOUNDER DECISION, Server presentation; Founder chose Option A)

Discovery:
Build 86 final integration (`agent-handoffs/reports/20261005T003623Z-build86-final-integration.md`); today's 55% match (Apple 1:28–1:48 PM vs Logger 12:31–1:47 PM).

Current behavior:
For a CONFIRMED Strength link, `applyHealthKitStrengthPresentationToTrainingRecord` presents the Apple workout's start/end/duration (and energy/HR) as the session telemetry. Confirming a late-started or truncated Apple workout would display its shorter window instead of the structured Logger window. Pinned by `a confirmed link is exactly the confirmed-only projection, with confirmed telemetry intact`.

Target options:
A (recommended) keep the Logger's start/end/duration canonical and take only energy/HR from Apple, optionally noting Apple coverage; B accept the Apple window; C Founder chooses No match.

Implementation implication:
Option A is a bounded Server presentation change (window fields from the Logger, telemetry fields from Apple) plus tests and a deploy; no record or policy change.

Acceptance:
After confirming today's item, Workout Detail / Training Day / Activity / Logged Today show 12:31–1:47 PM with Apple calories/HR; sets unchanged; no duplicate session.

Status: RESOLVED — Option A deployed and verified: Server `27dad44a1f63d68b53f23e51152a10a5d04968e6` (deployment `99188a9e-75a7-49c6-a5c2-05a43737de5f`, web+worker source and log gitSha verified, /ready 9/9). Confirmed Strength links keep the Logger start/end/duration; Apple supplies energy/HR only; missing Logger timing is never filled from Apple. Today's review is safe to resolve with Use Logger session 1 (not resolved by this lane). Report `agent-handoffs/reports/20261005T005447Z-build86-option-a-confirmed-strength-presentation.md`.

### Evidence Hub — remove Health Metrics placeholder and place Timeline last

Classification: REQUIRED FOR DESIGN IMPLEMENTATION

Discovery:
Remaining Evidence-family source audit against Build 85 Native and Server.
Report: `agent-handoffs/reports/20261004T193501Z-dexa-photos-timeline-evidence-ui-style-translation.md`

Current Build 85 behavior:
Native production composition publishes Timeline before Recovery and appends a `Health Metrics` Coming Soon stream. Native and Server usage-order contracts also omit or position Timeline inconsistently and retain the Health Metrics placeholder.

Accepted target:
The Evidence Hub contains only current Evidence destinations. Preserve current real-stream order, place Recovery before Timeline, place Timeline at the absolute bottom, and remove the Health Metrics destination/page and all Coming Soon presentation.

Implementation implication:
Update Native production stream composition, Native canonical Evidence usage order, and matching Server/web canonical hub order together. Remove the Health Metrics placeholder route from the target navigation without removing any real evidence field or functional Reporting destination.

Acceptance:
Evidence Hub renders Training, Nutrition, Weight, Photos, DEXA, Activity, Energy, Recovery and Timeline in that exact order. Timeline is last. Health Metrics and Coming Soon are absent. Recently Used continues to rank only real streams.

Status: OPEN.

### Recovery Evidence — analytical Continuity mark translation

Classification: REQUIRED FOR DESIGN IMPLEMENTATION

Discovery:
Energy, Weight and Recovery founder-correction review; subsequently accepted and locked before the remaining Evidence-family task.

Current Build 85 behavior:
Recovery Sleep Trends renders Continuity with comparatively heavy vertical bar marks.

Accepted target:
Preserve the exact continuity data, missing-night gaps and range behavior, but render a lighter analytical mark treatment consistent with the locked Evidence system.

Implementation implication:
Replace only the Continuity chart marks/styles. Do not change the calculation, aggregation, range ownership, provenance, stage semantics or Recovery activation state.

Acceptance:
For the same fixture, every continuity value and gap matches Build 85. The visualization uses the accepted lighter analytical treatment in dark and mineral light and remains accessible without color-only meaning.

Status: OPEN.

### You / Settings — real route family and product boundary

Classification: REQUIRED FOR DESIGN IMPLEMENTATION

Discovery:
You / Settings / Profile source audit against Build 85 Native and Server.
Report: `agent-handoffs/reports/20261004T203501Z-you-settings-profile-ui-design.md`

Current Build 85 behavior:
The You tab owns a NavigationStack but renders `YouPlaceholderView`. It exposes Operating Plan, Founder device-connection diagnostics and a DEXA writeback control. Native has no Settings, Profile, Data Sources, Apple Health detail or Appearance destinations. The current web You root preserves Goals and Operating Plan but its Integrations row has no destination.

Accepted/required target:
Preserve You, Goals and Operating Plan. Replace the dead Integrations doorway with a real Settings doorway. Add typed Settings, Profile, Data Sources, Apple Health detail and Appearance routes. Keep Founder engineering diagnostics out of the product hierarchy and do not turn Settings into another Evidence Hub.

Implementation implication:
Add destination cases, coding, shared router handling, screens/read models and tests. Preserve stack/back behavior and tab ownership. Do not add generic web-href routing.

Acceptance:
From You, Goals and Operating Plan behave unchanged. Settings opens the compact target root; each approved row reaches exactly one typed destination and returns correctly. No dead Integrations, Coming Soon, Founder device diagnostics, raw tokens or Evidence duplication appear.

Status: PARTIALLY RESOLVED by Redesign Implementation Batch 1 (`c4a74ad0855a0500e42a90a81d6f4a871e5cc3c5`). You now has the locked product hierarchy and typed live routes for Goals, Operating Plan, Settings, Appearance and Founder connection. Profile, Data Sources / Apple Health detail and Sign Out remain deliberately unimplemented pending the separate contracts below; no dead tappable rows were added.

### Profile — canonical read, versioned edit and durable fields

Classification: REQUIRED FOR DESIGN IMPLEMENTATION

Discovery:
You / Settings / Profile source audit against Build 85 Native and Server.
Report: `agent-handoffs/reports/20261004T203501Z-you-settings-profile-ui-design.md`

Current Build 85 behavior:
Server already publishes an authenticated owner-scoped `/api/v1/native/profile` read. Native has an unused partial decoder. The legacy user model contains display/first/last name, email, timezone, DOB, sex, height and weight-unit preference, while the durable foundation `user_profiles` table stores only display name and time zone. No allowlisted Native command updates the profile.

Accepted/required target:
Profile exposes only Preferred name, Height, Time zone and Weight units. Establish one canonical preferred-name rule. Date of birth, biological sex, email, Goal, Weight and DEXA values are excluded. Changes never rewrite historical Evidence or occurrence/source time zones.

Implementation implication:
Extend the Native read projection/decoder; add durable height and weight-unit storage; normalize one IANA time zone; define one versioned owner-scoped update command with validation, expected-version conflict and canonical response; reconcile the current `firstName` greeting fallback with the preferred-name rule.

Acceptance:
The four fields load from canonical Server state, save atomically, survive relaunch/re-pairing, reject invalid values without losing edits, and produce deterministic version conflicts. Unit changes affect presentation/input defaults only. Existing Evidence values and historical time zones remain unchanged. Excluded fields never appear or transmit.

Status: OPEN.

### Appearance — System, Dark and locked Mineral Light

Classification: REQUIRED FOR DESIGN IMPLEMENTATION

Discovery:
You / Settings / Profile source audit against Build 85 Native.
Report: `agent-handoffs/reports/20261004T203501Z-you-settings-profile-ui-design.md`

Current Build 85 behavior:
`PhysiqueOSApp` forces `.preferredColorScheme(.dark)` and `PhysiqueOSTheme` is a static dark-only token set. Native has no appearance preference model or persistence. The web theme localStorage implementation does not provide a Native theme contract.

Accepted/required target:
Appearance offers System, Dark and Light. System is the default for new users. Light means the locked Mineral Light palette. Selection applies across product screens and system controls, is indicated by text plus checkmark, and persists on the device.

Implementation implication:
Add a typed device-local appearance preference/store, resolve System to a nil root override and explicit modes to light/dark, replace static dark colors with dynamic locked token pairs, and audit all app, widget, Live Activity and modal surfaces for correct ownership. Do not store this display-only preference in canonical Evidence.

Acceptance:
A fresh install follows the iPhone appearance. Choosing Dark or Light updates the whole app immediately and survives relaunch. System resumes following OS changes. Every locked key screen is readable in dark and Mineral Light, selected state is not color-only, and no screen remains fixed dark unintentionally.

Status: IMPLEMENTED ON ISOLATED BRANCH; RELEASE-GATED. Source: `codex/global-appearance-infrastructure-20261004` at `d5359e33845cba20a212dade24c25e94f02aee6e`. System/Dark/Light state, local persistence, nil System override, dynamic locked token pairs, narrow Appearance route, WidgetKit-owned paired behavior and ownership audit are complete. Merge with Claude's next-build authority and physical-device extension validation remain before release. Integrated 2026-10-05 into combined Build 86 head `cec8af20a6121bb66ecca3ba9f667d91774a891c` (cherry-picks `5d727b37`, `cec8af20`; no conflicts; byte-identical regeneration; combined gates passed except two pre-existing failures) — still RELEASE-GATED on physical-device validation (`agent-handoffs/reports/20261005T003623Z-build86-final-integration.md`). Shipped in TestFlight Build 86 (`cec8af20`, delivery `e70f2604-0f97-45fb-a720-fd695d23d0c4`, VALID; `agent-handoffs/reports/20261005T010919Z-build86-testflight-valid.md`); still release-gated on physical-device acceptance.

### Data Sources — user-safe Apple Health state projection

Classification: REQUIRED FOR DESIGN IMPLEMENTATION

Discovery:
You / Settings / Profile source audit against Build 85 Native HealthKit architecture.
Report: `agent-handoffs/reports/20261004T203501Z-you-settings-profile-ui-design.md`

Current Build 85 behavior:
Activity, Nutrition and Workout HealthKit synchronization exist; Sleep is Server-capability-gated; DEXA may explicitly write Body Fat Percentage and Lean Body Mass; Weight write is absent. Authorization, last outcomes and durable stream acknowledgements exist internally, but there is no user-readable source projection. Apple does not disclose per-type read denial.

Accepted/required target:
Data Sources lists Apple Health as the actual external source and shows what PhysiqueOS receives/sends. It distinguishes connected, no-visible-data/action-needed, Server-inactive and unavailable states without claiming a read permission was denied. It never exposes cursors, raw source identifiers, error codes or Evidence content.

Implementation implication:
Create a typed user-safe source read model from HealthKit availability, authorization request state, Server capability, DEXA writeback preference and durable acknowledged times. Define freshness/stale thresholds before using those labels. Provide a supported review-access action and keep engineering diagnostics separate.

Acceptance:
Connected and limited fixtures render the exact audited domains/directions. Sleep is active only when the Server capability is active. Empty reads display no visible data, not denied. Weight remains Not sent. Raw diagnostics never reach the screen. Relaunch preserves the last confirmed state without inventing freshness.

Status: OPEN.

### Account — end-user one-device Sign Out boundary

Classification: REQUIRED FOR DESIGN IMPLEMENTATION

Discovery:
You / Settings / Profile beta-readiness audit against current Native session code and approved platform architecture.
Report: `agent-handoffs/reports/20261004T203501Z-you-settings-profile-ui-design.md`

Current Build 85 behavior:
Founder Production can revoke the current session and delete its Keychain credential from a diagnostic connection screen. Production read snapshots are retired, but there is no end-user Settings action that guarantees all protected user-scoped caches/drafts are cleared and returns to a secure enrollment state.

Accepted/required target:
Settings shows the current device account state and a destructive Sign Out action for this device. Sign Out revokes the current session, clears local credentials and protected user-scoped state, and returns to secure pairing/re-enrollment. It never deletes canonical Server data.

Implementation implication:
Create one auditable sign-out coordinator spanning session revocation, Keychain deletion fallback, read/media cache retirement, user-scoped draft and widget/live surface cleanup, HealthKit owner/device state separation, and navigation reset. Define safe offline failure behavior without falsely claiming revocation.

Acceptance:
Online Sign Out revokes the session, clears protected local state, ends user-specific projections and opens enrollment. Relaunch cannot recover the old session or cached content. A failed/offline revocation reports the truth and does not silently delete the only local credential unless policy explicitly allows it. Canonical Server data remains intact.

Status: OPEN.

## Architectural context / do not automatically patch

### You / Settings — controlled-beta account boundary

Classification: ARCHITECTURAL CONTEXT

Discovery:
You / Settings beta-readiness audit.
Report: `agent-handoffs/reports/20261004T203501Z-you-settings-profile-ui-design.md`

Current/target boundary:
Owner-scoped identities, devices and sessions already support the controlled Founder/private-TestFlight model. The accepted initial Settings target does not authorize public signup, email/password identity, consumer recovery, billing, data export or account-deletion destinations. Operator-assisted recovery remains the current approved boundary.

Implication:
Do not add dead or Coming Soon account destinations during Settings implementation. Before a broader self-serve or external beta, Founder must separately decide distribution, recovery and privacy/deletion policy; those decisions may create new required contracts and UI.

Status: DOCUMENTED.

### Training Evidence — performance record presentation level

Classification: ARCHITECTURAL CONTEXT

Discovery:
Training Evidence source audit, package ca088e80e851c83d0d3e168d88f918232f5338d6.

Current behavior:
Session-level performanceRecords may be decoded, while Native intentionally presents current Performance Records at Exercise Detail.

Implication:
Do not interpret decoded session-level records as proof that Session Detail should show them. Preserve Exercise Detail ownership unless product requirements change.

Status: DOCUMENTED.

### Activity Evidence — no reporting hierarchy in Build 85

Classification: ARCHITECTURAL CONTEXT

Discovery:
Nutrition + Activity Evidence audit.

Current behavior:
Activity has root/day/history information but no current Activity Reporting hierarchy.

Implication:
Do not invent Activity Reporting during visual implementation.

Status: DOCUMENTED.

## Resolved / obsolete discoveries

### Priority Detail — Foam Rolling setup review destination

Classification: RESOLVED / LIKELY SHIPPING DEFECT.

Discovery:
Foam Rolling Priority Detail locked-design implementation pilot against Build 85 Native and current Server authority.
Report: `agent-handoffs/reports/20261004T205243Z-foam-rolling-priority-parity-pilot.md`

Build 85 behavior:
The Server published the setup-required action `Review Support` with href `/profile/operating-plan/execution/execution_foam_roll`. Native decoded the label and href, but its intentionally narrow Priority action mapper recognized only Morning Check-In. The Foam action therefore had no Native destination.

Required target:
Preserve the Server-owned setup action and navigate to the existing canonical Operating Plan Recovery Support detail. Do not add manual completion in setup-required state and do not create a general web router.

Resolution:
Implementation commit `b65deb00098713d824f14064e0362726997b5991` adds only the audited Foam href mapping to `.operatingPlanRecoverySupport(executionId: "execution_foam_roll")`. A deterministic production-envelope test proves the action label, non-completable/non-skippable state, and exact destination.

Acceptance:
Exact setup-required payload maps to the Recovery Support destination; open/completable Foam retains existing complete/skip semantics; Morning Check-In mapping and every unrecognized href remain unchanged.

Status: RESOLVED in the pilot branch; pending Founder review/merge.

### Goals — Completed-Goal ProgressPhotoTile expansion

Classification: RESOLVED / OBSOLETE as an implementation-gap candidate.

Founder decision:
Static first/final photos on the completed Goal are acceptable. `ProgressPhotoTile` does not need tap-to-expand on Goals.

Boundary:
This does not change the open Photo Briefing requirement for a simultaneous paired Previous/Current viewer with synchronized zoom/pan.

Status: CLOSED; do not re-add as a Goals implementation delta.

### Photo Briefing — single-photo tap-to-expand

Classification: RESOLVED / OBSOLETE as a general single-image bug.

Earlier backlog:
Photo comparison/session imagery was previously reported as not expanding.

Build 85 audit result:
Shared PhotoInspectionViewer now supports full-screen single-image inspection, zoom/pan, paging and failure/retry behavior.

Remaining gap:
Paired simultaneous comparison is still OPEN above.

Status: RESOLVED for single-photo expansion; do not close paired viewer requirement.

### Progress Photos — recoverable Retry photo reread

Classification: RESOLVED / OBSOLETE as a shipping-defect candidate.

Earlier concern:
An expired or masked authenticated media bearer could leave `Retry photo` unable to recover the tile.

Build 85 audit result:
`FounderServerAPITests.swift` proves one credential refresh plus one reread for the recoverable authorization case, and proves a tile retry performs a fresh reread and can recover without duplicate requests. Permanent or unsupported media resolves to the non-retryable unavailable state.

Status: RESOLVED; preserve the current loading / Retry photo / unavailable state split.

### Progress Photos — published Photo Briefing shown as preparing

Classification: RESOLVED / OBSOLETE as a shipping-defect candidate.

Earlier concern:
A published Photo Briefing could remain represented as “being prepared.”

Build 85 audit result:
`FounderServerAPITests.swift` and `PhotoProcessingUXTests.swift` prove production availability is reread, pending is not cached as published, a published result becomes the deep link, and transport/server uncertainty does not falsely claim processing.

Status: RESOLVED; do not re-add unless a new exact-authority regression is reproduced.

### Log — Sources disclosure needs structured per-row provenance

Classification: REQUIRED FOR DESIGN IMPLEMENTATION + FOUNDER DECISION

Discovery:
Redesign Batch 2 prep audit against Native Build 86 `cec8af20` and Server `27dad44a`.
Report: `agent-handoffs/reports/20261005T014604Z-redesign-batch2-log-training-prep.md`

Current shipping behavior:
`LoggedTodayService` names the source only through the literal "Apple Health" suffix inside each row's display `context` string, for example "215P · 161C · 111F · Apple Health". Training lines carry only `kind` (`logger` / `cardio` / `other`). Native `LoggedTodayRow` / `LoggedTodayLine` have no source field, and the Native Weight row has no provenance.

Accepted/required target:
The locked Log Compact Command Center removes "Apple Health" from the tiles and centralizes provenance in a collapsed bottom Sources disclosure. Example expanded content: Apple Health → Stair Stepper, Nutrition, Activity; PhysiqueOS Logger → Strength Training; Weight → Source unavailable.

Implementation implication:
Native must not parse display strings. Add a structured source per row/line to the Log read model (Server projection plus Native decoder), or the Founder accepts shipping the Command Center without Sources and with the Server context verbatim in the tiles until the contract exists.

Acceptance:
Sources content comes only from typed fields. Mixed-source days (Logger Strength plus Apple Health Cardio, screenshot Nutrition) are attributed exactly. Weight shows "Source unavailable" until it has a provenance field. Tiles no longer repeat "Apple Health". Older payloads without the field degrade to no disclosure.

Status: RESOLVED IN PRODUCTION; NATIVE RELEASE-GATED. Founder approved all five Batch 2 checkpoints and explicitly authorized D1. Server `c7c99347a520d13fd344fe89b6b1398877cdd255` is deployed: deployment `e7ef3157-8d1f-4e34-aa56-4668681b40bf` ACTIVE (2026-10-05T13:23:47Z), web and worker `source_commit_hash` and log-envelope `gitSha` both `c7c99347`, `/live` and `/ready` 200, ready 9/9. The change is additive: `context` is unchanged for Build 87 and older clients, which ignore the new `provenance` and `contextDetail` keys. Native typed Sources ships in Batch 2 release candidate `793462b11ff522f116413c5b081db0ad97954305`. Close after Build 88 device acceptance. Report `agent-handoffs/reports/20261005T150227Z-redesign-batch2-release-candidate.md`.

### Apple Watch Logger — Complete Set offered while the phone is in Review/Confirmation

Classification: LIKELY SHIPPING DEFECT (code-derived; not verified on device)

Discovery:
Same Batch 2 prep audit (Build 86 `cec8af20`).

Current shipping behavior:
`WatchWorkoutProjection.phase(of:)` (`WatchWorkoutProjectionMapper.swift:81-88`) ignores `step`. A live session at `.summary` / `.review` still projects `.active` with a current set, and `liveActivitySubject` includes those steps. However, `TrainingSessionInvariants.acceptsExternalContentMutation` (`TrainingSessionState.swift:408-417`) refuses non-UI content mutations outside `.workout` / adding exercises. The Watch can therefore offer Complete Set and receive `sessionNotMutable`. The Live Activity correctly hides the action (`.reviewing`).

Target:
The Watch never offers an action that the phone authority will refuse.

Implementation implication:
Either project a non-executing phase for review steps, or disable Complete Set on the Watch when the phone is reviewing. This is not part of the Batch 2 presentation work; the redesign must not change step semantics.

Acceptance:
With the phone on Workout Review or Final Confirmation, the Watch shows no actionable Complete Set (or a truthful reviewing state). Returning to set entry restores it. Build 86 Watch HealthKit and finish tests stay green.

Status: OPEN; verify on device before patching.

### Training Logger — error copy set but never rendered

Classification: LIKELY SHIPPING DEFECT (minor UX)

Discovery:
Same Batch 2 prep audit (Build 86 `cec8af20`).

Current shipping behavior:
The view model sets messages that the current view never displays:
- start failure "This workout couldn't be saved on this device. Try again." (the entry step has no validation slot);
- discard refused "This workout is being saved and can't be discarded right now.";
- the `reviewWorkout` reasons (Finish is disabled with no stated reason);
- paused-session edit rejection (`.sessionPaused` is not surfaced; edits silently do nothing);
- the configuration load failure, which has no retry control.

Target:
Every user-blocking refusal states its reason where the action was attempted, without inventing new workflow.

Implementation implication:
A small presentation fix that can ride on the Batch 2 Logger redesign only if the Founder authorizes it. It needs no view-model or authority change, except surfacing `.sessionPaused`, which needs copy decided with the Watch-status work.

Acceptance:
Each listed condition shows its existing copy in the visible step. No new mutation is emitted, and the UI tests keep their identifiers.

Status: OPEN; not fixed by the Batch 2 prep audit.

### You / Settings — full-row navigation tap targets

Classification: LIKELY SHIPPING DEFECT (interaction parity; accepted Batch 1)

Discovery:
Founder physical-device finding on Build 87; Batch 2 addendum `86210001`.

Current shipping behavior:
`YouNavigationRow` is a plain-style Button whose paper background sits outside its label, so only the drawn glyphs register taps. This affects You → Goals, Operating Plan, Settings and Founder device connection, plus Settings → Appearance.

Target:
The whole visible row is one control, with no visual change.

Implementation implication:
A full-row `contentShape` on the label; the Appearance option cards declare their card shape.

Acceptance:
`testYouAndSettingsNavigationRowsActivateAcrossTheWholeRow` taps the leading content, center whitespace and trailing chevron edge of every row in Dark and Mineral. Before and after captures are pixel-identical in row content.

Status: FIXED; FOUNDER-ACCEPTED (Checkpoint 1). Carried unchanged into Batch 2 release candidate `793462b11ff522f116413c5b081db0ad97954305`. Close after Build 88 physical-device acceptance.

### Home — Batch 1 briefing strip lost the `home.latestBriefing` test identity

Classification: TEST/ACCESSIBILITY-IDENTITY REGRESSION (pre-existing in Build 87; not a Batch 2 change)

Discovery:
Batch 2 final gates, 2026-10-05: isolated clean-install runs on candidate `49733300` and on Build 87 `f66c7fc6` give identical results.

Current shipping behavior:
Batch 1 renders the first briefing inside `HomeActionBriefingStrip` (`HomeJourneyFieldView.swift`), which carries no accessibility identifier. `BriefingCardView` (`home.latestBriefing`) is now used only for the second and later briefings. `TrainingAcceptanceUITests.testBriefingParityJourneys`, `testFounderCorrectionMidweekTrainingResponseJourney` and `testFounderCorrectionWeeklyAndPhotoBriefingJourney` therefore fail at their first assertion ("…Briefing was not available from Home"). They no longer exercise the Briefing journeys at all.

Target:
The Home briefing doorway keeps a stable identifier, and the three Briefing acceptance journeys run again.

Implementation implication:
Add an identifier to the strip's briefing control (or update the tests to the new identity) without any visual change.

Acceptance:
The three journeys pass on a clean install in Dark and Mineral, and Home captures stay pixel-identical.

Status: FIXED in Batch 2 release candidate `793462b11ff522f116413c5b081db0ad97954305` (commit `b1488c2e`). The strip's newest-briefing tile owns `home.latestBriefing`; older cards use `home.briefing.<id>`, so no identifier is duplicated. Dark and Mineral Home captures are pixel-identical before and after (zero differing pixels). The three Briefing journeys pass on a clean install. Report `agent-handoffs/reports/20261005T150227Z-redesign-batch2-release-candidate.md`.

## Implementation transition rule

Before beginning the eventual shipping UI implementation phase:

1. Audit every locked design report for implementation deltas.
2. Reconcile them into this ledger.
3. Reverify each OPEN item against the exact implementation authority at that time.
4. Build implementation sequencing so required plumbing/behavior lands before or with the UI that depends on it.
5. Add deterministic acceptance tests for each delta.
6. Do not mark a design surface implementation-complete while a REQUIRED FOR DESIGN IMPLEMENTATION delta remains open.

## Agent requirement

Future design prompts should state:

"Review agent-handoffs/DESIGN_IMPLEMENTATION_DELTA_LEDGER.md before stopping. Append any newly discovered implementation-relevant behavior/data/navigation/accessibility delta. Do not bury such findings only in the task report."
