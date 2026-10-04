# Navigation and disclosure trees

## Evidence Hub

```text
Evidence
├─ Recently Used (up to three real streams)
└─ All Evidence
   ├─ Training
   ├─ Nutrition
   ├─ Weight
   ├─ Photos
   ├─ DEXA
   ├─ Activity
   ├─ Energy
   ├─ Recovery
   └─ Timeline (last)
```

There is no Health Metrics target page and no Coming Soon row.

## DEXA

```text
Evidence Hub → DEXA (one scroll page)
├─ Goal scope selector
├─ Latest Scan
│  └─ View BodySpec PDF → authenticated PDF sheet → Done
├─ DEXA → Apple Health reconciliation status
├─ five summary metrics
├─ Since Prior Scan (when at least two scans)
├─ Core Trends (interactive charts)
├─ Supplemental Metrics → Show All / Close inline
├─ Regional Tissue Lean Mass → Show All / Close inline
├─ Regional Tissue Fat Mass → Show All / Close inline
└─ Scan History → Show All / Close inline
```

There is no DEXA scan-detail route from Evidence.

## Progress Photos

```text
Evidence Hub → Photos (one scroll page)
├─ Goal scope selector
├─ Latest Photo Set → photo-set detail sheet
├─ Photo Briefing (only when current availability says published/pending)
└─ Uploaded Photos → Show All / Close inline
   └─ session row → photo-set detail sheet
      ├─ pose/date
      ├─ Previous + Current matched tiles, or Current-only/empty variant
      ├─ tap tile → single-image inspection viewer
      ├─ optional source/conditions only when present
      └─ Previous pose / Next pose
```

## Timeline

```text
Evidence Hub → Timeline
└─ newest-first server-authored events
   └─ optional Showing N of M label
```

Timeline rows do not navigate. No filters, search or Load More control exist.
