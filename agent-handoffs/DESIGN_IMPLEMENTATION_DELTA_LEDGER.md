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

## Architectural context / do not automatically patch

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
