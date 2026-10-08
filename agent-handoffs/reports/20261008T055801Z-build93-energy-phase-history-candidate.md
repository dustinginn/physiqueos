# Build 93 Energy Phase History — candidate report

**CANDIDATE READY FOR FOUNDER REVIEW. NOT DEPLOYED OR PHYSICALLY ACCEPTED.**

Task: `build93-energy-phase-history-overnight-20261008`

## Result

The authorized Build 93 Energy Phase History assignment is implemented as two
isolated, pushed candidates:

- Server: [`e156e01138aaa7488426029d7a8a51d8dcb85954`](https://github.com/dustinginn/physiqueos/commit/e156e01138aaa7488426029d7a8a51d8dcb85954)
  on `codex/build93-energy-phase-history-server-20261008`, based exactly on
  production Server `84cc64e4e7205b2540bf78ea43afd1cbfb068d06`.
- Native: [`1bb88fb5dedab189946f215f48248852ba719875`](https://github.com/dustinginn/physiqueos/commit/1bb88fb5dedab189946f215f48248852ba719875)
  on `codex/native-build93-energy-phase-history-20261008`, with parent exactly
  shipped Build 92 `beaf5eff9d3c4147fba4dec095e8092c0fae9b91`.

No Server deployment, production data read or write, build-number bump,
TestFlight upload, or production mutation occurred. Native remains 1.0 (92).

## Canonical audit and projection

The Server projection reads immutable `protocolVersions` only. It attributes a
historical record to an Energy phase only through the version's explicit
`phaseId` and `goalLinks`; it does not infer identity from chronology,
names, current Strategy fields, or neighboring records.

Historical targets are projected only from authoritative reviewed changes:

- `change.reviewedChanges.caloricIntakeTarget`
- `change.reviewedChanges.activityExpenditureTarget`

Effective dates preserve exact owner-local calendar semantics. Revision starts
are inclusive and ends are exclusive. Multiple contiguous immutable revisions
within one completed or superseded phase are preserved. Active phases and the
mutable current Strategy remain separate and unchanged.

### Availability behavior

| Source condition | Presentation |
| --- | --- |
| Explicit phase/goal linkage, immutable version, non-overlapping effective range | Exact recorded target and effective dates |
| Authoritative version exists but one reviewed target field is absent | `Not recorded` for that field |
| No authoritative immutable historical versions exist | History unavailable; no reconstruction |
| Overlap, same-date ambiguity, or goal/phase identity mismatch | Untrusted/unavailable; values suppressed |
| Active/current Strategy | Kept in the existing current section, never relabeled as history |

No real Founder historical calorie or activity values were read or verified in
this task. The repository-level audit establishes what can be projected when
canonical records exist; a bounded owner-scoped production read remains a
separate authorization. Missing history is never invented, backfilled, or
reconstructed.

## Native presentation and compatibility

Native accepts the additive
`operating_plan_energy_phase_history_v1` contract and renders completed or
superseded Energy phases in chronology order with their authoritative
revisions, exact effective ranges, calorie targets, activity/expenditure
targets, and explicit `Not recorded` or `Unavailable` states. Unknown schema
versions and attribution mismatches fail closed. Build 92 payloads with no new
fields decode to empty history, preserving the existing current Energy
presentation.

The approved Dark/Mineral treatment uses existing design tokens and accessible
identifiers. Review data is deterministic DEBUG-only sandbox data with the
visible label `SYNTHETIC FIXTURE · REVIEW ONLY`; it is absent from the Release
binary.

Review artifacts:

- [Dark simulator capture](../artifacts/build93-energy-phase-history-20261008/dark.png)
- [Mineral Light simulator capture](../artifacts/build93-energy-phase-history-20261008/mineral-light.png)
- [Artifact notes](../artifacts/build93-energy-phase-history-20261008/README.md)

## Validation

### Server candidate

- Relevant ESLint: pass.
- Focused Energy Phase History service and read-service tests: 58/58 pass.
- Phase 3 suite: 321/322; the sole failure is the unchanged ignored
  `private/founder/runtime-store.json` fixture absent from both base and
  candidate.
- Package 7 suite: 630/636; two pre-existing progress invalid-time fixture
  failures and four unchanged missing
  `private/founder/migration-control.json` fixture failures remain.
- Production build: pass after rerun outside the restricted port sandbox.
- Diff check: clean.

The broader-suite gaps reproduce outside this change and are not treated as
candidate regressions.

### Native candidate

- Broader focused Native unit selection: 376/376 pass, repeated twice during
  implementation.
- Final post-formatting Operating Plan model gate: 72/72 pass.
- Real SwiftUI Dark + Mineral UI acceptance capture: 1/1 pass.
- Unsigned generic iOS Release build, including Watch and widget dependencies:
  pass.
- Release seam scan: zero
  `SYNTHETIC FIXTURE`, `review_energy_version`, or
  `synthetic_review_fixture` markers; production schema and UI strings
  present.
- Release configuration: verified 1.0 (92).
- Project regeneration: byte-for-byte deterministic.
- Fixture JSON, diff check, and candidate worktree status: clean.

Existing unrelated Swift concurrency/no-usage warnings remain in the Release
build. No new warning was attributed to this implementation.

## Coordination and storage

Expensive Xcode work was serialized with Claude's Build 93 Recovery lane.
Xcode waited for Recovery Vitest and Next/webpack work to finish; there was no
heavy-build overlap. Only this lane's exact regenerable DerivedData and
temporary screenshot-export directories were removed after receipts and
artifacts were secured, recovering about 1.6 GiB and leaving 25 GiB available.

## Review and integration gates

Proposed backlog state: **candidate ready for Founder review**, not completed,
shipped, deployed, or physically accepted.

Recommended order:

1. Founder reviews the canonical provenance/availability policy and the two
   simulator artifacts.
2. Integrate and revalidate the Server candidate.
3. Integrate the Native candidate after the Server contract is accepted.
4. If desired, separately authorize a bounded owner-scoped production read to
   determine which real historical phases have authoritative records.
5. Physical-device acceptance, build-number changes, deployment, and
   TestFlight remain separate explicit gates.

## Zero-write audit

Repository fixtures and test doubles only were used. No production database or
API record was read or written. No production seed, deploy, build-number
change, TestFlight upload, release-pointer change, or environment mutation was
performed.
