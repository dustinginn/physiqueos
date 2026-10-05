# Batch 3 · Checkpoint A — Evidence Hub + Timeline

Implementation branch: `codex/redesign-batch3-evidence-20261005`

## Locked references

- Evidence Hub: `references/evidence-hub-dark.png`, `references/evidence-hub-light.png`
- Timeline: `references/timeline-dark.png`, `references/timeline-light.png`

## Real simulator captures

- `screens/evidence-hub-dark.png`
- `screens/evidence-hub-light.png`
- `screens/timeline-dark.png`
- `screens/timeline-light.png`
- `checkpoint-a-mobile-review-board.png`

All implementation captures are from the real Debug app on the iPhone 17 Pro simulator. The Timeline capture uses a DEBUG-only deterministic contract fixture because ordinary Sandbox truthfully has no Timeline feed; the shipping Founder Production API remains unchanged.

## Pixel-parity audit

- Matched: semantic canvas, hierarchy, hero geometry, lime Evidence identity, flat record rows, dividers, compact density, Timeline rail/nodes, status-safe Dark/Mineral translation.
- Truthful dynamic difference: Sandbox Recent Usage is Training / Weight / DEXA rather than the reference's Training / Photos because usage order remains device-local authority.
- Platform difference: the shipping iOS 26 tab bar and navigation back control use system Liquid Glass geometry; the design source is a frameless long-page render. They remain in the simulator captures because review must cover the real shipping surface.
- Contract reconciliation: `health-metrics` is a non-functional Server placeholder and is omitted by the locked presentation; the real Timeline doorway is appended last. The Server payload is not changed.
- Accessibility: rows retain full-width hit targets, stable `evidence.stream.<id>` identities, combined VoiceOver labels, and scalable content structure.

## Focused validation

- Debug app compile including Watch and Live Activity dependency graph: pass.
- `EvidenceReadModelTests`: pass, including locked projection order.
- `EvidenceHubUsageTests`: pass.
- Ordinary Sandbox Timeline unavailable behavior remains intact; only `-physiqueos.redesign-review` selects the deterministic visual fixture.
