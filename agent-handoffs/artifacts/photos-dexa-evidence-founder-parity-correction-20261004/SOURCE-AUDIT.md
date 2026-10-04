# Build 85 production source audit

## Authorities

- Founder prompt: `cb40f5df4a392d40a717355c5e6db559a76609a9`
- Native Build 85: `b8ee8690b194cb90086b62816b9a2c8c400dc026`
- Server Build 85: `3c0f4aefddbb9a6886f6ad012443978303d47024`

## Progress Photos

Primary Native proof:

- `Presentation/Evidence/PhotosHistoryView.swift`
- `Presentation/Evidence/PhotoSetDetailView.swift`
- `Presentation/Evidence/PhotoSetDetailViewModel.swift`
- `SharedUI/ProgressPhotoTile.swift`
- `SharedUI/PhotoInspectionViewer.swift`
- `Networking/PhotosAPI.swift`
- `Contracts/PhotosReadModel.swift`
- `Contracts/PhotosEvidenceCalculator.swift`
- `PhotoInspectionViewerTests.swift`

Root order is header → Viewing Goal scope → Latest Photo Set → conditional Photo Briefing action/state → Uploaded Photos. Latest Photo Set uses the first canonical pose as a 92 × 118 thumbnail beside date, view-count chip, optional weight, comparison availability and Open gallery. Both tapping the module and the Open gallery affordance set the selected photo set and present the large detail sheet.

Published Photo Briefing is a full-width 52 pt primary action. Pending is a separate informational card. Unknown availability renders no destination.

Uploaded Photos is one independent inline disclosure: preview three, Show All/Close, empty state, and newest-first records. Every row contains a 68 × 82 first-pose thumbnail, date, optional weight, view count, comparison availability and View label. The row opens the same detail sheet.

Detail order per selected canonical pose is header/session context → simultaneous Previous/Current comparison (or Current-only plus exact comparison absence) → optional Interpretation → optional Capture Conditions → optional Source History disclosure → Previous/Next pose controls. Seven-pose order is Front Relaxed, Back Relaxed, Back Flexed, Side Relaxed, Left Side Relaxed, Right Side Relaxed, Front Flexed.

Tapping Previous or Current opens the shared full-screen inspector at the tapped item. Items remain ordered Previous then Current. The inspector preserves aspect fit, pinch zoom, momentum pan, double-tap zoom up to 6×, page swipe, downward dismiss only when unzoomed, Close, selection count, zoom reset on page change/reopen, authenticated loading, retry, permanent unavailable and low-resolution fallback.

Safe neutral placeholders are used in the design harness. Their geometry and interaction match production without binding unrelated media to fixture dates.

## DEXA

Primary Native proof:

- `Presentation/Evidence/DEXAHistoryView.swift`
- `Presentation/Evidence/DEXAChartViews.swift`
- `Presentation/Evidence/DEXAHistoryViewModel.swift`
- `Contracts/DEXAReadModel.swift`
- `Contracts/DEXAEvidenceCalculator.swift`
- `Networking/DEXAAPI.swift`
- DEXA HealthKit writeback coordinator and PDF transport.

Exact root order is header/Viewing → Latest Scan → production DEXA→Apple Health status → five headline metrics → conditional Since Prior Scan → Core Trends → Supplemental Metrics → Regional Tissue Lean Mass → Regional Tissue Fat Mass → Scan History.

Core Trends is always open and contains Body Fat %, Fat Mass, Lean Mass, Total Mass and RMR in that order. All five use the same interactive tap/drag chart component.

Independent disclosures and preview limits are source constants: Supplemental Metrics 3, Regional Lean 3, Regional Fat 3, Scan History 3. Each has its own Boolean expansion state and Show All/Close control.

Supplemental expanded state shows nine rows followed by VAT Mass and A/G Ratio charts. Each Regional expanded state shows Arms, Legs, Trunk, Android and Gynoid rows followed by five corresponding charts. Scan History expands newest-first in place; rows remain read-only and expose View BodySpec PDF only where source media exists.

No DEXA scan-detail route is introduced. This fact is documented here and does not appear in product UI.
