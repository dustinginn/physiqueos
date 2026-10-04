# Parity mismatch ledger

## Found and corrected

| Mismatch | Evidence | Correction | Result |
|---|---|---|---|
| iOS 26 applied Liquid Glass to the standard navigation-back control, creating a capsule absent from the locked design. | First real-simulator Dark/Light comparison. | Hide the navigation bar only for canonical Foam Rolling and render the locked 46-point Home crumb inside the page. Other Priority pages retain their production toolbar. | Corrected in both appearances. |
| The first custom crumb pass was vertically tighter than the accepted chrome. | Point-geometry comparison against the 402 × 874 reference. | Set the crumb row to exactly 46 points and place the divider immediately below it. | Corrected in both appearances. |
| A screen-level accessibility identifier hid descendant identifiers from the UI test query tree. | Initial deterministic UI test. | Remove the root identifier; retain explicit identifiers on the actual actions and terminal states. | Corrected without visual or behavior change. |

## Remaining mismatch

None in the product surface.

The reference PNG is a 2× design render and the simulator PNG is a 3× device capture. The comparison board normalizes both to the same 402 × 874 point geometry. Native status-bar/Dynamic-Island antialiasing and device-pixel density are simulator/platform output, not a product-surface divergence.

