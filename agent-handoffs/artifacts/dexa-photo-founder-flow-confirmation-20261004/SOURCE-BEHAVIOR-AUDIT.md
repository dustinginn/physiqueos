# Build 85 source and behavior audit

## DEXA

Authority: `ios/PhysiqueOS/Presentation/Briefings/DEXABriefingSections.swift` at Native SHA `b8ee8690b194cb90086f6f62816b9a2c8c400dc026`.

- `sectionInventory` explicitly includes Since Last Scan, Regional Fat Change, Measured Lean Tissue Change, Other Notable Changes and Cut Timeline.
- `comparisonGroup`, `regionalGroup`, and `supplementalGroup` own the field-string rows.
- `cutTimelineModule` already renders the full production goal/phase comparison: elapsed days, scan count, start/current dates, each metric’s start/current/delta, and the canonical summary.
- The design regression was in the prior mockup, not in the shipping contract. Future implementation should keep `cutTimelineModule`’s information architecture and restyle its composition.

## Photo flow

Authority: `ios/PhysiqueOS/Presentation/Briefings/PhotoBriefingSections.swift`.

- The declared inventory is Hero → Snapshot → Progress → Interpretation → Coach’s Insight → conditional Completion Decision.
- Snapshot builds a `PhotoInspectionItem` for every available session pose. Tapping uses `.inspectsPhoto` and starts on the tapped item.
- An ordinary comparison builds two `PhotoInspectionItem`s in Previous-then-Current swipe order.
- Each comparison tile is still individually routed through `.inspectsPhoto`; the resulting full-screen surface shows one item at a time.
- The current comparison branch therefore preserves pairing in the item list, but does not present the pair simultaneously.

## Shared current viewer

Authority: `ios/PhysiqueOS/SharedUI/PhotoInspectionViewer.swift`.

Currently implemented:

- `PhotoInspectionRequest` filters inspectable items and starts at the tapped item;
- `fullScreenCover` presentation;
- one-image-at-a-time paging within a group;
- native pinch zoom, momentum pan and double-tap zoom;
- maximum zoom scale 6× and double-tap target up to 3×;
- aspect-fit image layout without forced crop;
- image centering after zoom;
- swipe-between-items behavior;
- drag-down dismiss when not zoomed;
- 44-point close control and Escape dismissal;
- title, caption and `n of m` context;
- high-resolution inspection request with fallback and retry states;
- zoom reset when a page is no longer selected.

Not currently implemented:

- a simultaneous Previous/Current comparison surface;
- one shared zoom transform across both matched images;
- synchronized pan between two panes;
- paired comparison-specific VoiceOver relationship semantics.

The existing single-image viewer satisfies the requested This Photo Session interaction. It does **not** satisfy the requested What Visibly Changed pair expansion.

