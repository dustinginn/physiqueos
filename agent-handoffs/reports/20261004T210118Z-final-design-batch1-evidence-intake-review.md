# PhysiqueOS Final Design Batch 1 — Evidence Intake + Review

Status: **complete design package; Founder review required; no shipping implementation**

Generated: 2026-10-04T21:01:18Z  
Prompt authority: `d315c2372dd2b2f08b55ceeb0be758510f5fee05`  
Work branch: `codex/final-design-batch1-evidence-intake-review-20261004`

## Founder review result

The four remaining Evidence transaction groups from the app-wide coverage audit are now source-audited and rendered in the locked dark/Mineral-Light PhysiqueOS system:

1. Generic Evidence Intake
2. Progress Photos Intake
3. DEXA Intake
4. Generic Evidence Review

The package covers 20 materially distinct workflow surfaces/states in both appearances: **40 full-resolution screens** plus 20 dark/light pair images and four mobile review boards.

Exact primary PNG:

`agent-handoffs/artifacts/final-design-batch1-evidence-intake-review-20261004/boards/evidence-intake-review-primary-mobile.png`

Focused PNGs:

- `agent-handoffs/artifacts/final-design-batch1-evidence-intake-review-20261004/boards/generic-intake-review-mobile.png`
- `agent-handoffs/artifacts/final-design-batch1-evidence-intake-review-20261004/boards/progress-photos-intake-mobile.png`
- `agent-handoffs/artifacts/final-design-batch1-evidence-intake-review-20261004/boards/dexa-intake-review-mobile.png`

Phone-friendly index:

`agent-handoffs/artifacts/final-design-batch1-evidence-intake-review-20261004/comparison-board.html`

## Authority recheck

The current audited authority remains:

- Native Build 85: `b8ee8690b194cb90086b62816b9a2c8c400dc026`
- current Server contract authority: `3c0f4aefddbb9a6886f6ad012443978303d47024`
- scope authority: app-wide audit rows E20–E23

The audit read the complete production `ProductionEvidenceUploadView` and `EvidenceReviewDetailView` hierarchy plus their route, picker, pose, read-model, API and Server presentation/intake contracts. Detailed proof is in `SOURCE-AUDIT.md`.

## Important parity findings preserved

- Generic Add Evidence and Add details without an asset reach the same production chooser; source/details are not preseeded.
- Automatic classification is per attachment and can group multiple canonical intakes behind one Upload. Only ambiguous attachments require an explicit local type.
- Training and Weight redirect to their purpose-built entry points; Other / General remains explicitly unavailable.
- Manual Nutrition and Activity write directly and show Evidence saved; they do not create Evidence Reviews.
- Progress Photos retain original media, canonical pose constraints, dependent-choice notices, per-photo confirmation, four session-condition fields, original/unedited confirmation and resumable staged transfer.
- DEXA intake is exactly one BodySpec PDF. There is no production DEXA manual-entry intake screen.
- DEXA correction stays inside Evidence Review, keeps every field-specific unit and resends the complete measurement set.
- Review source labels, included/excluded status, occurrence date, version, mixed item content and Server-owned status semantics remain intact.
- Confirm, Dismiss and correction retain optimistic/version fences and uncertainty readback. Confirmation accepted is not falsely presented as terminal confirmation.
- Initial Review load failure/not-found remains actionless; no unsupported retry was invented.
- Progress Photos review does not gain an invented pose editor; correction remains dismiss and re-upload when Server validation refuses confirmation.

## Visual translation

The screens use the locked next-generation PhysiqueOS grammar without becoming dashboard-like:

- navy task background and selective teal/navy color fields;
- Mineral Light surfaces with bounded contrast, not a white-card wall;
- purple limited to brand/eyebrow emphasis;
- semantic teal, green, amber and red paired with text/icon states;
- one strong primary action and restrained secondary/destructive actions;
- file/source context kept compact;
- long DEXA and photo flows remain readable and native-feasible.

No alternate direction was created.

## Coverage and validation

Automated render validation passed:

- 20 surfaces;
- 40 full-resolution appearance renders;
- identical dark/light content and geometry;
- 402 pt target width;
- no horizontal overflow;
- >=44 pt rendered button/navigation targets;
- required current labels, units and actions present.

See:

- `COVERAGE-ACTION-MATRIX.md`
- `PARITY-PROOF.md`
- `ACCESSIBILITY-FEASIBILITY.md`
- `validation.json`

## Locked-family boundary

No locked Evidence presentation surface was reopened. This pass excludes Evidence Hub, Training/Nutrition/Activity/Energy/Weight/Recovery/Progress Photos/DEXA/Timeline presentation, locked briefings, media viewers and the locked HealthKit workout reconciliation design.

## Implementation-delta ledger

The implementation-delta ledger was read in full. No new delta was added: the target uses only current production behavior and does not depend on new data or navigation. See `IMPLEMENTATION-DELTA-REVIEW.md`.

## Shipping isolation

- no Native source change;
- no Server source or schema change;
- no production mutation;
- no HealthKit permission change;
- no build, archive, TestFlight or release action.

Stop reason: all four authorized groups are source-audited, all material current states are represented in dark and Mineral Light, parity validation passes, and the mobile review package is ready for Founder decision.
