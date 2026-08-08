# Production Source Reconciliation — 2026-08-08

## Identity

- Canonical baseline: `4968b2ed9faccf91dfd074d4ede3109e1bfa3eee`
- Cumulative and Retatrutide precursor HEAD: `bb2c7399714af041a1f4b8dfeac09342d57cdc97`
- Accepted production build ID: `G0LLHlrIUpAmtapjBo09-`
- Preservation set: `physiqueos-release-preservation-20260807-233817`
- Preservation manifest SHA-256:
  `39FB2677712DCF6A6D9A8AF8C8F39329ED6ADF5248E5E89333BB2C834794DCBB`
- Canonical reconciliation commit: recorded in
  `deployment/cumulative-production-reconciliation-20260808.json`

The preservation set is independent release provenance. Its original local
location is not a canonical-source dependency, and the raw archives and
lineage bundles are intentionally not committed here.

## Result

The accepted cumulative inventory was classified path by path as 306 Class A,
37 Class B, 27 Class C, 2 Class D, and 2 Class E entries. Class B includes
three byte differences caused only by line endings. All production-important
Class B and C paths have an explicit authority decision in the reconciliation
manifest. Accepted runtime/application source has zero remaining dependencies
on either retired deployment workspace.

`private/README.md` remains canonical because its release absence was a
deployment exclusion. The obsolete
`src/components/operating-plan/OperatingPlanDrawer.jsx` remains deleted as part
of Operating Plan V2. The two one-time nutrition repair/audit scripts remain
release-only provenance.

The Retatrutide precursor's 23 dirty paths resolve to 10 canonical equivalents,
12 later cumulative successors, and one explicit rejection. The rejected
`src/screens/RetatrutideSupportEditorScreen.jsx` was not promoted; its canonical
successor is `src/screens/PeptideSupportEditorScreen.jsx`.

## Repository topology

The two accidental mode-160000 deployment entries are retired by a normal
forward commit. Local workspaces matching the two exact deployment lifecycle
patterns are ignored after retirement, while deployment manifests and scripts
remain trackable. Embedded repositories still block End Work Session unless
they have an explicit safe policy.

The complete machine-readable classification, hashes, acceptance evidence,
authority reasoning, test references, and Retatrutide lineage are in
`deployment/cumulative-production-reconciliation-20260808.json`.
