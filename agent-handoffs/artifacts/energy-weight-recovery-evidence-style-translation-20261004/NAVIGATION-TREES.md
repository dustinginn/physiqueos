# Current navigation trees

These trees describe Build 85 behavior, not a proposed information architecture.

## Energy

```text
Evidence Hub
└── Energy (single root page)
    ├── scope: Build Lean Mass / Visible Abs / All Energy
    ├── Period Summary
    ├── Energy Over Time (1M / 3M / 6M / 1Y / All)
    ├── Weekly Energy Balance
    ├── Weekly History
    │   └── Show All → modal Weekly History sheet
    └── Recent Daily Energy
        ├── optional Nutrition Day link → Nutrition Evidence root
        ├── optional Activity link → Activity Evidence root
        └── Show All → modal Daily Energy History sheet
```

There is no Energy latest/day-detail/report route.

## Weight

```text
Evidence Hub
└── Weight (single root page)
    ├── scope: Build Lean Mass / Visible Abs / All Weight
    ├── Goal-dependent summary
    ├── Weight Trend + DEXA markers
    ├── optional 3-day / 7-day Rolling Averages
    ├── Weekly Averages
    │   └── Show All / Close → expands inline
    └── Weight History
        └── Show All / Close → expands inline
```

There is no Weight day-detail route, full-history route, clickable history row, streak or Related Goals destination.

## Recovery

```text
Evidence Hub
└── Recovery root
    ├── scope: Build Lean Mass / Visible Abs / All Sleep
    ├── Last Night / Final Night → Night Detail
    ├── Sleep chart
    │   ├── selected night → Night Detail
    │   └── See trends → Sleep Trends
    │       ├── 2W / 1M / 3M → nightly charts
    │       ├── 6M / All → weekly averages
    │       └── All Nights → modal paged history
    │           └── night row → Night Detail
    ├── Sleep Window
    ├── Recent Nights (3)
    │   ├── night row → Night Detail
    │   └── Show All → modal paged All Nights
    └── Data Sources

Night Detail
├── Timeline
├── Stages
├── Continuity
├── Time in Bed (when present)
├── Additional Sleep (when present)
└── Source & Data disclosure
```

No foam rolling surface is present in the current Recovery Evidence contract. Recovery Briefing V1 remains separate.

