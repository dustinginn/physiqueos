# PhysiqueOS app-wide redesign coverage audit

Status: **complete source audit; Founder/ChatGPT review required; no redesign or implementation performed**

Generated: 2026-10-04T20:42:47Z  
Prompt authority: `961c61236a43d4edb22a30c1884bd5b722c305fd`

## Founder-facing result

The major redesign is substantially covered but is **not yet design-complete**.

The source audit found **nine material user-facing surface/state groups** that still need explicit design review. They collapse safely into three final design batches:

1. **Daily capture and explanation:** Home Confidence sheet, Morning Check-In, manual/backdated weight and Briefing History.
2. **Evidence intake and review:** generic intake, Progress Photos intake, DEXA intake and the generic Evidence Review transaction flow.
3. **Utility closeout:** Home Screen Widget translation into the locked Home/Log visual system.

There are **zero Founder-decision-needed surfaces**. Existing product decisions are sufficient to design the remaining work without reopening any locked family.

After those three batches are reviewed and locked, the major current-Native redesign can be considered design-complete. Implementation deltas may remain open, but they do not represent missing design surfaces.

## Source authority

The prompt required revalidation rather than assuming Build 85. The fetched repository still shows:

- Native Build 85: `b8ee8690b194cb90086b62816b9a2c8c400dc026`;
- generated build number: 85 in `ios/Scripts/generate_project.py` and the Xcode project;
- current Server authority used by the design program: `3c0f4aefddbb9a6886f6ad012443978303d47024`;
- no Build 86 branch, report, generated build number or release authority.

The audit enumerated all 46 `AppDestination` cases, all five tab stacks, external/deep-link entries, every top-level presentation screen in the iPhone/Watch/widget targets and all 41 material sheet/cover/alert/picker declarations. Full proof is in:

- `agent-handoffs/artifacts/app-wide-redesign-coverage-audit-20261004/SOURCE-COVERAGE-PROOF.md`
- `agent-handoffs/artifacts/app-wide-redesign-coverage-audit-20261004/SURFACE-COVERAGE-MATRIX.tsv`
- `agent-handoffs/artifacts/app-wide-redesign-coverage-audit-20261004/validation.json`

## Classification totals

The matrix classifies 98 material surface/state groups. Reusable rows and private view fragments are counted through their owning surface rather than double-counted.

| Class | Meaning | Count |
|---|---|---:|
| A | Founder-locked design | 64 |
| B | Covered by locked family/component/system | 15 |
| C | Explicit design pass still required | 9 |
| D | Do not redesign | 10 |
| E | Founder decision needed | 0 |

## A — Founder-locked design

The audit reconciled and did not reopen:

- Home and the shared five-tab shell;
- Log Compact Command Center;
- Weekly, Midweek, Monthly, DEXA and Photo Briefings;
- Goals and all production Goal/Phase/completed states;
- Priority Detail and its materially distinct types/states;
- the entire Operating Plan family end to end, including Tracking, Coaching Updates and the current standalone DEXA unavailable state;
- Evidence Hub, Training, Nutrition, Activity, Energy, Weight, Recovery, Progress Photos, DEXA and Timeline, including their current drill-downs and material history/reporting sheets;
- You, Settings, Profile, Data Sources and Appearance targets;
- Training Logger, Apple Watch workout and Live Activity/Dynamic Island;
- the single-photo and accepted paired Previous/Current viewer targets.

The existing implementation-delta ledger remains authoritative for behavior/plumbing not yet implemented. Those entries do not reopen these designs.

## B — Covered without a dedicated new mockup

These current surfaces do not need their own design pass:

- navigation bars, back behavior, pull-to-refresh and tab shell behavior;
- shared loading/error/empty/last-known banners inside already locked families;
- native alerts and confirmation dialogs attached to locked actions;
- notification and deep-link landings, because they resolve into locked Priority/Briefing/Logger screens;
- Photos picker, Files picker, native date/time picker, keyboard, menus and share sheet;
- iOS/watchOS Apple Health authorization and notification-permission sheets;
- app icon, launch snapshot and widget-gallery container; no rebrand is authorized;
- the signed-out/reconnect state explicitly mapped by the locked Settings account family to the existing secure enrollment authority.

These are either system-owned or compositionally subordinate to a locked family. They still require implementation-level contrast, tint, Dynamic Type and VoiceOver verification.

## C — explicit design pass still required

| ID | Surface | Route / entry | Current purpose and styling | Why explicit review is still needed | Dependencies | Recommended batch | Priority |
|---|---|---|---|---|---|---|---|
| H02 | Home Confidence explanation | Home ring → `ConfidenceDetailSheet` | Long sheet of current confidence factors using the old generic stacked-section styling | Home rounds locked the ring/hero but never rendered this reachable sheet; its hierarchy and density are material | Locked Home hero, canonical Confidence V3 content | Daily capture and explanation | High |
| L04 | Morning Weigh-In / Morning Check-In | `checkIn(morning*)` | Daily weight, unfinished-priority reconciliation, optional notes, validation, pending reconciliation and success | High-frequency production form was not included in Home, Log or Priority Detail renders | Locked Home/Log, Priority completion semantics, Morning Check-In contract | Daily capture and explanation | Highest |
| L05 | Manual/backdated weight | `manualWeighIn` | Date, unit, numeric value, save, success/error | Locked Log shows the doorway only; the destination form has not been reviewed | Locked Log, Weight units and evidence semantics | Daily capture and explanation | High |
| B06 | Briefing History | `briefingList` | Newest-first cross-cadence index using old repeated cards | Every briefing detail is locked, but this reachable index page never received a full-page translation | Locked briefing cadence labels, titles, dates and navigation | Daily capture and explanation | Medium |
| E20 | Generic Evidence intake | Log Add evidence / `evidenceIntake` | Screenshots, photos, PDFs, files, notes, manual entry, domain resolution, progress and validation | Transactional multi-mode surface is not covered by the locked Evidence read pages or Log root | Locked Log, Evidence contracts, system pickers | Evidence intake and review | Highest |
| E21 | Progress Photos intake | `photoUpload` | Multi-photo capture with pose/orientation/contraction identity and validation notices | Image-first capture geometry and metadata confirmation are materially distinct | Locked Progress Photos Evidence/Briefing, canonical pose contract | Evidence intake and review | Highest |
| E22 | DEXA intake | `dexaUpload` | PDF/image upload and manual field-specific measurement entry | Scan capture, units and correction states are distinct from the locked DEXA read and briefing pages | Locked DEXA Evidence/Briefing, DEXA units/contracts | Evidence intake and review | Highest |
| E23 | Generic Evidence Review | `evidenceReview(reviewId)` | Pending/processing, captured items, corrections, confirm/dismiss and terminal states across Nutrition, DEXA, Photo, text and mixed reviews | Only the workout-match variant was explicitly designed in the Logger package | Locked Evidence families, write commands, provenance and optimistic-concurrency semantics | Evidence intake and review | Highest |
| U04 | Home Screen Widget | Widget gallery → `HomeLoggedTodayWidget` | Small/large Logged Today widget with fresh/stale/offline/redacted/active-workout states; current purple-era visual treatment | Current widget predates the selected Home/Log system and was omitted from the later utility redesign lock | Locked Home/Log tokens, WidgetKit family/privacy constraints | Utility closeout | Medium |

### Important boundary inside Evidence Review

The ambiguous Apple Health workout-match state is already Founder-locked through the Training Logger package and is A. E23 covers the remaining generic review/correction/commit states only. This prevents a broad redesign from reopening accepted workout reconciliation.

## D — do not redesign

The audit explicitly excludes:

- Sandbox-only Goal edit/transition/protocol and phase-transition flows;
- fixture Evidence Intake and Local Evidence Review editors;
- production evidence-recovery placeholder paths that Founder Production does not publish;
- the superseded Health Metrics Coming Soon destination;
- unused generic Operating Plan status routing;
- unknown/unmapped destination placeholder UI;
- Founder device-connection diagnostics, authority switching and network export;
- Sleep canary/historical validation/import tools;
- one-off DEXA physical-validation write/delete controls.

The locked Settings/Data Sources/Sign Out design replaces the product-facing purpose of the diagnostic connection surface. Engineering validation tools should remain hidden or separately gated rather than receive consumer styling.

## Cross-app checklist

| Area requested by prompt | Result |
|---|---|
| Onboarding/enrollment/account | Current diagnostic connection UI is D; locked Settings explicitly maps Sign Out to secure re-enrollment, so no new product decision is needed |
| Loading/error/empty | A where directly designed; otherwise B under its locked family |
| Media viewers | single/paired photos and DEXA PDF are A; no uncovered viewer |
| Sheets/modals/alerts/pickers | Home Confidence is C; Evidence transaction surfaces are C; other material sheets are A or system-owned B |
| Notifications/deep links | B; destinations are locked and system chrome is not redesigned |
| HealthKit/source flows | Data Sources is A; authorization sheets are B; diagnostics/canaries are D |
| Watch | A |
| Live Activities / Dynamic Island | A |
| Home Screen Widget | C — the one missed app-owned extension family |
| Utility destinations | Morning Check-In, manual weight and Briefing History are C; placeholders/diagnostics are D |

## Recommended final design sequence

1. **Evidence Intake + Review family.** Treat `ProductionEvidenceUploadView` and `EvidenceReviewDetailView` as one end-to-end transaction. Render generic, Progress Photos and DEXA intake plus generic review/correction/commit states in dark and Mineral Light. Preserve exact production semantics.
2. **Daily capture + explanation family.** Translate Morning Check-In, manual weight, Home Confidence and Briefing History. This is smaller but touches high-frequency daily behavior.
3. **Home Screen Widget closeout.** Translate the existing small/large states directly into the locked Home/Log palette and hierarchy while preserving WidgetKit constraints, privacy and deep links.

No new alternative direction is needed. Each batch should be a direct translation into the locked system.

## Design-complete gate

The redesign program may be declared design-complete when:

- all nine C rows above have Founder-reviewed dark/Mineral-Light targets where app-owned appearance applies;
- their material loading/error/empty/transaction states are mapped;
- the coverage matrix moves those rows to A or B;
- no new reachable Native route appears during the next authority recheck.

Open implementation deltas do not block design-complete status unless source changes create a genuinely new user-facing surface.

## Implementation-delta ledger review

`agent-handoffs/DESIGN_IMPLEMENTATION_DELTA_LEDGER.md` was read in full. No new behavior, data, navigation or accessibility gap was discovered beyond its existing entries. No ledger entry was added merely because a surface needs design.

## Shipping isolation

- No Native UI implementation.
- No Server or schema change.
- No production mutation.
- No build, archive, upload or TestFlight action.
- No redesign render or accepted family was reopened.

Stop reason: all current material Native routes, sheets, modals, viewers, states, system surfaces and extensions are classified; the remaining design work is finite and unambiguous.
