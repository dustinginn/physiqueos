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

Status: OPEN.

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

Status: OPEN.

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
