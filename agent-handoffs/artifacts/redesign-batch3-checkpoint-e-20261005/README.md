# Redesign Implementation Batch 3 · Checkpoint E

Checkpoint E translates the canonical general Evidence intake and generic Evidence Review workflows into the Founder-locked PhysiqueOS Dark and Mineral Light system.

## Review artifact

- `checkpoint-e-mobile-review-board.png` — accepted reference beside the matching real-simulator viewport for both appearances.
- `screens/` — eight unedited iPhone 17 Pro simulator captures.
- `references/` — the exact accepted Founder-parity references used for review.
- `source/render-board.swift` — deterministic board renderer.

## Implemented surfaces

- General intake chooser with the exact production domain order: Automatic, Nutrition, Activity, DEXA, Training, Weight, Progress Photos, Other / General.
- DEXA intake with the existing one-PDF requirement and disabled/upload-ready transaction states.
- Generic mixed Evidence Review with included/excluded evidence semantics and canonical extracted values.
- Full-replacement DEXA correction editor with the production field-specific units and complete measurement payload.
- Loading, failure, pending, dismissed, confirmation, correction, and resubmission states retain the existing read-model and server-command behavior.

## Behavior proof

- Nutrition and Activity manual entry still save directly; the redesign does not insert a review step.
- Training, Weight, Progress Photos, and DEXA still hand off to their existing specialized flows.
- Progress Photos retain the staged pose coordinator and transfer/resume behavior.
- DEXA still accepts exactly one PDF and a correction still resends the full replacement measurement set.
- Review status, included/excluded state, retry eligibility, dismissal, idempotency/version commands, and conditional actions are unchanged.
- The real-simulator review routes and deterministic review payloads are `#if DEBUG` only and are absent from Release.

## Verification

- `EvidenceAttachmentContentTypeProbeTests` — passed.
- `EvidenceReviewHeaderDateTests` — passed.
- `LoggingSandboxTests` — passed.
- `ProgressPhotoPoseContractTests` — passed.
- `StagedPhotoIntakeTests` — passed.
- Focused `FounderServerAPITests` for production review decoding, typed Workout reconciliation, stable/versioned reconciliation commands, full DEXA replacement, and versioned/idempotent dismissal — passed.
- Debug simulator compile, including dependent targets — passed.
- Dark and Mineral Light captures were produced from the real iPhone 17 Pro simulator using shipping views and DEBUG-only deterministic route seams.

## Batch 2 boundary

Claude's Founder-approved Workout Match branch was not merged, cherry-picked, or edited. This checkpoint owns the generic Evidence Review shell only. Integration must preserve Batch 2's specialized Workout Match content branch and apply this checkpoint's generic visual treatment solely to non-Workout reviews.

## Boundary

- No Server behavior or schema changed.
- No Evidence content projection, domain order, validation, navigation, or action semantics changed.
- No shipping fixture changed.
- No version/build-number change and no TestFlight upload.
