# Goal Transition Activation production baseline reconciliation

## Decision

**LOCKED**

The production drift is attributable to one normal evidence-ingestion transaction and its
derived analysis. Activation-critical production state did not change, the isolated
coordinator has no production execution path, and the final controlled window was
byte-for-byte and semantically stable.

This lock does not authorize production activation. No production state was changed.

## Runtime measurements

| Field | Original audit baseline | Drifted and accepted baseline |
| --- | --- | --- |
| SHA-256 | `4AEF4956075C5D75CA67DB2860521D07D8E7E324736AC066881055B759EABFA7` | `05B02BC6B64FEE2CD04BAEF067C2504B6C3FD6E1B5D0F9E3769CCE3633AD86F2` |
| Size | 7,782,919 bytes | 7,828,274 bytes |
| Modified UTC | `2026-07-20T02:51:00.8560170Z` | `2026-07-20T05:22:13.1838273Z` |
| `updatedAt` | `2026-07-20T02:51:00.823Z` | `2026-07-20T05:22:13.145Z` |
| Persisted revision | absent | absent |
| `lastCommitId` | absent | absent |

The old whole-file hash is superseded by legitimate evidence ingestion; it is not a
failed safety baseline.

## Method and changed collection inventory

`GoalTransitionActivationProductionBaselineReconciliation` canonicalizes root state into
activation, evidence, evidence-relationship, evidence-derived, and otherwise-unclassified
families. It records a stable SHA-256 for every section and blocks activation-critical,
unattributed, or unknown changes. A separate comparator treats any controlled-window
measurement change as a failure.

The original file bytes are no longer present in the repository or incident backups.
Record attribution therefore used the known original timestamp and size, stable IDs,
record timestamps, current collection structure, prior audit measurements, and a
non-persisted reconstruction that removes only the attributable records. This is a
semantic reconciliation, not a claim to reproduce every old byte.

| Collection | Change | Classification |
| --- | --- | --- |
| `evidencePackages` | +1, `evidence_submission_20260720052142012_images` | Expected evidence ingestion |
| `evidenceReviews` | +1, `evidence_review_20260720052158653` (`confirmed`) | Expected evidence ingestion |
| `canonicalEvidenceObjects` | +1, `activity_day\|2026-07-19` | Expected evidence ingestion |
| `analyses` | +1, `goal_evaluation_evidence_submission_20260720052142012_images` | Expected evidence-derived processing |
| `evidenceRelationships` | no persisted records; count remains 0 | Unchanged |
| `dailyBriefings` | no added briefing attributable to this window | Unchanged |
| All activation-critical collections | no observed change from the audited state | Unchanged |
| Other root collections | no attributable or unexplained change found | Unchanged |

The four records serialize to approximately 45,357 bytes. The runtime grew by 45,355
bytes. Their relevant timestamps span `2026-07-20T05:21:58.653Z` through
`2026-07-20T05:22:13.099Z`, immediately preceding the runtime mtime at
`05:22:13.1838273Z`. This near-exact size and timestamp fit, shared package identity, and
founder confirmation provide strong evidence-upload attribution without exposing payload
contents.

## Accepted semantic baseline

| Section | Count | SHA-256 |
| --- | ---: | --- |
| Activation-critical aggregate | — | `829b7966d2362e29dc31fce58a2743a764011e31ffa52a964f9fcaf88daa029f` |
| Evidence aggregate | — | `cc38869557885a8d34c711ad83c02cf59400289d4c02d91748f20dec5e047ad3` |
| Evidence relationships aggregate | 0 | `79fdc6306908369de1b97a1e24885ff1b8938fac85b20c748511c190b61a8992` |
| Briefing artifacts | 25 | `69d5fe28428b24f7b59e1af3ed30041d6140a61ea0428014f36954e8a344f6a7` |
| Goals | 3 | `2f06e54f5bc2799501198763b554c81045255a7b6d8dc12aeb2c84a02adfcd07` |
| Goal transition drafts | 1 | `e8ba5df6de398ec9bbfdf965fb5b4400f37c0a10db2c4e0f5e48702e3c508b18` |
| Protocol transition drafts | 1 | `fdcf0e64eb518b149074f47545c8785ce0c10b1a43ee3ba432abc590772362a5` |
| Protocol roots | 9 | `1de72d881338f4f102127f7429ac8981b20cd01a560a53b87faa5e6b9f60ba03` |
| Protocol versions | 5 | `165a0ebc664d998ddf0fb3f562a9332fe013d56901ce3d23a146bcb7839a0da8` |
| Existing commitments | 6 | `90dc4792bfb5689c95a132f16db97505e51a57613dea72418639421517081c6c` |
| Reminders/scheduler source | 5 | `3e9c5b9fa53c0838caf6b4737e843c091ac79bb95f34860bed31b3624636f31d` |
| Operating plan/cadence | 1 | `198c908f619942dbaceaf7d7148dafefe7c5965c8faecdeb87745fffc3900201` |
| Revision metadata | 1 | `a1b47e503a949f3199f17ed41127c44153afa96ca1a853cf607e3d01088d654f` |

## Activation-state findings

- `goal_visible_abs_at_rest` remains the operating plan's sole primary goal and is not
  completed. The other two active goal records remain supporting goals.
- Build Lean Mass is absent from production goals and production protocols.
- The Goal Creation draft remains `ready` and unconsumed.
- The Protocol Transition draft remains `ready`, unconsumed, and
  `readyForActivation: true`, with 15 prepared, 0 unresolved, and 15 reviews.
- Historical protocol roots, versions, ownership, and provenance remain at the audited
  9-root/5-version baseline.
- Existing commitments remain 6; reminders remain 5. No generated commitment, reminder,
  scheduler, twice-weekly activation cadence, ownership, or provenance signature exists.
- The completion decision remains unresolved (`userDecisionPending: true`).
- No transition-consumed marker, persisted revision, or `lastCommitId` exists.

## Coordinator non-involvement

Production import/re-export scanning found no application route, action, API, UI, startup,
scheduler, command, migration, or service-container path to the coordinator. References
outside tests are confined to the isolated coordinator and its domain contracts/snapshot
adapter. Production contains no target goal, source completion, activation-generated
protocol/commitment/reminder records, revision `1`, activation commit ID, synthetic IDs,
or expected activation write-count signature.

Coordinator non-involvement is proven by the import boundary plus absence of all committed
signatures. Normal evidence ingestion is strongly inferred. The exact legacy call stack
that initiated the upload write was not persisted and cannot be proven retrospectively.

## Legacy write path

Normal evidence repositories are assembled by `createSeedRepositories`; their mutating
methods invoke `onChange`, and `founderRepositories` forwards that callback to
`persistFounderRuntimeStore(founderRuntimeStore, { mutatedCollection })`. The persistence
function advances `updatedAt` while preserving absent legacy revision/commit fields and
atomically replaces the JSON file. Persistence exceptions are caught, logged with
`console.warn`, cleaned up, and not propagated. A best-effort stack-derived reason is
logged but no durable write-source provenance is stored.

This is expected current evidence-ingestion behavior and explains `updatedAt` advancing
without unit-of-work metadata. Swallowed failures and weak durable provenance are known
architectural limitations. They do not block this coordinator lock, but production
activation must use the reviewed unit-of-work boundary rather than this legacy path.

## Source snapshot staleness

The prior snapshot
`goal_transition_activation_source_b2dff01d5de492ae267eac41`
(`b2dff01d5de492ae267eac41930f7a4470bac75d3b8b36daabd762c8f1892bbf`,
normalized revision 0) is stale and must not be used for live activation.

Persisted evidence relationships remain empty, so relationship drift did not cause the
staleness. No additional activation-critical drift was found. The legacy source token /
`updatedAt` advanced during evidence persistence, which invalidates the preview-era
snapshot identity even though normalized revision and activation-critical state remain
stable. A future live walkthrough must create fresh validator, plan, compatibility, and
snapshot artifacts from then-current production.

## Controlled no-activity window

Window: `2026-07-20T05:43:03.1394209Z` to
`2026-07-20T05:45:00.5151406Z`.

Every beginning measurement in the accepted runtime and semantic-baseline tables was
identical at the end: whole-file SHA-256, size, mtime, `updatedAt`, revision,
`lastCommitId`, activation-critical fingerprint, evidence fingerprint,
evidence-relationship fingerprint, and briefing fingerprint. Result: **PASS**.

Only read-only tests, lint, import scans, hashes, and file inspection ran inside the
window. No unit of work was opened, no staged repository set was constructed, and no
coordinator execution or production write occurred.

## Verification

- 13 serial test files: 462 tests passed.
- New reconciliation suite: 17 tests passed.
- Coordinator production-boundary/import scans passed.
- ESLint passed for both new JavaScript files.
- `git diff --check` passed.

## Residual limitations and next patch

The unavailable original bytes limit historical attribution to strong semantic,
timestamp, identity, and serialized-growth evidence. The legacy writer does not persist
enough provenance to prove its exact retrospective call stack, and it swallows persistence
errors. Cross-process locking remains unavailable.

The narrowest next patch is **Production Goal Transition Integration**. It must retain a
separate review boundary, create fresh authoritative artifacts, and must not rely on the
old preview snapshot.
