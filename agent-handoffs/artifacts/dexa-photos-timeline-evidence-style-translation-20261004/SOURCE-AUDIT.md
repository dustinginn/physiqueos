# Source audit

## Authorities

- Prompt authority / current main: `f5d72b2be4ad214a05ede419a1db55443e489fcd`
- Native Build 85: `b8ee8690b194cb90086b62816b9a2c8c400dc026`
- Server Build 85 contract: `3c0f4aefddbb9a6886f6ad012443978303d47024`

## Evidence Hub

Audited `ProductionDailyDriverAPI.swift`, `EvidenceView.swift`, `EvidenceStreamRowView.swift` and `EvidenceHubUsage.swift`.

Build 85 Native composes Training, Nutrition, Weight, Photos, DEXA, Activity, Energy, Timeline, Recovery and a Health Metrics Coming Soon entry. The accepted target preserves all current real streams, moves Timeline after Recovery, and removes Health Metrics completely. Recently Used remains a local recency/frequency projection of real streams.

Target real-stream order: Training → Nutrition → Weight → Photos → DEXA → Activity → Energy → Recovery → Timeline.

## DEXA Evidence

Audited `DEXAHistoryView.swift`, `DEXAHistoryViewModel.swift`, `DEXAReadModel.swift`, `DEXAEvidenceCalculator.swift`, `DEXAChartViews.swift`, `DEXAAPI.swift`, `DEXAWriteAPI.swift` and DEXA HealthKit writeback.

DEXA Evidence is one page, not a route hierarchy. There is no per-scan detail destination. Current order is header, scope, Latest Scan, production DEXA→Apple Health reconciliation, five-card summary, conditional Since Prior Scan, Core Trends, Supplemental Metrics, Regional Tissue Lean Mass, Regional Tissue Fat Mass and Scan History.

Exact summary: Body Fat, Fat Mass, Lean Mass, Weight and RMR. Exact delta: Body Fat percentage points, Fat Mass pounds and Lean Mass pounds. Core trends preserve Body Fat %, Fat Mass, Lean Mass, Total Mass and RMR. Supplemental values preserve VAT Mass, VAT Volume, Android Fat %, Gynoid Fat %, A/G Ratio, Bone Mineral Content, Total BMD, T-Score and Z-Score. Regional lean/fat each preserve Arms, Legs, Trunk, Android and Gynoid.

Supplemental, regional and history Show All/Close are inline disclosures. History is newest-first; rows are not navigation. Authenticated BodySpec PDF remains available only when the scan exposes source media and opens a PDF sheet with loading/failure behavior.

## Progress Photos Evidence

Audited `PhotosHistoryView.swift`, `PhotosHistoryViewModel.swift`, `PhotoSetDetailView.swift`, `PhotoSetDetailViewModel.swift`, `ProgressPhotoTile.swift`, `PhotoInspectionViewer.swift`, `PhotosAPI.swift` and production photo API composition.

Photos is also one Evidence root. Current order is header, Goal scope selector, Latest Photo Set, conditional Photo Briefing entry, and Uploaded Photos. Show All/Close expands Uploaded Photos inline; a row opens the same photo-set detail sheet.

Photo-set detail preserves canonical pose mapping and Previous/Current roles. When a matched prior pose exists, two tiles are shown side by side. Tapping either uses the current single-image inspector; its ordered viewer items are Previous then Current. The viewer preserves aspect fit, pinch zoom, momentum pan, double-tap zoom, paging, unzoomed downward dismiss, reset, loading, recoverable retry, unavailable and low-resolution fallback behavior.

The latest production contract may omit same-day weight and narrative fields; the target does not fabricate them. Published Photo Briefing availability yields a link; actual pending yields pending; unknown yields no entry. Placeholder figures in the review board are intentionally non-authoritative.

## Timeline

Audited `TimelineView.swift`, `TimelineViewModel.swift`, `TimelineReadModel.swift`, Native timeline transport, and Server `EvidenceTimelineReadService.js` plus its tests.

Timeline is one bounded, newest-first page. It has loading, failure, empty and loaded states. Rows are not navigation. Native does not expose filters, search, Load More or a pagination control; it only shows `Showing N of M` when the server says more entries exist.

Server-authored current event types include Weight, Progress Photo, DEXA, Protocol, Daily Check-In, Analysis, Daily Briefing, Evidence Upload, Daily Activity and Workout. Failed Evidence Upload events appear only while unrecovered; recovered failures are omitted. Training/activity are canonical reconciled events.

## Historical Progress Photos issue reverification

- `FounderServerAPITests.swift` proves expired/masked bearer media performs one refresh and reread; tile retry rereads and can recover without duplication. Permanent or unsupported media becomes unavailable. The old Retry photo issue is resolved.
- `FounderServerAPITests.swift` and `PhotoProcessingUXTests.swift` prove pending availability is not cached as published, fresh published availability becomes a link, and transport/server uncertainty does not claim processing. The old incorrect “Photo Briefing is being prepared” issue is resolved.
- The open simultaneous paired comparison viewer remains a Photo Briefing requirement. Current Photos Evidence correctly uses the single-image inspector and is not changed here.
