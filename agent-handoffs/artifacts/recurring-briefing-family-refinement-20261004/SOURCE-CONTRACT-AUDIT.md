# Source-contract audit

## Authorities inspected

- Founder assignment: `d3501e1a747d05a888b786a0ca1f014dea03f299`
- Native Build 85: `b8ee8690b194cb90086b62816b9a2c8c400dc026`
- Production Server: `3c0f4aefddbb9a6886f6ad012443978303d47024`
- Shared-layer audit: `agent-handoffs/reports/20260927T234500Z-briefing-intelligence-shared-layer-design.md`
- Recovery V1 architecture: `agent-handoffs/reports/20261001T215335Z-recovery-briefing-v1-design-architecture.md`
- Recovery prototype authority: `1bfa92ef874c3c96f05b23a9d3cbdfb956384156`

## Current production ownership

Native Weekly currently declares `Integrated Lead → Energy → Weight → Photos → Training → Body Composition → Coach's Take`, conditionally mounts Photos and Body Composition, and always mounts `BriefingUncertaintyCard`. Native Midweek's bound V3 path renders Server-ordered modules, up to two `contract.uncertainty.visibleItems`, then the contract finale.

The Server's current Midweek contract orders Energy, Weight, Body Composition, Training and an excluded Recovery placeholder. Action and Watch are always eligible for the finale. `coachTake` is emitted only when its allocation is decision-changing under the current deduplication rule.

Weekly presentation still projects a Photos domain. Body Composition is already conditional and Server-owned in both cadences.

## Founder-authorized target discrepancies

| Decision | Current contract/implementation | Design target in this pass | Future implementation implication |
|---|---|---|---|
| Remove Photos | Weekly currently projects and renders Photos when present | Absent in both recurring briefings | Version or amend recurring presentation contract and remove the Native recurring card; Photo Briefing remains untouched |
| Remove Still Unresolved | Weekly Native can render uncertainty despite Server `surfaced:false`; Midweek has an explicit bounded section | No standing section in either cadence | Remove the recurring section; do not leak hidden items or replace it with another uncertainty card |
| Body Composition parity | Conditional in both; selected Weekly fixture is `null` | Present when real context exists | Preserve genuine absence. Weekly mock uses the real Jul 18 body-composition fixture and labels its source |
| Midweek Biggest Takeaway | Canonical Narrative V3 coachTake exists but current contract suppresses this fixture's second movement | Canonical coachTake shown as Biggest Takeaway | Contract must guarantee the canonical synthesis field for the recurring finale without inventing a new narrative |
| Recovery | Current recurring contracts do not publish graduated Recovery | Future-contract fixture in Weekly and Midweek | Add only after separate graduation; keep Confidence coupling `none` and Server-owned status/baseline/trend |
| Weight typography | Native uses the shared Weekly weight component; the first Midweek design artifact wrapped the value awkwardly | Same 27/13/15 point hierarchy as Weekly | Visual implementation only; no semantic change |

## Still Unresolved evidence

The shared-layer audit found that the Server correctly marked two historical items `surfaced:false`, while Native's earlier materiality fallback rendered them anyway. The audit identifies this as a client presentation discrepancy introduced in Build 47, not a legitimate Briefing information-architecture section. This pass removes the standing section from both recurring mockups.

## Canonical fixture choices

- Weekly unchanged content: `weekly_briefing_2026-08-23_2026-08-29`.
- Weekly Body Composition target: exact `weekly_briefing_2026-07-12_2026-07-18.weekly.bodyComposition`, because the selected Weekly fixture has no body-composition payload. It is explicitly marked as latest real available fixture context, not Aug 23–29 evidence.
- Midweek unchanged content: production-shaped `midweek-v3c`.
- Midweek Biggest Takeaway: exact canonical `narrativeV3.coachTake` retained in the fixture's suppressed contract evidence: “Leg extensions also reached 90 lb, a second strong movement this week.”
- Recovery: approved synthetic fixtures only; never presented as current production output.

