# Source audit — Evidence Intake + Review

## Authority

- Native Build 85: `b8ee8690b194cb90086b62816b9a2c8c400dc026`
- current Server contract authority: `3c0f4aefddbb9a6886f6ad012443978303d47024`
- scope authority: `agent-handoffs/reports/20261004T204247Z-app-wide-redesign-coverage-audit.md`, rows E20–E23

Primary Native files audited in full:

- `ios/PhysiqueOS/Presentation/Logging/ProductionEvidenceUploadView.swift`
- `ios/PhysiqueOS/Presentation/Evidence/EvidenceReviewDetailView.swift`
- `ios/PhysiqueOS/Contracts/EvidenceReviewDetailReadModel.swift`
- `ios/PhysiqueOS/Contracts/ProgressPhotoPoseContract.swift`
- `ios/PhysiqueOS/Contracts/LoggingSandbox.swift`
- `ios/PhysiqueOS/Networking/EvidenceReviewAPI.swift`
- `ios/PhysiqueOS/Presentation/Log/UploadCardView.swift`
- `ios/PhysiqueOS/Presentation/Root/AppDestinationRouterView.swift`

Primary Server files audited:

- `src/application/native/NativeEvidenceIntakeRequest.js`
- `src/application/native/NativeStagedEvidenceIntakeRequest.js`
- `src/application/evidence/EvidenceReviewReadService.js`
- `src/domain/services/EvidenceReviewPresentationService.js`
- typed destination and mutation contracts reached by the Native pipeline

## Entry and presentation ownership

All four groups are NavigationStack destinations, not custom sheets:

- Log `Add evidence` and `Add details without an asset` both push `.evidenceIntake` and Founder Production resolves `ProductionEvidenceUploadView`.
- `/evidence/photos` / `.photoUpload` pushes the same production view fixed to Progress Photos.
- `/evidence/dexa` / `.dexaUpload` pushes the same production view fixed to DEXA.
- Log's ready queue, fast post-upload follow-up and the running-app notification push `.evidenceReview(reviewId:)` to `EvidenceReviewDetailView`.
- PhotosPicker, Files importer and date/time pickers remain system-owned overlays and were not custom-redesigned.

The generic Log source menu does not preseed a specific production source, and `Add details without an asset` does not preselect Manual. Both arrive at the same production chooser. The target preserves that current behavior.

## Generic intake contract

- Domain order is Automatic, Nutrition, Activity, DEXA, Training, Weight, Progress Photos, Other / General.
- Automatic accepts images or PDF, classifies each attachment locally only to select one supported Server intake, groups mixed detected domains and requires a per-file explicit type only when classification is ambiguous.
- Explicit Nutrition and Activity provide Screenshot / Manual. Manual field order is preserved exactly.
- Training redirects to Training Logger; Weight redirects to Manual Weigh-In; Progress Photos redirects to its fixed route; Other / General is explicitly unavailable.
- Screenshot/image intakes accept 1–4 files. DEXA is exactly one BodySpec PDF. Progress Photos use their staged transport.
- Generic phases are picking, classifying, uploading, processing, accepted, confirmed and failed.
- Manual Nutrition/Activity save directly, verify a fresh read, refresh the widget relay and show `Evidence saved`; they do not create an Evidence Review.
- File upload returns control after durable intake acceptance. A three-poll fast follow-up pushes a ready review when available; otherwise the screen says the Founder can leave and starts ready-review notification observation. It never resubmits on uncertainty.

## Progress Photos contract

- One or more original image assets are allowed. `PhotosPicker` keeps current encoding to preserve original bytes.
- Each photo carries one canonical pose identity. Founder-facing controls are Orientation, Contraction and Pose, constrained by the generated Server pose table.
- Canonical poses are Front Relaxed, Rear Relaxed, Rear Flexed — Double Biceps, Side Relaxed, Left Side Relaxed, Right Side Relaxed and Front Flexed.
- A dependent choice can move another field and produces a plain-language notice, such as `Double Biceps uses Flexed.` Confirmation is per photo and clears after an identity change.
- Session field order is Time of day, Fasted, Post-workout and Pump. Time of day is required; the others are tri-state. Original/unedited confirmation is required.
- The staged coordinator sends one bounded request per original, preserves HEIC/HEIF bytes and stores a durable local plan. Current states include per-photo progress, all-media-received, resumable waiting, rejected-plan discard and generic failure/retry.
- Acceptance creates only a pending Server-owned PhotoSession review and starts the existing downstream lifecycle. It does not complete canonical history on the intake screen.

## DEXA contract

- Fixed DEXA intake contains Date, one BodySpec PDF and Upload. There is no current production DEXA manual-entry mode on the intake screen.
- The Server validates exactly one PDF, file signature/name/content type and a bounded 50 MB scan payload.
- Field-specific manual correction exists only inside the pending Evidence Review and is full replacement, never merge.
- Correction order/units are exact: measured date; total mass lb; body fat %; fat mass lb; lean mass lb; bone mineral content lb; RMR kcal/day; VAT mass lb; VAT volume in³.

## Generic Evidence Review contract

- Loading, transport failure and not-found are distinct read states. The current initial-load failure/not-found states have no retry action; the target does not invent one.
- Header date is the occurrence date derived from included items, not `createdAt`; multiple dates render as a count. Version remains visible.
- Server presentation owns titles, summary, excluded summary, source labels, metrics, meals, exercises, typed text, DEXA measurements and PhotoSession identity.
- Included/excluded are current presentation facts; this Native screen does not expose an item-decision toggle.
- Actionable statuses are pending, commit_failed and partially_committed. Dismiss is available only for pending and commit_failed and uses a system confirmation alert.
- DEXA correction requires a readable version and sends the full field set through `dexa-review.measurements.v1` before confirmation.
- Confirm uses stable idempotent/version-protected commit. `Confirmation accepted` means Server-owned background processing continues; `Confirmed` is the terminal read. Readback uncertainty produces Still confirming or Refresh required, never a blind second mutation.
- Dismiss is version-protected. Uncertain acceptance is read back before the screen allows another attempt.
- Photo pose/session commit validation can refuse confirmation and instruct the Founder to dismiss and re-upload. Native does not invent an in-review pose editor.
- The already locked HealthKit workout reconciliation variant is intentionally excluded from this package.
