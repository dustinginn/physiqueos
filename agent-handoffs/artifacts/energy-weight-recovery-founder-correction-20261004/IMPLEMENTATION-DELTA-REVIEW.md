# Implementation Delta Review

The canonical ledger was reviewed before stopping.

## Newly discovered delta

Recovery Continuity requires one visual implementation change if this focused design is accepted:

- current Build 85 uses wide Awake `BarMark`s and standalone longest-sleep `PointMark`s;
- the accepted target uses thin connected point/line series in two separately scaled panels, keeping the exact canonical values and explicit gaps for unavailable nights.

This is appended to `agent-handoffs/DESIGN_IMPLEMENTATION_DELTA_LEDGER.md` as **REQUIRED FOR DESIGN IMPLEMENTATION**.

## No new delta

- Energy’s two independent sheets and conditional context links already exist in Build 85. The correction aligns the artifacts to shipping behavior.
- Weight’s two independent inline disclosures already exist in Build 85. The correction aligns the artifacts to shipping behavior.
- Night Detail timeline overflow was a design-harness geometry defect, not a newly proven shipping-code defect. It was fixed in the render source without adding a ledger item.

No shipping code was changed.
