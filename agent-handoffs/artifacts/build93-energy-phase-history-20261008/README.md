# Build 93 Energy Phase History review

These are real simulator captures of the implemented SwiftUI screen on the
Native candidate, exercised by
`OperatingPlanRedesignUITests.testEnergyPhaseHistoryShowsSyntheticCanonicalRevisionsInDarkAndMineral`.

- [`dark.png`](dark.png) — locked Dark appearance
- [`mineral-light.png`](mineral-light.png) — locked Mineral Light appearance

The values are deterministic sandbox data, not Founder production history.
The screen therefore carries the visible label
`SYNTHETIC FIXTURE · REVIEW ONLY`. The fixture demonstrates two contiguous
canonical revisions, exact owner-local effective dates, one unavailable
field rendered as `Not recorded`, and the active strategy remaining separate.

Captured on the dedicated `B91 OP iPhone 17 Pro` iOS 27.0 simulator. The UI
test executed one test case with zero failures.
