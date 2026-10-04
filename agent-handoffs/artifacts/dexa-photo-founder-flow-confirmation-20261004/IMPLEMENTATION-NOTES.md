# Future implementation notes — not authorized in this task

## DEXA

1. Preserve source-formatted values in `comparisonGroup`, `regionalGroup`, `supplementalGroup` and `DEXAInlineComparisonRow`.
2. Restyle—not reduce—`cutTimelineModule`; retain Goal/Phase context, both dates, days, scan count, all four start/current/delta metrics and the canonical summary.
3. Add VoiceOver phrasing for percentage-point deltas and unitless A:G Ratio.
4. At large Dynamic Type, switch four-column value tables to labeled stacked rows; do not truncate units.

## Photo

1. Reuse the existing `PhotoInspectionViewer` for individual This Photo Session images.
2. Add a separate paired-comparison request and full-screen viewer; do not overload a one-image `PhotoInspectionRequest` while pretending it is simultaneous.
3. Reuse existing image loading/retry policy, but budget for two high-resolution assets and downsample to device need.
4. Prefer one shared zoomable canvas for synchronized pair transform.
5. Preserve the source pair ID and Previous/Current ordering in the request so it cannot drift during async load.
6. Reset transform on dismiss/reopen and when changing comparison pairs.
7. Test mismatched aspect ratios, image failures on one side, rotation, Dynamic Type, VoiceOver and Reduce Motion.

No step above was implemented here.

