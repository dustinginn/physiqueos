# Historical Super Set correction — final guarded APPLY complete and verified

Task id: `historical-superset-final-apply-20261008`

Source assignment: `agent-handoffs/inbox/prompts/20261008-codex-superset-final-apply-authorization.md` at `d375a12016aa59390548ab045c3d12f0a49d8242`.

Status: **THE EXACT THREE AUTHORIZED HISTORICAL SUPER SET SESSIONS WERE CORRECTED AND INDEPENDENTLY VERIFIED. BUILD 93 AND ALL RELEASE/DEPLOYMENT GATES REMAIN CLOSED.**

No raw record, canonical, session, occurrence or relationship identifiers; dates; source text; set values; credentials; database bindings; or production exports are included in this report.

## Executive result

- The exact approved candidate remained `1116e65789cb33f3f26431bbde855780aea1cfd9` on `codex/build93-historical-superset-correction-utility-20261008`.
- Current app, deployment, web/worker SHA, runtime SHA, canonical owner, runner and saved-context authority all matched the authorization.
- The immediate production preflight was repeatable-read/read-only, explicitly verified `transaction_read_only=on`, rolled back, and reproduced the approved manifest byte-for-byte.
- The candidate then committed exactly three canonical Training-session updates in one serializable transaction under the owner advisory lock. It removed six legacy `super_set` execution-variant fields and added three ordered Superset relationship groups while preserving all 22 sets.
- In-transaction verification passed before commit. No performance event, unrelated evidence record, execution-variant definition or other record was written.
- A separate postflight used a fresh repeatable-read/read-only transaction and rollback. It verified the three new versions and exact after-payload digests, three valid groups, zero legacy fields, zero structural issues, unchanged unrelated evidence, unchanged performance events, the sealed progression partitions and an `already_corrected` replay with zero writes.
- Production stayed healthy on the same deployment and Server SHA. No deployment, Build 93 change, build bump, Xcode action, archive, TestFlight upload or release-pointer mutation occurred.

## Authority and transport

Before preflight and again after postflight:

- app: `physiqueos-foundation-staging` / `bf57cf56-48cc-4cd6-90e4-a23ee5381741`;
- active deployment: `32143aa4-90d4-496a-81b2-17f35a609fde`;
- deployment phase/progress: `ACTIVE`, 9/9 successful;
- pending/in-progress deployments: none;
- `web` and `worker` SHA: `84cc64e4e7205b2540bf78ea43afd1cbfb068d06`;
- runtime SHA and canonical Founder-owner fences: matched;
- public health: `status=ok`, build `physiqueos-84cc64e4-20261008`.

The recovered Mac console runner was unchanged:

- Git blob: `f7123347a43fb5dcfe8ae2a3029897d5ddb11fa7`;
- SHA-256: `aa2d3247917184199b718d5e7558a74cc8dcf46bf34713b3f73b8e506816a608`;
- saved context: `physiqueos-final-cutover-config`.

No credential or PAT was changed, broadened, copied or exposed.

## Immediate exact-match preflight

The approved preview payload was re-hashed before reuse:

- candidate: `1116e65789cb33f3f26431bbde855780aea1cfd9`;
- payload SHA-256: `21d0bc515238d2141b38664bf9171e5d886fcf91c220912dfd747e62d685b9f6`;
- approved and fresh manifest SHA-256: `1658e0939155a3eb3bd61fc477c2c7e6d58d84abc68328cd1cff0498feb9d94f`;
- semantic preview digest: `924a81592ce6cbeecef1f5395f87148f59fc9ffe8084cafc1854e51e0b2c6a0f`;
- fresh manifest comparison: byte-identical;
- transaction: repeatable-read/read-only `on`;
- rollback: verified;
- success marker and remote exit 0: exactly one each.

The fresh production facts exactly matched approval:

| Gate | Result |
|---|---:|
| Target sessions | 3 |
| Legacy `super_set` fields | 6 |
| Ordered relationships | 3 |
| Affected set entries | 22 |
| Referenced lineage records | 8 |
| Evidence records | 594 |
| Impact sessions | 21 |
| Relevant performance events | 18 |
| Target-exercise events | 12 |
| Target-session events | 6 |
| Affected-member events tied to a target session | 0 |
| Active Static Hold definitions | 2 |
| Forbidden Superset definitions | 0 |
| Predicted mutations | 3 session updates |

The ordered pairs remained exactly two Leg Extensions -> Sissy Squats relationships and one Seated Hip Adductions -> Seated Hip Abductions relationship. Existing structured and standalone contexts, lineage/order, target identities, versions, before/after payload digests, member identities and set digests all matched the seal.

## Guarded APPLY

The APPLY payload was built from candidate `1116e657` against the fresh byte-identical manifest and bound to:

- live SHA `84cc64e4e7205b2540bf78ea43afd1cbfb068d06`;
- authorization reference `founder-authorized-d375a120-final-historical-superset-apply-20261008`;
- APPLY payload SHA-256 `a5b6f158ecef2526d3b229bebdb1fcb5032c67d4027e3c03b94669cf07f92d8c`.

The guarded operation opened one serializable transaction, acquired the canonical owner advisory lock, re-read the sealed state, compared the complete target/fact seals, enforced each expected version and the three-mutation ceiling, and verified postconditions before committing.

Result:

| APPLY result | Value |
|---|---:|
| Outcome | `applied` |
| Canonical session writes | 3 |
| Removed legacy execution-variant fields | 6 |
| Added relationship groups | 3 |
| Preserved affected sets | 22 |
| Derived performance-event writes | 0 |
| Other writes | 0 |
| In-transaction postconditions | passed |
| Success marker / remote exit 0 | 1 / 1 |

Every changed record advanced by exactly one version and matched its sealed after-payload digest. The complete payload-digest comparison covers identities, canonical lineage, set reps/load/units, unrelated fields and correction provenance, in addition to the explicit member/set checks.

## Independent read-only postflight

A newly built verification payload (SHA-256 `fd8ae8c1257c5a3e413ba39977aacd046fd1c115886b7a041cf2bd50ce9f40a0`) ran separately after commit. It opened `REPEATABLE READ READ ONLY`, explicitly verified read-only mode and rolled back.

| Postcondition | Result |
|---|---:|
| Exact target sessions present | 3 |
| Exact +1 versions | 3 / 3 |
| Exact sealed after-payload digests | 3 / 3 |
| Valid ordered Superset groups | 3 |
| Remaining legacy fields in target members | 0 |
| Preserved target set entries | 22 |
| Dangling, duplicate or overlapping membership issues | 0 |
| Evidence records | 594 |
| Unrelated evidence identity/version digest | unchanged |
| Relevant performance events | 18, unchanged |
| Affected-member target-session events | 0 |
| Impact sessions | 21 |
| Progression occurrence partitions | exact sealed proposed state |
| Active definitions / forbidden Superset definitions | 2 / 0 |
| Replay outcome | `already_corrected` |
| Replay writes | 0 |
| Success marker / remote exit 0 | 1 / 1 |

Evidence identity/version digest changed only as expected for the three target version increments:

- pre-APPLY digest: `c5a60d97ac26dbd83f937520e1a88dc4b7e47f41512741a683ecfaaf7bc21b10`;
- post-APPLY digest: `e44019119a9b9439bc4c90705920480d497ae2b178c1ff3c90245df13256e075`;
- unrelated-evidence digest remained `9f6a074f301aa527f4dfbefda2b663018dd543a42a48e22a1b63bc597baed80c`;
- relevant performance-event digest remained `e9eb54b3df1023966174f54aacd5a4b71cdd5530cf28cd644aa0333484f95c3b`.

The corrected contexts now match the sealed proposed partitions: the four affected movement histories use explicit ordered Superset relationship contexts, while ordinary standalone histories and all existing event contexts remain separate and unchanged.

## Candidate verification

- ESLint on the four candidate files: passed.
- APPLY and postflight bundle syntax checks: passed.
- Current focused rerun: 6 files, 47 tests passed, 0 failed.
- The preceding candidate qualification at `1116e657`: 6 files, 53 tests passed, 0 failed, including exact preview, execute simulation, refusal paths and replay.
- One initial focused-test invocation selected an incompatible narrow Vitest config and found no matching files; rerunning under `vitest.unit.config.js` produced the green 47-test result above. No production action depended on the failed selector.
- Candidate branch remained clean and remotely verified at `1116e657`.

## Backlog reconciliation and gates

The previous backlog item “Super Set APPLY remains explicitly unauthorized and on HOLD” is now closed by authorization `d375a120`, exact-match APPLY and independent postflight. No further historical Super Set mutation is pending. The utility's correct steady-state is zero-write `already_corrected`; any new or different historical correction requires a new audit and authorization.

The unrelated maintenance note to serialize the older Static Hold seed runner's single-client reads before a future PostgreSQL major upgrade remains open. Build 93 integration/release work is unchanged and was not performed here.

## Recovery posture

No rollback was needed or attempted. The postflight is fully green. If later evidence establishes a defect, stop and obtain separate Founder authorization for a purpose-built compensating correction against the three exact current versions and sealed payloads. Do not reuse this one-time authorization, do not restore stale snapshots, and do not alter performance events or unrelated evidence.

## Final safety accounting

- Super Set production writes: exactly 3 canonical session updates.
- Static Hold production writes in this task: 0.
- Performance-event writes: 0.
- Other evidence/definition/production writes: 0.
- Credential/PAT changes: 0.
- Server deployments or Recovery activation: 0.
- Native/Build 93 changes, build bumps, Xcode work, archives or uploads: 0.
- TestFlight releases: 0.
- Release pointers changed: no.
- Private evidence or record identifiers published to GitHub: 0.
